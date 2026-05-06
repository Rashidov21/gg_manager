import { describe, it, expect } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { BillingService } from '../src/billing/billing.service';

describe('billing.service', () => {
  it('adds +30 bonus minutes at 100000 top-up', async () => {
    const prismaMock = {
      $transaction: async (cb: (tx: any) => Promise<any>) =>
        cb({
          account: {
            update: async () => ({ balance: new Prisma.Decimal(100000) }),
          },
          operatorLog: { create: async () => ({}) },
        }),
    } as any;

    const service = new BillingService(prismaMock);
    const result = await service.topUpBalance({
      accountId: 'a1',
      amount: new Prisma.Decimal(100000),
    });

    expect(result.bonusMinutesAdded).toBe(30);
  });
});

