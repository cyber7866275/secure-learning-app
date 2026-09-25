import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { IntegrityModule } from '../integrity/integrity.module';
import { SettingsModule } from '../settings/settings.module';
import { TokensModule } from '../tokens/tokens.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DevOtpProvider } from './otp/dev-otp.provider';
import { OTP_PROVIDER } from './otp/otp-provider.interface';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [TokensModule, DevicesModule, SettingsModule, IntegrityModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // Stage 1: dev provider logs OTPs to the console.
    // Production: swap for an MSG91/Firebase implementation of OtpProvider.
    { provide: OTP_PROVIDER, useClass: DevOtpProvider },
  ],
})
export class AuthModule {}
