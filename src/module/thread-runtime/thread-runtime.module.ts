import { Module } from '@nestjs/common';
import { AdminThreadsController } from './admin-threads.controller';
import { PrismaEventStore } from './prisma-event.store';
import { PrismaMessageProjector } from './prisma-message.projector';
import { PrismaThreadStore } from './prisma-thread.store';
import { ThreadRequestContextService } from './thread-request-context.service';
import { ThreadRuntimeController } from './thread-runtime.controller';
import { ThreadRuntimeService } from './thread-runtime.service';
import { OpenAiThreadTitleGenerator } from './openai-thread-title.generator';
import { ThreadsController } from './threads.controller';

@Module({
  controllers: [
    ThreadsController,
    AdminThreadsController,
    ThreadRuntimeController,
  ],
  providers: [
    ThreadRequestContextService,
    PrismaThreadStore,
    PrismaEventStore,
    PrismaMessageProjector,
    OpenAiThreadTitleGenerator,
    ThreadRuntimeService,
  ],
})
export class ThreadRuntimeModule {}
