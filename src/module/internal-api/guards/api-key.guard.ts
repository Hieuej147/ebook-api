import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const configuredKey = process.env.INTERNAL_API_KEY;

    if (!configuredKey) {
      throw new UnauthorizedException('Internal API key not configured');
    }

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-internal-api-key'];

    if (!apiKey || apiKey !== configuredKey) {
      throw new UnauthorizedException('Invalid internal API key');
    }

    return true;
  }
}