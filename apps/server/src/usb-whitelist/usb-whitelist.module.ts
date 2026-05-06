import { Module } from '@nestjs/common';
import { UsbWhitelistController } from './usb-whitelist.controller';

@Module({
  controllers: [UsbWhitelistController],
})
export class UsbWhitelistModule {}
