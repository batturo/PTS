import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { authenticate } from './auth.js';
import { authRouter, usersRouter } from './routes/users.js';
import { clientsRouter } from './routes/clients.js';
import { filingsRouter } from './routes/filings.js';
import { mastersRouter } from './routes/masters.js';
import { registrationsRouter } from './routes/registrations.js';
import { documentsRouter, MAX_MB } from './routes/documents.js';
import { notificationsRouter } from './routes/notifications.js';
import { dashboardRouter, auditRouter } from './routes/dashboard.js';

export function createApp({ webDir } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors()); // the mobile apps call the API from capacitor://localhost and https://localhost
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' }); next(); });

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api', authenticate); // everything below needs a login; documents are NOT served statically
  app.use('/api/users', usersRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/filings', filingsRouter);
  app.use('/api/registrations', registrationsRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api', mastersRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  if (webDir && fs.existsSync(webDir)) {
    app.use(express.static(webDir));
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(webDir, 'index.html')));
  }

  app.use((err, req, res, next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
    if (status >= 500) console.error(err);
    let msg = err.message;
    if (err.code === 'LIMIT_FILE_SIZE') msg = `File is too large (max ${MAX_MB} MB)`;
    else if (/UNIQUE constraint/.test(msg)) msg = 'A record with these details already exists';
    else if (status >= 500) msg = 'Something went wrong on the server';
    res.status(status).json({ error: msg });
  });
  return app;
}
