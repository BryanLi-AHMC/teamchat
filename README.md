# TeamChat

Initial framework for a lightweight internal team communication + progress update app.

## Stack
- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript
- Database: Supabase Postgres (schema draft in `docs/database-schema.sql`)

## Folder Structure
```text
teamchat/
  frontend/
  backend/
  docs/
```

## Local Setup

From the **repository root** (so the root `package.json` and `concurrently` are available):

```bash
npm install
npm run install:all
```

Then either run **API + UI together**:

```bash
npm run dev
```

Or run them in separate terminals:

```bash
npm run dev --prefix backend
npm run dev --prefix frontend
```

### First-time `.env` files

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill in Supabase values in both files.

### Port 3003 already in use (`EADDRINUSE`)

If `npm run dev` starts Vite but the **backend line** shows `EADDRINUSE`, nothing in that run is listening for Socket.IO on 3003 (or an old stray process is). Chat will show **realtime timeout** until you free the port and restart.

Stop the other terminal that is running the API, or on Windows:

```powershell
Get-NetTCPConnection -LocalPort 3003 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Then run `npm run dev` again from the repo root and confirm the log includes **`=== TEAMCHAT BACKEND STARTED ===`**.

Or change `PORT` in `backend/.env` and set `VITE_API_BASE_URL`, `VITE_SOCKET_URL`, and the `target` in `frontend/vite.config.ts` (`/socket.io` proxy) to the same port.

## Environment Variables

### Backend (`backend/.env`)
```env
PORT=3003
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
FRONTEND_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5177,https://teamchat-cr5.pages.dev,https://teamchat.pages.dev,https://teamchat.wanpanel.ai
```

### Frontend (`frontend/.env`)
```env
VITE_API_BASE_URL=http://localhost:3003/api
# Or use VITE_API_URL with the same value (supported for Cloudflare Pages).
```

### Cloudflare Pages (production)

- **Root directory:** `frontend`  
- **Build command:** `npm run build`  
- **Build output:** `dist` (not `/dist` from the monorepo root)  
- **Environment variables (Production and Preview):** set `VITE_API_URL` *or* `VITE_API_BASE_URL` (same URL, usually `https://<api-host>/api`), plus `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Redeploy after any change.  
- If you still see **old** error text after a deploy, purge cache / hard-refresh: `frontend/public/_headers` tells Pages not to cache HTML; you may also need **Caching → Purge Everything** in the dashboard once.

## API Endpoints (starter)
- `GET /api/health`
- `GET /api/messages`
- `POST /api/messages`
- `GET /api/groups`
- `POST /api/groups`
- `GET /api/progress`
- `POST /api/progress`

## Notes
- Do not commit `.env` files or real Supabase keys.
- Supabase client bootstrap is prepared in backend for next integration step.
- If `it_michael@portal.local` already exists, remove it manually in Supabase Auth (Authentication -> Users) and run:
  `delete from public.internal_profiles where email = 'it_michael@portal.local';`
