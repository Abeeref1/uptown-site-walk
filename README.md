# Uptown Phase 2 Site Walk

Mace site walk app for DMCC Uptown Phase 2. Served at `/uptown-phase-2/`.

- `server.js`: Node 20+, no packages. Password sign-in (each person has their own), shared walk data, photos.
- `public/`: the installable app (PWA).
- `data.enc`: project items and programme, encrypted. The server needs `DATA_KEY` to read it.

Variables: `DATA_KEY`, `ADMIN_PIN` (admin password), `ADMIN_NAME`, `DATA_DIR` (a volume, e.g. `/data`), `BASE` (default `/uptown-phase-2`).
