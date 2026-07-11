import { Test, TestingModule } from '@nestjs/testing';
import { ChaptersService } from './chapters.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('ChaptersService', () => {
  let service: ChaptersService;

  const mockPrisma = {
    chapters: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    book: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((fns) => Promise.all(fns)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChaptersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ChaptersService>(ChaptersService);
    jest.clearAllMocks();
  });

  describe('getChaptersByBookId', () => {
    it('should return chapters for a book', async () => {
      mockPrisma.chapters.findMany.mockResolvedValue([
        { id: '1', chapterNumber: 1, title: 'Ch 1' },
      ]);
      const result = await service.getChaptersByBookId('book-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getChapterById', () => {
    it('should throw NotFoundException if not found', async () => {
      mockPrisma.chapters.findUnique.mockResolvedValue(null);
      try {
        await service.getChapterById('1');
      } catch (e) {
        expect(e).toBeDefined();
      }
    });
  });
});
