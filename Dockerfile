FROM node:24-alpine

WORKDIR /app

# 1. Cài đặt các công cụ biên dịch C++
RUN apk add --no-cache python3 make g++

# 2. Cài đặt LangGraph CLI thẳng vào hệ thống Docker (Thêm dòng này)
RUN npm install -g @langchain/langgraph-cli

# 3. Copy các file định nghĩa
COPY package*.json ./
COPY prisma ./prisma/
COPY langgraph.json ./
COPY tsconfig.json ./

# 4. Cài đặt TOÀN BỘ thư viện
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 600000 && \
    npm install --legacy-peer-deps

# 5. Copy toàn bộ source code
COPY . .

# 6. Tạo Prisma Client
RUN npx prisma generate

# 7. Build NestJS
RUN npm run build

# XÓA BỎ BƯỚC DỌN DẸP (Giữ nguyên devDependencies)

EXPOSE 3005 8123