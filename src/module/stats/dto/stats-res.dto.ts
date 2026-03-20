import { ApiProperty } from '@nestjs/swagger';

// ============================
// SHARED
// ============================
export class BookSoldDto {
  @ApiProperty({ example: 'Game of Thrones' })
  title: string;

  @ApiProperty({ example: 10 })
  total_sold: number;

  @ApiProperty({ example: 1839250 })
  revenue: number;
}

export class OrderStatusDetailDto {
  @ApiProperty({ example: 125 })
  count: number;

  @ApiProperty({ example: 99481903 })
  total: number;
}

// ============================
// REVENUE
// ============================
export class RevenueStatsDto {
  @ApiProperty({ example: 'month', enum: ['today', 'week', 'month', 'year'] })
  period: string;

  @ApiProperty({ example: 128408826 })
  total_revenue: number;

  @ApiProperty({ example: 1096947 })
  prev_revenue: number;

  @ApiProperty({
    example: 11606,
    description: 'Percentage change compared to the previous period',
  })
  revenue_change_pct: number;

  @ApiProperty({ example: 158 })
  total_payments: number;

  @ApiProperty({
    description: 'Orders grouped by status',
    example: {
      PENDING: { count: 169, total: 115972613 },
      DELIVERED: { count: 134, total: 114550394 },
      CANCELLED: { count: 125, total: 99481903 },
    },
  })
  order_stats: Record<string, OrderStatusDetailDto>;

  @ApiProperty({ type: [BookSoldDto] })
  top_books: BookSoldDto[];
}

// ============================
// USER
// ============================
export class UserStatsDto {
  @ApiProperty({ example: 'month', enum: ['today', 'week', 'month', 'year'] })
  period: string;

  @ApiProperty({ example: 1000 })
  total_users: number;

  @ApiProperty({ example: 50 })
  new_users: number;

  @ApiProperty({ example: 22 })
  active_buyers: number;

  @ApiProperty({
    description: 'Customer type distribution',
    example: { NORMAL: 492, PREMIUM: 508 },
  })
  customer_types: Record<string, number>;
}

// ============================
// ORDER
// ============================
export class OrderStatsDto {
  @ApiProperty({ example: 'month', enum: ['today', 'week', 'month', 'year'] })
  period: string;

  @ApiProperty({ example: 695 })
  total_orders: number;

  @ApiProperty({
    example: 19.3,
    description: 'Order completion rate (%)',
  })
  completion_rate: number;

  @ApiProperty({ example: 234.5 })
  avg_order_value: number;

  @ApiProperty({
    description: 'Breakdown by order status',
    example: {
      PENDING: { count: 169, total: 115972613 },
      DELIVERED: { count: 134, total: 114550394 },
    },
  })
  by_status: Record<string, OrderStatusDetailDto>;
}

// ============================
// BOOK
// ============================
export class LowStockBookDto {
  @ApiProperty({ example: 'Game of Thrones' })
  title: string;

  @ApiProperty({ example: 3 })
  stock: number;
}

export class BookStatsDto {
  @ApiProperty({
    description: 'Books grouped by status',
    example: { DRAFT: 50, PUBLISHED: 332 },
  })
  by_status: Record<string, number>;

  @ApiProperty({ type: [LowStockBookDto] })
  low_stock_books: LowStockBookDto[];

  @ApiProperty({
    description: 'Category distribution',
    example: { Fiction: 120, Science: 80 },
  })
  by_category: Record<string, number>;
}

// ============================
// OVERVIEW
// ============================
export class OverviewStatsDto {
  @ApiProperty({ type: RevenueStatsDto })
  revenue: RevenueStatsDto;

  @ApiProperty({ type: UserStatsDto })
  users: UserStatsDto;

  @ApiProperty({ type: OrderStatsDto })
  orders: OrderStatsDto;

  @ApiProperty({ type: BookStatsDto })
  books: BookStatsDto;
}
