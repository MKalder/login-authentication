# Security Layers Login MVP

## Bereits umgesetzt:

| Layer | Status | Was wir gemacht haben |
|---|---|---|
| Layer 1 — HTTPS | ✅ | nginx + Let's Encrypt auf `login-mvp.prodowner.de` |
| Layer 2 — Auth | ✅ | JWT, bcrypt, Middleware, E-Mail-Verifizierung |
| Layer 3 — Rate Limit | ✅ | nginx: `limit_req` (10r/s, Burst 20), `limit_conn` (max. 10 Verbindungen), Slowloris-Schutz via Timeouts — getestet mit Brute Force, Request Flood & Slowloris Simulation |
| Layer 4 — bcrypt | ✅ | Cost Factor 12, Passwort-Hashing |
| Layer 5 — Firewall | ✅ | UFW aktiv — nur Ports 22, 80, 443 offen. Port 3000/3001 geschlossen, nur intern über nginx erreichbar |
| Layer 8 — Backups | ✅ | PostgreSQL-Dump per Cronjob täglich 02:00 Uhr, Retention 7 Tage (`/var/backups/postgres`) |

## Teilweise umgesetzt:

| Layer | Status | Was fehlt |
|---|---|---|
| Layer 3 — Rate Limit | 🟡 | nginx-Ebene ✅ — App-Ebene (express-rate-limit) folgt in Phase 2: Account-basierte Limitierung pro Endpoint |
| Layer 7 — Monitoring | 🟡 | Brevo Delivery Logs + nginx access/error Logs vorhanden — kein App-Monitoring (fehlgeschlagene Logins, verdächtige Muster, automatische Alerts) |

## Noch nicht umgesetzt:

| Layer | Wann | Bemerkung |
|---|---|---|
| Layer 6 — IAM | Phase 3 | Identity & Access Management — Rollen, Berechtigungen, wer darf was. Relevant wenn verschiedene User-Typen existieren |
