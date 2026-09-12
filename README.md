[README.md](https://github.com/user-attachments/files/32144291/README.md)
# EduSync — Student & Teacher Portal
This is split into two independent pieces:
```
edusync/
├── backend/    Node.js/Express API — accounts, assignments, submissions, PDF storage
└── frontend/   Plain HTML/CSS/JS site that talks to the backend over fetch()
```
Previously everything (including the PDF files, base64-encoded) lived in the
browser's `localStorage`. Now the frontend is just a "dumb" client: the
backend owns all the data, on the server's disk, and exposes it over a REST
API.
## 1. Run the backend
```bash
cd backend
npm install
npm start
```
This starts the API at `http://localhost:4000`. On first run it creates:
- `backend/data/db.json` — a JSON file holding user accounts and assignments (a stand-in "database" — see note below)
- `backend/uploads/` — where uploaded PDFs are actually stored as files

## 2. Run the frontend
The frontend is static files, so any simple web server works. Easiest option:
```bash
cd frontend
python3 -m http.server 5500
```
Then open `http://localhost:5500` in your browser. Make sure the backend
(step 1) is running at the same time — `frontend/app.js` calls it at
`http://localhost:4000` (edit the `API_BASE` constant at the top of that
file if you host the backend somewhere else).

You could also just double-click `frontend/index.html` to open it directly
in a browser — the app will still work as long as the backend is running,
since it only makes `fetch()` calls to it.
## What moved where

| Old behavior | Now lives in |
|---|---|
| `localStorage` "DB" of users/assignments | `backend/data/db.json`, read/written by `backend/db.js` |
| Base64 PDF stuffed into a hidden `<input>` | Real files on disk in `backend/uploads/`, served at `/uploads/<file>` |
| All logic in one inline `<script>` | `frontend/app.js`, calling the API with `fetch` |
| All CSS in a `<style>` tag | `frontend/style.css` |

## API summary

| Method & path | Purpose |
|---|---|
| `POST /api/register` | Create an account `{ name, id, pw, role }` |
| `POST /api/login` | Log in `{ id, pw, role }` |
| `GET /api/assignments?role=teacher&teacherId=…` | A teacher's own assignments (with submissions) |
| `GET /api/assignments?role=student&studentId=…` | Assignments visible to a student (with their own submission status) |
| `POST /api/assignments` | Create an assignment (multipart form, optional `pdf` file) |
| `DELETE /api/assignments/:id` | Delete an assignment (and its files) |
| `POST /api/assignments/:id/submit` | Student submits/replaces their PDF (multipart form) |

## Honest limitations (this is a learning project, not production-ready)

- Passwords are stored in plain text in `db.json`. A real app must hash
  them (e.g. with `bcrypt`) before saving.
- There's no session/token system — the frontend just remembers who's
  logged in in a JS variable, and re-sends the user's id on every request.
  A real app would use sessions or JWTs so requests are authenticated.
- `db.json` is fine for a class project but isn't safe for concurrent
  writes at scale — for anything bigger, swap `backend/db.js` for a real
  database (SQLite/Postgres) without needing to change the API routes much.
