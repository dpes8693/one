#!/bin/bash
# 跑所有測試，遇錯停止

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHOOL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[1/4] Backend Vitest..."
(cd "$SCHOOL_DIR/backend" && npm test)

echo "[2/4] Frontend Vitest..."
(cd "$SCHOOL_DIR/frontend" && npm test)

echo "[3/4] Backend Smoke..."
bash "$SCHOOL_DIR/scripts/smoke-backend.sh"

echo "[4/4] Frontend E2E (Playwright)..."
# 啟動 frontend dev server（若 3000 已被佔用則退出）
if lsof -i :3000 | grep LISTEN > /dev/null 2>&1; then
  FRONTEND_STARTED=false
  echo "  -> port 3000 已有服務，直接跑 e2e"
else
  (cd "$SCHOOL_DIR/frontend" && node_modules/.bin/vite --port 3000 &)
  VITE_PID=$!
  FRONTEND_STARTED=true
  echo "  -> 啟動 frontend (PID $VITE_PID)，等待就緒..."
  for i in $(seq 1 20); do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -q "200"; then
      echo "  -> frontend 就緒"
      break
    fi
    sleep 1
  done
fi

# 跑 e2e
(cd "$SCHOOL_DIR/frontend" && npm run test:e2e)
E2E_EXIT=$?

# 停 frontend（若由本腳本啟動）
if [ "$FRONTEND_STARTED" = "true" ]; then
  kill $VITE_PID 2>/dev/null || true
  echo "  -> frontend 已停止"
fi

if [ $E2E_EXIT -ne 0 ]; then
  echo "E2E 測試失敗"
  exit $E2E_EXIT
fi

echo ""
echo "All tests passed!"
