#!/bin/bash
DATUM=$(date +%Y-%m-%d_%H-%M)
ZIEL="/var/backups/postgres"

mkdir -p $ZIEL

sudo -u postgres pg_dump appdb > "$ZIEL/appdb_$DATUM.sql"

# Backups älter als 7 Tage löschen
find $ZIEL -name "*.sql" -mtime +7 -delete

# Ausführbar machen: sudo chmod +x /usr/local/bin/backup-appdb.sh