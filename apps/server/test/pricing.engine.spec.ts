import { describe, it, expect } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { quoteBestTariff } from '../src/billing/pricing.engine';

describe('pricing.engine', () => {
  it('prefers cheaper package over hourly', () => {
    const quote = quoteBestTariff(
      [
        { id: 'h', name: 'Hourly', type: 'HOURLY', price: new Prisma.Decimal(10000), minutes: 60, startHour: null, endHour: null, zone: null },
        { id: 'p', name: 'Package3h', type: 'PACKAGE', price: new Prisma.Decimal(25000), minutes: 180, startHour: null, endHour: null, zone: null },
      ] as never,
      { startedAt: new Date('2026-01-01T12:00:00Z'), requestedMinutes: 180 },
    );

    expect(quote?.tariffId).toBe('p');
  });

  it('applies night tariff in window', () => {
    const quote = quoteBestTariff(
      [
        { id: 'n', name: 'Night', type: 'NIGHT', price: new Prisma.Decimal(15000), minutes: 180, startHour: 22, endHour: 8, zone: null },
      ] as never,
      { startedAt: new Date('2026-01-01T23:00:00'), requestedMinutes: 120 },
    );

    expect(quote?.tariffId).toBe('n');
  });
});

