# Phân Tích Chi Tiết: API-EBook & Dashboard/my-app

## Tổng Quan Hệ Thống

Hệ thống gồm **2 project** tạo thành một nền tảng **quản lý sách điện tử (eBook) toàn diện** với AI:

| Project | Vị Trí | Vai Trò |
|---------|--------|---------|
| **API-EBook** | `/mnt/disk2/API-EBook` | Backend API + AI Agents (NestJS + Python + TypeScript) |
| **Dashboard/my-app** | `/mnt/disk2/Dashboard/my-app` | Frontend Admin Dashboard (Next.js 16 + React 19) |

---

## 1. API-EBook — Backend & AI Agents

### 1.1 Công Nghệ Chính

| Thành Phần | Công Nghệ |
|------------|-----------|
| Framework | **NestJS v11** (TypeScript) |
| Database | **PostgreSQL 16** + **pgvector** (vector embeddings) |
| ORM | **Prisma 7.7** (`@prisma/adapter-pg`) |
| Cache | **Redis** (fallback: in-memory) |
| Auth | **Passport.js** + **JWT** (Access + Refresh tokens) |
| Payment | **Stripe** |
| Image Upload | **Cloudinary** |
| Password | **Argon2** hashing |
| API Docs | **Swagger/OpenAPI** |
| AI (Python) | **FastAPI** + **LangGraph** + **CopilotKit** + **OpenAI gpt-4o-mini** + **Tavily** |
| AI (TypeScript) | **LangGraph CLI** + **Ollama** (ministral-3:3b) + **pgvector** |
| AI Gateway | **Hono** (agent-server) |
| Deployment | **Docker Compose** (7 services) |

### 1.2 Kiến Trúc Dự Án

```
API-EBook/
├── src/                          # NestJS API chính
│   └── module/
│       ├── auth/                 # Đăng ký, đăng nhập, refresh, logout
│       ├── user/                 # CRUD user, profile, đổi mật khẩu
│       ├── books/                # CRUD sách + upload ảnh + tìm kiếm
│       ├── category/             # CRUD danh mục (có slug)
│       ├── chapters/             # CRUD chương sách
│       ├── cart/                 # Giỏ hàng (thêm, sửa, xóa, gộp)
│       ├── orders/               # Đơn hàng (tạo, hủy, cập nhật trạng thái)
│       ├── payments/             # Thanh toán Stripe
│       ├── stats/                # Thống kê doanh thu, users, orders, books
│       ├── cloudinary/           # Upload ảnh Cloudinary
│       ├── export-doc/           # Xuất sách ra DOCX/PDF
│       ├── embeding/             # Vector embedding (Ollama nomic-embed-text, 768 chiều)
│       ├── copilotkit/           # CopilotKit runtime endpoint cho AI agents
│       └── prisma/               # Prisma service kết nối DB
├── prisma/
│   ├── schema.prisma             # Schema DB (10 models)
│   └── migrations/               # 13 migration files
├── agent-ts/                     # Agent TypeScript (tìm kiếm sách ngữ nghĩa)
│   └── src/agent.ts              # pgvector cosine similarity search
├── agent-server/                 # Hono gateway (proxy cho CopilotKit)
│   └── src/index.ts              # Route → TS agent hoặc Python agent
└── ai-agent-python-v2/           # Agent Python chính (FastAPI + LangGraph)
    ├── main.py                   # FastAPI server + AG-UI protocol
    ├── graph.py                  # Supervisor graph → subgraphs
    ├── subgraphs/
    │   ├── book_subgraph.py      # Agent viết sách
    │   └── stats_subgraph.py     # Agent thống kê dashboard
    └── tools/
        ├── book_tool.py          # Tools: outline, edit, write, edit content
        ├── statstools.py         # Tools: overview, revenue, users, orders, books
        ├── tavily_search.py      # Tìm kiếm web (Tavily API)
        └── tavily_extract.py     # Trích xuất nội dung URL
```

### 1.3 Database Schema (Prisma)

**10 Models:**

| Model | Bảng | Mô Tả |
|-------|------|--------|
| **User** | `users` | Người dùng (email, password, role: USER/ADMIN, customerType: NORMAL/PREMIUM) |
| **Book** | `books` | Sách (title, author, price, stock, status: DRAFT/PUBLISHED, **embedding vector(768)**) |
| **Chapters** | `chapters` | Chương sách (title, content, chapterNumber) |
| **Category** | `categories` | Danh mục (name, slug, imageUrl) |
| **Cart** | `carts` | Giỏ hàng (userId, checkedOut) |
| **CartItem** | `carts_items` | Chi tiết giỏ hàng (quantity, bookId) |
| **Order** | `orders` | Đơn hàng (orderNumber, status: PENDING→PROCESSING→SHIPPED→DELIVERED, totalAmount) |
| **OrderItem** | `order_items` | Chi tiết đơn hàng (quantity, price) |
| **Payment** | `payments` | Thanh toán (amount, status, transactionId) |
| **Usage** | `usages` | Sử dụng AI (points, expire) |

**Quan hệ chính:**
- User → Orders, Carts, Payments, Usage (1:N hoặc 1:1)
- Book → Chapters (1:N), thuộc Category (N:1)
- Cart → CartItems (1:N), Orders (1:N)
- Order → OrderItems (1:N), Payment (1:1)

### 1.4 API Endpoints

| Nhóm | Endpoints | Auth |
|------|-----------|------|
| `/auth` | signup, signin, refresh, logout | Không/Có |
| `/users` | CRUD + profile + đổi mật khẩu | JWT/ADMIN |
| `/books` | CRUD + tìm kiếm + phân trang | Không/ADMIN |
| `/category` | CRUD + slug + danh sách | Không/ADMIN |
| `/chapters` | CRUD chương sách | ADMIN |
| `/cart` | Thêm/sửa/xóa/gộp giỏ hàng | JWT |
| `/orders` | Tạo/hủy/cập nhật đơn hàng | JWT/ADMIN |
| `/payments` | Tạo Stripe intent + xác nhận | JWT |
| `/stats` | Thống kê doanh thu, users, orders, books + charts | Không |
| `/export-doc` | Xuất sách DOCX/PDF | ADMIN |
| `/copilotkit` | CopilotKit runtime cho AI | Không |
| `/internal` | API nội bộ cho agent | API Key |

### 1.5 Hệ Thống AI Agents

Kiến trúc **multi-agent** với 3 runtime riêng biệt:

```
                    ┌─────────────────────┐
                    │   Frontend (Next.js) │
                    │   CopilotKit Client  │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │   Agent Server (Hono)│
                    │   Port 3001         │
                    └──┬──────────────┬───┘
                       │              │
            ┌──────────▼──┐    ┌──────▼──────────┐
            │  TS Agent    │    │  Python Agent v2 │
            │  Port 8123   │    │  Port 8001       │
            │  Ollama      │    │  OpenAI gpt-4o   │
            │  (Tìm kiếm)  │    │  (Viết sách +    │
            │              │    │   Thống kê)       │
            └──────────────┘    └──────────────────┘
```

**Agent TypeScript** — Tìm kiếm sách ngữ nghĩa:
- Dùng Ollama ministral-3:3b + nomic-embed-text (768 chiều)
- Tìm kiếm pgvector cosine similarity trực tiếp trên PostgreSQL

**Agent Python v2** — Viết sách & Thống kê:
- **Supervisor pattern**: Router → book_agent hoặc stats_agent
- **Book Agent**: Tạo outline, viết chương, chỉnh sửa nội dung, tìm kiếm web (Tavily)
- **Stats Agent**: Dashboard stats, revenue, users, orders, books charts
- **Human-in-the-loop**: Duyệt sửa chương (approve/reject diffs)

---

## 2. Dashboard/my-app — Frontend Admin

### 2.1 Công Nghệ Chính

| Thành Phần | Công Nghệ |
|------------|-----------|
| Framework | **Next.js 16.1.4** (App Router) |
| Language | **TypeScript 5.x** |
| Runtime | **React 19.2.3** |
| Styling | **Tailwind CSS v4** + **shadcn/ui** (New York) |
| AI | **CopilotKit v1.52.1** + **AG-UI protocol** |
| State | React Context (AgentContext) + URL params + Server Components |
| Charts | **Recharts** |
| Tables | **TanStack React Table** |
| Forms | **React Hook Form** + **Zod** |
| HTTP | **Axios** (server-side) + fetch (client-side) |
| Auth Session | **jose** (JWT encryption) |
| DnD | **@dnd-kit** (dashboard cards) |
| Markdown | **react-markdown** + **remark-gfm** |
| Animations | **Framer Motion** |
| Deployment | **Docker** (standalone output) |

### 2.2 Cấu Trúc Dự Án

```
Dashboard/my-app/src/
├── app/
│   ├── (admin)/                    # Nhóm route admin (cần auth)
│   │   ├── dashboard/
│   │   │   ├── page.tsx            # Dashboard chính (stats, charts, draggable cards)
│   │   │   ├── books/
│   │   │   │   ├── page.tsx        # Danh sách sách
│   │   │   │   ├── [id]/page.tsx   # Chi tiết sách
│   │   │   │   └── [id]/chapters/  # Trình soạn thảo chương (AI-powered)
│   │   │   ├── categories/         # Quản lý danh mục
│   │   │   ├── orders/             # Theo dõi đơn hàng
│   │   │   └── users/              # Quản lý người dùng
│   │   └── layout.tsx              # Admin layout (sidebar + navbar)
│   ├── (auth)/                     # Nhóm route auth
│   │   ├── signin/page.tsx         # Đăng nhập
│   │   └── signup/page.tsx         # Đăng ký
│   ├── actions/                    # Server Actions (auth, book)
│   ├── api/                        # API Routes (BFF proxy → NestJS)
│   │   ├── books/                  # Proxy → /books
│   │   ├── category/               # Proxy → /category
│   │   ├── chapters/               # Proxy → /chapters
│   │   ├── orders/                 # Proxy → /orders
│   │   ├── users/                  # Proxy → /users
│   │   ├── export/                 # Proxy → /export-doc
│   │   └── copilotkit/             # → Python LangGraph agent
│   └── provider/
│       ├── AgentContext.tsx         # LangGraph agent state (React Context)
│       └── copilot-provider.tsx     # CopilotKit provider
├── components/
│   ├── dashboard/                  # StatCard, Todolist, Charts, QuickStats
│   ├── books/                      # Book CRUD components + AI outline dialog
│   ├── categories/                 # Category components
│   ├── chapters/                   # Chapter editor (sidebar, tabs, header)
│   ├── orders/                     # Order components
│   ├── users/                      # User management components
│   ├── action-ai/                  # AI frontend tools (8 tools)
│   └── ui/                         # 40+ shadcn/ui components
├── hooks/                          # Custom hooks (mobile, export, suggestions)
└── lib/
    ├── session.ts                  # Quản lý session JWT (jose)
    ├── axios-server.ts             # Axios instance → NestJS API
    ├── api-fetch.ts                # Client fetch wrapper
    ├── dal.ts                      # Data Access Layer (server-side)
    ├── with-auth.ts                # HOF bảo vệ API routes
    ├── types.ts                    # TypeScript types
    └── zod.ts                      # Zod schemas
```

### 2.3 Các Trang (Pages)

| Route | Mô Tả |
|-------|--------|
| `/` | Landing page marketing "BookStudio" |
| `/signin` | Đăng nhập |
| `/signup` | Đăng ký |
| `/unauthorized` | Trang từ chối truy cập |
| `/dashboard` | Dashboard chính (stats, charts, widgets kéo thả) |
| `/dashboard/books` | Thư viện sách (tìm kiếm, lọc, phân trang) |
| `/dashboard/books/[id]` | Chi tiết sách |
| `/dashboard/books/[id]/chapters` | Trình soạn thảo chương (AI-powered, resizable panels) |
| `/dashboard/categories` | Quản lý danh mục |
| `/dashboard/categories/[id]` | Sách theo danh mục |
| `/dashboard/orders` | Theo dõi đơn hàng |
| `/dashboard/users` | Danh sách người dùng |
| `/dashboard/users/[id]` | Chi tiết người dùng |

### 2.4 AI Integration (CopilotKit)

**8 Frontend Tools:**
1. `navigateRoute` — AI điều hướng đến các section
2. `applyBookFilters` — AI lọc danh sách sách
3. `filterBooks` — AI lọc với human-in-the-loop
4. `applyOrderFilters` — AI lọc đơn hàng
5. `updateDashboardStats` — AI cập nhật stat cards + charts (human-in-the-loop)
6. `updateQuickStats` — AI cập nhật quick stats
7. `manageTodo` — AI quản lý todo list
8. `reorderDashboardCards` — AI sắp xếp lại dashboard widgets

**6 Render Tools:** Hiển thị biểu đồ trực tiếp trong chat (overview, revenue, users, orders, books, quick stats)

**Human-in-the-Loop:**
- `review_Form` — AI hiển thị outline, user mở dialog tùy chỉnh
- `edit_approval` — LangGraph interrupt cho duyệt sửa chương (diff view)

### 2.5 Luồng Xác Thực

```
User → /signin → Server Action → POST /auth/signin (NestJS)
    → Nhận accessToken + refreshToken
    → Mã hóa session bằng jose (HS256) → Lưu httpOnly cookie
    → Middleware kiểm tra session trên mỗi request
    → Tự động refresh token khi còn 2 phút hết hạn
```

---

## 3. Cách 2 Project Tương Tác

### 3.1 Kiến Trúc Tổng Thể

```
┌──────────────────────────────────────────────────────────────┐
│                    Browser (User/Admin)                        │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│              Dashboard/my-app (Next.js)                       │
│              Port 3000 (default)                              │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ Server      │  │ API Routes   │  │ CopilotKit Runtime   │ │
│  │ Components  │  │ (BFF Proxy)  │  │ /api/copilotkit      │ │
│  │ (dal.ts)    │  │ (with-auth)  │  │                      │ │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬───────────┘ │
└─────────┼────────────────┼─────────────────────┼─────────────┘
          │                │                     │
          │    NESTJS_API_URL                    │ DEPLOYMENT_URL
          │                │                     │
┌─────────▼────────────────▼─────┐    ┌──────────▼─────────────┐
│     API-EBook (NestJS)          │    │   AI Agent Server      │
│     Port 3000 (default)         │    │   (Hono, Port 3001)    │
│                                 │    │                        │
│  ┌──────────┐ ┌──────────────┐  │    │  ┌────────────────┐   │
│  │ Auth     │ │ Books/Cart/  │  │    │  │ → Python Agent │   │
│  │ JWT      │ │ Orders/Stats │  │    │  │   (Port 8001)  │   │
│  └──────────┘ └──────────────┘  │    │  │ → TS Agent     │   │
│  ┌──────────┐ ┌──────────────┐  │    │  │   (Port 8123)  │   │
│  │ Prisma   │ │ CopilotKit   │  │    │  └────────────────┘   │
│  │ + pgvec  │ │ Runtime      │  │    └────────────────────────┘
│  └──────────┘ └──────────────┘  │
│  ┌──────────┐ ┌──────────────┐  │
│  │ Redis    │ │ JWT Guards   │  │
│  │ Cache    │ │ Role checks  │  │
│  └──────────┘ └──────────────┘  │
└─────────────────────────────────┘
          │
┌─────────▼───────────────────────┐
│  PostgreSQL 16 + pgvector       │
│  Redis                          │
└─────────────────────────────────┘
```

### 3.2 Chi Tiết Kết Nối

#### A. Dashboard → NestJS API (HTTP/REST)

**Cơ chế:** Next.js API Routes đóng vai trò **BFF (Backend-for-Frontend)**

```
Client Component → fetch("/api/books") → Next.js API Route
    → axios-server.ts (gắn Bearer token từ session)
    → NESTJS_API_URL/books (NestJS backend)
    → Response → Client
```

**Cấu hình:**
- `NESTJS_API_URL` — URL của NestJS API (trong .env Dashboard)
- Axios instance tự động gắn JWT access token từ session cookie
- Response interceptor redirect về `/signin` khi 401

**Các endpoint được proxy:**

| Frontend Route | NestJS Endpoint | Mục Đích |
|---|---|---|
| `GET /api/books/admin/all` | `GET /books/admin/all` | Danh sách sách cho admin |
| `POST /api/books` | `POST /books` | Tạo sách mới |
| `GET/PATCH/DELETE /api/books/[id]` | `GET/PATCH/DELETE /books/[id]` | CRUD sách |
| `POST /api/category` | `POST /category` | Tạo danh mục |
| `GET /api/category/list` | `GET /category/all/list` | Danh sách danh mục |
| `POST /api/chapters` | `POST /chapters` | Tạo chương (batch) |
| `GET/PATCH /api/chapters/[id]` | `GET /chapters/by-book/[id]`, `PATCH /chapters/[id]` | CRUD chương |
| `GET /api/orders/admin/all` | `GET /orders/admin/all` | Danh sách đơn hàng |
| `GET /api/orders/user/[userId]` | `GET /orders/admin/user/[userId]` | Đơn hàng theo user |
| `GET/PATCH/DELETE /api/users/[id]` | `GET/PATCH/DELETE /users/[id]` | CRUD user |
| `GET /api/export/[id]/[format]` | `GET /export-doc/[id]/doc\|pdf` | Xuất sách |

#### B. Dashboard → AI Agent (CopilotKit)

**Cơ chế:** CopilotKit runtime endpoint trong Next.js proxy đến Python LangGraph agent

```
CopilotSidebar (Chat UI) → POST /api/copilotkit
    → CopilotKit Runtime (Next.js)
    → LangGraphHttpAgent → DEPLOYMENT_URL/book-agent
    → Python Agent v2 (FastAPI + LangGraph)
    → Tools gọi ngược lại NestJS bằng Bearer access token
```

**Agent gọi ngược lại NestJS:**
- Python agent nhận Bearer token từ Next.js Copilot runtime
- Python agent forward token đó khi gọi `/stats/...` và các API bảo vệ khác
- NestJS vẫn kiểm tra JWT/role guard như request admin bình thường

#### C. Dashboard Server Components → NestJS (DAL)

**Cơ chế:** Server Components fetch data trực tiếp qua Data Access Layer

```typescript
// dal.ts
export async function getAdminBooks(params) {
  const session = await getSession();
  const { data } = await axios.get('/books/admin/all', {
    headers: { Authorization: `Bearer ${session.accessToken}` }
  });
  return data;
}
```

Sử dụng trong: `books/page.tsx`, `categories/page.tsx`, `orders/page.tsx`

### 3.3 Luồng Dữ Liệu Cụ Thể

#### Luồng 1: Quản lý sách

```
1. Admin vào /dashboard/books
2. Server Component gọi dal.getAdminBooks() → NestJS GET /books/admin/all
3. Hiển thị danh sách sách với phân trang, tìm kiếm
4. Admin nhấn "Tạo sách mới" → DialogBook component
5. AI tạo outline qua CopilotKit → Python Agent → book_subgraph
6. User duyệt outline → POST /api/books → NestJS POST /books
7. Sách được tạo trong PostgreSQL
```

#### Luồng 2: Viết chương bằng AI

```
1. Admin vào /dashboard/books/[id]/chapters
2. CopilotSidebar hiển thị chat
3. User yêu cầu "Viết chương 1"
4. CopilotKit → /api/copilotkit → Python Agent
5. Agent dùng Tavily tìm kiếm web → viết nội dung
6. Agent gọi tool write_chapter_content → trả về nội dung
7. User duyệt → POST /api/chapters → NestJS POST /chapters
8. Chương được lưu trong PostgreSQL
```

#### Luồng 3: Dashboard thống kê

```
1. Admin vào /dashboard
2. Server Component gọi NestJS GET /stats/overview, /stats/revenue, etc.
3. Hiển thị StatCard, Charts, QuickStats
4. Admin hỏi AI "Doanh thu tháng này?"
5. CopilotKit → Python Agent → stats_subgraph
6. Agent gọi NestJS stats endpoints → trả về data
7. Agent dùng render tool hiển thị biểu đồ trong chat
```

#### Luồng 4: Xác thực

```
1. User đăng nhập tại /signin
2. Server Action gọi NestJS POST /auth/signin
3. Nhận accessToken + refreshToken
4. Mã hóa session bằng jose → lưu httpOnly cookie
5. Mọi request tiếp theo: middleware kiểm tra session
6. Axios interceptor gắn Bearer token
7. Khi token sắp hết hạn (còn 2 phút): tự động refresh
8. Logout: gọi NestJS POST /auth/logout → xóa cookie
```

### 3.4 Chia Sẻ Dữ Liệu

| Dữ Liệu | Nguồn | Sử Dụng Bởi |
|----------|-------|-------------|
| User (id, email, role) | NestJS `users` table | Dashboard auth, middleware role check |
| Books | NestJS `books` table | Dashboard book list, AI book agent |
| Chapters | NestJS `chapters` table | Dashboard chapter editor, AI writing |
| Categories | NestJS `categories` table | Dashboard category pages |
| Orders | NestJS `orders` table | Dashboard order tracking |
| Stats | NestJS `/stats/*` endpoints | Dashboard charts, AI stats agent |
| Book Embeddings | PostgreSQL pgvector (768-dim) | TS Agent semantic search |
| Session (JWT) | Dashboard httpOnly cookie | All authenticated requests |

### 3.5 Auth Flow Liên Kết

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Dashboard       │     │  NestJS API      │     │  AI Agent        │
│  (Next.js)       │     │                  │     │  (Python)        │
│                  │     │                  │     │                  │
│  1. /signin      │────▶│  POST /auth/     │     │                  │
│     Server Action│     │  signin          │     │                  │
│                  │◀────│  → JWT tokens    │     │                  │
│  2. Encrypt      │     │                  │     │                  │
│     session      │     │                  │     │                  │
│     (jose)       │     │                  │     │                  │
│                  │     │                  │     │                  │
│  3. API call     │────▶│  Validate JWT    │     │                  │
│     + Bearer     │     │  → Process       │     │                  │
│                  │◀────│  → Response      │     │                  │
│                  │     │                  │     │                  │
│  4. CopilotKit   │────▶│                  │     │  Process request │
│     chat         │     │                  │     │  → Call internal │
│                  │     │  ◀──────────────│─────│  API (API key)   │
│                  │◀────│  ──────────────│─────│  → Response      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## 4. Tóm Tắt Công Nghệ Sử Dụng

### Backend (API-EBook)
- **NestJS 11** — Node.js framework, modular architecture
- **Prisma 7.7** — Type-safe ORM với PostgreSQL adapter
- **PostgreSQL 16** — Relational DB với pgvector extension cho vector embeddings
- **Redis** — Cache cho stats endpoints (TTL: 2min-1hr)
- **Passport.js + JWT** — Authentication (15min access + 7day refresh tokens)
- **Argon2** — Password hashing (bảo mật hơn bcrypt)
- **Stripe** — Payment processing
- **Cloudinary** — Image hosting
- **Swagger** — API documentation tại `/api/docs`
- **FastAPI (Python)** — AI agent server
- **LangGraph** — Multi-agent orchestration framework
- **OpenAI gpt-4o-mini** — LLM inference
- **Ollama** — Local LLM (ministral-3:3b) cho semantic search
- **Tavily** — Web search API cho AI research
- **CopilotKit** — AI assistant framework (AG-UI protocol)
- **Hono** — Lightweight HTTP server cho agent gateway
- **pgvector** — Vector similarity search (768 chiều, cosine distance)

### Frontend (Dashboard/my-app)
- **Next.js 16** — React framework với App Router
- **React 19** — UI library
- **TypeScript 5** — Type safety
- **Tailwind CSS v4** — Utility-first CSS
- **shadcn/ui** — Component library (40+ components)
- **CopilotKit** — AI chat sidebar + frontend tools
- **Recharts** — Charts library
- **TanStack Table** — Headless table
- **React Hook Form + Zod** — Form management + validation
- **Axios** — HTTP client
- **jose** — JWT encryption for sessions
- **@dnd-kit** — Drag and drop
- **Framer Motion** — Animations
- **react-markdown** — Markdown rendering

### Deployment
- **Docker Compose** — 7 services: PostgreSQL+pgvector, Redis, NestJS API, Agent Server, TS Agent, Python Agent, Frontend
- **Render.com** — Python agent deployment config

---

## 5. File .env (Chỉ Kiểm Tra Tồn Tại)

| File | Tồn Tại | Loại |
|------|---------|------|
| `/mnt/disk2/API-EBook/.env` | ✅ | ASCII text |
| `/mnt/disk2/API-EBook/agent-server/.env` | ✅ | ASCII text |
| `/mnt/disk2/API-EBook/ai-agent-python/.env` | ✅ | ASCII text |
| `/mnt/disk2/Dashboard/my-app/.env` | ✅ | ASCII text |

**Biến môi trường quan trọng (suy ra từ code):**

| Biến | Sử Dụng |
|------|---------|
| `DATABASE_URL` | PostgreSQL connection (API + Agents) |
| `REDIS_URL` | Redis cache |
| `JWT_SECRET` | Access token signing |
| `JWT_REFRESH_SECRET` | Refresh token signing |
| `SESSION_SECRET_KEY` | Dashboard session encryption |
| `NESTJS_API_URL` | Dashboard → NestJS API |
| `DEPLOYMENT_URL` | Dashboard → AI Agent Server |
| `OPENAI_API_KEY` | Python agent → OpenAI |
| `STRIPE_SECRET_KEY` | Payment processing |
| `CLOUDINARY_*` | Image upload |
| `TAVILY_API_KEY` | Web search |
| `OLLAMA_BASE_URL` | Local LLM |
| `ALLOWED_ORIGINS` | CORS configuration |

---

## 6. Kết Luận

Hai project tạo thành một hệ thống **eBook e-commerce hoàn chỉnh** với:

1. **Backend mạnh mẽ**: NestJS với đầy đủ CRUD, auth, payment, caching
2. **Frontend hiện đại**: Next.js 16 App Router, Server Components, shadcn/ui
3. **AI sâu rộng**: Multi-agent system (viết sách, tìm kiếm, thống kê) tích hợp sâu vào dashboard
4. **Kiến trúc sạch**: BFF pattern, separation of concerns, type-safe ở mọi tầng
5. **Bảo mật tốt**: JWT + Argon2 + rate limiting + CORS + security headers + role-based access
6. **Production-ready**: Docker Compose, Swagger docs, error handling, caching strategy
