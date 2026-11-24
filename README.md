# Uptown Phase 2 Site Walk

Mace site walk app for DMCC Uptown Phase 2. Served at `/uptown-phase-2/`.

- `server.js`: Node 20+, no packages. Email + PIN sign-in, shared walk data, photos.
- `public/`: the installable app (PWA).
- `data.enc`: project items and programme, encrypted. The server needs `DATA_KEY` to read it.

Variables: `DATA_KEY`, `ADMIN_EMAIL`, `ADMIN_PIN`, `ADMIN_NAME`, `DATA_DIR` (a volume, e.g. `/data`), `BASE` (default `/uptown-phase-2`).
