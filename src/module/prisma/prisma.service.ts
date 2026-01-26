import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private config: ConfigService) {
    const pool = new Pool({
      connectionString: config.get('DATABASE_URL'),
    });
    const adapter = new PrismaPg(pool);

    super({
      adapter,
      log:
        config.get('NODE_ENV') === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    console.log('Database connected successfully!');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('Database disconnected!');
  }

  // async cleanDB() {
  //   if (this.config.get('NODE_ENV') === 'production') {
  //     throw new Error('Cannot clean database in production');
  //   }

  //   const models = Reflect.ownKeys(this).filter(
  //     (key) => typeof key === 'string' && !key.startsWith('_'),
  //   );

  //   return Promise.all(
  //     models.map((modelKey) => {
  //       if (typeof modelKey === 'string') {
  //         return this[modelKey].deleteMany();
  //       }
  //     }),
  //   );
  // }
  async cleanDB() {
    if (this.config.get('NODE_ENV') === 'production') {
      throw new Error('Cannot clean database in production');
    }

    const modelKeys = Object.keys(this).filter(
      (key) =>
        typeof this[key] === 'object' &&
        typeof this[key]?.deleteMany === 'function',
    );

    await this.$transaction(modelKeys.map((key) => this[key].deleteMany()));
  }
}
