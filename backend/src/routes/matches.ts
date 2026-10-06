import { Router } from 'express';
import { getAuthContext } from '../middleware/auth.js';
import {
  asyncHandler,
  HttpError,
  requireBodyObject,
  requiredInteger,
  requiredPositiveId,
  requiredString,
  requiredUuid,
  throwSupabaseError,
} from '../middleware/error.js';

export const matchesRouter = Router();
const eventTypes = ['gol', 'amarilla', 'roja'] as const;

async function enrichMatches(sb: ReturnType<typeof getAuthContext>['sb'], rows: Array<Record<string, unknown>>) {
  const participantIds = [...new Set(rows.flatMap((row) => [row.home_id, row.away_id]).filter(
    (id): id is string => typeof id === 'string',
  ))];
  if (participantIds.length === 0) {
    return rows.map((row) => ({ ...row, home: null, away: null }));
  }
  const { data: profiles, error } = await sb.from('profiles').select('id, username').in('id', participantIds);
  if (error) throwSupabaseError(error);
  const byId = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));
  return rows.map((row) => ({
    ...row,
    home: typeof row.home_id === 'string' ? byId.get(row.home_id) ?? null : null,
    away: typeof row.away_id === 'string' ? byId.get(row.away_id) ?? null : null,
  }));
}

async function runRpc(sb: ReturnType<typeof getAuthContext>['sb'], name: string, args?: Record<string, unknown>) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throwSupabaseError(error, 'rpc');
  return data;
}

matchesRouter.get('/', asyncHandler(async (req, res) => {
  const { sb } = getAuthContext(req);
  let query = sb.from('matches').select('*').order('round').order('id');
  if (req.query.round !== undefined) {
    if (typeof req.query.round !== 'string') {
      throw new HttpError(400, 'round debe aparecer una sola vez y ser un número entero.');
    }
    const round = Number(req.query.round);
    if (!Number.isInteger(round) || round < 1) throw new HttpError(400, 'round debe ser un número entero mayor que cero.');
    query = query.eq('round', round);
  }
  const { data, error } = await query;
  if (error) throwSupabaseError(error);
  res.json(await enrichMatches(sb, (data ?? []) as Array<Record<string, unknown>>));
}));

matchesRouter.get('/mine', asyncHandler(async (req, res) => {
  const { sb, user } = getAuthContext(req);
  const { data, error } = await sb.from('matches').select('*')
    .or(`home_id.eq.${user.id},away_id.eq.${user.id}`).order('round').order('id');
  if (error) throwSupabaseError(error);
  res.json(await enrichMatches(sb, (data ?? []) as Array<Record<string, unknown>>));
}));

matchesRouter.post('/:id/start', asyncHandler(async (req, res) => {
  const { sb } = getAuthContext(req);
  const matchId = requiredPositiveId(req.params.id, 'El id del partido');
  res.json({ data: await runRpc(sb, 'start_match', { p_match_id: matchId }) });
}));

matchesRouter.get('/:id/events', asyncHandler(async (req, res) => {
  const { sb } = getAuthContext(req);
  const matchId = requiredPositiveId(req.params.id, 'El id del partido');
  const { data, error } = await sb.from('match_events').select('*').eq('match_id', matchId).order('minute');
  if (error) throwSupabaseError(error);
  res.json(data);
}));

matchesRouter.post('/:id/events', asyncHandler(async (req, res) => {
  const { sb, user } = getAuthContext(req);
  const matchId = requiredPositiveId(req.params.id, 'El id del partido');
  const body = requireBodyObject(req.body);
  const type = requiredString(body, 'type', 'El tipo de evento', 1, 20);
  if (!eventTypes.includes(type as (typeof eventTypes)[number])) {
    throw new HttpError(400, 'type debe ser gol, amarilla o roja.');
  }
  const clientId = requiredUuid(body.client_id, 'client_id');
  const playerId = requiredInteger(body, 'player_id', 'player_id', 1, Number.MAX_SAFE_INTEGER);
  let minute: number | null = null;
  if (body.minute !== undefined) {
    if (typeof body.minute !== 'number' || !Number.isInteger(body.minute) || body.minute < 0 || body.minute > 130) {
      throw new HttpError(400, 'minute debe ser un número entero entre 0 y 130.');
    }
    minute = body.minute;
  }

  const { data: existing, error: existingError } = await sb.from('match_events').select('*')
    .eq('client_id', clientId).eq('match_id', matchId).eq('user_id', user.id).maybeSingle();
  if (existingError) throwSupabaseError(existingError);
  if (existing) {
    res.status(200).json(existing);
    return;
  }

  const insertPayload = {
    match_id: matchId,
    user_id: user.id,
    type,
    player_id: playerId,
    minute,
    client_id: clientId,
  };
  const { data, error } = await sb.from('match_events').insert(insertPayload).select('*').single();
  if (error) {
    if (error.code === '42501') throwSupabaseError(error);
    if (error.code === '23505') {
      const { data: duplicate, error: duplicateError } = await sb.from('match_events').select('*')
        .eq('client_id', clientId).eq('match_id', matchId).eq('user_id', user.id).maybeSingle();
      if (duplicateError) throwSupabaseError(duplicateError);
      if (duplicate) {
        res.status(200).json(duplicate);
        return;
      }
      throw new HttpError(409, 'client_id ya está asociado a otro evento.');
    }
    throwSupabaseError(error);
  }
  res.status(201).json(data);
}));

matchesRouter.delete('/:id/events/:eventId', asyncHandler(async (req, res) => {
  const { sb, user } = getAuthContext(req);
  const matchId = requiredPositiveId(req.params.id, 'El id del partido');
  const eventId = requiredPositiveId(req.params.eventId, 'El id del evento');
  const { data, error } = await sb.from('match_events').delete().eq('id', eventId)
    .eq('match_id', matchId).eq('user_id', user.id).select('id').maybeSingle();
  if (error) throwSupabaseError(error);
  if (!data) throw new HttpError(404, 'No se encontró un evento propio con ese id para este partido.');
  res.status(204).send();
}));

matchesRouter.post('/:id/result', asyncHandler(async (req, res) => {
  const { sb } = getAuthContext(req);
  const matchId = requiredPositiveId(req.params.id, 'El id del partido');
  const body = requireBodyObject(req.body);
  const home = requiredInteger(body, 'home', 'home', 0, 99);
  const away = requiredInteger(body, 'away', 'away', 0, 99);
  res.json({ data: await runRpc(sb, 'submit_result', { p_match_id: matchId, p_home: home, p_away: away }) });
}));

matchesRouter.post('/:id/respond', asyncHandler(async (req, res) => {
  const { sb } = getAuthContext(req);
  const matchId = requiredPositiveId(req.params.id, 'El id del partido');
  const body = requireBodyObject(req.body);
  if (typeof body.approve !== 'boolean') throw new HttpError(400, 'approve debe ser true o false.');
  res.json({ data: await runRpc(sb, 'respond_result', { p_match_id: matchId, p_approve: body.approve }) });
}));
