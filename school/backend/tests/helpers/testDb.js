import pg from 'pg'

const { Pool } = pg

// 單例 pool，測試結束後 vitest 會自動清理 process
export const testPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT) || 5432,
  user: process.env.POSTGRES_USER || 'gpu_platform',
  password: process.env.POSTGRES_PASSWORD || 'changeme',
  database: process.env.POSTGRES_DB || 'gpu_platform',
})

/**
 * 清除指定資料表（依序以避免 FK 錯誤）
 */
export async function clearTables(...tables) {
  for (const table of tables) {
    await testPool.query(`DELETE FROM ${table}`)
  }
}

/**
 * 關閉測試 pool（在 vitest.globalSetup 或最後一個 test 的 afterAll 呼叫）
 */
export async function closePool() {
  await testPool.end()
}
