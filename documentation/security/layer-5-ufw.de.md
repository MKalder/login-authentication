# Layer 5 — Firewall (UFW)

## Status prüfen

sudo ufw status

## Alles eingehende sperren

sudo ufw default deny incoming

## Alles ausgehende erlauben

sudo ufw default allow outgoing

## Nur diese drei Ports öffnen

sudo ufw allow 22 # SSH
sudo ufw allow 80 # HTTP
sudo ufw allow 443 # HTTPS

## UFW aktivieren

sudo ufw enable

## Ergebnis prüfen

sudo ufw status verbose
