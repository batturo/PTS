// Demo school data: users for every role, students, timetable, fees, library, payroll and a bus route.
import { db, tx } from './db.js';
import { createUser } from './routes/users.js';
import { insert, today } from './util.js';

/** Fills an empty database with the demo school. Returns [[role, username, password], ...] for the main logins. */
export function seedDemo() {
  const t = today();
  const shift = (d) => { const x = new Date(t); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
  const month = t.slice(0, 7);
  const creds = [];

  tx(() => {
    const mk = (u) => { const r = createUser(u, null); creds.push([u.role, r.username, r.password]); return r.id; };
    const admin = mk({ username: 'admin', password: 'admin123', role: 'admin', name: 'Rajesh Kumar (Principal)' });
    const acc = mk({ username: 'accountant', password: 'accounts123', role: 'accountant', name: 'Sunita Sharma', phone: '9810000002' });
    const teacher = mk({ username: 'teacher', password: 'teacher123', role: 'teacher', name: 'Anita Verma', phone: '9810000003' });
    const lib = mk({ username: 'librarian', password: 'library123', role: 'librarian', name: 'Mohan Das', phone: '9810000004' });
    const driver = mk({ username: 'driver', password: 'driver123', role: 'driver', name: 'Harpreet Singh', phone: '9810000005' });

    const students = [
      ['2026001', 'Aarav Sharma', 'Vikas Sharma', 'Pooja Sharma', '2015-04-12', 'M', '10', 'A', '1', 'R1', 0],
      ['2026002', 'Diya Patel', 'Rakesh Patel', 'Meena Patel', '2015-08-23', 'F', '10', 'A', '2', 'R1', 10],
      ['2026003', 'Vihaan Gupta', 'Amit Gupta', 'Neha Gupta', '2015-01-30', 'M', '10', 'A', '3', null, 0],
      ['2026004', 'Ananya Iyer', 'Suresh Iyer', 'Lakshmi Iyer', '2015-11-05', 'F', '10', 'A', '4', 'R1', 0],
      ['2026005', 'Kabir Singh', 'Gurmeet Singh', 'Simran Kaur', '2016-02-14', 'M', '9', 'B', '1', 'R1', 25],
      ['2026006', 'Ishita Reddy', 'Srinivas Reddy', 'Kavya Reddy', '2016-06-19', 'F', '9', 'B', '2', null, 0],
    ];
    const ids = students.map(([adm, name, f, m, dob, g, cls, sec, roll, route, conc], i) => {
      const id = insert(db, 'students', { admission_no: adm, name, father_name: f, mother_name: m, dob, gender: g, class: cls, section: sec, roll_no: roll,
        route_no: route, concession_pct: conc, mobile: `98990000${10 + i}`, address: `${101 + i}, Green Park Extension, New Delhi - 110016`, blood_group: ['B+', 'O+', 'A+', 'AB+'][i % 4] });
      mk({ username: adm, password: 'student123', role: 'student', name, student_id: id });
      mk({ username: `P${adm}`, password: 'parent123', role: 'parent', name: f, student_id: id });
      return id;
    });
    creds.length = 7; // print only the first student & parent

    // Attendance for the last 10 school days
    for (let d = -14; d <= 0; d++) {
      const date = shift(d); if (new Date(date).getUTCDay() === 0) continue;
      ids.forEach((sid, i) => insert(db, 'attendance', { student_id: sid, date, status: (i + d) % 7 === 0 ? 'A' : 'P', marked_by: teacher }));
    }
    const subjects = ['English', 'Hindi', 'Mathematics', 'Science', 'Social Science'];
    ids.forEach((sid, i) => subjects.forEach((sub, j) => insert(db, 'results', { student_id: sid, exam_name: 'Half Yearly 2026', subject: sub, max_marks: 80, marks_obtained: 45 + ((i * 7 + j * 11) % 35) })));

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const times = [['08:00', '08:40'], ['08:40', '09:20'], ['09:20', '10:00'], ['10:20', '11:00'], ['11:00', '11:40']];
    for (const [cls, sec] of [['10', 'A'], ['9', 'B']]) days.forEach((day, di) => times.forEach(([s, e], p) =>
      insert(db, 'timetable', { class: cls, section: sec, day, period: p + 1, start_time: s, end_time: e, subject: subjects[(p + di) % 5], teacher_name: 'Anita Verma', created_by: teacher })));

    const C = { class: '10', section: 'A', created_by: teacher };
    insert(db, 'notices', { title: 'Winter uniform from 1st December', body: 'All students must wear the winter uniform (navy blazer & grey trousers/skirt) from 1st December.', category: 'General', notice_date: t, created_by: admin });
    insert(db, 'notices', { title: 'Parent-Teacher Meeting', body: 'PTM for Class 10-A will be held on Saturday from 9 AM to 12 PM. Report cards of Half Yearly exams will be shared.', category: 'Academic', ...C, notice_date: t });
    insert(db, 'homework', { subject: 'Mathematics', title: 'Quadratic Equations – Ex 4.3', description: 'Solve Q1–Q10 in your notebook. Show all steps.', assigned_date: t, due_date: shift(2), ...C });
    insert(db, 'homework', { subject: 'Science', title: 'Chemical Reactions worksheet', description: 'Complete the worksheet on balancing chemical equations.', assigned_date: t, due_date: shift(3), ...C });
    insert(db, 'homework', { subject: 'English', title: 'Letter writing', description: 'Write a formal letter to the editor about air pollution in Delhi (120-150 words).', assigned_date: shift(-1), due_date: shift(1), ...C });
    insert(db, 'materials', { title: 'Quadratic Equations – Notes', subject: 'Mathematics', description: 'Chapter 4 summary with solved examples', file_url: '/uploads/sample-notes.pdf', ...C });
    insert(db, 'videos', { title: 'Light – Reflection & Refraction', subject: 'Science', description: 'Recorded class from 10 Nov', video_url: 'https://www.youtube.com/watch?v=Oh4m8Ees-3Q', ...C });
    insert(db, 'lesson_plans', { subject: 'Mathematics', week_start: shift(-3), topic: 'Quadratic Equations', objectives: 'Solve quadratics by factorisation and the quadratic formula; understand the nature of roots.', activities: 'Board examples, group worksheet, quiz on Friday', status: 'In Progress', ...C });
    insert(db, 'lesson_plans', { subject: 'Science', week_start: shift(-3), topic: 'Chemical Reactions and Equations', objectives: 'Identify types of chemical reactions and balance equations.', activities: 'Lab demo: reaction of zinc with dilute HCl', status: 'Planned', ...C });
    insert(db, 'events', { title: 'Annual Sports Day', description: 'Track & field events, march past and prize distribution.', event_date: shift(12), venue: 'School Ground', created_by: admin });
    insert(db, 'events', { title: 'Science Exhibition', description: 'Class 9 & 10 students present working models.', event_date: shift(20), venue: 'Auditorium', created_by: teacher });
    subjects.forEach((sub, i) => insert(db, 'datesheets', { exam_name: 'Pre-Board 2026', class: '10', subject: sub, exam_date: shift(30 + i * 2), start_time: '09:30', end_time: '12:30', room: 'Hall A', created_by: teacher }));
    insert(db, 'leaves', { student_id: ids[0], from_date: shift(3), to_date: shift(4), reason: 'Family function in Jaipur', applied_by: null });

    // Fees
    for (const cls of ['9', '10']) {
      insert(db, 'fee_structures', { class: cls, fee_head: 'Tuition Fee', amount: cls === '10' ? 4500 : 4000, frequency: 'Monthly' });
      insert(db, 'fee_structures', { class: cls, fee_head: 'Transport Fee', amount: 1800, frequency: 'Monthly' });
      insert(db, 'fee_structures', { class: cls, fee_head: 'Computer Lab Fee', amount: 1200, frequency: 'Quarterly' });
      insert(db, 'fee_structures', { class: cls, fee_head: 'Annual Charges', amount: 9000, frequency: 'Annual' });
    }
    // Library
    const books = [
      ['Wings of Fire', 'A. P. J. Abdul Kalam', 'Biography', 'C1', 'S1', 'R1', 'C1', 3],
      ['Malgudi Days', 'R. K. Narayan', 'Fiction', 'C1', 'S2', 'R1', 'C3', 2],
      ['The Discovery of India', 'Jawaharlal Nehru', 'History', 'C2', 'S1', 'R2', 'C1', 2],
      ['Godan', 'Munshi Premchand', 'Hindi Literature', 'C2', 'S3', 'R1', 'C2', 4],
      ['NCERT Mathematics Class 10', 'NCERT', 'Textbook', 'C3', 'S1', 'R1', 'C1', 10],
      ['A Brief History of Time', 'Stephen Hawking', 'Science', 'C3', 'S2', 'R2', 'C4', 1],
    ];
    const bookIds = books.map(([title, author, genre, cab, sh, row, col, n]) =>
      insert(db, 'books', { title, author, genre, cabinet_no: cab, shelf_no: sh, row_no: row, column_no: col, total_copies: n, available_copies: n }));
    bookIds.forEach(id => db.prepare("UPDATE books SET accession_no='ACC'||printf('%05d', id) WHERE id=?").run(id));
    const issue = (b, s, from, days) => { insert(db, 'book_issues', { book_id: b, student_id: s, issue_date: shift(from), due_date: shift(from + days), issued_by: lib }); db.prepare('UPDATE books SET available_copies=available_copies-1 WHERE id=?').run(b); };
    issue(bookIds[0], ids[0], -20, 14); issue(bookIds[1], ids[0], -3, 14); issue(bookIds[3], ids[2], -5, 14);

    // Transport
    insert(db, 'bus_routes', { route_no: 'R1', route_name: 'Green Park – Saket – School', bus_no: 'DL 1PC 4521', driver_user_id: driver,
      stops: JSON.stringify([{ name: 'Green Park Metro', time: '07:05', lat: 28.5598, lng: 77.2066 }, { name: 'Hauz Khas Village', time: '07:15', lat: 28.5535, lng: 77.1942 },
        { name: 'Saket Select City', time: '07:30', lat: 28.5284, lng: 77.2190 }, { name: 'School', time: '07:45', lat: 28.5245, lng: 77.2066 }]),
      lat: 28.5535, lng: 77.1942, location_updated_at: null });

    // Employees (payroll)
    const emp = (o) => insert(db, 'employees', { join_date: '2024-04-01', pay_type: 'Monthly', std_hours_per_day: 8, pf_enabled: 1, esi_enabled: 1, pt_enabled: 1, bank_name: 'State Bank of India', ifsc: 'SBIN0001234', ...o });
    const e1 = emp({ emp_code: 'EMP0001', name: 'Anita Verma', father_name: 'R. P. Verma', mother_name: 'Kamla Verma', dob: '1988-07-14', profession: 'PGT Mathematics', department: 'Academics', address: 'B-12, Malviya Nagar, New Delhi', phone: '9810000003', basic: 32000, da: 6000, hra: 9600, other_allowance: 2400, pan: 'ABCPV1234K', uan: '100200300401', bank_account: '30012345678', user_id: teacher, tds_monthly: 1500 });
    const e2 = emp({ emp_code: 'EMP0002', name: 'Sunita Sharma', father_name: 'K. L. Sharma', mother_name: 'Usha Sharma', dob: '1985-02-03', profession: 'Accountant', department: 'Administration', address: 'C-44, Saket, New Delhi', phone: '9810000002', basic: 25000, da: 4000, hra: 7500, other_allowance: 1500, bank_account: '30012345679', user_id: acc });
    const e3 = emp({ emp_code: 'EMP0003', name: 'Harpreet Singh', father_name: 'Balwinder Singh', mother_name: 'Jaswinder Kaur', dob: '1980-10-21', profession: 'Bus Driver', department: 'Transport', address: 'Mehrauli, New Delhi', phone: '9810000005', basic: 12000, da: 1500, hra: 2000, other_allowance: 1000, bank_account: '30012345680', user_id: driver });
    const e4 = emp({ emp_code: 'EMP0004', name: 'Mohan Das', father_name: 'Hari Das', mother_name: 'Sita Devi', dob: '1979-05-09', profession: 'Librarian', department: 'Library', address: 'Lado Sarai, New Delhi', phone: '9810000004', basic: 20000, da: 3000, hra: 5000, other_allowance: 1000, bank_account: '30012345681', user_id: lib });
    const e5 = emp({ emp_code: 'EMP0005', name: 'Ramesh Yadav', father_name: 'Shyam Yadav', mother_name: 'Geeta Yadav', dob: '1992-12-01', profession: 'Part-time Music Teacher', department: 'Academics', address: 'Chhatarpur, New Delhi', phone: '9810000006', pay_type: 'Hourly', hourly_rate: 350, std_hours_per_day: 4, pf_enabled: 0, esi_enabled: 0, pt_enabled: 0, bank_account: '30012345682' });
    // Employee attendance for current month so far
    for (let d = 1; d <= Number(t.slice(8, 10)); d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      if (new Date(date).getUTCDay() === 0) continue;
      [e1, e2, e3, e4].forEach((e, i) => insert(db, 'employee_attendance', { employee_id: e, date, status: (d + i) % 11 === 0 ? 'A' : (d + i) % 13 === 0 ? 'HD' : 'P', hours_worked: (d + i) % 11 === 0 ? 0 : (d + i) % 13 === 0 ? 4 : (d % 5 === 0 ? 9.5 : 8) }));
      if (d % 2) insert(db, 'employee_attendance', { employee_id: e5, date, status: 'P', hours_worked: 3 + (d % 3) });
    }
    insert(db, 'holidays', { date: `${t.slice(0, 4)}-11-${t.slice(5, 7) === '11' ? '01' : '15'}`, name: 'Diwali Holiday' });
    insert(db, 'payroll_adjustments', { employee_id: e3, month, type: 'Salary Advance Recovery', amount: 2000, note: 'Advance of Oct (1/3)' });
    insert(db, 'payroll_adjustments', { employee_id: e1, month, type: 'Incentive', amount: 1500, note: 'Olympiad coaching' });
  });
  return creds;
}

export const isEmpty = () => !db.prepare('SELECT COUNT(*) c FROM users').get().c;
