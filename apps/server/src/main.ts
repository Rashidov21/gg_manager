import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import type { Env } from './env';
import { TelegramExceptionFilter } from './telegram/telegram-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.useWebSocketAdapter(new WsAdapter(app));

  const exceptionFilter = app.get(TelegramExceptionFilter);
  app.useGlobalFilters(exceptionFilter);

  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });

  await app.listen(port);
}

void bootstrap();
