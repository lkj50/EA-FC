import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { env } from './config/env.js';
import { requireAdmin, requireAuth } from './middleware/auth.js';
import { errorMiddleware, HttpError } from './middleware/error.js';
import { startRealtimeListener } from './realtime/listener.js';
import { createSocketServer } from './realtime/socket.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { clubsRouter } from './routes/clubs.js';
import { lineupRouter } from './routes/lineup.js';
import { matchesRouter } from './routes/matches.js';
import { meRouter } from './routes/me.js';
import { rouletteRouter } from './routes/roulette.js';
import { tournamentRouter } from './routes/tournament.js';

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use(requireAuth);
app.use('/me', meRouter);
app.use('/roulette', rouletteRouter);
app.use('/clubs', clubsRouter);
app.use('/tournament', tournamentRouter);
app.use('/matches', matchesRouter);
app.use('/lineup', lineupRouter);
app.use('/admin', requireAdmin, adminRouter);

app.use((_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada.')));
app.use(errorMiddleware);

const httpServer = createServer(app);
const io = createSocketServer(httpServer);
const realtimeListener = startRealtimeListener(io);

httpServer.listen(env.port, '0.0.0.0', () => {
  console.log(`Backend EA FC disponible en http://0.0.0.0:${env.port}`);
});

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`\n${signal}: cerrando backend.`);
  void (async () => {
    await realtimeListener.close();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    console.info('Backend cerrado correctamente.');
  })().catch((error: unknown) => {
    console.error('Error al cerrar el backend:', error);
    process.exitCode = 1;
  });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
