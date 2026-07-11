import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as argon from 'argon2';

jest.mock('argon2');

describe('UserService', () => {
  let service: UserService;
  let prisma: PrismaService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('should return user if found', async () => {
      const user = { id: '1', email: 'test@test.com', role: 'USER' };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      const result = await service.findOne('1');
      expect(result).toEqual(user);
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should throw ConflictException if email taken', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: '1', email: 'old@test.com' })
        .mockResolvedValueOnce({ id: '2', email: 'new@test.com' });
      await expect(service.update('1', { email: 'new@test.com' })).rejects.toThrow(ConflictException);
    });
  });

  describe('changePassword', () => {
    it('should throw UnauthorizedException if current password wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', password: 'hashed' });
      (argon.verify as jest.Mock).mockResolvedValue(false);
      await expect(service.changePassword('1', { currentPassword: 'wrong', newPassword: 'new' })).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException if same password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', password: 'hashed' });
      (argon.verify as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
      await expect(service.changePassword('1', { currentPassword: 'same', newPassword: 'same' })).rejects.toThrow(BadRequestException);
    });

    it('should update password on valid input', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', password: 'hashed' });
      (argon.verify as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      (argon.hash as jest.Mock).mockResolvedValue('new-hashed');
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.changePassword('1', { currentPassword: 'old', newPassword: 'new' });
      expect(result.message).toBe('Password changed successfully');
    });
  });
});
