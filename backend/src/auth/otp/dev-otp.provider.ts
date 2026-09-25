import { Injectable, Logger } from '@nestjs/common';
import { OtpProvider } from './otp-provider.interface';

/** Dev-only provider: prints the OTP to the server log. NEVER use in prod. */
@Injectable()
export class DevOtpProvider implements OtpProvider {
  private readonly logger = new Logger(DevOtpProvider.name);

  async sendOtp(phone: string, otp: string): Promise<void> {
    this.logger.warn(`[DEV OTP] phone=${phone} otp=${otp}  (swap OtpProvider for MSG91 in production)`);
  }
}
