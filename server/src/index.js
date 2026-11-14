import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = createApp({ webDir: path.join(here, '..', '..', 'client', 'dist') });
const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => console.log(`School ERP API running on http://localhost:${PORT}`));
