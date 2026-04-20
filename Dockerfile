FROM node:24-alpine

WORKDIR /app

# 2. Cài đặt LangGraph CLI thẳng vào hệ thống Docker
RUN npm install -g @langchain/langgraph-cli

# 3. Copy các file định nghĩa
COPY package*.json ./
COPY prisma ./prisma/
COPY langgraph.json ./
COPY tsconfig.json ./

# 4. Cài đặt TOÀN BỘ thư viện
RUN npm install --legacy-peer-deps

# 5. Copy toàn bộ source code
COPY . .

# 6. Tạo Prisma Client
RUN npx prisma generate

# 7. Build NestJS
RUN npm run build

EXPOSE 3005 8123