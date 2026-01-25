//create category response
import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'The unique identifier of the category (UUID)',
  })
  id: string;

  @ApiProperty({
    example: 'Science Fiction',
    description: 'The name of the category',
  })
  name: string;

  @ApiProperty({
    example:
      'Books about futuristic science and technology, space exploration, and time travel.',
    description: 'A detailed description of the category',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    example: 'science-fiction',
    description: 'The URL-friendly slug for the category',
  })
  slug: string;

  @ApiProperty({
    example: 'https://example.com/images/categories/sci-fi-banner.jpg',
    description: 'URL of the category image or banner',
    nullable: true,
  })
  imageUrl: string | null;

  @ApiProperty({
    example: true,
    description: 'Status indicating if the category is visible to customers',
  })
  isActive: boolean;

  @ApiProperty({
    example: 124,
    description: 'The total number of books belonging to this category',
  })
  bookCount: number;

  @ApiProperty({
    example: '2026-01-18T12:00:00Z',
    description: 'The date and time when the category was created',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2026-01-18T15:30:00Z',
    description: 'The date and time when the category was last updated',
  })
  updatedAt: Date;
}
