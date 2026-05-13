import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { ClientConnectionService } from './client-connection.service';
import { ClientGateway } from './client.gateway';
import { ClientHealthService } from './client-health.service';
import { ClientKioskController } from './client-kiosk.controller';
import { ClientKioskService } from './client-kiosk.service';
import { CommandTrackerService } from './command-tracker.service';

@Module({
  imports: [TelegramModule],
  controllers: [ClientKioskController],
  providers: [
    ClientGateway,
    ClientConnectionService,
    ClientHealthService,
    ClientKioskService,
    CommandTrackerService,
  ],
  exports: [ClientConnectionService, CommandTrackerService],
})
export class ClientWsModule {}
