# =============================================
# STAGE 1: BUILDER
# =============================================
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm install --legacy-peer-deps

COPY . .

RUN npx prisma generate
RUN npm run build

# =============================================
# STAGE 2: RUNNER
# =============================================
FROM node:24-alpine AS runner

WORKDIR /app

# Cài prod dependencies
COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

# Cài prisma riêng (vì nó nằm ở devDependencies nhưng cần ở runtime)
RUN npm install prisma @prisma/client --legacy-peer-deps

# Copy prisma schema + config để chạy migrate
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

# Generate Prisma Client
RUN npx prisma generate

# Copy build output
COPY --from=builder /app/dist ./dist

EXPOSE 3005

# Chạy migrate trước, sau đó start app
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]