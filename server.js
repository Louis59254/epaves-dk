// ── MAZ Fishing — Serveur gestion locative ──────────────────────────────────
// Zéro dépendance : Node.js pur + stockage JSON + auth HMAC/scrypt
// Déploiement : Coolify (voir README-DEPLOY.md)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const APP_DIR = __dirname;

// ── DB JSON ──────────────────────────────────────────────────────────────────
let db = null;

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString('hex');
}

function defaultDb() {
  const secret = crypto.randomBytes(32).toString('hex');
  const mkUser = (id, name) => {
    const salt = crypto.randomBytes(8).toString('hex');
    return { id, name, salt, pinHash: hashPin('1234', salt) };
  };
  return {
    secret,
    users: [mkUser('u1', 'Louis'), mkUser('u2', 'Antoine')],
    clients: [],
    bookings: [],
    settings: {
      tarifs: { matin: 120, apresmidi: 120, journee: 200, soiree: 100 },
      fideliteSeuil: 5,
    },
  };
}

function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    db = defaultDb();
    saveDb();
  }
}

let _saveTimer = null;
function saveDb() {
  // Écriture atomique (tmp + rename)
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// ── Auth ─────────────────────────────────────────────────────────────────────
function makeToken(userId) {
  const exp = Date.now() + 90 * 24 * 3600 * 1000; // 90 jours
  const payload = `${userId}.${exp}`;
  const sig = crypto.createHmac('sha256', db.secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const payload = `${userId}.${exp}`;
  const expect = crypto.createHmac('sha256', db.secret).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  if (Date.now() > Number(exp)) return null;
  return db.users.find(u => u.id === userId) || null;
}

// ── Helpers HTTP ─────────────────────────────────────────────────────────────
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(APP_DIR, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  if (!file.startsWith(APP_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=300',
    });
    res.end(buf);
  });
}

// ── Fidélité ─────────────────────────────────────────────────────────────────
function clientWithLoyalty(c) {
  const filleuls = db.clients.filter(x => x.referredBy === c.id);
  const seuil = db.settings.fideliteSeuil || 5;
  const earned = Math.floor(filleuls.length / seuil);
  const used = c.rewardsUsed || 0;
  return {
    ...c,
    referralCount: filleuls.length,
    rewardsEarned: earned,
    rewardsUsed: used,
    rewardsAvailable: Math.max(0, earned - used),
    bookingsCount: db.bookings.filter(b => b.clientId === c.id && b.status !== 'annule').length,
  };
}

// ── API ──────────────────────────────────────────────────────────────────────
async function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  // Login (public)
  if (pathname === '/api/login' && req.method === 'POST') {
    const { userId, pin } = await readBody(req);
    const user = db.users.find(u => u.id === userId);
    if (!user || hashPin(pin, user.salt) !== user.pinHash) {
      return json(res, 401, { error: 'PIN incorrect' });
    }
    return json(res, 200, { token: makeToken(user.id), user: { id: user.id, name: user.name } });
  }

  // Liste users pour l'écran de login (noms uniquement, public)
  if (pathname === '/api/users' && req.method === 'GET') {
    return json(res, 200, db.users.map(u => ({ id: u.id, name: u.name })));
  }

  // Tout le reste : authentifié
  const auth = (req.headers.authorization || '').replace(/^Bearer /, '');
  const me = verifyToken(auth);
  if (!me) return json(res, 401, { error: 'Non authentifié' });

  // ── Bookings ──
  if (pathname === '/api/bookings' && req.method === 'GET') {
    return json(res, 200, db.bookings);
  }
  if (pathname === '/api/bookings' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.date || !b.slot) return json(res, 400, { error: 'date et slot requis' });
    // Détection conflit : journée bloque tout, matin/aprem bloquent journée + eux-mêmes
    const dayB = db.bookings.filter(x => x.date === b.date && x.status !== 'annule');
    const conflict = dayB.some(x =>
      x.slot === b.slot ||
      x.slot === 'journee' && ['matin', 'apresmidi'].includes(b.slot) ||
      b.slot === 'journee' && ['matin', 'apresmidi'].includes(x.slot)
    );
    if (conflict && !b.force) return json(res, 409, { error: 'Créneau déjà réservé ce jour-là' });
    const booking = {
      id: 'b' + Date.now() + Math.random().toString(36).slice(2, 6),
      date: b.date, slot: b.slot, clientId: b.clientId || null,
      price: Number(b.price) || 0, status: b.status || 'confirme',
      notes: b.notes || '', isReward: !!b.isReward,
      createdBy: me.id, createdAt: Date.now(),
    };
    db.bookings.push(booking);
    // Si récompense fidélité utilisée
    if (booking.isReward && booking.clientId) {
      const c = db.clients.find(x => x.id === booking.clientId);
      if (c) c.rewardsUsed = (c.rewardsUsed || 0) + 1;
    }
    saveDb();
    return json(res, 201, booking);
  }
  const bMatch = pathname.match(/^\/api\/bookings\/([\w]+)$/);
  if (bMatch) {
    const b = db.bookings.find(x => x.id === bMatch[1]);
    if (!b) return json(res, 404, { error: 'Introuvable' });
    if (req.method === 'PUT') {
      const upd = await readBody(req);
      ['date', 'slot', 'clientId', 'price', 'status', 'notes'].forEach(k => {
        if (upd[k] !== undefined) b[k] = k === 'price' ? Number(upd[k]) : upd[k];
      });
      saveDb();
      return json(res, 200, b);
    }
    if (req.method === 'DELETE') {
      if (b.isReward && b.clientId) {
        const c = db.clients.find(x => x.id === b.clientId);
        if (c && c.rewardsUsed > 0) c.rewardsUsed--;
      }
      db.bookings = db.bookings.filter(x => x.id !== b.id);
      saveDb();
      return json(res, 200, { ok: true });
    }
  }

  // ── Clients ──
  if (pathname === '/api/clients' && req.method === 'GET') {
    return json(res, 200, db.clients.map(clientWithLoyalty));
  }
  if (pathname === '/api/clients' && req.method === 'POST') {
    const c = await readBody(req);
    if (!c.name) return json(res, 400, { error: 'Nom requis' });
    const client = {
      id: 'c' + Date.now() + Math.random().toString(36).slice(2, 6),
      name: c.name.trim(), phone: c.phone || '', email: c.email || '',
      notes: c.notes || '', referredBy: c.referredBy || null,
      rewardsUsed: 0, createdAt: Date.now(), createdBy: me.id,
    };
    db.clients.push(client);
    saveDb();
    return json(res, 201, clientWithLoyalty(client));
  }
  const cMatch = pathname.match(/^\/api\/clients\/([\w]+)$/);
  if (cMatch) {
    const c = db.clients.find(x => x.id === cMatch[1]);
    if (!c) return json(res, 404, { error: 'Introuvable' });
    if (req.method === 'PUT') {
      const upd = await readBody(req);
      ['name', 'phone', 'email', 'notes', 'referredBy'].forEach(k => {
        if (upd[k] !== undefined) c[k] = upd[k];
      });
      saveDb();
      return json(res, 200, clientWithLoyalty(c));
    }
    if (req.method === 'DELETE') {
      db.clients = db.clients.filter(x => x.id !== c.id);
      db.clients.forEach(x => { if (x.referredBy === c.id) x.referredBy = null; });
      db.bookings.forEach(b => { if (b.clientId === c.id) b.clientId = null; });
      saveDb();
      return json(res, 200, { ok: true });
    }
  }

  // ── Settings ──
  if (pathname === '/api/settings' && req.method === 'GET') {
    return json(res, 200, db.settings);
  }
  if (pathname === '/api/settings' && req.method === 'PUT') {
    const upd = await readBody(req);
    if (upd.tarifs) db.settings.tarifs = { ...db.settings.tarifs, ...upd.tarifs };
    if (upd.fideliteSeuil) db.settings.fideliteSeuil = Number(upd.fideliteSeuil);
    saveDb();
    return json(res, 200, db.settings);
  }

  // ── Changement PIN / nom ──
  if (pathname === '/api/me' && req.method === 'GET') {
    return json(res, 200, { id: me.id, name: me.name });
  }
  if (pathname === '/api/me' && req.method === 'PUT') {
    const { name, newPin, currentPin } = await readBody(req);
    if (name) me.name = String(name).trim().slice(0, 30);
    if (newPin) {
      if (hashPin(currentPin, me.salt) !== me.pinHash) {
        return json(res, 403, { error: 'PIN actuel incorrect' });
      }
      me.salt = crypto.randomBytes(8).toString('hex');
      me.pinHash = hashPin(newPin, me.salt);
    }
    saveDb();
    return json(res, 200, { id: me.id, name: me.name });
  }

  return json(res, 404, { error: 'Route inconnue' });
}

// ── Serveur ──────────────────────────────────────────────────────────────────
loadDb();
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://x').pathname;
  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch(e => {
      console.error(e);
      json(res, 500, { error: 'Erreur serveur' });
    });
  } else {
    serveStatic(req, res);
  }
}).listen(PORT, () => console.log(`MAZ Fishing server → http://localhost:${PORT}`));
