import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';

/**
 * Second layer after JwtAuthGuard for user routes: re-checks the account in
 * the DB on every request so a blocked / expired / access-revoked user loses
 * access immediately, not when their 15-min access token expires.
 * Attaches the full user row as req.authUser.
 */
@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const payload = req.user as JwtPayload | undefined;

    if (!payload || payload.type !== 'user') {
      throw new ForbiddenException('User access required');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) throw new UnauthorizedException('User not found');
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Account is blocked');
    if (user.accessExpiresAt && user.accessExpiresAt < new Date()) {
      throw new ForbiddenException('Account access has expired');
    }

    req.authUser = user;
    return true;
  }
}
