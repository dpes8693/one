#!/bin/bash
# 登入並取得 token，存到 token.txt 供其他腳本使用

set -e

OPENNEBULA_URL="${OPENNEBULA_URL:-http://10.1.1.79:2616}"
OPENNEBULA_USER="${OPENNEBULA_USER:-oneadmin}"
OPENNEBULA_PASS="${OPENNEBULA_PASS:?請先 export OPENNEBULA_PASS=... 或從 ../env/test-pc.md 載入}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"user\":\"$OPENNEBULA_USER\",\"token\":\"$OPENNEBULA_PASS\"}" \
  "$OPENNEBULA_URL/fireedge/api/auth/" | jq -r '.data.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "Login failed!"
  exit 1
fi

echo "$TOKEN" > "$SCRIPT_DIR/token.txt"
echo "Token saved to $SCRIPT_DIR/token.txt"
echo "Token (first 50): ${TOKEN:0:50}..."
