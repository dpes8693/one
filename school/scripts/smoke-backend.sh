#!/bin/bash
# GPU 算力平台 Backend Smoke Test
# 使用方式：
#   1. 確認 backend 在跑（port 4000）：node src/server.js
#   2. bash smoke-backend.sh

BASE=http://localhost:4000

# --- 顏色輸出工具 ---
test_step() { echo -e "\n\033[1;36m=== $1 ===\033[0m"; }
ok()        { echo -e "\033[1;32m✓ $1\033[0m"; }
fail()      { echo -e "\033[1;31m✗ $1\033[0m"; FAIL=$((FAIL + 1)); return 1; }

PASS=0
FAIL=0

# 解析 curl 輸出（加 HTTPSTATUS: 後綴，相容 macOS）
parse_resp() {
  BODY=$(echo "$1" | sed 's/HTTPSTATUS:[0-9]*$//')
  CODE=$(echo "$1" | grep -o 'HTTPSTATUS:[0-9]*' | cut -d: -f2)
}

assert_contains() {
  local label="$1" body="$2" needle="$3"
  if echo "$body" | grep -q "$needle"; then
    ok "$label（含 '$needle'）"
    PASS=$((PASS + 1))
  else
    fail "$label：預期含 '$needle'，實際：$body" || true
    FAIL=$((FAIL + 1))
  fi
}

assert_status() {
  local label="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    ok "$label（HTTP $got）"
    PASS=$((PASS + 1))
  else
    echo -e "\033[1;31m✗ $label：預期 HTTP $want，實際 HTTP $got\033[0m"
    FAIL=$((FAIL + 1))
  fi
}

# ── 1. GET /health ──────────────────────────────────────────────────────────
test_step "1. GET /health"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" "$BASE/health")
parse_resp "$RESP"
assert_status "HTTP 狀態" "$CODE" "200"
assert_contains "/health 回傳 db:ok" "$BODY" '"db":"ok"'

# ── 2. POST /api/applications（無需登入） ────────────────────────────────────
test_step "2. POST /api/applications（提交申請）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST "$BASE/api/applications" \
  -H "Content-Type: application/json" \
  -d '{"student_name":"測試學生","student_id":"S999999","email":"test@example.com","purpose":"Smoke test 自動提交","gpu_spec":"RTX 4070 Ti"}')
parse_resp "$RESP"
assert_status "HTTP 狀態" "$CODE" "201"
assert_contains "回傳 application 物件" "$BODY" '"application"'
assert_contains "含 student_id" "$BODY" 'S999999'
assert_contains "狀態為 pending" "$BODY" '"pending"'

# 取出申請 ID 供後續 reject 測試使用
APP_ID=$(echo "$BODY" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
echo "  取得申請 ID: $APP_ID"

# ── 3. POST /api/auth/login ──────────────────────────────────────────────────
test_step "3. POST /api/auth/login"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"user\":\"${ADMIN_USER:-oneadmin}\",\"password\":\"${ADMIN_PASS:?請設定 ADMIN_PASS 環境變數}\"}")
parse_resp "$RESP"
assert_status "HTTP 狀態" "$CODE" "200"
assert_contains "回傳 token" "$BODY" '"token"'
assert_contains "回傳 user" "$BODY" '"user"'

TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//')
echo "  取得 JWT（前 30 字）: ${TOKEN:0:30}..."

# ── 4. GET /api/applications（帶 token） ─────────────────────────────────────
test_step "4. GET /api/applications（需 JWT）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" "$BASE/api/applications" \
  -H "Authorization: Bearer $TOKEN")
parse_resp "$RESP"
assert_status "HTTP 狀態" "$CODE" "200"
assert_contains "回傳 applications 陣列" "$BODY" '"applications"'

# ── 5. GET /api/applications（不帶 token → 應 401） ──────────────────────────
test_step "5. GET /api/applications（無 JWT → 401）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" "$BASE/api/applications")
parse_resp "$RESP"
assert_status "HTTP 狀態（應 401）" "$CODE" "401"

# ── 6. GET /api/one/system/version ──────────────────────────────────────────
test_step "6. GET /api/one/system/version（代理 FireEdge）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" "$BASE/api/one/system/version" \
  -H "Authorization: Bearer $TOKEN")
parse_resp "$RESP"
assert_status "HTTP 狀態" "$CODE" "200"
assert_contains "含版本號 7.0.1" "$BODY" '7.0.1'

# ── 7. GET /api/one/vmpool/info?filter=-2 ───────────────────────────────────
test_step "7. GET /api/one/vmpool/info?filter=-2（VM Pool）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" "$BASE/api/one/vmpool/info?filter=-2" \
  -H "Authorization: Bearer $TOKEN")
parse_resp "$RESP"
assert_status "HTTP 狀態" "$CODE" "200"
assert_contains "回傳 VM_POOL" "$BODY" 'VM_POOL'

# ── 8. GET /api/one/host/info/0（GPU Host） ──────────────────────────────────
test_step "8. GET /api/one/host/info/0（Host GPU 資訊）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" "$BASE/api/one/host/info/0" \
  -H "Authorization: Bearer $TOKEN")
parse_resp "$RESP"
assert_status "HTTP 狀態" "$CODE" "200"
assert_contains "回傳 HOST 物件" "$BODY" 'HOST'
assert_contains "含 PCI_DEVICES（GPU）" "$BODY" 'PCI_DEVICES'

# ── 9. PUT /api/applications/:id/reject ─────────────────────────────────────
test_step "9. PUT /api/applications/$APP_ID/reject（拒絕申請）"
if [ -z "$APP_ID" ]; then
  echo -e "\033[1;33m⚠ 無法取得申請 ID，跳過 reject 測試\033[0m"
else
  RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" -X PUT "$BASE/api/applications/$APP_ID/reject" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"reason":"Smoke test 自動拒絕（測試用）"}')
  parse_resp "$RESP"
  assert_status "HTTP 狀態" "$CODE" "200"
  assert_contains "回傳已拒絕訊息" "$BODY" '"message"'
fi

# ── 10. POST /api/vip/preempt（無 JWT → 401） ────────────────────────────────
test_step "10. POST /api/vip/preempt（無 JWT → 401）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST "$BASE/api/vip/preempt" \
  -H "Content-Type: application/json" \
  -d '{"vip_vm_id":0,"target_host_id":0}')
parse_resp "$RESP"
assert_status "無 JWT 應回 401" "$CODE" "401"

# ── 11. POST /api/vip/preempt（帶 JWT，body 缺欄位 → 400） ───────────────────
test_step "11. POST /api/vip/preempt（帶 JWT，body 缺欄位 → 400）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST "$BASE/api/vip/preempt" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')
parse_resp "$RESP"
assert_status "缺欄位應回 400" "$CODE" "400"
assert_contains "錯誤訊息含 vip_vm_id" "$BODY" 'vip_vm_id'

# ── 12. POST /api/vip/preempt（帶 JWT，target_host_id=999 不存在 → 非 2xx）──
test_step "12. POST /api/vip/preempt（不存在的 host → 錯誤回應）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST "$BASE/api/vip/preempt" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vip_vm_id":0,"target_host_id":999}')
parse_resp "$RESP"
# 應回 4xx 或 5xx（不應 2xx），backend 在 host info 階段就會失敗
if [ "$CODE" != "200" ] && [ "$CODE" != "201" ]; then
  ok "不存在的 host 正確回傳錯誤（HTTP $CODE）"
  PASS=$((PASS + 1))
else
  fail "預期非 2xx，實際回傳 HTTP $CODE"
fi

# ── 13. POST /api/vip/restore（無 JWT → 401） ─────────────────────────────────
test_step "13. POST /api/vip/restore（無 JWT → 401）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST "$BASE/api/vip/restore" \
  -H "Content-Type: application/json" \
  -d '{"vip_preemption_id":1}')
parse_resp "$RESP"
assert_status "無 JWT 應回 401" "$CODE" "401"

# ── 14. POST /api/vip/restore（帶 JWT，body 缺欄位 → 400） ───────────────────
test_step "14. POST /api/vip/restore（帶 JWT，body 缺欄位 → 400）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST "$BASE/api/vip/restore" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')
parse_resp "$RESP"
assert_status "缺欄位應回 400" "$CODE" "400"
assert_contains "錯誤訊息含 vip_preemption_id" "$BODY" 'vip_preemption_id'

# ══════════════════════════════════════════════════════════════════════════════
# Sprint 2+3 新增測試（29–39）
# ══════════════════════════════════════════════════════════════════════════════

# ── 29. GET /api/vip/active 帶 JWT → 200 ─────────────────────────────────────
test_step "29. GET /api/vip/active（帶 JWT → 200）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" "$BASE/api/vip/active" \
  -H "Authorization: Bearer $TOKEN")
parse_resp "$RESP"
assert_status "HTTP 狀態" "$CODE" "200"

# ── 30. POST /api/schedules 不帶 JWT → 401 ────────────────────────────────────
test_step "30. POST /api/schedules（不帶 JWT → 401）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST "$BASE/api/schedules" \
  -H "Content-Type: application/json" \
  -d '{"one_user_id":1,"one_vm_id":0,"action":"reboot","start_time":"2126-01-01T00:00:00Z"}')
parse_resp "$RESP"
assert_status "無 JWT 應回 401" "$CODE" "401"

# ── 31. POST /api/schedules 帶 JWT，body 有效 → 201，回傳 id ─────────────────
test_step "31. POST /api/schedules（帶 JWT，body 有效 → 201）"
# 使用 100 年後的時間，確保 cron 不會真的觸發
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST "$BASE/api/schedules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"one_user_id":"0","one_vm_id":"0","action":"reboot","start_time":"2126-04-16T00:00:00Z","end_time":"2126-04-16T01:00:00Z","repeat_type":"once"}')
parse_resp "$RESP"
assert_status "HTTP 狀態" "$CODE" "201"
assert_contains "回傳 schedule 物件" "$BODY" '"schedule"'
assert_contains "含 id 欄位" "$BODY" '"id"'

# 取出 schedule ID 供後續更新/刪除測試使用
SCHED_ID=$(echo "$BODY" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
echo "  取得排程 ID: $SCHED_ID"

# ── 32. GET /api/schedules 帶 JWT → 200，回傳 array ───────────────────────────
test_step "32. GET /api/schedules（帶 JWT → 200，回傳 array）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" "$BASE/api/schedules" \
  -H "Authorization: Bearer $TOKEN")
parse_resp "$RESP"
assert_status "HTTP 狀態" "$CODE" "200"
assert_contains "回傳 schedules 陣列" "$BODY" '"schedules"'

# ── 33. PUT /api/schedules/<id> 改 is_active=false → 200 ──────────────────────
test_step "33. PUT /api/schedules/$SCHED_ID（is_active=false → 200）"
if [ -z "$SCHED_ID" ]; then
  echo -e "\033[1;33m⚠ 無法取得排程 ID，跳過更新測試\033[0m"
else
  RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" -X PUT "$BASE/api/schedules/$SCHED_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"is_active":false}')
  parse_resp "$RESP"
  assert_status "HTTP 狀態" "$CODE" "200"
  assert_contains "回傳更新後 schedule" "$BODY" '"schedule"'
fi

# ── 34. DELETE /api/schedules/<id> → 200 ──────────────────────────────────────
test_step "34. DELETE /api/schedules/$SCHED_ID（→ 200）"
if [ -z "$SCHED_ID" ]; then
  echo -e "\033[1;33m⚠ 無法取得排程 ID，跳過刪除測試\033[0m"
else
  RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" -X DELETE "$BASE/api/schedules/$SCHED_ID" \
    -H "Authorization: Bearer $TOKEN")
  parse_resp "$RESP"
  assert_status "HTTP 狀態" "$CODE" "200"
  assert_contains "回傳已刪除訊息" "$BODY" '"message"'
fi

# ── 35. GET /api/audit 帶 JWT → 200 ───────────────────────────────────────────
test_step "35. GET /api/audit（帶 JWT → 200）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" "$BASE/api/audit" \
  -H "Authorization: Bearer $TOKEN")
parse_resp "$RESP"
assert_status "HTTP 狀態" "$CODE" "200"
assert_contains "回傳 logs 陣列" "$BODY" '"logs"'

# ── 36. GET /api/users/me/ssh-key 帶 JWT → 200 ────────────────────────────────
test_step "36. GET /api/users/me/ssh-key（帶 JWT → 200）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" "$BASE/api/users/me/ssh-key" \
  -H "Authorization: Bearer $TOKEN")
parse_resp "$RESP"
assert_status "HTTP 狀態" "$CODE" "200"
assert_contains "回傳 ssh_public_key 欄位" "$BODY" '"ssh_public_key"'

# ── 37. PUT /api/users/me/ssh-key 帶 JWT, body invalid → 400 ─────────────────
test_step "37. PUT /api/users/me/ssh-key（body 缺欄位 → 400）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" -X PUT "$BASE/api/users/me/ssh-key" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')
parse_resp "$RESP"
assert_status "缺欄位應回 400" "$CODE" "400"
assert_contains "錯誤訊息含 ssh_public_key" "$BODY" 'ssh_public_key'

# ── 38. GET /api/alerts 帶 JWT → 200 ──────────────────────────────────────────
test_step "38. GET /api/alerts（帶 JWT → 200）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" "$BASE/api/alerts" \
  -H "Authorization: Bearer $TOKEN")
parse_resp "$RESP"
assert_status "HTTP 狀態" "$CODE" "200"
assert_contains "回傳 alerts 陣列" "$BODY" '"alerts"'

# ── 39. POST /api/auth/login → user.role 欄位存在 ─────────────────────────────
test_step "39. POST /api/auth/login（回傳 user.role 欄位）"
RESP=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"user\":\"${ADMIN_USER:-oneadmin}\",\"password\":\"${ADMIN_PASS:?請設定 ADMIN_PASS 環境變數}\"}")
parse_resp "$RESP"
assert_status "HTTP 狀態" "$CODE" "200"
assert_contains "user 物件含 role 欄位" "$BODY" '"role"'

# ── 結果摘要 ─────────────────────────────────────────────────────────────────
echo -e "\n\033[1;33m==================================\033[0m"
echo -e "\033[1;33m Smoke Test 結果：PASS=$PASS  FAIL=$FAIL \033[0m"
echo -e "\033[1;33m==================================\033[0m"

if [ "$FAIL" -gt 0 ]; then
  echo -e "\033[1;31m有 $FAIL 項失敗！\033[0m"
  exit 1
else
  echo -e "\033[1;32m全部通過！\033[0m"
  exit 0
fi
