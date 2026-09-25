import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  /** user id or admin id */
  userId: string;
  type: 'user' | 'admin';
  deviceId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwtAccessSecret'),
    });
  }

  async validate(payload: { sub: string; type: 'user' | 'admin'; deviceId?: string }): Promise<JwtPayload> {
    return { userId: payload.sub, type: payload.type, deviceId: payload.deviceId };
  }
}
