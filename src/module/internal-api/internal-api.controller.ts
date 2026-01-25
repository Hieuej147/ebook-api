import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from './guards/api-key.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('internal')
@UseGuards(ApiKeyGuard) // Bảo vệ tất cả các route trong controller này
export class InternalApiController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('user-info/:id')
  async getUserForAgent(@Param('id') id: string) {
    // Chỉ trả về những thông tin cần thiết cho AI, tránh lộ dữ liệu nhạy cảm
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, firstName: true, role: true },
    });
  }

  @Post('process-data')
  async processForAgent(@Body() data: any) {
    // Logic xử lý dữ liệu từ Agent gửi lên
    return { success: true, message: 'Data processed' };
  }
}
