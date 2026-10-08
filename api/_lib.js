// Skupne funkcije za API: prijava, GitHub, baza.
const crypto = require('crypto');

const REPO = process.env.GITHUB_REPO || 'claudinka33/Interstar_spletna';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const COOKIE = 'is_admin';
const SESSION_DAYS = 14;

function send(res, status, data) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function fail(res, err, status = 500) {
  console.error(err);
  send(res, status, { error: err && err.message ? err.message : String(err) });
}

// ---------- PRIJAVA ----------

function secret() {
  const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) throw new Error('ADMIN_PASSWORD ni nastavljen v Vercel nastavitvah');
  return s;
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function makeSession() {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  return `${exp}.${sign(exp)}`;
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function isAuthed(req) {
  const c = readCookie(req, COOKIE);
  if (!c) return false;
  const [exp, sig] = c.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return good.length === sig.length && crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig));
}

function requireAuth(req, res) {
  try {
    if (isAuthed(req)) return true;
  } catch (e) {
    fail(res, e);
    return false;
  }
  send(res, 401, { error: 'Prijava je potekla. Prijavi se ponovno.' });
  return false;
}

function setSessionCookie(res, value, maxAge) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
  );
}

function passwordOk(input) {
  const pw = process.env.ADMIN_PASSWORD || '';
  if (!pw) throw new Error('ADMIN_PASSWORD ni nastavljen v Vercel nastavitvah');
  const a = crypto.createHash('sha256').update(String(input || '')).digest();
  const b = crypto.createHash('sha256').update(pw).digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------- GITHUB ----------

async function gh(path, opts = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN ni nastavljen v Vercel nastavitvah');
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'interstar-cms',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!r.ok) {
    const t = await r.text();
    const err = new Error(`GitHub ${r.status}: ${t.slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  return r.status === 204 ? null : r.json();
}

// Prebere datoteko z GitHuba (najnovejša verzija, ne tista na strežniku).
async function readFile(path) {
  try {
    const d = await gh(`/contents/${encodeURI(path)}?ref=${BRANCH}`);
    if (d.content) return Buffer.from(d.content, 'base64').toString('utf8');
    // datoteke nad 1 MB
    const blob = await gh(`/git/blobs/${d.sha}`);
    return Buffer.from(blob.content, 'base64').toString('utf8');
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

// Zapiše več datotek v enem commitu.
// files: [{ path, text }] ali [{ path, base64 }] ali [{ path, remove: true }]
async function commit(files, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await gh(`/git/ref/heads/${BRANCH}`);
    const parentSha = ref.object.sha;
    const parent = await gh(`/git/commits/${parentSha}`);
    const tree = [];
    for (const f of files) {
      if (f.remove) {
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
        continue;
      }
      const blob = await gh('/git/blobs', {
        method: 'POST',
        body: JSON.stringify(
          f.base64 != null ? { content: f.base64, encoding: 'base64' } : { content: f.text, encoding: 'utf-8' }
        ),
      });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = await gh('/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
    });
    const c = await gh('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: newTree.sha, parents: [parentSha] }),
    });
    try {
      await gh(`/git/refs/heads/${BRANCH}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: c.sha, force: false }),
      });
      return c.sha;
    } catch (e) {
      // nekdo je vmes shranil – poskusi znova
      if (e.status !== 422 || attempt === 2) throw e;
    }
  }
}

// ---------- BAZA (Neon / Postgres) ----------

let _sql;
let _ready;
function db() {
  if (!_sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('DATABASE_URL ni nastavljen (poveži Neon bazo v Vercel → Storage)');
    const { neon } = require('@neondatabase/serverless');
    _sql = neon(url);
  }
  return _sql;
}

async function ensureTable() {
  if (_ready) return;
  const sql = db();
  await sql`CREATE TABLE IF NOT EXISTS povprasevanja (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ime TEXT NOT NULL,
    telefon TEXT,
    email TEXT,
    kraj TEXT,
    storitev TEXT,
    sporocilo TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'novo',
    opomba TEXT,
    stran TEXT,
    ip_hash TEXT
  )`;
  await sql`CREATE TABLE IF NOT EXISTS priloge (
    id SERIAL PRIMARY KEY,
    povprasevanje_id INTEGER NOT NULL REFERENCES povprasevanja(id) ON DELETE CASCADE,
    ime TEXT NOT NULL,
    tip TEXT NOT NULL,
    velikost INTEGER NOT NULL,
    vsebina TEXT NOT NULL
  )`;
  _ready = true;
}

module.exports = {
  REPO,
  BRANCH,
  send,
  fail,
  requireAuth,
  isAuthed,
  makeSession,
  setSessionCookie,
  passwordOk,
  readFile,
  commit,
  db,
  ensureTable,
};
