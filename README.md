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

### 1) Backend
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### 2) Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Environment Variables

### Backend (`backend/.env`)
```env
PORT=3003
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
FRONTEND_ORIGINS=http://localhost:5173,http://localhost:5177,https://teamchat-cr5.pages.dev,https://teamchat.pages.dev,https://teamchat.wanpanel.ai
```

### Frontend (`frontend/.env`)
```env
VITE_API_BASE_URL=http://localhost:3003/api
```

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
