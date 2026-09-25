import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';

/**
 * @CurrentUser() -> full JWT payload { userId, type, deviceId }
 * @CurrentUser('userId') -> just that field
 */
export const CurrentUser = createParamDecorator(
  (field: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const user: JwtPayload | undefined = req.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
