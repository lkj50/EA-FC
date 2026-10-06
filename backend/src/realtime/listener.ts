import { createClient } from '@supabase/supabase-js';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Server } from 'socket.io';
import { env } from '../config/env.js';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from './types.js';

type RealtimeEventName = keyof ServerToClientEvents;

type MatchRecord = {
  id: number;
  home_id: string;
  away_id: string;
  status: string;
  [key: string]: unknown;
};

type CachedMatch = {
  expiresAt: number;
  match: MatchRecord;
};

const MATCH_CACHE_TTL_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;

// Solo este componente confiable necesita ver todos los cambios para reenviarlos a las salas correctas.
const realtimeClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function positiveIntegerId(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function asMatch(value: unknown): MatchRecord | null {
  const row = asRecord(value);
  const id = positiveIntegerId(row?.id);
  if (
    !row
    || id === null
    || typeof row.home_id !== 'string'
    || typeof row.away_id !== 'string'
    || typeof row.status !== 'string'
  ) {
    return null;
  }
  return {
    ...row,
    id,
    home_id: row.home_id,
    away_id: row.away_id,
    status: row.status,
  };
}

function recordId(value: unknown): number | null {
  const row = asRecord(value);
  return row ? positiveIntegerId(row.id) : null;
}

function recordMatchId(value: unknown): number | null {
  const row = asRecord(value);
  return row ? positiveIntegerId(row.match_id) : null;
}

export function startRealtimeListener(
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
): { close: () => Promise<void> } {
  let running = true;
  let currentChannel: RealtimeChannel | null = null;
  let retryTimer: NodeJS.Timeout | null = null;
  let retryDelay = 1_000;
  let resolveStopped: (() => void) | null = null;
  const cache = new Map<number, CachedMatch>();

  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });

  const notifyUser = (userId: string, type: RealtimeEventName, match: MatchRecord) => {
    io.to(`user:${userId}`).emit(type, { type, match });
  };

  const getMatch = async (matchId: number): Promise<MatchRecord | null> => {
    const cached = cache.get(matchId);
    if (cached && cached.expiresAt > Date.now()) return cached.match;

    const { data, error } = await realtimeClient.from('matches').select('*').eq('id', matchId).maybeSingle();
    if (error) {
      console.error(`[Realtime] No se pudo leer el partido ${matchId}: ${error.message}`);
      return null;
    }
    const match = asMatch(data);
    if (match) cache.set(matchId, { match, expiresAt: Date.now() + MATCH_CACHE_TTL_MS });
    return match;
  };

  const invalidateMatch = (matchId: number) => {
    cache.delete(matchId);
  };

  const broadcastMatchUpdate = async (payload: { new: unknown }) => {
    const matchId = recordId(payload.new);
    if (!matchId) {
      console.error('[Realtime] UPDATE de matches sin un id válido.');
      return;
    }
    invalidateMatch(matchId);
    const match = await getMatch(matchId);
    if (!match) return;

    if (match.status === 'pendiente') {
      notifyUser(match.away_id, 'match:result_pending', match);
    }
    if (match.status === 'confirmado') {
      notifyUser(match.home_id, 'match:resolved', match);
      notifyUser(match.away_id, 'match:resolved', match);
    }
    if (match.status === 'disputa') {
      notifyUser(match.home_id, 'match:resolved', match);
      notifyUser(match.away_id, 'match:resolved', match);
      io.to('admins').emit('match:disputed', { type: 'match:disputed', match });
    }

    notifyUser(match.home_id, 'match:updated', match);
    notifyUser(match.away_id, 'match:updated', match);
  };

  const broadcastMatchEvent = async (payload: { new: unknown; old: unknown }, type: 'event:new' | 'event:deleted') => {
    const matchId = recordMatchId(type === 'event:new' ? payload.new : payload.old);
    if (!matchId) {
      console.error(`[Realtime] ${type} sin match_id válido.`);
      return;
    }
    const match = await getMatch(matchId);
    if (!match) return;
    notifyUser(match.home_id, type, match);
    notifyUser(match.away_id, type, match);
  };

  const broadcastTournamentUpdate = (payload: { new: unknown }) => {
    const tournament = asRecord(payload.new);
    if (!tournament) {
      console.error('[Realtime] UPDATE de tournaments sin una fila válida.');
      return;
    }
    io.emit('tournament:updated', { type: 'tournament:updated', match: tournament });
  };

  const run = async (): Promise<void> => {
    while (running) {
      let channel: RealtimeChannel | null = null;
      try {
        channel = realtimeClient
          .channel(`tournament-events-${Date.now()}`)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, (payload) => {
            void broadcastMatchUpdate(payload).catch((error: unknown) => {
              console.error('[Realtime] Error procesando UPDATE de matches:', error);
            });
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_events' }, (payload) => {
            void broadcastMatchEvent(payload, 'event:new').catch((error: unknown) => {
              console.error('[Realtime] Error procesando INSERT de match_events:', error);
            });
          })
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'match_events' }, (payload) => {
            void broadcastMatchEvent(payload, 'event:deleted').catch((error: unknown) => {
              console.error('[Realtime] Error procesando DELETE de match_events:', error);
            });
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournaments' }, broadcastTournamentUpdate);
        currentChannel = channel;

        console.info('[Realtime] Suscribiendo a matches, match_events y tournaments.');
        await new Promise<void>((resolve) => {
          let subscribed = false;
          let stableTimer: NodeJS.Timeout | null = null;
          channel?.subscribe((status, error) => {
            console.info(`[Realtime] Estado del canal: ${status}${error ? ` (${error.message})` : ''}`);
            if (status === 'SUBSCRIBED') {
              subscribed = true;
              stableTimer = setTimeout(() => {
                retryDelay = 1_000;
              }, 30_000);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              if (!subscribed && status !== 'CLOSED') {
                console.error(`[Realtime] No se pudo establecer la suscripción (${status}).`);
              }
              if (stableTimer) clearTimeout(stableTimer);
              resolve();
            }
          });
        });
      } catch (error) {
        console.error('[Realtime] Falló la suscripción:', error);
      } finally {
        if (channel) {
          await realtimeClient.removeChannel(channel).catch((error: unknown) => {
            console.error('[Realtime] Error al cerrar el canal:', error);
          });
        }
        if (currentChannel === channel) currentChannel = null;
      }

      if (!running) break;
      console.warn(`[Realtime] Reintentando en ${retryDelay} ms.`);
      await Promise.race([
        new Promise<void>((resolve) => {
          retryTimer = setTimeout(resolve, retryDelay);
        }),
        stopped,
      ]);
      retryTimer = null;
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
    }
  };

  void run();

  return {
    close: async () => {
      if (!running) return;
      running = false;
      if (retryTimer) clearTimeout(retryTimer);
      resolveStopped?.();
      if (currentChannel) {
        await realtimeClient.removeChannel(currentChannel);
        currentChannel = null;
      }
      console.info('[Realtime] Canal cerrado limpiamente.');
    },
  };
}
