import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface ThreadRequestContext {
  userId: string;
  role: string;
  authorization?: string;
}

@Injectable()
export class ThreadRequestContextService {
  private readonly storage = new AsyncLocalStorage<ThreadRequestContext>();

  run<T>(context: ThreadRequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  require(): ThreadRequestContext {
    const context = this.storage.getStore();
    if (!context) {
      throw new UnauthorizedException('Thread request context is unavailable');
    }
    return context;
  }
}
