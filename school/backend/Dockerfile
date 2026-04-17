# GPU 算力平台 Backend - Production Image
# Stage 1: 安裝 production dependencies
FROM node:22-alpine AS deps

WORKDIR /app

# 只複製 manifest，活用 Docker layer cache
COPY package.json package-lock.json ./

# 只裝 production 套件，避開測試與 dev 工具
RUN npm ci --omit=dev && npm cache clean --force

# Stage 2: Runtime image
FROM node:22-alpine AS runtime

WORKDIR /app

# 系統工具：tini 處理 PID 1 信號、wget 給 healthcheck 用
RUN apk add --no-cache tini wget

# 用非 root user 跑（安全強化）
RUN addgroup -S app && adduser -S app -G app

# 複製依賴與原始碼
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# 切換 user
RUN chown -R app:app /app
USER app

ENV NODE_ENV=production
ENV BACKEND_PORT=4000

EXPOSE 4000

# Healthcheck 打 /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --spider http://localhost:4000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
