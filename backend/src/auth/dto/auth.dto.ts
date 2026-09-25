import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const PHONE_RE = /^\+[1-9]\d{7,14}$/; // E.164

export class RequestOtpDto {
  @Matches(PHONE_RE, { message: 'phone must be in E.164 format, e.g. +919876543210' })
  phone!: string;
}

export class VerifyOtpDto {
  @Matches(PHONE_RE, { message: 'phone must be in E.164 format' })
  phone!: string;

  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'otp must be 6 digits' })
  otp!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(128)
  deviceFingerprint!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceName?: string;

  /** Optional display name when the OTP login creates the account. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  /**
   * Play Integrity token minted by the Android app (Stage 7). Optional:
   * verified only when the admin enabled enforcement.
   */
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  integrityToken?: string;

  /**
   * Honest self-report from the app's RootBeer check. The server treats this
   * as a *signal* (writes a ROOT_DETECTED alert, may block per settings) —
   * never as proof, since a tampered app can lie. The Play Integrity verdict
   * is the hardware-backed counterpart.
   */
  @IsOptional()
  @IsBoolean()
  rooted?: boolean;
}

export class RegisterDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @Matches(PHONE_RE, { message: 'phone must be in E.164 format' })
  phone!: string;

  @IsOptional()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @IsString()
  @MinLength(4)
  @MaxLength(128)
  deviceFingerprint!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDevices?: number;

  /** Play Integrity token (Stage 7). See VerifyOtpDto. */
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  integrityToken?: string;

  /** RootBeer self-report (Stage 7). See VerifyOtpDto. */
  @IsOptional()
  @IsBoolean()
  rooted?: boolean;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(128)
  deviceFingerprint!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceName?: string;

  /** Play Integrity token (Stage 7). See VerifyOtpDto. */
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  integrityToken?: string;

  /** RootBeer self-report (Stage 7). See VerifyOtpDto. */
  @IsOptional()
  @IsBoolean()
  rooted?: boolean;
}

export class RefreshDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}

export class AdminLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
