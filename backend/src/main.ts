import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";

import helmet from "helmet";

import { AppModule } from "./app.module";

import { ConfigService } from "@nestjs/config";

async function bootstrap() {
  /**
   * Create NestJS application.
   */
  const app = await NestFactory.create(AppModule);

  /**
   * Read environment configuration.
   */
  const config = app.get(ConfigService);

  /**
   * All backend APIs will use:
   *
   * http://localhost:3000/api/...
   */
  app.setGlobalPrefix("api");

  /**
   * Security headers.
   */
  app.use(helmet());

  /**
   * Frontend CORS configuration.
   */
  app.enableCors({
    origin: config.get("CORS_ORIGIN") || "http://localhost:5173",
  });

  /**
   * Global request validation.
   *
   * whitelist:
   * Removes properties that are not
   * defined in DTOs.
   *
   * transform:
   * Automatically transforms request
   * values according to DTO definitions.
   *
   * forbidNonWhitelisted:
   * Rejects unexpected request properties.
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  /**
   * Start backend server.
   */
  await app.listen(Number(config.get("PORT") || 3000));
}

bootstrap();
