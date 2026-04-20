FROM node:24-alpine

WORKDIR /app

# 1. Copy config files
COPY package*.json ./
COPY prisma ./prisma/

# 2. Cài đặt toàn bộ (để có Nest CLI và TS để build)
RUN npm install --legacy-peer-deps

# 3. Copy source code và build
COPY . .
RUN npx prisma generate
RUN npm run build

# 4. Bước then chốt: Tỉa bỏ devDependencies để nhẹ image
# Chúng ta dùng 'npm prune' sẽ sạch sẽ hơn
RUN npm prune --omit=dev && npm cache clean --force

# 5. Quan trọng: Nếu bạn dùng Prisma, phải đảm bảo nó không bị xóa mất
# Lệnh generate lại một lần nữa để chắc chắn Client khớp với node_modules mới
RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "run", "start:prod"]