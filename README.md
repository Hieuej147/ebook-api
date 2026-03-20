# 📚 API-EBook

> _A modern, full-featured e-book store API built with NestJS - From browsing to payment, powered by AI_

## ✨ Introduction

**API-EBook** is a comprehensive backend system for an electronic bookstore, engineered with **NestJS 11.x** and **TypeScript**. This project is not just a simple API—it is a **production-ready** backend architecture featuring robust authentication, role-based access control (RBAC), complex inventory management, integrated payment processing, document generation, and a cutting-edge AI Agent integration.

### Why build this project?

To truly master a framework, one must build a functional, real-world application. API-EBook was created with these core objectives:

- 🎯 **Best Practices**: Implementing modular architecture, dependency injection, custom decorators, guards, and interceptors.
- 🔐 **Security-First**: Building a complete Auth/Authz system with JWT (Access/Refresh tokens) and role-based permissions.
- 💳 **Financial Integration**: Integrating Stripe for real-world payment processing.
- 🤖 **AI Innovation**: Leveraging CopilotKit and LangGraph to create an intelligent AI assistant.
- 📊 **Scalable Design**: Architecting a complex database schema using Prisma ORM and PostgreSQL.

---

## 🛠️ Tech Stack

### 📦 Technologies

- **Core Framework**: NestJS 11.x, TypeScript.
- **Database & ORM**: PostgreSQL, Prisma ORM 7.x, Redis (Caching & Rate Limiting).
- **Security**: Passport JWT, Argon2 (Password Hashing), Custom RBAC Guards.
- **Payment & Cloud**: Stripe (Payment Intent API), Cloudinary (Image Hosting).
- **AI Integration**: LangGraph (Workflows), CopilotKit Runtime, OpenAI (LLM).
- **Document Generation**: Docx (Word), PDFKit (PDF), Markdown-it (Parsing).
- **Testing**: Jest (Unit/Integration), Pactum (E2E API Testing).

---

## 🦄 Features

- **👤 User Management**: Signup/Signin with JWT strategy, automated token refresh, and profile management for Normal/Premium users.
- **📖 Content System**: Full CRUD for books and categories, featuring Markdown support for chapters and Cloudinary integration for covers.
- **🛒 Intelligent Cart**: Stock-aware shopping cart with the ability to merge guest carts to user accounts upon login.
- **📦 Order Lifecycle**: Complete order tracking (Pending → Processing → Shipped → Delivered) with automatic stock deduction and restoration on cancellation.
- **💳 Secure Checkout**: End-to-end payment flow via Stripe with transaction history tracking.
- **📄 Document Export**: High-quality export of book content to `.docx` and `.pdf` formats with professional formatting.
- **🤖 AI Agent Assistant**: An integrated assistant for book lookups, web-based content extraction (Tavily), and shop analytics.
- **🛡️ Security & Performance**: Custom Throttler for rate limiting, class-validator for input validation, and API Key protection for internal endpoints.

---

## 🔄 The Process & 💡 What I Learned

**👉 Read the full story here: [THE_PROCESS.md](./THE_PROCESS_TEMPLATE.md)**

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:

- **Node.js** (Version >= 18.x)
- **npm** or **yarn**
- **PostgreSQL** (Version >= 14.x)
- **Redis** (Optional, required for caching/throttling features)
- **Docker & Docker Compose** (Recommended for easy database setup)

### Installation

1. **Clone repository**

```bash
git clone https://github.com/Hieuej147/ebook-api-.git
cd API-EBook
```

2. **Install dependencies**

```bash
npm install
```

3. **Setup environment variables**

Create a `.env` file in the root:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/ebook_db?schema=public"

# JWT Secrets
JWT_SECRET="your-super-secret-jwt-key"
JWT_REFRESH_SECRET="your-super-secret-refresh-key"

# Stripe
STRIPE_SECRET_KEY="sk_test_your_stripe_secret_key"

# Cloudinary
CLOUDINARY_NAME="your-cloudinary-cloud-name"
CLOUDINARY_API_KEY="your-cloudinary-api-key"
CLOUDINARY_API_SECRET="your-cloudinary-api-secret"

# CORS
ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5173"

# Port
PORT=3000

# AI Agent (optional)
NESTJS_AGENT_URL="http://localhost:8123"
OPENAI_API_KEY="your-openai-apt-key"
TAVILY_API_KEY="your-tavyly-api-key"

# Redis (optional)
REDIS_HOST="localhost"
REDIS_PORT=6379
```

4. **Setup database with Docker (recommended)**

```bash
# Start PostgreSQL container
npm run db:test:up

# Or use docker-compose
docker-compose up -d
```

5. **Run Prisma migrations**

```bash
npx prisma migrate dev
```

6. **Seed database (optional)**

```bash
npx prisma db seed
```

7. **Start development server**

```bash
npm run start:dev
```

Server running at: **http://localhost:3000**

API Documentation: **http://localhost:3000/api/docs**

---

## 📖 Available Scripts

```bash
# Development
npm run start          # Start app
npm run start:dev      # Start with watch mode
npm run start:debug    # Start with debug mode

# Build
npm run build          # Build for production
npm run start:prod     # Start production build

# Database
npm run db:test:up     # Start PostgreSQL container
npm run db:test:rm     # Remove PostgreSQL container
npm run db:test:restart # Restart database with fresh migrations
npm run db:test:studio # Open Prisma Studio

# Testing
npm run test           # Run unit tests
npm run test:watch     # Run tests in watch mode
npm run test:cov       # Run tests with coverage
npm run test:e2e       # Run E2E tests

# Code Quality
npm run lint           # Lint and fix
npm run format         # Format code with Prettier
```

---

## 🗂️ Project Structure

```
API-EBook/
├── src/
│   ├── main.ts                    # Application entry point
│   ├── app.module.ts              # Root module
│   ├── common/                    # Shared utilities
│   │   ├── decorators/           # Custom decorators
│   │   ├── guards/               # Auth guards
│   │   └── interfaces/           # TypeScript interfaces
│   └── module/                    # Feature modules
│       ├── auth/                 # Authentication
│       ├── user/                 # User management
│       ├── books/                # Books CRUD
│       ├── category/             # Categories
│       ├── chapters/             # Book chapters
│       ├── cart/                 # Shopping cart
│       ├── orders/               # Order management
│       ├── payments/             # Stripe integration
│       ├── export-doc/           # Document export
│       ├── stats/                # Statistics
│       ├── copilotkit/           # AI agent
│       ├── internal-api/         # Internal APIs
│       ├── cloudinary/           # Image upload
│       └── prisma/               # Prisma service
├── prisma/
│   ├── schema.prisma             # Database schema
│   └── migrations/               # Migration history
├── test/                          # E2E tests
├── ai-agent-python/              # Python AI agent
└── docker-compose.yml            # Docker configuration
```

---

## 📊 API Endpoints Overview

### 🔐 Authentication

- `POST /auth/signup` - User registration
- `POST /auth/signin` - User login
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - User logout

### 👤 Users

- `GET /users/me` - Get current user profile
- `PATCH /users/me` - Update profile information
- `PATCH /users/me/password` - Change account password
- `DELETE /users/me` - Delete account

### 📖 Books

- `GET /books` - List all books (Public)
- `GET /books/:id` - Get book details
- `POST /books` - Create a new book (Admin Only)
- `PATCH /books/:id` - Update book details (Admin Only)
- `DELETE /books/:id` - Remove a book (Admin Only)

### 🛒 Shopping Cart

- `GET /cart` - View current shopping cart
- `POST /cart/items` - Add item to cart
- `PATCH /cart/items/:id` - Update item quantity
- `DELETE /cart/items/:id` - Remove item from cart

### 📦 Orders

- `POST /orders` - Create a new order from cart
- `GET /orders` - View personal order history
- `GET /orders/:id` - Get specific order details
- `PATCH /orders/:id` - Update order information
- `DELETE /orders/:id` - Cancel an order

### 💳 Payments

- `POST /payments/create-intent` - Initialize Stripe Payment Intent
- `POST /payments/confirm` - Confirm successful payment status

_Explore the full API documentation via Swagger at: `http://localhost:3000/api/docs`_

---

## 🔐 Authentication Flow

```mermaid
1. User → POST /auth/signup → Server
   └─> Returns: { user, accessToken, refreshToken }

2. User → POST /auth/signin → Server
   └─> Returns: { user, accessToken, refreshToken }

3. User → Request with Authorization: Bearer <accessToken>
   └─> Grants access to protected routes

4. When accessToken expires:
   User → POST /auth/refresh with refreshToken
   └─> Returns: { new accessToken, new refreshToken }

5. User → POST /auth/logout
   └─> Server invalidates current refreshToken
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

This project is **UNLICENSED** - it's for educational and portfolio purposes.

---

## 👨‍💻 Author

**Hieu Dev**

- GitHub: [@Hieuej147](https://github.com/Hieuej147)
- Email: [your-email@example.com](mailto:your-email@example.com)

---

## 🙏 Acknowledgments

- **NestJS Team** - For the amazing framework
- **Prisma Team** - For the best ORM experience
- **Stripe** - For comprehensive payment API
- **LangChain/LangGraph** - For AI agent capabilities

---

<div align="center">
  <sub>Built with ❤️ using NestJS and TypeScript</sub>
</div>
