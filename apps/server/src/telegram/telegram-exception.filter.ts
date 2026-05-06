import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { TelegramService } from './telegram.service';

@Catch()
export class TelegramExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(TelegramExceptionFilter.name);

  constructor(private readonly telegram: TelegramService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: unknown = { statusCode: status, message: 'Internal server error' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      body = exception.getResponse();
    } else if (exception instanceof Error) {
      body = { statusCode: status, message: exception.message };
    }

    if (status >= 500) {
      const detail =
        exception instanceof Error
          ? `${exception.name}: ${exception.message}`
          : String(exception);
      this.logger.error(`Unhandled ${status} ${detail}`);
      void this.telegram.sendServerAlert(`HTTP ${status} ${detail}`);
    }

    if (response && typeof response.status === 'function') {
      response.status(status).json(body);
    }
  }
}
