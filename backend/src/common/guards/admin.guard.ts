import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';

/** Allows only admin access tokens (issued by /auth/admin/login). */
@Injectable()
export class AdminGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(err: any, user: any): TUser {
    if (err || !user) {
      throw err instanceof Error ? err : new ForbiddenException('Authentication required');
    }
    const payload = user as JwtPayload;
    if (payload.type !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return user as TUser;
  }
}
