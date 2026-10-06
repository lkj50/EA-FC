import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { asyncHandler, HttpError, requireBodyObject, requiredString } from '../middleware/error.js';

export const authRouter = Router();

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requiredPassword(body: Record<string, unknown>): string {
  const password = body.password;
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new HttpError(400, 'La contraseña es obligatoria y debe tener entre 8 y 128 caracteres.');
  }
  return password;
}

function sessionResponse(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}, user: unknown) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? null,
    user,
  };
}

authRouter.post('/register', asyncHandler(async (req, res) => {
  const body = requireBodyObject(req.body);
  const email = requiredString(body, 'email', 'El correo', 3, 254).toLowerCase();
  const password = requiredPassword(body);
  const username = requiredString(body, 'username', 'El nombre de usuario', 3, 24);

  if (!validEmail(email)) throw new HttpError(400, 'El correo electrónico no tiene un formato válido.');
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    throw new HttpError(400, 'El nombre de usuario solo puede contener letras, números y guion bajo.');
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) throw new HttpError(400, error.message);
  if (!data.session) {
    res.status(202).json({
      access_token: null,
      refresh_token: null,
      expires_at: null,
      user: data.user,
      message: 'Confirma tu correo antes de iniciar sesión; Supabase todavía no emitió tokens.',
    });
    return;
  }
  res.status(201).json(sessionResponse(data.session, data.user));
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const body = requireBodyObject(req.body);
  const email = requiredString(body, 'email', 'El correo', 3, 254).toLowerCase();
  const password = requiredPassword(body);
  if (!validEmail(email)) throw new HttpError(400, 'El correo electrónico no tiene un formato válido.');

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new HttpError(401, 'Correo o contraseña incorrectos.');
  }
  res.json(sessionResponse(data.session, data.user));
}));

authRouter.post('/refresh', asyncHandler(async (req, res) => {
  const body = requireBodyObject(req.body);
  const refreshToken = requiredString(body, 'refresh_token', 'El refresh_token', 1, 4096);
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) {
    throw new HttpError(401, 'El refresh_token es inválido o ha expirado.');
  }
  res.json(sessionResponse(data.session, data.user));
}));
