# School Ride Tracker

A minimal web app for tracking daily school carpool rides, dues, and payments.
Three riders, Monday–Saturday, with a fixed rate per day.

**Anyone with the link can view. Only the teacher can edit (PIN-protected).**

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Static HTML / CSS / vanilla JS (ES modules) |
| API | Vercel Serverless Functions (Node.js) |
| Database | Supabase (PostgreSQL with Row-Level Security) |

```
├── index.html / view.html / edit.html   ← static pages
├── css/style.css                        ← all styles
├── js/                                  ← browser ES modules
│   ├── utils.js  (dates, calculations)
│   ├── api.js    (fetch client + token)
│   ├── view.js   (read-only view)
│   └── edit.js   (PIN screen + editor)
├── api/                                 ← Vercel serverless functions
│   ├── _lib/     (auth, db, validation)
│   ├── verify-pin.js
│   ├── data.js
│   └── write.js
├── supabase-setup.sql                   ← database schema + RLS
└── vercel.json                          ← routing config
```

---

## Setup

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor → New query** and paste the contents of `supabase-setup.sql`. Run it.
3. Go to **Settings → API**. You will need two things:
   - **Project URL**
   - **Project API Keys**: Copy the `service_role` / `secret` key (NOT the `anon` / `public` key).

### 2. Vercel

1. Push this repo to GitHub.
2. Import it into [vercel.com](https://vercel.com) → **New Project**.
3. Add these **Environment Variables** in Vercel settings:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | `https://your-project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | *(from Supabase dashboard)* |
| `EDIT_PIN` | `1234` ← **change this to your actual PIN** |
| `JWT_SECRET` | *(random string — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)* |

4. Deploy. Your app is live.

### 3. Local development

```bash
npm install
npx vercel dev
```

Create a `.env.local` file with the same four variables.

---

## Changing the PIN

The PIN is stored **only** as the `EDIT_PIN` environment variable in Vercel.
It never appears in the code or in any file shipped to the browser.

To change it: **Vercel Dashboard → Settings → Environment Variables → EDIT_PIN** → update → redeploy.

---

## Security summary

- **PIN** is server-only (env var), compared with constant-time algorithm.
- **Brute-force protection**: 5 wrong attempts → 15-minute lockout per IP.
- **JWT session**: HS256, 30-day expiry, verified on every write.
- **Database RLS**: anon can SELECT, but INSERT/UPDATE/DELETE are blocked.
  All writes go through the API using the service_role key.
- **No write endpoints** exist on the View page. Direct API calls without a valid token return 401.
