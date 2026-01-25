import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ChaptersService } from './chapters.service';
import { CreateChaptersDto, UpdateChapterDto } from './dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorator/roles.decorator';
import { Role } from '@prisma/client';
import { ChapterResponse } from './dto/chapter-res.dto';

@Controller('chapters')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN)
@ApiTags('chapters')
@ApiBearerAuth('JWT-auth')
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  @Get('by-book/:bookId')
  @ApiOperation({ summary: 'Get all chapters of a specific book' })
  @ApiParam({
    name: 'bookId',
    description: 'The UUID of the book',
    example: 'uuid-123',
  })
  @ApiResponse({
    status: 200,
    description: 'Return all chapters of the book.',
    type: [ChapterResponse],
  })
  async getByBook(@Param('bookId') bookId: string) {
    return this.chaptersService.getChaptersByBookId(bookId);
  }

  @Get('one/:id')
  @ApiOperation({ summary: 'Get a single chapter by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the chapter' })
  @ApiResponse({
    status: 200,
    description: 'Return the chapter details.',
    type: ChapterResponse,
  })
  @ApiResponse({ status: 404, description: 'Chapter not found.' })
  async getOne(@Param('id') id: string) {
    return this.chaptersService.getChapterById(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create new chapters',
    description:
      'Allows creating one or multiple chapters for a specific book. Uses a transaction to ensure data integrity.',
  })
  @ApiResponse({
    status: 201,
    description: 'Chapters have been successfully created.',
    type: ChapterResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid data provided.',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Chapter number already exists for this book.',
  })
  async create(@Body() createChaptersDto: CreateChaptersDto) {
    // Calls the transaction-based creation method from the service
    return this.chaptersService.createChapter(createChaptersDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing chapter' })
  @ApiParam({ name: 'id', description: 'The UUID of the chapter to update' })
  @ApiResponse({
    status: 200,
    description: 'The chapter has been successfully updated.',
  })
  @ApiResponse({ status: 404, description: 'Chapter not found.' })
  @ApiResponse({
    status: 409,
    description: 'Chapter number already exists in this book.',
  })
  async update(@Param('id') id: string, @Body() updateDto: UpdateChapterDto) {
    return this.chaptersService.updateChapter(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a chapter' })
  @ApiParam({ name: 'id', description: 'The UUID of the chapter to delete' })
  @ApiResponse({
    status: 200,
    description: 'The chapter has been successfully deleted.',
  })
  @ApiResponse({ status: 404, description: 'Chapter not found.' })
  async remove(@Param('id') id: string) {
    return this.chaptersService.removeChapter(id);
  }
}
