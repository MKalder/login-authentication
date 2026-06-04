# Phase 3 — Refresh Tokens: Entwicklerdokumentation

## Übersicht

Phase 3 vervollständigt den JWT-Lifecycle durch Refresh Tokens. Ohne Refresh Tokens müsste ein Nutzer sich alle 15 Minuten neu einloggen — mit ihnen bleibt er dauerhaft eingeloggt bis er sich aktiv abmeldet.

**Abgeschlossene Schritte:**

| Schritt | Feature | Status |
|---|---|---|
| 1 | Refresh Token bei Login erstellen | ✅ |
| 2 | Access Token erneuern (`POST /refresh`) | ✅ |
| 3 | Logout — Refresh Token widerrufen (`POST /logout`) | ✅ |

---

## Warum reicht ein JWT allein nicht aus?

| | Nur JWT | JWT + Refresh Token |
|---|---|---|
| Ablaufzeit | Kurz (15min) → Nutzer wird ausgeloggt | Access Token kurz, Refresh Token lang (30 Tage) |
| Invalidierbar? | Nein — läuft bis Ablauf | Ja — Refresh Token in DB widerrufbar |
| Session Management | Nicht möglich | Möglich — ein Token pro Gerät |
| Sicherheit bei Diebstahl | Access Token 15min gültig | Refresh Token sofort widerrufbar |

Ein JWT ist zustandslos — der Server speichert nichts. Das macht ihn schnell, aber auch nicht widerrufbar. Der Refresh Token lebt in der Datenbank und kann jederzeit invalidiert werden.

---

## Token-Lifecycle

```
Login
  ├── Access Token  (JWT, 15 Minuten, zustandslos)
  └── Refresh Token (zufällig, 30 Tage, in DB gespeichert als SHA256-Hash)
          ↓
Access Token läuft ab
          ↓
POST /auth/refresh (Refresh Token mitsenden)
  → Refresh Token in DB suchen
  → widerrufen? → 401
  → abgelaufen? → 401
  → neuer Access Token ausgestellt
          ↓
Logout
POST /auth/logout (Refresh Token mitsenden)
  → revoked_at = NOW() in DB setzen
  → kein neuer Access Token mehr möglich
```

---

## Unterschied: `revoked_at` vs `used_at`

| | Verifikations-/Reset-Tokens | Refresh Tokens |
|---|---|---|
| Feld | `used_at` | `revoked_at` |
| Invalidierung | Nach einmaliger Nutzung | Explizit beim Logout |
| Wiederverwendung | Nie | Ja — bis Widerruf oder Ablauf |

Ein Refresh Token wird mehrfach verwendet (bei jedem Access-Token-Refresh). Er wird nicht nach einer Nutzung ungültig, sondern erst wenn er explizit widerrufen wird.

---

## Datenbankschema

```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
```

**Designentscheidungen:**

- `token_hash` — SHA256-Hash des rawTokens, nie im Klartext
- `revoked_at` — NULL = aktiv, gesetzt = widerrufen
- `ON DELETE CASCADE` — User gelöscht → alle Tokens automatisch gelöscht
- `created_at` — wichtig für späteres Session Management (wann wurde eingeloggt?)

---

## Implementierung

### Repository (`repositories/auth.repository.js`)

```javascript
// Refresh Token speichern
const createRefreshToken = async (user_id, token_hash, expires_at) => {
    await db.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user_id, token_hash, expires_at]
    );
};

// Refresh Token suchen
const findRefreshToken = async (token_hash) => {
    const result = await db.query(
        `SELECT id, user_id, expires_at, revoked_at
         FROM refresh_tokens WHERE token_hash = $1`,
        [token_hash]
    );
    return result.rows[0] || null;
};

// Einzelnen Token widerrufen (Logout)
const revokeRefreshToken = async (token_hash) => {
    await db.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
        [token_hash]
    );
};

// Alle Tokens eines Users widerrufen (alle Geräte abmelden)
const revokeAllRefreshTokens = async (user_id) => {
    await db.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [user_id]
    );
};
```

### Service (`services/auth.service.js`)

**Login — Refresh Token zusätzlich erstellen:**

```javascript
const login = async (email, password) => {
    const user = await authRepository.findUserByEmail(email);
    if (!user) throw new Error('INVALID_CREDENTIALS');
    if (!user.is_verified) throw new Error('EMAIL_NOT_VERIFIED');

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) throw new Error('INVALID_CREDENTIALS');

    // Access Token — kurzlebig, zustandslos
    const accessToken = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '15m' }
    );

    // Refresh Token — langlebig, in DB gespeichert
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 Tage

    await authRepository.createRefreshToken(user.id, refreshTokenHash, expiresAt);

    return {
        accessToken,
        refreshToken: rawRefreshToken,
        user: { id: user.id, email: user.email },
    };
};
```

**Refresh — neuer Access Token:**

```javascript
const refresh = async (rawRefreshToken) => {
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const token = await authRepository.findRefreshToken(tokenHash);
    if (!token)          throw new Error('TOKEN_INVALID');
    if (token.revoked_at) throw new Error('TOKEN_REVOKED');
    if (new Date() > new Date(token.expires_at)) throw new Error('TOKEN_EXPIRED');

    const user = await authRepository.findUserById(token.user_id);
    if (!user) throw new Error('USER_NOT_FOUND');

    const accessToken = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '15m' }
    );

    return { accessToken };
};
```

**Logout — Token widerrufen:**

```javascript
const logout = async (rawRefreshToken) => {
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    await authRepository.revokeRefreshToken(tokenHash);
};
```

### Controller (`controllers/auth.controller.js`)

```javascript
const refresh = async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh Token ist erforderlich.' });
    }
    try {
        const { accessToken } = await authService.refresh(refreshToken);
        return res.status(200).json({ accessToken });
    } catch (err) {
        if (err.message === 'TOKEN_INVALID')  return res.status(401).json({ error: 'Ungültiger Refresh Token.' });
        if (err.message === 'TOKEN_REVOKED')  return res.status(401).json({ error: 'Refresh Token wurde widerrufen.' });
        if (err.message === 'TOKEN_EXPIRED')  return res.status(401).json({ error: 'Refresh Token abgelaufen.' });
        console.error(err);
        return res.status(500).json({ error: 'Serverfehler.' });
    }
};

const logout = async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh Token ist erforderlich.' });
    }
    try {
        await authService.logout(refreshToken);
        return res.status(200).json({ message: 'Erfolgreich ausgeloggt.' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Serverfehler.' });
    }
};
```

### Routes (`routes/auth.routes.js`)

```javascript
router.post('/refresh', authController.refresh);
router.post('/logout',  authController.logout);
```

---

## Vollständige API-Übersicht (Phase 1 + 2 + 3)

| Method | Endpoint | Auth | Rate Limit | Beschreibung |
|---|---|---|---|---|
| `POST` | `/auth/register` | Nein | 5/Std | Account erstellen |
| `GET` | `/auth/verify-email?token=...` | Nein | — | E-Mail bestätigen |
| `POST` | `/auth/login` | Nein | 10/15min | Login → accessToken + refreshToken |
| `GET` | `/auth/me` | JWT | — | Eigene User-Daten |
| `POST` | `/auth/forgot-password` | Nein | 3/Std | Reset-Link anfordern |
| `POST` | `/auth/reset-password` | Nein | — | Neues Passwort setzen |
| `POST` | `/auth/change-password` | JWT | — | Passwort ändern |
| `POST` | `/auth/refresh` | Nein | — | Neuer Access Token |
| `POST` | `/auth/logout` | Nein | — | Refresh Token widerrufen |

---

## Curl Test-Befehle

### Login — beide Tokens erhalten

```bash
curl -X POST https://login-mvp.prodowner.de/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"deine@email.com","password":"deinPasswort"}'

# Erwartete Response:
# {
#   "accessToken": "eyJ...",
#   "refreshToken": "521a1c...",
#   "user": { "id": "...", "email": "..." }
# }
```

### Access Token erneuern

```bash
curl -X POST https://login-mvp.prodowner.de/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"DEIN_REFRESH_TOKEN"}'

# Erwartete Response:
# { "accessToken": "eyJ..." }
```

### Logout

```bash
curl -X POST https://login-mvp.prodowner.de/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"DEIN_REFRESH_TOKEN"}'

# Erwartete Response:
# { "message": "Erfolgreich ausgeloggt." }
```

### Refresh nach Logout (muss fehlschlagen)

```bash
curl -X POST https://login-mvp.prodowner.de/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"BEREITS_WIDERRUFENER_TOKEN"}'

# Erwartete Response:
# { "error": "Refresh Token wurde widerrufen." } → HTTP 401
```

---

## Fehler-Übersicht

| Fehler | HTTP Status | Ursache |
|---|---|---|
| `Refresh Token ist erforderlich.` | 400 | Body enthält keinen refreshToken |
| `Ungültiger Refresh Token.` | 401 | Token nicht in DB gefunden |
| `Refresh Token wurde widerrufen.` | 401 | `revoked_at` ist gesetzt (Logout) |
| `Refresh Token abgelaufen.` | 401 | `expires_at` überschritten |

---

## Security-Prinzipien

| Prinzip | Umsetzung |
|---|---|
| Refresh Token nicht im Klartext | SHA256-Hash in DB, rawToken nur beim Login zurückgegeben |
| Sofort widerrufbar | `revoked_at` in DB — kein neuer Access Token mehr möglich |
| Kurzer Access Token | 15 Minuten — bei Diebstahl schnell wertlos |
| Langer Refresh Token | 30 Tage — Nutzer bleibt eingeloggt |
| Session Management vorbereitet | `revokeAllRefreshTokens` — alle Geräte abmelden |
| Cleanup | Abgelaufene Tokens per Cronjob bereinigen |

---

## Cleanup erweitern

`scripts/cleanup-expired-tokens.sql` um Refresh Tokens ergänzen:

```sql
DELETE FROM email_verification_tokens WHERE expires_at < NOW();
DELETE FROM password_reset_tokens WHERE expires_at < NOW();
DELETE FROM refresh_tokens WHERE expires_at < NOW();
```
