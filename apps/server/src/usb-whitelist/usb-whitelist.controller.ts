import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('usb-whitelist')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsbWhitelistController {
  @Get()
  @Roles('OWNER', 'ADMIN')
  list() {
    return {
      prefixes: ['USB\\VID_046D&PID_C52B'],
    };
  }
}
