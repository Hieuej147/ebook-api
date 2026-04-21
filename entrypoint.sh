#!/bin/sh
set -e

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "🛠️ [Prisma] Đang ép đồng bộ Schema (db push)..."
  # --accept-data-loss: Chấp nhận mất dữ liệu nếu schema thay đổi quá lớn (phong cách dev)
  npx prisma db push --accept-data-loss
fi

echo "🎬 [System] Khởi động ứng dụng..."
exec "$@"