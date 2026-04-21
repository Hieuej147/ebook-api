# --- STAGE 1: BUILDER (Không đổi) ---
FROM node:24-alpine AS builder
WORKDIR /app
RUN npm install -g @langchain/langgraph-cli
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --legacy-peer-deps
COPY . .
RUN npx prisma generate
RUN npm run build

# --- STAGE 2: RUNNER ---
FROM node:24-alpine AS runner
WORKDIR /app

RUN npm install -g @langchain/langgraph-cli

# 1. Cài các thư viện Prod trước
COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

# 2. MẸO: Ép cài riêng Prisma dù nó đang ở devDependencies
# Việc này giúp Stage Runner có đủ file để chạy lệnh npx prisma
RUN npm install prisma @prisma/client --legacy-peer-deps

# 3. Generate Client
COPY --from=builder /app/prisma ./prisma
RUN npx prisma generate

# 4. Copy thành phẩm
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/agent-ts ./agent-ts
COPY --from=builder /app/langgraph.json ./ 
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 3005 8123

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/src/main.js"]