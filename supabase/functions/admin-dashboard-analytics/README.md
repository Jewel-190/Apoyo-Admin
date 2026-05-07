Protecting admin-dashboard-analytics

Overview
- The `admin-dashboard-analytics` edge function aggregates dashboard metrics server-side and can be protected by a secret `ADMIN_DASHBOARD_ANALYTICS_SECRET`.
- When the secret is set, server callers can use `Authorization: Bearer <ADMIN_DASHBOARD_ANALYTICS_SECRET>`.
- Authenticated admin users (present in the `admins` table with a recognized role) are also allowed to call the function using their normal access token.

Set the secret (Supabase CLI)

```bash
# Replace <PROJECT_REF> with your project ref (already linked in this workspace)
# Replace <SECRET_VALUE> with a secure random string (do not commit it)
npx supabase secrets set ADMIN_DASHBOARD_ANALYTICS_SECRET="<SECRET_VALUE>" --project-ref yrlkynetbegvwmqaiuvr
```

Server-side proxy (recommended)
- Do NOT put `ADMIN_DASHBOARD_ANALYTICS_SECRET` in frontend code. Instead, create a small serverless route that stores the secret in environment variables and proxies the request.

Example (Node / Express / Vercel serverless):

```js
// api/admin-analytics.js (serverless)
import fetch from 'node-fetch';

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL; // e.g. https://your-project-ref.supabase.co
  const ADMIN_SECRET = process.env.ADMIN_DASHBOARD_ANALYTICS_SECRET; // set in platform env

  const r = await fetch(`${SUPABASE_URL}/functions/v1/admin-dashboard-analytics`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${ADMIN_SECRET}`,
      'apikey': process.env.VITE_SUPABASE_ANON_KEY || '',
      'Accept': 'application/json',
    },
  });

  const payload = await r.json();
  res.status(r.status).json(payload);
}
```

Call the proxy from the frontend:

```js
// client
const res = await fetch('/api/admin-analytics');
const data = await res.json();
```

Alternative: server-side `supabase-js` invocation

If you have a backend that can safely hold the Supabase service role key, you can invoke the function (or call the same aggregation from server-side code) using `@supabase/supabase-js`:

```js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase.functions.invoke('admin-dashboard-analytics');
// or use fetch to the function endpoint with ADMIN_DASHBOARD_ANALYTICS_SECRET
```

Notes
- When the secret is set, the function accepts either the secret (server-side) or a valid admin access token (client-side).
- Keep `ADMIN_DASHBOARD_ANALYTICS_SECRET` and any service role keys out of frontend code and source control.
