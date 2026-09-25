/**
 * OTP delivery abstraction.
 *
 * Stage 1 ships a DEV provider that logs the OTP to the server console so the
 * curl test flow works without an SMS account.
 *
 * For production, implement this interface with MSG91 (India, cheapest) or
 * Firebase Phone Auth and swap the provider in AuthModule:
 *
 *   // providers: [
 *   //   { provide: OTP_PROVIDER, useClass: Msg91OtpProvider },
 *   // ]
 *
 * The rest of the auth flow (hashing, attempts, cooldown, expiry) is
 * provider-agnostic and does not change.
 */
export interface OtpProvider {
  sendOtp(phone: string, otp: string): Promise<void>;
}

export const OTP_PROVIDER = Symbol('OTP_PROVIDER');
