# =============================================
# STAGE 1: BUILDER
# =============================================
FROM node:24-alpine AS builder

WORKDIR /app

# 1. Bơm pnpm vào môi trường Alpine
RUN npm install -g pnpm

# 2. Copy toàn bộ các file cấu hình cốt lõi của Workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# 3. Copy toàn bộ source code của các project con vào
# (BẮT BUỘC để pnpm đọc được package.json trong các thư mục con và link workspace)
COPY . .

# 4. Cài đặt toàn bộ dependencies cho cả mạng lưới Monorepo
RUN pnpm install --frozen-lockfile

# 5. Generate Prisma & Build NestJS
RUN pnpm dlx prisma generate
RUN pnpm build

# =============================================
# STAGE 2: RUNNER
# =============================================
FROM node:24-alpine AS runner

WORKDIR /app

# 1. Cài pnpm cho stage runner
RUN npm install -g pnpm

# 2. Copy lại bộ khung cấu hình từ builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./

# 3. Cài production dependencies cho môi trường chạy
RUN pnpm install --prod --frozen-lockfile

# 4. Cài Prisma vào runtime (vì nó thường nằm ở devDependencies)
RUN pnpm add prisma @prisma/client

# 5. Copy Prisma config & schema
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

# 6. Generate lại Prisma Client trong môi trường prod
RUN pnpm dlx prisma generate

# 7. Copy kết quả build cuối cùng
COPY --from=builder /app/dist ./dist

EXPOSE 3005

# 8. Chạy DB Migrate và khởi động Server bằng pnpm dlx
CMD ["sh", "-c", "pnpm dlx prisma migrate deploy && node dist/main.js"]