# Phase 2 — Security Basics: Entwicklerdokumentation

## Übersicht

Phase 2 erweitert das Authentifizierungssystem um Schutzmaßnahmen gegen Missbrauch und implementiert den Passwort-Reset-Flow.

**Abgeschlossene Schritte:**

| Schritt | Feature | Status |
|---|---|---|
| 1 | Rate Limiting — nginx (Netzwerk-Ebene) | ✅ |
| 2 | Rate Limiting — express-rate-limit (App-Ebene) | ✅ |
| 3 | Passwort vergessen (Reset-Link per Mail) | ✅ |
| 4 | Passwort zurücksetzen (Token einlösen) | ✅ |

---

## Schritt 1 — Rate Limiting auf nginx-Ebene

### Warum zwei Ebenen?

| Ebene | Tool | Vorteil |
|---|---|---|
| Netzwerk | nginx | Request abgeblockt bevor Node.js belastet wird |
| App | express-rate-limit | Feinere Kontrolle pro Endpoint und Account |

### nginx Konfiguration

Zonen werden außerhalb der `server`-Blöcke definiert:

```nginx
# Zone für Request Rate (pro IP)
limit_req_zone $binary_remote_addr zone=auth_rate:10m rate=10r/s;

# Zone für gleichzeitige Verbindungen (pro IP)
limit_conn_zone $binary_remote_addr zone=auth_conn:10m;
```

Innerhalb des `server`-Blocks:

```nginx
# Max. 10 gleichzeitige Verbindungen pro IP
limit_conn auth_conn 10;

# Slowloris-Schutz
client_body_timeout 10s;
client_header_timeout 10s;
keepalive_timeout 15s;
send_timeout 10s;

# Max. Payload-Größe
client_max_body_size 10k;

location / {
    limit_req zone=auth_rate burst=20 nodelay;
    limit_req_status 429;
    proxy_pass http://127.0.0.1:3001;
}
```

**Was bedeutet `burst=20 nodelay`?**

nginx erlaubt kurze Spitzen bis zu 20 zusätzliche Requests. Sie werden sofort durchgelassen (`nodelay`), aber der Burst-Puffer leert sich mit 10r/s. Ist der Puffer voll → `429`.

### Getestete Angriffsszenarien

| Angriff | Schutzmechanismus | HTTP Status |
|---|---|---|
| Request Flood | `limit_req` + `limit_conn` | 429 / 503 |
| Slowloris | `client_header_timeout 10s` | Verbindung getrennt |
| Brute Force | `limit_req` | 429 |

### nginx Logs überwachen

```bash
# Rate Limit Verstösse live beobachten
sudo tail -f /var/log/nginx/access.log | grep 429

# Connection + Rate Limit Fehler
sudo tail -f /var/log/nginx/error.log
```

---

## Schritt 2 — Rate Limiting auf App-Ebene

### Package

```bash
npm install express-rate-limit
```

### Wichtig: express-rate-limit v7+

Ab Version 7 wurde `max` durch `limit` ersetzt. Immer `limit` verwenden:

```javascript
// ❌ v6 und älter
max: 10

// ✅ v7+
limit: 10
```

### `middleware/rate-limit.middleware.js`

```javascript
import rateLimit from 'express-rate-limit';

const rateLimitMessage = (windowMs, max) => ({
    error: `Zu viele Anfragen. Maximal ${max} Versuche pro ${windowMs / 60000} Minuten.`,
});

export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 Stunde
    limit: 5,
    message: rateLimitMessage(60 * 60 * 1000, 5),
    standardHeaders: true,
    legacyHeaders: false,
});

export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Minuten
    limit: 10,
    message: rateLimitMessage(15 * 60 * 1000, 10),
    standardHeaders: true,
    legacyHeaders: false,
});

export const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 Stunde
    limit: 3,
    message: rateLimitMessage(60 * 60 * 1000, 3),
    standardHeaders: true,
    legacyHeaders: false,
});
```

`standardHeaders: true` fügt `RateLimit-Limit`, `RateLimit-Remaining` und `RateLimit-Reset` in den Response-Header ein.

### Wichtig: Trust Proxy setzen

Da der Node-Server hinter nginx läuft, muss Express den Proxy kennen — sonst sieht `express-rate-limit` als IP immer `127.0.0.1`:

```javascript
// app.js
const app = express();
app.set('trust proxy', 1);
```

### Limiter pro Endpoint

```javascript
router.post('/register', registerLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
```

### Limits im Überblick

| Endpoint | Limit | Zeitfenster | Warum |
|---|---|---|---|
| `/register` | 5 | 1 Stunde | Spam-Accounts verhindern |
| `/login` | 10 | 15 Minuten | Brute-Force auf Account-Ebene |
| `/forgot-password` | 3 | 1 Stunde | Reset-Mail Spam verhindern |

---

## Schritt 3 — Passwort vergessen

### Endpoint

```
POST /auth/forgot-password
```

### Flow

```
Request (email)
  → User per E-Mail suchen
  → nicht gefunden oder nicht verifiziert? → trotzdem 200 (User-Enumeration verhindern)
  → crypto.randomBytes(32) → rawToken
  → SHA256(rawToken) → tokenHash
  → tokenHash + expires_at (NOW + 15min) in password_reset_tokens speichern
  → Reset-Mail mit Link senden: /auth/reset-password?token=RAW_TOKEN
  → 200 zurückgeben
```

### Warum immer 200 — auch wenn E-Mail nicht existiert?

Würde der Server bei unbekannter E-Mail einen anderen Status zurückgeben, könnte ein Angreifer systematisch herausfinden welche E-Mails registriert sind (User-Enumeration). Der Client bekommt immer dieselbe Antwort:

```json
{ "message": "Falls diese E-Mail registriert ist, wurde ein Reset-Link gesendet." }
```

### Datenbanktabelle

```sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);
```

### Warum SHA256 für Reset-Tokens?

Gleiche Begründung wie bei E-Mail-Verifikations-Tokens: `crypto.randomBytes(32)` liefert 256 Bit Entropie — es gibt nichts zu erraten. SHA256 ist hier performant und ausreichend. bcrypt wäre unnötig langsam ohne Sicherheitsgewinn.

Wird die Datenbank gestohlen, kann ein Angreifer mit den gespeicherten Hashes keine Passwörter zurücksetzen — er bräuchte die rohen Tokens, die nur in den versendeten Mails existieren.

---

## Schritt 4 — Passwort zurücksetzen

### Endpoint

```
POST /auth/reset-password
```

### Flow

```
Request (token, newPassword)
  → Eingabe validieren
  → SHA256(token) → tokenHash
  → tokenHash in password_reset_tokens suchen → nicht gefunden? → 400
  → used_at gesetzt? → 400 (Token bereits verwendet)
  → expires_at überschritten? → 400 (Token abgelaufen)
  → bcrypt.hash(newPassword, 12)
  → users.password_hash aktualisieren
  → used_at = NOW() setzen
  → 200
```

### Warum `used_at` setzen statt Token löschen?

Ein gesetztes `used_at` macht den Token permanent ungültig ohne den Datensatz zu verlieren. So bleibt die History erhalten — wichtig für Debugging und späteres Monitoring (z.B. mehrfache Einlöseversuche desselben Tokens erkennen).

### Token-Cleanup

Abgelaufene Tokens werden per Cronjob täglich bereinigt:

```sql
-- scripts/cleanup-expired-tokens.sql
DELETE FROM email_verification_tokens WHERE expires_at < NOW();
DELETE FROM password_reset_tokens WHERE expires_at < NOW();
```

---

## Neue API-Endpoints Phase 2

| Method | Endpoint | Auth | Rate Limit | Beschreibung |
|---|---|---|---|---|
| `POST` | `/auth/forgot-password` | Nein | 3 / Stunde | Reset-Link anfordern |
| `POST` | `/auth/reset-password` | Nein | — | Neues Passwort setzen |

---

## Vollständige API-Übersicht (Phase 1 + 2)

| Method | Endpoint | Auth | Rate Limit | Beschreibung |
|---|---|---|---|---|
| `POST` | `/auth/register` | Nein | 5 / Stunde | Account erstellen |
| `GET` | `/auth/verify-email?token=...` | Nein | — | E-Mail bestätigen |
| `POST` | `/auth/login` | Nein | 10 / 15min | Login + JWT erhalten |
| `GET` | `/auth/me` | Ja (Bearer) | — | Eigene User-Daten |
| `POST` | `/auth/forgot-password` | Nein | 3 / Stunde | Reset-Link anfordern |
| `POST` | `/auth/reset-password` | Nein | — | Neues Passwort setzen |

---

## Curl Test-Befehle

### Rate Limiting testen

```bash
# Login-Limit testen (429 ab Request 11)
for i in $(seq 1 12); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST https://login-mvp.prodowner.de/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"falsch"}')
  echo "Request $i → HTTP $STATUS"
done
```

### Passwort vergessen testen

```bash
# Reset-Link anfordern
curl -X POST https://login-mvp.prodowner.de/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"deine@email.com"}'

# Erwartete Response (immer gleich — auch bei unbekannter E-Mail):
# {"message":"Falls diese E-Mail registriert ist, wurde ein Reset-Link gesendet."}
```

### Passwort zurücksetzen testen

```bash
# Token aus der Reset-Mail einsetzen
curl -X POST https://login-mvp.prodowner.de/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN_AUS_DER_MAIL","newPassword":"neuesPasswort123"}'

# Erwartete Response:
# {"message":"Passwort erfolgreich zurückgesetzt."}
```

### Neues Passwort verifizieren

```bash
# Login mit neuem Passwort
curl -X POST https://login-mvp.prodowner.de/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"deine@email.com","password":"neuesPasswort123"}'

# Erwartete Response: JWT Token
```

### Fehlerszenarien testen

```bash
# Ungültiger Token
curl -X POST https://login-mvp.prodowner.de/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"ungueltigertoken","newPassword":"neuesPasswort123"}'
# → {"error":"Ungültiger Token."}

# Bereits verwendeter Token (Token nochmal einlösen)
curl -X POST https://login-mvp.prodowner.de/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN_DER_BEREITS_VERWENDET_WURDE","newPassword":"neuesPasswort123"}'
# → {"error":"Token wurde bereits verwendet."}

# Passwort zu kurz
curl -X POST https://login-mvp.prodowner.de/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"GUELTIGER_TOKEN","newPassword":"kurz"}'
# → {"error":"Passwort muss mindestens 8 Zeichen haben."}
```

---

## Security-Prinzipien Phase 2

| Prinzip | Umsetzung |
|---|---|
| Rate Limiting zweischichtig | nginx (grob) + express-rate-limit (fein) |
| User-Enumeration verhindern | Gleiche Response bei bekannter und unbekannter E-Mail |
| Reset-Tokens nicht im Klartext | SHA256-Hash in DB, rawToken nur in Mail |
| Token Einmalnutzung | `used_at` wird nach Einlösen gesetzt |
| Token Ablaufzeit | 15 Minuten |
| Trust Proxy | `app.set('trust proxy', 1)` für korrekte IP-Erkennung hinter nginx |
