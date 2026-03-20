// stats/stats.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { StatsService } from './stats.service';
import {
  OverviewStatsDto,
  RevenueStatsDto,
  UserStatsDto,
  OrderStatsDto,
  BookStatsDto,
} from './dto/stats-res.dto';

type Period = 'today' | 'week' | 'month' | 'year';

@ApiTags('Stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Overview statistics (revenue + users + orders + books)',
  })
  @ApiQuery({
    name: 'period',
    enum: ['today', 'week', 'month', 'year'],
    required: false,
  })
  @ApiResponse({ status: 200, type: OverviewStatsDto })
  getOverview(
    @Query('period') period: Period = 'month',
  ): Promise<OverviewStatsDto> {
    return this.statsService.getOverview(period);
  }

  @Get('revenue')
  @ApiOperation({
    summary: 'Revenue statistics, top-selling books, and orders by status',
  })
  @ApiQuery({
    name: 'period',
    enum: ['today', 'week', 'month', 'year'],
    required: false,
  })
  @ApiResponse({ status: 200, type: RevenueStatsDto })
  getRevenue(
    @Query('period') period: Period = 'month',
  ): Promise<RevenueStatsDto> {
    return this.statsService.getRevenueStats(period);
  }

  @Get('users')
  @ApiOperation({
    summary: 'User statistics: new users, active buyers, NORMAL vs PREMIUM',
  })
  @ApiQuery({
    name: 'period',
    enum: ['today', 'week', 'month', 'year'],
    required: false,
  })
  @ApiResponse({ status: 200, type: UserStatsDto })
  getUsers(@Query('period') period: Period = 'month'): Promise<UserStatsDto> {
    return this.statsService.getUserStats(period);
  }

  @Get('orders')
  @ApiOperation({
    summary: 'Order statistics: completion rate and average order value',
  })
  @ApiQuery({
    name: 'period',
    enum: ['today', 'week', 'month', 'year'],
    required: false,
  })
  @ApiResponse({ status: 200, type: OrderStatsDto })
  getOrders(@Query('period') period: Period = 'month'): Promise<OrderStatsDto> {
    return this.statsService.getOrderStats(period);
  }

  @Get('books')
  @ApiOperation({
    summary:
      'Book statistics: DRAFT/PUBLISHED, out of stock, category distribution',
  })
  @ApiResponse({ status: 200, type: BookStatsDto })
  getBooks(): Promise<BookStatsDto> {
    return this.statsService.getBookStats();
  }

  @Get('revenue/chart')
  @ApiOperation({ summary: 'Revenue chart data over time' })
  @ApiQuery({
    name: 'period',
    enum: ['today', 'week', 'month', 'year'],
    required: false,
  })
  getRevenueChart(@Query('period') period: Period = 'month') {
    return this.statsService.getRevenueChart(period);
  }

  @Get('users/chart')
  @ApiOperation({ summary: 'New users chart data over time' })
  @ApiQuery({
    name: 'period',
    enum: ['today', 'week', 'month', 'year'],
    required: false,
  })
  getUserChart(@Query('period') period: Period = 'month') {
    return this.statsService.getUserChart(period);
  }

  @Get('orders/chart')
  @ApiOperation({ summary: 'Orders chart data over time' })
  @ApiQuery({
    name: 'period',
    enum: ['today', 'week', 'month', 'year'],
    required: false,
  })
  getOrderChart(@Query('period') period: Period = 'month') {
    return this.statsService.getOrderChart(period);
  }

  @Get('books/chart')
  @ApiOperation({ summary: 'New books chart data over time' })
  @ApiQuery({
    name: 'period',
    enum: ['today', 'week', 'month', 'year'],
    required: false,
  })
  getBookChart(@Query('period') period: Period = 'month') {
    return this.statsService.getBookChart(period);
  }
}
