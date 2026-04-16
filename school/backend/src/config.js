import { config as dotenvConfig } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenvConfig({ path: join(__dirname, '../../.env') })

export default {
  port: parseInt(process.env.BACKEND_PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET || 'change-this-secret',
  db: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER || 'gpu_platform',
    password: process.env.POSTGRES_PASSWORD || 'changeme',
    database: process.env.POSTGRES_DB || 'gpu_platform',
  },
  opennebula: {
    url: process.env.OPENNEBULA_URL || 'http://10.1.1.79:2616',
    user: process.env.OPENNEBULA_USER || 'oneadmin',
    pass: process.env.OPENNEBULA_PASS || 'changeme',
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },
  frontendUrl: process.env.VITE_BACKEND_URL || 'http://localhost:3000',
}
