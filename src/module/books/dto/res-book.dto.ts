// Product response

import { ApiProperty } from '@nestjs/swagger';

export class BookResponseDto {
  @ApiProperty({
    description: 'Book ID',
    example: '46545646sds-4584s68sd-4654684sd',
  })
  id: string;

  @ApiProperty({
    description: 'Book name',
    example: 'Journey to the Center of the Earth',
  })
  title: string;

  @ApiProperty({
    description: 'The subtitle of the book (optional)',
    example: 'A classic science fiction novel',
    required: false,
  })
  subtitle: string | null;

  @ApiProperty({
    description: 'The name of the author',
    example: 'Jules Verne',
  })
  author: string;

  @ApiProperty({
    description: 'Book description',
    example: 'A captivating tale of adventure and discovery',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'Book price',
    example: 99.99,
  })
  price: number;

  @ApiProperty({
    description: 'Book stock',
    example: 100,
  })
  stock: number;

  @ApiProperty({
    description: 'Stock keeping Unit',
    example: 'JV-journey-to-the-center-earth',
  })
  sku: string;

  @ApiProperty({
    description: 'book image url',
    example: 'https://example.com/image.jpg',
  })
  imageUrl: string | null;

  @ApiProperty({
    description: 'Book category',
    example: 'Fiction',
  })
  category: string | null;

  @ApiProperty({
    description: 'Current publishing status of the book',
    example: 'DRAFT'
  })
  status: 'DRAFT' | 'PUBLISHED';

  @ApiProperty({
    description: 'Product availability status',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Creation timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'last update timestamp',
  })
  updatedAt: Date;
}
