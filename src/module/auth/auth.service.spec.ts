import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon from 'argon2';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwt = {
    signAsync: jest.fn(),
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    jest.clearAllMocks();
  });

  describe('signup', () => {
    const dto = {
      email: 'test@test.com',
      password: 'Password123',
      firstName: 'Test',
      lastName: 'User',
    };

    it('should throw ConflictException if email exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', email: dto.email });
      await expect(service.signup(dto)).rejects.toThrow(ConflictException);
    });

    it('should create user and return tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (argon.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'USER',
        customerType: 'NORMAL',
      });
      mockJwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.signup(dto);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user.email).toBe(dto.email);
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });
  });

  describe('signin', () => {
    const dto = { email: 'test@test.com', password: 'Password123' };

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.signin(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: dto.email,
        password: 'hashed',
      });
      (argon.verify as jest.Mock).mockResolvedValue(false);
      await expect(service.signin(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should return tokens on valid credentials', async () => {
      const user = {
        id: '1',
        email: dto.email,
        password: 'hashed',
        firstName: 'Test',
        lastName: 'User',
        role: 'USER',
        customerType: 'NORMAL',
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      (argon.verify as jest.Mock).mockResolvedValue(true);
      mockJwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.signin(dto);

      expect(result.accessToken).toBe('access-token');
      expect(result.user.email).toBe(dto.email);
    });
  });

  describe('logout', () => {
    it('should set refreshToken to null', async () => {
      mockPrisma.user.update.mockResolvedValue({});
      await service.logout('user-1');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshToken: null },
      });
    });
  });

  describe('refreshTokens', () => {
    it('should throw UnauthorizedException if no refresh token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', refreshToken: null });
      await expect(service.refreshTokens('1')).rejects.toThrow(UnauthorizedException);
    });

    it('should return new tokens if refresh token exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'USER',
        customerType: 'NORMAL',
        refreshToken: 'hashed-refresh',
      });
      mockJwt.signAsync
        .mockResolvedValueOnce('new-access')
        .mockResolvedValueOnce('new-refresh');
      (argon.hash as jest.Mock).mockResolvedValue('hashed-new-refresh');
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.refreshTokens('1');

      expect(result.accessToken).toBe('new-access');
      expect(result.refreshToken).toBe('new-refresh');
    });
  });
});
