// Persistência simples em arquivo JSON (sem dependências externas).
// Para produção, a estrutura foi pensada para migrar facilmente para Postgres/Supabase.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const EMPTY = () => ({
  users: [],
  sessions: {},       // token -> { userId, role, createdAt }
  swipes: [],         // { from, to, action, at }
  matches: [],        // { id, users:[a,b], createdAt, active }
  messages: [],       // { id, matchId, from, text, createdAt, readAt }
  events: [],
  rsvps: [],          // { eventId, userId, at }
  vip: [],            // { id, eventId, userId, guests, status, code, createdAt, usedAt }
  announcements: [],  // { id, title, body, type, createdAt }
  reports: [],        // { id, from, target, reason, createdAt, status }
  blocks: [],         // { from, to }
  checkins: {},       // userId -> { at, expiresAt, method }
  settings: {}
});

let db;
try {
  db = Object.assign(EMPTY(), JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
} catch {
  db = EMPTY();
}

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
}
function flush() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}
process.on('exit', () => { try { flush(); } catch {} });

module.exports = { db, save, flush, DATA_DIR, DB_FILE, UPLOAD_DIR, EMPTY };
