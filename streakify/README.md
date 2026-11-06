# Streakify

Streak-based loyalty for coffee shops. One app serves every café: each café gets its own
subdomain (`sanaacafe.streakify.com`), its own logo, colors and rewards, and its own data.

**Status: Phase 1 done.** That covers the database, the counter check-in tablet, the streak rules, savings messages and demo mode.

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
2. Go to **SQL Editor**, paste all of `supabase/migrations/0001_init.sql`, and click **Run**.
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
2. Add environment variables: `NEXT_PUBLIC_ROOT_DOMAIN=streakify.com`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`.
3. In Vercel → Domains, add `streakify.com` and the wildcard `*.streakify.com`. A wildcard needs Vercel's nameservers on the domain.
4. To set up a custom domain later (e.g. `rewards.sanaacafe.com`):
   - add it in Vercel → Domains;
   - have the café add the CNAME that Vercel shows;
   - set `cafes.custom_domain = 'rewards.sanaacafe.com'` in Supabase.

   No code changes are needed.

## 4. Before going live at Sana'a Cafe
- Set the café's real time zone in the `cafes.timezone` column. It's `America/New_York` for now, and weeks and birthdays use it.
- Put the logo at `public/cafes/sanaacafe/logo.png`. Until then the name is shown in gold.
- In Toast, create a discount named **"Streak Reward"** with an open amount. The cashier applies it when the tablet says so.
- Check the reward prices and costs in `cafes.program` (pastry $4.50/$1.20 cost, drink $6/$1.50 cost). Phase 3 adds a screen for editing them.

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

## 7. Known limits in phase 1 (planned)
- The PIN only has a 1-second delay on wrong guesses. Add proper rate limiting before many cafés go live.
- The "Your streak ends tomorrow, that's $Y you'll lose" message is built and tested, but nothing shows it yet: right after a check-in the streak is safe. Phase 2 shows it on the customer page, and phase 5 sends it by text.
- Check-ins are trusted, not yet verified against Toast (phase 6).
