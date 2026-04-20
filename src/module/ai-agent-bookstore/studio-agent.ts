// src/module/ai-agent-bookstore/studio-agent.ts
import * as dotenv from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service'; // Chỉnh lại đường dẫn nếu cần
import { createEbookAgent } from './agent';

// 1. Nạp file .env vào process.env
dotenv.config();

// 2. Tạo một ConfigService "giả" để đánh lừa NestJS PrismaService
const mockConfigService = {
  get: (key: string) => {
    // Trả về DATABASE_URL hoặc NODE_ENV từ file .env
    return process.env[key];
  },
} as unknown as ConfigService;

// 3. Khởi tạo chính xác class PrismaService của BẠN
const prisma = new PrismaService(mockConfigService);

// (Tùy chọn) Kích hoạt kết nối pool ngay lập tức giống hệt NestJS
prisma.onModuleInit().catch(console.error);

// 4. Truyền PrismaService của bạn vào Graph
export const graph = createEbookAgent(prisma);
