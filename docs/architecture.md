# TeamChat Architecture (Initial Framework)

## Purpose
TeamChat is a lightweight internal communication and progress tracking web app for a small team (6-7 users). It combines quick group/direct messaging with daily progress updates in one interface.

## Project Structure
- `frontend/` - React + Vite + TypeScript app with a three-panel internal tool layout.
- `backend/` - Express + TypeScript API with clean route boundaries for health, messages, groups, and progress.
- `docs/` - architecture notes and initial database schema draft for Supabase Postgres.

## Frontend / Backend / DB Flow
- Frontend reads `VITE_API_BASE_URL` and calls backend `/api/*` endpoints.
- Backend handles request validation and route orchestration.
- Supabase client setup is prepared in `backend/src/lib/supabase.ts` for future persistence.
- Database schema draft defines users, groups, memberships, messages, and progress updates.

## Future Realtime Plan
- Use Supabase Realtime subscriptions for:
  - new message inserts (group and direct channels),
  - message edits/deletes,
  - progress update changes.
- Keep optimistic UI updates in frontend for fast UX, then reconcile with backend/Supabase events.
- Add a small event abstraction in backend if server-mediated realtime is needed later.

## Future Auth Plan
- Integrate Supabase Auth for sign-in/session handling.
- Map `auth.users.id` to `public.profiles.id`.
- Add auth middleware in backend to validate bearer token/JWT and attach user context.
- Enable RLS policies in Supabase for messages/progress/group membership access control.

## First MVP Checklist
- [x] Monorepo-style structure with frontend/backend/docs.
- [x] Backend API scaffolding with CORS, env config, and placeholder routes.
- [x] Frontend app shell with sidebar, chat panel, and progress panel.
- [x] Initial SQL schema draft for Supabase.
- [x] Local env example files.
- [ ] Connect routes to Supabase reads/writes.
- [ ] Add Supabase Auth login and protected routes.
- [ ] Add realtime subscriptions and live chat updates.
