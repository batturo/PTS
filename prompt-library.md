# Prompt library

Sixteen prompts, grouped by job. Each one is written so any model can run it: it states the goal, the steps in order, the reply format, and the check to make before answering.

How to use it:

- Fill in every `[bracket]` before sending.
- A bracket with a value after a colon, such as `[host: Netlify]`, shows a default. Keep it or change it.
- A bracket with `|` between options means pick one.
- Send one prompt per message. Each prompt stands on its own.

| Job | Prompts |
|---|---|
| 1. Build | 1.1 Multi-role app · 1.2 Website in phases |
| 2. Ship | 2.1 Push to GitHub · 2.2 Publish with a working link · 2.3 Mobile app builds · 2.4 Report a problem |
| 3. Content and video | 3.1 Find working hooks · 3.2 Break down a video · 3.3 Remake a reel with my character |
| 4. Set up tools | 4.1 Install from a link · 4.2 Orchestrator and workers |
| 5. Hand work to a cheaper model | 5.1 Write the playbook · 5.2 Audit and rewrite my skills · 5.3 Turn corrections into rules · 5.4 Test a skill · 5.5 Compare and fix the skill |

---

## 1. Build

### 1.1 Multi-role app

**When to use:** You want a website plus Android and iOS apps where different kinds of users log in and see different things.

```
Build [name of the system] for [who it is for, and the country]. It is one codebase that runs as a website and as Android and iOS apps.

USERS AND WHAT EACH CAN DO
- [Role 1]: [what they can see and do]
- [Role 2]: [what they can see and do]
- [Role 3]: [what they can see and do]
- [Admin role]: creates the accounts of [which roles] and can use every feature of [which roles].

MODULES
- [Module 1]: [what it stores; what can be done with it; who fills it in; who only views it]
- [Module 2]: [the same four things]

RULES WITH NUMBERS
- [for example: 30 days after a post, send a reminder; no reply in 5 days moves it to Outdated]

Do the work in this order:
1. Write a table of roles against features. Mark each cell: full access, view only, or none. Where my description leaves a cell unclear, pick the most common choice and mark it "assumed". Show me the table, then keep going without waiting for me.
2. Build the server, the website and the app projects. Enforce every permission on the server. Hiding a button is never the only protection.
3. Add demo data that looks real for [country], and one demo login per role.
4. Design it for this business: use the name [name], the colours [brand colours | "choose two and tell me"], and real sample content. It must not look like a generic template: no placeholder text, no stock gradient banner, no emoji used as icons.
5. Test it in a real browser. Log in as each role and open every page. For each role, try one action that role is not allowed to do and confirm the server refuses it.
6. Write everything in English.

Before you answer, check three things: every role in my list can log in; every module in my list exists; step 5 passed for every role.

Reply in this format:
- What works: 3 to 5 lines
- Demo logins: a table of role, username, password
- Assumptions: every cell you marked "assumed"
- Not built or not tested: each item with the reason (for example, the iOS build)
- How I open it: a public link if you have one. Never a localhost address.
```

**A good answer:**
- Starts with the roles-against-features table, and every role and module from your list is in it.
- Gives a working demo login for each role.
- Says plainly what was not built or tested, instead of an unqualified "done".
- Contains no localhost link and no steps for you to run on your own computer.

### 1.2 Website in phases

**When to use:** You are building a real, production website and want to review it one phase at a time.

```
You are building a production [type of site, for example e-commerce] website for a real business. Work through the phases below in order.

At the end of each phase:
1. Run the build, the linter and the tests.
2. Fix whatever fails, and run all three again until they pass.
3. Commit.
4. Stop and send me the stop report (format below). Do not start the next phase until I reply with its number.

Never invent a business fact. Anything I have not given you goes in [config file: config/store.ts] as a clearly marked TODO.

BUSINESS FACTS
- Name: [ ]  Tagline: [ ]
- What it sells or does: [ ]
- Address: [ ]  Opening hours: [ ]
- Phone: [ ]  Order or contact channel: [for example a WhatsApp number]
- Social links: [ ]  Domain: [ ]
- Legal name and tax number: [ ]
- Delivery areas and fee: [ ]  Returns rule: [ ]
- Currency: [ ]  Language: [English, simple wording]

BRAND
- Look: [colours as hex codes; path to the logo file]
- Tone: [for example: direct, price-led, no hype words]

STACK
- [framework, database, host]. Check the current documentation for each before using it. Do not rely on memory for version numbers.
- Secrets go only in environment variables. Provide a .env.example file.

PHASES
- Phase 1, [name]: [what to build]
- Phase 2, [name]: [what to build]
- Phase 3, [name]: [what to build]
- Phase [n], [name] (do not start until I say so): [what to build]

RULES
- [for example: no fake reviews, countdown timers or low-stock labels; stock shown is real stock]
- [for example: write tests for price maths, stock changes and the order message]

Stop report, same format every phase:
- Phase [n] done: yes or no
- Build, lint, tests: pass or fail for each, with the number of tests
- What I should look at: 3 to 6 things, each with where to find it
- Open TODOs: every TODO still in the config file
- Not tested: anything you could not check, and why

Start with Phase 1 now.
```

**A good answer:**
- Covers one phase only, then stops.
- Reports build, lint and tests separately, with a test count.
- Lists every open TODO each time, and none of them has been filled with a made-up fact.
- Names what was not tested (for example "not tested against the real database").

---

## 2. Ship

### 2.1 Push to GitHub

**When to use:** The project works and you want it in a GitHub repository.

```
Push this project to GitHub.

Repository: [owner/repo | "create a new one called NAME"]
Branch: [main]

Steps:
1. Check that no secrets, passwords, keys or database files are about to be committed. If any are, add them to .gitignore first and tell me which.
2. Commit everything else with a one-line message that says what the project is.
3. Push to the repository and branch above.
4. Confirm it arrived: compare the latest commit on GitHub with the local one.

If the push is refused, try once more at most. Then tell me in one line why (repository missing, no access, wrong name) and the one thing I need to do, and wait for me to say "done".

Reply with: the repository link, the branch, the commit ID, the number of files, and "confirmed on GitHub: yes or no".
```

**A good answer:**
- Five facts: link, branch, commit ID, file count, confirmed yes or no.
- If it failed: one reason and one action for you, with no list of options to choose from.

### 2.2 Publish with a working link

**When to use:** You want a public link you can open on your phone and share, and you want it tested before you get it.

```
Publish [this project] on [host: Netlify] and give me a public link I can open on my phone and share.

Steps:
1. Deploy the whole thing to [host]: pages, server and database. Do not add a second hosting service unless I agree first.
2. If a live site already exists there, create a new site and leave the old one alone. Tell me you did.
3. Make sure the live site has demo logins: one per role.
4. Open the live link yourself and test it:
   a. The home page loads.
   b. Each demo login signs in.
   c. One thing you save is still there after a refresh.
   d. The server log shows no errors for those requests.
5. If any test in step 4 fails, fix it and repeat step 4. Do not send me the link until all four pass.

If you cannot deploy from where you are, tell me the one step only I can do (for example "connect the repository in Netlify") and wait for me to say "done". Do not send a list of alternatives.

Never give me a localhost address or commands to run on my own computer.

Reply in this format:
- Link: the public URL
- Demo logins: a table of role, username, password
- Tested on the live site: a, b, c, d, each marked pass
- Not tested: anything you could not check, and why
```

**A good answer:**
- One public link that opens for you first time.
- Demo logins in a table, and they work.
- a, b, c and d each marked pass, tested on the live site and not on a local copy.
- Anything untested is named.

### 2.3 Mobile app builds

**When to use:** The website is live and you want Android and iPhone apps for it.

```
Make installable mobile apps for [project] that use the live site at [public URL].

Build: [Android | iOS | both]
App name: [ ]  App ID: [for example com.company.app]

Steps:
1. Build the Android app as an .apk file I can install directly.
2. Build the iOS app as an .ipa file.
3. If you cannot build on your own machine, set up an automatic build on [GitHub Actions] and wait for it to finish. If a build fails, read the error, fix it, and run it again.
4. Check that each finished file exists and can be downloaded.

Reply with, for each platform:
- Download link
- Signed or unsigned, and what that means for installing it
- Install steps for a phone: numbered, 5 at most
- If the iOS file is unsigned: the free way and the paid way to install it, one line each
```

**A good answer:**
- A download link per platform that has been checked.
- Says whether each file is signed.
- Install steps you can follow on the phone, 5 or fewer.

### 2.4 Report a problem

**When to use:** A link, login or step you were given does not work.

```
Something you gave me is not working.

What I did: [the link I opened, or the step I ran]
What I expected: [ ]
What I saw instead: [paste the exact error text, or describe the screen]

Steps:
1. Reproduce it yourself first. If you cannot, say so and ask me for one specific thing: a screenshot, the address in the address bar, or the time it happened.
2. Find the cause and say it in one sentence I can understand.
3. Fix the cause. Do not just hide or reword the error.
4. Repeat exactly what I did and confirm it now works.

Reply with:
- Cause: one sentence
- What you changed
- Retested: yes or no
- What I do now: 3 steps at most. If you need something from me, name the one thing.
```

**A good answer:**
- States the cause in one sentence, and takes responsibility if the fault was in what you were given.
- Says "retested: yes" only after repeating your exact steps.
- Asks you for one thing at most.

---

## 3. Content and video

### 3.1 Find working hooks

**When to use:** You want opening lines that are getting views right now in one niche.

```
Find hooks that are working right now on [platform: Instagram Reels] for [niche].

By [niche] I mean: [one line describing the kind of creator and content, so it cannot be read another way].
Posted in: the last [7] days
Minimum views: [1,000,000]
How many: at least [15] videos from at least [10] different creators

Steps:
1. Search with [tool: vidIQ]. Use real results only, never examples from memory.
2. Drop every video that is outside the date range, under the view minimum, or outside my definition of the niche.
3. For each video, write down the hook: the first words spoken or shown on screen, copied exactly.
4. Group the hooks by pattern, for example question, POV, challenge, confession.

Reply with one table per pattern. Columns: hook (exact words), link, views, date posted, creator's follower count. Under each table add two lines: why the pattern works, and one new hook in that pattern for [my account or character].

Before you answer, check that every row has a link and a view count from the tool, and that every row is inside the date range. If you found fewer than [15], say how many and do not pad the list.
```

**A good answer:**
- Every row has a link, a view count and a date, all inside your limits.
- Hooks are quoted exactly, not paraphrased.
- Matches your definition of the niche, not a broader reading of the word.
- If fewer videos were found than you asked for, it says so.

### 3.2 Break down a video

**When to use:** You saw a video and want to know how the business in it works, or why the video performed.

```
Break down this video: [link]

I want to know: [the business model and how I could do the same | why it performed | the format, so I can make my own]

Steps:
1. Watch the video with [tool: vidIQ]. If the link is blocked or the tool does not accept that site, try one other route: the same video on Instagram, TikTok or YouTube. If that fails as well, stop and ask me for the caption, a description or screenshots. Do not guess what the video shows.
2. Say what the video shows in 3 lines: who, what they do, what they claim.
3. Answer my question using what is in the video. Mark anything you are inferring as "my guess".

For a business model, use these headings:
- How it makes money: who pays, for what, and the rough profit per sale
- What the video leaves out: costs, competition, effort
- Is it realistic: yes, partly or no, with the reason
- How I could start: startup cost, tools, and the first 30 days as a numbered list

If what the video recommends would break a platform's rules or mislead people, say so plainly and do not explain how to do it.
```

**A good answer:**
- Shows it watched the video: 3 lines on what is in it.
- If it could not watch, it tried the tool before saying so, and asked for the caption or screenshots.
- Guesses are labelled.
- The 30-day plan has numbers: cost, tools, steps.

### 3.3 Remake a reel with my character

**When to use:** You want your own version of a reel format, with your own character.

```
Make a new video inspired by this reel: [link]
Use my character: [character name, and where its image or character sheet is stored]
For: [account or platform], [length in seconds: 6], [aspect ratio: 9:16]

"Inspired by" means the same format and idea, with my character, new footage, new audio and my own wording. Do not reuse any of the original video or sound, or the creator's face, name or exact script.

Steps:
1. Watch the reel with [tool: vidIQ]. Write down its format in 4 lines: setting, framing, what happens, the hook line.
2. Write the plan for my version: the scene, what the character says or does, and the caption.
3. Before generating anything, tell me the cost in credits and my balance. If the cost is more than [limit] credits, stop and ask.
4. Generate one video with [video tool].
5. Watch the result and check four things: it is my character; the framing matches the plan; the sound is right; nothing is distorted.

Do not publish or post anything. Wait for me to say "publish".

Reply with: the video, the plan from step 2, what you checked in step 5, the credits spent, and anything that looks wrong.
```

**A good answer:**
- One finished video of your character, with nothing taken from the original.
- The credit cost is stated before generating and again after.
- Lists what was checked on the result.
- Nothing is posted.

---

## 4. Set up tools

### 4.1 Install from a link

**When to use:** You have a link to an install guide and want the tool set up and confirmed working.

```
Install [tool name] by following this guide: [link]

Where: [this session | my Mac | both]

Steps:
1. Read the whole guide before running anything. Tell me in 3 lines what it will install and what it will change.
2. If any step downloads and runs a script, needs my password, or changes system settings, stop and show me that exact command first.
3. Install the latest stable release, not a beta.
4. If a step needs my password, do not ask me for it. Give me the one command to run in Terminal myself, and wait for me to say "done".
5. Run the tool's own check command to confirm it works.

Reply in English, even if the tool's output is in another language. Give me:
- The version installed
- The output of the check
- What it can do now: 3 lines
- Anything that still needs a login or a key
```

**A good answer:**
- Tells you what will be installed before installing it.
- Shows the version and the check output.
- Is in English throughout.
- Never asks you to type a password into the chat.

### 4.2 Orchestrator and workers

**When to use:** You are starting a project and want one main session that plans and checks while cheaper worker agents do the bulk work.

```
Set this project up as an orchestrator-and-workers system.

Project: [what this project is, in one or two sentences. If I left this blank, ask me two questions before anything else.]
Worker model: [haiku]

Show me every file before you write it.

1. Create CLAUDE.md with three parts: what this project is, the rules in step 2, and this folder map, word for word:
   - CLAUDE.md: what this project is, the rules, where everything lives (read first, every session)
   - docs/progress.md: where we are: done, next, a dated log line per session
   - docs/decisions.md: what's settled, with the date and why
   - docs/known-issues.md: gotchas and their fixes
   - .claude/agents/: worker agents, each with the worker model and one job
   - .claude/skills/: one folder per repeatable task, each with a SKILL.md
2. Rules to put in CLAUDE.md:
   - The main session is the orchestrator. It plans, writes briefs and checks results. It does not do bulk work itself when a worker can do it.
   - Workers are subagents on [worker model]. Every brief states the goal, the files to read, and a "Done when:" check that can be run or seen.
   - Before accepting a worker's output, run its check yourself. If it fails, send it back with the failure. Never pass on a worker's report unchecked.
   - Start of every session: read CLAUDE.md and the three docs. End of every session: update progress.md, add new decisions and gotchas, and propose skill edits with the evidence from this session. I approve them before you apply them.
3. Create docs/progress.md, docs/decisions.md and docs/known-issues.md, each with its heading and one example line.
4. Create .claude/agents/builder.md: it writes code to a brief, runs the brief's check, and reports the exact command it ran and the output. It does not report done until the check passes.
5. Create .claude/agents/reviewer.md: it reads a diff against a brief and lists what fails it.
6. Create .claude/skills/reflect/SKILL.md: at the end of a session, list what went wrong or took too long, propose the smallest edit to a skill or CLAUDE.md that would have prevented it, and wait for my OK.
7. Commit and push. If the push is refused, say why in one line and what I need to do.
8. Tell me which of these settings you could not set yourself, so I set them by hand: [/effort xhigh], [export CLAUDE_CODE_SUBAGENT_MODEL=haiku], [export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40].

Reply with: the list of files created, the commit ID, "pushed: yes or no", and the settings from step 8 that are left for me.
```

**A good answer:**
- Shows each file before writing it.
- The folder map in CLAUDE.md matches yours word for word.
- Reports the commit ID and whether the push went through.
- Tells you which settings it was not allowed to change.

---

## 5. Hand work to a cheaper model

### 5.1 Write the playbook

**When to use:** A cheaper model is about to take over, and you want the current model's working method written down for it.

```
Tomorrow [cheaper model] takes over my work from you.

Write a playbook for it and save it as a skill called [name: playbook] that it follows on every task. Cover three things, in this order:
1. How to plan a task before breaking it into steps.
2. How to check its own work before saying it is done.
3. The mistakes to watch for, each with how to notice it in its own behaviour.

Rules for the playbook:
- Numbered steps, one action each.
- Every rule has a one-line reason.
- Include the exact commands to run and check this project. Run each one yourself first, and include only the ones that worked.
- End with a checklist to go through before saying "done".

Then make sure the skill loads on every task, and tell me what you added to make that happen.

Reply with: where the file is, what each part covers in one line, what you tested, and what you did not test.
```

**A good answer:**
- A skill file with the three parts, numbered steps, reasons and a final checklist.
- Project commands that were run and seen to work.
- Says how the skill gets loaded on every task.
- Says whether it was tested on the cheaper model.

### 5.2 Audit and rewrite my skills

**When to use:** You want to know which of your skills a cheaper model would get wrong, and fix the worst one first.

```
[Cheaper model] takes over my work, so every skill has to work without your judgement.

1. Read every SKILL.md in [my .claude/skills folders]. Tell me how many you found and where each one comes from.
2. Score each skill out of 10 for how well [cheaper model] could follow it. Give up to 2 points each for:
   - a description that says exactly when to use it
   - steps in order, one action each, with numbers or limits
   - a one-line reason on every rule
   - one finished example of the output
   - a checklist at the end
3. For each skill, quote the exact lines that would trip it up: vague words such as "good", "clean" or "properly"; steps with no order; rules with no reason; two lines that contradict each other.
4. Rewrite the lowest-scoring skill so it earns 2 on all five. Keep what the skill does exactly the same: do not add, remove or change a behaviour. Where you had to turn a judgement call into a fixed rule, list each one for me.
5. Show me the before, the after and the new score. Then stop. Do not change any other skill until I say yes.

Reply with: a table of skill, score and quoted lines; the before and after files; the list from step 4; and where rewritten skills can be saved so they last.
```

**A good answer:**
- A score and quoted lines for every skill found.
- One rewrite only, with before and after as files.
- A list of every judgement call it turned into a rule.
- Says where the rewrite can be saved durably, and stops there.

### 5.3 Turn corrections into rules

**When to use:** You want the things you keep correcting saved as standing rules.

```
Find every time I corrected you in the last [7] days, and turn the corrections into rules.

1. Search [my past chats | my Claude Code sessions]. Before anything else, tell me what you can and cannot see: how many chats, and the dates covered.
2. A correction is any message where I did one of these:
   - said no, or said something was wrong
   - reported that something you gave me did not work
   - redirected you to what I actually meant
   - rewrote what you gave me
3. Write one rule per correction. Next to it, quote my own words and give the date.
4. Merge repeats into one rule and count how many times I said it.
5. Put anything you are unsure about in a separate "borderline" list. Do not guess.
6. Show me the full list as a table with the columns: rule, my words, dates, times. Save nothing yet.
7. When I say yes, save each rule to [memory | notes | CLAUDE.md] and tell me where each one went.
```

**A good answer:**
- Opens with what was and was not searched.
- Each rule sits next to your own quoted words and a date.
- Repeats are merged with a count.
- Unclear cases are in a separate list.
- Nothing is saved before you say yes.

### 5.4 Test a skill on the cheaper model

**When to use:** You want to see what the cheaper model actually produces from one of your skills. Run this first, then 5.5.

```
/model [cheaper model: opus]

Use my [skill name] skill on this: [a real task I do every week, with the real inputs].

Follow the skill as written, from its first step to its last.
Save the result to [file path].
Finish with the skill's own checklist, marking each line pass or fail.
Then list anything in the skill you were unsure how to follow, quoting the line.
```

**A good answer:**
- The finished output, saved where you asked.
- The skill's checklist with each line marked.
- A short list of lines it found unclear, or "none".

### 5.5 Compare and fix the skill

**When to use:** Straight after 5.4, to find where the cheaper model went wrong and fix the skill's instructions.

```
/model [stronger model: fable]

I ran my [skill name] skill on [cheaper model].
The skill is at: [path to its SKILL.md]
The task was: [the same task as before]
Here is what it produced: [paste it | the file path]

1. Do the same task yourself, following the same skill. Save your version to [file path].
2. Compare the two. List every place [cheaper model] went wrong or cut a corner. For each one give: what it did, what it should have done, and the line in the skill, or the missing line, that caused it.
3. Fix the skill, not the output. For each item in step 2, change the instruction so [cheaper model] gets it right next time: add the missing step, number, example or check. Do not change what the skill does.
4. Show me each change as before and after.
5. Give me the exact prompt to run on [cheaper model] to test it again, and say what a pass looks like.

If the two outputs are equally good, say so and change nothing.
```

**A good answer:**
- A numbered list of differences, each traced to a line in the skill.
- Edits to the skill file only, shown before and after.
- A ready-to-paste retest prompt and a clear pass condition.
- If nothing needed fixing, it says so.
