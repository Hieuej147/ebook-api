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
    summary: 'Tổng quan thống kê (doanh thu + users + đơn hàng + sách)',
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
    summary: 'Thống kê doanh thu, top sách bán chạy, đơn hàng theo trạng thái',
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
    summary: 'Thống kê người dùng mới, active buyers, NORMAL vs PREMIUM',
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
    summary: 'Thống kê đơn hàng, completion rate, avg order value',
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
    summary: 'Thống kê sách DRAFT/PUBLISHED, hết hàng, phân bổ category',
  })
  @ApiResponse({ status: 200, type: BookStatsDto })
  getBooks(): Promise<BookStatsDto> {
    return this.statsService.getBookStats();
  }

  @Get('revenue/chart')
  @ApiOperation({ summary: 'Chart data doanh thu theo thời gian' })
  @ApiQuery({
    name: 'period',
    enum: ['today', 'week', 'month', 'year'],
    required: false,
  })
  getRevenueChart(@Query('period') period: Period = 'month') {
    return this.statsService.getRevenueChart(period);
  }

  @Get('users/chart')
  @ApiOperation({ summary: 'Chart data users mới theo thời gian' })
  @ApiQuery({
    name: 'period',
    enum: ['today', 'week', 'month', 'year'],
    required: false,
  })
  getUserChart(@Query('period') period: Period = 'month') {
    return this.statsService.getUserChart(period);
  }

  @Get('orders/chart')
  @ApiOperation({ summary: 'Chart data đơn hàng theo thời gian' })
  @ApiQuery({
    name: 'period',
    enum: ['today', 'week', 'month', 'year'],
    required: false,
  })
  getOrderChart(@Query('period') period: Period = 'month') {
    return this.statsService.getOrderChart(period);
  }
  @Get('books/chart')
  @ApiOperation({ summary: 'Chart data sách mới theo thời gian' })
  @ApiQuery({
    name: 'period',
    enum: ['today', 'week', 'month', 'year'],
    required: false,
  })
  getBookChart(@Query('period') period: Period = 'month') {
    return this.statsService.getBookChart(period);
  }
}
