import type { GameSettings, TokenId } from '@monopoly/game';

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/u, '') ?? 'http://localhost:8787';
export interface SessionIdentity { roomCode: string; playerId: string; reconnectToken: string }
export interface PlayerForm { nickname: string; token: TokenId }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
  return data;
}

export const createRoom = (player: PlayerForm, settings: GameSettings) => request<SessionIdentity>('/api/rooms', { method: 'POST', body: JSON.stringify({ ...player, settings }) });
export const joinRoom = (roomCode: string, player: PlayerForm) => request<SessionIdentity>(`/api/rooms/${roomCode}/join`, { method: 'POST', body: JSON.stringify(player) });
export const createTicket = (session: SessionIdentity) => request<{ ticket: string }>(`/api/rooms/${session.roomCode}/socket-ticket`, { method: 'POST', headers: { authorization: `Bearer ${session.reconnectToken}` } });
export const socketUrl = (session: SessionIdentity, ticket: string) => `${API_BASE.replace(/^http/u, 'ws')}/api/rooms/${session.roomCode}/socket?ticket=${encodeURIComponent(ticket)}`;

const storageKey = (code: string) => `monopoly-party:session:${code}`;
export function storeSession(session: SessionIdentity) { localStorage.setItem(storageKey(session.roomCode), JSON.stringify(session)); }
export function readSession(code: string): SessionIdentity | null {
  try {
    const value = localStorage.getItem(storageKey(code));
    return value ? JSON.parse(value) as SessionIdentity : null;
  } catch { return null; }
}
