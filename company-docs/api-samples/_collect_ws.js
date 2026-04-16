/**
 * FireEdge WebSocket Hook 事件採集腳本
 *
 * 採集流程：
 * 1. 先用 Bearer token 呼叫 vm/info/:id，觸發伺服器端 fillResourceforHookConnection
 * 2. 用 cookie 方式建立 Socket.IO 連線（認證只接受 cookie，不接受 Bearer token）
 * 3. 監聽 'hooks' 事件並印出 payload
 *
 * 執行：
 *   node /Users/rich/Documents/GitHub/one/company-docs/api-samples/_collect_ws.js
 */

const { io } = require('socket.io-client')
const fs = require('fs')
const https = require('https')
const http = require('http')

const TOKEN_PATH = '/Users/rich/Documents/GitHub/one/company-docs/api-samples/token.txt'
const BASE_URL = 'http://10.1.1.79:2616'
const VM_ID = '0'
const ZONE = '0'
const TIMEOUT_MS = 30000

const TOKEN = fs.readFileSync(TOKEN_PATH, 'utf8').trim()

// 建構 FireedgeToken cookie（格式必須與伺服器端 parseDecodeURIComponent + JSON.parse 相符）
const cookieValue = encodeURIComponent(JSON.stringify({ token: TOKEN }))
const cookieHeader = `FireedgeToken=${cookieValue}`

console.log('=== FireEdge WebSocket Hook 採集腳本 ===')
console.log(`Token (前30字): ${TOKEN.substring(0, 30)}...`)
console.log(`Cookie: FireedgeToken=${cookieValue.substring(0, 50)}...`)
console.log()

/**
 * 步驟一：先呼叫 vm/info/:id 讓伺服器記錄 resourcesHooks
 */
async function primeResourceHook() {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}/fireedge/api/vm/info/${VM_ID}`
    console.log(`[步驟1] 呼叫 ${url} 以填入 resourcesHooks...`)

    const options = {
      hostname: '10.1.1.79',
      port: 2616,
      path: `/fireedge/api/vm/info/${VM_ID}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/json',
      },
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.id === 200) {
            console.log(`[步驟1] 成功！VM NAME: ${parsed.data?.VM?.NAME}, STATE: ${parsed.data?.VM?.STATE}`)
            resolve(parsed.data)
          } else {
            console.log(`[步驟1] 回應非 200: ${data.substring(0, 200)}`)
            reject(new Error(`vm/info 失敗: ${parsed.message}`))
          }
        } catch (e) {
          console.log(`[步驟1] JSON 解析失敗: ${data.substring(0, 200)}`)
          reject(e)
        }
      })
    })

    req.on('error', reject)
    req.end()
  })
}

/**
 * 步驟二：建立 Socket.IO 連線並監聽 hooks 事件
 */
async function collectHookEvents() {
  // 等待 500ms 讓伺服器端有時間完成 fillResourceforHookConnection
  await new Promise(r => setTimeout(r, 500))
  console.log()
  console.log(`[步驟2] 建立 Socket.IO 連線...`)
  console.log(`  URL: ${BASE_URL}`)
  console.log(`  path: /fireedge/websockets/hooks`)
  console.log(`  query: { resource: 'VM', id: ${VM_ID}, zone: ${ZONE} }`)
  console.log()

  // 舊版 FireEdge 的 validateAuthWebsocket 從 query.token 取 token
  // 新版從 cookie 取，嘗試同時提供兩種
  const socket = io(BASE_URL, {
    path: '/fireedge/websockets/hooks',
    query: {
      resource: 'VM',
      id: VM_ID,
      zone: ZONE,
      token: TOKEN,  // 舊版認證方式
    },
    extraHeaders: {
      Cookie: cookieHeader,  // 新版認證方式（備用）
    },
    transports: ['websocket', 'polling'],
    reconnection: false,
    timeout: 10000,
  })

  socket.on('connect', () => {
    console.log(`[連線成功] Socket ID: ${socket.id}`)
    console.log(`[等待事件] 監聽 'hooks' 事件中... (最長 ${TIMEOUT_MS/1000} 秒)`)
    console.log()
  })

  socket.on('connect_error', (err) => {
    console.log(`[連線失敗] ${err.message}`)
    if (err.data) {
      console.log(`  詳情: ${JSON.stringify(err.data)}`)
    }
    console.log(`  完整錯誤: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`)
  })

  socket.on('disconnect', (reason) => {
    console.log(`[斷線] 原因: ${reason}`)
  })

  socket.on('error', (err) => {
    console.log(`[socket error] ${err.message || err}`)
  })

  socket.io.on('error', (err) => {
    console.log(`[io error] ${err.message || err}`)
  })

  socket.io.on('reconnect_failed', () => {
    console.log('[重連失敗]')
  })

  socket.io.engine.on('upgrade', () => {
    console.log(`[transport升級] 現在使用: ${socket.io.engine.transport?.name}`)
  })

  socket.io.engine.on('error', (err) => {
    console.log(`[engine error] ${err}`)
  })

  socket.on('hooks', (data) => {
    console.log('=== HOOK 事件收到 ===')
    console.log(JSON.stringify(data, null, 2))
    console.log('=====================')
  })

  // 監聽所有事件（debug）- 使用 onAny
  socket.onAny((eventName, ...args) => {
    if (eventName !== 'hooks') {
      console.log(`[其他事件] ${eventName}: ${JSON.stringify(args).substring(0, 200)}`)
    }
  })

  const timer = setTimeout(() => {
    console.log()
    console.log('[逾時] 30 秒內未收到 hooks 事件')
    socket.close()
    process.exit(0)
  }, TIMEOUT_MS)

  // 讓 Ctrl+C 正常關閉
  process.on('SIGINT', () => {
    clearTimeout(timer)
    socket.close()
    process.exit(0)
  })
}

// 主程式
;(async () => {
  try {
    await primeResourceHook()
    collectHookEvents()
  } catch (err) {
    console.error(`[錯誤] ${err.message}`)
    process.exit(1)
  }
})()
