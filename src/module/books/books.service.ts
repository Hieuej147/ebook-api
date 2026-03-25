import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookResponseDto,
  CreateBookDto,
  QueryBookDto,
  UpdateBookDto,
} from './dto';
import { Book, Category, Prisma } from '@prisma/client';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class BooksService {
  constructor(
    private prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // Create Book
  async create(
    createBookDto: CreateBookDto,
    file?: Express.Multer.File,
  ): Promise<BookResponseDto> {
    const { image, ...rest } = createBookDto;
    let imageUrl = null;
    if (file) {
      const upload = await this.cloudinary.uploadFile(file);
      imageUrl = upload.secure_url;
    }
    const existingSku = await this.prisma.book.findUnique({
      where: { sku: rest.sku },
    });
    if (existingSku) {
      throw new ConflictException(`Book with SKU ${rest.sku} already exist`);
    }

    const book = await this.prisma.book.create({
      data: {
        ...rest,
        imageUrl: imageUrl,
        price: new Prisma.Decimal(createBookDto.price),
      },
      include: {
        category: true,
      },
    });

    return this.formatBook(book);
  }

  // Get book by id
  async findOne(id: string): Promise<BookResponseDto> {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: {
        category: true,
      },
    });
    if (!book) {
      throw new NotFoundException('Book not found');
    }

    return this.formatBook(book);
  }

  // find all for customers
  async findAllForCustomers(queryDto: QueryBookDto) {
    const { search, page = 1, limit = 10, category } = queryDto;

    // 1. Điều kiện mặc định: Chỉ lấy sách "sạch" và đang bật
    const where: Prisma.BookWhereInput = {
      status: 'PUBLISHED', // Chỉ lấy sách đã xuất bản
      isActive: true, // Chỉ lấy sách đang bật
      deletedAt: null, // Không lấy sách đã xóa
      category: {
        isActive: true, // Chỉ lấy sách nếu Danh mục của nó cũng đang bật
      },
      categoryId: category,
    };

    // 3. Tìm kiếm theo từ khóa
    if (search) {
      where.AND = [
        { ...where },
        {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { author: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    // 4. Thực thi truy vấn và phân trang
    const [total, books] = await Promise.all([
      this.prisma.book.count({ where }),
      this.prisma.book.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { category: true }, // Để lấy tên category hiển thị
      }),
    ]);

    return {
      data: books.map((book) => this.formatBook(book)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
  // find all books for admin include deleted
  async findAllForAdminIncludeDel() {
    return this.prisma.book.findMany({
      where: {
        deletedAt: null,
      },
    });
  }
  // Get all book for admin
  async findAll(queryDto: QueryBookDto): Promise<{
    data: BookResponseDto[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const { category, isActive, search, page = 1, limit = 10 } = queryDto;

    const where: Prisma.BookWhereInput = { deletedAt: null }; // create object skip all item deleted

    // find category
    if (category) {
      where.categoryId = category;
    }

    // find isActive true or false
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    // find to follow to title and description
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.book.count({ where }); // count to split page

    const books = await this.prisma.book.findMany({
      where,
      skip: (page - 1) * limit, // skip page
      take: limit, //take limit
      orderBy: { createdAt: 'desc' }, // find new on top
      include: {
        category: true, // take category to show
      },
    });

    return {
      data: books.map((book) => this.formatBook(book)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(
    id: string,
    updateBookDto: UpdateBookDto,
    file?: Express.Multer.File,
  ): Promise<BookResponseDto> {
    const { image, ...rest } = updateBookDto;
    let imageUrl = null;
    const existingBook = await this.prisma.book.findUnique({
      where: { id },
    });
    if (!existingBook) {
      throw new NotFoundException('Book not found');
    }
    if (rest.categoryId) {
      const categoryExists = await this.prisma.category.findUnique({
        where: { id: rest.categoryId },
      });
      if (!categoryExists) throw new NotFoundException('Category not found');
    }

    if (file) {
      const result = await this.cloudinary.uploadFile(file);
      if (!result) throw new BadRequestException('Cloudinary upload failed'); // Tránh lỗi undefined
      imageUrl = result.secure_url;
    }

    if (rest.sku && rest.sku !== existingBook.sku) {
      const skuTaken = await this.prisma.book.findUnique({
        where: { sku: rest.sku },
      });

      if (skuTaken) {
        throw new ConflictException(`Book with SKU ${rest.sku} already exists`);
      }
    }

    const updateData: Prisma.BookUpdateInput = { ...rest };
    if (imageUrl) updateData.imageUrl = imageUrl;
    if (rest.price !== undefined) {
      updateData.price = new Prisma.Decimal(rest.price);
    }

    const updatedBook = await this.prisma.book.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
      },
    });

    return this.formatBook(updatedBook);
  }

  // Update product stock
  async updateStock(id: string, quantity: number): Promise<BookResponseDto> {
    const book = await this.prisma.book.findUnique({
      where: { id },
    });
    if (!book) {
      throw new NotFoundException('Product not found');
    }

    const newStock = book.stock + quantity;

    if (newStock < 0) {
      throw new BadRequestException('Insufficient stock');
    }

    const updatedBook = await this.prisma.book.update({
      where: { id },
      data: { stock: newStock },
      include: {
        category: true,
      },
    });

    return this.formatBook(updatedBook);
  }

  // Remove a product
  async remove(id: string): Promise<{ message: string }> {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: {
        orderItems: true,
        cartItems: true,
      },
    });

    if (!book) {
      throw new NotFoundException('book not found');
    }

    if (book.orderItems.length > 0) {
      throw new BadRequestException(
        'Cannot delete product that is part of existing orders. Consider marking it as inactive only',
      );
    }

    await this.prisma.book.delete({
      where: { id },
    });

    return { message: 'Product deleted successfully' };
  }

  private formatBook(book: Book & { category: Category }): BookResponseDto {
    const {
      id,
      title,
      subtitle,
      author,
      description,
      price,
      stock,
      sku,
      imageUrl,
      status,
      isActive,
      createdAt,
      updatedAt,
    } = book;
    return {
      id,
      title,
      subtitle,
      author,
      description,
      price: Number(price),
      stock,
      sku,
      imageUrl,
      status,
      isActive,
      createdAt,
      updatedAt,
      category: book.category.name,
    };
  }
}
