import app from './server.js'
import config from './config.js'
import { startScheduler } from './services/scheduler.js'

app.listen(config.port, () => {
  console.log(`[Server] GPU 算力平台後端啟動，監聽 port ${config.port}`)
  console.log(`[Server] FireEdge 目標: ${config.opennebula.url}`)
  console.log(`[Server] 健康檢查: http://localhost:${config.port}/health`)
  startScheduler()
})
