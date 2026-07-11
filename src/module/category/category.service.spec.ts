import { Test, TestingModule } from '@nestjs/testing';
import { CategoryService } from './category.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('CategoryService', () => {
  let service: CategoryService;

  const mockPrisma = {
    category: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should throw ConflictException if slug exists', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: '1', slug: 'existing' });
      await expect(service.create({ name: 'Test' })).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if not found', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should throw BadRequestException if category has books', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({
        id: '1',
        _count: { books: 5 },
      });
      await expect(service.remove('1')).rejects.toThrow(BadRequestException);
    });
  });
});
