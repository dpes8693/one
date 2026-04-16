#!/bin/bash
# 登入並取得 token，存到 token.txt 供其他腳本使用

set -e

OPENNEBULA_URL="${OPENNEBULA_URL:-http://10.1.1.79:2616}"
OPENNEBULA_USER="${OPENNEBULA_USER:-oneadmin}"
# 自動載入學校環境的 env 檔（gitignore，含密碼）
SCRIPT_DIR_LOGIN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_TEST_PC="$SCRIPT_DIR_LOGIN/../env/test-pc.md"
if [ -f "$ENV_TEST_PC" ]; then
  # 從 markdown 抓 OPENNEBULA_* 設定
  eval "$(grep -E '^OPENNEBULA_' "$ENV_TEST_PC")"
fi

OPENNEBULA_PASS="${OPENNEBULA_PASS:?請設定 OPENNEBULA_PASS，或建立 company-docs/env/test-pc.md（已 gitignore）}"

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
