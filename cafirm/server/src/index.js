import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openNodeDatabase } from './db.js';
import { bootstrap } from './bootstrap.js';
import { generateFilings, currentFY } from './compliance.js';

openNodeDatabase();
bootstrap();
// Make sure every customer has this financial year's filings (cheap and idempotent).
generateFilings({ fy: currentFY() });
const here = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 4000;
createApp({ webDir: path.join(here, '..', '..', 'client', 'dist') }).listen(port, () => console.log(`CA firm platform running on http://localhost:${port}`));
