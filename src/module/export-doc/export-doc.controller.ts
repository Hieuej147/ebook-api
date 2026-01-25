import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { BooksService } from '../books/books.service';
import { ExportDocService } from './export-doc.service';
import { type Response } from 'express';
import { JwtStrategy } from '../auth/strategies';
import { Role } from '@prisma/client';
import { Roles } from 'src/common/decorator/roles.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller('export-doc')
// @UseGuards(JwtStrategy)
// @Roles(Role.ADMIN)
@ApiTags('Export Doc')
// @ApiBearerAuth('JWT-auth')
export class ExportDocController {
  constructor(
    private bookService: BooksService,
    private exportDocService: ExportDocService,
  ) {}
  @Get(':id/doc')
  async exportBook(@Param('id') id: string, @Res() res: Response) {
    const book = await this.bookService.findOne(id); // Lấy info để lấy title làm tên file
    const buffer = await this.exportDocService.exportDoc(id);

    // Thiết lập các Header như trong ảnh Screenshot 4 của bạn
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    // Clean tên file: xóa ký tự đặc biệt để tránh lỗi header
    const safeTitle = book.title.replace(/[^a-zA-Z0-9]/g, '_');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeTitle}.docx"`,
    );

    res.setHeader('Content-Length', buffer.length);

    // Gửi dữ liệu nhị phân về client
    res.send(buffer);
  }
  @Get(':id/pdf')
  async exportBookPdf(@Param('id') id: string, @Res() res: Response) {
    try {
      const book = await this.bookService.findOne(id);
      if (!book) {
        throw new NotFoundException('Book not found');
      }

      const buffer = await this.exportDocService.exportPdf(id);

      // CHỈ thiết lập headers khi đã có buffer thành công
      const safeTitle = book.title.replace(/[^a-zA-Z0-9]/g, '_');

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeTitle}.pdf"`,
        'Content-Length': buffer.length,
      });

      // Gửi file duy nhất 1 lần ở đây
      res.send(buffer);
    } catch (error) {
      console.error('PDF Export Error:', error);

      // CHỈ gửi lỗi JSON nếu headers chưa được gửi đi
      if (!res.headersSent) {
        res.status(500).json({
          message: 'Server error during PDF export',
          error: error.message,
        });
      }
    }
  }
}
