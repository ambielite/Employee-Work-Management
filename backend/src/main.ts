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

  const productionFrontendUrl =
    config.get<string>("CORS_ORIGIN") || "http://localhost:5173";

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header (e.g. server-to-server).
      if (!origin) {
        return callback(null, true);
      }

      let isAllowed = origin === productionFrontendUrl;

      try {
        const url = new URL(origin);

        // Allow local development.
        if (url.origin === "http://localhost:5173") {
          isAllowed = true;
        }

        // Allow HTTPS Vercel preview deployments for this project.
        if (
          url.protocol === "https:" &&
          url.hostname.endsWith("-ai-bpo-demo.vercel.app") &&
          url.hostname.startsWith("employee-work-management-")
        ) {
          isAllowed = true;
        }
      } catch {
        isAllowed = false;
      }

      if (isAllowed) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"), false);
    },
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
