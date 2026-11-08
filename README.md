# FLAXXI OFFICIAL — License Control Center

This is a fresh implementation inspired by the *publicly visible* layout and feature list of the KURO page. It is not the original site's source code, does not copy its private backend, and does not access its owner account.

## Included
- Responsive dark neon licensing dashboard (HTML/CSS/JS)
- Owner sign-in backed by a bcrypt password hash
- License creation with custom key or generated key, customer label, duration and device limit
- License history, copy and revoke actions
- JSON API response viewer restricted to this app's own `/api/` routes
- JSON-file persistence in `data/licenses.json`

## Requirements
Node.js 18 or newer.

## Run locally
1. Extract the ZIP and open a terminal in this folder.
2. Install dependencies:
   `npm install`
3. Copy `.env.example` to `.env`.
4. Generate a bcrypt password hash:
   `node -e "require('bcryptjs').hash('Choose-A-Strong-Password',12).then(console.log)"`
5. Paste the hash into `ADMIN_PASSWORD_HASH` in `.env`.
6. Set a long random `SESSION_SECRET` (at least 32 characters), and set `ADMIN_USERNAME`.
7. Start:
   `npm start`
8. Open `http://localhost:3000`.

## API routes
All routes except health and login/logout require an authenticated owner session.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Service health |
| POST | `/api/auth/login` | Owner sign-in |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | Session check |
| GET | `/api/licenses` | List licenses |
| POST | `/api/licenses` | Create license |
| POST | `/api/licenses/:id/revoke` | Revoke a license |
| DELETE | `/api/licenses/:id` | Delete a license |

Example create body:
```json
{
  "prefix": "KURO",
  "customKey": "",
  "label": "Customer monthly",
  "durationDays": 30,
  "deviceLimit": 1
}
```

## Important deployment notes
- Use HTTPS in production. Set `NODE_ENV=production`.
- Use a unique random `SESSION_SECRET` and a strong owner password.
- Keep `.env` and `data/` private. Never upload `.env` to GitHub.
- Back up `data/licenses.json`.
- This starter stores sessions in memory, so all users are signed out when the server restarts. Use a persistent session store before scaling to multiple server instances.
- JSON-file persistence is suitable for a small single-instance project. For multi-user or high-volume production, migrate to PostgreSQL/SQLite with transactional writes.
- The `deviceLimit` field is stored and displayed; actual device activation enforcement must be implemented in the app that consumes these license keys.
- The API viewer intentionally accepts only same-origin relative `/api/...` paths. It is not an open URL proxy.
- Do not use this project to impersonate another service or collect credentials for a site you do not own.



## Inspected website scope
The public page at `https://kurov4.pythonanywhere.com/` exposes an owner login and a license workspace: key type, custom key, customer label, validity duration, device limit, generated-key display/copy, and license history with status, expiry, devices and actions. The private owner area and its real backend data are not public, so this project provides an independent implementation of the visible workflow, not the original server's private files or records.
