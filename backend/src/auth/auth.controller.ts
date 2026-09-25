import { Body, Controller, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import {
  AdminLoginDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  RequestOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';

/**
 * Public auth routes. Strict per-route rate limits apply on top of the global
 * throttler (OTP and login are the brute-force targets).
 *
 * Stage 7 rate-limit audit (limits are per IP per minute):
 * - otp/request:  3/min  — plus the 60s Redis resend-cooldown in the service
 * - otp/verify:   10/min — plus max 5 attempts per OTP code, then it burns
 * - register:      5/min — account-farming target; tightened from 10
 * - login:        10/min — Argon2id verify cost already slows brute force
 * - refresh:     10/min — tightened from 20; rotation detects reuse anyway
 * - admin/login:   5/min — privileged target; tightened from 10
 * Global buckets: default 120/min, named "auth" 30/min (see app.module.ts).
 */
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 3, ttl: 60_000 } })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  verifyOtp(@Body() dto: VerifyOtpDto, @Ip() ip: string) {
    return this.auth.verifyOtp(dto, ip);
  }

  @Post('register')
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return this.auth.register(dto, ip);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto, ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto);
  }

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  adminLogin(@Body() dto: AdminLoginDto, @Ip() ip: string) {
    return this.auth.adminLogin(dto, ip);
  }
}
