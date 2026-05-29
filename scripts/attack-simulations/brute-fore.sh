#!/bin/bash
# Simulation of a Brute-Force-Attack on /auth/login
# Sent 50 Login-Requests as fast as possible

TARGET="https://login-mvp.prodowner.de/auth/login"
EMAIL="victim@example.com"

echo "=== Brute Force Simulation ==="
echo "Target: $TARGET"
echo "Startt 50 Requests..."
echo ""

SUCCESS=0
BLOCKED=0

for i in $(seq 1 50); do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$TARGET" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$EMAIL\",\"password\":\"try$i\"}")

    echo "Request $i → HTTP $STATUS"

    if [ "$STATUS" = "429" ]; then
        BLOCKED=$((BLOCKED + 1))
    else
        SUCCESS=$((SUCCESS + 1))
    fi
done

echo ""
echo "=== Result ==="
echo "Throughput: $SUCCESS"
echo "Blocked (429): $BLOCKED"