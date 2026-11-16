// Demo data: `npm run seed` (adds a demo firm on top of an empty database; `-- --reset` wipes everything first).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, UPLOAD_DIR, db, tx, openNodeDatabase } from './db.js';
openNodeDatabase();
import { hash } from './auth.js';

if (process.argv.includes('--reset')) {
  db.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('Database wiped. Run `npm run seed` again to create the demo data.');
  process.exit(0);
}
const { bootstrap } = await import('./bootstrap.js');
const { generateFilings, currentFY, fyOf } = await import('./compliance.js');
const { notifyClient } = await import('./notify.js');
bootstrap();
if (db.prepare("SELECT 1 FROM users WHERE role!='admin' LIMIT 1").get()) { console.log('Demo data already present.'); process.exit(0); }

const user = (username, password, role, name, client_id = null, email = null) =>
  Number(db.prepare('INSERT INTO users (username,password_hash,role,name,client_id,email) VALUES (?,?,?,?,?,?)').run(username, hash(password), role, name, client_id, email).lastInsertRowid);
const client = (c) => Number(db.prepare('INSERT INTO clients (name,entity_type,pan,gstin,cin,email,phone,address,gst_registered,has_employees,tds_applicable) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
  .run(c.name, c.entity_type, c.pan, c.gstin ?? null, c.cin ?? null, c.email, c.phone, c.address, c.gstin ? 1 : 0, c.employees ? 1 : 0, c.tds ? 1 : 0).lastInsertRowid);

tx(() => {
  db.prepare("UPDATE users SET password_hash=? WHERE role='admin'").run(hash('admin123'));
  const ca = user('ca', 'ca123456', 'ca', 'CA Meera Iyer');
  const intern = user('intern', 'intern123', 'intern', 'Arjun Das');
  const acme = client({ name: 'Acme Textiles Pvt Ltd', entity_type: 'pvt_ltd', pan: 'AABCA1234C', gstin: '29AABCA1234C1Z5', cin: 'U17110KA2018PTC123456', email: 'accounts@acme.example', phone: '9800000001', address: 'Peenya Industrial Area, Bengaluru', employees: 1, tds: 1 });
  const ravi = client({ name: 'Ravi Kumar Traders', entity_type: 'proprietorship', pan: 'BKLPR5678K', gstin: '29BKLPR5678K1Z2', email: 'ravi@traders.example', phone: '9800000002', address: 'Chickpet, Bengaluru' });
  const sunita = client({ name: 'Sunita Sharma', entity_type: 'individual', pan: 'CDEPS9012L', email: 'sunita@example.com', phone: '9800000003', address: 'Indiranagar, Bengaluru' });
  const trust = client({ name: 'Sarvodaya Education Trust', entity_type: 'trust_society', pan: 'AAATS3456T', email: 'office@sarvodaya.example', phone: '9800000004', address: 'Mysuru', employees: 1 });
  const acmeUser = user('acme', 'customer123', 'customer', 'Acme Textiles – Accounts', acme, 'accounts@acme.example');
  user('ravi', 'customer123', 'customer', 'Ravi Kumar', ravi);
  user('sunita', 'customer123', 'customer', 'Sunita Sharma', sunita);
  user('sarvodaya', 'customer123', 'customer', 'Sarvodaya Trust Office', trust);

  // Last financial year and this one.
  const fy = currentFY(), prev = fyOf(`${Number(fy.slice(0, 4)) - 1}-06-01`);
  generateFilings({ fy: prev }); generateFilings({ fy });

  // Make the data look lived-in: old filings are filed, a few are late, near-term ones are being worked on.
  const today = new Date().toISOString().slice(0, 10);
  const stamp = crypto.createHash('md5');
  for (const f of db.prepare('SELECT id, due_date FROM filings ORDER BY id').all()) {
    const bucket = parseInt(crypto.createHash('md5').update(String(f.id)).digest('hex').slice(0, 4), 16) % 100;
    const days = Math.round((Date.parse(f.due_date) - Date.parse(today)) / 86400000);
    let status = 'not_started';
    if (days < -45) status = bucket < 94 ? 'filed' : 'in_progress';
    else if (days < 0) status = bucket < 70 ? 'filed' : bucket < 85 ? 'awaiting_documents' : 'in_progress';
    else if (days < 15) status = bucket < 40 ? 'in_progress' : bucket < 60 ? 'awaiting_documents' : 'not_started';
    else if (days < 40) status = bucket < 25 ? 'in_progress' : 'not_started';
    const assignee = bucket % 2 ? ca : intern;
    db.prepare("UPDATE filings SET status=?, filed_on=CASE WHEN ?='filed' THEN date(due_date,'-2 day') END, ack_no=CASE WHEN ?='filed' THEN 'ACK' || (100000+id*7) END, assigned_to=? WHERE id=?").run(status, status, status, assignee, f.id);
  }

  // A sample document and some messages.
  const stored = crypto.randomBytes(16).toString('hex') + '.txt';
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), 'Sample tax computation sheet (demo file).\nAcme Textiles Pvt Ltd – FY summary\n');
  db.prepare("INSERT INTO documents (client_id,title,kind,original_name,stored_name,mime,size,uploaded_by) VALUES (?,?,?,?,?,?,?,?)")
    .run(acme, 'Tax computation – sample', 'tax_report', 'tax-computation.txt', stored, 'text/plain', 90, ca);
  const lateFiling = db.prepare("SELECT id FROM filings WHERE client_id=? AND status='awaiting_documents' ORDER BY due_date LIMIT 1").get(acme);
  notifyClient(acme, { title: 'Welcome to the client portal', body: 'You can now track every compliance, due date and filing status here. Message us any time.', sender_id: ca });
  if (lateFiling) notifyClient(acme, { title: 'Documents needed', body: 'Please upload the purchase register and bank statements so we can complete this filing.', filing_id: lateFiling.id, sender_id: intern });
  db.prepare("INSERT INTO registration_requests (client_id,type_id,status,applicant_notes,created_by,assigned_to) VALUES (?,(SELECT id FROM registration_types WHERE name LIKE 'Trademark%'),'in_progress','Brand name: ACME Weave',?,?)").run(acme, acmeUser, ca);
});
console.log(`Demo data created.
  admin / admin123      Administrator
  ca / ca123456         CA
  intern / intern123    Intern
  acme / customer123    Customer (Private Limited)   also: ravi, sunita, sarvodaya`);
