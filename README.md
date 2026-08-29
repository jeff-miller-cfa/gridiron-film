# Gridiron Film

A mobile-friendly web app for processing and viewing football game footage.

## Features

- **Games** with stadium, teams, and date/time metadata
- **Multi-clip uploads** ordered by video capture metadata (MP4 creation time)
- **Play editor** — split clips at the playhead, remove segments, tag offense team and notes
- **Viewer** — continuous playback across plays with a jump list (no login required)
- **Admin panel** — upload and process footage (simple hardcoded credentials)
- **Export** — stitch plays into one video with play numbers in a footer overlay

## Stack

- Next.js 16 (App Router)
- Vercel Blob (video storage)
- Neon Postgres (metadata via Drizzle ORM)
- ffmpeg.wasm (client-side export)

## Local development

1. Copy env template:

```bash
cp .env.example .env.local
```

2. Set environment variables:

- `DATABASE_URL` — Neon Postgres connection string
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob token
- `AUTH_SECRET` — any random string for admin session signing

3. Push database schema:

```bash
npm run db:push
```

4. Start dev server:

```bash
npm run dev
```

## Admin credentials

Default (hardcoded in `src/config/auth.ts`):

- Username: `admin`
- Password: `gridiron2026`

## Deployment

Deploy to Vercel and add:

1. Neon Postgres integration (`vercel integration add neon`)
2. Vercel Blob store (from Vercel dashboard → Storage → Blob)
3. `AUTH_SECRET` environment variable
