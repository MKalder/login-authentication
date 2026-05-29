#!/bin/bash
# Simulation of a Request Flood — many parallel Requests at the same time
# Tests of connectionlimits(limit_conn)

TARGET="https://login-mvp.prodowner.de/auth/login"

echo "=== Request Flood Simulation ==="
echo "Target: $TARGET"
echo "Start 30 parallel Requests..."
echo ""

for i in $(seq 1 30); do
    curl -s -o /dev/null -w "Request $i → HTTP %{http_code}\n" \
        -X POST "$TARGET" \
        -H "Content-Type: application/json" \
        -d '{"email":"flood@test.com","password":"test123"}' &
done

wait
echo ""
echo "=== Flood finished ==="