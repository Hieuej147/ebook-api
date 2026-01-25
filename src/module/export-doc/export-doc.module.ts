import { Module } from '@nestjs/common';
import { ExportDocService } from './export-doc.service';
import { ExportDocController } from './export-doc.controller';
import { BooksModule } from '../books/books.module';
import { ChaptersModule } from '../chapters/chapters.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [BooksModule, ChaptersModule, CloudinaryModule],
  providers: [ExportDocService],
  controllers: [ExportDocController],
})
export class ExportDocModule {}
