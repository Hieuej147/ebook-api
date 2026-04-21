import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './module/auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from './module/prisma/prisma.module';
import { UserModule } from './module/user/users.module';
import { BooksModule } from './module/books/books.module';
import { CategoryModule } from './module/category/category.module';
import { CartModule } from './module/cart/cart.module';
import { OrdersModule } from './module/orders/orders.module';
import { PaymentsModule } from './module/payments/payments.module';
import { CloudinaryModule } from './module/cloudinary/cloudinary.module';
import { ChaptersModule } from './module/chapters/chapters.module';
import { ExportDocModule } from './module/export-doc/export-doc.module';
import { StatsModule } from './module/stats/stats.module';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { EbedingModule } from './module/embeding/embeding.module';
import { CopilotkitModule } from './module/copilotkit/copilotkit.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');

        if (!redisUrl) {
          console.warn('⚠️ REDIS_URL not found, using in-memory cache');
          return { ttl: 5 * 60 * 1000 };
        }

        console.log('✅ Connecting to Redis:', redisUrl);

        return {
          stores: [new KeyvRedis(redisUrl)],
          ttl: 5 * 60 * 1000,
        } as any;
      },
    }),

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
    ExportDocModule,
    StatsModule,
    EbedingModule,
    CopilotkitModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
