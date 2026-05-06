import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PromoService } from './promo.service';

@Module({
  providers: [BillingService, PromoService],
  controllers: [BillingController],
  exports: [BillingService, PromoService],
})
export class BillingModule {}
