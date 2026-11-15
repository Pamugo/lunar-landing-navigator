# backend/app/api — HTTP Layer

**Exclusive owner:** `fullstack-visualizer`.

Versioned FastAPI routers (`/api/v1`). Validate inputs, invoke `app.services.*`, and map to the
`app/models/schemas.py` contract. **Contain no physics.** Planned routes: `sites`, `horizon`, `visibility`, `compare`
(see `docs/ARCHITECTURE.md` §5).
