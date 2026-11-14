import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import './db.js';
import { authenticate } from './auth.js';
import { authRouter, usersRouter, studentsRouter } from './routes/users.js';
import { academicsRouter } from './routes/academics.js';
import { feesRouter } from './routes/fees.js';
import { payrollRouter } from './routes/payroll.js';
import { libraryRouter } from './routes/library.js';
import { transportRouter } from './routes/transport.js';
import { miscRouter, UPLOAD_DIR } from './routes/misc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
app.use('/api', academicsRouter);
app.use('/api', miscRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built website (client/dist) from the same server
const web = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(web)) {
  app.use(express.static(web));
  app.get(/^(?!\/(api|uploads)\/).*/, (req, res) => res.sendFile(path.join(web, 'index.html')));
}

app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
  if (status >= 500) console.error(err);
  let msg = err.message;
  if (/UNIQUE constraint/.test(msg)) msg = 'A record with these details already exists';
  else if (status >= 500) msg = 'Something went wrong on the server';
  res.status(status).json({ error: msg });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => console.log(`School ERP API running on http://localhost:${PORT}`));
