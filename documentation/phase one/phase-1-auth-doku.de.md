# Phase 1 — Basis-Auth: Entwicklerdokumentation

## Übersicht

Phase 1 implementiert ein vollständiges Authentifizierungssystem von Grund auf — ohne Auth-Libraries wie Auth0, Clerk oder Firebase. Ziel ist das tiefe Verständnis der zugrundeliegenden Architektur.

**Abgeschlossene Schritte:**

| Schritt | Feature | Status |
|---|---|---|
| 1 | Registrierung + Passwort-Hashing | ✅ |
| 2 | E-Mail-Verifizierung | ✅ |
| 3 | Login + JWT | ✅ |
| 4 | Protected Routes (Auth Middleware) | ✅ |

---

## Architektur

### Schichtenmodell

```
routes/          → URL-Definitionen, welche Middleware/Controller zuständig ist
controllers/     → HTTP-Logik: Request lesen, Response senden
services/        → Business-Logik: was passiert beim Registrieren, Login, etc.
repositories/    → Datenbankzugriff: alle SQL-Queries
middleware/      → Querschnittslogik: JWT-Prüfung vor geschützten Routen
db/              → PostgreSQL-Verbindung (Connection Pool)
config/          → Umgebungsvariablen zentral exportiert
```

**Prinzip:** Jede Schicht kennt nur die Schicht direkt unter ihr. Der Controller weiß nichts von SQL. Das Repository weiß nichts von bcrypt. Änderungen bleiben isoliert.

### Ordnerstruktur

```
node/
├── server.js
├── app.js
├── config/
│   └── env.js
├── db/
│   └── index.js
├── routes/
│   └── auth.routes.js
├── controllers/
│   └── auth.controller.js
├── services/
│   ├── auth.service.js
│   └── mail.service.js
├── repositories/
│   └── auth.repository.js
├── middleware/
│   └── auth.middleware.js
├── scripts/
│   └── cleanup-expired-tokens.sql
└── sql/
    └── schema.sql
```

---

## Datenbank

### Schema (`sql/schema.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);
```

**Designentscheidungen:**

- `UUID` statt `INTEGER` als Primary Key — UUIDs sind nicht erratbar (`/user/1` wäre ein Security-Problem)
- `pgcrypto` liefert `gen_random_uuid()` direkt aus PostgreSQL
- `ON DELETE CASCADE` — wird ein User gelöscht, werden seine Tokens automatisch mitgelöscht
- `token_hash` — Tokens werden niemals im Klartext gespeichert, nur als SHA256-Hash
- `used_at` — ermöglicht Einmalnutzung: bereits verwendete Tokens werden abgelehnt

---

## Schritt 1 — Registrierung + Passwort-Hashing

### Endpoint

```
POST /auth/register
```

### Flow

```
Request (email, password)
  → Eingabe validieren
  → E-Mail bereits vorhanden? → 409
  → bcrypt.hash(password, 12)
  → User in DB anlegen
  → Response 201
```

### Warum bcrypt?

bcrypt ist absichtlich langsam — der Cost Factor `12` bedeutet `2^12 = 4096` Iterationen. Ein Angreifer mit gestohlener Datenbank bräuchte für jeden Brute-Force-Versuch mehrere Millisekunden statt Nanosekunden. `12` ist der aktuelle Standardwert.

SHA256 oder MD5 wären falsch — sie sind für Geschwindigkeit optimiert, was bei Passwort-Hashing ein Nachteil ist.

### Security

- Passwörter werden **niemals im Klartext** gespeichert
- Bei bereits existierender E-Mail wird `409 Conflict` zurückgegeben

---

## Schritt 2 — E-Mail-Verifizierung

### Endpoints

```
POST /auth/register  → sendet Verifikationsmail nach Registrierung
GET  /auth/verify-email?token=...  → bestätigt die E-Mail
```

### Flow

```
Nach Registrierung:
  → crypto.randomBytes(32) → roher Token (64-stelliger Hex-String)
  → SHA256(roher Token) → Hash
  → Hash + expires_at (NOW + 30min) in email_verification_tokens speichern
  → Mail mit Link: /auth/verify-email?token=ROHER_TOKEN senden

GET /verify-email?token=...:
  → SHA256(token aus URL) bilden
  → Hash in DB suchen → nicht gefunden? → 400
  → used_at gesetzt? → 400 (bereits verwendet)
  → expires_at überschritten? → 400 (abgelaufen)
  → users.is_verified = true
  → used_at = NOW()
```

### Warum SHA256 für Tokens (nicht bcrypt)?

Verifikations-Tokens haben `crypto.randomBytes(32)` — 256 Bit Entropie. Es gibt nichts zu erraten, daher ist Brute-Force nicht die Bedrohung. SHA256 ist hier korrekt und performant. bcrypt wäre unnötig langsam ohne Sicherheitsgewinn.

Passwörter hingegen haben schwache Entropie (Menschen wählen sie) — dort ist bcrypt die richtige Wahl.

### Warum Token hashen überhaupt?

Der Link in der Mail enthält den rohen Token. Wird die Datenbank gestohlen, kann ein Angreifer mit den gespeicherten Hashes keine Accounts verifizieren — er bräuchte die rohen Tokens, die nur in den versendeten Mails existieren.

### Token-Cleanup

Abgelaufene Tokens werden nicht automatisch gelöscht — sie bleiben in der DB, werden aber beim Einlösen abgelehnt. Ein Cronjob räumt täglich auf:

```sql
-- scripts/cleanup-expired-tokens.sql
DELETE FROM email_verification_tokens WHERE expires_at < NOW();
```

```
# crontab -e
0 3 * * * sudo -u postgres psql -d appdb -f /pfad/scripts/cleanup-expired-tokens.sql
```

### Mail-Infrastruktur

- **Nodemailer** — Versand-Client, baut die Mail und übergibt sie per SMTP
- **Brevo** — SMTP-Server mit etablierter Sender-Reputation

Ohne externen SMTP-Dienst landen Mails vom VPS fast immer im Spam, da frische IP-Adressen keine Reputation haben.

---

## Schritt 3 — Login + JWT

### Endpoint

```
POST /auth/login
```

### Flow

```
Request (email, password)
  → User per E-Mail suchen → nicht gefunden? → 401
  → is_verified = false? → 403
  → bcrypt.compare(password, password_hash) → falsch? → 401
  → jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '15m' })
  → Token + User-Daten zurückgeben
```

### JWT-Struktur

Ein JWT besteht aus drei Base64-kodierten Teilen, getrennt durch Punkte:

```
header.payload.signature
```

- **Header** — Algorithmus (`HS256`)
- **Payload** — Claims: `{ userId, email, iat, exp }`
- **Signature** — HMAC von Header + Payload mit `JWT_SECRET`

Der Payload ist nur kodiert, **nicht verschlüsselt** — jeder kann ihn lesen. Niemals sensible Daten (Passwörter, etc.) im Payload speichern.

### Warum gleicher Fehler für falsches Passwort und unbekannte E-Mail?

`INVALID_CREDENTIALS` wird in beiden Fällen zurückgegeben. Der Client soll nicht erfahren ob die E-Mail existiert — das würde User-Enumeration ermöglichen (Angreifer können herausfinden welche E-Mails registriert sind).

### JWS vs JWE

- **JWS (JSON Web Signature)** — Token wird signiert → Manipulation erkennbar ✅ (verwenden wir)
- **JWE (JSON Web Encryption)** — Token wird verschlüsselt → Payload für niemanden lesbar

JWE ist für die meisten Anwendungen unnötig, solange keine hochsensiblen Daten im Payload stehen. JWS reicht vollständig aus.

### Umgebungsvariablen

```env
JWT_SECRET=ein-langer-zufaelliger-string
```

Das Secret **niemals im Code** — nur in `.env`. Wer das Secret kennt, kann beliebige gültige Tokens erstellen.

---

## Schritt 4 — Protected Routes

### Endpoint

```
GET /auth/me  →  geschützt
```

### Middleware-Prinzip

```
Client → Request mit JWT im Authorization-Header
              ↓
        auth.middleware.js
        → kein Header?          → 401
        → kein Bearer-Prefix?   → 401
        → jwt.verify() schlägt fehl? → 401
        → Token abgelaufen?     → 401
        → decoded in req.user speichern
        → next()
              ↓
          Controller
          → req.user.userId verfügbar
          → Logik ausführen
```

### Warum Middleware statt direkt im Controller?

Der gleiche Schutz wird auf viele Endpoints angewendet ohne Code-Wiederholung. Die Middleware wird einmal geschrieben und beliebig kombiniert:

```javascript
// ungeschützt
router.post('/login', authController.login);

// geschützt
router.get('/me', authMiddleware, authController.me);
```

### Request-Format

```
GET /auth/me
Authorization: Bearer eyJhbGci...
```

### Logout

In einer JWT-Architektur gibt es serverseitig nichts zu tun — der Server speichert keinen Zustand. Logout bedeutet nur dass der Client den Token löscht. Im Browser-Plugin: `chrome.storage.local.remove('token')`.

---

## API-Übersicht Phase 1

| Method | Endpoint | Auth | Beschreibung |
|---|---|---|---|
| `POST` | `/auth/register` | Nein | Account erstellen + Verifikationsmail senden |
| `GET` | `/auth/verify-email?token=...` | Nein | E-Mail bestätigen |
| `POST` | `/auth/login` | Nein | Login + JWT erhalten |
| `GET` | `/auth/me` | Ja (Bearer) | Eigene User-Daten abrufen |

---

## Umgebungsvariablen

```env
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/appdb
JWT_SECRET=ein-langer-zufaelliger-string
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=deine@email.com
SMTP_PASS=dein-brevo-smtp-key
MAIL_FROM=deine@email.com
APP_URL=https://login-mvp.prodowner.de
```

---

## Wichtige Security-Prinzipien (Phase 1)

| Prinzip | Umsetzung |
|---|---|
| Passwörter niemals im Klartext | bcrypt mit Cost Factor 12 |
| JWT Secret nicht im Code | `.env` + `config/env.js` |
| Tokens nicht im Klartext speichern | SHA256-Hash in DB, roher Token nur in Mail |
| Token Einmalnutzung | `used_at` wird nach Einlösen gesetzt |
| Token Ablaufzeit | `expires_at` bei Verifikation, `expiresIn: 15m` bei JWT |
| User-Enumeration verhindern | Gleicher Fehler für falsche E-Mail und falsches Passwort |
| Verwaiste Daten vermeiden | `ON DELETE CASCADE` + täglicher Cronjob |
