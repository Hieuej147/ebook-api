# 🔄 The Process: Engineering API-EBook

---

## 🎯 Motivation: From Basics to Real-World

**The Motivation:** After mastering the fundamentals of **NestJS**, I wanted to move beyond basic "Hello World" tutorials. I built **API-EBook** to put my knowledge into practice by creating a functional, full-featured store from scratch, dealing with the actual challenges of backend development.

**The Goal:**

- **Master the NestJS ecosystem**: Deep dive into its modular philosophy, services, and controllers.
- **Ensure Data Integrity**: Design a scalable database schema with strict ACID compliance using PostgreSQL.
- **Implement Pro-Level Features**: Integrate industry-standard security and third-party services like Stripe and Cloudinary.

---

## 📐 Database: The Foundation

### **Phase 1: Relational Modeling**

**Core Decisions:**

- **PostgreSQL**: Chosen for its reliability and support for complex transactions, which are essential for e-commerce consistency.
- **Prisma ORM**: Selected for its type-safety and exceptional developer experience during migrations.

**The Schema Architecture:**

- `User` → `Orders` → `OrderItems` → `Books`
- `User` → `Cart` → `CartItems` → `Books`
- `Books` → `Category` (Many-to-One)
- `Books` → `Chapters` (One-to-Many)
- `Order` → `Payment` (One-to-One)

---

## 🏗️ Building the Fortress (Security & Auth)

### **Phase 2: Authentication Strategy**

I prioritized security as the foundation. Instead of simple authentication, I implemented a **Dual-Token System**:

- **Access Tokens**: Short-lived (15 mins) for active session requests.
- **Refresh Tokens**: Long-lived (7 days) stored securely in the database to allow seamless re-authentication.

**Key Implementations:**

- **Argon2 Hashing**: Utilized for superior resistance against GPU-based brute-force attacks compared to Bcrypt.
- **Custom Guards**: Developed `@Roles()` and `JwtAuthGuard` to manage fine-grained access control.
- **Refresh Token Rotation**: Ensuring that if a refresh token is reused, the entire session is invalidated for maximum security.

---

## 🛒 The Engine (E-commerce Logic)

### **Phase 3: Cart & Inventory Management**

The biggest challenge was the **Cart Merge Logic**, as users often browse as guests before logging in.

- **Solution**: I built an endpoint that merges a local-storage-based cart into the database-backed user cart upon login, ensuring a seamless transition and **zero data loss** for the user.

### **Phase 4: The Order Transaction Flow**

To prevent **"overselling"** (selling more books than are in stock), I utilized **Prisma $transaction**:

1.  **Validate**: Verify real-time stock levels.
2.  **Execute**: Atomically create the Order, link OrderItems, and decrement book stock.
3.  **Rollback**: If any step fails (e.g., a connection drop), the entire process reverts to keep the data **perfectly consistent**.

---

## 💳 Professional Integrations

### **Phase 5: Stripe & Cloudinary**

- **Stripe Payment Intent API**: I implemented the Payment Intent flow to track exactly when a payment is "Pending," "Succeeded," or "Failed," automatically updating order statuses via secure **Webhooks**.
- **Cloudinary Asset Management**: Built a custom Multer integration to handle image uploads for book covers, ensuring assets are optimized and delivered via a global CDN.

---

## 🤖 Innovation Layer (AI & Documents)

### **Phase 6: Document Export System**

I developed a rendering engine that parses raw **Markdown chapters** and transforms them into professional **DOCX and PDF** files. This involved managing buffers and stream-based document generation for high performance.

### **Phase 7: Agentic AI with LangGraph**

The final frontier was the AI Assistant. Using **LangGraph and CopilotKit**, I built an agent that doesn't just chat—it acts.

- **Tools**: The agent can call internal APIs (protected by API keys) to fetch book statistics, search the catalog, or perform web research via the **Tavily API**.

---

## 💭 Reflections & Takeaways

**What went well?**

- The **Modular Architecture** allowed me to add the complex AI module 8 weeks into development without refactoring the core e-commerce logic.
- **Prisma's Type-Safety** caught numerous potential bugs early, especially during the integration of the Payment module.

**Key Skills Mastered:**

- Advanced **NestJS** (Guards, Interceptors, Custom Decorators).
- Transactional **Database Design** (ACID principles).
- Agentic **AI Orchestration** and Tool-calling.
- **Third-party Integration**: Stripe Webhooks and Cloudinary API.

---

<div align="center">
  <sub>API-EBook - Evolution of a Full-Stack Backend</sub>
</div>
