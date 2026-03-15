import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { type Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, PaymentStatus } from '@prisma/client';

type Period = 'today' | 'week' | 'month' | 'year';

// TTL theo period
const CACHE_TTL: Record<Period, number> = {
  today: 2 * 60 * 1000, // 2 phút — thay đổi nhanh
  week: 10 * 60 * 1000, // 10 phút
  month: 15 * 60 * 1000, // 15 phút
  year: 60 * 60 * 1000, // 1 giờ — thay đổi chậm
};

@Injectable()
export class StatsService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  private getDateRange(period: Period): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();
    switch (period) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setDate(start.getDate() - 30);
        break;
      case 'year':
        start.setFullYear(start.getFullYear() - 1);
        break;
    }
    return { start, end };
  }

  // ✅ Helper cache generic
  private async withCache<T>(
    key: string,
    ttl: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.cache.get<T>(key);
    if (cached) {
      console.log(`✅ Cache HIT: ${key}`);
      return cached;
    }
    console.log(`❌ Cache MISS: ${key}`);
    const data = await fn();
    await this.cache.set(key, data, ttl);
    return data;
  }

  async getRevenueStats(period: Period = 'month') {
    return this.withCache(
      `stats:revenue:${period}`,
      CACHE_TTL[period],
      async () => {
        const { start, end } = this.getDateRange(period);
        const diff = end.getTime() - start.getTime();
        const prevStart = new Date(start.getTime() - diff);
        const prevEnd = start;

        const revenueAgg = await this.prisma.payment.aggregate({
          where: {
            status: PaymentStatus.COMPLETED,
            createdAt: { gte: start, lte: end },
          },
          _sum: { amount: true },
          _count: true,
        });

        const prevRevenueAgg = await this.prisma.payment.aggregate({
          where: {
            status: PaymentStatus.COMPLETED,
            createdAt: { gte: prevStart, lte: prevEnd },
          },
          _sum: { amount: true },
        });

        const ordersByStatus = await this.prisma.order.groupBy({
          by: ['status'],
          where: { createdAt: { gte: start, lte: end } },
          _count: { id: true },
          _sum: { totalAmount: true },
        });

        const topBooks = await this.prisma.orderItem.groupBy({
          by: ['bookId'],
          where: {
            order: {
              createdAt: { gte: start, lte: end },
              status: { not: OrderStatus.CANCELLED },
            },
          },
          _sum: { quantity: true, price: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 5,
        });

        const topBooksWithTitle = await Promise.all(
          topBooks.map(async (item) => {
            const book = await this.prisma.book.findUnique({
              where: { id: item.bookId },
              select: { title: true },
            });
            return {
              title: book?.title ?? 'Unknown',
              total_sold: item._sum.quantity ?? 0,
              revenue: Number(item._sum.price ?? 0),
            };
          }),
        );

        const totalRevenue = Number(revenueAgg._sum.amount ?? 0);
        const prevRevenue = Number(prevRevenueAgg._sum.amount ?? 0);

        return {
          period,
          total_revenue: totalRevenue,
          prev_revenue: prevRevenue,
          revenue_change_pct:
            prevRevenue > 0
              ? Math.round(
                  ((totalRevenue - prevRevenue) / prevRevenue) * 1000,
                ) / 10
              : 0,
          total_payments: revenueAgg._count,
          order_stats: Object.fromEntries(
            ordersByStatus.map((o) => [
              o.status,
              { count: o._count.id, total: Number(o._sum.totalAmount ?? 0) },
            ]),
          ),
          top_books: topBooksWithTitle,
        };
      },
    );
  }

  async getUserStats(period: Period = 'month') {
    return this.withCache(
      `stats:users:${period}`,
      CACHE_TTL[period],
      async () => {
        const { start, end } = this.getDateRange(period);
        const [totalUsers, newUsers, customerTypes, activeBuyers] =
          await Promise.all([
            this.prisma.user.count(),
            this.prisma.user.count({
              where: { createdAt: { gte: start, lte: end } },
            }),
            this.prisma.user.groupBy({
              by: ['customerType'],
              _count: { id: true },
            }),
            this.prisma.order.groupBy({
              by: ['userId'],
              where: {
                createdAt: { gte: start, lte: end },
                status: { not: OrderStatus.CANCELLED },
              },
            }),
          ]);

        return {
          period,
          total_users: totalUsers,
          new_users: newUsers,
          active_buyers: activeBuyers.length,
          customer_types: Object.fromEntries(
            customerTypes.map((c) => [c.customerType, c._count.id]),
          ),
        };
      },
    );
  }

  async getOrderStats(period: Period = 'month') {
    return this.withCache(
      `stats:orders:${period}`,
      CACHE_TTL[period],
      async () => {
        const { start, end } = this.getDateRange(period);
        const [ordersByStatus, avgOrder] = await Promise.all([
          this.prisma.order.groupBy({
            by: ['status'],
            where: { createdAt: { gte: start, lte: end } },
            _count: { id: true },
            _sum: { totalAmount: true },
          }),
          this.prisma.order.aggregate({
            where: {
              createdAt: { gte: start, lte: end },
              status: { not: OrderStatus.CANCELLED },
            },
            _avg: { totalAmount: true },
          }),
        ]);

        const totalOrders = ordersByStatus.reduce((s, o) => s + o._count.id, 0);
        const delivered =
          ordersByStatus.find((o) => o.status === OrderStatus.DELIVERED)?._count
            .id ?? 0;

        return {
          period,
          total_orders: totalOrders,
          completion_rate:
            totalOrders > 0
              ? Math.round((delivered / totalOrders) * 1000) / 10
              : 0,
          avg_order_value:
            Math.round(Number(avgOrder._avg.totalAmount ?? 0) * 100) / 100,
          by_status: Object.fromEntries(
            ordersByStatus.map((o) => [
              o.status,
              { count: o._count.id, total: Number(o._sum.totalAmount ?? 0) },
            ]),
          ),
        };
      },
    );
  }

  async getBookStats() {
    return this.withCache(
      `stats:books`,
      15 * 60 * 1000, // 15 phút
      async () => {
        const [booksByStatus, lowStockBooks, byCategory] = await Promise.all([
          this.prisma.book.groupBy({
            by: ['status'],
            where: { deletedAt: null },
            _count: { id: true },
          }),
          this.prisma.book.findMany({
            where: { stock: { lte: 5 }, deletedAt: null, isActive: true },
            select: { title: true, stock: true },
            orderBy: { stock: 'asc' },
            take: 10,
          }),
          this.prisma.book.groupBy({
            by: ['categoryId'],
            where: { deletedAt: null },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
          }),
        ]);

        const categoryIds = byCategory.map((b) => b.categoryId);
        const categories = await this.prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        });

        return {
          by_status: Object.fromEntries(
            booksByStatus.map((b) => [b.status, b._count.id]),
          ),
          low_stock_books: lowStockBooks,
          by_category: Object.fromEntries(
            byCategory.map((b) => {
              const cat = categories.find((c) => c.id === b.categoryId);
              return [cat?.name ?? b.categoryId, b._count.id];
            }),
          ),
        };
      },
    );
  }

  private getChartPoints(period: Period) {
    const { start, end } = this.getDateRange(period);
    const points =
      period === 'today'
        ? 24
        : period === 'week'
          ? 7
          : period === 'month'
            ? 30
            : 12;
    const interval = (end.getTime() - start.getTime()) / points;
    return Array.from({ length: points }, (_, i) => ({
      from: new Date(start.getTime() + i * interval),
      to: new Date(start.getTime() + (i + 1) * interval),
    }));
  }

  private getLabel(date: Date, period: Period): string {
    if (period === 'today') return `${date.getHours()}h`;
    if (period === 'year')
      return date.toLocaleString('vi-VN', { month: 'short' });
    return `${date.getDate()}/${date.getMonth() + 1}`;
  }

  async getRevenueChart(period: Period = 'month') {
    return this.withCache(
      `stats:chart:revenue:${period}`,
      CACHE_TTL[period],
      async () => {
        const points = this.getChartPoints(period);
        return Promise.all(
          points.map(async ({ from, to }) => {
            const agg = await this.prisma.payment.aggregate({
              where: {
                status: PaymentStatus.COMPLETED,
                createdAt: { gte: from, lte: to },
              },
              _sum: { amount: true },
            });
            return {
              date: this.getLabel(from, period),
              value: Number(agg._sum.amount ?? 0),
            };
          }),
        );
      },
    );
  }

  async getUserChart(period: Period = 'month') {
    return this.withCache(
      `stats:chart:users:${period}`,
      CACHE_TTL[period],
      async () => {
        const points = this.getChartPoints(period);
        return Promise.all(
          points.map(async ({ from, to }) => {
            const value = await this.prisma.user.count({
              where: { createdAt: { gte: from, lte: to } },
            });
            return { date: this.getLabel(from, period), value };
          }),
        );
      },
    );
  }

  async getOrderChart(period: Period = 'month') {
    return this.withCache(
      `stats:chart:orders:${period}`,
      CACHE_TTL[period],
      async () => {
        const points = this.getChartPoints(period);
        return Promise.all(
          points.map(async ({ from, to }) => {
            const value = await this.prisma.order.count({
              where: { createdAt: { gte: from, lte: to } },
            });
            return { date: this.getLabel(from, period), value };
          }),
        );
      },
    );
  }

  async getBookChart(period: Period = 'month') {
    return this.withCache(
      `stats:chart:books:${period}`,
      CACHE_TTL[period],
      async () => {
        const points = this.getChartPoints(period);
        return Promise.all(
          points.map(async ({ from, to }) => {
            const value = await this.prisma.book.count({
              where: { createdAt: { gte: from, lte: to }, deletedAt: null },
            });
            return { date: this.getLabel(from, period), value };
          }),
        );
      },
    );
  }

  async getOverview(period: Period = 'month') {
    return this.withCache(
      `stats:overview:${period}`,
      CACHE_TTL[period],
      async () => {
        const [revenue, users, orders, books] = await Promise.all([
          this.getRevenueStats(period),
          this.getUserStats(period),
          this.getOrderStats(period),
          this.getBookStats(),
        ]);
        return { revenue, users, orders, books };
      },
    );
  }
}
