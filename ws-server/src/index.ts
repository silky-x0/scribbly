import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT ?? 3001);
// Allow a comma-separated list in prod, single URL in dev.
const CLIENT_URLS = (process.env.CLIENT_URL ?? 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(cors({ origin: CLIENT_URLS }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Placeholder for Phase 1 public room browser.
app.get('/api/rooms/public', (_req, res) => {
  res.json({ rooms: [] });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_URLS },
  transports: ['websocket', 'polling'],
});

io.on('connection', (socket) => {
  console.log(`[ws] connected: ${socket.id}`);

  // Phase 0 smoke signal — client logs "connected" on receipt.
  socket.emit('connected', { socketId: socket.id });

  socket.on('disconnect', (reason) => {
    console.log(`[ws] disconnected: ${socket.id} (${reason})`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[ws-server] listening on :${PORT}`);
  console.log(`[ws-server] allowed origins: ${CLIENT_URLS.join(', ')}`);
});
