# Streakify

Streak-based loyalty for coffee shops. One app serves every café: each café gets its own
subdomain (`sanaacafe.streakify.com`), its own logo, colors and rewards, and its own data.

**Status: all 6 phases built.**

| Phase | What | Where |
|---|---|---|
| 1 | Database, counter check-in, streak rules, savings messages, demo mode | `/counter` |
| 2 | Customer page (personal link via QR), progress bar, countdown, monthly leaderboard | `/me/<token>`, counter |
| 3 | Owner dashboard: visits per day, top regulars, rewards given, **profit view**, edit rewards & colors, delete a customer | `/owner`, `/owner/settings` |
| 4 | Your admin page: all cafés, stats, PDF reports, add café, monthly report email | `streakify.com/admin` |
| 5 | “Streak ends tomorrow” texts via Twilio, opted-in customers only, STOP handling | daily job + `/api/twilio/inbound` |
| 6 | Toast: background purchase verification after each check-in | `src/lib/pos/toast.ts` |

Phases 4–6 switch on when you add their keys (see `.env.example`). Until then emails/texts are logged, not sent, so nothing goes out by accident.

### Logins (change them!)
| Who | Where | Default |
|---|---|---|
| Counter tablet | `/counter` | Sana'a PIN `2580`, demo café needs none |
| Café owner | `/owner` | Sana'a `sanaa-owner`, demo café is open |
| You | `/admin` | `ADMIN_PASSWORD` env var (`admin` when running locally) |

Change owner passwords and PINs from your admin page → café → *Café settings*.

---

## 1. Run it on your computer (2 minutes, no database needed)

```bash
cd streakify
npm install
npm run dev
```

With no Supabase keys, the app uses **in-memory data** that resets when you stop the server.

| Open this in Chrome | What you see |
|---|---|
| http://localhost:3000 | Streakify home: list of cafés |
| http://sanaacafe.localhost:3000/counter | Sana'a Cafe counter tablet (PIN **2580**) |
| http://demo.localhost:3000/counter | Demo café with fake customers (no PIN) |
| http://localhost:3000/c/sanaacafe/counter | Same counter, path-style link (for Vercel preview URLs) |

`*.localhost` subdomains work in Chrome, Edge and Firefox. Safari may not support them, so use the `/c/...` links there.

### Things to try
1. **Demo café**: tap a "pitch shortcut" customer, then tap **Check in**:
   - *Layla* reaches Silver and gets a free pastry.
   - *Maria* gets $1.50 off on her 2nd visit.
   - *Noor* gets a birthday drink.
   - *Sam* has a streak saver cover a missed week.
   - *Jake* is at the top level with the secret menu.
   - *Omar* has several rewards: tap **Use now** and then **Applied** to see "You saved $X today".
2. **New customer**: type any other number, e.g. (313) 555-0199, to see sign-up (privacy notice, separate SMS opt-in, leaderboard opt-in).
3. **Anti-cheat**: check the same number in twice. The second check-in is refused for 3 hours.
4. **Reset demo data**: use the link under the shortcuts.

### Automated tests
```bash
npm test          # 18 tests for the streak rules + demo data
npm run typecheck
npm run lint
```

---

## 2. Connect the real database (Supabase)

1. Create a project at supabase.com.
2. Go to **SQL Editor**. Paste all of `supabase/migrations/0001_init.sql` and click **Run**. Then do the same with `0002_phases_2_to_6.sql`.
3. Copy `.env.example` to `.env.local` and fill it in. You'll find the URL and **service_role** key under Project Settings → API. Generate a session secret with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. Load the cafés and demo data:
   ```bash
   npm run db:seed
   ```
5. Change Sana'a Cafe's counter PIN:
   ```bash
   npm run set-pin -- sanaacafe 4821
   ```
6. Restart `npm run dev`. The yellow "in-memory" notice on the home page disappears.

## 3. Deploy (Vercel + GitHub)

1. Import the GitHub repo in Vercel and set **Root Directory = `streakify`** (the repo root holds another website).
2. Add the environment variables from `.env.example`:
   - `NEXT_PUBLIC_ROOT_DOMAIN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `ADMIN_PASSWORD` and `CRON_SECRET`;
   - plus Resend, Twilio and Toast keys when you're ready.

   To show a demo without a database, set `ALLOW_MEMORY_DB=true` instead of the Supabase keys. The demo data resets whenever Vercel restarts the server, and different server copies may each hold their own data, so it's for pitches only.
3. `vercel.json` schedules the daily job (texts, plus monthly reports on the 1st–3rd). Vercel runs it automatically.
4. In Vercel → Domains, add `streakify.com` and the wildcard `*.streakify.com`. A wildcard needs Vercel's nameservers on the domain.
5. To set up a custom domain later (e.g. `rewards.sanaacafe.com`):
   - add it in Vercel → Domains;
   - have the café add the CNAME that Vercel shows;
   - type the domain into the admin page → café → *Café settings*.

   No code changes are needed.

## 4. Before going live at Sana'a Cafe
- Set the café's real time zone in the `cafes.timezone` column. It's `America/New_York` for now, and weeks and birthdays use it.
- Put the logo at `public/cafes/sanaacafe/logo.png`. Until then the name is shown in gold.
- In Toast, create a discount named **"Streak Reward"** with an open amount. The cashier applies it when the tablet says so.
- Check the reward prices and ingredient costs in the owner dashboard → *Edit rewards & look*. The pastry is set to $4.50 (costs $1.20) and the drink to $6 (costs $1.50).
- Set the owner's email on the admin page so the monthly PDF reaches them.
- Texts: in Twilio, register for US A2P 10DLC (required for business texting). Then set the inbound webhook to `https://<your domain>/api/twilio/inbound`.
- Toast: apply for Standard API access. Then put the restaurant GUID and the "Streak Reward" discount GUID in the admin page → café → *Café settings*. This code is untested against a live Toast account, so try it in Toast's sandbox first.

---

## 5. How the streak rules work
- Every check-in adds 1 **streak visit**. Levels unlock at streak visits: Bronze 0, Silver 4 (free pastry), Gold 8 (free drink), Mokha Legend 15 (secret menu).
- Each week (Mon–Sun, café time) the customer must visit at least once.
- For a missed week, the monthly **streak saver** is used first. If it's already used, the customer **drops one level** per missed week. Rewards they already earned stay.
- **2nd visit ever**: $1.50 off.
- **Birthday**: free drink, once a year, during the 7 days starting on the birthday.
- **Surprise**: a 5% chance per visit of a free cookie. The owner can change this.
- **Anti-cheat**: 1 check-in per phone every 3 hours.
- All of these are settings in the café's `program` JSON, so you don't change code to adjust them.

---

## 6. What every file does

### Settings & tooling
| File | In simple terms |
|---|---|
| `package.json` | The project's list of libraries and commands (`npm run dev`, `npm test`, ...). |
| `next.config.ts` | Next.js settings (left at the defaults). |
| `.env.example` | Template for your secret keys. Copy to `.env.local`, which is never committed. |
| `vitest.config.mts` | Settings for the test runner. |
| `AGENTS.md` | Notes for AI coding tools (generated by Next.js). |

### Database
| File | In simple terms |
|---|---|
| `supabase/migrations/0001_init.sql` | Creates the tables: **cafes**, **customers**, **visits**, **rewards** and **streak_events**. It locks them so only the server can read them. It also adds `apply_check_in`, which saves a whole check-in at once, or nothing if something goes wrong. |
| `scripts/seed.ts` | Puts Sana'a Cafe and the demo café into Supabase and fills the demo café with fake customers. |
| `scripts/set-pin.ts` | Changes a café's tablet PIN. |

### The brain (`src/lib/`)
| File | In simple terms |
|---|---|
| `streak/engine.ts` | **The streak rules.** Give it a customer, the café's rules and the time, and it returns the new streak, the level, any rewards and any savers used. It has no database code, so it's easy to test. |
| `streak/messages.ts` | Turns numbers into sentences: "You saved $X today", "Come back by Sunday…", "2 more visits until…", "Your streak ends tomorrow…". |
| `streak/engine.test.ts` | Tests that tell stories ("visits weekly, skips a week…") and check the rules. |
| `program.ts` | The café's editable rules (levels, rewards, cooldown, savers), checked for mistakes. |
| `brand.ts` | The café's look (logo, colors), checked for mistakes. |
| `time.ts` | Date math in the café's own time zone (weeks, days, months). |
| `money.ts` | Shows cents as "$4.50". Money is always stored as whole cents. |
| `phone.ts` | Cleans up typed phone numbers to one format (+13135550142). |
| `privacy.ts` | The exact privacy and SMS consent wording. Its version is saved with each customer. |
| `counter-auth.ts` | Tablet PIN lock: stores hashed PINs and the signed "this tablet is unlocked" cookie. |
| `tenant.ts` | Works out which café a web address belongs to. |
| `checkin/service.ts` | Connects one check-in from start to finish: find the customer, run the rules, save, and build the result screen. Also handles sign-up and using a reward. |
| `data/types.ts` | Shapes of cafés, customers and rewards, plus the list of storage operations. |
| `data/supabase-repo.ts` | Talks to the real database. |
| `data/memory-repo.ts` | A pretend database in memory, so the app works before Supabase is set up. |
| `data/index.ts` | Picks Supabase or memory depending on whether keys exist. |
| `demo/cafes.ts` | Starting settings for Sana'a Cafe and the demo café. Copy one to add a new café. |
| `demo/generate.ts` | Makes ~40 fake customers by replaying fake visits through the real rules. |
| `pos/*.ts` | Placeholders for Toast (phase 6). The interface is defined, so connecting Toast won't change the check-in code. |

### Screens (`src/app/`, `src/components/`)
| File | In simple terms |
|---|---|
| `src/proxy.ts` | Runs first on every request. It reads the address (sanaacafe.streakify.com) and quietly sends the request to that café's pages. |
| `app/layout.tsx`, `globals.css` | The page frame, fonts and brand color hooks. |
| `app/(streakify)/page.tsx` | Streakify's own home page. Phase 4 turns it into your admin page. |
| `app/site/[site]/layout.tsx` | Frame for all café pages: applies the café's colors and adds "Powered by Streakify". |
| `app/site/[site]/page.tsx` | The café's public rewards page. |
| `app/site/[site]/counter/page.tsx` | Loads the counter screen. |
| `app/site/[site]/counter/Counter.tsx` | The tablet UI: PIN, keypad, sign-up, results, the cashier's "Use now" flow and demo shortcuts. |
| `app/site/[site]/counter/actions.ts` | Server-side buttons: check in, sign up, redeem, unlock, reset demo. Each one checks the tablet is unlocked. |
| `components/*` | Reusable pieces: keypad, progress bar, logo, theme and footer. |

---

### Files added in phases 2–6
| File | In simple terms |
|---|---|
| `supabase/migrations/0002_phases_2_to_6.sql` | Adds owner login/email, text log, monthly-job log, reward dates. |
| `src/lib/auth.ts`, `src/lib/session.ts` | PIN/password checking and the signed login cookies for tablet, owner and admin. |
| `src/lib/leaderboard.ts` | This month's visit ranking, opted-in first names only. |
| `src/lib/stats.ts` | All dashboard numbers, including the profit view math. |
| `src/lib/report.ts` | Draws the monthly PDF. |
| `src/lib/email.ts` | Sends email through Resend. |
| `src/lib/sms.ts` | Twilio texts: consent check, no duplicates, STOP signature check. |
| `src/lib/jobs.ts` | The daily job: reminder texts, plus the leaderboard prize and report email at the start of each month. |
| `src/lib/pos/toast.ts`, `src/lib/pos/index.ts` | Toast login + order lookup; verifies visits after the customer is done. |
| `src/lib/urls.ts` | Builds correct links for subdomains, custom domains and `/c/` links. |
| `app/site/[site]/me/[token]/*` | The customer's personal page and their settings toggles. |
| `app/site/[site]/owner/*` | Owner login, dashboard, settings editor, delete-customer tool. |
| `app/(streakify)/admin/*` | Your admin page. |
| `app/api/cron/daily`, `app/api/twilio/inbound`, `app/api/report/...` | The daily job, Twilio's reply webhook and PDF downloads. |
| `components/VisitsChart.tsx`, `Leaderboard.tsx`, `Countdown.tsx` | Chart, leaderboard list and live countdown. |
| `vercel.json` | Tells Vercel to run the daily job at 16:00 UTC. |

## 7. Known limits
- Wrong-password lockouts are tracked per server instance. For a big rollout, move them into the database or Vercel KV.
- Toast and Twilio code follows their docs but hasn't run against live accounts. Test with sandbox credentials first.
- The profit view is an estimate: repeat visits × average order. It can't know which visits would have happened anyway.
