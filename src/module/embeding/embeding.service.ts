// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OllamaEmbeddings } from '@langchain/ollama';

@Injectable()
export class EmbedingService {
  private embeddings: OllamaEmbeddings;

  constructor(private prisma: PrismaService) {
    // Khởi tạo model embedding 1 lần duy nhất để dùng chung
    this.embeddings = new OllamaEmbeddings({
      model: 'nomic-embed-text',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    });
  }

  /**
   * Hàm này sẽ tự động tạo vector cho 1 cuốn sách cụ thể
   */
  async embedSingleBook(
    bookId: string,
    title: string,
    author: string,
    description: string | null,
  ) {
    try {
      // 1. Gộp nội dung để AI dễ hiểu ngữ cảnh
      const textToEmbed = `Tiêu đề: ${title}. Tác giả: ${author}. Mô tả: ${description || 'Không có'}`;

      // 2. Gọi Ollama để biến chữ thành mảng số
      const vector = await this.embeddings.embedQuery(textToEmbed);

      // 3. Cập nhật thẳng vào PostgreSQL bằng raw query
      await this.prisma.$executeRawUnsafe(
        `UPDATE books SET embedding = '[${vector.join(',')}]' WHERE id = $1`,
        bookId,
      );

      console.log(`✅ Đã nhúng vector thành công cho sách: ${title}`);
    } catch (error) {
      console.error(`❌ Lỗi nhúng vector cho sách ${title}:`, error);
    }
  }
  async syncMissingEmbeddings() {
    console.log('Bắt đầu quét tìm sách chưa có vector...');

    // 1. Dùng Raw SQL để lấy danh sách các cuốn sách có cột embedding bị rỗng (NULL)
    const booksWithoutVector = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, title, author, description FROM books WHERE embedding IS NULL`,
    );

    if (booksWithoutVector.length === 0) {
      return { message: 'Tuyệt vời! Tất cả sách trong DB đều đã có vector.' };
    }

    console.log(
      `Tìm thấy ${booksWithoutVector.length} cuốn sách cần xử lý. Bắt đầu chạy...`,
    );

    let count = 0;

    // 2. Chạy vòng lặp và tận dụng lại hàm embedSingleBook ở trên
    for (const book of booksWithoutVector) {
      // Đợi xử lý xong từng cuốn để tránh làm quá tải Ollama local
      await this.embedSingleBook(
        book.id,
        book.title,
        book.author,
        book.description,
      );
      count++;
      console.log(
        `[${count}/${booksWithoutVector.length}] Đã xử lý xong: ${book.title}`,
      );
    }

    return {
      message: 'Hoàn tất đồng bộ dữ liệu cũ!',
      totalSynced: count,
    };
  }
}
