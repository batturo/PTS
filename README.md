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
| Teacher (class teacher 10-A; Maths & English 10-A, Maths 9-B) | `teacher` | `teacher123` |
| Teacher (class teacher 9-B; Science, Hindi, Social Science…) | `teacher2` | `teacher123` |
| Librarian | `librarian` | `library123` |
| Bus Driver | `driver` | `driver123` |
| Student | `2026001` (admission no.) | `student123` |
| Parent | `P2026001` ("P" + admission no.) | `parent123` |

## Who can do what

| Feature | Admin | Accountant | Class teacher (own section) | Subject teacher (allotted subjects) | Librarian | Driver | Student / Parent |
|---|---|---|---|---|---|---|---|
| Create staff logins | ✅ | | | | | | |
| Classes, sections, class teachers, subject allotments, subjects | ✅ | | | | | | |
| Exams of the year | ✅ | | | | | | |
| Add / edit / remove students (+ their logins) | ✅ | | ✅ | | | | |
| Attendance, time table, leave approval | ✅ | | ✅ | view | | | view / apply |
| Study material, video links, homework, lesson plans, date-sheet papers, results | ✅ | | | ✅ | | | view |
| Notices & events | ✅ school-wide | ✅ | ✅ own classes | ✅ own classes | ✅ | ✅ | view |
| Fees | ✅ | ✅ | | | | | view own |
| Payroll | ✅ | ✅ | | | | | |
| Library | ✅ | | | | ✅ | | view books issued |
| Bus routes / live location | ✅ | | track | track | | own route | live map |

**How allotments work:** the admin creates classes and sections under **Classes & Teachers**, and picks a class teacher for each section. They then allot each subject in each section to a teacher, either under **Subject Teachers** (by section) or **By Teacher**. Teachers only see the sections they teach. Their forms list only their own classes and subjects, and anything belonging to another teacher shows as "View only". The admin also lists the year's exams under **Exams of the Year**, and date sheets and results can only use those exams.

Every rule is enforced on the server (`server/src/auth.js → allow()`), not just hidden in the UI.
The Administrator passes every staff permission check but cannot act as a student or parent.

## Modules

**Fees Management:**
- **Fee Entry:**
  1. Search a student by name, admission number, father's name or mobile.
  2. Their session appears month by month (April → March): paid, partly paid, due, not billed, or upcoming. Dues from earlier years appear too.
  3. Tick the months (or dues) to collect, enter the amount, mode and UTR or cheque number, and click **Collect**. One receipt covers everything ticked.
  - **Advance payments:** months that were never billed are billed from the fee structure at the moment of payment, with no late fee.
  - **Part payments:** the money clears the oldest month first.
- **Current Fees Status:** a class-wise table for the whole school and session, with section-wise rows. Columns: fee for the session, collected, due till date, rest of the session, previous years' dues, total outstanding, collection %, and the number of students with dues. Download as CSV or print.
- **Fee Defaulters:** filter by session, class and section, then choose:
  - any dues;
  - has not paid a particular month;
  - has not paid for N or more months.

  Months up to a chosen month count, optionally including months never billed. The list shows unpaid months, amounts, mobile numbers and the date of the last payment. From it you can:
  - send a **fee reminder** to the student's and parent's Notices;
  - download a CSV, or print;
  - jump to **Collect** for a student.
- **Fee structure:** fee heads per class (Tuition, Transport, Lab, Annual…), each with a frequency: Monthly, Quarterly (Apr/Jul/Oct/Jan), Half-Yearly (Apr/Oct), Annual (April) or One-Time. Transport fee is billed only to students on a bus route. Concession % applies to every head except transport.
- **Invoices:** **Generate Invoices** bills a whole class or school for a month. Custom one-off invoices are also supported. A late fee per day after the due date (due day set in **School Settings**) is capped per invoice and can be waived.
- **Receipts:** numbered receipts showing the months paid and the amount in words, plus a receipts register. Admins can cancel a receipt; the months it paid then become due again.

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

## Get a shareable website link (Netlify, free) – no other server needed

Everything runs on Netlify:
- **Website:** served as static pages.
- **API:** runs as one Netlify Function, `netlify/functions/api.js`, which wraps the same Express app.
- **Database:** SQLite compiled to WebAssembly (`sql.js`), saved to **Netlify Blobs** after every change.
- **Uploaded files:** also stored in Netlify Blobs.

1. Sign in at https://app.netlify.com with GitHub.
2. Choose **Add new site → Import an existing project → GitHub → PTS**. Leave every build setting as it is; `netlify.toml` provides them. Click **Deploy**.
3. After about 3 minutes, your site is live at `https://<random-name>.netlify.app`. Rename it under **Site configuration → Change site name**.
4. The first visit creates the demo school automatically. The sign-in page has buttons for every demo login.

Limits on Netlify:
- Uploads are capped at 4.5 MB per file. For video classes, paste a YouTube link.
- The very first request after a quiet period takes 1–2 seconds.
- The database is saved as one file after each change. That suits a single school with normal use. With many staff saving at the exact same moment, one change could overwrite another; for heavy use, run the Node server with a real disk instead (see below).
- To start over with fresh demo data, delete the `school-erp` store under **Netlify → Blobs**.

**Alternative:** `render.yaml` runs the regular Node server on Render (**New → Blueprint**).

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

## Mobile apps (Android & iOS)

The apps are the same React app wrapped with Capacitor (`client/android`, `client/ios`). They talk to the live site set in `client/.env.mobile` (`VITE_API_URL=https://parent-teacher-student.netlify.app`). App name **PTS School**, app id `com.batturo.pts`.

### Android – built automatically
Every push to `main` that changes `client/` runs `.github/workflows/android.yml`. It builds the app and publishes it on the repo's **Releases** page as **android-latest**, with `PTS-School.apk`. To run it by hand: **Actions → Android app → Run workflow**.

- **Install on a phone:** open the release page on the phone, tap `PTS-School.apk`, and allow "Install unknown apps" for the browser when asked.
- **Signing:** without secrets the APK is debug-signed. That's fine for testing, but each new build must be installed after uninstalling the old one. Add these repository secrets (**Settings → Secrets and variables → Actions**) to get a properly signed APK that updates in place, plus `PTS-School-PlayStore.aab` for Google Play:
  - `ANDROID_KEYSTORE_BASE64`: the keystore file, base64-encoded
  - `ANDROID_KEYSTORE_PASSWORD`: the keystore password
  - `ANDROID_KEY_ALIAS`: `pts`

  **Keep the keystore safe.** Google Play only accepts updates signed with the same key.

To build locally instead: install Android Studio, then run `cd client && npm run cap:sync && npx cap open android`.

### iOS – built automatically
`.github/workflows/ios.yml` builds the iOS app on a GitHub macOS runner and publishes **PTS-School-unsigned.ipa** as the **ios-latest** release. To run it by hand: **Actions → iOS app → Run workflow**.

Apple requires every app to be signed before it runs on an iPhone:
- **Free (testing):** use [Sideloadly](https://sideloadly.io) on a PC or Mac:
  1. Connect the iPhone by USB and drag in the `.ipa`.
  2. Sign in with your Apple ID and click **Start**.
  3. On the iPhone, go to **Settings → General → VPN & Device Management** and trust your Apple ID.

  Apps installed with a free Apple ID must be reinstalled every 7 days.
- **App Store / TestFlight:** this needs an Apple Developer Program membership (US$99/year).
  1. On a Mac, run `cd client && npm install && npm run cap:sync && npx cap open ios`.
  2. In Xcode, select your team under **Signing & Capabilities**, then choose **Product → Archive → Distribute App**.
- **No install:** open https://parent-teacher-student.netlify.app in **Safari**, then tap **Share → Add to Home Screen**.

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
