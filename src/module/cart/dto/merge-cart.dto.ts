// src/cart/dto/merge-cart.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsNumber } from 'class-validator';

export class CartItemDto {
  @ApiProperty()
  @IsString()
  bookId: string;

  @ApiProperty()
  @IsNumber()
  quantity: number;
}

export class MergeCartDto {
  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  items: CartItemDto[];
}