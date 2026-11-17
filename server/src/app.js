import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authenticate } from './auth.js';
import { authRouter, usersRouter, studentsRouter } from './routes/users.js';
import { academicsRouter } from './routes/academics.js';
import { feesRouter } from './routes/fees.js';
import { payrollRouter } from './routes/payroll.js';
import { libraryRouter } from './routes/library.js';
import { transportRouter } from './routes/transport.js';
import { miscRouter, UPLOAD_DIR, MAX_UPLOAD_MB } from './routes/misc.js';
import { structureRouter } from './routes/structure.js';


/**
 * Builds the Express app. Options:
 *  webDir     – folder with the built website to serve (normal server only)
 *  loadUpload – async (name) => { body, contentType } | null, for uploads stored outside the local disk
 */
export function createApp({ webDir, loadUpload } = {}) {
  const app = express();
  app.use(cors()); // the mobile apps call the API from capacitor://localhost / https://localhost
  app.use(express.json({ limit: '2mb' }));
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api', (req, res, next) => (req.path === '/settings/public' ? next() : authenticate(req, res, next)));
  app.use('/api/users', usersRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/fees', feesRouter);
  app.use('/api/payroll', payrollRouter);
  app.use('/api/library', libraryRouter);
  app.use('/api/transport', transportRouter);
  app.use('/api', structureRouter);
  app.use('/api', academicsRouter);
  app.use('/api', miscRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  if (loadUpload) app.get('/uploads/:name', async (req, res) => {
    const f = await loadUpload(req.params.name);
    if (!f) return res.status(404).json({ error: 'File not found' });
    res.set('Content-Type', f.contentType || 'application/octet-stream').set('Cache-Control', 'public, max-age=604800').send(f.body);
  });

  // Serve the built website (client/dist) from the same server
  if (webDir && fs.existsSync(webDir)) {
    app.use(express.static(webDir));
    app.get(/^(?!\/(api|uploads)\/).*/, (req, res) => res.sendFile(path.join(webDir, 'index.html')));
  }

  app.use((err, req, res, next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
    if (status >= 500) console.error(err);
    let msg = err.message;
    if (err.code === 'LIMIT_FILE_SIZE') msg = `File is too large (max ${MAX_UPLOAD_MB} MB). For videos, paste a YouTube link instead.`;
    else if (/UNIQUE constraint/.test(msg)) msg = 'A record with these details already exists';
    else if (status >= 500) msg = 'Something went wrong on the server';
    res.status(status).json({ error: msg });
  });
  return app;
}
