import { DurableObject } from 'cloudflare:workers';
import {
  PROTOCOL_VERSION,
  createLobby,
  reduceGame,
  type CommandEnvelope,
  type GameSettings,
  type GameState,
  type ServerMessage
} from '@monopoly/game';
import { z } from 'zod';
import { RoomSession, TOKENS, authoritativePayload, firstAvailableToken, validateClientPayload, type CommandResult } from './session';

interface Env {
  GAME_ROOMS: DurableObjectNamespace<GameRoom>;
  ALLOWED_ORIGIN: string;
  DEPLOY_VERSION: string;
  ALLOW_TEST_DICE?: string;
}
interface AuthRecord { tokenHash: string; joinedAt: number; disconnectedAt?: number }
interface StoredRoom { state: GameState; auth: Record<string, AuthRecord>; results: [string, CommandResult][]; lastActivity: number; joinAttempts?: number[] }

const settingsSchema = z.object({ mode: z.enum(['official', 'quick']), durationMinutes: z.union([z.literal(45), z.literal(60), z.literal(90)]).optional(), auctions: z.boolean().optional() });
const playerSchema = z.object({ nickname: z.string().trim().min(1).max(24) });
const createSchema = playerSchema.extend({ settings: settingsSchema });
const leaveSchema = z.object({ leaveRequestId: z.string().min(8).max(100) });
const commandTypes = ['SET_TOKEN', 'SET_READY', 'SET_AUCTIONS', 'START_GAME', 'ROLL', 'BUY_PROPERTY', 'DECLINE_PROPERTY', 'PLACE_BID', 'PASS_AUCTION', 'END_TURN', 'PAY_JAIL_FINE', 'USE_JAIL_CARD', 'BUILD', 'SELL_BUILDING', 'MORTGAGE', 'UNMORTGAGE', 'SETTLE_DEBT', 'PROPOSE_TRADE', 'RESPOND_TRADE', 'DECLARE_BANKRUPTCY', 'PAUSE', 'RESUME'] as const;
const commandSchema = z.object({ protocolVersion: z.number().int(), commandId: z.string().min(8).max(100), expectedRevision: z.number().int().nonnegative(), type: z.enum(commandTypes), payload: z.record(z.string(), z.unknown()) });
const creationAttempts = new Map<string, number[]>();

const json = (data: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
const randomCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
};
const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
};
const sha256 = async (value: string) => {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
const playerId = () => crypto.randomUUID();
const internalRequest = (path: string, init?: RequestInit) => new Request(`https://room.internal${path}`, init);

function corsOrigin(request: Request, env: Env) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  if (origin === env.ALLOWED_ORIGIN || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(origin)) return origin;
  return null;
}
function withCors(response: Response, origin: string | null) {
  if (!origin) return response;
  const copy = new Response(response.body, response);
  copy.headers.set('access-control-allow-origin', origin);
  copy.headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  copy.headers.set('access-control-allow-headers', 'authorization,content-type');
  copy.headers.set('vary', 'Origin');
  return copy;
}
async function parseJson(request: Request) {
  try { return await request.json(); } catch { return null; }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = corsOrigin(request, env);
    if (request.method === 'OPTIONS') return origin ? withCors(new Response(null, { status: 204 }), origin) : new Response(null, { status: 403 });
    if (request.headers.has('origin') && !origin) return json({ error: 'Origin not allowed.' }, 403);
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return withCors(json({ ok: true, protocolVersion: PROTOCOL_VERSION, deployment: env.DEPLOY_VERSION }), origin);
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const key = request.headers.get('cf-connecting-ip') ?? 'unknown';
      const recent = (creationAttempts.get(key) ?? []).filter((timestamp) => timestamp > Date.now() - 60_000);
      if (recent.length >= 10) return withCors(json({ error: 'Too many rooms created. Try again shortly.' }, 429), origin);
      recent.push(Date.now()); creationAttempts.set(key, recent);
      const parsed = createSchema.safeParse(await parseJson(request));
      if (!parsed.success) return withCors(json({ error: 'Enter a name and valid game mode.' }, 400), origin);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const code = randomCode();
        const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(code));
        if ((await stub.fetch(internalRequest('/exists'))).status === 404) {
          const id = playerId(); const reconnectToken = randomToken();
          const response = await stub.fetch(internalRequest('/initialize', { method: 'POST', body: JSON.stringify({ code, id, reconnectToken, ...parsed.data }) }));
          if (response.ok) return withCors(json({ roomCode: code, playerId: id, reconnectToken }), origin);
        }
      }
      return withCors(json({ error: 'Could not allocate a room. Try again.' }, 503), origin);
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/(join|leave|socket-ticket|socket)$/u);
    if (!match) return withCors(json({ error: 'Not found.' }, 404), origin);
    const code = match[1]!; const action = match[2]!;
    const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(code));
    if (action === 'join' && request.method === 'POST') {
      const parsed = playerSchema.safeParse(await parseJson(request));
      if (!parsed.success) return withCors(json({ error: 'Enter a valid name.' }, 400), origin);
      const id = playerId(); const reconnectToken = randomToken();
      const response = await stub.fetch(internalRequest('/join', { method: 'POST', body: JSON.stringify({ id, reconnectToken, ...parsed.data }) }));
      if (!response.ok) return withCors(response, origin);
      return withCors(json({ roomCode: code, playerId: id, reconnectToken }), origin);
    }
    if (action === 'leave' && request.method === 'POST') {
      const parsed = leaveSchema.safeParse(await parseJson(request));
      if (!parsed.success) return withCors(json({ error: 'Leave request rejected.' }, 400), origin);
      return withCors(await stub.fetch(internalRequest('/leave', { method: 'POST', headers: { authorization: request.headers.get('authorization') ?? '' }, body: JSON.stringify(parsed.data) })), origin);
    }
    if (action === 'socket-ticket' && request.method === 'POST') {
      return withCors(await stub.fetch(internalRequest('/ticket', { method: 'POST', headers: { authorization: request.headers.get('authorization') ?? '' } })), origin);
    }
    if (action === 'socket' && request.method === 'GET') return stub.fetch(internalRequest(`/socket?ticket=${encodeURIComponent(url.searchParams.get('ticket') ?? '')}`, { headers: request.headers }));
    return withCors(json({ error: 'Method not allowed.' }, 405), origin);
  }
};

export class GameRoom extends DurableObject<Env> {
  private room: StoredRoom | null = null;

  private async load() {
    if (!this.room) this.room = await this.ctx.storage.get<StoredRoom>('room') ?? null;
    return this.room;
  }
  private async save(room: StoredRoom) {
    this.room = room;
    await this.ctx.storage.put('room', room);
    await this.schedule(room);
  }
  private async schedule(room: StoredRoom) {
    const deadlines = [room.lastActivity + 86_400_000];
    if (room.state.phase.type === 'auction') deadlines.push(room.state.phase.deadline);
    if (room.state.phase.type !== 'paused' && room.state.timerEndsAt && !room.state.timerExpired) deadlines.push(room.state.timerEndsAt);
    const hostAuth = room.auth[room.state.hostPlayerId];
    if (hostAuth?.disconnectedAt) deadlines.push(hostAuth.disconnectedAt + 60_000);
    await this.ctx.storage.setAlarm(Math.min(...deadlines));
  }
  private async clearExpiredDepartureReceipts(at = Date.now()) {
    const receipts = await this.ctx.storage.list<{ expiresAt: number }>({ prefix: 'departure:' });
    await Promise.all([...receipts.entries()].filter(([, receipt]) => receipt.expiresAt <= at).map(([key]) => this.ctx.storage.delete(key)));
  }
  private broadcast(message: ServerMessage) {
    const encoded = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) try { socket.send(encoded); } catch { /* stale socket */ }
  }
  private async rotateHost(room: StoredRoom, at = Date.now()) {
    const hostAuth = room.auth[room.state.hostPlayerId];
    if (!hostAuth?.disconnectedAt || hostAuth.disconnectedAt + 60_000 > at) return;
    const connected = room.state.players.filter((player) => player.connected && !player.bankrupt).sort((a, b) => a.joinedAt - b.joinedAt);
    if (connected[0] && connected[0].id !== room.state.hostPlayerId) {
      room.state.hostPlayerId = connected[0].id;
      room.state.revision += 1;
      room.state.activities.unshift({ id: `host-${at}`, at, text: `${connected[0].name} is now the host.` });
      room.state.activities = room.state.activities.slice(0, 100);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/exists') return new Response(null, { status: (await this.load()) ? 200 : 404 });
    if (url.pathname === '/initialize' && request.method === 'POST') {
      if (await this.load()) return json({ error: 'Room already exists.' }, 409);
      const body = await request.json() as { code: string; id: string; reconnectToken: string; nickname: string; settings: GameSettings };
      const state = createLobby({ id: body.id, name: body.nickname, token: TOKENS[0] }, body.settings);
      state.roomCode = body.code;
      const room: StoredRoom = { state, auth: { [body.id]: { tokenHash: await sha256(body.reconnectToken), joinedAt: Date.now() } }, results: [], lastActivity: Date.now() };
      await this.save(room); return json({ ok: true });
    }
    if (url.pathname === '/leave' && request.method === 'POST') {
      const parsed = leaveSchema.safeParse(await request.json());
      if (!parsed.success) return json({ error: 'Leave request rejected.' }, 400);
      const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/u, '') ?? '';
      const tokenHash = await sha256(bearer);
      const receiptKey = `departure:${tokenHash}:${parsed.data.leaveRequestId}`;
      const receipt = await this.ctx.storage.get<{ expiresAt: number }>(receiptKey);
      if (receipt && receipt.expiresAt > Date.now()) return json({ ok: true, alreadyLeft: true });
      const leaveRoom = await this.load();
      if (!leaveRoom) return json({ error: 'Room not found or expired.' }, 404);
      const entry = Object.entries(leaveRoom.auth).find(([, auth]) => auth.tokenHash === tokenHash);
      if (!entry) return json({ error: 'Reconnect token rejected.' }, 401);
      leaveRoom.state = reduceGame(leaveRoom.state, { type: 'LEAVE_ROOM', playerId: entry[0], now: Date.now() });
      delete leaveRoom.auth[entry[0]];
      leaveRoom.lastActivity = Date.now();
      const expiresAt = Date.now() + 300_000;
      if (leaveRoom.state.status === 'lobby' && leaveRoom.state.players.length === 0) {
        await this.ctx.storage.transaction(async (transaction) => {
          await transaction.delete('room');
          await transaction.put(receiptKey, { expiresAt });
        });
        this.room = null;
      } else {
        await this.ctx.storage.transaction(async (transaction) => {
          await transaction.put('room', leaveRoom);
          await transaction.put(receiptKey, { expiresAt });
        });
        this.room = leaveRoom;
        await this.schedule(leaveRoom);
        this.broadcast({ type: 'snapshot', protocolVersion: PROTOCOL_VERSION, state: leaveRoom.state });
      }
      for (const socket of this.ctx.getWebSockets()) {
        const attachment = socket.deserializeAttachment() as { playerId?: string } | null;
        if (attachment?.playerId === entry[0]) socket.close(1000, 'Left room');
      }
      const alarm = await this.ctx.storage.getAlarm();
      await this.ctx.storage.setAlarm(Math.min(alarm ?? expiresAt, expiresAt));
      return json({ ok: true });
    }
    const room = await this.load();
    if (!room) return json({ error: 'Room not found or expired.' }, 404);
    if (url.pathname === '/join' && request.method === 'POST') {
      const body = await request.json() as { id: string; reconnectToken: string; nickname: string };
      room.joinAttempts = (room.joinAttempts ?? []).filter((timestamp) => timestamp > Date.now() - 60_000);
      if (room.joinAttempts.length >= 20) return json({ error: 'Too many join attempts. Try again shortly.' }, 429);
      room.joinAttempts.push(Date.now()); await this.save(room);
      try {
        room.state = reduceGame(room.state, { type: 'ADD_PLAYER', player: { id: body.id, name: body.nickname, token: firstAvailableToken(room.state) } });
        room.auth[body.id] = { tokenHash: await sha256(body.reconnectToken), joinedAt: Date.now() };
        room.lastActivity = Date.now(); await this.save(room); this.broadcast({ type: 'snapshot', protocolVersion: PROTOCOL_VERSION, state: room.state }); return json({ ok: true });
      } catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not join.' }, 409); }
    }
    if (url.pathname === '/ticket' && request.method === 'POST') {
      const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/u, '') ?? '';
      const hash = await sha256(bearer);
      const entry = Object.entries(room.auth).find(([, auth]) => auth.tokenHash === hash);
      if (!entry) return json({ error: 'Reconnect token rejected.' }, 401);
      const ticket = randomToken();
      await this.ctx.storage.put(`ticket:${ticket}`, { playerId: entry[0], expiresAt: Date.now() + 30_000 });
      return json({ ticket, expiresIn: 30 });
    }
    if (url.pathname === '/socket') {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket upgrade required.' }, 426);
      const ticket = url.searchParams.get('ticket') ?? '';
      const value = await this.ctx.storage.get<{ playerId: string; expiresAt: number }>(`ticket:${ticket}`);
      await this.ctx.storage.delete(`ticket:${ticket}`);
      if (!value || value.expiresAt < Date.now()) return json({ error: 'Socket ticket rejected.' }, 401);
      const pair = new WebSocketPair(); const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      server.serializeAttachment({ playerId: value.playerId }); this.ctx.acceptWebSocket(server);
      const player = room.state.players.find((candidate) => candidate.id === value.playerId)!; player.connected = true; delete room.auth[value.playerId]!.disconnectedAt; await this.save(room);
      server.send(JSON.stringify({ type: 'hello', protocolVersion: PROTOCOL_VERSION, playerId: value.playerId } satisfies ServerMessage));
      server.send(JSON.stringify({ type: 'snapshot', protocolVersion: PROTOCOL_VERSION, state: room.state } satisfies ServerMessage));
      this.broadcast({ type: 'presence', playerId: value.playerId, connected: true });
      return new Response(null, { status: 101, webSocket: client });
    }
    return json({ error: 'Not found.' }, 404);
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;
    const attachment = socket.deserializeAttachment() as { playerId: string };
    if (message === 'ping') { socket.send(JSON.stringify({ type: 'pong', at: Date.now() } satisfies ServerMessage)); return; }
    const room = await this.load(); if (!room) return;
    let value: unknown;
    try { value = JSON.parse(message); } catch { value = null; }
    const parsed = commandSchema.safeParse(value);
    if (!parsed.success) { socket.send(JSON.stringify({ type: 'commandRejected', commandId: 'invalid', code: 'INVALID_COMMAND', message: 'Command format rejected.' } satisfies ServerMessage)); return; }
    const envelope = parsed.data as unknown as CommandEnvelope;
    const allowTestDice = this.env.ALLOW_TEST_DICE === '1';
    const validPayload = validateClientPayload(envelope.type, envelope.payload, allowTestDice);
    if (!validPayload) { socket.send(JSON.stringify({ type: 'commandRejected', commandId: envelope.commandId, code: 'INVALID_COMMAND', message: 'Command payload rejected.' } satisfies ServerMessage)); return; }
    envelope.payload = authoritativePayload(envelope.type, validPayload, attachment.playerId, Date.now(), allowTestDice);
    const session = new RoomSession(room.state, room.results);
    const result = session.execute(envelope);
    if (result.ok) {
      room.state = result.state; room.results = session.exportResults(); room.lastActivity = Date.now(); await this.save(room);
      this.broadcast({ type: 'commandAccepted', commandId: envelope.commandId, revision: room.state.revision });
      this.broadcast({ type: 'snapshot', protocolVersion: PROTOCOL_VERSION, state: room.state });
    } else if (result.code === 'PROTOCOL_MISMATCH') socket.send(JSON.stringify({ type: 'protocolMismatch', expected: PROTOCOL_VERSION } satisfies ServerMessage));
    else socket.send(JSON.stringify({ type: 'commandRejected', commandId: result.commandId, code: result.code, message: result.message, ...(result.state ? { state: result.state } : {}) } satisfies ServerMessage));
  }

  async webSocketClose(socket: WebSocket) {
    const attachment = socket.deserializeAttachment() as { playerId: string };
    const room = await this.load(); if (!room) return;
    const stillConnected = this.ctx.getWebSockets().some((candidate) => candidate !== socket && (candidate.deserializeAttachment() as { playerId?: string } | null)?.playerId === attachment.playerId);
    const player = room.state.players.find((candidate) => candidate.id === attachment.playerId); if (player) player.connected = stillConnected;
    const auth = room.auth[attachment.playerId];
    if (auth) { if (stillConnected) delete auth.disconnectedAt; else auth.disconnectedAt = Date.now(); }
    await this.save(room);
    this.broadcast({ type: 'presence', playerId: attachment.playerId, connected: stillConnected });
  }

  async webSocketError(socket: WebSocket) { await this.webSocketClose(socket); }

  async alarm() {
    await this.clearExpiredDepartureReceipts();
    const room = await this.load(); if (!room) return;
    const at = Date.now();
    if (room.lastActivity + 86_400_000 <= at) { await this.ctx.storage.deleteAll(); this.room = null; return; }
    await this.rotateHost(room, at);
    if ((room.state.phase.type === 'auction' && room.state.phase.deadline <= at) || (room.state.timerEndsAt && room.state.timerEndsAt <= at)) room.state = reduceGame(room.state, { type: 'TICK', now: at });
    await this.save(room); this.broadcast({ type: 'snapshot', protocolVersion: PROTOCOL_VERSION, state: room.state });
  }
}
