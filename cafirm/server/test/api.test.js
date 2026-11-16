import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cafirm-'));
process.env.ADMIN_PASSWORD = 'admin-pass-1';
const { createApp } = await import('../src/app.js');
const { bootstrap } = await import('../src/bootstrap.js');
const { periodsFor, fyOf } = await import('../src/compliance.js');
const { openNodeDatabase } = await import('../src/db.js');
openNodeDatabase();
bootstrap();
const server = createApp().listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
test.after(() => server.close());

async function call(method, url, { token, body, form } = {}) {
  const r = await fetch(base + url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: form || (body ? JSON.stringify(body) : undefined) });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, data: ct.includes('json') ? await r.json() : await r.text() };
}
const login = async (u, p) => (await call('POST', '/auth/login', { body: { username: u, password: p } })).data.token;
const S = {};

test('financial-year and due-date rules', () => {
  assert.equal(fyOf('2026-03-31'), '2025-26');
  assert.equal(fyOf('2026-04-01'), '2026-27');
  const monthly = periodsFor({ frequency: 'monthly', due_day: 20, due_offset_months: 1 }, '2026-27');
  assert.equal(monthly.length, 12);
  assert.deepEqual(monthly[0], { label: 'Apr 2026', due: '2026-05-20' });
  assert.deepEqual(monthly[11], { label: 'Mar 2027', due: '2027-04-20' });
  const tds = periodsFor({ frequency: 'custom', schedule: [{ label: 'Q4', month: 5, day: 31, year_offset: 1 }] }, '2026-27');
  assert.equal(tds[0].due, '2027-05-31');
  assert.equal(periodsFor({ frequency: 'monthly', due_day: 31, due_offset_months: 1 }, '2026-27')[9].due, '2027-02-28'); // Jan → Feb clamps to 28
});

test('login, wrong password, auth required', async () => {
  assert.equal((await call('GET', '/dashboard')).status, 401);
  assert.equal((await call('POST', '/auth/login', { body: { username: 'admin', password: 'nope' } })).status, 401);
  S.admin = await login('admin', 'admin-pass-1');
  assert.ok(S.admin);
});

test('admin creates a customer organisation with a login, and staff users', async () => {
  const c = await call('POST', '/clients', { token: S.admin, body: { name: 'Test Pvt Ltd', entity_type: 'pvt_ltd', pan: 'ABCDE1234F', gstin: '29ABCDE1234F1Z5', has_employees: true, login: { username: 'cust1', password: 'password1' } } });
  assert.equal(c.status, 201);
  assert.ok(c.data.filings_created > 20);
  S.client = c.data.id;
  const c2 = await call('POST', '/clients', { token: S.admin, body: { name: 'Solo Person', entity_type: 'individual', pan: 'ABCDE1234G', login: { username: 'cust2', password: 'password2' } } });
  S.client2 = c2.data.id;
  assert.equal((await call('POST', '/users', { token: S.admin, body: { username: 'ca1', password: 'password1', role: 'ca', name: 'CA One' } })).status, 201);
  assert.equal((await call('POST', '/users', { token: S.admin, body: { username: 'int1', password: 'password1', role: 'intern', name: 'Intern One' } })).status, 201);
  assert.equal((await call('POST', '/users', { token: S.admin, body: { username: 'bad', password: 'short', role: 'ca', name: 'x' } })).status, 400);
  S.ca = await login('ca1', 'password1'); S.intern = await login('int1', 'password1'); S.cust = await login('cust1', 'password1'); S.cust2 = await login('cust2', 'password2');
});

test('compliances depend on institution type and registration flags', async () => {
  const names = (await call('GET', '/filings', { token: S.cust })).data.map((f) => f.name);
  assert.ok(names.some((n) => n.startsWith('GSTR-3B')));
  assert.ok(names.some((n) => n.startsWith('AOC-4')));
  assert.ok(names.some((n) => n.startsWith('Provident Fund')));
  assert.ok(!names.some((n) => n.startsWith('TDS'))); // tds_applicable not set
  const ind = (await call('GET', '/filings', { token: S.cust2 })).data.map((f) => f.name);
  assert.ok(ind.some((n) => n.startsWith('Income Tax Return – non-audit')));
  assert.ok(!ind.some((n) => n.startsWith('GSTR')) && !ind.some((n) => n.startsWith('AOC-4')));
});

test('customers are isolated to their own organisation and never see staff-only fields', async () => {
  const mine = (await call('GET', '/filings', { token: S.cust })).data;
  assert.ok(mine.every((f) => f.client_id === S.client));
  assert.ok(mine.every((f) => !('internal_notes' in f)));
  const other = (await call('GET', '/filings', { token: S.cust2 })).data[0];
  assert.equal((await call('GET', `/filings/${other.id}`, { token: S.cust })).status, 404);
  assert.equal((await call('GET', `/filings?client_id=${S.client2}`, { token: S.cust })).data.every((f) => f.client_id === S.client), true);
  for (const [m, u] of [['GET', '/clients'], ['GET', '/users'], ['GET', '/audit'], ['GET', '/templates']]) assert.equal((await call(m, u, { token: S.cust })).status, 403, u);
  assert.equal((await call('PATCH', `/filings/${mine[0].id}`, { token: S.cust, body: { status: 'filed' } })).status, 403);
});

test('CA and intern update filing status; customer is notified; history recorded', async () => {
  const f = (await call('GET', `/filings?client_id=${S.client}&q=GSTR-3B`, { token: S.ca })).data[0];
  const r = await call('PATCH', `/filings/${f.id}`, { token: S.ca, body: { status: 'in_progress', internal_notes: 'waiting on sales register', message: 'We have started your return.' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'in_progress');
  const r2 = await call('PATCH', `/filings/${f.id}`, { token: S.intern, body: { status: 'filed', ack_no: 'ARN123' } });
  assert.equal(r2.data.filed_on, new Date().toISOString().slice(0, 10));
  const view = (await call('GET', `/filings/${f.id}`, { token: S.cust })).data;
  assert.equal(view.status, 'filed'); assert.equal(view.history.length, 2); assert.ok(!('internal_notes' in view));
  const n = (await call('GET', '/notifications', { token: S.cust })).data;
  assert.equal(n.length, 2);
  assert.equal((await call('GET', '/notifications/unread-count', { token: S.cust })).data.count, 2);
  await call('POST', '/notifications/read-all', { token: S.cust });
  assert.equal((await call('GET', '/notifications/unread-count', { token: S.cust })).data.count, 0);
  // Only the admin can change due dates.
  assert.equal((await call('PATCH', `/filings/${f.id}`, { token: S.ca, body: { due_date: '2030-01-01' } })).status, 403);
  assert.equal((await call('PATCH', `/filings/${f.id}`, { token: S.admin, body: { due_date: '2030-01-01' } })).status, 200);
});

test('staff can send notifications to one client, a type of institution, or everyone', async () => {
  assert.equal((await call('POST', '/notifications/send', { token: S.ca, body: { client_ids: [S.client], title: 'Hello', body: 'Please share bank statements' } })).data.people, 1);
  assert.equal((await call('POST', '/notifications/send', { token: S.intern, body: { entity_type: 'individual', title: 'ITR season' } })).data.organisations >= 1, true);
  assert.equal((await call('POST', '/notifications/send', { token: S.ca, body: { title: 'x' } })).status, 400);
  assert.equal((await call('POST', '/notifications/send', { token: S.cust, body: { all: true, title: 'x' } })).status, 403);
});

test('admin due-date change applies to all customers and can notify them', async () => {
  const t = (await call('GET', '/templates', { token: S.admin })).data.find((x) => x.name.startsWith('GSTR-3B'));
  const fy = fyOf();
  const periods = (await call('GET', `/templates/${t.id}/due-dates?fy=${fy}`, { token: S.admin })).data;
  const p = periods[3];
  const r = await call('PUT', `/templates/${t.id}/due-dates`, { token: S.admin, body: { fy, period_label: p.period_label, due_date: '2031-02-02', reason: 'Govt extension', notify: true } });
  assert.equal(r.status, 200); assert.ok(r.data.filings_updated >= 1);
  const f = (await call('GET', `/filings?client_id=${S.client}&q=GSTR-3B`, { token: S.admin })).data.find((x) => x.period_label === p.period_label);
  assert.equal(f.due_date, '2031-02-02');
  assert.equal((await call('PUT', `/templates/${t.id}/due-dates`, { token: S.ca, body: { fy, period_label: p.period_label, due_date: '2031-02-03' } })).status, 403);
  // new clients get the overridden date too
  const c = await call('POST', '/clients', { token: S.admin, body: { name: 'Late Joiner', entity_type: 'proprietorship', gstin: '29ABCDE1234F1Z5' } });
  const g = (await call('GET', `/filings?client_id=${c.data.id}&fy=${fy}&q=GSTR-3B`, { token: S.admin })).data.find((x) => x.period_label === p.period_label);
  assert.equal(g.due_date, '2031-02-02');
  await call('DELETE', `/templates/${t.id}/due-dates`, { token: S.admin, body: { fy, period_label: p.period_label } });
  assert.equal((await call('GET', `/filings/${f.id}`, { token: S.admin })).data.due_date, p.standard_due);
});

test('admin edits master data: new compliance reaches matching clients; staff cannot', async () => {
  const body = { name: 'Custom Return', category: 'Other', frequency: 'annual', schedule: [{ label: 'Annual', month: 8, day: 15, year_offset: 1 }], entities: ['individual'] };
  assert.equal((await call('POST', '/templates', { token: S.ca, body })).status, 403);
  const r = await call('POST', '/templates', { token: S.admin, body });
  assert.equal(r.status, 201); assert.equal(r.data.filings_created >= 1, true);
  assert.ok((await call('GET', '/filings?q=Custom Return', { token: S.cust2 })).data.length === 1);
  assert.equal((await call('POST', '/templates', { token: S.admin, body: { ...body, entities: [] } })).status, 400);
});

test('registrations: customer applies, staff update, duplicate blocked, admin manages types', async () => {
  const types = (await call('GET', '/registration-types', { token: S.cust })).data;
  assert.ok(types.length >= 15);
  const gst = types.find((t) => t.name === 'GST registration');
  const r = await call('POST', '/registrations', { token: S.cust2, body: { type_id: gst.id, applicant_notes: 'Starting a small business' } });
  assert.equal(r.status, 201);
  assert.equal((await call('POST', '/registrations', { token: S.cust2, body: { type_id: gst.id } })).status, 409);
  assert.equal((await call('PATCH', `/registrations/${r.data.id}`, { token: S.cust2, body: { status: 'completed' } })).status, 403);
  const u = await call('PATCH', `/registrations/${r.data.id}`, { token: S.intern, body: { status: 'documents_pending', message: 'Send PAN + Aadhaar', staff_notes: 'internal' } });
  assert.equal(u.status, 200);
  const mine = (await call('GET', '/registrations', { token: S.cust2 })).data[0];
  assert.equal(mine.status, 'documents_pending'); assert.ok(!('staff_notes' in mine));
  assert.equal((await call('GET', '/registrations', { token: S.cust })).data.length, 0);
  assert.equal((await call('POST', '/registration-types', { token: S.admin, body: { name: 'Test reg', category: 'Licences' } })).status, 201);
  assert.equal((await call('POST', '/registration-types', { token: S.ca, body: { name: 'x', category: 'y' } })).status, 403);
});

test('documents: staff upload, customer downloads only own visible files', async () => {
  const f = (await call('GET', `/filings?client_id=${S.client}`, { token: S.ca })).data[0];
  const form = new FormData();
  form.set('client_id', S.client); form.set('filing_id', f.id); form.set('kind', 'tax_report'); form.set('title', 'Computation');
  form.set('file', new Blob(['hello world'], { type: 'text/plain' }), 'comp.txt');
  const up = await call('POST', '/documents', { token: S.ca, form });
  assert.equal(up.status, 201);
  const hidden = new FormData(); hidden.set('client_id', S.client); hidden.set('visible_to_client', '0'); hidden.set('file', new Blob(['secret']), 'internal.txt');
  const h = await call('POST', '/documents', { token: S.intern, form: hidden });
  assert.equal((await call('GET', '/documents', { token: S.cust })).data.length, 1);
  assert.equal((await call('GET', `/documents/${up.data.id}/download`, { token: S.cust })).data, 'hello world');
  assert.equal((await call('GET', `/documents/${h.data.id}/download`, { token: S.cust })).status, 404);
  assert.equal((await call('GET', `/documents/${up.data.id}/download`, { token: S.cust2 })).status, 404);
  assert.equal((await call('GET', `/documents/${up.data.id}/download`)).status, 401);
  const bad = new FormData(); bad.set('client_id', S.client); bad.set('file', new Blob(['x']), 'evil.exe');
  assert.equal((await call('POST', '/documents', { token: S.ca, form: bad })).status, 400);
  const wrong = new FormData(); wrong.set('client_id', S.client2); wrong.set('filing_id', f.id); wrong.set('file', new Blob(['x']), 'a.txt');
  assert.equal((await call('POST', '/documents', { token: S.ca, form: wrong })).status, 400); // filing belongs to another client
  const own = new FormData(); own.set('client_id', S.client2); own.set('file', new Blob(['x']), 'mine.txt');
  assert.equal((await call('POST', '/documents', { token: S.cust, form: own })).data.client_id, S.client); // client_id ignored for customers
  assert.equal((await call('DELETE', `/documents/${up.data.id}`, { token: S.intern })).status, 403);
  assert.equal((await call('DELETE', `/documents/${up.data.id}`, { token: S.admin })).status, 200);
});

test('user admin: only admin, disable blocks login, self-lockout prevented', async () => {
  assert.equal((await call('GET', '/users', { token: S.ca })).status, 403);
  const users = (await call('GET', '/users', { token: S.admin })).data;
  const ca1 = users.find((u) => u.username === 'ca1'), me = users.find((u) => u.username === 'admin');
  assert.equal((await call('PUT', `/users/${me.id}`, { token: S.admin, body: { active: false } })).status, 400);
  await call('PUT', `/users/${ca1.id}`, { token: S.admin, body: { active: false } });
  assert.equal((await call('GET', '/dashboard', { token: S.ca })).status, 401);
  assert.equal((await call('POST', '/auth/login', { body: { username: 'ca1', password: 'password1' } })).status, 403);
  await call('PUT', `/users/${ca1.id}`, { token: S.admin, body: { active: true } });
  await call('POST', `/users/${ca1.id}/reset-password`, { token: S.admin, body: { password: 'newpassword1' } });
  assert.ok(await login('ca1', 'newpassword1'));
});

test('dashboards and audit log', async () => {
  const d = (await call('GET', '/dashboard', { token: S.admin })).data;
  assert.ok(d.stats.clients >= 3); assert.ok(d.upcoming.length);
  const c = (await call('GET', '/dashboard', { token: S.cust })).data;
  assert.ok(!('clients' in c.stats)); assert.ok(c.upcoming.every((f) => !f.client_name || f.client_id === S.client));
  const a = (await call('GET', '/audit', { token: S.admin })).data;
  assert.ok(a.some((x) => x.action === 'update_filing'));
  assert.equal((await call('GET', '/audit', { token: S.ca })).status, 403);
});
