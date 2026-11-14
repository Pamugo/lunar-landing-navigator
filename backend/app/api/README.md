# backend/app/api — Capa HTTP

**Propietario exclusivo:** `fullstack-visualizer`.

Routers FastAPI versionados (`/api/v1`). Solo validan, invocan `app.services.*` y mapean al contrato de
`app/models/schemas.py`. **No contienen física.** Rutas previstas: `sites`, `horizon`, `visibility`, `compare`
(ver `docs/ARCHITECTURE.md` §5).
