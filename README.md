# Swami Abhyasika — Full-Stack Conversion (from SWAMI_V20.html)

This is a **faithful, unmodified** conversion of `SWAMI_V20.html` into a real
client-server web app. Every function, every UI element, every workflow
(including seat booking being directly linked to New Admission) is byte-for-byte
identical to the original file — nothing was removed, reordered, or rewritten.

## How it works

The original app was 100% localStorage-based. Rather than rewrite its logic,
this conversion:

1. Extracted the app's inline `<script>` block verbatim into `public/app.js` —
   not a single line changed.
2. Added a small loader (`public/index.html`) that, before the app boots:
   - Fetches all your data from the backend (`GET /api/kv`)
   - Writes it into real `localStorage` (so the untouched app code sees exactly
     what it always expected)
   - Transparently mirrors every `localStorage.setItem` / `removeItem` call
     back to the server, keeping the database in sync automatically
3. Added a minimal login page + JWT auth, since a real server needs an access
   boundary (the original single file had none).

Everything downstream — admissions, payments, seat booking, WhatsApp templates,
themes, exports — runs exactly as it did before. Only *where the data lives*
changed: from one browser's localStorage to a real SQLite database on your server.

## Run locally

```bash
npm install
cp .env.example .env        # then edit JWT_SECRET and ADMIN_PASSWORD
npm run seed                # creates your admin login
npm start                   # or: npm run dev (auto-reload)
```

Open `http://localhost:3000` — you'll be redirected to `/login.html`,
sign in with the username/password from `.env`.

## Migrate your existing data

If you've been using `SWAM_V19.html` or `SWAMI_V20.html` in a browser already:

1. Open that HTML file in your browser
2. DevTools console (F12) → run: `copy(JSON.stringify(localStorage))`
3. Paste the result into `data/legacy_localstorage.json`
4. Run: `npm run migrate`

## Deploy

Any Node.js host works. The database is a single SQLite file at `data/app.db`,
so make sure your host gives it a **persistent disk/volume** — otherwise your
data will reset on every redeploy. See the deployment guide for free-hosting
options (Render, Northflank).
