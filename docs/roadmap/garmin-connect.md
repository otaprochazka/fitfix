> **Status:** open — design sketch with rollout phases  
> **Audience:** future contributors evaluating cloud connectivity for FitFix  
> **TL;DR:** let users link a Garmin Connect account, pull activities into the editor and upload the fixed FIT back. Start with a reverse-engineered client (`garth`) behind a thin backend; apply for the official Garmin Activity API in parallel.

# Garmin Connect Integration — Backlog

Goal: let users link a Garmin Connect account, pull activities directly
into the FitFix editor and push the fixed FIT back — without the manual
USB / Garmin Express dance.

## Why

- Main friction point today: the user has to find the FIT in
  `/GARMIN/Activity/`, drag it into the app, export it, and re-upload via
  the Garmin Connect web. Painful round-trip.
- Comparable tools (GoldenCheetah etc.) ship unofficial Garmin sync — the
  bar already exists.
- If FitFix is to grow beyond a drag-and-drop utility, connectivity to
  the data source is the next logical step.

## Two Paths

### A) Official — Garmin Connect Developer Program
- **Activity API** (pull activities + Activity File Upload to push back)
  + **Health API** (metrics, optional).
- OAuth 1.0a, stable, doesn't break when Garmin redesigns the web app.
- ❌ Requires partnership approval from Garmin — weeks to months;
  gate-keeping often turns hobby projects away.
- ✅ Long-term sustainable, ToS-compatible.

### B) Unofficial — reverse-engineered client
- Libraries: [`garth`](https://github.com/matin/garth) (Python, currently
  the most robust — handles MFA, token refresh, Cloudflare),
  `python-garminconnect`, `garmin-connect` (npm).
- ✅ Available immediately, no approval, zero cost.
- ❌ Fragile — Garmin can break it any time; technically against ToS;
  MFA + Cloudflare occasionally cause friction.
- GoldenCheetah and similar tools work this way.

**Recommended strategy:** start with (B) as a POC for yourself + beta
users, file an application for (A) in parallel, and migrate if traction
justifies it.

## Architecture

The PWA runs in the browser → CORS + the Garmin login flow won't let it
reach Garmin directly. We need a thin backend as a proxy.

```
┌─────────────┐   HTTPS   ┌──────────────────┐   garth/OAuth   ┌──────────────┐
│ FitFix PWA  │ ◄───────► │ FitFix backend   │ ◄────────────► │ Garmin       │
│ (browser)   │           │ (FastAPI/Node)   │                │ Connect      │
└─────────────┘           └────────┬─────────┘                └──────────────┘
                                   │
                                   ▼
                         ┌──────────────────┐
                         │ Token store      │
                         │ (Upstash Redis / │
                         │  Vercel KV)      │
                         └──────────────────┘
```

## Hosting Options

### Vercel (FastAPI serverless)
- ✅ Same environment as the frontend, simple deploy, generous free tier.
- ❌ **10 s timeout** on Hobby plan — Garmin login (SSO + Cloudflare
  challenge) realistically takes 3–8 s; with MFA it can blow past the
  limit.
- ❌ Stateless → tokens **must** live in an external store (Vercel KV /
  Upstash Redis).
- ❌ Cold start ~1–2 s (Python).
- ✅ Pro plan ($20/mo) raises the timeout to 60 s and the problem goes
  away.

### Fly.io / Railway / Render
- ✅ Persistent process, no timeout, in-memory session viable.
- ✅ ~$5/mo for a small VM is enough.
- ✅ Better fit for the Garmin login flow with MFA.
- Recommended combo: **frontend on Vercel + backend on Fly.io**.

### Cloudflare Workers (Python beta)
- ❌ `garth` won't run there (no socket / requests APIs).
- Out.

## API Sketch (backend)

```
POST /auth/garmin/login        { username, password } → 200 / 202 (MFA needed)
POST /auth/garmin/mfa          { code } → 200 (token stored server-side)
GET  /auth/status              → { connected: bool, email?: string }
POST /auth/logout              → 204

GET  /activities?limit=20      → [{ id, name, startTime, distance, type }, ...]
GET  /activities/:id/fit       → stream FIT (Content-Type: application/octet-stream)
POST /activities/upload        multipart FIT → { newActivityId }
```

Frontend session: HttpOnly cookie with an opaque session ID, server-side
mapping to encrypted Garmin tokens.

## Open Questions / Risks

1. **Duplicate detection on upload.** Garmin rejects FITs with the same
   start time + device as duplicates. There's no overwrite — every
   upload becomes a new activity. Mitigation: bump start time by 1 s, or
   tell the user explicitly ("the original stays in Garmin; we'll upload
   a fixed copy you can delete the old one afterwards").
2. **MFA UX.** Garth supports TOTP and email codes, but it's an extra
   step. The frontend has to handle a two-step login flow.
3. **Token storage security.** Garmin refresh tokens = full account
   access. Encryption at rest, short TTL session cookie, consider
   AES-GCM with the key in env.
4. **ToS / risk of breakage.** On the unofficial path, plan monitoring (a
   canary login every few hours) and a user-facing comms channel for
   when it breaks.
5. **Privacy / GDPR.** Once we store anything per-user (even just
   tokens), we need a baseline privacy policy, account deletion, and a
   region for storage. Potentially a problem for EU users.
6. **Cost at scale.** Backend + token storage + bandwidth. Free tier
   handles up to ~hundreds of MAU; beyond that ~$5–20/mo.

## Phased Rollout

**Phase 0 — POC (1–2 days):**
Local FastAPI + garth, single hardcoded user, list activities, download
FIT, open in the editor. No frontend UI, just verify the path works.

**Phase 1 — Beta (1–2 weeks):**
Backend on Fly.io, Upstash Redis for tokens, "Connect Garmin" button in
the PWA, login flow with MFA, list of the last 20 activities, download →
editor → upload back. Behind a feature flag.

**Phase 2 — General availability:**
Privacy policy, account deletion, error monitoring, support for activity
selection by date/type filter, metadata preservation on upload.

**Phase 3 — Official API:**
If the POC gets traction, file for the Garmin Activity API and migrate
from garth to OAuth 1.0a.

## Effort Estimate

- POC (Phase 0): **~1 day**
- Beta (Phase 1): **~1–2 weeks** (backend + frontend integration + MFA +
  token storage)
- GA (Phase 2): **+1 week** (compliance, monitoring)
- Official API migration: **+a few days of code**, but **weeks–months**
  waiting on Garmin approval
