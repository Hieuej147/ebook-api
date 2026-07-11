import { Test, TestingModule } from '@nestjs/testing';
import { BooksService } from './books.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { EmbedingService } from '../embeding/embeding.service';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('BooksService', () => {
  let service: BooksService;

  const mockPrisma = {
    book: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
    },
  };

  const mockCloudinary = { uploadFile: jest.fn() };
  const mockAiService = { embedSingleBook: jest.fn().mockResolvedValue({}) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CloudinaryService, useValue: mockCloudinary },
        { provide: EmbedingService, useValue: mockAiService },
      ],
    }).compile();

    service = module.get<BooksService>(BooksService);
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('should return book if found', async () => {
      const book = { id: '1', title: 'Test', category: { name: 'Tech' } };
      mockPrisma.book.findUnique.mockResolvedValue(book);
      const result = await service.findOne('1');
      expect(result.id).toBe('1');
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(null);
      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should throw ConflictException if SKU exists', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({ id: '1', sku: 'DUPLICATE' });
      await expect(service.create({ sku: 'DUPLICATE', title: 'T', author: 'A', price: 10, stock: 5, categoryId: 'cat-1' } as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('updateStock', () => {
    it('should throw BadRequestException if stock goes negative', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({ id: '1', stock: 2 });
      await expect(service.updateStock('1', -5)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should throw BadRequestException if book has orders', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({
        id: '1',
        orderItems: [{ id: 'oi-1' }],
        cartItems: [],
      });
      await expect(service.remove('1')).rejects.toThrow(BadRequestException);
    });
  });
});
