// Starting master data. Everything here is editable by the Administrator inside the app.
// Due dates are the usual statutory dates; the firm should verify them each year (and record government
// extensions from Compliance master → Due dates), because the law and notified dates change.
export const ENTITY_TYPES = [
  ['individual', 'Individual / Salaried'], ['proprietorship', 'Proprietorship'], ['huf', 'Hindu Undivided Family'],
  ['partnership', 'Partnership Firm'], ['llp', 'Limited Liability Partnership'], ['opc', 'One Person Company'],
  ['pvt_ltd', 'Private Limited Company'], ['public_ltd', 'Public Limited Company'],
  ['section8', 'Section 8 Company (NGO)'], ['trust_society', 'Trust / Society'],
];
const ALL = ENTITY_TYPES.map((e) => e[0]);
const COMPANIES = ['opc', 'pvt_ltd', 'public_ltd', 'section8'];
const PVT_PUB = ['pvt_ltd', 'public_ltd', 'section8'];
const NON_PERSON = ['partnership', 'llp', ...COMPANIES, 'trust_society'];
const s = (label, month, day, year_offset = 1) => ({ label, month, day, year_offset });

export const TEMPLATES = [
  // GST
  { name: 'GSTR-1 – Outward supplies', category: 'GST', form_no: 'GSTR-1', frequency: 'monthly', due_day: 11, due_offset_months: 1, condition: 'gst', entities: ALL, description: 'Details of outward supplies for the month.' },
  { name: 'GSTR-3B – Summary return & tax payment', category: 'GST', form_no: 'GSTR-3B', frequency: 'monthly', due_day: 20, due_offset_months: 1, condition: 'gst', entities: ALL, description: 'Monthly summary return with payment of GST.' },
  { name: 'GSTR-9 – GST annual return', category: 'GST', form_no: 'GSTR-9', frequency: 'annual', schedule: [s('Annual return', 12, 31)], condition: 'gst', entities: ALL, description: 'Annual GST return.' },
  // Income tax
  { name: 'Advance Tax instalment', category: 'Income Tax', form_no: 'Challan 280', frequency: 'custom', schedule: [s('1st instalment', 6, 15, 0), s('2nd instalment', 9, 15, 0), s('3rd instalment', 12, 15, 0), s('4th instalment', 3, 15)], entities: ALL, description: 'Payable if estimated tax liability for the year is ₹10,000 or more.' },
  { name: 'Income Tax Return – non-audit cases', category: 'Income Tax', form_no: 'ITR', frequency: 'annual', schedule: [s('Annual return', 7, 31)], entities: ['individual', 'proprietorship', 'huf'], description: 'Individuals, HUFs and proprietors whose accounts are not required to be audited.' },
  { name: 'Income Tax Return – audit cases', category: 'Income Tax', form_no: 'ITR', frequency: 'annual', schedule: [s('Annual return', 10, 31)], entities: NON_PERSON, description: 'Firms, LLPs, companies and trusts (and audited proprietors).' },
  { name: 'Tax Audit Report', category: 'Income Tax', form_no: '3CA/3CB-3CD', frequency: 'annual', schedule: [s('Audit report', 9, 30)], entities: ['proprietorship', 'partnership', 'llp', ...COMPANIES], description: 'Applicable if turnover/receipts cross the limits under section 44AB.' },
  { name: 'Audit report for Trusts / Section 8 companies', category: 'Income Tax', form_no: '10B/10BB', frequency: 'annual', schedule: [s('Audit report', 9, 30)], entities: ['trust_society', 'section8'], description: 'Audit report for charitable and religious institutions.' },
  { name: 'TDS / TCS payment', category: 'TDS', form_no: 'Challan 281', frequency: 'monthly', due_day: 7, due_offset_months: 1, condition: 'tds', entities: ALL, description: 'Deposit of tax deducted / collected during the month.' },
  { name: 'TDS / TCS return', category: 'TDS', form_no: '24Q/26Q/27Q', frequency: 'custom', schedule: [s('Q1 Apr–Jun', 7, 31, 0), s('Q2 Jul–Sep', 10, 31, 0), s('Q3 Oct–Dec', 1, 31), s('Q4 Jan–Mar', 5, 31)], condition: 'tds', entities: ALL, description: 'Quarterly statements of tax deducted at source.' },
  // ROC
  { name: 'DIR-3 KYC – Director KYC', category: 'ROC / MCA', form_no: 'DIR-3 KYC', frequency: 'annual', schedule: [s('Annual KYC', 9, 30)], entities: [...COMPANIES, 'llp'], description: 'Annual KYC of every director / designated partner holding a DIN.' },
  { name: 'AOC-4 – Financial statements', category: 'ROC / MCA', form_no: 'AOC-4', frequency: 'annual', schedule: [s('Financial statements', 10, 30)], entities: PVT_PUB, description: 'Filing of financial statements within 30 days of the AGM.' },
  { name: 'AOC-4 – Financial statements (OPC)', category: 'ROC / MCA', form_no: 'AOC-4', frequency: 'annual', schedule: [s('Financial statements', 9, 27)], entities: ['opc'], description: 'One Person Company: within 180 days of the financial year end.' },
  { name: 'MGT-7 – Annual return', category: 'ROC / MCA', form_no: 'MGT-7', frequency: 'annual', schedule: [s('Annual return', 11, 29)], entities: PVT_PUB, description: 'Annual return within 60 days of the AGM.' },
  { name: 'MGT-7A – Annual return (OPC)', category: 'ROC / MCA', form_no: 'MGT-7A', frequency: 'annual', schedule: [s('Annual return', 11, 26)], entities: ['opc'], description: 'Annual return for One Person Companies.' },
  { name: 'DPT-3 – Return of deposits', category: 'ROC / MCA', form_no: 'DPT-3', frequency: 'annual', schedule: [s('Return of deposits', 6, 30)], entities: [...COMPANIES], description: 'Return of deposits / outstanding receipts of money.' },
  { name: 'MSME Form-1 – Outstanding dues to MSMEs', category: 'ROC / MCA', form_no: 'MSME-1', frequency: 'half_yearly', schedule: [s('Apr–Sep', 10, 31, 0), s('Oct–Mar', 4, 30)], entities: ['opc', 'pvt_ltd', 'public_ltd'], description: 'Half-yearly return of payments pending beyond 45 days to micro and small enterprises.' },
  { name: 'LLP Form 11 – Annual return', category: 'ROC / MCA', form_no: 'Form 11', frequency: 'annual', schedule: [s('Annual return', 5, 30)], entities: ['llp'], description: 'Annual return of an LLP.' },
  { name: 'LLP Form 8 – Statement of accounts', category: 'ROC / MCA', form_no: 'Form 8', frequency: 'annual', schedule: [s('Statement of accounts', 10, 30)], entities: ['llp'], description: 'Statement of account and solvency.' },
  // Labour
  { name: 'Provident Fund – contribution & ECR', category: 'Labour', form_no: 'ECR', frequency: 'monthly', due_day: 15, due_offset_months: 1, condition: 'employees', entities: ALL, description: 'Monthly PF contribution and electronic challan-cum-return.' },
  { name: 'ESI – contribution', category: 'Labour', form_no: 'ESI challan', frequency: 'monthly', due_day: 15, due_offset_months: 1, condition: 'employees', entities: ALL, description: 'Monthly ESI contribution.' },
];

export const REGISTRATION_TYPES = [
  ['Private Limited Company incorporation', 'Company & business', 'Incorporate a private limited company with MCA (SPICe+), including name approval, DIN, PAN and TAN.', 'PAN and Aadhaar of all directors\nPassport-size photographs\nAddress proof of directors (bank statement / utility bill)\nRegistered office proof (rent agreement + NOC + utility bill)', '10–15 working days'],
  ['LLP registration', 'Company & business', 'Register a Limited Liability Partnership and prepare the LLP agreement.', 'PAN and Aadhaar of all partners\nPhotographs\nAddress proof of partners\nRegistered office proof with NOC', '10–15 working days'],
  ['One Person Company (OPC)', 'Company & business', 'Single-owner company with limited liability, including nominee details.', 'PAN and Aadhaar of the member and nominee\nPhotographs\nAddress proof\nRegistered office proof', '10–15 working days'],
  ['Partnership firm registration', 'Company & business', 'Partnership deed drafting, stamping and registration with the Registrar of Firms.', 'PAN and Aadhaar of all partners\nAddress proof\nBusiness premises proof', '5–7 working days'],
  ['Section 8 company / NGO', 'Company & business', 'Not-for-profit company incorporation with licence under section 8.', 'PAN and Aadhaar of directors\nAddress proof\nObjects of the company\nRegistered office proof', '25–40 working days'],
  ['Trust / Society registration', 'Company & business', 'Registration of a public charitable trust or society.', 'Trust deed / MOA & rules\nPAN and Aadhaar of trustees / members\nAddress proof of the trust', '15–30 working days'],
  ['GST registration', 'Tax registrations', 'New registration under the Goods and Services Tax Act.', 'PAN of the business and proprietor/partners/directors\nAadhaar\nBusiness address proof\nBank account proof\nPhotographs', '3–7 working days'],
  ['PAN / TAN application', 'Tax registrations', 'Apply for a new PAN or Tax Deduction Account Number.', 'Identity and address proof\nIncorporation certificate (entities)', '5–10 working days'],
  ['Professional Tax registration', 'Tax registrations', 'State professional tax registration (enrolment and registration).', 'PAN\nIncorporation / shop licence\nList of employees and salaries', '5–10 working days'],
  ['PF registration', 'Labour', 'Employees\' Provident Fund registration for the establishment.', 'PAN of the establishment\nIncorporation proof\nBank account proof\nEmployee list with Aadhaar', '5–7 working days'],
  ['ESI registration', 'Labour', 'Employees\' State Insurance registration.', 'PAN of the establishment\nIncorporation proof\nBank account proof\nEmployee list', '5–7 working days'],
  ['MSME / Udyam registration', 'Licences', 'Udyam registration for micro, small and medium enterprises.', 'Aadhaar of the proprietor / authorised signatory\nPAN\nBusiness details and bank account', '1–2 working days'],
  ['FSSAI food licence', 'Licences', 'Food safety licence / registration.', 'PAN and Aadhaar\nPremises proof\nList of food products\nPhotographs', '7–15 working days'],
  ['Import Export Code (IEC)', 'Licences', 'IEC from DGFT for importers and exporters.', 'PAN\nAadhaar\nBank certificate / cancelled cheque\nBusiness address proof', '2–5 working days'],
  ['Shops & Establishment licence', 'Licences', 'Registration under the state Shops and Establishments Act.', 'PAN\nAddress proof of the premises\nID proof of the owner', '5–10 working days'],
  ['Trademark registration', 'Licences', 'Trademark search, application filing and objection handling.', 'Logo / brand name\nApplicant ID and address proof\nUdyam certificate (for fee concession, if any)', '12–18 months to registration (filing in 2–3 days)'],
  ['DPIIT Startup recognition', 'Licences', 'Recognition as a startup for tax and other benefits.', 'Certificate of incorporation\nPitch deck / brief about innovation\nWebsite link', '5–10 working days'],
  ['Digital Signature Certificate (DSC)', 'Licences', 'Class 3 digital signature for e-filing and tenders.', 'PAN\nAadhaar\nPhotograph\nEmail and mobile number', '1–2 working days'],
];
