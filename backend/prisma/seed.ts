/**
 * Seed: creates the owner admin account.
 *
 * Credentials come ONLY from the environment — they are never hardcoded:
 *   SEED_ADMIN_EMAIL=owner@example.com SEED_ADMIN_PASSWORD='...' npm run seed
 *
 * Safe to re-run: upserts on email.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';


async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;


  if (!email || !password) {
    throw new Error(
      'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in the environment to run the seed.',
    );
  }
  if (password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters long.');
  }


  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const admin = await prisma.admin.upsert({
      where: { email },
      update: { passwordHash, role: 'OWNER' },
      create: { email, passwordHash, role: 'OWNER' },
    });
    console.log(`Seeded owner admin: ${admin.email} (id=${admin.id})`);


    // Default app settings (admin panel can change them later; the
    // Android app reads them in Stage 4). Only seeds keys that are missing.
    const defaults: Record<string, string> = {
      screenshot_protection: 'true',
      recording_protection: 'true',
      watermark_enabled: 'true',
      default_max_devices: '2',
      device_limit_mode: 'revoke-oldest',
    };
    for (const [key, value] of Object.entries(defaults)) {
      await prisma.appSetting.upsert({
        where: { key },
        update: {},
        create: { key, value },
      });
    }
    console.log('Seeded default app settings');
  } finally {
    await prisma.$disconnect();
  }
}


main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
