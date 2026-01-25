import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './module/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './module/prisma/prisma.module';
import { UserModule } from './module/user/users.module';
import { BooksModule } from './module/books/books.module';
import { CategoryModule } from './module/category/category.module';
import { CartModule } from './module/cart/cart.module';
import { OrdersModule } from './module/orders/orders.module';
import { PaymentsModule } from './module/payments/payments.module';
import { CloudinaryModule } from './module/cloudinary/cloudinary.module';
import { ChaptersModule } from './module/chapters/chapters.module';
import { CopilotkitModule } from './module/copilotkit/copilotkit.module';
import { ExportDocModule } from './module/export-doc/export-doc.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    AuthModule,
    PrismaModule,
    UserModule,
    BooksModule,
    CategoryModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    CloudinaryModule,
    ChaptersModule,
    CopilotkitModule,
    ExportDocModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
