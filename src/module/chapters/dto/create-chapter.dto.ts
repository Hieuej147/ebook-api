import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateChapterDto {
  @ApiProperty({
    description: 'The title of the chapter',
    example: 'Chapter 1: The Journey Begins',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'A brief summary or introduction of the chapter content',
    example: 'In this chapter, the protagonist discovers an ancient map...',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'The full text content of the chapter',
    example: 'Once upon a time, in a land far away...',
    required: false,
  })
  @IsString()
  @IsOptional()
  content?: string;
  @ApiProperty({
    description: 'The order of the chapter within the book',
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  chapterNumber: number;

  @ApiProperty({
    description: 'The unique UUID of the book this chapter belongs to',
    example: '0bd1dfb5-420d-4a53-9b5f-e8757f364588',
  })
  @IsNotEmpty()
  @IsString()
  bookId: string;
}
export class CreateChaptersDto {
  @ApiProperty({
    type: [CreateChapterDto],
    description: 'List of chapter objects to create',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChapterDto)
  chapters: CreateChapterDto[];
}
