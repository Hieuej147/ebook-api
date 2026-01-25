import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

// Defining enum to match Prisma schema and for Swagger documentation
enum BookStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

export class CreateBookDto {
  @ApiProperty({
    description: 'The title of the book',
    example: 'Journey to the Center of the Earth',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({
    description: 'The subtitle of the book (optional)',
    example: 'A classic science fiction novel',
    required: false,
  })
  @IsString()
  @IsOptional()
  subtitle?: string;

  @ApiProperty({
    description: 'The name of the author',
    example: 'Jules Verne',
  })
  @IsString()
  @IsNotEmpty()
  author: string;

  @ApiProperty({
    description: 'Detailed description of the book content',
    example: 'An adventurous story about an expedition to the Earth core...',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Book price in USD',
    example: 19.99,
    minimum: 0,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  price: number;

  @ApiProperty({
    description: 'Available quantity in stock',
    example: 100,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  stock: number;

  @ApiProperty({
    description: 'Stock Keeping Unit (SKU) - must be unique',
    example: 'BK-JV-001',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  sku: string;

  @ApiProperty({
    type: 'string',
    format: 'binary',
    required: false,
    description: 'Upload a new book cover image (jpg, png, gif)',
  })
  @IsOptional()
  image?: any;
  @ApiProperty({
    description: 'The unique ID of the category this book belongs to',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({
    description: 'Current publishing status of the book',
    enum: BookStatus,
    default: BookStatus.DRAFT,
    example: BookStatus.DRAFT,
  })
  @IsEnum(BookStatus)
  @IsOptional()
  status: BookStatus;

  @ApiProperty({
    description:
      'Visibility status - whether the book is available for purchase',
    example: true,
    default: true,
    required: false,
  })
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
