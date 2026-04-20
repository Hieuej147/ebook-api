FROM node:24-alpine

WORKDIR /app

# 1. Copy các file định nghĩa
COPY package*.json ./
COPY prisma ./prisma/
COPY langgraph.json ./
COPY tsconfig.json ./

# 2. Cài đặt mọi thứ để build (dùng legacy-peer-deps vì vụ langchain hồi nãy)
RUN npm install --legacy-peer-deps

# 3. Copy toàn bộ source code
COPY . .

# 4. Tạo Prisma Client (Cực kỳ quan trọng để không bị lỗi .prisma/client)
RUN npx prisma generate

# 5. Build NestJS
RUN npm run build

# 6. Dọn dẹp devDependencies để nhẹ máy, nhưng giữ lại những thứ quan trọng
RUN npm prune --omit=dev && npm cache clean --force

# Lưu ý: Không dùng CMD ở đây, mình sẽ định nghĩa CMD trong docker-compose
EXPOSE 3005 8123