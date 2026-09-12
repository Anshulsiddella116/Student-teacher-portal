// db.js — tiny file-based "database".
//
// This keeps the whole app dependency-free (no Mongo/Postgres to install)
// while still behaving like a real backend: state lives on the server,
// in a JSON file on disk, not in the browser.
//
// Swap this module out for a real database later (e.g. SQLite/Postgres)
// without touching server.js's route logic much, since it only talks to
// the functions exported below.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, assignments: [] }, null, 2));
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    // Corrupt file safety net — don't crash the server, start fresh.
    console.error('db.json was corrupt, resetting it:', e.message);
    const fresh = { users: {}, assignments: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

function writeDb(data) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

module.exports = { readDb, writeDb };
