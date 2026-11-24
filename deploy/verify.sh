#!/usr/bin/env bash
# ShopLite server verification. Read-only: it starts nothing and changes nothing.
# Usage on the EC2 host:  bash verify.sh
set -uo pipefail

DOMAIN="${DOMAIN:-triops1.duckdns.org}"
LOCAL="http://127.0.0.1:8080"
fail=0

hr() { printf '%s\n' "------------------------------------------------------------"; }
check() { # name, expected, actual
  if [ "$2" = "$3" ]; then printf '  OK   %-28s %s\n' "$1" "$3"
  else printf '  FAIL %-28s expected %s, got %s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

hr; echo "1. Containers"
docker ps --format '  {{.Names}}\t{{.Image}}\t{{.Status}}'

hr; echo "2. Expected running containers"
for c in postgres catalog inventory order frontend; do
  state=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo missing)
  check "$c running" running "$state"
done

hr; echo "3. Health endpoints (through the frontend container)"
for path in /healthz /api/catalog/health /api/inventory/health /api/orders/health; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$LOCAL$path")
  check "GET $path" 200 "$code"
done

hr; echo "4. Application data path"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$LOCAL/api/catalog/products")
check "GET /api/catalog/products" 200 "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$LOCAL/api/inventory/stock/1")
check "GET /api/inventory/stock/1" 200 "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$LOCAL/api/orders/orders")
check "GET /api/orders/orders" 200 "$code"

hr; echo "5. Public HTTPS"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/")
check "GET https://$DOMAIN/" 200 "$code"

hr; echo "6. HTTP must redirect to HTTPS"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://$DOMAIN/")
check "GET http://$DOMAIN/" 301 "$code"

hr; echo "7. TLS certificate"
echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN":443 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates 2>/dev/null | sed 's/^/  /'

hr; echo "8. Ports listening on the host (only 22/80/443 should be public)"
ss -tlnp 2>/dev/null | grep -E ':(22|80|443|5432|8081|8082|3000|8080)\b' | sed 's/^/  /'

hr; echo "9. Resources"
df -h / | sed 's/^/  /'
free -h | sed 's/^/  /'

hr
if [ "$fail" -eq 0 ]; then echo "RESULT: all checks passed"; else echo "RESULT: $fail check(s) failed"; fi
exit "$fail"
