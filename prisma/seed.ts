import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role, OrderStatus, PaymentStatus, CustomerType, Status } from '@prisma/client';
import * as argon from 'argon2';
import { faker } from '@faker-js/faker';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function cleanDB() {
  const modelKeys = Object.keys(prisma).filter(
    (key) =>
      typeof (prisma as any)[key] === 'object' &&
      typeof (prisma as any)[key]?.deleteMany === 'function',
  );
  await prisma.$transaction(
    modelKeys.map((key) => (prisma as any)[key].deleteMany()),
  );
  console.log('Database cleaned');
}

async function main() {
  console.log('Seeding database...');
  await cleanDB();

  // ============================================
  // 1. USERS
  // ============================================
  const adminPassword = await argon.hash('Admin@123');
  const userPassword = await argon.hash('User@123');

  const admin1 = await prisma.user.create({
    data: {
      email: 'admin@ebook.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'Master',
      role: Role.ADMIN,
      customerType: CustomerType.PREMIUM,
    },
  });

  const admin2 = await prisma.user.create({
    data: {
      email: 'admin2@ebook.com',
      password: adminPassword,
      firstName: 'Sarah',
      lastName: 'Manager',
      role: Role.ADMIN,
      customerType: CustomerType.NORMAL,
    },
  });

  const user1 = await prisma.user.create({
    data: {
      email: 'john@gmail.com',
      password: userPassword,
      firstName: 'John',
      lastName: 'Doe',
      role: Role.USER,
      customerType: CustomerType.NORMAL,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: 'jane@gmail.com',
      password: userPassword,
      firstName: 'Jane',
      lastName: 'Smith',
      role: Role.USER,
      customerType: CustomerType.PREMIUM,
    },
  });

  const user3 = await prisma.user.create({
    data: {
      email: 'bob@gmail.com',
      password: userPassword,
      firstName: 'Bob',
      lastName: 'Wilson',
      role: Role.USER,
      customerType: CustomerType.NORMAL,
    },
  });

  console.log('Created 5 users');

  // ============================================
  // 2. CATEGORIES
  // ============================================
  const catFiction = await prisma.category.create({
    data: {
      name: 'Fiction',
      description: 'Novels, short stories, and literary fiction',
      slug: 'fiction',
      isActive: true,
    },
  });

  const catNonFiction = await prisma.category.create({
    data: {
      name: 'Non-Fiction',
      description: 'Biographies, history, and factual books',
      slug: 'non-fiction',
      isActive: true,
    },
  });

  const catScience = await prisma.category.create({
    data: {
      name: 'Science',
      description: 'Physics, chemistry, biology, and more',
      slug: 'science',
      isActive: true,
    },
  });

  const catTechnology = await prisma.category.create({
    data: {
      name: 'Technology',
      description: 'Programming, software engineering, and IT',
      slug: 'technology',
      isActive: true,
    },
  });

  console.log('Created 4 categories');

  // ============================================
  // 3. BOOKS + CHAPTERS
  // ============================================
  const booksData = [
    { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', price: 12.99, stock: 50, sku: 'FIC-001', categoryId: catFiction.id, status: Status.PUBLISHED },
    { title: 'To Kill a Mockingbird', author: 'Harper Lee', price: 14.99, stock: 35, sku: 'FIC-002', categoryId: catFiction.id, status: Status.PUBLISHED },
    { title: '1984', author: 'George Orwell', price: 11.99, stock: 45, sku: 'FIC-003', categoryId: catFiction.id, status: Status.PUBLISHED },
    { title: 'Sapiens', author: 'Yuval Noah Harari', price: 16.99, stock: 30, sku: 'NF-001', categoryId: catNonFiction.id, status: Status.PUBLISHED },
    { title: 'Educated', author: 'Tara Westover', price: 13.99, stock: 25, sku: 'NF-002', categoryId: catNonFiction.id, status: Status.PUBLISHED },
    { title: 'A Brief History of Time', author: 'Stephen Hawking', price: 15.99, stock: 20, sku: 'SCI-001', categoryId: catScience.id, status: Status.PUBLISHED },
    { title: 'The Selfish Gene', author: 'Richard Dawkins', price: 12.49, stock: 15, sku: 'SCI-002', categoryId: catScience.id, status: Status.PUBLISHED },
    { title: 'Clean Code', author: 'Robert C. Martin', price: 39.99, stock: 40, sku: 'TECH-001', categoryId: catTechnology.id, status: Status.PUBLISHED },
    { title: 'Design Patterns', author: 'Gang of Four', price: 44.99, stock: 20, sku: 'TECH-002', categoryId: catTechnology.id, status: Status.PUBLISHED },
    { title: 'The Pragmatic Programmer', author: 'David Thomas', price: 34.99, stock: 0, sku: 'TECH-003', categoryId: catTechnology.id, status: Status.DRAFT },
  ];

  const books: Awaited<ReturnType<typeof prisma.book.create>>[] = [];
  for (const bookData of booksData) {
    const book = await prisma.book.create({
      data: {
        ...bookData,
        description: faker.lorem.paragraph(2),
        imageUrl: `https://picsum.photos/seed/${bookData.sku}/300/400`,
      },
    });
    books.push(book);

    // Create 2 chapters per book
    await prisma.chapters.createMany({
      data: [
        {
          bookId: book.id,
          title: `Chapter 1: Introduction`,
          description: `Introduction to ${book.title}`,
          content: faker.lorem.paragraphs(3),
          chapterNumber: 1,
        },
        {
          bookId: book.id,
          title: `Chapter 2: Getting Started`,
          description: `Getting started with ${book.title}`,
          content: faker.lorem.paragraphs(3),
          chapterNumber: 2,
        },
      ],
    });
  }

  console.log(`Created ${books.length} books with 2 chapters each`);

  // ============================================
  // 4. CARTS + CART ITEMS
  // ============================================
  const cart1 = await prisma.cart.create({
    data: {
      userId: user1.id,
      checkedOut: false,
    },
  });

  await prisma.cartItem.createMany({
    data: [
      { cartId: cart1.id, bookId: books[7].id, quantity: 1 }, // Clean Code
      { cartId: cart1.id, bookId: books[0].id, quantity: 2 }, // The Great Gatsby
    ],
  });

  const cart2 = await prisma.cart.create({
    data: {
      userId: user2.id,
      checkedOut: true,
    },
  });

  await prisma.cartItem.createMany({
    data: [
      { cartId: cart2.id, bookId: books[3].id, quantity: 1 }, // Sapiens
      { cartId: cart2.id, bookId: books[5].id, quantity: 1 }, // A Brief History of Time
    ],
  });

  console.log('Created 2 carts with items');

  // ============================================
  // 5. ORDERS + ORDER ITEMS
  // ============================================
  const order1 = await prisma.order.create({
    data: {
      userId: user1.id,
      status: OrderStatus.PENDING,
      totalAmount: 89.97,
      shippingAddress: '123 Main St, Hanoi',
      cartId: cart1.id,
    },
  });

  await prisma.orderItem.createMany({
    data: [
      { orderId: order1.id, bookId: books[7].id, quantity: 1, price: 39.99 },
      { orderId: order1.id, bookId: books[0].id, quantity: 2, price: 12.99 },
    ],
  });

  const order2 = await prisma.order.create({
    data: {
      userId: user2.id,
      status: OrderStatus.PROCESSING,
      totalAmount: 32.98,
      shippingAddress: '456 Oak Ave, HCMC',
      cartId: cart2.id,
    },
  });

  await prisma.orderItem.createMany({
    data: [
      { orderId: order2.id, bookId: books[3].id, quantity: 1, price: 16.99 },
      { orderId: order2.id, bookId: books[5].id, quantity: 1, price: 15.99 },
    ],
  });

  const order3 = await prisma.order.create({
    data: {
      userId: user3.id,
      status: OrderStatus.DELIVERED,
      totalAmount: 44.99,
      shippingAddress: '789 Elm St, Da Nang',
    },
  });

  await prisma.orderItem.create({
    data: { orderId: order3.id, bookId: books[8].id, quantity: 1, price: 44.99 },
  });

  const order4 = await prisma.order.create({
    data: {
      userId: user1.id,
      status: OrderStatus.CANCELLED,
      totalAmount: 14.99,
      shippingAddress: '123 Main St, Hanoi',
    },
  });

  await prisma.orderItem.create({
    data: { orderId: order4.id, bookId: books[1].id, quantity: 1, price: 14.99 },
  });

  console.log('Created 4 orders with items');

  // ============================================
  // 6. PAYMENTS
  // ============================================
  await prisma.payment.create({
    data: {
      orderId: order2.id,
      userId: user2.id,
      amount: 32.98,
      status: PaymentStatus.COMPLETED,
      currency: 'usd',
      paymentMethod: 'STRIPE',
      transactionId: 'pi_test_' + faker.string.alphanumeric(24),
    },
  });

  await prisma.payment.create({
    data: {
      orderId: order3.id,
      userId: user3.id,
      amount: 44.99,
      status: PaymentStatus.COMPLETED,
      currency: 'usd',
      paymentMethod: 'STRIPE',
      transactionId: 'pi_test_' + faker.string.alphanumeric(24),
    },
  });

  await prisma.payment.create({
    data: {
      orderId: order1.id,
      userId: user1.id,
      amount: 89.97,
      status: PaymentStatus.PENDING,
      currency: 'usd',
      paymentMethod: 'STRIPE',
      transactionId: 'pi_test_' + faker.string.alphanumeric(24),
    },
  });

  console.log('Created 3 payments');

  // ============================================
  // 7. USAGE (AI points)
  // ============================================
  await prisma.usage.create({
    data: {
      userId: user1.id,
      points: 10,
      expire: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  await prisma.usage.create({
    data: {
      userId: user2.id,
      points: 8,
      expire: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  console.log('Created 2 usage records');

  console.log('\n=== SEED COMPLETE ===');
  console.log(`Users: 5 (2 ADMIN, 3 USER)`);
  console.log(`Categories: 4`);
  console.log(`Books: 10 (9 PUBLISHED, 1 DRAFT)`);
  console.log(`Chapters: 20`);
  console.log(`Carts: 2`);
  console.log(`Orders: 4 (1 PENDING, 1 PROCESSING, 1 DELIVERED, 1 CANCELLED)`);
  console.log(`Payments: 3 (2 COMPLETED, 1 PENDING)`);
  console.log('=====================\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error('Seed failed:', e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
