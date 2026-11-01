# ---- 构建阶段 ----
FROM node:24.22.2-alpine AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# npm 仅用于引导安装 packageManager 指定的 pnpm，项目依赖统一由 pnpm 管理。
RUN npm install --global "$(node -p "require('./package.json').packageManager")" \
    && pnpm install --frozen-lockfile

COPY . .
ENV DOCKER_BUILD=1
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# ---- 运行阶段 ----
FROM node:24.22.2-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# 非 root 用户
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 8080
CMD ["node", "server.js"]
