# Apoyo turnover — Dockerized stack on a Windows PC

This repo (ApoyoAdmin) is the backend + admin UI. Pair it with:

- `ApoyoWeb` — public website (sibling folder)
- `ApoyoMobile` — citizen app + face-verification Docker stack (sibling folder)

Paid third parties only: **Cloudflare** (tunnel + DNS), **Resend** (auth email), **Hostinger** (domain registrar). Everything else runs in Docker on the office PC.

Public hostnames (Cloudflare Tunnel → this machine):

| Host | Origin |
|------|--------|
| https://www.apoyo-dasma.online | nginx `:4173` (Web SPA) |
| https://admin.apoyo-dasma.online | nginx `:4174` (Admin SPA) |
| https://api.apoyo-dasma.online | Local Kong `:54321` |

The face verifier (`127.0.0.1:8090`) and CompreFace UI (`127.0.0.1:8000`) stay **off the tunnel**.

Sleeping the PC takes the public site down. Set Windows power to never sleep while serving.

## Daily start (this PC)

1. Docker Desktop running (enable *Start Docker Desktop when you sign in*).
2. Elevated PowerShell **once** (Run as administrator) so the stack survives reboot:
   - `deploy\scripts\Install-CloudflaredService.ps1`
   - `deploy\scripts\Install-StartupTask.ps1`
   Until the service is installed, `Start-Apoyo.ps1` launches `Start-Cloudflared.ps1` (a hidden process that dies on logoff).
3. If the scheduled task is not installed:

```powershell
cd C:\Users\gabca\Desktop\ApoyoAdmin
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\scripts\Start-Apoyo.ps1
```

That script:

1. Waits for Docker
2. `npx supabase start` (same volumes as today — Postgres, Auth, Storage, Kong, edge functions)
3. Face stack compose (`ApoyoMobile\deploy\face-verification`)
4. Builds/serves Web + Admin with nginx on `127.0.0.1:4173` and `127.0.0.1:4174`
5. Runs `Health-Apoyo.ps1`

Do **not** use `vite preview` or `npx supabase functions serve` as the production door. `supabase start` already runs edge functions when `[edge_runtime] enabled = true`.

Stop frontends only: `.\deploy\scripts\Stop-Apoyo.ps1`  
Stop everything except the tunnel: `.\deploy\scripts\Stop-Apoyo.ps1 -All`

## Layout on disk

```
Desktop\
  ApoyoAdmin\          backend, admin SPA, deploy scripts
  ApoyoWeb\            public SPA
  ApoyoMobile\         Expo app + deploy\face-verification
```

Override paths with `APOYO_WEB_ROOT` / `APOYO_FACE_ROOT` if the folders are not siblings.

## Secrets

Clients use **only** the public anon / publishable key (`VITE_*` / `EXPO_PUBLIC_*`). Service role, Resend, and `FACE_VERIFY_SERVICE_KEY` stay in `ApoyoAdmin/supabase/.env` (gitignored) or Docker env — never in Vite/Expo public files.

Copy once per machine:

- `ApoyoAdmin/.env.example` → `.env.local`
- `ApoyoAdmin/supabase/.env.example` → `supabase/.env`
- `ApoyoAdmin/deploy/.env.example` → `deploy/.env` (Start-Apoyo copies this from `.env.local` if missing)
- `ApoyoWeb/.env.example` → `.env.local`
- `ApoyoMobile/.env.example` → `.env`
- `ApoyoMobile/deploy/face-verification/env.example` → `.env`

`FACE_VERIFY_SERVICE_URL` for edge functions must be `http://face-verifier:8080` (Docker network alias). Do not point it at a public hostname.

The local demo anon JWT is a well-known Supabase local key. Treat this homelab as **not a hardened multi-tenant SaaS** until you rotate the JWT secret and issue new anon + service_role keys, then rebuild all three apps.

**Do not rewrite git history** to “purge” keys. Rotate instead.

## Cutover to the client PC

Do this in order. Only one tunnel endpoint may be live.

1. On this PC: `.\deploy\scripts\Backup-Apoyo.ps1 -IncludeSecrets`
2. Copy to the other PC (USB or encrypted drive, not git):
   - The three project folders (or at least this `deploy\` kit + both repos)
   - `%USERPROFILE%\ApoyoBackups\<stamp>\`
   - `%USERPROFILE%\.cloudflared\` (tunnel credentials)
3. Other PC: install Docker Desktop (WSL2 backend), Node.js LTS (for `npx supabase`), cloudflared.
4. Place folders as siblings. Copy `secrets\` files back:
   - `supabase.env` → `ApoyoAdmin\supabase\.env`
   - `admin.env.local` → `ApoyoAdmin\.env.local`
   - `web.env.local` → `ApoyoWeb\.env.local`
   - `deploy.env` → `ApoyoAdmin\deploy\.env`
   - `face.env` → `ApoyoMobile\deploy\face-verification\.env`
   - `cloudflared\` → `%USERPROFILE%\.cloudflared\`
5. `Start-Apoyo.ps1` once so volumes exist, then `Restore-Apoyo.ps1 -FromDir <backup> -RestoreDatabase` (and `-RestoreVolumes` if you are moving storage/face data as tarballs).
6. `Health-Apoyo.ps1`
7. **Stop the tunnel on this PC** (`Stop-Apoyo.ps1 -StopTunnel` or `Stop-Service cloudflared`), then on the other PC run `Install-CloudflaredService.ps1`.
8. Transfer the three vendor accounts (Cloudflare, Resend, Hostinger) to the client’s ownership.
9. Power off this PC only after public hostnames answer from the new machine.

Mobile APK / Play / sideload is separate from this Docker stack.

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
18. Security headers on nginx + Vite preview + `public/_headers` (HSTS, nosniff, frame deny, CSP).
19. HTTPS: Cloudflare. Local `http://127.0.0.1` stays for Docker.
20. `npm run audit` on Admin/Web. Review `xlsx` advisories before swapping the reports exporter.
21. Frontends and face ports bind to `127.0.0.1` only. Kong stays on the host for the tunnel.

## Intentionally not changed

- JWT rotation on the running local API (would log everyone out and break all three apps until rebuild).
- `verify_jwt` on `web`, `facial-verification`, and `id-document-verification` (public site + pre-auth registration).
- CORS `*` on edge functions (native mobile sends no Origin).
- Session-lock fail-open on admin (fail-closed locks staff out if RPC is down).
- Placeholder SQL migrations (needed for this repo’s migration history).
- Official cloud-hosted Supabase (would be a fourth vendor and a full data migration).
