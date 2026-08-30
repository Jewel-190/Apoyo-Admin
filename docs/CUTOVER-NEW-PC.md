# Cutover: move Apoyo to a new Windows PC

Do this in order. **Only one PC may run the Cloudflare tunnel at a time.** The local stack can be up on the new PC first; do not start cloudflared there until the old PC’s tunnel is stopped.

A snapshot already exists at `C:\Users\gabca\ApoyoBackups\20260830-140418`. Take a **new** backup on cutover day so you copy the latest requests, files, and users.

Paid third parties stay **Cloudflare**, **Resend**, and **Hostinger**. The face verifier (`:8090`) and CompreFace UI (`:8000`) stay off the tunnel.

---

## Day of cutover — this PC (old)

### 1. Fresh backup (includes keys)

```powershell
cd C:\Users\gabca\Desktop\ApoyoAdmin
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\scripts\Backup-Apoyo.ps1 -IncludeSecrets
```

Note the folder it prints, e.g. `C:\Users\gabca\ApoyoBackups\20260830-HHMMSS`.

### 2. Copy to USB / encrypted drive (not git, not email)

| Copy this | Why |
|-----------|-----|
| `Desktop\ApoyoAdmin` | Backend, admin UI, deploy scripts |
| `Desktop\ApoyoWeb` | Public site |
| `Desktop\ApoyoMobile` | Face stack (and the Expo app if they will build APKs) |
| The new `ApoyoBackups\<stamp>\` folder | Database, storage, face data, secrets |
| Optional extra: `%USERPROFILE%\.cloudflared\` | Already inside `secrets\cloudflared` if you used `-IncludeSecrets` |

### 3. Leave this PC running

Leave it on until the new PC is healthy **locally**. Do not power it off yet. Keep the old tunnel up so the public site stays live during setup.

---

## New PC — software (once)

Install, then sign in to Windows so Docker can start:

1. **Docker Desktop** (WSL2 backend). Settings → General → start Docker Desktop when you sign in.
2. **Node.js LTS** (needed for `npx supabase`).
3. **cloudflared** for Windows: [Cloudflare downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
4. Windows power: **never sleep** while this PC is the server.

---

## New PC — place the files

### 4. Same folder layout

Scripts assume the three repos are siblings:

```
C:\Users\<THEIR-USER>\Desktop\
  ApoyoAdmin\
  ApoyoWeb\
  ApoyoMobile\
```

Copy the backup to e.g. `C:\Users\<THEIR-USER>\ApoyoBackups\<stamp>\`.

### 5. Put secrets back

From `ApoyoBackups\<stamp>\secrets\`:

| From backup | To |
|-------------|----|
| `supabase.env` | `ApoyoAdmin\supabase\.env` |
| `admin.env.local` | `ApoyoAdmin\.env.local` |
| `web.env.local` | `ApoyoWeb\.env.local` |
| `deploy.env` | `ApoyoAdmin\deploy\.env` |
| `face.env` | `ApoyoMobile\deploy\face-verification\.env` |
| `cloudflared\` (whole folder) | `C:\Users\<THEIR-USER>\.cloudflared\` |

### 6. Fix the tunnel path

Required if the Windows username is not `gabca`.

Open `C:\Users\<THEIR-USER>\.cloudflared\config.yml` and set `credentials-file` to **their** user folder, same UUID filename, for example:

`C:\Users\<THEIR-USER>\.cloudflared\ce66d181-aeda-4e87-b18c-db817ed4a826.json`

Do not add `:8090` or `:8000` to this file.

---

## New PC — start empty stack, then restore data

### 7. Start Docker Desktop

Wait until it is fully running.

### 8. First start (creates containers/volumes; data is still empty/fresh)

```powershell
cd C:\Users\<THEIR-USER>\Desktop\ApoyoAdmin
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\scripts\Start-Apoyo.ps1
```

If it tries to start cloudflared, that is OK only if the **old PC tunnel is still the live one** — two connectors can fight. Safer: after this first start, stop cloudflared **on the new PC** until cutover:

```powershell
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
```

Confirm locally (not the public domain yet):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\scripts\Health-Apoyo.ps1
```

You want 200s on `127.0.0.1:4173`, `:4174`, `:54321`, and face `:8090`.

### 9. Restore database + files

Use the backup folder path from step 1:

```powershell
$bak = "$env:USERPROFILE\ApoyoBackups\<stamp>"

# Users, requests, auth — use the dump (do not also restore supabase_db_*.tgz)
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\scripts\Restore-Apoyo.ps1 -FromDir $bak -RestoreDatabase
```

Then restore **storage** (photos/docs) and **face** data. Stop those stacks first so files are not in use:

```powershell
docker compose --project-directory .\deploy -f .\deploy\docker-compose.yml stop
docker compose --project-directory ..\ApoyoMobile\deploy\face-verification -f ..\ApoyoMobile\deploy\face-verification\docker-compose.yml stop
npx --yes supabase stop
```

Restore only these two tarballs (not `supabase_db_ApoyoAdmin.tgz` if you already restored `postgres.dump`):

```powershell
docker volume create supabase_storage_ApoyoAdmin
docker volume create apoyo-face-verification_postgres-data

docker run --rm -v supabase_storage_ApoyoAdmin:/data -v "${bak}:/backup" alpine:3.20 tar xzf /backup/supabase_storage_ApoyoAdmin.tgz -C /data
docker run --rm -v apoyo-face-verification_postgres-data:/data -v "${bak}:/backup" alpine:3.20 tar xzf /backup/apoyo-face-verification_postgres-data.tgz -C /data
```

Start again **without** bringing up the tunnel yet:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\scripts\Start-Apoyo.ps1 -SkipBuild
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\scripts\Health-Apoyo.ps1
```

Log in to admin at `http://127.0.0.1:4174` and confirm real users/requests/files.

---

## Cutover (short downtime — minutes)

### 10. Old PC — stop the public door

```powershell
cd C:\Users\gabca\Desktop\ApoyoAdmin
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\scripts\Stop-Apoyo.ps1 -StopTunnel
```

If a `cloudflared` Windows service exists: `Stop-Service cloudflared`.

Public site is down until the next step.

### 11. New PC — open the public door

Elevated PowerShell (Run as administrator):

```powershell
cd C:\Users\<THEIR-USER>\Desktop\ApoyoAdmin
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\scripts\Install-CloudflaredService.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\scripts\Install-StartupTask.ps1
```

### 12. Prove it on the internet

From a phone (not on the new PC is fine):

- https://www.apoyo-dasma.online/
- https://admin.apoyo-dasma.online/
- https://api.apoyo-dasma.online/auth/v1/health

If those work, the new PC is the server.

### 13. Old PC

Leave it off the tunnel. After a day of the new PC looking correct, you can shut this one down. Do not run `Start-Cloudflared` here again.

---

## After it is live — accounts (ownership, not DNS)

DNS can stay on Cloudflare. You are handing **accounts**, not recreating the tunnel:

1. **Cloudflare** — transfer the zone / account that owns `apoyo-dasma.online` and tunnel `apoyo-dasma`.
2. **Resend** — transfer the account that sends from `noreply@apoyo-dasma.online` (same API key in `supabase\.env`, or rotate the key and update that file, then restart Supabase).
3. **Hostinger** — transfer the domain registrar to the client.

Mobile APK is separate: build/sideload from `ApoyoMobile` if they need a new install. The API URL in the app is already `https://api.apoyo-dasma.online`, so a working tunnel is enough for existing phones.

---

## If something breaks

| Symptom | What to do |
|---------|------------|
| Public site dead, local `:4173` works | Tunnel not running, or both PCs still tunneling. One cloudflared only. |
| Functions 503 | `docker start supabase_edge_runtime_ApoyoAdmin` then `Health-Apoyo.ps1` |
| Empty admin after restore | Dump was not restored, or you restored a stale backup |
| Photos missing | Storage tarball not restored |
| Face verify fails | Face volume / `face.env` key mismatch with `supabase\.env` |
| Tunnel error about credentials file | `config.yml` still points at `C:\Users\gabca\...` |

Daily start on the new PC after the two elevated scripts: Docker at login + scheduled task + cloudflared service. Until those are installed, they must run `Start-Apoyo.ps1` after every reboot.

See also `docs/TURNOVER.md` for stack layout, secrets rules, and what was intentionally not changed.
