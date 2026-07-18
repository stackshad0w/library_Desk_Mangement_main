# Swami Abhyasika — Vercel + Turso + Cloudinary build

Same app as the v20 full-stack conversion — **`public/app.js` is still
byte-for-byte the original inline `<script>` from the source HTML file,
untouched.** What changed is the infrastructure underneath it:

| | v20 (Node/Express) | this build |
|---|---|---|
| Server | Express, long-running Node process | Vercel serverless functions (one file per route, `/api/**`) |
| Database | SQLite file on local disk | [Turso](https://turso.tech) — hosted libSQL, SQLite-compatible |
| Student photos | base64 data URI stored inline in the DB | uploaded to [Cloudinary](https://cloudinary.com), only the URL is stored |
| Hosting | needs a host with a persistent disk | Vercel (static + functions, no disk needed) |

## Why these three changes go together

The old design stored a SQLite file on local disk — that only works on a
host that gives you a persistent volume. Vercel's functions are stateless
and ephemeral, so the database has to live somewhere else: Turso is
SQLite-compatible (same mental model, same `kv` table, practically the same
queries) but reachable over the network, which is what makes the rest of
the app portable to serverless.

Once the database isn't a local file anymore, storing multi-megabyte
base64 photos as TEXT rows stops being free — every read of `/api/kv`
would ship every student's photo on every page load. Cloudinary fixes
that: photos become small URLs in the database, and the images themselves
are served from Cloudinary's CDN.

## How the photo offload works (without touching app.js)

`app.js` still just does `student.photo = <base64 string>` and calls
`localStorage.setItem('edu_students', JSON.stringify(students))`, exactly
as before. The loader in `public/index.html` (the only file that changed
besides the backend) intercepts that call: before mirroring the value to
the server, it recursively scans the JSON for any `data:image/...` string,
uploads each one to `/api/upload/image` → Cloudinary, and substitutes the
returned URL — both in the copy written to `localStorage` and in the copy
sent to the server. The app never knows the difference; `s.photo` is just
a string, whether it's a data URI or an `https://res.cloudinary.com/...`
URL.

If Cloudinary isn't configured, uploads simply fail gracefully and the
original base64 value is kept — the app keeps working, you just don't get
the storage benefit until you add credentials.

## Project layout

```
api/
  auth/login.js       POST   — verify credentials, issue JWT
  kv/index.js          GET    — return all key/value pairs (app boot)
  kv/[key].js           PUT/DELETE — upsert / remove one key
  upload/image.js      POST   — upload a data:image/... URI to Cloudinary
lib/
  db.js                Turso client + schema
  auth.js              JWT sign/verify helpers
  cloudinary.js        signed upload helper (plain fetch, no SDK)
public/
  index.html           loader shim (auth check, kv sync, image offload) + original app markup
  app.js               ORIGINAL app logic, unmodified
  login.html           login page
scripts/
  seed.js              creates the admin user
  migrate.js           imports legacy localStorage JSON, offloading photos to Cloudinary as it goes
```

## Setup

```bash
npm install
cp .env.example .env
```

1. **Turso**: `turso db create swami-abhyasika`, then fill in
   `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in `.env`. (Or leave both
   blank for local dev — falls back to a local file DB automatically.)
2. **Cloudinary**: create a free account, copy Cloud Name / API Key / API
   Secret from the dashboard into `.env`.
3. **Auth**: set `JWT_SECRET` to a long random string, and
   `ADMIN_USERNAME` / `ADMIN_PASSWORD` for the login you want to seed.
4. Seed the admin user:
   ```bash
   npm run seed
   ```
5. Run locally:
   ```bash
   npm run dev
   ```
   (`vercel dev` — emulates the real serverless routing locally.)

## Migrating existing data

From the old localStorage-only HTML file, or from the v20 SQLite build:

```bash
# Old HTML file: open it in the browser, DevTools console:
copy(JSON.stringify(localStorage))
# paste result into data/legacy_localstorage.json

# From the v20 SQLite build instead, export its kv table to the same
# {key: value, ...} JSON shape.

npm run migrate
```

With Cloudinary configured, any photos found in the migrated data are
uploaded and swapped for their hosted URL as part of the migration —
so you start clean, with no base64 blobs in Turso.

## Deploy

```bash
vercel link      # first time only
vercel env pull  # or add the .env values in the Vercel dashboard → Settings → Environment Variables
npm run deploy    # vercel --prod
```

That's it — no disk to provision, no server to keep running. Vercel
serves `public/` as static files and runs `api/**` as functions on demand;
Turso and Cloudinary handle the two things that need to persist across
requests (data and images).

## Known limits

- Vercel Serverless Functions cap request bodies at **4.5 MB**. A very
  large/high-resolution photo could exceed that on upload. `app.js` isn't
  touched so there's no client-side resize step — if this becomes an
  issue in practice, downscaling the image in the loader shim before
  upload is a small, isolated addition (still without touching `app.js`).
- The image-offload walk in the loader parses/re-stringifies the full
  value on every `setItem`. For this app's data sizes that's fine; it's
  not built for enormous JSON blobs (tens of MB).
