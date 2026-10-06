import type { Request, RequestHandler } from 'express';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createUserClient, supabase } from '../lib/supabase.js';
import { asyncHandler, HttpError, throwSupabaseError } from './error.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      sb?: SupabaseClient;
    }
  }
}

export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const authorization = req.header('Authorization');
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    throw new HttpError(401, 'Debes enviar un token Bearer válido.');
  }

  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user) {
    throw new HttpError(401, 'El token es inválido o ha expirado.');
  }

  // Cada consulta protegida conserva el contexto JWT que evalúan auth.uid() y las políticas RLS.
  req.user = data.user;
  req.sb = createUserClient(match[1]);
  next();
});

export const requireAdmin: RequestHandler = asyncHandler(async (req, _res, next) => {
  const { sb, user } = getAuthContext(req);
  const { data, error } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (error) throwSupabaseError(error);
  if (data?.role !== 'admin') {
    throw new HttpError(403, 'Se requiere el rol de administrador.');
  }
  next();
});

export function getAuthContext(req: Request): { user: User; sb: SupabaseClient } {
  if (!req.user || !req.sb) {
    throw new HttpError(401, 'La solicitud requiere autenticación.');
  }
  return { user: req.user, sb: req.sb };
}
