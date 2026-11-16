# CA Firm Portal – website + Android + iOS

One system for a Chartered Accountant firm, with four kinds of login: **Administrator, CA, Intern and Customer**.
The website and the Android/iOS apps are the same React app (Capacitor wraps it for the phones) talking to one server.

| Layer | Technology |
|---|---|
| API server | Node.js 22 + Express 5, SQLite (built-in `node:sqlite`), JWT login, bcrypt passwords |
| Website | React 18 + Vite, responsive, installable as a PWA |
| Mobile apps | Capacitor 6 – `client/android` and `client/ios` (built automatically by GitHub Actions) |

## Run it

```bash
cd cafirm
npm run setup     # install dependencies
npm run seed      # optional: demo firm with demo clients and filings
npm run build     # build the website
npm start         # http://localhost:4000
```
For development with hot reload: `npm run dev:api` and `npm run dev:web` (http://localhost:5173). `npm test` runs the API test-suite.

On the very first start the server creates an Administrator login. Set `ADMIN_USERNAME` / `ADMIN_PASSWORD` to choose it; otherwise the
password is printed in the server log. **Change it after the first login** (Password button, bottom of the menu).

### Demo logins (after `npm run seed`)
| Role | Username | Password |
|---|---|---|
| Administrator | `admin` | `admin123` |
| CA | `ca` | `ca123456` |
| Intern | `intern` | `intern123` |
| Customer (Pvt Ltd) | `acme` | `customer123` (also `ravi`, `sunita`, `sarvodaya`) |

Never seed the demo data on a real installation.

## Who can do what

| | Administrator | CA / Intern | Customer |
|---|---|---|---|
| Create logins (any role) and reset passwords | ✅ | | |
| Create / edit client organisations | ✅ | view | own organisation (view) |
| Compliance master: what each institution type files, rules and due dates | ✅ edit | view | |
| Change due dates for **all customers at once** (e.g. a government extension) | ✅ | | |
| Add or delete a filing; change a single filing's due date | ✅ | | |
| Update filing status, acknowledgement no., remarks, assignee | ✅ | ✅ | |
| Send notifications / messages (one client, a type of institution, or all) | ✅ | ✅ | receive |
| Upload documents, tax reports, acknowledgements (and hide/show to customer) | ✅ | ✅ | upload to the firm for own organisation |
| Delete a document | ✅ | own uploads | |
| See every file and filing, plus an activity log of who did what | ✅ | files and filings | |
| See own compliances, due dates, status, documents, notifications | | | ✅ |
| Registration types (company registrations, licences) – add/edit | ✅ | | browse |
| Apply for a new registration / track its status | ✅ on behalf | update status | ✅ |

Rules are enforced on the server (`server/src/auth.js`, each router), not only hidden in the UI. Customers are always restricted to
their own organisation; staff-only fields (internal notes, assignee) are never sent to customers; documents are not served statically –
every download goes through a permission check. The test-suite (`server/test/api.test.js`) covers these rules.

## How compliances work

* Each **client organisation** has a *type of institution* (Individual, Proprietorship, HUF, Partnership, LLP, OPC, Pvt Ltd, Public Ltd,
  Section 8, Trust/Society) plus three flags – GST-registered, has employees, deducts TDS.
* The **compliance master** (Administrator → *Compliance master*) lists every compliance, the institution types it applies to, an optional
  condition (GST / employees / TDS) and its due-date rule (monthly/quarterly "day D of month N after the period", or fixed dates per year).
* The system **generates filings** for each client per financial year from that master (when a client is created or edited, when a
  compliance is added, at server start, and via *Generate filings for year*). Existing filings and their status are never overwritten.
* Changing a compliance's rule moves the due dates of all **unfiled** filings. *Due dates* on a compliance lets the Administrator set a new
  date for one period for every customer at once (optionally notifying them); it is remembered, so clients added later get it too.
* Status flow: Not started → Awaiting documents → In progress → Under review → Filed (or Not applicable). "Overdue" is computed from the due date.
* CAs/interns changing a status automatically notify the customer (they can add a message, or untick *Notify*).

> **Important:** the pre-loaded compliances and due dates (`server/src/master-data.js`) are the usual statutory dates, provided as a starting
> point. Due dates and applicability change by notification (and some depend on turnover, AGM dates, state, etc.). Have a CA verify the list
> before relying on it, and keep it up to date from the Compliance master screen.

## Mobile apps

The apps are the same web app inside a native shell, so they need to know where the server lives.

1. Deploy the server somewhere with **HTTPS** and a **persistent disk** (it stores `data/cafirm.db` and `data/uploads/`; set `DATA_DIR` to the disk).
   Set `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` (and optionally `PORT`, `MAX_UPLOAD_MB`).
2. **Android / iOS via GitHub Actions** (recommended – no Android Studio / Mac needed): in the GitHub repository add the variable
   `CAFIRM_API_URL` (Settings → Secrets and variables → Actions → Variables) = your server address, e.g. `https://portal.myfirm.in`.
   Run the workflows *CA Firm – Android app* / *CA Firm – iOS app* (also run on every push to `main` that touches `cafirm/client`).
   They publish the `.apk` (and a Play Store `.aab` if you add the signing secrets described in the workflow) and an unsigned iOS `.ipa`
   as GitHub Releases. The iOS file must be signed with an Apple ID or Developer account before it runs on an iPhone.
3. **Manually:** copy `client/.env.mobile.example` to `client/.env.mobile`, set `VITE_API_URL`, then
   `cd client && npm run cap:sync && npx cap open android` (Android Studio) or `npx cap open ios` (Xcode on a Mac).

The app name is `CA Firm Portal`, id `com.batturo.cafirm` (`client/capacitor.config.json`); change them before publishing to the stores,
and replace the default launcher icon / splash screen.

## Not included (ideas for next steps)

* Push notifications to the phone (needs Firebase / Apple push credentials) and email/SMS/WhatsApp alerts – notifications are in-app today.
* Automatic reminders before due dates, invoices/fee collection, e-signatures, and e-filing integration with government portals.
* CAs and interns currently have identical permissions and see all clients; per-client assignment limits or an "intern needs CA approval
  before marking Filed" rule are easy to add if the firm wants them.
