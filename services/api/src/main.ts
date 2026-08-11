import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { config as loadEnvironment } from "dotenv";
import { resolve } from "node:path";

import { AppModule } from "./app.module";

loadEnvironment({ path: resolve(__dirname, "../../../.env"), quiet: true });

export async function bootstrap(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  return app;
}

async function start(): Promise<void> {
  const app = await bootstrap();
  const port = Number.parseInt(process.env.PORT ?? "3001", 10);

  await app.listen({ host: "0.0.0.0", port });
}

void start();
