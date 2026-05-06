import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      }),
    }),
  ],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule implements OnModuleInit {
  constructor(private readonly auth: AuthService) {}

  async onModuleInit(): Promise<void> {
    await this.auth.createOperatorIfMissing('owner', 'owner123', 'OWNER');
    await this.auth.createOperatorIfMissing('admin', 'admin123', 'ADMIN');
    await this.auth.createOperatorIfMissing('operator', 'operator123', 'OPERATOR');
  }
}
