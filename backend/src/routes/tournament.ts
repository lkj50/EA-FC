import { Router } from 'express';
import { getAuthContext } from '../middleware/auth.js';
import { asyncHandler, throwSupabaseError } from '../middleware/error.js';

export const tournamentRouter = Router();

tournamentRouter.get('/', asyncHandler(async (req, res) => {
  const { sb } = getAuthContext(req);
  const { data, error } = await sb.from('tournaments').select('*').eq('id', 1).maybeSingle();
  if (error) throwSupabaseError(error);
  res.json({ tournament: data, current_date: new Date().toISOString() });
}));

tournamentRouter.get('/standings', asyncHandler(async (req, res) => {
  const { sb } = getAuthContext(req);
  const { data, error } = await sb.from('standings').select('*').order('pts', { ascending: false });
  if (error) throwSupabaseError(error);
  res.json(data);
}));
