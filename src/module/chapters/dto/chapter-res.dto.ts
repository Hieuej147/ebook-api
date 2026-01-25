import { ApiProperty } from '@nestjs/swagger';

export class ChapterResponse {
  @ApiProperty({
    description: 'Chapter ID',
    example: '46545646sds-4584s68sd-4654684sd',
  })
  id: string;
  @ApiProperty({
    description: 'Book ID',
    example: '46545646sds-4584s68sd-4654684sd',
  })
  bookId: string;
  @ApiProperty({
    description: 'Title chapter',
    example: 'Journey to the Center of the Earth',
  })
  title: string;
  @ApiProperty({
    description: 'Chapter description',
    example: 'A captivating tale of adventure and discovery',
    nullable: true,
  })
  description: string | null;
  @ApiProperty({
    description: 'Chapter content',
    example: 'A captivating tale of adventure and discovery',
    nullable: true,
  })
  content: string | null;
  @ApiProperty({
    description: 'Chapter number',
    example: 1,
  })
  chapterNumber: Number;
  @ApiProperty({
    description: 'Creation timestamp',
  })
  createdAt: Date;
  @ApiProperty({
    description: 'last update timestamp',
  })
  updatedAt: Date;
}
