// DTO for updating an existing product

import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateBookDto } from './create-book.dto';


export class UpdateBookDto extends PartialType(CreateBookDto) {}
