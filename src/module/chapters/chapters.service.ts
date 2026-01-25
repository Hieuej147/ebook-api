import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChaptersDto, UpdateChapterDto } from './dto';
import { ChapterResponse } from './dto/chapter-res.dto';
import { Chapters } from '@prisma/client';

@Injectable()
export class ChaptersService {
  constructor(private prisma: PrismaService) {}
  // create chapter
  async createChapter(
    data: CreateChaptersDto,
  ): Promise<ChapterResponse | ChapterResponse[]> {
    const { chapters } = data;

    return this.prisma.$transaction(async (txt) => {
      const results: ChapterResponse[] = [];
      for (const dto of chapters) {
        const existingChapter = await txt.chapters.findFirst({
          where: {
            bookId: dto.bookId,
            chapterNumber: dto.chapterNumber,
          },
        });
        if (existingChapter) {
          throw new ConflictException(
            `ChapterNumber ${dto.chapterNumber} of bookId ${dto.bookId} already exists`,
          );
        }
        try {
          const chapter = await txt.chapters.create({
            data: { ...dto },
          });
          results.push(this.formatChapter(chapter));
        } catch (error) {
          throw new BadRequestException(
            `Cannot create chapter ${dto.chapterNumber}. Please try again!`,
          );
        }
      }
      return results.length > 1 ? results : results[0];
    });
  }
  // update chapter of book
  async updateChapter(
    id: string,
    updateDto: UpdateChapterDto,
  ): Promise<ChapterResponse> {
    // Bạn nên dùng UpdateChapterDto
    await this.getChapterById(id); // Kiểm tra tồn tại
    if (updateDto.chapterNumber && updateDto.bookId) {
      const existing = await this.prisma.chapters.findFirst({
        where: {
          bookId: updateDto.bookId,
          chapterNumber: updateDto.chapterNumber,
          NOT: { id }, // unless myself
        },
      });
      if (existing) {
        throw new ConflictException(
          `ChapterNumber ${updateDto.chapterNumber} already in this book.`,
        );
      }
    }

    const updated = await this.prisma.chapters.update({
      where: { id },
      data: { ...updateDto },
    });

    return this.formatChapter(updated);
  }

  //delete chapter
  async removeChapter(id: string) {
    await this.getChapterById(id);

    await this.prisma.chapters.delete({
      where: { id },
    });

    return { message: `Deleted chapter ID: ${id}` };
  }
  // get chapter of book
  async getChaptersByBookId(bookId: string) {
    const chapters = await this.prisma.chapters.findMany({
      where: { bookId },
      orderBy: { chapterNumber: 'asc' },
    });

    return chapters.map((c) => this.formatChapter(c));
  }
  // get chapter id
  async getChapterById(id: string) {
    const chapter = await this.prisma.chapters.findUnique({
      where: { id },
    });

    if (!chapter) {
      throw new ConflictException(`Not found ID ${id}`);
    }

    return this.formatChapter(chapter);
  }

  private formatChapter(chapter: Chapters): ChapterResponse {
    return {
      id: chapter.id,
      title: chapter.title,
      chapterNumber: Number(chapter.chapterNumber),
      content: chapter.content,
      bookId: chapter.bookId,
      description: chapter.description,
      createdAt: chapter.createdAt,
      updatedAt: chapter.updatedAt,
    };
  }
}
