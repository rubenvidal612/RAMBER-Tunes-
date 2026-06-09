# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**RAMBER Tunes** (also branded as "LucIAna") is an AI-powered music generation platform that enables users to:
- Generate original songs using Suno AI API
- Create music covers with cloned voices (via Replicate RVC models)
- Manage a library of created songs and covers
- Clone custom voices for voice conversion
- Generate karaoke tracks
- Share and monetize music through an affiliate system
- Purchase credits via MercadoPago for premium features

The app is a **React + Vite frontend** with a **Node.js/Express backend**, using **Supabase** for auth and database, **Cloudflare R2** for audio storage, and integrating multiple AI/music APIs (Suno, Replicate, Google Gemini, OpenAI).

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 6, Tailwind CSS 4, Lucide Icons
- **Backend**: Node.js, Express, Vercel (serverless functions via `api/[...route].ts`)
- **Database & Auth**: Supabase (PostgreSQL with RLS)
- **Storage**: Cloudflare R2 (S3-compatible audio file storage)
- **AI Services**:
  - Suno API (song generation)
  - Replicate (RVC voice cloning)
  - Google Gemini (lyrics generation fallback, AI Studio integration)
  - OpenAI (alternative voice/text processing)
- **Payments**: MercadoPago
- **Build Tool**: Vite
- **Language**: TypeScript 5.8

---

## Directory Structure

```
RAMBER-Tunes-/
├── src/                          # Frontend React app
│   ├── App.tsx                   # Main app component (tab routing)
│   ├── main.tsx                  # Entry point
│   ├── types.ts                  # TS interfaces (ViewTab, SongItem, VoiceItem, etc.)
│   ├── views/                    # Full-screen views (Create, Library, Profile, etc.)
│   │   ├── CreateView.tsx        # Song generation interface
│   │   ├── LibraryView.tsx       # User's song library
│   │   ├── CloneVoiceView.tsx    # Voice cloning interface
│   │   ├── KaraokeView.tsx       # Karaoke mode
│   │   ├── ProfileView.tsx       # User profile
│   │   ├── SettingsView.tsx      # App settings
│   │   ├── AffiliatesView.tsx    # Affiliate program
│   │   └── PricingView.tsx       # Pricing plans
│   ├── components/               # Reusable UI components
│   │   ├── TopBar.tsx            # Header with user info
│   │   ├── BottomNav.tsx         # Tab navigation (bottom sheet)
│   │   ├── VoiceSelector.tsx     # Voice picker UI
│   │   ├── VoiceEditor.tsx       # Voice model training UI
│   │   └── MiniPlayer.tsx        # Audio player
│   ├── hooks/                    # React custom hooks
│   │   └── useUserCredits.ts     # Credit balance hook (polls /api/account/balance)
│   └── lib/                      # Utilities & services
│       ├── supabaseBrowser.ts    # Supabase client (auth, OAuth with Google)
│       ├── supabase/             # (Stub server/admin clients)
│       ├── credits.ts            # Credit system logic (costs, consumption, adjustments)
│       ├── preTrainedVoices.ts   # Pre-trained voice library
│       ├── r2.ts                 # R2 upload/download helpers
│       ├── sunoapi.ts            # Suno API helpers
│       └── utils.ts              # Generic utilities
├── api/                          # Vercel serverless backend
│   ├── [...route].ts             # Main API handler (11,515 lines - all routes)
│   ├── account/                  # (Empty - routes in [...route].ts)
│   ├── suno/                     # (Empty - routes in [...route].ts)
│   ├── webhooks/                 # (Empty - routes in [...route].ts)
│   ├── telegram/                 # (Empty - routes in [...route].ts)
│   └── mercadopago/              # (Empty - routes in [...route].ts)
├── server.js                     # Express dev server (backup/legacy)
├── supabase/
│   └── migrations/               # DB schema migrations
├── public/                       # Static assets (icons, manifest)
├── vite.config.ts                # Vite build config
├── tsconfig.json                 # TypeScript config (ESM)
├── vercel.json                   # Vercel deployment config
├── package.json                  # Dependencies & scripts
└── .env.example                  # Environment template
```

---

## Build, Run, Test, Lint Commands

```bash
# Install dependencies
npm install

# Development
npm run dev                    # Start Vite dev server (port 3000)

# Backend (legacy)
npm run server                # Start Express server (port 3001)

# Production
npm run build                 # Build frontend (outputs to dist/)
npm run preview              # Preview production build locally

# Linting
npm run lint                 # Type-check with TypeScript (tsc --noEmit)

# Cleanup
npm run clean                # Remove dist/ folder
```

**Notes:**
- Frontend proxies `/api` requests via `vite.config.ts` (to localhost:3001 in dev)
- In production (Vercel), backend is serverless `api/[...route].ts` handler
- No unit tests; TypeScript runs in type-checking-only mode

---

## Key Architectural Patterns

### 1. Unified API Route Handler (`api/[...route].ts`)

All backend routes in a single 11,515-line file using path parsing:

```typescript
const head = isApi ? parts[1] : parts[0];  // e.g., 'suno', 'account'
const next = isApi ? parts[2] : parts[1];  // e.g., 'generate', 'balance'

if (head === 'suno') return sunoHandler(req, res);
if (head === 'account' && next === 'balance') return balanceHandler(req, res);
```

**Main Endpoints:**
- `/api/account/balance` - GET user credit balance
- `/api/account/upload-profile-image` - Upload profile avatar
- `/api/suno/generate` - POST generate song
- `/api/suno/status` - GET song generation status
- `/api/karaoke/generate` - Generate karaoke track
- `/api/library/*` - Save/delete/list library items
- `/api/profile/*` - Fetch/update user profile
- `/api/rvc/cover-status` - Voice cover training status (Replicate)
- `/api/ai/transcribe-lyrics` - Transcribe audio to lyrics
- `/api/share/song` - Public song sharing
- `/api/mercadopago/*` - Payment webhooks
- `/api/affiliates/*` - Referral tracking

### 2. Credit System

Credits drive all operations. Defined in `src/lib/credits.ts`:

```typescript
const CREDIT_COSTS = {
  generate_music: 12,
  clone_voice: 15,
  separate_vocal: 10,
  split_stem: 50,
  // ...
};
```

**Flow:**
1. User logs in → `useUserCredits()` hook calls `/api/account/balance`
2. Frontend checks if `credits >= cost` before action
3. Backend consumes via `consumeUserCredits(admin, userId, cost)` in `[...route].ts`
4. Credits stored in `profiles` table (flexible column: `ramber_credits`, `zingy_credits`, `credits`, or `song_balance`)

**Key Functions:**
- `adjustUserCredits()` - Add/remove credits
- `consumeUserCredits()` - Deduct and validate balance
- `creditsFromProfile()` - Extract from any column variant
- Admins bypass credit validation (via `is_admin` JWT claim)

### 3. Authentication & Authorization

- **Frontend**: Google OAuth via Supabase (`signInWithGoogle()` in `supabaseBrowser.ts`)
- **Backend**: Validates JWT token from Supabase
- **Email**: Must be Gmail (@gmail.com or @googlemail.com)
- **Admin**: User with `is_admin = true` in JWT claims

**Flow:**
```
Google OAuth → Supabase → JWT token → API calls with Bearer token
```

### 4. Song Generation Pipeline

**CreateView.tsx flow:**
1. User enters lyrics, style, genre, selects voice
2. Optional: Generate lyrics via Gemini
3. Optional: Clone voice first
4. Submit → `/api/suno/generate` with lyrics, style, genre, voice_id, mv, wait
5. Backend:
   - Validates credits, consumes cost
   - Calls Suno API to queue generation
   - Stores task in `library_items` with `suno_task_id`
   - Returns `task_id`
6. Frontend polls `/api/suno/status?task_id=...` until `status = 'completed'`
7. Auto-imports to user's library

### 5. Voice Cloning (RVC via Replicate)

**CloneVoiceView.tsx flow:**
1. User uploads voice sample (MP3/WAV)
2. Send to `/api/suno/clone-voice` with audio
3. Backend:
   - Uploads sample to R2
   - Starts Replicate RVC training
   - Stores in `rvc_covers` table with `status='processing'`
4. Frontend polls `/api/rvc/cover-status?prediction_id=...`
5. When ready, voice available in CreateView

**Key Points:**
- Training is async (can take hours)
- Webhook callback updates status
- Pre-trained voices hardcoded in `preTrainedVoices.ts`

### 6. Library & Data Persistence

**Main Table**: `library_items` (songs, covers, vibes, playlists)
- Columns: `id`, `user_id`, `type` (song|cover|vibe|list), `title`, `audio_url`, `suno_task_id`, `suno_audio_id`, `is_cover`, `deleted_at`

**Voice Table**: `rvc_covers` (training status and output)

**LibraryView.tsx:**
- Fetches from Supabase RLS-protected table
- Filters by type, search, sorting
- Soft deletes via `deleted_at` timestamp

### 7. Storage (Cloudflare R2)

Functions in `src/lib/r2.ts`:
- `uploadToR2(key, buffer, contentType)` - Upload file
- `getSignedR2Url(key, expiresIn)` - Temporary download link
- `deleteFromR2(paths)` - Batch delete

**Key Behavior:**
- Files under `covers/{userId}/{timestamp}_{id}.mp3`
- Signed URLs expire after 1 hour
- Backend handles upload; frontend sends multipart data

### 8. App State & Routing

**App.tsx:**
- useState for `currentTab` (type: `ViewTab`)
- `ViewTab = 'inicio' | 'mv' | 'studio' | 'karaoke' | 'voces' | 'biblioteca' | 'perfil' | 'afiliados'`
- BottomNav switches views
- TopBar shows email + credits
- Sidebar mobile-responsive

**No Redux/Zustand** — local useState only.

### 9. Environment Variables

**Critical vars in `.env`:**
```
SUPABASE_URL                  # Supabase project URL
SUPABASE_ANON_KEY             # Client key
SUPABASE_SERVICE_ROLE_KEY     # Backend admin key
SUNO_API_KEY                  # Suno endpoint
SUNO_API_BASE_URL
GEMINI_API_KEY                # Google (lyrics fallback)
REPLICATE_API_TOKEN           # Replicate (RVC)
R2_ACCOUNT_ID                 # Cloudflare R2
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_ENDPOINT
OPENAI_API_KEY                # OpenAI fallback
```

**Frontend-exposed** (in `vite.config.ts`):
- `GEMINI_API_KEY`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`

---

## Important Implementation Details

### Credit Calculation & Rounding
- `round2(n)` = `Math.round(n * 100) / 100`
- Profile can have any of 4 credit columns; logic checks in order: `ramber_credits` → `zingy_credits` → `credits` → `song_balance`
- `song_balance` multiplied by 12 (CREDIT_COSTS.generate_music) to get total

### Error Handling
- `toUserFriendlySunoError()` — converts Suno errors to user-friendly Spanish messages
- Gemini fallback for lyrics if Suno fails
- Common issues: insufficient credits, rate limits, invalid format

### Vercel Deployment (`vercel.json`)
- Max function duration: 300 seconds
- Static cache: assets/* (31536000s), index.html/sw.js (no-store)
- Routes: `/api/*` → `[...route]`, SPA fallback to `/index.html`

### Mobile Handling
- `main.tsx` detects Android, adds `android` class to root
- Responsive design with Tailwind breakpoints
- Bottom nav on mobile, top bar always visible
- Service worker registered in prod (`/sw.js`)

### Supabase RLS
- Users see only their own `library_items` and `profiles`
- Admin role (service role key) bypasses RLS
- Gmail validation in auth policies

### Telegram Integration (Recent)
- Tables: `telegram_links`, `telegram_tokens`
- Routes: `/api/telegram/*`
- Migrations: `20260601_create_telegram_*.sql`

---

## Common Development Tasks

### Adding a New Song Feature
1. UI: Add to `CreateView.tsx` (input + submit logic)
2. API: Add handler in `api/[...route].ts` + router dispatch
3. Credits: Define cost in `CREDIT_COSTS` if applicable
4. Refresh: Call `/api/account/balance` after operation

### Adding a New View
1. Create `src/views/NewView.tsx`
2. Add tab to `ViewTab` union in `types.ts`
3. Import & switch case in `App.tsx`
4. Add button in `BottomNav.tsx`

### Storing User Data
1. Add column to `profiles` or `library_items` in Supabase
2. Create migration in `supabase/migrations/`
3. Update RLS policies if needed
4. Use `supabaseBrowser.from('table').insert()` (frontend) or `auth.admin` (backend)

### Uploading Files
1. Use `uploadToR2()` from `src/lib/r2.ts` (frontend) or `[...route].ts` (backend)
2. Store URL in database
3. Generate links with `getSignedR2Url()`

### Debugging API Calls
- Browser DevTools Network tab for `/api/*` requests
- Backend logs: Vercel console/console.log in `[...route].ts`
- Supabase errors: response JSON `error` or `message` fields
- Credit errors: check `profiles` table for correct column

---

## Quirks & Non-Obvious Behavior

1. **Voice Cloning is Async**: Upload → Replicate trains → poll background. Not instant.
2. **Pre-trained Voices Hardcoded**: In TypeScript, not API. Update `preTrainedVoices.ts` to add.
3. **Credits Column Variance**: Different users have credits in different columns. Logic handles all.
4. **Suno Polling Cached**: Backend caches status 45 seconds to avoid rate limits.
5. **R2 Signed URLs Expire**: 1 hour default. Long-lived links must regenerate.
6. **No Logout Route**: Handled client-side via Supabase auth panel.
7. **MercadoPago Webhooks**: Payment notifications update credits via `/api/mercadopago/*`.
8. **Admin Override**: `is_admin` JWT claim bypasses credit checks.
9. **Lyrics Fallback**: If Suno lyrics fail, Gemini API called as fallback.
10. **Affiliate Tracking**: Referral links create `profiles.referrer_id` links; commissions server-side.

---

## Deployment Notes

- **Platform**: Vercel (serverless)
- **Frontend**: Built to `dist/`, deployed as static files
- **Backend**: `api/[...route].ts` as serverless function
- **Database**: Supabase (PostgreSQL cloud)
- **Storage**: Cloudflare R2
- **Environment**: `.env` or Vercel project settings
- **Build**: `npm run build`

---

## Key File References

- **Main Backend**: `api/[...route].ts` (11,515 lines — search by endpoint name)
- **Credit Logic**: `src/lib/credits.ts` + `src/hooks/useUserCredits.ts`
- **Voice Library**: `src/lib/preTrainedVoices.ts`
- **Auth**: `src/lib/supabaseBrowser.ts`
- **R2 Storage**: `src/lib/r2.ts`
- **Types**: `src/types.ts`
- **Main App**: `src/App.tsx` (routing), `src/views/CreateView.tsx` (generation), `src/views/LibraryView.tsx` (library)
- **Package Versions**: React 19, Vite 6, Tailwind 4, TypeScript 5.8
