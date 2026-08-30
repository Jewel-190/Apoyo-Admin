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

## 3. Whole-system technology stack

### 3.1 Presentation

| Layer | Technology | Why it is in the stack |
|-------|------------|------------------------|
| Admin / Superadmin UI | **React 19** + **Vite 7** + **React Router 7** | Fast SPA for staff workflows (tables, review, reports) |
| Public website | **React 19** + **Vite 7** + **React Router 7** | Marketing site with CMS-driven copy, no login |
| Citizen app | **Expo 54** + **React Native 0.81** + **expo-router** | One codebase for Android (and iOS if needed) |
| Styling (web) | **Tailwind CSS 4** | Utility CSS shared across Admin and Web |
| Styling (mobile) | StyleSheet + brand teal; NativeWind available | Native performance and a fixed brand (`#008E8A`) |
| Icons | **lucide-react** (admin), **react-icons** (web), Expo vector icons (mobile) | Consistent iconography per platform |
| Reports export | **SheetJS (`xlsx`)** | Excel/CSV downloads for admin and superadmin reports |

### 3.2 Backend (this repo)

| Layer | Technology | Role |
|-------|------------|------|
| API gateway | **Kong** (Supabase local stack) on port **54321** | Single HTTPS door: Auth, REST, Storage, Functions |
| Database | **PostgreSQL 17** | System of record: users, requests, catalog, RLS |
| Auth | **GoTrue** (Supabase Auth) | Email confirmation, JWT sessions, MPIN-as-password |
| Data API | **PostgREST** | Typed REST over tables/views/RPCs with RLS |
| Files | **Supabase Storage** (S3-compatible locally) | Applicant documents, avatars, web CMS media |
| Server logic | **Supabase Edge Functions** (Deno 2) | Privileged writes, CMS, face/ID bridge, notifications |
| Realtime / Studio | Included in `supabase start` | Local ops; **not** exposed on the public tunnel |

### 3.3 Identity verification (lives in Apoyo-Mobile, used by this backend)

| Layer | Technology | Role |
|-------|------------|------|
| Face recognition | **Exadel CompreFace 1.2** | Compare selfie vs ID photo (similarity threshold ~0.85) |
| Anti-spoof | **DeepFace** | Reject printed photos / screens |
| Liveness | **MediaPipe Face Mesh** | Blink and pose challenges across multiple frames |
| ID text | **EasyOCR** + **RapidFuzz** | Match ID card text to voter registry fields |
| Verifier API | **Python FastAPI** | One internal HTTP service wrapping the models |
| Orchestration | **Docker Compose** | Postgres + CompreFace + verifier on localhost |

### 3.4 Production hosting (Windows PC)

| Layer | Technology | Role |
|-------|------------|------|
| Containers | **Docker Desktop** (WSL2) | Supabase, nginx SPAs, face stack |
| Static hosting | **nginx** Alpine | Serves built `dist/` for Web (`:4173`) and Admin (`:4174`) |
| Public HTTPS | **Cloudflare named tunnel** `apoyo-dasma` | No inbound port-forward; Cloudflare terminates TLS |
| DNS / domain | **Cloudflare DNS** + **Hostinger** registrar | `*.apoyo-dasma.online` |
| Email | **Resend** SMTP (`smtp.resend.com:465`) | Confirmation and MPIN recovery mail from `noreply@apoyo-dasma.online` |
| Start/stop | PowerShell in `deploy/scripts/` | `Start-Apoyo.ps1`, health, backup, restore, tunnel service |

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
