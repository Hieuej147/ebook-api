// src/ai/ai.controller.ts
import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EmbedingService } from './embeding.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorator/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('AI')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth('JWT-auth')
@Controller('ai')
export class EmbedingController {
  constructor(private readonly aiService: EmbedingService) {}

  @Post('sync-old-books')
  @ApiOperation({ summary: 'Sync vector embeddings for old books (Admin Only)' })
  async syncOldBooks() {
    // Chạy ngầm hàm đồng bộ và trả về response báo cho client biết ngay
    this.aiService.syncMissingEmbeddings().catch(console.error);
    return { message: 'Tiến trình đồng bộ đang chạy ngầm dưới background, vui lòng kiểm tra log server.' };
  }
}