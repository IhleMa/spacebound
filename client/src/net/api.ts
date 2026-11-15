import type { AuthResponse } from '@spacebound/shared';

const TOKEN_KEY = 'spacebound.token';
const NAME_KEY = 'spacebound.username';

export async function authenticate(mode: 'login' | 'register', username: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`/api/${mode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  let body: { token?: string; username?: string; error?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok || !body.token) throw new Error(body.error ?? `Server error (${res.status}).`);
  return { token: body.token, username: body.username ?? username };
}

export const tokenStore = {
  get(): { token: string; username: string } | null {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const username = localStorage.getItem(NAME_KEY) ?? '';
      return token ? { token, username } : null;
    } catch {
      return null;
    }
  },
  set(token: string, username: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(NAME_KEY, username);
    } catch {
      /* storage unavailable – session-only login */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};
