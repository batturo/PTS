# School ERP — Website + Android + iOS

A complete School ERP for Indian schools, with seven user roles:
**School Administrator, Accountant, Teacher, Bus Driver, Librarian, Student and Parent**.
The same app runs as a website and as Android and iOS apps (one codebase, built with Capacitor).

| Layer | Technology |
|---|---|
| Backend API | Node.js 22 + Express 5, SQLite (built-in `node:sqlite`), JWT login, bcrypt passwords |
| Website | React 18 + Vite: responsive, installable as a PWA, print-ready receipts, payslips and ID cards |
| Mobile apps | Capacitor 6 (`client/android`, `client/ios`), native GPS for bus drivers |
| Maps | Leaflet + OpenStreetMap (no API key needed) |

## Quick start

```bash
npm run setup      # install server + client dependencies
npm run seed       # create a demo school (wipes the database)
npm run build      # build the website
npm start          # http://localhost:4000
```

For development with hot reload, run `npm run dev:api` and `npm run dev:web` in two terminals, then open http://localhost:5173.

### Demo logins
| Role | Username | Password |
|---|---|---|
| School Administrator | `admin` | `admin123` |
| Accountant | `accountant` | `accounts123` |
| Teacher | `teacher` | `teacher123` |
| Librarian | `librarian` | `library123` |
| Bus Driver | `driver` | `driver123` |
| Student | `2026001` (admission no.) | `student123` |
| Parent | `P2026001` ("P" + admission no.) | `parent123` |

## Who can do what

| Feature | Admin | Accountant | Teacher | Librarian | Driver | Student / Parent |
|---|---|---|---|---|---|---|
| Create staff logins (any role) | ✅ | | | | | |
| Create student + parent logins | ✅ | | ✅ | | | |
| Attendance, results, homework, study material (PDF), video classes, time table, lesson plans, events, date sheets | ✅ | | ✅ | | | view |
| Leave applications | ✅ approve | | ✅ approve | | | apply / withdraw |
| Notices | ✅ | ✅ | ✅ | ✅ (overdue-book notices) | ✅ | view |
| Fees: structure, invoices, collection, receipts | ✅ | ✅ | | | | view own + receipts |
| Payroll: employees, attendance and hours, payslips | ✅ | ✅ | | | | |
| Library: inventory, issue, return, renew, fines | ✅ | | | ✅ | | view books issued |
| Bus routes and live location | ✅ (all routes) | | track any bus | | own route + live sharing | live bus map |
| Own payslips | ✅ | ✅ | ✅ | ✅ | ✅ | |

Every rule is enforced on the server (`server/src/auth.js → allow()`), not just hidden in the UI.
The Administrator passes every staff permission check but cannot act as a student or parent.

## Modules

**Fees Management:**
- **Fee structure:** fee heads per class (Tuition, Transport, Lab, Annual…), each with a frequency: Monthly, Quarterly (Apr/Jul/Oct/Jan), Half-Yearly (Apr/Oct), Annual (April) or One-Time.
- **Invoices:** one click generates a month's invoices for the whole school or one class. Transport fee is billed only to students on a bus route. Concession % (sibling, staff ward, scholarship) applies to every head except transport. Custom one-off invoices are also supported.
- **Late fee:** a configurable fine per day after the due date, capped per invoice. It can be waived.
- **Collection:** Cash, UPI, Cheque, Bank Transfer and Card, with full or partial payment. Receipts are numbered and show the amount in words (lakh/crore). There is also a payments register and a class-wise collection summary.

**Payroll:**
- **Employee records:** name, father's and mother's name, date of birth, profession, department, address, PAN, Aadhaar, UAN, bank details and joining date.
- **Removing an employee:** keeps their history. The last month is pro-rated and their login is disabled. Restore and permanent delete are also available.
- **Attendance:** daily status per employee (P / HD / L / A), with check-in/check-out times or hours worked.
- **Automatic salary calculation:**
  - Monthly staff: Basic, DA, HRA and allowances × (payable days ÷ working days). Working days exclude Sundays and declared holidays.
  - Overtime: hours beyond the standard day, at the hourly equivalent × the OT multiplier.
  - Hourly staff: hours worked × rate.
  - Adjustments: bonus, arrears, incentive, advance recovery and loan recovery.
- **Statutory deductions:**
  - EPF: 12% of (Basic + DA), capped at the ₹15,000 wage ceiling. The employer share is shown on the payslip.
  - ESI: 0.75% employee / 3.25% employer, when gross pay is ₹21,000 or less.
  - Professional Tax: configurable per state.
  - TDS: a monthly amount you set per employee.
- **Payslips:** printable, with net pay in words. Paid payslips are locked. You can mark salaries as paid in bulk and export a bank-transfer CSV.

**Library:**
- **Books:** each book records its name, author, genre, ISBN, publisher, copies, and placement (cabinet, shelf, row, column).
- **Issuing:** checks the per-student book limit.
- **Return, renew and fines:** a late fine is charged per day and can be waived.
- **Return notices:** one click sends a personal notice to the student and parent, either for all overdue books, for books due in 2 days, or for selected students.

**Bus tracking:**
- **Driver:** sets the route number, bus number and ordered stops. The 📍 button saves a stop's GPS coordinates.
- **Trip:** the driver taps *Start morning pickup* or *Start afternoon drop*, and the phone's GPS is sent every ~4 seconds.
- **Students and parents on that route:** see the live map, speed, nearest stop, and the driver's phone number. The map refreshes every 5 seconds.

## Get a shareable website link (Render, free)

1. Sign up at https://render.com with your GitHub account and give Render access to this repository.
2. In the Render dashboard, choose **New → Blueprint**, select this repo and click **Apply**. Render reads `render.yaml` and builds the app (about 5 minutes).
3. Your site is live at a link like `https://pts-school-erp.onrender.com`. Share it with anyone.

Free plan limits: the site sleeps after 15 minutes without visitors, so the first visit afterwards takes about 50 seconds. The disk is temporary, so data resets to the demo school whenever the service restarts or redeploys. For real use, upgrade the service and add a persistent disk mounted at `/var/data`, then set `DATA_DIR=/var/data/db` and `UPLOAD_DIR=/var/data/uploads`.

## Production deployment (India)

1. Use any Linux VPS with Node 22+, e.g. AWS Mumbai (ap-south-1), DigitalOcean Bangalore or Azure Central India.
2. Set environment variables:
   - `JWT_SECRET`: a long random string. **Required.** The default is not secure.
   - `PORT`: default 4000.
   - `DATA_DIR`: where `school.db` is stored.
   - `UPLOAD_DIR`: where uploaded files are stored.
3. Put it behind Nginx or Caddy with **HTTPS**. HTTPS is needed for login security, and browsers only allow GPS on HTTPS pages.
4. Run it with `pm2` or systemd. Back up `DATA_DIR` and `UPLOAD_DIR` every day.
5. On first launch, run `npm run seed` for a demo. For a real school, create only the admin user, then add the real data. (Or delete the demo data and change the admin password immediately.)
6. Uploaded files (PDFs, videos, photos) are served by their random, unguessable file names without a login check. If your study material must be strictly private, add an authenticated download route.
7. Edit **School Settings** (as admin): school name, academic year, late-fee rules, library rules and PF/ESI/PT values.

SQLite is enough for a single school (thousands of students). For a multi-school SaaS, move to PostgreSQL. The SQL is standard, so the change is limited to `server/src/db.js`.

## Building the mobile apps

The apps load the same React code and call your server over HTTPS.

```bash
cd client
echo "VITE_API_URL=https://erp.yourschool.in" > .env   # your server's public URL
npm run cap:sync                                        # build + copy into android/ and ios/
npx cap open android    # Android Studio → Build → Generate Signed Bundle (.aab) → Google Play
npx cap open ios        # Xcode (macOS) → Product → Archive → App Store Connect
```

- Change `appId` / `appName` in `client/capacitor.config.json` before publishing, e.g. `in.yourschool.erp`.
- Location permissions are already declared in `AndroidManifest.xml` and `Info.plist`.
- Drivers should keep the app open during a trip. Sharing while the app is in the background needs `@capacitor-community/background-geolocation` plus a foreground-service notification. Add it if drivers need to use other apps mid-trip.
- App icons and splash screens: `npx @capacitor/assets generate`.

## Project layout

```
server/src/
  index.js            Express app, serves API + built website
  db.js               SQLite schema & settings
  auth.js             JWT auth + role permissions
  seed.js             demo data
  routes/
    users.js          login, user accounts, students (+ auto student/parent logins)
    academics.js      notices, materials, videos, homework, timetable, lesson plans, events, date sheets, attendance, results, leaves
    fees.js           fee structure, invoice generation, late fees, payments, receipts
    payroll.js        employees, attendance & hours, salary engine, payslips
    library.js        books, issue/return/renew, fines, reminder notices
    transport.js      bus routes, driver location, live tracking
    misc.js           file uploads, settings, dashboards
client/src/
  App.jsx             role-based navigation & routes
  pages/              one screen per feature
client/android, client/ios   native app projects (Capacitor)
docs/screenshots/            screenshots of the running app
```

## Suggested next steps
- Push notifications (Firebase Cloud Messaging) for notices, homework and when the bus is near the stop.
- Online fee payment through Razorpay, PayU or Cashfree. The payments table already has `mode` and `reference` fields.
- SMS / WhatsApp alerts for absences and fee dues.
- Limit each teacher to their assigned classes. Currently any teacher can manage every class.
- Form 16 / annual TDS statements, and EPF ECR file export.
