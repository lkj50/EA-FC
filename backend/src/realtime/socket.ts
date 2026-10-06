import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createUserClient, supabase } from '../lib/supabase.js';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from './types.js';

export function createSocketServer(
  httpServer: HttpServer,
): Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: '*' },
  });

  io.use(async (socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>, next) => {
    const token: unknown = socket.handshake.auth.token;
    if (typeof token !== 'string' || token.length === 0) {
      next(new Error('Token requerido.'));
      return;
    }

    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        next(new Error('Token inválido o expirado.'));
        return;
      }

      const userClient = createUserClient(token);
      const { data: profile, error: profileError } = await userClient
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();
      if (profileError) {
        next(new Error('No se pudo comprobar el rol del usuario.'));
        return;
      }

      socket.data.userId = data.user.id;
      socket.data.isAdmin = profile?.role === 'admin';
      next();
    } catch {
      next(new Error('No se pudo autenticar el socket.'));
    }
  });

  io.on('connection', (socket) => {
    void (async () => {
      try {
        await socket.join(`user:${socket.data.userId}`);
        if (socket.data.isAdmin) await socket.join('admins');
      } catch (error) {
        console.error('[Socket.io] No se pudieron asignar las salas del usuario:', error);
        socket.disconnect(true);
      }
    })();
  });

  return io;
}
