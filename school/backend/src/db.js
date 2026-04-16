import pg from 'pg'
import config from './config.js'

const { Pool } = pg

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
})

pool.on('error', (err) => {
  console.error('[DB] 連線池發生錯誤:', err.message)
})

export default pool
