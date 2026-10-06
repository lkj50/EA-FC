import { Router } from 'express';
import { getAuthContext } from '../middleware/auth.js';
import { asyncHandler, HttpError, throwSupabaseError } from '../middleware/error.js';

export const clubsRouter = Router();

clubsRouter.get('/', asyncHandler(async (req, res) => {
  const { sb } = getAuthContext(req);
  const { data, error } = await sb.from('clubs').select('*').order('name');
  if (error) throwSupabaseError(error);
  res.json(data);
}));

clubsRouter.get('/:id/players', asyncHandler(async (req, res) => {
  const { sb } = getAuthContext(req);
  const clubId = req.params.id;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clubId);
  const isInteger = /^\d+$/.test(clubId) && Number.isSafeInteger(Number(clubId));
  if (!isUuid && !isInteger) {
    throw new HttpError(400, 'El id del club debe ser un UUID o un número entero válido.');
  }
  const { data, error } = await sb.from('players').select('*').eq('club_id', clubId).order('name');
  if (error) throwSupabaseError(error);
  res.json(data);
}));
