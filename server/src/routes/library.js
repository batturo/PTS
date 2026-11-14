import { Router } from 'express';
import { db, tx, num } from '../db.js';
import { allow, isFamily, myStudent } from '../auth.js';
import { bad, notFound, pick, insert, update, today, round2, daysBetween } from '../util.js';

export const libraryRouter = Router();
const LIB = 'librarian';
const BOOK_FIELDS = ['accession_no', 'title', 'author', 'genre', 'isbn', 'publisher', 'cabinet_no', 'shelf_no', 'row_no', 'column_no'];

const withFine = (i) => {
  const overdue = Math.max(0, daysBetween(i.due_date, i.return_date || today()));
  return { ...i, overdue_days: overdue, fine: i.return_date ? i.fine : round2(overdue * num('library_fine_per_day')),
    status: i.return_date ? 'Returned' : overdue > 0 ? 'Overdue' : 'Issued' };
};

// ---------- Inventory ----------
libraryRouter.get('/books', allow(LIB, 'teacher'), (req, res) => {
  const { q, genre, available } = req.query;
  const where = ['1=1'], args = [];
  if (q) { where.push('(title LIKE ? OR author LIKE ? OR accession_no LIKE ? OR isbn LIKE ?)'); args.push(...Array(4).fill(`%${q}%`)); }
  if (genre) { where.push('genre=?'); args.push(genre); }
  if (available === '1') where.push('available_copies>0');
  res.json(db.prepare(`SELECT * FROM books WHERE ${where.join(' AND ')} ORDER BY title LIMIT 2000`).all(...args));
});
libraryRouter.get('/stats', allow(LIB), (req, res) => {
  const issues = db.prepare('SELECT * FROM book_issues WHERE return_date IS NULL').all().map(withFine);
  res.json({
    titles: db.prepare('SELECT COUNT(*) c FROM books').get().c,
    copies: db.prepare('SELECT COALESCE(SUM(total_copies),0) c FROM books').get().c,
    available: db.prepare('SELECT COALESCE(SUM(available_copies),0) c FROM books').get().c,
    issued: issues.length, overdue: issues.filter(i => i.status === 'Overdue').length,
    genres: db.prepare("SELECT genre, COUNT(*) AS titles, SUM(total_copies) AS copies FROM books GROUP BY genre ORDER BY copies DESC").all(),
  });
});
libraryRouter.post('/books', allow(LIB), (req, res) => {
  const d = pick(req.body, BOOK_FIELDS);
  if (!d.title || !d.author) throw bad('Book name and author are required');
  const copies = Math.max(1, Number(req.body.total_copies) || 1);
  if (d.accession_no && db.prepare('SELECT 1 FROM books WHERE accession_no=?').get(d.accession_no)) throw bad('Accession number already exists');
  const id = insert(db, 'books', { ...d, total_copies: copies, available_copies: copies });
  if (!d.accession_no) db.prepare('UPDATE books SET accession_no=? WHERE id=?').run(`ACC${String(id).padStart(5, '0')}`, id);
  res.json({ id });
});
libraryRouter.put('/books/:id', allow(LIB), (req, res) => {
  const b = db.prepare('SELECT * FROM books WHERE id=?').get(req.params.id);
  if (!b) throw notFound('Book');
  const d = pick(req.body, BOOK_FIELDS);
  if (req.body.total_copies != null) {
    const issued = b.total_copies - b.available_copies, total = Number(req.body.total_copies);
    if (total < issued) throw bad(`${issued} copies are currently issued; total cannot be less than that`);
    Object.assign(d, { total_copies: total, available_copies: total - issued });
  }
  update(db, 'books', b.id, d);
  res.json({ ok: true });
});
libraryRouter.delete('/books/:id', allow(LIB), (req, res) => {
  if (db.prepare('SELECT 1 FROM book_issues WHERE book_id=? AND return_date IS NULL').get(req.params.id)) throw bad('This book has copies issued. Collect them before removing it.');
  tx(() => { db.prepare('DELETE FROM book_issues WHERE book_id=?').run(req.params.id); db.prepare('DELETE FROM books WHERE id=?').run(req.params.id); });
  res.json({ ok: true });
});

// ---------- Issue / return ----------
const ISSUE_SQL = `SELECT i.*, b.title, b.author, b.accession_no, s.name AS student_name, s.admission_no, s.class, s.section
  FROM book_issues i JOIN books b ON b.id=i.book_id JOIN students s ON s.id=i.student_id`;
libraryRouter.get('/issues', allow(LIB), (req, res) => {
  const { status = 'Active', q } = req.query;
  const where = [status === 'Returned' ? 'i.return_date IS NOT NULL' : status === 'All' ? '1=1' : 'i.return_date IS NULL'], args = [];
  if (q) { where.push('(s.name LIKE ? OR s.admission_no LIKE ? OR b.title LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  let rows = db.prepare(`${ISSUE_SQL} WHERE ${where.join(' AND ')} ORDER BY i.due_date LIMIT 2000`).all(...args).map(withFine);
  if (status === 'Overdue') rows = rows.filter(r => r.status === 'Overdue');
  res.json(rows);
});
libraryRouter.post('/issue', allow(LIB), (req, res) => {
  const { book_id, admission_no, days } = req.body;
  const s = db.prepare('SELECT * FROM students WHERE admission_no=? AND active=1').get(String(admission_no || '').trim());
  if (!s) throw bad('No active student with that admission number');
  const b = db.prepare('SELECT * FROM books WHERE id=?').get(book_id);
  if (!b) throw notFound('Book');
  if (b.available_copies < 1) throw bad('No copies of this book are available');
  const held = db.prepare('SELECT COUNT(*) c FROM book_issues WHERE student_id=? AND return_date IS NULL').get(s.id).c;
  if (held >= num('library_max_books')) throw bad(`${s.name} already has ${held} book(s) – the limit is ${num('library_max_books')}`);
  if (db.prepare('SELECT 1 FROM book_issues WHERE student_id=? AND book_id=? AND return_date IS NULL').get(s.id, b.id)) throw bad('Student already has this book');
  const issue_date = today();
  const due = new Date(issue_date); due.setUTCDate(due.getUTCDate() + (Number(days) || num('library_issue_days')));
  const id = tx(() => {
    db.prepare('UPDATE books SET available_copies=available_copies-1 WHERE id=?').run(b.id);
    return insert(db, 'book_issues', { book_id: b.id, student_id: s.id, issue_date, due_date: due.toISOString().slice(0, 10), issued_by: req.user.id });
  });
  res.json({ id, student: s.name, due_date: due.toISOString().slice(0, 10) });
});
libraryRouter.post('/return/:id', allow(LIB), (req, res) => {
  const i = db.prepare('SELECT * FROM book_issues WHERE id=?').get(req.params.id);
  if (!i) throw notFound('Issue record');
  if (i.return_date) throw bad('Book already returned');
  const fine = req.body.waive ? 0 : withFine(i).fine;
  tx(() => {
    db.prepare('UPDATE book_issues SET return_date=?, fine=? WHERE id=?').run(today(), fine, i.id);
    db.prepare('UPDATE books SET available_copies=available_copies+1 WHERE id=?').run(i.book_id);
  });
  res.json({ ok: true, fine });
});
libraryRouter.post('/renew/:id', allow(LIB), (req, res) => {
  const i = db.prepare('SELECT * FROM book_issues WHERE id=? AND return_date IS NULL').get(req.params.id);
  if (!i) throw notFound('Active issue');
  const due = new Date(today()); due.setUTCDate(due.getUTCDate() + num('library_issue_days'));
  db.prepare('UPDATE book_issues SET due_date=? WHERE id=?').run(due.toISOString().slice(0, 10), i.id);
  res.json({ due_date: due.toISOString().slice(0, 10) });
});

/** Send return reminders (as personal notices to the student/parent). Body: { ids:[...] } or { scope:'overdue'|'due_soon' } */
libraryRouter.post('/reminders', allow(LIB), (req, res) => {
  let rows = db.prepare(`${ISSUE_SQL} WHERE i.return_date IS NULL`).all().map(withFine);
  if (Array.isArray(req.body.ids) && req.body.ids.length) rows = rows.filter(r => req.body.ids.includes(r.id));
  else if (req.body.scope === 'due_soon') rows = rows.filter(r => r.status === 'Issued' && daysBetween(today(), r.due_date) <= 2);
  else rows = rows.filter(r => r.status === 'Overdue');
  tx(() => rows.forEach(r => {
    const body = r.status === 'Overdue'
      ? `"${r.title}" (Acc. ${r.accession_no}) issued on ${r.issue_date} was due on ${r.due_date} and is ${r.overdue_days} day(s) overdue. Current fine: ₹${r.fine}. Please return it to the library immediately.`
      : `"${r.title}" (Acc. ${r.accession_no}) is due for return on ${r.due_date}. Please return or renew it on time to avoid a fine of ₹${num('library_fine_per_day')}/day.`;
    insert(db, 'notices', { title: r.status === 'Overdue' ? 'Library: Overdue book – return immediately' : 'Library: Book due for return', body,
      category: 'Library', student_id: r.student_id, notice_date: today(), created_by: req.user.id });
    db.prepare('UPDATE book_issues SET last_reminder=? WHERE id=?').run(today(), r.id);
  }));
  res.json({ sent: rows.length });
});

libraryRouter.get('/my', allow('student', 'parent'), (req, res) => {
  const s = myStudent(req);
  res.json(db.prepare(`${ISSUE_SQL} WHERE i.student_id=? ORDER BY i.return_date IS NOT NULL, i.issue_date DESC`).all(s.id).map(withFine));
});
