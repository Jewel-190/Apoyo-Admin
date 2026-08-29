# Apoyo turnover — local stack on this PC

This repo (ApoyoAdmin) is the backend + admin UI. Pair it with:

- `C:\Users\gabca\Desktop\ApoyoWeb` — public website
- `C:\Users\gabca\Desktop\ApoyoMobile` — citizen app + face-verification Docker stack

Public hostnames (Cloudflare Tunnel → this machine):

| Host | Origin |
|------|--------|
| https://www.apoyo-dasma.online | Vite preview `:4173` (Web) |
| https://admin.apoyo-dasma.online | Vite preview `:4174` (Admin) |
| https://api.apoyo-dasma.online | Local Kong `:54321` |

Keep Docker Desktop, `npx supabase start`, `npx supabase functions serve --env-file supabase/.env`, both Vite previews, face stack (`:8090`), and `cloudflared tunnel --config %USERPROFILE%\.cloudflared\config.yml run apoyo-dasma` running. Sleeping the PC takes the public site down.

## Secrets

Clients use **only** the public anon / publishable key (`VITE_*` / `EXPO_PUBLIC_*`). Service role, Resend, and `FACE_VERIFY_SERVICE_KEY` stay in `ApoyoAdmin/supabase/.env` (gitignored) or Docker env — never in Vite/Expo public files.

The local demo anon JWT is a well-known Supabase local key. Treat this homelab as **not a hardened multi-tenant SaaS** until you rotate the JWT secret and issue new anon + service_role keys, then rebuild all three apps.

**Do not rewrite git history** to “purge” keys. Rotate instead. The Resend key was removed from the mobile `.env` (it does not belong on the client). Rotate that Resend key in the Resend dashboard if it was a live key.

Copy:

- `ApoyoAdmin/.env.example` → `.env.local`
- `ApoyoAdmin/supabase/.env.example` → `supabase/.env`
- `ApoyoWeb/.env.example` → `.env.local`
- `ApoyoMobile/.env.example` → `.env`

## What was hardened (without breaking current flows)

1. API keys hidden from git via gitignore + examples; public anon key only in clients.
2. Git history not rewritten (would break remotes / this machine).
3. Public DB key: clients already use anon; service_role stays on the server.
4. Passwords: GoTrue hashes them. Length stays **6** so the mobile 6-digit MPIN still works. Admin credential create/reset still requires 8+.
5. Server-side auth: edge functions already check JWT / admin / registration token. Request-code generator now requires a **logged-in user** unless `REQUEST_CODE_HOOK_SECRET` is set.
6. Session cookies: SPAs still use supabase-js (localStorage). HttpOnly cookie BFF would break this stack. Mobile sessions use **SecureStore** (chunked) with AsyncStorage fallback.
7. Login rate limits: GoTrue `sign_in_sign_ups = 15` / 5 min / IP; admin and mobile UI lock 5 minutes after 5 failures.
8. Bot protection: Cloudflare Tunnel already sits in front. Turnstile/hCaptcha not enabled (needs provider keys and would block login if misconfigured).
9. RLS: already on for public tables. Applicant `request-documents` bucket is private; admins/users read via **signed URLs**.
10. Record access: existing admin/user policies; private bucket stops anonymous URL guessing.
11. Field tampering: mutations go through authorized edge functions / RPCs, not raw client table grants for writes.
12. Queries: PostgREST / parameterized RPCs (no string-concat SQL in app code).
13. Input: CMS HTML sanitized; CMS `href` allowlisted; upload type/size enforced on the phone.
14. User HTML escaped/sanitized before `dangerouslySetInnerHTML`.
15. File uploads: 5 MB + image/PDF allowlist on mobile; signed URLs for applicant docs.
16. Encryption: Postgres/disk; no extra app-level crypto that would break search/filters.
17. API responses: existing function payloads kept (trimming more would break admin UI).
18. Security headers on Vite preview + `public/_headers` (HSTS, nosniff, frame deny, CSP).
19. HTTPS: Cloudflare. Local `http://127.0.0.1` stays for Docker/Vite.
20. `npm run audit` on Admin/Web. Review `xlsx` advisories before swapping the reports exporter.

## Intentionally not changed

- JWT rotation on the running local API (would log everyone out and break all three apps until rebuild).
- `verify_jwt` on `web`, `facial-verification`, and `id-document-verification` (public site + pre-auth registration).
- CORS `*` on edge functions (native mobile sends no Origin).
- Session-lock fail-open on admin (fail-closed locks staff out if RPC is down).
- Placeholder SQL migrations (needed for this repo’s migration history).

## Start order

1. Docker Desktop
2. `cd ApoyoAdmin` → `npx supabase start`
3. `npx supabase functions serve --env-file supabase/.env`
4. `cd ApoyoWeb` → `npx vite preview --host 127.0.0.1 --port 4173`
5. `cd ApoyoAdmin` → `npx vite preview --host 127.0.0.1 --port 4174`
6. Face stack: `cd ApoyoMobile/deploy/face-verification` → `docker compose up -d`
7. Cloudflare named tunnel (command above)
