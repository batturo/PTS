// The one-time code needed to create the first Administrator on a hosted (Netlify) install.
// Taken from the SETUP_CODE environment variable, or from setup-code.generated.js, which the build writes
// (scripts/setup-code.mjs) and prints in the build log. Not used once an Administrator exists.
let generated = '';
try { generated = (await import('./setup-code.generated.js')).SETUP_CODE; } catch { /* not generated: normal server */ }
export const SETUP_CODE = process.env.SETUP_CODE || generated || '';
