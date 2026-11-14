// The whole School ERP API as one Netlify Function (Functions API v2).
// The implementation is server/src/netlify.js, pre-bundled with all libraries into ../build/api.bundle.mjs
// by `npm --prefix server run build:function` (part of the Netlify build command).
export { default } from '../build/api.bundle.mjs';

// Serves /api/* and uploaded files; static files (e.g. the sample PDF) take priority.
export const config = { path: ['/api/*', '/uploads/*'], preferStatic: true };
