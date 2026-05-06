import { Injectable } from '@nestjs/common';

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

@Injectable()
export class AlertDedupeService {
  private readonly lastSent = new Map<string, number>();

  shouldSend(key: string, cooldownMs: number = DEFAULT_COOLDOWN_MS): boolean {
    const now = Date.now();
    const last = this.lastSent.get(key);
    if (last !== undefined && now - last < cooldownMs) return false;
    this.lastSent.set(key, now);
    return true;
  }

  reset(key?: string): void {
    if (key === undefined) this.lastSent.clear();
    else this.lastSent.delete(key);
  }
}
