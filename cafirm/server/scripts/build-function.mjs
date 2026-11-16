// Bundles the whole API (Express, sql.js, all libraries) into ONE self-contained file for the Netlify Function,
// so the deployed function never depends on node_modules being traced or copied.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import './embed-sqlwasm.mjs';
import './setup-code.mjs';

const server = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(server, '..', 'netlify', 'build', 'api.bundle.mjs');
await build({
  entryPoints: [path.join(server, 'src', 'netlify.js')],
  outfile, bundle: true, platform: 'node', format: 'esm', target: 'node20', minify: false, legalComments: 'none',
  // CommonJS libraries inside an ES module need require/__dirname/__filename. They are set on globalThis (only if
  // missing) rather than declared, so they never clash with the identical header Netlify's bundler adds.
  banner: { js: "import { createRequire as __nfCr } from 'node:module'; import { fileURLToPath as __nfFu } from 'node:url'; import { dirname as __nfDn } from 'node:path'; globalThis.require ??= __nfCr(import.meta.url); globalThis.__filename ??= __nfFu(import.meta.url); globalThis.__dirname ??= __nfDn(globalThis.__filename);" },
  logLevel: 'warning',
});
console.log(`✔ Bundled the API into ${path.relative(process.cwd(), outfile)}`);
