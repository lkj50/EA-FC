import { Router } from 'express';
import { getAuthContext } from '../middleware/auth.js';
import {
  asyncHandler,
  HttpError,
  requireBodyObject,
  requiredInteger,
  requiredPositiveId,
  throwSupabaseError,
} from '../middleware/error.js';

export const adminRouter = Router();

async function runAdminRpc(
  sb: ReturnType<typeof getAuthContext>['sb'],
  name: string,
  args?: Record<string, unknown>,
) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throwSupabaseError(error, 'rpc');
  return data;
}

adminRouter.post('/tournament/start', asyncHandler(async (req, res) => {
  const { sb } = getAuthContext(req);
  res.json({ data: await runAdminRpc(sb, 'start_tournament') });
}));

adminRouter.post('/tournament/advance', asyncHandler(async (req, res) => {
  const { sb } = getAuthContext(req);
  res.json({ data: await runAdminRpc(sb, 'advance_round') });
}));

adminRouter.get('/disputes', asyncHandler(async (req, res) => {
  const { sb } = getAuthContext(req);
  const { data, error } = await sb.from('matches').select('*').eq('status', 'disputa').order('round');
  if (error) throwSupabaseError(error);
  res.json(data);
}));

adminRouter.post('/matches/:id/resolve', asyncHandler(async (req, res) => {
  const { sb } = getAuthContext(req);
  const matchId = requiredPositiveId(req.params.id, 'El id del partido');
  const body = requireBodyObject(req.body);
  const home = requiredInteger(body, 'home', 'home', 0, 99);
  const away = requiredInteger(body, 'away', 'away', 0, 99);
  res.json({ data: await runAdminRpc(sb, 'resolve_dispute', {
    p_match_id: matchId,
    p_home: home,
    p_away: away,
  }) });
}));
