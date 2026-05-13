const DEFAULT_BASE = 'http://127.0.0.1:3000';

export function getServerBaseUrl(): string {
  return import.meta.env.VITE_SERVER_URL?.toString() || DEFAULT_BASE;
}

export type ActiveSessionResponse = {
  phone: string;
  balance: number;
  endsAt: string;
};

export async function fetchActiveSession(
  computerId: string,
  phone: string,
  password: string,
): Promise<ActiveSessionResponse> {
  const res = await fetch(`${getServerBaseUrl()}/client/kiosk/active-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ computerId, phone: phone.trim(), password }),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || 'Invalid server response');
  }
  if (!res.ok) {
    let msg = text || res.statusText;
    if (typeof data === 'object' && data !== null && 'message' in data) {
      const m = (data as { message: unknown }).message;
      if (Array.isArray(m)) msg = m.map(String).join(', ');
      else if (typeof m === 'string') msg = m;
    }
    throw new Error(msg);
  }
  return data as ActiveSessionResponse;
}
