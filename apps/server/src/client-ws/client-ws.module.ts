import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { ClientConnectionService } from './client-connection.service';
import { ClientGateway } from './client.gateway';
import { ClientHealthService } from './client-health.service';
import { CommandTrackerService } from './command-tracker.service';

@Module({
  imports: [TelegramModule],
  providers: [ClientGateway, ClientConnectionService, ClientHealthService, CommandTrackerService],
  exports: [ClientConnectionService, CommandTrackerService],
})
export class ClientWsModule {}
