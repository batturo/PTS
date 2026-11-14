// Writes client/dist/_redirects so the Netlify site proxies API calls and uploaded files to the backend server.
// If BACKEND_URL is missing the site is still published, and every API call returns a clear setup message.
import fs from 'node:fs';

const backend = (process.env.BACKEND_URL || '').trim().replace(/\/$/, '');
const dist = 'client/dist';
if (!fs.existsSync(`${dist}/index.html`)) { console.error('✖ client/dist/index.html is missing – the website build did not run.'); process.exit(1); }

let rules;
if (/^https:\/\//.test(backend)) {
  rules = [`/api/*      ${backend}/api/:splat      200`, `/uploads/*  ${backend}/uploads/:splat  200`];
  console.log(`✔ Netlify will proxy /api and /uploads to ${backend}`);
} else {
  fs.writeFileSync(`${dist}/api-missing.json`, JSON.stringify({
    error: 'The website is not connected to its server yet. In Netlify → Site configuration → Environment variables, set BACKEND_URL to your Render link (e.g. https://pts-school-erp.onrender.com), then redeploy.',
  }));
  rules = ['/api/*  /api-missing.json  404'];
  console.warn('\n⚠ BACKEND_URL is not set – the site will load but cannot log in. Add BACKEND_URL in Netlify → Site configuration → Environment variables and redeploy.\n');
}
fs.writeFileSync(`${dist}/_redirects`, [...rules, '/*  /index.html  200'].join('\n') + '\n');
