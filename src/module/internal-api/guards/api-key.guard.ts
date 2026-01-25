import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-internal-api-key']; // Key gửi từ Agent
    
    // So khớp với key trong file .env của NestJS
    if (apiKey !== process.env.INTERNAL_API_KEY) {
      throw new UnauthorizedException('Không có quyền truy cập nội bộ');
    }
    return true;
  }
}