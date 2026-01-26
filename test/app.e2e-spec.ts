import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import * as pactum from 'pactum';
import { PrismaService } from '../src/module/prisma/prisma.service';
import { SignupDto } from 'src/module/auth/dto';

// describe('AppController (e2e)', () => {
//   let app: INestApplication<App>;

//   beforeEach(async () => {
//     const moduleFixture: TestingModule = await Test.createTestingModule({
//       imports: [AppModule],
//     }).compile();

//     app = moduleFixture.createNestApplication();
//     await app.init();
//   });

//   it('/ (GET)', () => {
//     return request(app.getHttpServer())
//       .get('/')
//       .expect(200)
//       .expect('Hello World!');
//   });
// });
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
    await prisma.cleanDB(); // Hàm xóa dữ liệu cũ
    pactum.request.setBaseUrl('http://localhost:3333');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  // --- TEST CASES START HERE ---
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

    it('should signup as Admin', () => {
      return pactum
        .spec()
        .post('/auth/signup')
        .withBody(adminDto)
        .expectStatus(201);
    });

    // ĐÂY LÀ CHỖ QUAN TRỌNG: Cập nhật Role trực tiếp trong DB
    it('should upgrade user to ADMIN in database', async () => {
      await prisma.user.update({
        where: { email: adminDto.email },
        data: { role: 'ADMIN' }, // 'ADMIN' phải khớp với Enum trong Schema
      });
    });

    it('should signin as Admin and store token', () => {
      return pactum
        .spec()
        .post('/auth/signin')
        .withBody({
          email: adminDto.email,
          password: adminDto.password,
        })
        .expectStatus(200)
        .stores('adminAt', 'accessToken'); // Lưu token Admin
    });

    it('should signup as Normal User', () => {
      return pactum
        .spec()
        .post('/auth/signup')
        .withBody(userDto)
        .expectStatus(201);
    });

    it('should signin as User and store token', () => {
      return pactum
        .spec()
        .post('/auth/signin')
        .withBody({
          email: userDto.email,
          password: userDto.password,
        })
        .expectStatus(200)
        .stores('userAt', 'accessToken'); // Lưu token User
    });
  });
  describe('Category & Books', () => {
    it('should create a category (Admin Only)', () => {
      return pactum
        .spec()
        .post('/category')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withBody({ name: 'Công nghệ', description: 'Sách về lập trình' })
        .expectStatus(201)
        .stores('catId', 'id'); // Lưu ID danh mục để dùng cho Sách
    });

    it('should create a new book (Admin Only)', () => {
      return pactum
        .spec()
        .post('/books')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withBody({
          title: 'NestJS căn bản',
          author: 'Eric Keaj',
          price: 50.0,
          stock: 100,
          sku: 'NEST-001',
          categoryId: '$S{catId}',
          status: 'PUBLISHED',
        })
        .expectStatus(201)
        .stores('bookId', 'id'); // Lưu ID sách
    });

    it('should get all books (Public)', () => {
      return pactum
        .spec()
        .get('/books')
        .withQueryParams('limit', 5)
        .expectStatus(200); //
    });
  });
  describe('Shopping Flow', () => {
    it('should add book to cart', () => {
      return pactum
        .spec()
        .post('/cart/items')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .withBody({ bookId: '$S{bookId}', quantity: 2 })
        .expectStatus(201); //
    });

    it('should create an order', () => {
      return pactum
        .spec()
        .post('/orders')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .withBody({
          items: [{ bookId: '$S{bookId}', quantity: 2, price: 50.0 }],
          shippingAddress: '99 Cầu Giấy, Hà Nội',
        })
        .expectStatus(201)
        .stores('orderId', 'data.id'); // Lưu ID đơn hàng
    });
  });
  describe('Chapters', () => {
    it('should create a chapter for the book', () => {
      return pactum
        .spec()
        .post('/chapters')
        .withHeaders('Authorization', 'Bearer $S{adminAt}')
        .withBody({
          chapters: [
            {
              bookId: '$S{bookId}',
              title: 'Chương mở đầu',
              content: 'Chào mừng bạn đến với thế giới NestJS!',
              chapterNumber: 1,
            },
          ],
        })
        .expectStatus(201); //
    });
  });
  describe('Payments & Export', () => {
    it('should create payment intent', () => {
      return pactum
        .spec()
        .post('/payments/create-intent')
        .withHeaders('Authorization', 'Bearer $S{userAt}')
        .withBody({ orderId: '$S{orderId}', amount: 100.0 })
        .expectStatus(201); //
    });

    it('should export book to PDF', () => {
      return pactum
        .spec()
        .get('/export-doc/$S{bookId}/pdf')
        .withRequestTimeout(60000)
        .expectStatus(200)
        .expectHeader('content-type', 'application/pdf'); // Kiểm tra định dạng file
    }, 70000);
  });
});
