import { API_BASE_URL } from '../auth/api';

export type Tariff = {
  id: string;
  name: string;
  type: 'HOURLY' | 'PACKAGE' | 'NIGHT' | 'BONUS';
  price: string;
  minutes: number;
  startHour: number | null;
  endHour: number | null;
  zone: string | null;
};

export type TopUpResponse = {
  newBalance: string;
  bonusMinutesAdded: number;
  promo: null | {
    promoCode: string;
    bonusPercent: number | null;
    bonusMinutes: number | null;
    appliedAccountId: string;
    newBalance?: string;
    newBonusMinutes?: number;
  };
};

async function request<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export const billingApi = {
  listTariffs: (token: string) => request<Tariff[]>(token, '/billing/tariffs'),
  createTariff: (token: string, body: Partial<Tariff>) =>
    request<{ id: string }>(token, '/billing/tariffs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateTariff: (token: string, id: string, body: Partial<Tariff>) =>
    request<{ ok: true }>(token, `/billing/tariffs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteTariff: (token: string, id: string) =>
    request<{ ok: true }>(token, `/billing/tariffs/${id}`, { method: 'DELETE' }),
  topUp: (
    token: string,
    body: { accountId: string; amount: string; promoCode?: string },
  ) =>
    request<TopUpResponse>(token, '/billing/topup', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
