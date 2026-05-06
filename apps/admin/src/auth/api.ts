export const API_BASE_URL = 'http://localhost:3000';
export const WS_BASE_URL = 'ws://localhost:3000';

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    role: 'OWNER' | 'ADMIN' | 'OPERATOR';
  };
};

export type AccountSearchResult = {
  id: string;
  username: string;
  balance: string;
  bonusMinutes: number;
  tier: string | null;
};

export async function loginRequest(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Login failed: ${res.status} ${text}`);
  }
  return (await res.json()) as LoginResponse;
}

export async function refreshRequest(refreshToken: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
  return (await res.json()) as LoginResponse;
}

export async function searchAccountsRequest(
  accessToken: string,
  query: string,
): Promise<AccountSearchResult[]> {
  const url = new URL(`${API_BASE_URL}/accounts/search`);
  if (query.trim()) url.searchParams.set('q', query);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return (await res.json()) as AccountSearchResult[];
}
