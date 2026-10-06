import 'dotenv/config';
import { io, type Socket } from 'socket.io-client';

type SocketEvent = {
  type: string;
  match: {
    id: number;
    status: string;
    home_id: string;
    away_id: string;
  };
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Configura ${name} para ejecutar la prueba de Socket.io.`);
  return value;
}

async function connect(socket: Socket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Tiempo agotado al conectar el socket.')), 10_000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Socket rechazado: ${error.message}`));
    });
  });
}

async function main(): Promise<void> {
  const apiUrl = required('TEST_API_URL').replace(/\/+$/, '');
  const localToken = required('TEST_LOCAL_TOKEN');
  const visitorToken = required('TEST_VISITOR_TOKEN');
  const rawMatchId = required('TEST_MATCH_ID');
  if (!/^\d+$/.test(rawMatchId)) {
    throw new Error('TEST_MATCH_ID debe ser un entero positivo.');
  }
  const matchId = Number(rawMatchId);
  if (!Number.isSafeInteger(matchId)) {
    throw new Error('TEST_MATCH_ID debe ser un entero positivo válido.');
  }
  const home = Number(process.env.TEST_HOME_SCORE ?? '2');
  const away = Number(process.env.TEST_AWAY_SCORE ?? '1');
  if (!Number.isInteger(home) || home < 0 || !Number.isInteger(away) || away < 0) {
    throw new Error('TEST_HOME_SCORE y TEST_AWAY_SCORE deben ser enteros no negativos.');
  }

  const localSocket = io(apiUrl, { auth: { token: localToken }, transports: ['websocket'] });
  const visitorSocket = io(apiUrl, { auth: { token: visitorToken }, transports: ['websocket'] });

  try {
    await Promise.all([connect(localSocket), connect(visitorSocket)]);
    console.info('Conectadas las dos sesiones autenticadas.');

    const notification = new Promise<SocketEvent>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('El visitante no recibió match:result_pending en 15 segundos.')), 15_000);
      visitorSocket.once('match:result_pending', (payload: SocketEvent) => {
        clearTimeout(timeout);
        resolve(payload);
      });
    });

    const response = await fetch(`${apiUrl}/matches/${matchId}/result`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ home, away }),
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const message = typeof body === 'object' && body !== null && 'error' in body
        && typeof body.error === 'string'
        ? body.error
        : `HTTP ${response.status}`;
      throw new Error(`POST /matches/:id/result falló: ${message}`);
    }

    const event = await notification;
    if (event.type !== 'match:result_pending' || event.match.id !== matchId || event.match.status !== 'pendiente') {
      throw new Error('La notificación recibida no contiene el partido pendiente esperado.');
    }
    console.info('PASS: el visitante recibió match:result_pending con el partido completo actualizado.');
  } finally {
    localSocket.disconnect();
    visitorSocket.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
