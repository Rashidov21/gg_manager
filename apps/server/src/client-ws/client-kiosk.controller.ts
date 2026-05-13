import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { kioskActiveSessionBodySchema } from './client-kiosk.dto';
import { ClientKioskService } from './client-kiosk.service';

@Controller('client/kiosk')
export class ClientKioskController {
  constructor(private readonly kiosk: ClientKioskService) {}

  /** Public kiosk: validate PIN and return live balance + session end time for this PC. */
  @Post('active-session')
  async activeSession(@Body() body: unknown) {
    const parsed = kioskActiveSessionBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.kiosk.getActiveSession(parsed.data);
  }
}
