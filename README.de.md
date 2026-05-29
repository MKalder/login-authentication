# 🔐 Auth MVP — JWT Authentication from Scratch

Ein Lernprojekt zum tiefen Verstehen von Authentifizierung, JWTs und modernen Login-Architekturen.
Gebaut ohne Auth-Libraries wie Auth0, Clerk oder Firebase — alles von Grund auf.

---

## 🎯 Ziel

Dieses Projekt baut ein vollständiges Authentifizierungssystem für ein Browser-Plugin.
Der Fokus liegt auf dem **Verstehen der Architektur**, nicht auf dem schnellen Fertigwerden.

---

## 🏗 Architektur

```
Browser Extension (UI + API Client)
        ↕
Backend API (Node.js + Express)
        ↕
PostgreSQL Datenbank
```

Das Browser-Plugin ist **nur** UI und API-Client — kein Security Layer.
Das Backend kontrolliert alles.

---

## 🗺 Roadmap

### Phase 1 — Basis-Auth

- ✅ Registrierung (E-Mail + Passwort)
- ✅ Passwort-Hashing mit bcrypt
- ✅ E-Mail-Verifizierung (Token + Mail)
- ✅ Login + JWT erzeugen
- ✅ Geschützte Routen (Auth Middleware)

### Phase 2 — Security Basics

- [ ] Passwort vergessen (Reset-Link + Token)
- [ ] Passwort zurücksetzen (Reset-Token einlösen)
- [ ] Passwort ändern (altes Passwort prüfen)
- [ ] JWT Expiration

### Phase 3 — Nice to Have _(später)_

- [ ] Refresh Tokens
- [ ] Session Management
- [ ] Multi-Device Login
- [ ] OAuth / Google Login
- [ ] Two-Factor Authentication (2FA)
- [ ] Webseiten / Browser Plugin
- [ ] Logout

---

## 🧰 Tech Stack

| Bereich       | Technologie       |
| ------------- | ----------------- |
| Frontend      | Vanilla JS        |
| Reverse Proxy | NGINX             |
| Backend       | Node.js + Express |
| Datenbank     | PostgreSQL        |
| Auth          | JWT + bcrypt      |
| E-Mail        | Nodemailer        |

---

## 📡 API Endpoints

| Method | Endpoint           | Beschreibung                 |
| ------ | ------------------ | ---------------------------- |
| `POST` | `/register`        | Neuen Account erstellen      |
| `POST` | `/verify-email`    | E-Mail-Token bestätigen      |
| `POST` | `/login`           | Login + JWT erhalten         |
| `POST` | `/forgot-password` | Reset-Link anfordern         |
| `POST` | `/reset-password`  | Neues Passwort setzen        |
| `POST` | `/change-password` | Passwort ändern (eingeloggt) |
| `GET`  | `/me`              | Eigene User-Daten abrufen    |

---

## 🗄 Datenbankstruktur

```
users
  └── id, email, password_hash, is_verified, created_at

email_verification_tokens
  └── id, user_id, token_hash, expires_at, used_at

password_reset_tokens
  └── id, user_id, token_hash, expires_at, used_at
```

---

## 🔒 Security-Prinzipien

- **bcrypt** für Passwort-Hashing (kein SHA256, kein MD5)
- **JWT Secret** lebt in `.env` — niemals im Code
- **Reset Tokens** werden gehasht gespeichert — niemals im Klartext
- **Token Expiration** — JWTs laufen ab (z. B. 5 Minuten)
- **Einmalige Tokens** — Reset- und Verifikations-Tokens werden nach Nutzung invalidiert

---

## 🖥 Browser Extension Screens

```
popup.html
  ├── Login
  ├── Register
  ├── Dashboard (geschützt)
  ├── Forgot Password
  └── Reset Password
```

---

## 📚 Lernreihenfolge

1. Registrierung + Passwort-Hashing ✅
2. E-Mail-Verifizierung ✅
3. Login + JWT ✅
4. Protected Routes (Middleware) ✅
5. Forgot Password Flow
6. Password Change
7. _(später)_ Refresh Tokens
8. _(später)_ OAuth / SSO
9. _(später)_ html pages
10. _(später)_ Online Bereitstellung

---

## ⚙️ Authentifizierung

```txt
POST /auth/login
  → E-Mail + Passwort aus Body lesen
  → User in DB suchen
  → Existiert nicht? → 401
  → is_verified = false? → 403
  → bcrypt.compare(passwort, hash)
  → falsch? → 401
  → JWT erstellen mit { userId, email }
  → JWT zurückschicken
```

---

## ⚙️ Passwort vergessen

```txt
POST /forgot-password
  → E-Mail aus Body lesen
  → User suchen + is_verified prüfen
  → nicht gefunden oder nicht verifiziert? → trotzdem 200 zurückgeben
  → rawToken generieren + SHA256-Hash bilden
  → Hash + expires_at in password_reset_tokens speichern
  → Mail mit Link: /reset-password?token=RAW_TOKEN senden

POST /reset-password
  → token + newPassword aus Body lesen
  → SHA256(token) bilden
  → Hash in DB suchen → nicht gefunden? → 400
  → used_at gesetzt? → 400
  → expires_at überschritten? → 400
  → bcrypt.hash(newPassword)
  → users.password_hash aktualisieren
  → used_at = NOW()
```

---

## ⚙️ Passwort ändern

```txt
POST /auth/change-password  (geschützt — Auth Middleware)
  → oldPassword + newPassword aus Body lesen
  → User per req.user.userId aus DB laden
  → bcrypt.compare(oldPassword, password_hash) → falsch? → 401
  → newPassword === oldPassword? → 400 (kein Unterschied)
  → bcrypt.hash(newPassword, 12)
  → users.password_hash aktualisieren
  → 200 — JWT bleibt gültig, Nutzer bleibt eingeloggt
```

---

# 💾 Speicherung von Tokens in Web-Apps

Zur Vollständigkeit: In einer Web-App gibt es drei gängige Optionen, einen Token zu speichern.

| Ort                    | Sicher? | Problem                                                     |
| ---------------------- | ------- | ----------------------------------------------------------- |
| `localStorage`         | Nein    | Angreifbar via XSS                                          |
| `sessionStorage`       | Nein    | Ebenfalls XSS-anfällig                                      |
| `httpOnly Cookie`      | Ja      | Server setzt Cookie, JavaScript kann nicht darauf zugreifen |
| `chrome.storage.local` | Ja      | Nur in Browser Extensions verfügbar                         |

---

## 🚀 Setup

### Lokal

### VPS

---

## 🌱 Warum kein Auth0 / Clerk / Firebase?

Diese Libraries abstrahieren die gesamte Komplexität weg.
Wer sie direkt nutzt, versteht die Architektur dahinter nicht.

Dieses Projekt baut alles von Hand — danach sind **alle** Auth-Systeme verständlich.
