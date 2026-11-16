import crypto from 'node:crypto';
import { db, tx } from './db.js';
import { hash } from './auth.js';
import { ENTITY_TYPES, TEMPLATES, REGISTRATION_TYPES } from './master-data.js';

/** First start: load the master lists and create the first Administrator login. Does nothing once data exists. */
export function bootstrap() {
  tx(() => {
    if (!db.prepare('SELECT 1 FROM entity_types LIMIT 1').get()) {
      ENTITY_TYPES.forEach(([code, name], i) => db.prepare('INSERT INTO entity_types (code,name,sort) VALUES (?,?,?)').run(code, name, i));
    }
    if (!db.prepare('SELECT 1 FROM templates LIMIT 1').get()) {
      for (const t of TEMPLATES) {
        const r = db.prepare('INSERT INTO templates (name,category,form_no,description,frequency,due_day,due_offset_months,schedule,condition) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(t.name, t.category, t.form_no ?? null, t.description ?? null, t.frequency, t.due_day ?? null, t.due_offset_months ?? 1, t.schedule ? JSON.stringify(t.schedule) : null, t.condition || '');
        for (const e of t.entities) db.prepare('INSERT INTO template_entities (template_id,entity_type) VALUES (?,?)').run(r.lastInsertRowid, e);
      }
    }
    if (!db.prepare('SELECT 1 FROM registration_types LIMIT 1').get()) {
      for (const [name, category, description, required_documents, timeline] of REGISTRATION_TYPES)
        db.prepare('INSERT INTO registration_types (name,category,description,required_documents,timeline) VALUES (?,?,?,?,?)').run(name, category, description, required_documents, timeline);
    }
  });
  // On Netlify there is no safe default password: unless ADMIN_PASSWORD is set, the first visitor creates the
  // Administrator on a setup screen, protected by a setup code (see routes/users.js).
  if (!db.prepare('SELECT 1 FROM users LIMIT 1').get() && !(process.env.SERVERLESS && !process.env.ADMIN_PASSWORD)) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    let password = process.env.ADMIN_PASSWORD;
    if (!password) {
      password = process.env.NODE_ENV === 'production' ? crypto.randomBytes(9).toString('base64url') : 'admin123';
      console.log(`\n  First-run Administrator login → username: ${username}   password: ${password}\n  (set ADMIN_USERNAME / ADMIN_PASSWORD to choose your own, and change it after logging in)\n`);
    }
    db.prepare("INSERT INTO users (username,password_hash,role,name) VALUES (?,?, 'admin', 'Administrator')").run(username, hash(password));
  }
}
