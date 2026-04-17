# GPU 算力平台 Frontend - Production Image
# Stage 1: build Vite SPA
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

# build 階段需要 devDependencies（vite、tailwind…）
RUN npm ci

# 複製原始碼與設定
COPY index.html ./
COPY vite.config.js ./
COPY postcss.config.js ./
COPY tailwind.config.js ./
COPY src ./src

# Build 出靜態檔（dist/）
# 預設前端透過相對路徑 /api 打到 backend，VITE_BACKEND_URL 留空即可
ENV NODE_ENV=production
RUN npm run build

# Stage 2: nginx 提供靜態檔 + API 反向代理
FROM nginx:alpine AS runtime

# 移除預設 nginx 設定
RUN rm /etc/nginx/conf.d/default.conf

# 複製自訂 nginx 設定（SPA fallback + /api 反向代理到 backend:4000）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 複製 build 產物
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
