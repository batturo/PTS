---
name: fable-playbook
description: Working method for every task in this repository - how to plan before splitting work into steps, how to check the result before reporting it done, and the mistakes that most often produce plausible but wrong work. Load it at the start of every task, before the first edit or command, including small fixes and questions about the code.
---

# Working playbook

This is the working method for tasks in this repository: how to plan, how to check the result, and where work most often goes wrong. It was written as a handover by the agent that did the earlier work here, for whoever picks the work up next.

Follow it on every task, scaled to the task. A one-line fix gets a minute of planning and one real check. A new module gets all of it.

The failures this prevents are rarely caused by a hard problem. They are a correct change to the wrong thing, or plausible work that was never run. Both are cheap to prevent and expensive to find later, because the user reads your report and not your diff. If the report says "done", they will deploy it.

## 1. Plan before you split the work into steps

Do these in order. The step list comes last, because a step list written before the first four points is a guess with numbering.

1. **Say what done looks like, as something observable.** "Parents can see the late fee on the invoice" is a done condition. "Update the fees module" is not. If the request has several parts, list them; you will check each one off at the end. If you cannot write the done condition, you do not understand the request yet.

2. **Read the code before deciding anything.** Open the file you expect to change, the code that calls it, and one existing feature that does something similar. The similar feature tells you the conventions (naming, error handling, how a page talks to the API), and matching them is most of what makes a change look right here. Plans made from file names alone are wrong about half the time.

3. **Trace the change through every layer it touches.** A feature in this app usually crosses several files, and the ones that get forgotten are the ones nobody mentioned. Section 4 lists the layers. Write down each one the task touches before starting.

4. **Find the part you are least sure of and settle it first.** There is usually one question the rest depends on: does this column exist, does the driver support this SQL, can this role reach this route. Answer it with a grep or a two-minute experiment before building on top of it. Doing the easy parts first feels like progress and makes a wrong assumption expensive.

5. **Fix the scope.** Do what was asked. If you notice an unrelated bug or something worth cleaning up, mention it in your report and leave it alone. A fix does not need a surrounding refactor, new abstractions, extra files, or error handling for cases that cannot happen.

6. **Decide what to ask and what to assume.** Ask the user only when the answer changes what you build and you cannot find it in the code, the README, or the request. For everything else, take the conventional choice, carry on, and say which choice you made in your report. Always ask before anything destructive or hard to undo (section 3).

7. **Now write the steps.** Order them so the app still runs after each one, and give each a check you can perform: a command, a request, a page to load. A step with no check is where a bug will hide.

If the plan changes midway because you learned something, that is normal. Update the done condition and the steps consciously, and do not let the task drift into a different one.

## 2. Check your work before you say it is done

The rule is that a claim in your report needs evidence you observed in this session. "This should work" is a prediction. Reading the code and finding it plausible is also a prediction.

1. **Run it.** This repository has no test suite (`npm test` only prints an error), so checking means using the app: build it, start it, call the endpoint, load the page. Section 4 has the commands. A clean build proves the code parses and nothing more.

2. **Check the failure side as well as the success side.** For a bug fix, reproduce the bug before changing anything, then confirm the same steps now pass. Otherwise you do not know your change is what fixed it. For anything with permissions, call it as a role that should be allowed and as one that should be refused.

3. **Look at the real output.** Read the response body, not just the status code. For a page, open it in a browser and look at it (Chromium and Playwright are installed in cloud sessions); take a screenshot and view it. Printed documents here (receipts, payslips, ID cards) need a look at the print layout too.

4. **Read your own diff as a reviewer would.** Run `git diff` and go through every hunk. Each changed line should trace back to the request. Look for leftover debug output, commented-out code, files you did not mean to change, and edits made by a tool on your behalf (see `package-lock.json` in section 4).

5. **Check the neighbours.** If you changed a shared function, a table, or a component, grep for its other users and check at least one of them still works.

6. **Go back to the original request and check each part off.** Reread the user's words, not your summary of them. Long tasks drift, and the last thing you worked on feels like the whole task.

7. **Report what happened, exactly.** Lead with the outcome. Say what you verified and how, what you could not verify and why, and anything you assumed. If something failed or was skipped, say so plainly with the output. "Built and the endpoint returns the new field; I could not check the Netlify function because it needs a deploy" is a good report. An unqualified "done" on partly checked work is the single most damaging thing you can write.

## 3. Mistakes to watch for

Each of these has a tell you can notice in your own behaviour.

- **Fixing the symptom.** Wrapping the failing line in a try/catch, adding a null check, or special-casing the one input from the bug report makes the error disappear and leaves the cause in place. Ask why the bad value got there.
- **Editing before reproducing.** If you have not seen the bug happen, you are fixing your theory of it.
- **Inventing instead of looking.** Before you use a function, route, column, setting or npm script, grep for it. Names that sound right are frequently not the names in the code.
- **Hiding something in the UI and calling it secure.** Every permission in this app is enforced on the server with `allow()`. A menu item removed in `App.jsx` without the matching server check is not a permission.
- **Making a check pass by weakening the check.** Loosening a validation, deleting an assertion, or catching an error so it stops printing is not a fix. If a check seems wrong, say so and let the user decide.
- **Repeating a failed command.** When something fails, read the whole error before doing anything. Running the same thing again, or a small variation of it, three times is the tell. Change your understanding first, then the command.
- **Stopping at the first obstacle, or asking what you could look up.** A missing dependency, an occupied port, or an unfamiliar file is something to work through. Stop for real blockers: missing access, a decision only the user can make, a destructive step.
- **Scope creep.** The tell is a diff larger than the request sounds. Unrequested renames, reformatting, new helper files, and extra documentation all make the change harder to review and are usually unwanted.
- **Claiming more than you checked.** Covered above, and worth repeating because it is the most common one. The tell is the words "should", "likely" or "I believe" in a sentence about whether something works.
- **Destructive or outward-facing actions without asking.** Confirm with the user before deleting data, force-pushing, rewriting history, pushing to `main`, or opening a pull request. In this repo specifically: `npm run seed` wipes the local database, which is fine in a fresh checkout and never fine on a machine holding a real school's data. A push to `main` that touches `client/` publishes new Android and iOS builds to the Releases page.
- **Secrets in the repository.** `JWT_SECRET`, keystores and passwords belong in environment variables or repository secrets, never in committed files.

## 4. This repository: layers, commands, traps

Everything here was run and seen working when this playbook was written (November 2026). If a command stops working, trust what you observe and update this file.

### The layers a change can touch

| Layer | Where |
|---|---|
| Tables and default settings | `server/src/db.js` (`migrate()`; tables are created with `CREATE TABLE IF NOT EXISTS`, so an existing database does not pick up a new column from an edited `CREATE TABLE`) |
| API routes | `server/src/routes/*.js`, mounted in `server/src/app.js` |
| Permissions | `allow(...roles)` on each route, defined in `server/src/auth.js` |
| Demo data | `server/src/seed.js` |
| Screens | `client/src/pages/*.jsx`, one per feature |
| Navigation and who sees which screen | the `NAV` table in `client/src/App.jsx` (`[path, label, icon, component, roles]`) |
| API client | `client/src/api.js` |

The database has two drivers behind one small API: Node's built-in SQLite for the normal server, and `sql.js` (WebAssembly) for the Netlify Function, which is how the live site runs. A local run only exercises the first one. SQL or driver features that work locally can still fail on the live site, so keep to the plain `exec` / `prepare().get/all/run` calls the existing routes use, and say in your report that the Netlify path was not exercised unless you actually ran it.

The mobile apps are the same client built with `--mode mobile`, pointed at the live site by `client/.env.mobile`. A client change reaches phones only after it is on `main`.

### Run and check

```bash
npm run setup      # install server and client dependencies
npm run seed       # demo school; deletes the existing local database first
npm run build      # build the website into client/dist
npm start          # API and website on http://localhost:4000
```

Then, with the server running:

```bash
curl -s localhost:4000/api/health
```

returns `{"ok":true}`. To call the API as a role, log in and use the token:

```bash
TOK=$(curl -s -X POST localhost:4000/api/auth/login -H 'content-type: application/json' \
  -d '{"username":"teacher","password":"teacher123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s -w '\n%{http_code}\n' localhost:4000/api/fees/structures -H "authorization: Bearer $TOK"
```

A teacher gets 200 on that `GET` and 403 on a `POST` to the same path, which is a ready-made pattern for checking a permission from both sides. Demo logins for all seven roles are in the README.

### Traps already found

- `npm run setup` rewrites `client/package-lock.json`. Unless the task is a dependency change, restore it with `git checkout client/package-lock.json` before committing.
- The login route is `/api/auth/login`. `/api/login` answers "Not logged in", which looks like a bad password and is not.
- Stop the server you started before finishing (`pkill -f src/index.js`), or the next run finds port 4000 taken.
- Build output, the local database and uploads are git-ignored. If `git status` shows them, something is wrong with the path you wrote to.
