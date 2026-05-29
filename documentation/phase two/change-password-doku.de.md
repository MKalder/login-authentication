# Phase 2 — Passwort ändern: Entwicklerdokumentation

## Übersicht

Der `POST /auth/change-password` Endpoint erlaubt einem eingeloggten Nutzer sein Passwort zu ändern. Im Unterschied zum Passwort-Reset-Flow ist der Nutzer bereits authentifiziert und muss sein altes Passwort zur Bestätigung eingeben.

---

## Warum altes Passwort bestätigen?

Ohne Bestätigung des alten Passworts könnte jemand der einen entsperrten Rechner findet — auf dem ein User eingeloggt ist — das Passwort einfach überschreiben und den Account dauerhaft übernehmen. Das alte Passwort als Pflichtfeld verhindert genau das.

---

## Flow

```
POST /auth/change-password  (geschützt — Auth Middleware)
  → JWT aus Authorization Header prüfen (auth.middleware.js)
  → oldPassword + newPassword aus Body lesen
  → Eingabe validieren (beide Felder vorhanden, newPassword min. 8 Zeichen)
  → User per req.user.userId aus DB laden
  → bcrypt.compare(oldPassword, password_hash) → falsch? → 401
  → bcrypt.compare(newPassword, password_hash) → gleich wie altes? → 400
  → bcrypt.hash(newPassword, 12)
  → users.password_hash aktualisieren
  → 200 — JWT bleibt gültig, Nutzer bleibt eingeloggt
```

---

## Unterschied zu Passwort-Reset

| | Passwort vergessen | Passwort ändern |
|---|---|---|
| Nutzer eingeloggt? | Nein | Ja (JWT erforderlich) |
| Altes Passwort nötig? | Nein | Ja |
| Authentifizierung über | Reset-Token per Mail | JWT im Header |
| Endpoint | `POST /forgot-password` + `POST /reset-password` | `POST /change-password` |
| Nutzer bleibt eingeloggt? | Nein (neuer Login nötig) | Ja |

---

## Implementierung

### Repository (`repositories/auth.repository.js`)

`updatePassword` und `findUserById` aus Phase 2 werden wiederverwendet.

Wichtig: `findUserById` muss `password_hash` zurückgeben:

```javascript
const findUserById = async (id) => {
    const result = await db.query(
        'SELECT id, email, password_hash, is_verified, created_at FROM users WHERE id = $1',
        [id]
    );
    return result.rows[0] || null;
};
```

### Service (`services/auth.service.js`)

```javascript
const changePassword = async (userId, oldPassword, newPassword) => {
    // 1. User laden
    const user = await authRepository.findUserById(userId);
    if (!user) {
        throw new Error('USER_NOT_FOUND');
    }

    // 2. Altes Passwort prüfen
    const isValid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isValid) {
        throw new Error('INVALID_PASSWORD');
    }

    // 3. Neues Passwort darf nicht gleich dem alten sein
    const isSame = await bcrypt.compare(newPassword, user.password_hash);
    if (isSame) {
        throw new Error('SAME_PASSWORD');
    }

    // 4. Neues Passwort hashen und speichern
    const password_hash = await bcrypt.hash(newPassword, 12);
    await authRepository.updatePassword(userId, password_hash);
};
```

### Controller (`controllers/auth.controller.js`)

```javascript
const changePassword = async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Altes und neues Passwort sind erforderlich.' });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben.' });
    }

    try {
        await authService.changePassword(req.user.userId, oldPassword, newPassword);
        return res.status(200).json({ message: 'Passwort erfolgreich geändert.' });
    } catch (err) {
        if (err.message === 'INVALID_PASSWORD') {
            return res.status(401).json({ error: 'Altes Passwort ist falsch.' });
        }
        if (err.message === 'SAME_PASSWORD') {
            return res.status(400).json({ error: 'Neues Passwort muss sich vom alten unterscheiden.' });
        }
        if (err.message === 'USER_NOT_FOUND') {
            return res.status(404).json({ error: 'User nicht gefunden.' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Serverfehler.' });
    }
};
```

### Route (`routes/auth.routes.js`)

```javascript
router.post('/change-password', authMiddleware, authController.changePassword);
```

---

## Curl Test-Befehle

### Schritt 1 — Einloggen und JWT holen

```bash
curl -X POST https://login-mvp.prodowner.de/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"deine@email.com","password":"aktuellesPasswort"}'

# Erwartete Response:
# {"token":"eyJ...","user":{"id":"...","email":"..."}}
```

Den `token` Wert aus der Response für die folgenden Requests verwenden.

### Schritt 2 — Passwort erfolgreich ändern

```bash
curl -X POST https://login-mvp.prodowner.de/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer DEIN_JWT" \
  -d '{"oldPassword":"aktuellesPasswort","newPassword":"neuesPasswort123"}'

# Erwartete Response:
# {"message":"Passwort erfolgreich geändert."}
```

### Schritt 3 — Login mit neuem Passwort verifizieren

```bash
curl -X POST https://login-mvp.prodowner.de/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"deine@email.com","password":"neuesPasswort123"}'

# Erwartete Response: neuer JWT Token
```

---

## Fehlerszenarien testen

### Kein JWT mitgeschickt

```bash
curl -X POST https://login-mvp.prodowner.de/auth/change-password \
  -H "Content-Type: application/json" \
  -d '{"oldPassword":"aktuellesPasswort","newPassword":"neuesPasswort123"}'

# Erwartete Response:
# {"error":"Kein Token vorhanden."} → HTTP 401
```

### Falsches altes Passwort

```bash
curl -X POST https://login-mvp.prodowner.de/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer DEIN_JWT" \
  -d '{"oldPassword":"falsches-passwort","newPassword":"neuesPasswort123"}'

# Erwartete Response:
# {"error":"Altes Passwort ist falsch."} → HTTP 401
```

### Neues Passwort identisch mit altem

```bash
curl -X POST https://login-mvp.prodowner.de/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer DEIN_JWT" \
  -d '{"oldPassword":"aktuellesPasswort","newPassword":"aktuellesPasswort"}'

# Erwartete Response:
# {"error":"Neues Passwort muss sich vom alten unterscheiden."} → HTTP 400
```

### Neues Passwort zu kurz

```bash
curl -X POST https://login-mvp.prodowner.de/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer DEIN_JWT" \
  -d '{"oldPassword":"aktuellesPasswort","newPassword":"kurz"}'

# Erwartete Response:
# {"error":"Passwort muss mindestens 8 Zeichen haben."} → HTTP 400
```

### Abgelaufener JWT

```bash
curl -X POST https://login-mvp.prodowner.de/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ABGELAUFENER_JWT" \
  -d '{"oldPassword":"aktuellesPasswort","newPassword":"neuesPasswort123"}'

# Erwartete Response:
# {"error":"Token abgelaufen."} → HTTP 401
```

---

## Fehler-Übersicht

| Fehler | HTTP Status | Ursache |
|---|---|---|
| `Kein Token vorhanden.` | 401 | Authorization Header fehlt |
| `Token abgelaufen.` | 401 | JWT ist abgelaufen |
| `Token ungültig.` | 401 | JWT wurde manipuliert |
| `Altes Passwort ist falsch.` | 401 | bcrypt.compare schlägt fehl |
| `Neues Passwort muss sich vom alten unterscheiden.` | 400 | Altes und neues Passwort identisch |
| `Passwort muss mindestens 8 Zeichen haben.` | 400 | Validierung schlägt fehl |
| `Serverfehler.` | 500 | Unerwarteter Fehler |

---

## Security-Prinzipien

| Prinzip | Umsetzung |
|---|---|
| Endpoint geschützt | Auth Middleware — kein JWT, kein Zugriff |
| Altes Passwort bestätigen | Verhindert Übernahme bei entsperrtem Gerät |
| Gleiches Passwort verhindern | Explizite Prüfung via bcrypt.compare |
| JWT bleibt gültig | Kein erzwungener Re-Login nach Passwortänderung |
| Passwort-Hashing | bcrypt mit Cost Factor 12 |
