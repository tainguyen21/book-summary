"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrap = bootstrap;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const platform_fastify_1 = require("@nestjs/platform-fastify");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_fastify_1.FastifyAdapter());
    app.useGlobalPipes(new common_1.ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
    }));
    return app;
}
async function start() {
    const app = await bootstrap();
    const port = Number.parseInt(process.env.PORT ?? "3000", 10);
    await app.listen({ host: "0.0.0.0", port });
}
void start();
