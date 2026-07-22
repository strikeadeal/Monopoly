import type { GameSettings } from '@monopoly/game';

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/u, '') ?? 'http://localhost:8787';
export interface SessionIdentity { roomCode: string; playerId: string; reconnectToken: string }
export interface PlayerForm { nickname: string }

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ApiError'; }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new ApiError(data.error ?? `Request failed (${response.status}).`, response.status);
  return data;
}

export const createRoom = (player: PlayerForm, settings: GameSettings) => request<SessionIdentity>('/api/rooms', { method: 'POST', body: JSON.stringify({ ...player, settings }) });
export const joinRoom = (roomCode: string, player: PlayerForm) => request<SessionIdentity>(`/api/rooms/${roomCode}/join`, { method: 'POST', body: JSON.stringify(player) });
export const createTicket = (session: SessionIdentity) => request<{ ticket: string }>(`/api/rooms/${session.roomCode}/socket-ticket`, { method: 'POST', headers: { authorization: `Bearer ${session.reconnectToken}` } });
export const leaveRoom = (session: SessionIdentity, leaveRequestId: string) => request<{ ok: true }>(`/api/rooms/${session.roomCode}/leave`, { method: 'POST', headers: { authorization: `Bearer ${session.reconnectToken}` }, body: JSON.stringify({ leaveRequestId }) });
export const socketUrl = (session: SessionIdentity, ticket: string) => `${API_BASE.replace(/^http/u, 'ws')}/api/rooms/${session.roomCode}/socket?ticket=${encodeURIComponent(ticket)}`;

const STORAGE_PREFIX = 'monopoly-party:session:';
const storageKey = (code: string) => `${STORAGE_PREFIX}${code}`;
export function storeSession(session: SessionIdentity) { localStorage.setItem(storageKey(session.roomCode), JSON.stringify({ ...session, savedAt: Date.now() })); }
export function removeSession(code: string) { localStorage.removeItem(storageKey(code)); }
export function readSession(code: string): SessionIdentity | null {
  try {
    const value = localStorage.getItem(storageKey(code));
    return value ? JSON.parse(value) as SessionIdentity : null;
  } catch { return null; }
}
export function listSessions(): SessionIdentity[] {
  const sessions: (SessionIdentity & { savedAt?: number })[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key) ?? '') as SessionIdentity & { savedAt?: number };
        if (value?.roomCode && value.playerId && value.reconnectToken) sessions.push(value);
      } catch { /* ignore unreadable entries */ }
    }
  } catch { return []; }
  return sessions.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}
