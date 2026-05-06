import type { TariffType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { PricingContext, PricingQuote, TariffWithMeta } from './pricing.types';

function isInNightWindow(date: Date, startHour: number, endHour: number): boolean {
  // Handles windows that cross midnight, e.g. 22 -> 8
  const h = date.getHours();
  if (startHour === endHour) return true;
  if (startHour < endHour) return h >= startHour && h < endHour;
  return h >= startHour || h < endHour;
}

function moneyMin(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return a.lessThan(b) ? a : b;
}

export function quoteBestTariff(
  tariffs: TariffWithMeta[],
  ctx: PricingContext,
): PricingQuote | null {
  const candidates: PricingQuote[] = [];

  const zoneTariffs = tariffs.filter((t) => (t.zone ? t.zone === ctx.zone : true));

  // NIGHT tariff has priority only if the current time is within its window.
  for (const t of zoneTariffs) {
    if (t.type !== 'NIGHT') continue;
    if (t.startHour == null || t.endHour == null) continue;
    if (!isInNightWindow(ctx.startedAt, t.startHour, t.endHour)) continue;

    // Night tariffs are still minute-based via `minutes` and `price`.
    const units = Math.ceil(ctx.requestedMinutes / Math.max(1, t.minutes));
    const total = new Prisma.Decimal(t.price).mul(units);
    candidates.push({
      tariffId: t.id,
      tariffType: t.type,
      tariffName: t.name,
      minutes: t.minutes * units,
      price: total,
      reason: `Night window active (${t.startHour}:00-${t.endHour}:00)`,
    });
  }

  // Hourly baseline (HOURLY minutes typically 60).
  for (const t of zoneTariffs) {
    if (t.type !== 'HOURLY') continue;
    const baseMinutes = Math.max(1, t.minutes);
    const units = Math.ceil(ctx.requestedMinutes / baseMinutes);
    const total = new Prisma.Decimal(t.price).mul(units);
    candidates.push({
      tariffId: t.id,
      tariffType: t.type,
      tariffName: t.name,
      minutes: baseMinutes * units,
      price: total,
      reason: 'Hourly baseline',
    });
  }

  // Package tariffs: choose the cheapest package that covers requested time.
  for (const t of zoneTariffs) {
    if (t.type !== 'PACKAGE') continue;
    if (t.minutes < ctx.requestedMinutes) continue;
    candidates.push({
      tariffId: t.id,
      tariffType: t.type,
      tariffName: t.name,
      minutes: t.minutes,
      price: new Prisma.Decimal(t.price),
      reason: 'Package covers requested minutes',
    });
  }

  if (candidates.length === 0) return null;

  // If we have both HOURLY and PACKAGE, ensure package is actually cheaper (as required).
  // If package isn't cheaper, we'll prefer hourly.
  const hourlyMin = candidates
    .filter((c) => c.tariffType === ('HOURLY' as TariffType))
    .reduce<Prisma.Decimal | null>((acc, c) => (acc ? moneyMin(acc, c.price) : c.price), null);

  let best = candidates[0]!;
  for (const c of candidates.slice(1)) {
    if (c.price.lessThan(best.price)) best = c;
  }

  if (best.tariffType === ('PACKAGE' as TariffType) && hourlyMin && !best.price.lessThan(hourlyMin)) {
    const hourlyBest = candidates
      .filter((c) => c.tariffType === ('HOURLY' as TariffType))
      .reduce<PricingQuote | null>((acc, c) => (!acc || c.price.lessThan(acc.price) ? c : acc), null);
    return hourlyBest ?? best;
  }

  return best;
}

