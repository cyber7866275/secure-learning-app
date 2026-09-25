import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  // Explicit body limits (Stage 7): uploads go straight to object storage via
  // presigned URLs, so the API never needs large bodies. 256kb comfortably
  // covers the 200-event analytics batches.
  app.use(json({ limit: '256kb' }));
  app.use(urlencoded({ extended: true, limit: '256kb' }));
  const corsOrigin = config.get<string>('corsOrigin');
  app.enableCors({
    // '*' can't be combined with credentials; reflect the origin instead.
    origin: corsOrigin === '*' ? true : corsOrigin?.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = config.getOrThrow<number>('port');
  await app.listen(port);
  console.log(`SecureLearn API listening on port ${port}`);
}
bootstrap();
