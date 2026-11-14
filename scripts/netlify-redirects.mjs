// Writes client/dist/_redirects so the Netlify site proxies API calls and uploaded files to the backend server.
import fs from 'node:fs';
const backend = (process.env.BACKEND_URL || '').trim().replace(/\/$/, '');
if (!/^https:\/\//.test(backend)) {
  console.error('\n✖ BACKEND_URL is not set. In Netlify → Site configuration → Environment variables, add\n  BACKEND_URL = https://<your-render-service>.onrender.com   then redeploy.\n');
  process.exit(1);
}
fs.writeFileSync('client/dist/_redirects', [
  `/api/*      ${backend}/api/:splat      200`,
  `/uploads/*  ${backend}/uploads/:splat  200`,
  `/*          /index.html                200`,
].join('\n') + '\n');
console.log(`✔ Netlify will proxy /api and /uploads to ${backend}`);
