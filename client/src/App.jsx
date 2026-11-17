import { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { get, setToken, getToken } from './api.js';
import { AuthCtx, Toaster, Loading } from './ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';

const P = {
  Users: lazy(() => import('./pages/Users.jsx')), Settings: lazy(() => import('./pages/Settings.jsx')),
  Students: lazy(() => import('./pages/Students.jsx')), Attendance: lazy(() => import('./pages/Attendance.jsx')),
  Results: lazy(() => import('./pages/Results.jsx')), Leaves: lazy(() => import('./pages/Leaves.jsx')),
  Timetable: lazy(() => import('./pages/Timetable.jsx')), Profile: lazy(() => import('./pages/Profile.jsx')),
  Fees: lazy(() => import('./pages/Fees.jsx')), MyFees: lazy(() => import('./pages/MyFees.jsx')),
  Payroll: lazy(() => import('./pages/Payroll.jsx')), MyPayslips: lazy(() => import('./pages/MyPayslips.jsx')),
  Library: lazy(() => import('./pages/Library.jsx')), MyBooks: lazy(() => import('./pages/MyBooks.jsx')),
  Driver: lazy(() => import('./pages/Driver.jsx')), Routes: lazy(() => import('./pages/BusRoutes.jsx')), Track: lazy(() => import('./pages/Track.jsx')),
  Account: lazy(() => import('./pages/Account.jsx')),
  Setup: lazy(() => import('./pages/AcademicSetup.jsx')),
};
const C = lazy(() => import('./pages/Content.jsx'));
const content = (kind) => () => <C kind={kind} />;

// [path, label, icon, component, roles]
const STAFF_ACAD = ['admin', 'teacher'];
const FAMILY = ['student', 'parent'];
const NAV = [
  ['Overview', [['/', 'Dashboard', '🏠', Dashboard, null]]],
  ['Administration', [
    ['/users', 'User Accounts', '👥', P.Users, ['admin']],
    ['/setup', 'Classes & Teachers', '🏫', P.Setup, ['admin']],
    ['/exams', 'Exams of the Year', '🗓️', () => <P.Setup tab="exams" />, ['admin']],
    ['/settings', 'School Settings', '⚙️', P.Settings, ['admin']],
  ]],
  ['My School', [
    ['/profile', 'ID Card / Profile', '🪪', P.Profile, FAMILY],
    ['/my-attendance', 'Attendance', '✅', P.Attendance, FAMILY],
    ['/my-results', 'Results', '📊', P.Results, FAMILY],
    ['/my-notices', 'Notices', '📢', content('notices'), FAMILY],
    ['/my-materials', 'Study Material', '📄', content('materials'), FAMILY],
    ['/my-videos', 'Video Classes', '🎬', content('videos'), FAMILY],
    ['/my-fees', 'Fees', '💳', P.MyFees, FAMILY],
    ['/my-homework', 'Homework', '📝', content('homework'), FAMILY],
    ['/my-timetable', 'Time Table', '🗓️', P.Timetable, FAMILY],
    ['/my-leaves', 'Apply for Leave', '✉️', P.Leaves, FAMILY],
    ['/my-lessons', 'Lesson Plans', '📚', content('lesson_plans'), FAMILY],
    ['/my-events', 'Upcoming Events', '🎉', content('events'), FAMILY],
    ['/my-datesheet', 'Date Sheet', '🗒️', content('datesheets'), FAMILY],
    ['/my-books', 'Books Issued', '📖', P.MyBooks, FAMILY],
    ['/my-bus', 'Bus Tracking', '🚌', P.Track, FAMILY],
  ]],
  ['Academics', [
    ['/students', 'Students', '🎓', P.Students, STAFF_ACAD],
    ['/attendance', 'Attendance', '✅', P.Attendance, STAFF_ACAD],
    ['/results', 'Results', '📊', P.Results, STAFF_ACAD],
    ['/homework', 'Homework', '📝', content('homework'), STAFF_ACAD],
    ['/materials', 'Study Material', '📄', content('materials'), STAFF_ACAD],
    ['/videos', 'Video Classes', '🎬', content('videos'), STAFF_ACAD],
    ['/timetable', 'Time Table', '🗓️', P.Timetable, STAFF_ACAD],
    ['/lesson-plans', 'Lesson Plans', '📚', content('lesson_plans'), STAFF_ACAD],
    ['/datesheets', 'Date Sheets', '🗒️', content('datesheets'), STAFF_ACAD],
    ['/events', 'Events', '🎉', content('events'), STAFF_ACAD],
    ['/leaves', 'Leave Requests', '✉️', P.Leaves, STAFF_ACAD],
  ]],
  ['Communication', [['/notices', 'Notices', '📢', content('notices'), ['admin', 'teacher', 'accountant', 'librarian', 'driver']]]],
  ['Finance', [
    ['/fees', 'Fees Management', '💰', P.Fees, ['admin', 'accountant']],
    ['/payroll', 'Payroll', '🧾', P.Payroll, ['admin', 'accountant']],
  ]],
  ['Library', [['/library', 'Library', '📚', P.Library, ['admin', 'librarian']]]],
  ['Transport', [
    ['/bus-routes', 'Bus Routes', '🗺️', P.Routes, ['admin']],
    ['/drive', 'My Route & Live Location', '🚌', P.Driver, ['admin', 'driver']],
    ['/track', 'Track a Bus', '📍', P.Track, ['teacher']],
  ]],
  ['Account', [
    ['/my-payslips', 'My Payslips', '💼', P.MyPayslips, ['admin', 'accountant', 'teacher', 'librarian', 'driver']],
    ['/account', 'Change Password', '🔑', P.Account, null],
  ]],
];
const ROLE_LABEL = { admin: 'School Administrator', accountant: 'Accountant', teacher: 'Teacher', driver: 'Bus Driver', librarian: 'Librarian', student: 'Student', parent: 'Parent' };

export default function App() {
  const [auth, setAuth] = useState(undefined);
  const [school, setSchool] = useState({});
  const [menu, setMenu] = useState(false);
  const [structure, setStructure] = useState(null);
  const loc = useLocation();
  useEffect(() => setMenu(false), [loc.pathname]);
  useEffect(() => {
    get('/settings/public').then(setSchool).catch(() => {});
    if (!getToken()) return setAuth(null);
    get('/auth/me').then(setAuth).catch(() => setAuth(null));
    const out = () => setAuth(null);
    window.addEventListener('erp-logout', out);
    return () => window.removeEventListener('erp-logout', out);
  }, []);

  const staff = auth && !['student', 'parent'].includes(auth.user.role);
  const loadStructure = () => get('/structure').then(setStructure).catch(() => setStructure({ classes: [], subjects: [], allotments: [], exams: [], teachers: [] }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (staff) loadStructure(); else setStructure(null); }, [staff, auth?.user?.id]);
  /** Re-read allotments after an administrator changes them (also refreshes a teacher's own scope). */
  const reloadStructure = async () => { await loadStructure(); try { const me = await get('/auth/me'); setAuth(me); } catch { /* ignore */ } };

  if (auth === undefined || (staff && !structure)) return <Loading />;
  if (!auth) return (<><Login school={school} onLogin={(a) => setAuth(a)} /><Toaster /></>);
  const role = auth.user.role;
  const groups = NAV.map(([g, items]) => [g, items.filter(i => !i[4] || i[4].includes(role))]).filter(([, i]) => i.length);
  const logout = () => { setToken(null); setAuth(null); };

  return (<AuthCtx.Provider value={{ ...auth, school, logout, structure, reloadStructure }}>
    <div className="app">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <div className="brand"><img src="./icon.svg" alt="" /><div>{school.school_name || 'School ERP'}<small>{ROLE_LABEL[role]} · {school.academic_year}</small></div></div>
        <nav className="nav">{groups.map(([g, items]) => <div key={g}>
          {g !== 'Overview' && <div className="nav-group">{g}</div>}
          {items.map(([path, label, icon]) => <NavLink key={path} to={path} end={path === '/'}><span className="ic">{icon}</span>{label}</NavLink>)}
        </div>)}</nav>
      </aside>
      <div className={`scrim ${menu ? 'open' : ''}`} onClick={() => setMenu(false)} />
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon menu-btn" onClick={() => setMenu(true)} aria-label="Open menu">☰</button>
          <b className="hide-sm">{ROLE_LABEL[role]} Portal</b>
          <div className="spacer" />
          <div className="avatar">{auth.user.name[0]}</div>
          <div className="hide-sm" style={{ lineHeight: 1.2 }}><b>{auth.user.name}</b><div className="small muted">{auth.student ? `${auth.student.name} · Class ${auth.student.class}-${auth.student.section}` : auth.user.username}</div></div>
          <button className="btn secondary sm" onClick={logout}>Log out</button>
        </header>
        <main className="content">
          <Suspense fallback={<Loading />}>
            <Routes>
              {groups.flatMap(([, items]) => items).map(([path, , , Comp]) => <Route key={path} path={path} element={<Comp />} />)}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <Toaster />
    </div>
  </AuthCtx.Provider>);
}
