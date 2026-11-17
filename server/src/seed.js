// Seeds a demo school. Run: npm run seed   (use --reset to wipe the database first)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dataDir = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
if (process.argv.includes('--reset')) for (const f of ['school.db', 'school.db-wal', 'school.db-shm']) fs.rmSync(path.join(dataDir, f), { force: true });

const { seedDemo, isEmpty } = await import('./demo.js');
if (!isEmpty()) { console.log('Database already has users – run with --reset to re-seed.'); process.exit(0); }
const creds = seedDemo();
console.log('\nDemo school seeded. Logins:');
for (const [role, u, p] of creds) console.log(`  ${role.padEnd(11)} ${u.padEnd(12)} ${p}`);
console.log('  teacher     teacher2     teacher123   (2nd teacher: class teacher of 9-B, Science & more)');
console.log('  (other students: 2026002…2026006 / student123, parents: P2026002… / parent123)\n');
