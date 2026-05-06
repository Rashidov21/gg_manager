import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientWsModule } from '../client-ws/client-ws.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AdminGateway } from './admin.gateway';

@Module({
  imports: [AuthModule, SessionsModule, ClientWsModule],
  providers: [AdminGateway],
})
export class AdminWsModule {}

