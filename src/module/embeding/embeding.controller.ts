// src/ai/ai.controller.ts
import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmbedingService } from './embeding.service';

@ApiTags('AI')
@Controller('ai')
export class EmbedingController {
  constructor(private readonly aiService: EmbedingService) {}

  @Post('sync-old-books')
  @ApiOperation({ summary: 'Chạy đồng bộ vector cho các sách cũ bị thiếu' })
  async syncOldBooks() {
    // Chạy ngầm hàm đồng bộ và trả về response báo cho client biết ngay
    this.aiService.syncMissingEmbeddings().catch(console.error);
    return { message: 'Tiến trình đồng bộ đang chạy ngầm dưới background, vui lòng kiểm tra log server.' };
  }
}