import type { Tariff, TariffType } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export type PricingQuote = {
  tariffId: string;
  tariffType: TariffType;
  tariffName: string;
  minutes: number;
  price: Decimal;
  reason: string;
};

export type PricingContext = {
  zone?: string | undefined;
  startedAt: Date;
  requestedMinutes: number;
};

export type TariffWithMeta = Tariff & {
  startHour: number | null;
  endHour: number | null;
  zone: string | null;
};

