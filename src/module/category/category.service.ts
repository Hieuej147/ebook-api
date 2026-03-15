import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CategoryResponseDto,
  CreateCategoryDto,
  QueryCategoryDto,
  UpdateCategoryDto,
} from './dto';
import { Category, Prisma } from '@prisma/client';
import { CategoryLookupDto } from '../books/dto/category-lookup.dto';

@Injectable()
export class CategoryService {
  constructor(private prisma: PrismaService) {}

  async create(
    createCategoryDto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const { name, slug, ...rest } = createCategoryDto;

    const categorySlug =
      slug ??
      name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');

    const existingCategory = await this.prisma.category.findUnique({
      where: { slug: categorySlug },
    });

    if (existingCategory) {
      throw new Error(
        'Category with this slug already exists: ' + categorySlug,
      );
    }

    const category = await this.prisma.category.create({
      data: {
        name,
        slug: categorySlug,
        ...rest,
      },
    });

    return this.formatCategory(category, 0);
  }

  // Get all categories with optional filters and pagination
  async findAll(queryDto: QueryCategoryDto): Promise<{
    data: CategoryResponseDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { isActive, search, page = 1, limit = 10 } = queryDto;

    const where: Prisma.CategoryWhereInput = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        {
          name: { contains: search, mode: 'insensitive' },
        },
        {
          description: { contains: search, mode: 'insensitive' },
        },
      ];
    }

    const [total, categories] = await Promise.all([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { books: true },
          },
          books: {
            where: { isActive: true },
            select: { id: true },
          },
        },
      }),
    ]);

    return {
      data: categories.map((category) => {
        // Tính toán trực tiếp số lượng active
        const activeCount = category.books.length;
        return this.formatCategory(
          category,
          category._count.books,
          activeCount,
        );
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAllList(): Promise<{ data: CategoryLookupDto[] }> {
    const categoriesList = await this.prisma.category.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
    return {
      // 2. Map trực tiếp, không cần qua formatCategory cồng kềnh
      data: categoriesList.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
      })),
    };
  }

  // Get category by ID
  async findOne(id: string): Promise<CategoryResponseDto> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { books: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return this.formatCategory(category, Number(category._count.books));
  }

  // Get category by slug
  async findBySlug(slug: string): Promise<CategoryResponseDto> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        _count: {
          select: { books: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return this.formatCategory(category, Number(category._count.books));
  }

  // Updatecategory
  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const existingCategory = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      throw new NotFoundException('Category not found');
    }

    if (
      updateCategoryDto.slug &&
      updateCategoryDto.slug !== existingCategory.slug
    ) {
      const slugTaken = await this.prisma.category.findUnique({
        where: { slug: updateCategoryDto.slug },
      });

      if (slugTaken) {
        throw new ConflictException(
          `Category with slug ${updateCategoryDto.slug} already exists`,
        );
      }
    }

    const updatedCategory = await this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
      include: {
        _count: {
          select: { books: true },
        },
      },
    });

    return this.formatCategory(
      updatedCategory,
      Number(updatedCategory._count.books),
    );
  }

  // Remove a catgory
  async remove(id: string): Promise<{ message: string }> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            books: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category._count.books > 0) {
      throw new BadRequestException(
        `Cannot delete category with ${category._count.books} products. Remove or reassign first`,
      );
    }

    await this.prisma.category.delete({
      where: { id },
    });

    return { message: `Category delete successfully` };
  }

  private formatCategory(
    category: Category,
    bookCount: number = 0,
    activeBookCount: number = 0,
  ): CategoryResponseDto {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      slug: category.slug,
      imageUrl: category.imageUrl,
      isActive: category.isActive,
      bookCount,
      activeBookCount,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }
}
