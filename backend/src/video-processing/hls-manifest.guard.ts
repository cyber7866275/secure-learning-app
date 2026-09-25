import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActiveUserGuard } from '../common/guards/active-user.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dual-mode guard for GET /videos/:id/manifest.
 *
 * - ?variant=&token= present -> allow through; the HLS token is verified and
 *   every check re-run inside HlsManifestService.serveVariant(). ExoPlayer's
 *   sub-requests cannot carry the Authorization header, hence the token.
 * - otherwise -> standard JWT + active-user checks (master playlist request).
 */
@Injectable()
export class HlsManifestGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (req.query?.variant && req.query?.token) return true;

    const jwtOk = await new JwtAuthGuard(this.reflector).canActivate(context);
    if (!jwtOk) return false;
    return new ActiveUserGuard(this.prisma).canActivate(context);
  }
}
