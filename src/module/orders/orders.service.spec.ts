import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('OrdersService', () => {
  let service: OrdersService;

  const mockPrisma = {
    order: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    book: {
      findUnique: jest.fn(),
    },
    cart: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn(mockPrisma)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('should throw NotFoundException if not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('should throw NotFoundException if order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);
      await expect(service.cancel('1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if order not PENDING', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: '1',
        status: 'SHIPPED',
        orderItems: [],
      });
      await expect(service.cancel('1')).rejects.toThrow(BadRequestException);
    });
  });
});
