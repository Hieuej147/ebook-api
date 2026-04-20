// src/ai/ai.module.ts
import { Module } from '@nestjs/common';
import { EmbedingService } from './embeding.service';
import { EmbedingController } from './embeding.controller';

@Module({
  controllers: [EmbedingController],
  providers: [EmbedingService],
  exports: [EmbedingService], // QUAN TRỌNG: Phải export thì BooksService mới xài được
})
export class EbedingModule {}
