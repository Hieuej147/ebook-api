# Sử dụng Python 3.12 bản slim
FROM python:3.12-slim

# Copy binary của uv từ image chính thức của họ
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Thiết lập thư mục làm việc
WORKDIR /app

# Enable bytecode compilation để app chạy nhanh hơn
ENV UV_COMPILE_BYTECODE=1
# Không cần tạo virtualenv trong container (chạy trực tiếp vào hệ thống cho nhẹ)
ENV UV_VISUAL_ENV=0

# Copy các file quản lý dependency (uv.lock và pyproject.toml) vào trước
COPY pyproject.toml uv.lock ./

# Cài đặt toàn bộ thư viện (không cài dev dependencies)
# Sử dụng --frozen để đảm bảo đúng y hệt phiên bản trong uv.lock
RUN uv sync --frozen --no-dev --no-install-project

# Copy toàn bộ mã nguồn vào sau
COPY . .

# Port app chạy
EXPOSE 8000

# Chạy bằng lệnh uv run để nó tự quản lý môi trường
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]