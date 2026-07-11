import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import * as pactum from 'pactum';
import { PrismaService } from '../src/module/prisma/prisma.service';
import { SignupDto } from 'src/module/auth/dto';

describe('EBook API E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    await app.listen(3333);

    prisma = app.get(PrismaService);
    await prisma.cleanDB();
    pactum.request.setBaseUrl('http://localhost:3333');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  // ============================================
  // AUTH
  // ============================================
  describe('Auth', () => {
    const adminDto: SignupDto = {
      email: 'admin@ebook.com',
      password: 'Admin@123',
      firstName: 'Admin',
      lastName: 'Master',
    };
    const userDto: SignupDto = {
      email: 'user@gmail.com',
      password: 'User@123',
      firstName: 'John',
      lastName: 'Doe',
    };

    describe('Signup', () => {
      it('should signup as Admin', () => {
        return pactum
          .spec()
          .post('/auth/signup')
          .withBody(adminDto)
          .expectStatus(201);
      });

      it('should upgrade user to ADMIN in database', async () => {
        await prisma.user.update({
          where: { email: adminDto.email },
          data: { role: 'ADMIN' },
        });
      });

      it('should signup as Normal User', () => {
        return pactum
          .spec()
          .post('/auth/signup')
          .withBody(userDto)
          .expectStatus(201);
      });

      it('should fail signup with duplicate email', () => {
        return pactum
          .spec()
          .post('/auth/signup')
          .withBody(adminDto)
          .expectStatus(409);
      });

      it('should fail signup with missing fields', () => {
        return pactum
          .spec()
          .post('/auth/signup')
          .withBody({ email: 'bad@test.com' })
          .expectStatus(400);
      });
    });

    describe('Signin', () => {
      it('should signin as Admin and store token', () => {
        return pactum
          .spec()
          .post('/auth/signin')
          .withBody({ email: adminDto.email, password: adminDto.password })
          .expectStatus(200)
          .stores('adminAt', 'accessToken')
          .stores('adminRt', 'refreshToken');
      });

      it('should signin as User and store token', () => {
        return pactum
          .spec()
          .post('/auth/signin')
          .withBody({ email: userDto.email, password: userDto.password })
          .expectStatus(200)
          .stores('userAt', 'accessToken');
      });

      it('should fail signin with wrong password', () => {
        return pactum
          .spec()
          .post('/auth/signin')
          .withBody({ email: adminDto.email, password: 'WrongPassword' })
          .expectStatus(401);
      });

      it('should fail signin with non-existent email', () => {
        return pactum
          .spec()
          .post('/auth/signin')
          .withBody({ email: 'nobody@test.com', password: 'Password123' })
          .expectStatus(401);
      });
    });

    describe('Refresh Token', () => {
      it('should refresh tokens', () => {
        return pactum
          .spec()
          .post('/auth/refresh')
          .withHeaders('Authorization', 'Bearer $S{adminRt}')
          .expectStatus(200)
          .stores('adminAt2', 'accessToken')
          .stores('adminRt2', 'refreshToken');
      });
    });

    describe('Guards', () => {
      it('should fail without token (401)', () => {
        return pactum
          .spec()
          .get('/users')
          .expectStatus(401);
      });

      it('should fail USER accessing admin route (403)', () => {
        return pactum
          .spec()
          .get('/users')
          .withHeaders('Authorization', 'Bearer $S{userAt}')
          .expectStatus(403);
      });
    });
  });

  // ============================================
  // CATEGORIES
  // ============================================
  describe('Categories', () => {
    it('should create a category (Admin)', () => {
      return pactum
        .spec()
        .post('/category')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withBody({ name: 'Technology', description: 'Tech books' })
        .expectStatus(201)
        .stores('catId', 'id')
        .stores('catSlug', 'slug');
    });

    it('should create second category', () => {
      return pactum
        .spec()
        .post('/category')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withBody({ name: 'Fiction', description: 'Fiction books' })
        .expectStatus(201)
        .stores('catId2', 'id');
    });

    it('should fail duplicate slug', () => {
      return pactum
        .spec()
        .post('/category')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withBody({ name: 'Technology' })
        .expectStatus(409);
    });

    it('should get all categories (Public)', () => {
      return pactum
        .spec()
        .get('/category')
        .expectStatus(200)
        .expectJsonLength('data', 2);
    });

    it('should get category by slug', () => {
      return pactum
        .spec()
        .get('/category/slug/$S{catSlug}')
        .expectStatus(200)
        .expectBodyContains('Technology');
    });

    it('should get category list (flat)', () => {
      return pactum
        .spec()
        .get('/category/all/list')
        .expectStatus(200);
    });

    it('should update category', () => {
      return pactum
        .spec()
        .patch('/category/$S{catId}')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withBody({ description: 'Updated description' })
        .expectStatus(200)
        .expectBodyContains('Updated description');
    });

    it('should fail USER creating category (403)', () => {
      return pactum
        .spec()
        .post('/category')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .withBody({ name: 'Blocked' })
        .expectStatus(403);
    });
  });

  // ============================================
  // BOOKS
  // ============================================
  describe('Books', () => {
    it('should create a book (Admin)', () => {
      return pactum
        .spec()
        .post('/books')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withBody({
          title: 'NestJS in Action',
          author: 'Eric Keaj',
          price: 39.99,
          stock: 100,
          sku: 'NEST-001',
          categoryId: '$S{catId}',
          status: 'PUBLISHED',
        })
        .expectStatus(201)
        .stores('bookId', 'id');
    });

    it('should create second book', () => {
      return pactum
        .spec()
        .post('/books')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withBody({
          title: 'Clean Code',
          author: 'Robert Martin',
          price: 29.99,
          stock: 50,
          sku: 'CLEAN-001',
          categoryId: '$S{catId}',
          status: 'PUBLISHED',
        })
        .expectStatus(201)
        .stores('bookId2', 'id');
    });

    it('should fail duplicate SKU', () => {
      return pactum
        .spec()
        .post('/books')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withBody({
          title: 'Duplicate',
          author: 'Test',
          price: 10,
          stock: 1,
          sku: 'NEST-001',
          categoryId: '$S{catId}',
        })
        .expectStatus(409);
    });

    it('should get all books (Public)', () => {
      return pactum
        .spec()
        .get('/books')
        .expectStatus(200)
        .expectJsonLength('data', 2);
    });

    it('should search books by keyword', () => {
      return pactum
        .spec()
        .get('/books')
        .withQueryParams('search', 'NestJS')
        .expectStatus(200)
        .expectJsonLength('data', 1);
    });

    it('should filter books by category', () => {
      return pactum
        .spec()
        .get('/books')
        .withQueryParams('category', '$S{catId}')
        .expectStatus(200);
    });

    it('should get book by ID', () => {
      return pactum
        .spec()
        .get('/books/$S{bookId}')
        .expectStatus(200)
        .expectBodyContains('NestJS in Action');
    });

    it('should get all books for admin', () => {
      return pactum
        .spec()
        .get('/books/admin/all')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .expectStatus(200);
    });

    it('should update book', () => {
      return pactum
        .spec()
        .patch('/books/$S{bookId}')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withBody({ price: 44.99 })
        .expectStatus(200);
    });

    it('should update book stock', () => {
      return pactum
        .spec()
        .patch('/books/$S{bookId}/stock')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withBody({ quantity: 10 })
        .expectStatus(200);
    });

    it('should fail USER creating book (403)', () => {
      return pactum
        .spec()
        .post('/books')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .withBody({ title: 'Blocked', author: 'Test', price: 1, stock: 1, sku: 'X', categoryId: '$S{catId}' })
        .expectStatus(403);
    });
  });

  // ============================================
  // CHAPTERS
  // ============================================
  describe('Chapters', () => {
    it('should create chapters (batch)', () => {
      return pactum
        .spec()
        .post('/chapters')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withBody({
          chapters: [
            { bookId: '$S{bookId}', title: 'Chapter 1', content: 'Intro', chapterNumber: 1 },
            { bookId: '$S{bookId}', title: 'Chapter 2', content: 'Basics', chapterNumber: 2 },
          ],
        })
        .expectStatus(201);
    });

    it('should get chapters by book', () => {
      return pactum
        .spec()
        .get('/chapters/by-book/$S{bookId}')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .expectStatus(200)
        .expectJsonLength(2);
    });

    it('should fail USER accessing chapters (403)', () => {
      return pactum
        .spec()
        .get('/chapters/by-book/$S{bookId}')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .expectStatus(403);
    });
  });

  // ============================================
  // CART
  // ============================================
  describe('Cart', () => {
    it('should add item to cart', () => {
      return pactum
        .spec()
        .post('/cart/items')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .withBody({ bookId: '$S{bookId}', quantity: 2 })
        .expectStatus(201);
    });

    it('should get cart', () => {
      return pactum
        .spec()
        .get('/cart')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .expectStatus(200);
    });

    it('should update cart item quantity', () => {
      return pactum
        .spec()
        .patch('/cart/items/$S{bookId}')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .withBody({ quantity: 3 })
        .expectStatus(200);
    });
  });

  // ============================================
  // ORDERS
  // ============================================
  describe('Orders', () => {
    it('should create order from cart', () => {
      return pactum
        .spec()
        .post('/orders')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .withBody({
          items: [{ bookId: '$S{bookId}', quantity: 2, price: 44.99 }],
          shippingAddress: '123 Main St, Hanoi',
        })
        .expectStatus(201)
        .stores('orderId', 'data.id');
    });

    it('should get user orders', () => {
      return pactum
        .spec()
        .get('/orders')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .expectStatus(200);
    });

    it('should get order by ID', () => {
      return pactum
        .spec()
        .get('/orders/$S{orderId}')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .expectStatus(200);
    });

    it('should get all orders for admin', () => {
      return pactum
        .spec()
        .get('/orders/admin/all')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .expectStatus(200);
    });
  });

  // ============================================
  // PAYMENTS
  // ============================================
  describe('Payments', () => {
    it('should create payment intent', () => {
      return pactum
        .spec()
        .post('/payments/create-intent')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .withBody({ orderId: '$S{orderId}', amount: 89.98 })
        .expectStatus(201)
        .stores('paymentId', 'data.paymentId');
    });

    it('should get user payments', () => {
      return pactum
        .spec()
        .get('/payments')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .expectStatus(200);
    });

    it('should get payment by ID', () => {
      return pactum
        .spec()
        .get('/payments/$S{paymentId}')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .expectStatus(200);
    });
  });

  // ============================================
  // STATS (Admin Only)
  // ============================================
  describe('Stats', () => {
    it('should get overview stats (Admin)', () => {
      return pactum
        .spec()
        .get('/stats/overview')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .expectStatus(200);
    });

    it('should get revenue stats', () => {
      return pactum
        .spec()
        .get('/stats/revenue')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .expectStatus(200);
    });

    it('should get user stats', () => {
      return pactum
        .spec()
        .get('/stats/users')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .expectStatus(200);
    });

    it('should get order stats', () => {
      return pactum
        .spec()
        .get('/stats/orders')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .expectStatus(200);
    });

    it('should get book stats', () => {
      return pactum
        .spec()
        .get('/stats/books')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .expectStatus(200);
    });

    it('should get revenue chart', () => {
      return pactum
        .spec()
        .get('/stats/revenue/chart')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .expectStatus(200);
    });

    it('should fail USER accessing stats (403)', () => {
      return pactum
        .spec()
        .get('/stats/overview')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .expectStatus(403);
    });

    it('should fail unauthenticated accessing stats (401)', () => {
      return pactum
        .spec()
        .get('/stats/overview')
        .expectStatus(401);
    });
  });

  // ============================================
  // EXPORT
  // ============================================
  describe('Export', () => {
    it('should export book to PDF', () => {
      return pactum
        .spec()
        .get('/export-doc/$S{bookId}/pdf')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withRequestTimeout(60000)
        .expectStatus(200)
        .expectHeader('content-type', 'application/pdf');
    }, 70000);

    it('should export book to DOCX', () => {
      return pactum
        .spec()
        .get('/export-doc/$S{bookId}/doc')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withRequestTimeout(60000)
        .expectStatus(200);
    }, 70000);
  });

  // ============================================
  // USERS (Admin)
  // ============================================
  describe('Users', () => {
    it('should get all users (Admin)', () => {
      return pactum
        .spec()
        .get('/users')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .expectStatus(200);
    });

    it('should get current user profile', () => {
      return pactum
        .spec()
        .get('/users/me')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .expectStatus(200)
        .expectBodyContains('admin@ebook.com');
    });

    it('should update current user profile', () => {
      return pactum
        .spec()
        .patch('/users/me')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withBody({ firstName: 'Updated' })
        .expectStatus(200)
        .expectBodyContains('Updated');
    });
  });

  // ============================================
  // CLEANUP
  // ============================================
  describe('Cleanup', () => {
    it('should delete book', () => {
      return pactum
        .spec()
        .delete('/books/$S{bookId2}')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .expectStatus(200);
    });

    it('should delete category without books', () => {
      return pactum
        .spec()
        .delete('/category/$S{catId2}')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .expectStatus(200);
    });

    it('should logout', () => {
      return pactum
        .spec()
        .post('/auth/logout')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .expectStatus(200);
    });
  });
});
