import { PickType } from '@nestjs/swagger';
import { CategoryResponseDto } from '../../category/dto';

export class CategoryLookupDto extends PickType(CategoryResponseDto, [
  'id',
  'name',
  'slug',
]) {}
