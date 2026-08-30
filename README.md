# Apoyo Admin

Staff console and **system backend** for **Apoyo**, a digital social-welfare assistance platform for the **City of Dasmariñas**. Citizens apply from a mobile app. The public learns about programs on a website. City staff review, schedule, and decide cases here.

This repository is the **source of truth** for:

- the **admin** and **superadmin** web apps
- **Supabase** (PostgreSQL, Auth, Storage, Edge Functions, Row Level Security)
- production **Docker / nginx** serving and turnover scripts

Sibling repositories:

| Repo | Role | GitHub |
|------|------|--------|
| **Apoyo-Admin** (this repo) | Backend + staff UI | https://github.com/Jewel-190/Apoyo-Admin |
| **Apoyo-Web** | Public marketing site | https://github.com/Jewel-190/Apoyo-Web |
| **Apoyo-Mobile** | Citizen Expo app + face-verification stack | https://github.com/Jewel-190/Apoyo-Mobile |

---

## 1. What Apoyo is (defense one-liner)

Apoyo is a **self-hosted, three-application system** that lets **registered voters** of Dasmariñas apply for city assistance (medical, financial, burial, and other catalogued programs), lets **line administrators** process those applications by service category, and lets **superadministrators** manage users, voters, CMS content, settings, and audit.

It is **not** a public cloud SaaS. The database and files live on a **Windows office PC**. The public internet reaches that PC only through a **Cloudflare Tunnel**. The only paid third parties are **Cloudflare** (DNS + tunnel), **Resend** (transactional email), and **Hostinger** (domain registrar).

---

## 2. The three clients and one backend

```
                    Internet (HTTPS)
                           |
                    Cloudflare Tunnel
                    apoyo-dasma
                           |
          +----------------+----------------+
          |                |                |
   www.apoyo-dasma    admin.apoyo-dasma   api.apoyo-dasma
   .online            .online             .online
          |                |                |
     nginx :4173      nginx :4174      Kong :54321
     Apoyo Web        Apoyo Admin      Local Supabase
     (public SPA)     (staff SPA)      Auth + Postgres
                                       Storage + Edge
                                              |
                                    Face verifier :8090
                                    (NOT on the tunnel)
```

| Audience | App | Talks to |
|----------|-----|----------|
| Citizens / families | **Apoyo Mobile** (Android via Expo) | `https://api.apoyo-dasma.online` |
| General public | **Apoyo Web** | API for CMS pages + public catalog |
| CSWD / city staff | **Apoyo Admin** (this SPA) | Same API, authenticated as `admins` |
| Platform operators | **Superadmin** (same SPA, different routes) | Privileged edge functions |

The mobile app **never** calls the face-verifier port. It calls **edge functions**; those functions call Docker service `face-verifier` on the private Docker network.

---

## 3. Whole-system technology stack — how and why

This section is the one to study for defense: **what the tool actually does in Apoyo**, and **why it was chosen instead of a more obvious alternative**.

### 3.1 Web UIs (Admin + public site): React, Vite, React Router, Tailwind

**React 19** is a **client-side component library**, not a server. Admin is queues, filters, session heartbeats, document lightboxes, and role-gated layouts. That is an **SPA** problem: after login the shell stays mounted and only the inner view changes. A **Next.js / SSR** app would require a **Node process on the office PC** in front of every page. We already have Kong for data; we do not want a second application server just to render HTML. React compiles to static JS that **nginx** can serve.

**Vite 7** is the **bundler and dev server**. In development it uses native ES modules + HMR so staff UI iteration is fast. In production `vite build` emits `dist/` (hashed JS/CSS). `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are **inlined at build time** — that is why they must be public values only. Vite is used instead of webpack for simpler config and faster builds; it is used instead of serving `src/` raw because production needs minification, code-split chunks (`xlsx` is lazy), and cacheable filenames.

**React Router 7** (`BrowserRouter`) maps URLs (`/admin/scheduling`, `/superadmin/data-management/users`) to components **in the browser**. That is why nginx (and Cloudflare) must **fall back unknown paths to `index.html`**: a refresh on `/admin/reports` is not a real file on disk. We did not use hash routing (`#/admin`) because public/staff URLs should look like normal HTTPS paths.

**Tailwind CSS 4** (Vite plugin) is **utility CSS generated from class names**. Staff screens are dense tables and badges; utilities avoid a large custom CSS file that drifts between Admin and Web. The Vite plugin compiles only used classes (no unused Bootstrap-sized sheet).

**lucide-react** (Admin) and **react-icons** (Web) are SVG icon sets imported as components so unused icons are tree-shaken. Admin needs many status/action glyphs; Web needs a smaller marketing set.

**SheetJS (`xlsx`)** runs in the **browser** (and from report payloads) to emit `.xlsx` / CSV. City offices open Excel, not JSON. A server-side report renderer would mean another runtime and disk path; generating the workbook from already-authorized JSON keeps export on the same permission path as the on-screen report.

### 3.2 Citizen app: Expo / React Native (Apoyo-Mobile)

**Expo 54 + React Native 0.81** compile JavaScript to a **native Android (and optional iOS) app** with camera, secure storage, and file pickers. A **mobile website** cannot reliably do liveness capture, SecureStore, or Play-style install. **Flutter** would be a second language beside the React web apps; Expo keeps **one UI paradigm (React)** across phone and browser.

**expo-router** is file-based navigation (`app/Home/…`) so screens match URLs/deep links (`apoyo://auth-callback`) for email confirmation. **expo-camera** is used because registration needs a **live camera stream and multiple frames**, not a single gallery pick (a gallery photo is exactly the spoof we try to reject).

**expo-secure-store** holds the Supabase session on device using the OS keystore/keystore-equivalent. `localStorage` on a phone WebView is trivial to scrape; AsyncStorage is unencrypted. SecureStore has a **size limit**, so the session is **chunked**. Web fallback still uses AsyncStorage because there is no SecureStore on web.

### 3.3 Backend platform: local Supabase (this repo)

We did **not** write a custom Express/Nest API for every table. **Supabase CLI (`npx supabase start`)** runs a **known composition** of open-source pieces as Docker containers. Migrations live in `supabase/migrations/` and are the schema source of truth.

| Piece | What it does here | Why this instead of… |
|-------|-------------------|----------------------|
| **PostgreSQL 17** | System of record. Tables, **triggers** (applicant snapshot on submit), **RPCs** (`submit_assistance_request`, `claim_admin_session`, `is_superadmin`). | SQLite cannot do concurrent staff + mobile + RLS at this scale. A cloud DB would be a **fourth vendor** and would send voter/case PII off the office PC. |
| **Row Level Security (RLS)** | Postgres **policies** run on **every** PostgREST query using `auth.uid()` from the JWT. Example: a line admin only sees requests in their `category_id`; anon can **read active catalog** but not `web_content` or other people’s files. | App-only checks fail if someone calls the REST URL with the anon key (which is **in the JS bundle** — that is normal). RLS is defense in depth **in the database**. |
| **PostgREST** | Turns tables/views/RPCs into HTTP (`/rest/v1/…`) with **parameterized** filters. The JS client does not concatenate SQL. | A hand-written CRUD API would duplicate the schema and drift. PostgREST stays in sync with migrations. |
| **GoTrue (Supabase Auth)** | Email+password (staff) and email+**6-digit MPIN** (citizens). Issues **JWTs**, refresh rotation, confirmation and recovery **emails**. | A `pins` table with reversible encryption would be worse. GoTrue **hashes** the secret. Confirmation uses real SMTP (Resend), not a fake inbox, so citizens can register on a real phone. |
| **Kong** | One process on **host port 54321** that **routes** `/auth/v1`, `/rest/v1`, `/storage/v1`, `/functions/v1`. | The tunnel only needs **one** origin (`api.apoyo-dasma.online`). Without a gateway we would expose Postgres (54322) or many ports. |
| **Storage** | S3-compatible object API. Buckets: private `request-documents`, `avatars`, `web-content`. | Files in Postgres BLOBs bloat backups and RLS. Private buckets + **signed URLs** mean a guessed path is not enough to download an ID photo. |
| **Edge Functions (Deno 2)** | TypeScript on the gateway with **service_role** (bypasses RLS **on purpose** after the function has authorized the caller). Used for CMS, staff reports, notifications, **bridging to the face verifier**. | Putting `service_role` in Vite/Expo would let anyone become superadmin. SQL RPCs are used when the logic is set-based; Edge is used when we need HTTP to Python, multi-step auth, or a stable JSON contract for three clients. |

**Why not hosted Supabase Cloud?** It would be another paid vendor, another region for PII, and a different JWT secret than this homelab. Local `supabase start` keeps **data + migrations in this repo** on the city’s disk.

**Why `minimum_password_length = 6`?** The mobile **MPIN is the GoTrue password**. Raising the minimum to 8 would **break citizen sign-up**. Staff create/reset in superadmin still enforces **8+** in application code.

**Why some functions have `verify_jwt = false`?** `web` must answer **anonymous** GET for the marketing site. `facial-verification` / `id-document-verification` run **before** the user has a session (registration). Kong will not require a user JWT, but the function **still** checks a **registration-attempt token** (or, for CMS POST, a superadmin JWT). That is “public gateway, private rules inside.”

### 3.4 Face / ID stack (Apoyo-Mobile compose, called from these edge functions)

The phone **must not** talk to port 8090. If it did, anyone who decompiled the APK could hammer the models. Flow:

`Expo camera frames` → **HTTPS** `api…/functions/v1/facial-verification` → Deno checks registration token → HTTP to Docker alias **`face-verifier:8080`** (private network).

| Technology | How it is applied | Why this tool |
|------------|-------------------|---------------|
| **Exadel CompreFace** | 1:1 **verification**: embedding of selfie vs embedding of ID photo; accept if similarity ≥ ~0.85. | Self-hosted, Docker-friendly, built for verification (not a paid cloud Face API that would **upload citizen faces**). |
| **DeepFace** (`anti_spoofing=True`) | Classifies whether a frame is a **live face vs printout/screen**. | CompreFace answers “do these two faces match?”; it does not answer “is this a spoof?” We stack a second model for that. |
| **MediaPipe Face Mesh** | Landmarks → **eye aspect ratio** (blink) and **yaw** (turn left/right). Multiple frames required. | Cheap CPU landmark model. Stops a single frozen JPEG being sent five times as “liveness.” Combined with aHash/Hamming to reject near-identical frames. |
| **EasyOCR + RapidFuzz** | OCR on the ID image, fuzzy-match strings to `registered_voters` / registration profile (name, etc.). | PH IDs are photos, not structured barcodes we control. OCR is noisy; RapidFuzz scores **approximate** matches instead of exact string equality. |
| **FastAPI (Python)** | `/verify`, `/verify-id`, `/health`, `/warmup`; **x-api-key**. Heavy models loaded once at warmup. | The ML ecosystem is Python. FastAPI is a thin HTTP skin so Deno does not import PyTorch. Health/warmup exist because first inference is slow; Kong would otherwise 504. |
| **Docker Compose + extra network** | Verifier joins `supabase_network_ApoyoAdmin`. | Edge runtime **cannot** use `127.0.0.1:8090` inside its container (that is the container itself). `host.docker.internal` works on Docker Desktop but the **compose alias** is the intended production path. |

CompreFace’s UI (`:8000`) stays on localhost for operators only.

### 3.5 Hosting: Docker, nginx, Cloudflare, Resend, Hostinger

**Docker Desktop (WSL2)** is required because Postgres, Kong, CompreFace, and nginx are **Linux containers**. The constraint “runs on a Windows PC” is satisfied by Docker, not by rewriting the stack in C# / IIS.

**nginx Alpine** serves **pre-built** `dist/` for Web (`127.0.0.1:4173`) and Admin (`127.0.0.1:4174`). Why not `vite preview`? Preview is a **Node process tied to a terminal**; it dies when Cursor/PowerShell exits. nginx is a static file server with **gzip**, **Cache-Control** (hashed assets immutable, `index.html` no-store), **security headers**, and `restart: unless-stopped`. Binding **127.0.0.1** means LAN users cannot hit staff UI without the tunnel.

**Cloudflare named tunnel (`cloudflared`)** creates an **outbound** connection from the PC to Cloudflare. Why not port-forward 443 on the router? Many PH ISPs use **CGNAT** (no public IPv4). Opening 443 would also put Kong on the raw internet. The tunnel: (1) no inbound firewall hole, (2) **TLS certificates** at Cloudflare, (3) WAF/DDoS in front, (4) three hostnames → three localhost ports. Face `:8090` is **omitted** from `config.yml` on purpose.

**Cloudflare DNS + Hostinger registrar:** Hostinger only **owns the domain name**. Records for `www` / `admin` / `api` live in Cloudflare so they can point at the **tunnel**, not at a changing home IP.

**Resend (SMTP `smtp.resend.com:465`)** is plugged into **GoTrue**, not into the React apps. Auth must send **confirmation and MPIN recovery** to real inboxes. Local **Inbucket/Mailpit** is only for debugging and is **not** tunneled. The API key stays in `supabase/.env`. From-address `noreply@apoyo-dasma.online` is a domain Resend has permission to send for.

**PowerShell `deploy/scripts`:** Windows-native orchestration (`supabase start`, compose up, health probes). There is no systemd on this PC.

---

## 4. Who uses which part

### Citizens (mobile)

1. Prove they are a **registered voter** (lookup against `registered_voters`).
2. Upload a **valid ID**, complete **liveness + face match**.
3. Set a **6-digit MPIN** (this **is** the GoTrue password; it is hashed by Auth, never stored in `public.users`).
4. Confirm email (Resend).
5. Apply for assistance, upload documents, track status, receive in-app notifications.

### Public (website)

- Read Home / Services / About / Legal.
- Services page shows the **live catalog** of active programs (same tables the mobile app uses).
- Copy and media come from Superadmin **Web CMS** via `GET /functions/v1/web`.

### Line administrators (this app, `/admin`)

Scoped by `admins.category_id` to one assistance **line** (e.g. medical vs financial):

- Dashboard metrics
- Application queues (overview, action required, resubmissions, review)
- For-approval: **scheduling** and **case study**
- Archive, notifications, reports, activity logs

### Superadministrators (this app, `/superadmin`)

- Platform dashboard
- Content: assistance catalog + **public website CMS**
- Data: applicants, voters, staff accounts, service logs
- Settings: system theme/legal, service settings
- Audit trail, reports, notifications

Staff passwords for **admin accounts** are required to be **8+ characters**. Citizen MPINs stay **6 digits** so the phone UX still works (`minimum_password_length = 6` in GoTrue).

---

## 5. Request pipeline (shared language)

Statuses move roughly:

`draft` → `pending` → `in progress` → `action required` / `resubmitted` → `for approval` → `scheduled` / `case study` → `approved` | `declined`

When a citizen **submits**, a database trigger stamps **applicant identity snapshot** columns on `assistance_requests` (name, contact, address, voter id, …). Later edits to the live `users` profile **do not rewrite history**. Admin review screens read the snapshot.

---

## 6. This repository in depth

### 6.1 UI map

```
src/
  pages/AdminLogin.jsx
  admin/          line-admin modules and layout
  superadmin/     superadmin modules and layout
  shared/         auth, catalog, APIs, sanitization, snapshots
```

| Area | Example routes |
|------|----------------|
| Login | `/login`, `/admin/login` |
| Admin | `/admin/dashboard`, `/admin/applications/...`, `/admin/scheduling`, `/admin/case-study`, `/admin/archive`, `/admin/notifications`, `/admin/reports`, `/admin/activity-logs` |
| Superadmin | `/superadmin/dashboard`, `/superadmin/content-management/*`, `/superadmin/data-management/*`, `/superadmin/global-settings/*`, `/superadmin/audit-trail`, `/superadmin/reports`, `/superadmin/notifications` |

Access: after GoTrue login, a row in `public.admins` is required. Superadmin if `is_super_admin`; otherwise a `category_id` is required. A **session claim** RPC (`claim_admin_session`) enforces a single active staff browser session.

### 6.2 Edge functions (`supabase/functions/`)

Privileged work uses the **service role** inside Deno. Browsers and the phone only send the **anon** key plus the user JWT (except a few pre-auth registration/public endpoints).

**When we use an Edge Function instead of a SQL RPC:** the operation needs HTTP to another container (face verifier), a **stable JSON shape** shared by three clients, multipart-ish payloads, or checks that are awkward in SQL (CMS canonicalize, XLSX assembly). **When we use an RPC:** set-based rules next to the data (`submit_assistance_request`, `claim_admin_session`, snapshot trigger). Both still run **after** RLS/JWT identity exists (except the three public-gateway functions below).

| Function | Purpose |
|----------|---------|
| `web` | Public marketing JSON + superadmin CMS save |
| `facial-verification` | Registration liveness/face match → internal verifier |
| `id-document-verification` | ID OCR vs voter profile → internal verifier |
| `request-code-generator` | Issues request codes (logged-in user or hook secret) |
| `storage-cleanup` | Removes orphaned storage objects |
| `notifications` | Citizen inbox |
| `admin-notifications` / `admin-dashboard-analytics` / `admin-reports` / `admin-activity-logs` | Line-admin APIs |
| `super-admin-*` | Superadmin analytics, reports, users, voters, admins, services, settings, audit, service logs, notifications |

`verify_jwt` is **off** only for `web`, `facial-verification`, and `id-document-verification` (public site and pre-login registration). Those functions still enforce their own rules (CMS needs a superadmin JWT; face/ID need a registration-attempt token).

### 6.3 Important tables (Postgres)

| Group | Tables |
|-------|--------|
| People | `users`, `admins`, `admin_active_sessions`, `registered_voters`, `barangays` |
| Catalog | `assistance_categories`, `assistance_services`, `assistance_requirements`, `assistance_requirement_tips` |
| Cases | `assistance_requests` (plus `applicant_*` snapshot columns), `request_attachments`, `audit_logs` |
| Ops / CMS | `settings`, `web_content`, `admin_notification`, `user_notification`, `audit_trail`, superadmin notification tables |

**Row Level Security** is on. Clients cannot freely rewrite staff tables. Catalog **writes** are superadmin. Applicant documents in Storage are **private**; the UI uses **signed URLs**.

### 6.4 Storage buckets

| Bucket | Who | Notes |
|--------|-----|--------|
| `request-documents` | Applicants + staff (signed URLs) | Private; typical mobile cap 5 MB, images/PDF |
| `avatars` | The user who owns the object | Profile photos |
| `web-content` | Superadmin | Hero media; not proxied through edge (size) |

---

## 7. Security story (what to say in defense)

1. **Least privilege on the wire.** SPAs and the phone ship only the **anon/publishable** key. Service role, Resend, and the face-verifier shared secret stay in `supabase/.env` on the server.
2. **RLS + edge functions.** Sensitive mutations are not “the React app updates the table.” They go through authorized functions or RPCs.
3. **HTTPS at the edge.** Cloudflare terminates TLS. Origin is HTTP on `127.0.0.1` only.
4. **No extra cloud database.** Citizen PII (IDs, selfies, case files) stays on the office PC. Face models never sit on a public URL.
5. **Auth emails** go through Resend over SMTP; templates live under `supabase/templates/`.
6. **Headers:** HSTS, nosniff, frame deny, CSP, Referrer-Policy, Permissions-Policy, COOP (nginx + Vite plugin).
7. **CMS HTML** is sanitized before `dangerouslySetInnerHTML`. Hrefs are allowlisted.
8. **PH mobile numbers** normalized to `+63 9XX XXX XXXX` in superadmin and mobile.
9. **Historical integrity:** applicant snapshots freeze identity on submit.
10. **Rate limits:** GoTrue sign-in limits; UI lockout after 5 failures (5 minutes).
11. **Password policy split:** 6 for MPIN, 8+ for staff credentials.

Intentionally **not** claimed as a multi-tenant hardened SaaS: local Supabase uses the well-known demo JWT secret unless rotated (rotation would log everyone out and require rebuilding all three apps).

---

## 8. How production runs on the Windows PC

```
Docker Desktop
  ├── npx supabase start     Kong :54321, Postgres, Auth, Storage, edge runtime
  ├── face-verification      CompreFace + FastAPI verifier :8090 (localhost only)
  └── nginx                  Web :4173, Admin :4174 (localhost only)
cloudflared                  named tunnel → those three localhost ports
```

Operator entrypoint:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\scripts\Start-Apoyo.ps1
```

Related: `docs/TURNOVER.md` (stack rules), `docs/CUTOVER-NEW-PC.md` (move to another PC).

**Do not** use `vite preview` or a second `functions serve` as the public door. `supabase start` already serves edge functions when `[edge_runtime] enabled = true`.

---

## 9. Local development (this repo)

```bash
cp .env.example .env.local          # VITE_SUPABASE_URL + anon key only
cp supabase/.env.example supabase/.env
npm install
npx supabase start
npm run dev                         # Vite, typically :5173
```

Staff UI env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Never put `service_role` in Vite env.

---

## 10. How the three GitHub repos fit a defense slide

| Question | Answer |
|----------|--------|
| Where is the database defined? | This repo: `supabase/migrations/` |
| Where do citizens tap? | Apoyo-Mobile |
| Where does the public read? | Apoyo-Web |
| Where do staff decide cases? | This repo’s React app |
| Where is face AI? | Apoyo-Mobile `deploy/face-verification`, called from this repo’s edge functions |
| Where is production compose for the websites? | `deploy/` in this repo |

Same API host for all three: **`https://api.apoyo-dasma.online`**.
