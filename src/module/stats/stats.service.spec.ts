import { Test, TestingModule } from '@nestjs/testing';
import { StatsService } from './stats.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheModule } from '@nestjs/cache-manager';

describe('StatsService', () => {
  let service: StatsService;

  const mockPrisma = {
    user: {
      count: jest.fn().mockResolvedValue(10),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    order: {
      count: jest.fn().mockResolvedValue(5),
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 100 }, _avg: { totalAmount: 20 } }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    book: {
      count: jest.fn().mockResolvedValue(20),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    category: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    payment: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 500 } }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    orderItem: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CacheModule.register()],
      providers: [
        StatsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StatsService>(StatsService);
    jest.clearAllMocks();
  });

  describe('getOverview', () => {
    it('should return overview stats', async () => {
      const result = await service.getOverview('month');
      expect(result).toBeDefined();
    });
  });

  describe('getBookStats', () => {
    it('should return book stats', async () => {
      const result = await service.getBookStats();
      expect(result).toBeDefined();
    });
  });
});
