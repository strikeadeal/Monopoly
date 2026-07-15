import { PROTOCOL_VERSION, reduceGame, type CommandEnvelope, type GameCommand, type GameState } from '@monopoly/game';
import { z } from 'zod';

export type CommandResult =
  | { ok: true; commandId: string; state: GameState }
  | { ok: false; commandId: string; code: string; message: string; state?: GameState };

const timedCommandTypes = new Set<CommandEnvelope['type']>(['DECLINE_PROPERTY', 'PLACE_BID', 'PAUSE', 'RESUME']);
const empty = z.object({});
const space = z.object({ spaceIndex: z.number().int().min(0).max(39) });
const tradeOffer = z.object({
  id: z.string().min(1).max(100), fromPlayerId: z.string().min(1).max(100), toPlayerId: z.string().min(1).max(100),
  offeredCash: z.number().int().nonnegative(), requestedCash: z.number().int().nonnegative(),
  offeredProperties: z.array(z.number().int().min(0).max(39)).max(28), requestedProperties: z.array(z.number().int().min(0).max(39)).max(28),
  offeredJailCards: z.array(z.string().min(1).max(100)).max(2), requestedJailCards: z.array(z.string().min(1).max(100)).max(2)
});
const payloadSchemas: Record<string, z.ZodType<Record<string, unknown>>> = {
  SET_READY: z.object({ ready: z.boolean() }), START_GAME: empty, ROLL: empty, BUY_PROPERTY: empty, DECLINE_PROPERTY: empty,
  PLACE_BID: z.object({ amount: z.number().int().nonnegative() }), PASS_AUCTION: empty, END_TURN: empty,
  PAY_JAIL_FINE: empty, USE_JAIL_CARD: empty, BUILD: space, SELL_BUILDING: space, MORTGAGE: space, UNMORTGAGE: space,
  SETTLE_DEBT: empty, PROPOSE_TRADE: z.object({ offer: tradeOffer }), RESPOND_TRADE: z.object({ accept: z.boolean() }),
  DECLARE_BANKRUPTCY: empty, PAUSE: empty, RESUME: empty
};
export function validateClientPayload(type: string, payload: unknown) {
  const schema = payloadSchemas[type];
  if (!schema) return null;
  const result = schema.safeParse(payload);
  return result.success ? result.data : null;
}
export function authoritativePayload(type: CommandEnvelope['type'], payload: Record<string, unknown>, playerId: string, at = Date.now()) {
  const result: Record<string, unknown> = { ...payload, playerId };
  delete result.dice;
  delete result.now;
  if (timedCommandTypes.has(type)) result.now = at;
  return result;
}

export class RoomSession {
  state: GameState;
  private readonly results = new Map<string, CommandResult>();

  constructor(state: GameState, results?: Iterable<[string, CommandResult]>) {
    this.state = structuredClone(state);
    if (results) for (const [id, result] of results) this.results.set(id, result);
  }

  execute(envelope: CommandEnvelope): CommandResult {
    const prior = this.results.get(envelope.commandId);
    if (prior) {
      if (prior.ok) return { ...structuredClone(prior), state: structuredClone(this.state) };
      return structuredClone(prior);
    }
    if (envelope.protocolVersion !== PROTOCOL_VERSION) {
      return { ok: false, commandId: envelope.commandId, code: 'PROTOCOL_MISMATCH', message: `Protocol ${PROTOCOL_VERSION} is required.` };
    }
    if (envelope.expectedRevision !== this.state.revision) {
      return { ok: false, commandId: envelope.commandId, code: 'STALE_REVISION', message: 'The game changed on another device.', state: structuredClone(this.state) };
    }
    try {
      const command = { type: envelope.type, ...envelope.payload } as GameCommand;
      this.state = reduceGame(this.state, command);
      const result: CommandResult = { ok: true, commandId: envelope.commandId, state: structuredClone(this.state) };
      this.results.set(envelope.commandId, result);
      while (this.results.size > 200) this.results.delete(this.results.keys().next().value as string);
      return structuredClone(result);
    } catch (error) {
      return { ok: false, commandId: envelope.commandId, code: 'ILLEGAL_ACTION', message: error instanceof Error ? error.message : 'Illegal action', state: structuredClone(this.state) };
    }
  }

  exportResults() { return [...this.results.entries()]; }
}

const encoder = new TextEncoder();
const consumedTickets = new Set<string>();
const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
};
const fromBase64Url = (value: string) => {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};
async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export async function createSocketTicket(secret: string, playerId: string, issuedAtSeconds = Math.floor(Date.now() / 1000)) {
  const nonce = crypto.randomUUID();
  const payload = toBase64Url(encoder.encode(JSON.stringify({ playerId, exp: issuedAtSeconds + 30, nonce })));
  return `${payload}.${toBase64Url(await sign(payload, secret))}`;
}

export async function validateSocketTicket(ticket: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (consumedTickets.has(ticket)) return null;
  const [payload, signature] = ticket.split('.');
  if (!payload || !signature) return null;
  const expected = await sign(payload, secret);
  const received = fromBase64Url(signature);
  if (expected.length !== received.length) return null;
  let mismatch = 0;
  expected.forEach((byte, index) => { mismatch |= byte ^ received[index]!; });
  if (mismatch !== 0) return null;
  const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { playerId: string; exp: number };
  if (parsed.exp < nowSeconds) return null;
  consumedTickets.add(ticket);
  return { playerId: parsed.playerId };
}
