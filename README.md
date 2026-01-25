# API EBook - Tài liệu API Tổng hợp

## Tổng quan

API EBook là một hệ thống quản lý sách điện tử (E-Book) được xây dựng bằng NestJS, cung cấp đầy đủ các chức năng từ quản lý người dùng, sách, đơn hàng, thanh toán đến xuất tài liệu. Hệ thống hỗ trợ xác thực JWT, phân quyền Admin/User, tích hợp Stripe cho thanh toán, và Cloudinary cho lưu trữ hình ảnh.

## Công nghệ sử dụng

- **Framework**: NestJS 11.x
- **Database**: PostgreSQL với Prisma ORM
- **Authentication**: JWT (Access Token + Refresh Token)
- **Payment**: Stripe
- **Cloud Storage**: Cloudinary
- **Document Export**: DOCX (docx library), PDF (pdfkit)
- **AI Agent**: LangGraph với CopilotKit
- **API Documentation**: Swagger/OpenAPI

## Cấu trúc API

### Base URL
```
http://localhost:3000
```

### Swagger Documentation
```
http://localhost:3000/api/docs
```

---

## 1. Authentication Module (`/auth`)

### Mô tả
Module xử lý xác thực người dùng, đăng ký, đăng nhập, làm mới token và đăng xuất.

### API Endpoints

#### 1.1. Đăng ký tài khoản
- **Endpoint**: `POST /auth/signup`
- **Mô tả**: Tạo tài khoản người dùng mới với email và mật khẩu. Hệ thống sẽ hash mật khẩu bằng Argon2 và tự động tạo access token và refresh token.
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe"
  }
  ```
- **Response**: Trả về thông tin user, accessToken và refreshToken
- **Status Codes**: 
  - `201`: Đăng ký thành công
  - `400`: Dữ liệu không hợp lệ hoặc email đã tồn tại
  - `429`: Vượt quá giới hạn request

#### 1.2. Đăng nhập
- **Endpoint**: `POST /auth/signin`
- **Mô tả**: Xác thực người dùng với email và mật khẩu, trả về access token (15 phút) và refresh token (7 ngày).
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```
- **Response**: Thông tin user, accessToken và refreshToken
- **Status Codes**:
  - `200`: Đăng nhập thành công
  - `401`: Email hoặc mật khẩu không đúng
  - `429`: Vượt quá giới hạn request

#### 1.3. Làm mới Access Token
- **Endpoint**: `POST /auth/refresh`
- **Mô tả**: Tạo access token mới từ refresh token hợp lệ. Yêu cầu header `Authorization: Bearer <refresh_token>` với scheme `JWT-refresh`.
- **Headers**: `Authorization: Bearer <refresh_token>`
- **Response**: Access token và refresh token mới
- **Status Codes**:
  - `200`: Tạo token mới thành công
  - `401`: Refresh token không hợp lệ hoặc đã hết hạn

#### 1.4. Đăng xuất
- **Endpoint**: `POST /auth/logout`
- **Mô tả**: Đăng xuất người dùng và vô hiệu hóa refresh token trong database.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response**: `{ "message": "Successfully logged out" }`
- **Status Codes**:
  - `200`: Đăng xuất thành công
  - `401`: Token không hợp lệ

---

## 2. User Module (`/users`)

### Mô tả
Module quản lý thông tin người dùng, cho phép xem, cập nhật profile, đổi mật khẩu và xóa tài khoản.

### API Endpoints

#### 2.1. Lấy thông tin profile hiện tại
- **Endpoint**: `GET /users/me`
- **Mô tả**: Lấy thông tin profile của người dùng đang đăng nhập.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response**: Thông tin user (id, email, firstName, lastName, role, customerType)
- **Status Codes**: `200`, `401`

#### 2.2. Lấy tất cả users (Admin only)
- **Endpoint**: `GET /users`
- **Mô tả**: Lấy danh sách tất cả người dùng trong hệ thống. Chỉ Admin mới có quyền truy cập.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Response**: Mảng các user objects
- **Status Codes**: `200`, `401`, `403`

#### 2.3. Lấy user theo ID (Admin only)
- **Endpoint**: `GET /users/:id`
- **Mô tả**: Lấy thông tin chi tiết của một user theo ID. Chỉ Admin mới có quyền.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Response**: Thông tin user
- **Status Codes**: `200`, `401`, `403`, `404`

#### 2.4. Cập nhật profile
- **Endpoint**: `PATCH /users/me`
- **Mô tả**: Cập nhật thông tin profile của người dùng hiện tại (email, firstName, lastName).
- **Headers**: `Authorization: Bearer <access_token>`
- **Request Body**:
  ```json
  {
    "email": "newemail@example.com",
    "firstName": "Jane",
    "lastName": "Smith"
  }
  ```
- **Response**: Thông tin user đã cập nhật
- **Status Codes**: `200`, `401`, `409` (Email đã tồn tại)

#### 2.5. Đổi mật khẩu
- **Endpoint**: `PATCH /users/me/password`
- **Mô tả**: Thay đổi mật khẩu của người dùng hiện tại. Yêu cầu nhập mật khẩu cũ để xác thực.
- **Headers**: `Authorization: Bearer <access_token>`
- **Request Body**:
  ```json
  {
    "currentPassword": "oldpassword123",
    "newPassword": "newpassword456"
  }
  ```
- **Response**: `{ "message": "Password changed successfully" }`
- **Status Codes**: `200`, `401`, `400` (Mật khẩu cũ không đúng)

#### 2.6. Xóa tài khoản hiện tại
- **Endpoint**: `DELETE /users/me`
- **Mô tả**: Xóa tài khoản của người dùng đang đăng nhập.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response**: `{ "message": "User account deleted successfully" }`
- **Status Codes**: `200`, `401`

#### 2.7. Xóa user theo ID (Admin only)
- **Endpoint**: `DELETE /users/:id`
- **Mô tả**: Xóa một user theo ID. Chỉ Admin mới có quyền.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Response**: `{ "message": "User account deleted successfully" }`
- **Status Codes**: `200`, `401`, `403`, `404`

---

## 3. Books Module (`/books`)

### Mô tả
Module quản lý sách điện tử, bao gồm CRUD operations, tìm kiếm, phân trang, quản lý stock và upload ảnh bìa.

### API Endpoints

#### 3.1. Tạo sách mới (Admin only)
- **Endpoint**: `POST /books`
- **Mô tả**: Tạo một cuốn sách mới trong hệ thống. Admin có thể upload ảnh bìa và thiết lập các thông tin như title, author, price, stock, category.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Request Body** (multipart/form-data):
  ```
  title: string
  subtitle?: string
  author: string
  description?: string
  price: number
  stock: number
  sku: string (unique)
  categoryId: string
  image?: File
  status?: "DRAFT" | "PUBLISHED"
  ```
- **Response**: Thông tin sách đã tạo
- **Status Codes**: `201`, `409` (SKU đã tồn tại), `403`

#### 3.2. Lấy danh sách sách (Public)
- **Endpoint**: `GET /books`
- **Mô tả**: Lấy danh sách sách đã PUBLISHED và đang active, có phân trang và tìm kiếm. Chỉ hiển thị sách đã xuất bản cho khách hàng.
- **Query Parameters**:
  - `page`: số trang (default: 1)
  - `limit`: số lượng mỗi trang (default: 10)
  - `search`: từ khóa tìm kiếm (tìm theo title, author)
- **Response**: 
  ```json
  {
    "data": [...],
    "meta": {
      "total": 100,
      "page": 1,
      "limit": 10,
      "totalPages": 10
    }
  }
  ```
- **Status Codes**: `200`

#### 3.3. Lấy tất cả sách (Admin only)
- **Endpoint**: `GET /books/admin/all`
- **Mô tả**: Lấy danh sách tất cả sách bao gồm cả DRAFT và inactive, có phân trang và filter. Dành cho Admin quản lý.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Query Parameters**:
  - `page`, `limit`, `search`
  - `category`: filter theo categoryId
  - `isActive`: filter theo trạng thái active
- **Response**: Danh sách sách với metadata phân trang
- **Status Codes**: `200`, `401`, `403`

#### 3.4. Lấy sách theo ID
- **Endpoint**: `GET /books/:id`
- **Mô tả**: Lấy thông tin chi tiết của một cuốn sách theo ID.
- **Response**: Thông tin sách đầy đủ kèm category
- **Status Codes**: `200`, `404`

#### 3.5. Cập nhật sách (Admin only)
- **Endpoint**: `PATCH /books/:id`
- **Mô tả**: Cập nhật thông tin sách, có thể upload ảnh bìa mới. Hỗ trợ multipart/form-data.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Request Body** (multipart/form-data): Tương tự như tạo sách, tất cả fields đều optional
- **Response**: Thông tin sách đã cập nhật
- **Status Codes**: `200`, `404`, `409` (SKU đã tồn tại)

#### 3.6. Cập nhật stock (Admin only)
- **Endpoint**: `PATCH /books/:id/stock`
- **Mô tả**: Cập nhật số lượng tồn kho của sách. Có thể tăng (số dương) hoặc giảm (số âm) stock.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Request Body**:
  ```json
  {
    "quantity": 10  // Số dương để thêm, số âm để trừ
  }
  ```
- **Response**: Thông tin sách đã cập nhật stock
- **Status Codes**: `200`, `400` (Stock không đủ), `404`

#### 3.7. Xóa sách (Admin only)
- **Endpoint**: `DELETE /books/:id`
- **Mô tả**: Xóa một cuốn sách khỏi hệ thống. Không thể xóa sách đã có trong đơn hàng.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Response**: `{ "message": "Product deleted successfully" }`
- **Status Codes**: `200`, `400` (Không thể xóa sách đã có đơn hàng), `404`

---

## 4. Category Module (`/category`)

### Mô tả
Module quản lý danh mục sách, hỗ trợ tạo, sửa, xóa và tìm kiếm category.

### API Endpoints

#### 4.1. Tạo category mới (Admin only)
- **Endpoint**: `POST /category`
- **Mô tả**: Tạo một danh mục sách mới. Slug sẽ được tự động tạo từ name nếu không được cung cấp.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Request Body**:
  ```json
  {
    "name": "Fiction",
    "slug": "fiction",  // optional, tự động tạo nếu không có
    "description": "Fiction books",
    "imageUrl": "https://...",
    "isActive": true
  }
  ```
- **Response**: Thông tin category đã tạo
- **Status Codes**: `201`, `400`, `401`, `403`

#### 4.2. Lấy tất cả categories
- **Endpoint**: `GET /category`
- **Mô tả**: Lấy danh sách tất cả categories với phân trang và filter.
- **Query Parameters**:
  - `page`, `limit`
  - `isActive`: filter theo trạng thái
  - `search`: tìm kiếm theo name hoặc description
- **Response**: Danh sách categories với metadata và số lượng sách trong mỗi category
- **Status Codes**: `200`

#### 4.3. Lấy category theo ID
- **Endpoint**: `GET /category/:id`
- **Mô tả**: Lấy thông tin chi tiết của một category theo ID.
- **Response**: Thông tin category kèm số lượng sách
- **Status Codes**: `200`, `404`

#### 4.4. Lấy category theo slug
- **Endpoint**: `GET /category/slug/:slug`
- **Mô tả**: Lấy thông tin category theo slug (URL-friendly identifier).
- **Response**: Thông tin category
- **Status Codes**: `200`, `404`

#### 4.5. Cập nhật category (Admin only)
- **Endpoint**: `PATCH /category/:id`
- **Mô tả**: Cập nhật thông tin category. Slug phải unique nếu thay đổi.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Request Body**: Tất cả fields đều optional
- **Response**: Thông tin category đã cập nhật
- **Status Codes**: `200`, `404`, `409` (Slug đã tồn tại)

#### 4.6. Xóa category (Admin only)
- **Endpoint**: `DELETE /category/:id`
- **Mô tả**: Xóa một category. Không thể xóa category còn có sách.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Response**: `{ "message": "Category delete successfully" }`
- **Status Codes**: `200`, `400` (Category còn có sách), `404`

---

## 5. Cart Module (`/cart`)

### Mô tả
Module quản lý giỏ hàng, cho phép thêm, sửa, xóa sản phẩm và merge giỏ hàng guest.

### API Endpoints

#### 5.1. Lấy giỏ hàng hiện tại
- **Endpoint**: `GET /cart`
- **Mô tả**: Lấy giỏ hàng của người dùng hiện tại. Tự động tạo giỏ hàng mới nếu chưa có.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response**: 
  ```json
  {
    "id": "cart-id",
    "userId": "user-id",
    "cartItems": [...],
    "totalPrice": 150.00,
    "totalItems": 3,
    "createdAt": "...",
    "updatedAt": "..."
  }
  ```
- **Status Codes**: `200`, `401`

#### 5.2. Thêm sản phẩm vào giỏ hàng
- **Endpoint**: `POST /cart/items`
- **Mô tả**: Thêm một sản phẩm vào giỏ hàng. Nếu sản phẩm đã có, sẽ tăng số lượng. Kiểm tra stock trước khi thêm.
- **Headers**: `Authorization: Bearer <access_token>`
- **Request Body**:
  ```json
  {
    "bookId": "book-uuid",
    "quantity": 2
  }
  ```
- **Response**: Giỏ hàng đã cập nhật
- **Status Codes**: `201`, `400` (Stock không đủ), `404` (Sách không tồn tại), `401`

#### 5.3. Cập nhật số lượng sản phẩm
- **Endpoint**: `PATCH /cart/items/:id`
- **Mô tả**: Cập nhật số lượng của một item trong giỏ hàng.
- **Headers**: `Authorization: Bearer <access_token>`
- **Request Body**:
  ```json
  {
    "quantity": 5
  }
  ```
- **Response**: Giỏ hàng đã cập nhật
- **Status Codes**: `200`, `400` (Stock không đủ), `404`, `401`

#### 5.4. Xóa sản phẩm khỏi giỏ hàng
- **Endpoint**: `DELETE /cart/items/:id`
- **Mô tả**: Xóa một item khỏi giỏ hàng.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response**: Giỏ hàng đã cập nhật
- **Status Codes**: `200`, `404`, `401`

#### 5.5. Xóa tất cả sản phẩm trong giỏ hàng
- **Endpoint**: `DELETE /cart`
- **Mô tả**: Xóa tất cả items trong giỏ hàng, giữ lại giỏ hàng trống.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response**: Giỏ hàng trống
- **Status Codes**: `200`, `401`

#### 5.6. Merge giỏ hàng guest
- **Endpoint**: `POST /cart/merge`
- **Mô tả**: Merge giỏ hàng của guest (localStorage) vào giỏ hàng của user sau khi đăng nhập.
- **Headers**: `Authorization: Bearer <access_token>`
- **Request Body**:
  ```json
  {
    "items": [
      { "bookId": "book-1", "quantity": 2 },
      { "bookId": "book-2", "quantity": 1 }
    ]
  }
  ```
- **Response**: Giỏ hàng đã merge
- **Status Codes**: `200`, `401`

---

## 6. Orders Module (`/orders`)

### Mô tả
Module quản lý đơn hàng, từ tạo đơn, xem lịch sử, cập nhật trạng thái đến hủy đơn. Hỗ trợ phân quyền Admin và User.

### API Endpoints

#### 6.1. Tạo đơn hàng mới
- **Endpoint**: `POST /orders`
- **Mô tả**: Tạo đơn hàng mới từ danh sách sản phẩm. Tự động trừ stock, liên kết với giỏ hàng nếu có. Sử dụng transaction để đảm bảo tính nhất quán.
- **Headers**: `Authorization: Bearer <access_token>`
- **Request Body**:
  ```json
  {
    "items": [
      {
        "bookId": "book-uuid",
        "quantity": 2,
        "price": 29.99
      }
    ],
    "shippingAddress": "123 Main St, City, Country"
  }
  ```
- **Response**: 
  ```json
  {
    "success": true,
    "message": "Order retrieved successfully",
    "data": {
      "id": "order-id",
      "orderNumber": "cuid-xxx",
      "status": "PENDING",
      "total": 59.98,
      "items": [...],
      "createdAt": "..."
    }
  }
  ```
- **Status Codes**: `201`, `400` (Stock không đủ), `404` (Sách không tồn tại)
- **Rate Limit**: Moderate throttle

#### 6.2. Lấy tất cả đơn hàng của user
- **Endpoint**: `GET /orders`
- **Mô tả**: Lấy danh sách đơn hàng của người dùng hiện tại, có phân trang và filter theo status.
- **Headers**: `Authorization: Bearer <access_token>`
- **Query Parameters**:
  - `page`, `limit`
  - `status`: "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED"
  - `search`: tìm kiếm theo order ID
- **Response**: Danh sách đơn hàng với metadata
- **Status Codes**: `200`, `401`

#### 6.3. Lấy tất cả đơn hàng (Admin only)
- **Endpoint**: `GET /orders/admin/all`
- **Mô tả**: Lấy danh sách tất cả đơn hàng trong hệ thống, có phân trang và filter.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Query Parameters**: Tương tự như user endpoint
- **Response**: Danh sách tất cả đơn hàng
- **Status Codes**: `200`, `401`, `403`

#### 6.4. Lấy đơn hàng theo ID (User)
- **Endpoint**: `GET /orders/:id`
- **Mô tả**: Lấy thông tin chi tiết một đơn hàng của user hiện tại.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response**: Chi tiết đơn hàng
- **Status Codes**: `200`, `404`, `401`

#### 6.5. Lấy đơn hàng theo ID (Admin)
- **Endpoint**: `GET /orders/admin/:id`
- **Mô tả**: Lấy thông tin chi tiết bất kỳ đơn hàng nào trong hệ thống.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Response**: Chi tiết đơn hàng
- **Status Codes**: `200`, `404`, `401`, `403`

#### 6.6. Cập nhật đơn hàng (User)
- **Endpoint**: `PATCH /orders/:id`
- **Mô tả**: User cập nhật đơn hàng của chính mình (thường là shipping address).
- **Headers**: `Authorization: Bearer <access_token>`
- **Request Body**:
  ```json
  {
    "shippingAddress": "New address",
    "status": "PENDING"  // User chỉ có thể update một số fields
  }
  ```
- **Response**: Đơn hàng đã cập nhật
- **Status Codes**: `200`, `404`, `401`

#### 6.7. Cập nhật đơn hàng (Admin)
- **Endpoint**: `PATCH /orders/admin/:id`
- **Mô tả**: Admin cập nhật bất kỳ đơn hàng nào, có thể thay đổi status.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Request Body**: Tương tự như user endpoint
- **Response**: Đơn hàng đã cập nhật
- **Status Codes**: `200`, `404`, `401`, `403`

#### 6.8. Hủy đơn hàng (User)
- **Endpoint**: `DELETE /orders/:id`
- **Mô tả**: User hủy đơn hàng của chính mình. Chỉ có thể hủy đơn ở trạng thái PENDING. Tự động hoàn lại stock.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response**: Đơn hàng đã hủy
- **Status Codes**: `200`, `400` (Chỉ có thể hủy đơn PENDING), `404`, `401`

#### 6.9. Hủy đơn hàng (Admin)
- **Endpoint**: `DELETE /orders/admin/:id`
- **Mô tả**: Admin hủy bất kỳ đơn hàng nào ở trạng thái PENDING.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Response**: Đơn hàng đã hủy
- **Status Codes**: `200`, `400`, `404`, `401`, `403`

---

## 7. Payments Module (`/payments`)

### Mô tả
Module xử lý thanh toán qua Stripe, bao gồm tạo payment intent, xác nhận thanh toán và xem lịch sử thanh toán.

### API Endpoints

#### 7.1. Tạo Payment Intent
- **Endpoint**: `POST /payments/create-intent`
- **Mô tả**: Tạo Stripe Payment Intent cho một đơn hàng. Trả về client_secret để frontend có thể xử lý thanh toán.
- **Headers**: `Authorization: Bearer <access_token>`
- **Request Body**:
  ```json
  {
    "orderId": "order-uuid",
    "amount": 59.98,
    "currency": "usd"  // default: "usd"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "clientSecret": "pi_xxx_secret_xxx",
      "paymentId": "payment-uuid"
    },
    "message": "Payment intent created successfully"
  }
  ```
- **Status Codes**: `201`, `400` (Đơn hàng không tồn tại hoặc đã thanh toán), `404`

#### 7.2. Xác nhận thanh toán
- **Endpoint**: `POST /payments/confirm`
- **Mô tả**: Xác nhận thanh toán sau khi Stripe xử lý thành công. Tự động cập nhật status đơn hàng thành PROCESSING và đánh dấu giỏ hàng đã checkout.
- **Headers**: `Authorization: Bearer <access_token>`
- **Request Body**:
  ```json
  {
    "paymentIntentId": "pi_xxx",
    "orderId": "order-uuid"
  }
  ```
- **Response**: Thông tin payment đã xác nhận
- **Status Codes**: `200`, `400` (Payment đã hoàn thành hoặc không thành công), `404`

#### 7.3. Lấy tất cả payments
- **Endpoint**: `GET /payments`
- **Mô tả**: Lấy danh sách tất cả payments của user hiện tại.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response**: Danh sách payments
- **Status Codes**: `200`, `401`

#### 7.4. Lấy payment theo ID
- **Endpoint**: `GET /payments/:id`
- **Mô tả**: Lấy thông tin chi tiết một payment theo ID.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response**: Chi tiết payment
- **Status Codes**: `200`, `404`, `401`

#### 7.5. Lấy payment theo Order ID
- **Endpoint**: `GET /payments/order/:orderId`
- **Mô tả**: Lấy thông tin payment của một đơn hàng cụ thể.
- **Headers**: `Authorization: Bearer <access_token>`
- **Response**: Thông tin payment hoặc null nếu chưa có
- **Status Codes**: `200`, `404`, `401`

---

## 8. Chapters Module (`/chapters`)

### Mô tả
Module quản lý các chương của sách, hỗ trợ tạo nhiều chương cùng lúc, cập nhật và xóa chương.

### API Endpoints

#### 8.1. Lấy tất cả chương của sách
- **Endpoint**: `GET /chapters/by-book/:bookId`
- **Mô tả**: Lấy danh sách tất cả chương của một cuốn sách, sắp xếp theo chapterNumber.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Response**: Mảng các chương
- **Status Codes**: `200`, `401`, `403`

#### 8.2. Lấy chương theo ID
- **Endpoint**: `GET /chapters/one/:id`
- **Mô tả**: Lấy thông tin chi tiết một chương theo ID.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Response**: Thông tin chương (id, title, description, content, chapterNumber, bookId)
- **Status Codes**: `200`, `404`, `401`, `403`

#### 8.3. Tạo chương/chapters
- **Endpoint**: `POST /chapters`
- **Mô tả**: Tạo một hoặc nhiều chương cho sách. Sử dụng transaction để đảm bảo tính nhất quán. ChapterNumber phải unique trong một cuốn sách.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Request Body**:
  ```json
  {
    "chapters": [
      {
        "bookId": "book-uuid",
        "title": "Chapter 1: Introduction",
        "description": "Introduction to the book",
        "content": "Markdown content here...",
        "chapterNumber": 1
      },
      {
        "bookId": "book-uuid",
        "title": "Chapter 2: Getting Started",
        "chapterNumber": 2,
        "content": "..."
      }
    ]
  }
  ```
- **Response**: Chương/chapters đã tạo
- **Status Codes**: `201`, `400`, `409` (ChapterNumber đã tồn tại), `401`, `403`

#### 8.4. Cập nhật chương
- **Endpoint**: `PATCH /chapters/:id`
- **Mô tả**: Cập nhật thông tin một chương. Kiểm tra chapterNumber unique nếu thay đổi.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Request Body**: Tất cả fields đều optional
- **Response**: Chương đã cập nhật
- **Status Codes**: `200`, `404`, `409` (ChapterNumber conflict), `401`, `403`

#### 8.5. Xóa chương
- **Endpoint**: `DELETE /chapters/:id`
- **Mô tả**: Xóa một chương khỏi sách.
- **Headers**: `Authorization: Bearer <access_token>`
- **Roles**: `ADMIN`
- **Response**: `{ "message": "Deleted chapter ID: xxx" }`
- **Status Codes**: `200`, `404`, `401`, `403`

---

## 9. Export Document Module (`/export-doc`)

### Mô tả
Module xuất sách ra định dạng DOCX và PDF, hỗ trợ markdown content, ảnh bìa và format đẹp.

### API Endpoints

#### 9.1. Xuất sách ra DOCX
- **Endpoint**: `GET /export-doc/:id/doc`
- **Mô tả**: Xuất toàn bộ nội dung sách (bao gồm tất cả chương) ra file DOCX. Hỗ trợ markdown, ảnh bìa, format đẹp với typography.
- **Response**: File DOCX (binary)
- **Headers Response**:
  - `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `Content-Disposition: attachment; filename="Book_Title.docx"`
- **Status Codes**: `200`, `404` (Sách không tồn tại), `400` (Lỗi export)

#### 9.2. Xuất sách ra PDF
- **Endpoint**: `GET /export-doc/:id/pdf`
- **Mô tả**: Xuất toàn bộ nội dung sách ra file PDF. Hỗ trợ markdown rendering, ảnh bìa, typography đẹp.
- **Response**: File PDF (binary)
- **Headers Response**:
  - `Content-Type: application/pdf`
  - `Content-Disposition: attachment; filename="Book_Title.pdf"`
- **Status Codes**: `200`, `404`, `500` (Lỗi export)

---

## 10. CopilotKit Module (`/copilotkit`)

### Mô tả
Module tích hợp AI Agent sử dụng LangGraph và CopilotKit để cung cấp trợ lý AI cho ứng dụng.

### API Endpoints

#### 10.1. CopilotKit Endpoint
- **Endpoint**: `ALL /copilotkit`
- **Mô tả**: Endpoint chính cho CopilotKit runtime, xử lý tất cả requests từ AI agent. Kết nối với LangGraph agent để xử lý các tool calls và chat interactions.
- **Configuration**: 
  - Agent deployment URL từ env: `NESTJS_AGENT_URL`
  - Graph ID: `nestjs_agent`
- **Status Codes**: Tùy theo request từ agent

---

## 11. Internal API Module (`/internal`)

### Mô tả
Module API nội bộ được bảo vệ bởi API Key, dùng cho AI Agent truy cập dữ liệu.

### API Endpoints

#### 11.1. Lấy thông tin user (cho Agent)
- **Endpoint**: `GET /internal/user-info/:id`
- **Mô tả**: Lấy thông tin user (chỉ các fields cần thiết) cho AI Agent. Bảo vệ bởi API Key guard.
- **Headers**: `X-API-Key: <api-key>`
- **Response**: Thông tin user (id, email, firstName, role)
- **Status Codes**: `200`, `401` (Invalid API Key), `404`

#### 11.2. Xử lý dữ liệu từ Agent
- **Endpoint**: `POST /internal/process-data`
- **Mô tả**: Endpoint để Agent gửi dữ liệu xử lý lên server.
- **Headers**: `X-API-Key: <api-key>`
- **Request Body**: Tùy theo use case
- **Response**: `{ "success": true, "message": "Data processed" }`
- **Status Codes**: `200`, `401`

---

## 12. App Controller (`/hello`)

### Mô tả
Controller đơn giản để test server.

### API Endpoints

#### 12.1. Hello World
- **Endpoint**: `GET /hello`
- **Mô tả**: Endpoint test đơn giản để kiểm tra server đang chạy.
- **Response**: String message
- **Status Codes**: `200`

---

## Database Schema

### Models chính:

1. **User**: Người dùng (email, password, role, customerType)
2. **Book**: Sách (title, author, price, stock, sku, status, categoryId)
3. **Chapters**: Chương sách (bookId, title, content, chapterNumber)
4. **Category**: Danh mục (name, slug, description, isActive)
5. **Cart**: Giỏ hàng (userId, checkedOut)
6. **CartItem**: Item trong giỏ hàng (cartId, bookId, quantity)
7. **Order**: Đơn hàng (userId, status, totalAmount, orderNumber)
8. **OrderItem**: Item trong đơn hàng (orderId, bookId, quantity, price)
9. **Payment**: Thanh toán (orderId, userId, amount, status, transactionId)
10. **Usage**: Sử dụng điểm (userId, points, expire)

### Enums:

- **Role**: USER, ADMIN
- **OrderStatus**: PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED
- **PaymentStatus**: PENDING, COMPLETED, FAILED, REFUNDED
- **CustomerType**: NORMAL, PREMIUM
- **Status**: DRAFT, PUBLISHED

---

## Authentication & Authorization

### JWT Authentication

- **Access Token**: 
  - Expires: 15 phút
  - Header: `Authorization: Bearer <access_token>`
  - Scheme: `JWT-auth`

- **Refresh Token**:
  - Expires: 7 ngày
  - Header: `Authorization: Bearer <refresh_token>`
  - Scheme: `JWT-refresh`

### Roles

- **USER**: Người dùng thông thường, có thể mua sách, quản lý giỏ hàng, đơn hàng
- **ADMIN**: Quản trị viên, có quyền quản lý tất cả resources

### Guards

- **JwtAuthGuard**: Xác thực JWT token
- **RolesGuard**: Kiểm tra quyền truy cập theo role
- **ApiKeyGuard**: Bảo vệ internal API với API Key

---

## Rate Limiting

Hệ thống sử dụng custom throttler decorators:

- **ModerateThrottle**: Áp dụng cho các endpoint quan trọng như tạo đơn hàng, thanh toán
- **RelaxedThrottle**: Áp dụng cho các endpoint đọc dữ liệu

---

## Error Handling

Hệ thống sử dụng standard HTTP status codes:

- `200`: Success
- `201`: Created
- `400`: Bad Request (Validation errors, business logic errors)
- `401`: Unauthorized (Invalid/missing token)
- `403`: Forbidden (Insufficient permissions)
- `404`: Not Found
- `409`: Conflict (Duplicate data)
- `429`: Too Many Requests
- `500`: Internal Server Error

---

## Environment Variables

Các biến môi trường cần thiết:

```env
# Database
DATABASE_URL=postgresql://...

# JWT
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key

# Stripe
STRIPE_SECRET_KEY=sk_test_...

# Cloudinary
CLOUDINARY_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Port
PORT=3000

# Agent
NESTJS_AGENT_URL=http://localhost:8123
```

---

## Installation & Setup

```bash
# Install dependencies
npm install

# Setup database
npx prisma migrate dev

# Run development server
npm run start:dev

# Build for production
npm run build
npm run start:prod
```

---

## Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

---

## License

UNLICENSED
