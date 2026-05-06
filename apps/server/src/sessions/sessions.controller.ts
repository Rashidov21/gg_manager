import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt.guard';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionsService } from './sessions.service';
import { extendSessionSchema, startSessionSchema } from './sessions.dto';

@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post('start')
  @Roles('OWNER', 'ADMIN', 'OPERATOR')
  async start(@Body() body: unknown, @Req() req: AuthenticatedRequest): Promise<{ ok: true }> {
    const dto = startSessionSchema.parse(body);
    await this.sessions.startSession({
      ...dto,
      ...(req.user?.id ? { operatorId: req.user.id } : {}),
    });
    return { ok: true };
  }

  @Post('extend')
  @Roles('OWNER', 'ADMIN', 'OPERATOR')
  async extend(@Body() body: unknown, @Req() req: AuthenticatedRequest): Promise<{ ok: true }> {
    const dto = extendSessionSchema.parse(body);
    await this.sessions.extendSession({
      ...dto,
      ...(req.user?.id ? { operatorId: req.user.id } : {}),
    });
    return { ok: true };
  }
}
