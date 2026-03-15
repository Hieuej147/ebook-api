import { PickType } from '@nestjs/swagger';
import { CategoryResponseDto } from 'src/module/category/dto';

export class CategoryLookupDto extends PickType(CategoryResponseDto, [
  'id',
  'name',
  'slug',
]) {}
