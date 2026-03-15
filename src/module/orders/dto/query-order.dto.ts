import { Type } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export class QueryOrderDto {
  @IsOptional()
  @IsString()
  userId?: string;
  
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @IsOptional()
  @Type(() => String)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
