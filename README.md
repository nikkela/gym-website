# Iron Pulse Gym website + member portal

Apple-style public website (`index.html`) plus a member & owner portal (`app.html`, opened at `/app`).

## Files
- `data.js` – **edit here**: gym name, phone, address, hours, plans & prices, batches, class timetable. Used by both pages.
- `index.html` – public site. Photos, programs and trainers are in the `EDIT HERE` block in its script.
- `app.html` – login + member app + owner dashboard.
- `functions/api/[[path]].js` – backend API (Cloudflare Pages Function).
- `migrations/` – database tables (D1).

## Login
- **Owner:** tap *Owner*, type the owner PIN once. Stays logged in on that device.
- **Member, one tap:** when the owner adds a member, they press **Send login** and a WhatsApp message goes to the member with a link. One tap on the link logs them in, and they stay logged in.
- **Member, by hand:** phone number + 4-digit PIN (shown to the owner in the member's details).
- 10 wrong tries in 15 minutes blocks further tries for that phone/IP.

## What members see
One-tap check-in / check-out with a live workout timer, plan and days left (with renew-on-WhatsApp when it is close to expiry), visits this month, streak, average workout time, usual check-in time, this week's visits, today's classes, full attendance history (in / out / duration) and payments.

## What the owner sees
- **Today:** who's in the gym now, today's attendance with in/out times, quick check-in by name or phone, counts (in gym, visits today, expiring in 7 days, expired, active, revenue this month).
- **Members:** search, filter (active / expiring / expired), add member, export CSV. Each member: call, WhatsApp, check in/out, send login link, renew (extends the validity and records the payment), edit, reset PIN, delete, attendance and payments.
- **Renewals:** memberships expiring this week, expired in the last 60 days, and active members not seen in 7+ days — each with a one-tap WhatsApp reminder.
- **Insights:** revenue, new members, daily visits (14 days), busy hours (30 days), members by plan, recent payments.

All dates use India time. A check-in left open for more than 6 hours is closed automatically.

## Setup (Cloudflare Pages, free plan is enough)
The public website works on any host, but the portal needs Cloudflare Pages because it stores data in a Cloudflare D1 database.

1. Create the database, then paste the `database_id` it prints into `wrangler.toml`:
   ```bash
   npx wrangler d1 create gym-db
   ```
2. Create the tables:
   ```bash
   npx wrangler d1 migrations apply gym-db --remote
   ```
3. Deploy:
   ```bash
   npx wrangler pages deploy .
   ```
4. Set the owner PIN (use 6+ digits):
   ```bash
   npx wrangler pages secret put OWNER_PIN
   ```

### Run locally
```bash
echo 'OWNER_PIN=123456' > .dev.vars
```
```bash
npx wrangler d1 migrations apply gym-db --local
```
```bash
npx wrangler pages dev .
```
Then open http://localhost:8788/app.
