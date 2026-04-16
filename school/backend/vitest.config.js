import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // 讓 vitest 能 mock CJS modules
    clearMocks: true,
    restoreMocks: true,
    // 避免多個 integration test 檔案平行寫入共用 DB 產生競態
    fileParallelism: false,
  },
})
