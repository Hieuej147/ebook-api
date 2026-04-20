FROM node:24-alpine

WORKDIR /app

# Copy file cấu hình package vào trước để tận dụng cache của Docker
COPY package*.json ./
COPY prisma ./prisma/

# Ép npm cài đặt TẤT CẢ thư viện (bao gồm cả devDependencies)
# Bước này cực kỳ quan trọng để có @nestjs/cli và typescript phục vụ cho việc build
RUN npm install --include=dev

# Copy toàn bộ source code vào
COPY . .

# Tạo Prisma Client
RUN npx prisma generate

# Build code (bây giờ chắc chắn sẽ thành công vì đã có Nest CLI)
RUN npm run build

# Xóa các thư viện dev sau khi build xong để làm nhẹ Docker image
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

EXPOSE 3000

CMD ["npm", "run", "start:prod"]