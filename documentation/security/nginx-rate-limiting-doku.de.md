# nginx Rate Limiting — Konfiguration & Angriffssimulation

## Warum Rate Limiting auf nginx-Ebene?

Es gibt zwei Ebenen wo Rate Limiting implementiert werden kann:

| Ebene          | Tool               | Vorteil                                                                       |
| -------------- | ------------------ | ----------------------------------------------------------------------------- |
| Netzwerk-Ebene | nginx              | Request wird abgeblockt bevor Node.js ihn überhaupt sieht — kein App-Overhead |
| App-Ebene      | express-rate-limit | Feinere Kontrolle — kontextbewusst (pro Account, pro Endpoint)                |

Beide Ebenen ergänzen sich. nginx übernimmt den groben Schutz, express-rate-limit die feine Logik.

---

## nginx Konfiguration

### Zonen definieren

Zonen werden außerhalb der `server`-Blöcke definiert — sie gelten global für alle virtuellen Hosts die sie referenzieren:

```nginx
# Zone für Request Rate (pro IP)
limit_req_zone $binary_remote_addr zone=auth_rate:10m rate=10r/s;

# Zone für gleichzeitige Verbindungen (pro IP)
limit_conn_zone $binary_remote_addr zone=auth_conn:10m;
```

**Erklärung der Parameter:**

- `$binary_remote_addr` — Schlüssel für die Zone: die IP-Adresse des Clients als binärer Wert (4 Bytes statt bis zu 15 Zeichen — spart Speicher)
- `zone=auth_rate:10m` — Name der Zone + 10 MB Speicher (reicht für ~160.000 IPs)
- `rate=10r/s` — maximal 10 Requests pro Sekunde pro IP

### Zonen anwenden

```nginx
server {
    # Max. 10 gleichzeitige Verbindungen pro IP
    limit_conn auth_conn 10;

    # Timeouts gegen Slowloris
    client_body_timeout 10s;
    client_header_timeout 10s;
    keepalive_timeout 15s;
    send_timeout 10s;

    # Max. Payload-Größe (verhindert große Request-Bodies)
    client_max_body_size 10k;

    location / {
        # Burst von 20 erlaubt, danach sofort 429
        limit_req zone=auth_rate burst=20 nodelay;
        limit_req_status 429;

        proxy_pass http://127.0.0.1:3001;
    }
}
```

**Was bedeutet `burst=20 nodelay`?**

Ohne `burst`: Jeder Request der über 10r/s geht wird sofort abgelehnt — selbst legitime kurze Spitzen.

Mit `burst=20`: nginx erlaubt kurze Spitzen bis zu 20 zusätzliche Requests. Sie werden nicht verzögert (`nodelay`) sondern sofort durchgelassen — aber der Burst-Puffer leert sich mit der definierten Rate (10r/s). Ist der Puffer voll → 429.

```
Requests:  [1][2][3]...[20][21][22][23]
Burst:      ✅  ✅  ✅   ✅  ❌  ❌  ❌  → 429
```

---

## Angriffssimulation & Ergebnisse

### Simulation 1 — Request Flood

30 parallele Requests gleichzeitig an `/auth/login`.

**Ergebnis:**

```
HTTP 401 → Request kam durch, aber falsche Credentials
HTTP 429 → Rate Limit (limit_req) ausgelöst
HTTP 503 → Connection Limit (limit_conn) ausgelöst
```

**Auswertung:**

Drei verschiedene HTTP-Status zeigen dass beide Schutzmechanismen gleichzeitig aktiv waren:

- `429` — nginx hat den Rate Limit `auth_rate` ausgelöst: zu viele Requests pro Sekunde
- `503` — nginx hat den Connection Limit `auth_conn` ausgelöst: zu viele gleichzeitige Verbindungen
- `401` — Requests die durchkamen, wurden korrekt vom Node-Server abgelehnt (falsche Credentials)

Der Node-Server wurde also nur für einen Teil der 30 Requests überhaupt belastet — nginx hat den Rest bereits auf Netzwerk-Ebene abgeblockt.

### Simulation 2 — Slowloris

10 Verbindungen geöffnet, Headers absichtlich langsam/unvollständig gesendet.

**Ergebnis:**

```
Connection 1 opened ... Connection 10 opened
Connection 1 closed ... Connection 10 closed
```

Alle Verbindungen wurden nach ~10 Sekunden von nginx getrennt.

**Auswertung:**

Der `client_header_timeout 10s` hat gegriffen. nginx wartet maximal 10 Sekunden auf vollständige Request-Headers. Kommen sie nicht, trennt nginx die Verbindung aktiv.

Ohne diesen Timeout würde ein Slowloris-Angriff funktionieren: Der Angreifer öffnet hunderte Verbindungen und hält sie offen indem er alle paar Sekunden ein einzelnes Header-Byte sendet — bis der Server keine neuen Verbindungen mehr annehmen kann.

### nginx error.log Analyse

```
limiting connections by zone "auth_conn"
→ limit_conn hat ausgelöst: IP hatte mehr als 10 gleichzeitige Verbindungen

limiting requests, excess: 20.430 by zone "auth_rate"
→ limit_req hat ausgelöst: Burst-Puffer war voll (20+), excess zeigt wie weit drüber
```

Der `excess`-Wert von `20.430` bedeutet: der Client war 20.430 Requests über dem erlaubten Burst-Limit — ein klares Zeichen für automatisierten Missbrauch, kein menschlicher Nutzer.

### nginx access.log Analyse

```
195.179.193.132 - - [29/May/2026:05:22:36] "POST /auth/login" 429 178 "-" "curl/8.5.0"
```

Alle 429-Responses kommen von derselben IP (`195.179.193.132`) im gleichen Sekunden-Timestamp — ein klassisches Muster eines automatisierten Angriffs.

---

## Die drei Angriffe im Vergleich

| Angriff       | Ziel                      | nginx-Schutz               | HTTP Status         |
| ------------- | ------------------------- | -------------------------- | ------------------- |
| Brute Force   | Passwörter durchprobieren | `limit_req` — Rate Limit   | 429                 |
| Request Flood | Server überlasten         | `limit_req` + `limit_conn` | 429 / 503           |
| Slowloris     | Verbindungen blockieren   | `client_header_timeout`    | Verbindung getrennt |

---

## Schutzschichten im Überblick

```
Angreifer
    ↓
[nginx — Ebene 1]
    limit_conn     → max. 10 gleichzeitige Verbindungen pro IP
    limit_req      → max. 10 Requests/s, Burst 20
    client_timeout → Slowloris-Schutz nach 10s
    max_body_size  → max. 10kb Payload
    ↓
[Node.js — Ebene 2]  ← nur legitimer Traffic erreicht hier
    express-rate-limit → feinere Kontrolle pro Endpoint/Account
    ↓
Controller → Business-Logik
```

---

## Wichtige Erkenntnisse

**nginx blockt bevor Node.js belastet wird.** Das ist der entscheidende Vorteil der Netzwerk-Ebene — der App-Server bleibt performant weil er nur legitimen Traffic verarbeitet.

**Rate Limiting allein reicht nicht.** Ein Angreifer mit vielen verschiedenen IPs (Botnet) umgeht IP-basiertes Rate Limiting. Deshalb wird auf App-Ebene zusätzlich eine Account-basierte Limitierung benötigt — ein Account kann z.B. nur 5 Login-Versuche pro 15 Minuten haben, unabhängig von der IP.

**HTTP 503 vs 429:**

- `429 Too Many Requests` — Rate Limit ausgelöst (zu viele Requests)
- `503 Service Unavailable` — Connection Limit ausgelöst (zu viele Verbindungen gleichzeitig)

**Logs sind essenziell.** Ohne `access.log` und `error.log` wäre ein laufender Angriff unsichtbar. In Produktion sollten auffällige Muster (viele 429 von einer IP) automatisch alarmieren — das ist Layer 7 (Monitoring).
