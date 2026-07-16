// ── MAZ Fishing — Module GESTION locative ────────────────────────────────────
// Board locations · Agenda · Clients · Fidélité — API serveur (server.js)

let gToken = localStorage.getItem('maz-token') || null;
let gUser = JSON.parse(localStorage.getItem('maz-user') || 'null');
let gClients = [], gBookings = [], gSettings = null, gUsers = [];
let gView = 'board';          // board | agenda | clients | settings
let gAgendaMonth = null;      // Date du 1er du mois affiché
let gClientDetail = null;     // id client en fiche

const SLOTS = {
  matin:     { label: 'Matin',       ico: '🌅', h: '9h–13h'  },
  apresmidi: { label: 'Après-midi',  ico: '☀️', h: '14h–18h' },
  journee:   { label: 'Journée',     ico: '📅', h: '9h–18h'  },
  soiree:    { label: 'Soirée',      ico: '🌙', h: '19h–23h' },
};
const STATUS = {
  confirme: { label: 'Confirmé', color: '#059669' },
  option:   { label: 'Option',   color: '#f59e0b' },
  fait:     { label: 'Terminé',  color: '#6360a0' },
  annule:   { label: 'Annulé',   color: '#f43f5e' },
};

// ── API ──────────────────────────────────────────────────────────────────────
function apiBase() { return localStorage.getItem('maz-api') || ''; }

async function api(path, opts = {}) {
  const res = await fetch(apiBase() + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(gToken ? { Authorization: 'Bearer ' + gToken } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && path !== '/api/login') { gLogout(false); throw new Error('Session expirée'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur ' + res.status);
  return data;
}

async function gRefresh() {
  [gClients, gBookings, gSettings] = await Promise.all([
    api('/api/clients'), api('/api/bookings'), api('/api/settings'),
  ]);
}

function gLogout(redraw = true) {
  gToken = null; gUser = null;
  localStorage.removeItem('maz-token');
  localStorage.removeItem('maz-user');
  if (redraw) renderGestion();
}

// ── Entrée ───────────────────────────────────────────────────────────────────
async function renderGestion() {
  const el = document.getElementById('gestion-root');
  if (!el) return;
  if (!gToken) return _gLogin(el);
  el.innerHTML = '<div class="met-loading">⏳ Chargement…</div>';
  try {
    await gRefresh();
    _gDraw(el);
  } catch (e) {
    if (!gToken) { _gLogin(el); return; }
    el.innerHTML = `<div style="padding:30px 20px;text-align:center">
      <div style="font-size:36px">📡</div>
      <div style="font-weight:800;font-size:16px;margin:8px 0">Serveur injoignable</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:14px">${e.message}</div>
      <button class="g-btn" onclick="renderGestion()">Réessayer</button>
      <button class="g-btn ghost" onclick="_gConfigApi()">⚙️ URL du serveur</button>
    </div>`;
  }
}

function _gConfigApi() {
  const cur = apiBase();
  const url = prompt('URL du serveur de gestion (vide = même domaine que l\'app)', cur);
  if (url === null) return;
  if (url.trim()) localStorage.setItem('maz-api', url.trim().replace(/\/$/, ''));
  else localStorage.removeItem('maz-api');
  renderGestion();
}

// ── Login ────────────────────────────────────────────────────────────────────
async function _gLogin(el) {
  el.innerHTML = '<div class="met-loading">⏳</div>';
  let users = [];
  try { users = await api('/api/users'); }
  catch {
    el.innerHTML = `<div style="padding:40px 20px;text-align:center">
      <div style="font-size:40px">🔌</div>
      <div style="font-weight:800;font-size:17px;margin:10px 0">Serveur non connecté</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:16px">
        Le module gestion nécessite le serveur (VPS Coolify).<br>
        Configure l'URL ou consulte README-DEPLOY.md.
      </div>
      <button class="g-btn" onclick="_gConfigApi()">⚙️ Configurer l'URL du serveur</button>
      <button class="g-btn ghost" onclick="renderGestion()">Réessayer</button>
    </div>`;
    return;
  }
  gUsers = users;
  el.innerHTML = `
    <div style="max-width:340px;margin:0 auto;padding:36px 20px;text-align:center">
      <div style="font-size:44px">⛵</div>
      <div style="font-size:20px;font-weight:900;margin:8px 0 2px">Gestion locative</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:22px">Qui es-tu ?</div>
      <div style="display:flex;gap:10px;justify-content:center;margin-bottom:18px">
        ${users.map(u => `
          <button class="g-user-btn" data-u="${u.id}" onclick="_gPickUser('${u.id}',this)">
            <span style="font-size:26px">👤</span><br>${u.name}
          </button>`).join('')}
      </div>
      <input id="g-pin" type="password" inputmode="numeric" maxlength="8" placeholder="Code PIN"
        style="width:160px;text-align:center;font-size:22px;letter-spacing:6px;background:var(--surf2);border:1.5px solid var(--surf3);border-radius:var(--r);padding:11px;outline:none"
        onkeydown="if(event.key==='Enter')_gDoLogin()">
      <div id="g-login-err" style="color:var(--red);font-size:12px;font-weight:600;min-height:18px;margin-top:8px"></div>
      <button class="g-btn" style="width:160px" onclick="_gDoLogin()">Connexion</button>
    </div>`;
}

let _gPickedUser = null;
function _gPickUser(id, btn) {
  _gPickedUser = id;
  document.querySelectorAll('.g-user-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('g-pin').focus();
}

async function _gDoLogin() {
  const pin = document.getElementById('g-pin').value;
  const err = document.getElementById('g-login-err');
  if (!_gPickedUser) { err.textContent = 'Choisis ton profil'; return; }
  if (!pin) { err.textContent = 'Entre ton PIN'; return; }
  try {
    const r = await api('/api/login', { method: 'POST', body: { userId: _gPickedUser, pin } });
    gToken = r.token; gUser = r.user;
    localStorage.setItem('maz-token', gToken);
    localStorage.setItem('maz-user', JSON.stringify(gUser));
    renderGestion();
  } catch (e) { err.textContent = e.message; }
}

// ── Layout principal ─────────────────────────────────────────────────────────
function _gDraw(el) {
  el.innerHTML = `
    <div class="g-topbar">
      <div class="g-tabs">
        <button class="g-tab ${gView==='board'?'on':''}"    onclick="gNav('board')">📊</button>
        <button class="g-tab ${gView==='agenda'?'on':''}"   onclick="gNav('agenda')">📅</button>
        <button class="g-tab ${gView==='clients'?'on':''}"  onclick="gNav('clients')">👥</button>
        <button class="g-tab ${gView==='settings'?'on':''}" onclick="gNav('settings')">⚙️</button>
      </div>
      <div style="font-size:11px;color:var(--text2);font-weight:700">👤 ${gUser?.name || ''}</div>
    </div>
    <div class="g-body" id="g-body"></div>`;
  const body = document.getElementById('g-body');
  if (gView === 'board')    body.innerHTML = _gBoard();
  if (gView === 'agenda')   body.innerHTML = _gAgenda();
  if (gView === 'clients')  body.innerHTML = gClientDetail ? _gClientDetail(gClientDetail) : _gClients();
  if (gView === 'settings') body.innerHTML = _gSettings();
}

function gNav(v) { gView = v; if (v !== 'clients') gClientDetail = null; _gDraw(document.getElementById('gestion-root')); }

// ── Utils ────────────────────────────────────────────────────────────────────
function euro(n) { return (Number(n) || 0).toLocaleString('fr-FR') + ' €'; }
function fdate(iso) {
  const d = new Date(iso + 'T12:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
function clientName(id) { return gClients.find(c => c.id === id)?.name || '—'; }
function todayIso() { return new Date().toISOString().split('T')[0]; }

// ── BOARD ────────────────────────────────────────────────────────────────────
function _gBoard() {
  const now = new Date();
  const moisIso = now.toISOString().slice(0, 7);
  const anneeIso = String(now.getFullYear());
  const active = gBookings.filter(b => b.status !== 'annule');
  const mois = active.filter(b => b.date.startsWith(moisIso));
  const annee = active.filter(b => b.date.startsWith(anneeIso));
  const caM = mois.reduce((s, b) => s + (b.price || 0), 0);
  const caA = annee.reduce((s, b) => s + (b.price || 0), 0);
  const today = todayIso();
  const upcoming = active.filter(b => b.date >= today && b.status !== 'fait')
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  const rewards = gClients.filter(c => c.rewardsAvailable > 0);

  return `
    <div class="g-stats">
      <div class="g-stat"><div class="g-stat-v">${euro(caM)}</div><div class="g-stat-l">CA ${now.toLocaleDateString('fr-FR',{month:'long'})}</div></div>
      <div class="g-stat"><div class="g-stat-v">${mois.length}</div><div class="g-stat-l">Sorties ce mois</div></div>
      <div class="g-stat"><div class="g-stat-v">${euro(caA)}</div><div class="g-stat-l">CA ${anneeIso}</div></div>
      <div class="g-stat"><div class="g-stat-v">${gClients.length}</div><div class="g-stat-l">Clients</div></div>
    </div>

    ${rewards.length ? `
    <div class="met-section">🎁 RÉCOMPENSES FIDÉLITÉ À OFFRIR</div>
    ${rewards.map(c => `
      <div class="g-card" style="border-left:4px solid var(--gold);cursor:pointer" onclick="gOpenClient('${c.id}')">
        <b>${c.name}</b> a parrainé ${c.referralCount} clients
        <div style="font-size:12px;color:var(--gold);font-weight:700">${c.rewardsAvailable} sortie(s) offerte(s) à programmer →</div>
      </div>`).join('')}` : ''}

    <div class="met-section">🗓 PROCHAINES LOCATIONS</div>
    ${upcoming.length ? upcoming.map(b => _gBookingCard(b)).join('')
      : '<div class="g-empty">Aucune location à venir.<br>Va dans 📅 Agenda pour en ajouter.</div>'}

    <button class="g-btn" style="width:100%;margin-top:10px" onclick="gView='agenda';gNav('agenda')">📅 Ouvrir l'agenda</button>`;
}

function _gBookingCard(b) {
  const s = SLOTS[b.slot] || SLOTS.journee;
  const st = STATUS[b.status] || STATUS.confirme;
  return `
    <div class="g-card" onclick="gEditBooking('${b.id}')" style="cursor:pointer">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <b>${fdate(b.date)}</b> · ${s.ico} ${s.label} <span style="color:var(--muted);font-size:11px">${s.h}</span>
          <div style="font-size:12.5px;color:var(--text2)">${b.clientId ? '👤 ' + clientName(b.clientId) : '—'}${b.isReward ? ' · 🎁 offert' : ''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800;color:var(--sea)">${b.isReward ? '🎁' : euro(b.price)}</div>
          <div style="font-size:10px;font-weight:700;color:${st.color}">${st.label.toUpperCase()}</div>
        </div>
      </div>
    </div>`;
}

// ── AGENDA ───────────────────────────────────────────────────────────────────
function _gAgenda() {
  if (!gAgendaMonth) { const n = new Date(); gAgendaMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
  const y = gAgendaMonth.getFullYear(), m = gAgendaMonth.getMonth();
  const monthLabel = gAgendaMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // lundi = 0
  const days = new Date(y, m + 1, 0).getDate();
  const today = todayIso();

  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += '<div></div>';
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayB = gBookings.filter(b => b.date === iso && b.status !== 'annule');
    const dots = dayB.slice(0, 3).map(b =>
      `<span class="g-dot" style="background:${STATUS[b.status]?.color || '#059669'}"></span>`).join('');
    cells += `
      <div class="g-day ${iso === today ? 'today' : ''} ${dayB.length ? 'has' : ''}" onclick="gOpenDay('${iso}')">
        <span>${d}</span><div class="g-dots">${dots}</div>
      </div>`;
  }

  return `
    <div class="g-month-nav">
      <button onclick="gMonthShift(-1)">‹</button>
      <b style="text-transform:capitalize">${monthLabel}</b>
      <button onclick="gMonthShift(1)">›</button>
    </div>
    <div class="g-cal-head">${['L','M','M','J','V','S','D'].map(d => `<div>${d}</div>`).join('')}</div>
    <div class="g-cal">${cells}</div>
    <div id="g-day-detail"></div>`;
}

function gMonthShift(n) {
  gAgendaMonth = new Date(gAgendaMonth.getFullYear(), gAgendaMonth.getMonth() + n, 1);
  _gDraw(document.getElementById('gestion-root'));
}

function gOpenDay(iso) {
  const el = document.getElementById('g-day-detail');
  const dayB = gBookings.filter(b => b.date === iso).sort((a, b) => a.slot.localeCompare(b.slot));
  el.innerHTML = `
    <div class="met-section" style="margin-top:14px">📅 ${fdate(iso).toUpperCase()}</div>
    ${dayB.length ? dayB.map(b => _gBookingCard(b)).join('') : '<div class="g-empty">Libre toute la journée</div>'}
    <button class="g-btn" style="width:100%" onclick="gNewBooking('${iso}')">＋ Ajouter une location</button>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Booking form (modal) ─────────────────────────────────────────────────────
function gNewBooking(iso) { _gBookingModal({ date: iso || todayIso(), slot: 'journee', status: 'confirme', price: null }); }
function gEditBooking(id) {
  const b = gBookings.find(x => x.id === id);
  if (b) _gBookingModal({ ...b, edit: true });
}

function _gBookingModal(b) {
  const t = gSettings?.tarifs || {};
  const clientOpts = gClients.slice().sort((a, c) => a.name.localeCompare(c.name))
    .map(c => `<option value="${c.id}" ${b.clientId === c.id ? 'selected' : ''}>${c.name}${c.rewardsAvailable > 0 ? ' 🎁' : ''}</option>`).join('');
  document.getElementById('g-modal').innerHTML = `
    <div class="g-modal-bg" onclick="if(event.target===this)gCloseModal()">
      <div class="g-modal">
        <div style="font-size:16px;font-weight:800;margin-bottom:12px">${b.edit ? '✏️ Modifier' : '＋ Nouvelle'} location</div>
        <label class="g-lbl">Date</label>
        <input id="gb-date" type="date" class="g-inp" value="${b.date}">
        <label class="g-lbl">Créneau</label>
        <div class="g-slot-row">
          ${Object.entries(SLOTS).map(([k, s]) => `
            <button class="g-slot ${b.slot === k ? 'on' : ''}" data-s="${k}" data-p="${t[k] ?? 0}"
              onclick="document.querySelectorAll('.g-slot').forEach(x=>x.classList.remove('on'));this.classList.add('on');document.getElementById('gb-price').value=this.dataset.p">
              ${s.ico}<br>${s.label}<br><span style="font-size:9px;opacity:.7">${s.h}</span>
            </button>`).join('')}
        </div>
        <label class="g-lbl">Client</label>
        <select id="gb-client" class="g-inp"><option value="">— Aucun —</option>${clientOpts}</select>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label class="g-lbl">Prix (€)</label>
            <input id="gb-price" type="number" class="g-inp" value="${b.price ?? (t[b.slot] ?? 0)}"></div>
          <div style="flex:1"><label class="g-lbl">Statut</label>
            <select id="gb-status" class="g-inp">
              ${Object.entries(STATUS).map(([k, s]) => `<option value="${k}" ${b.status === k ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select></div>
        </div>
        <label class="g-lbl" style="display:flex;align-items:center;gap:8px;margin-top:8px">
          <input id="gb-reward" type="checkbox" ${b.isReward ? 'checked' : ''} ${b.edit ? 'disabled' : ''}
            onchange="if(this.checked)document.getElementById('gb-price').value=0">
          🎁 Sortie offerte (récompense fidélité)
        </label>
        <label class="g-lbl">Notes</label>
        <input id="gb-notes" class="g-inp" value="${(b.notes || '').replace(/"/g, '&quot;')}" placeholder="Nb personnes, matériel…">
        <div id="gb-err" style="color:var(--red);font-size:12px;font-weight:600;min-height:16px"></div>
        <div style="display:flex;gap:8px;margin-top:6px">
          ${b.edit ? `<button class="g-btn danger" onclick="gDeleteBooking('${b.id}')">🗑</button>` : ''}
          <button class="g-btn ghost" style="flex:1" onclick="gCloseModal()">Annuler</button>
          <button class="g-btn" style="flex:2" onclick="gSaveBooking('${b.edit ? b.id : ''}')">Enregistrer ✓</button>
        </div>
      </div>
    </div>`;
}

function gCloseModal() { document.getElementById('g-modal').innerHTML = ''; }

async function gSaveBooking(id) {
  const body = {
    date: document.getElementById('gb-date').value,
    slot: document.querySelector('.g-slot.on')?.dataset.s || 'journee',
    clientId: document.getElementById('gb-client').value || null,
    price: document.getElementById('gb-price').value,
    status: document.getElementById('gb-status').value,
    notes: document.getElementById('gb-notes').value,
    isReward: document.getElementById('gb-reward').checked,
  };
  const err = document.getElementById('gb-err');
  try {
    if (id) await api('/api/bookings/' + id, { method: 'PUT', body });
    else await api('/api/bookings', { method: 'POST', body });
    gCloseModal();
    await gRefresh();
    _gDraw(document.getElementById('gestion-root'));
    toast(id ? 'Location modifiée' : 'Location ajoutée ✓');
  } catch (e) { err.textContent = e.message; }
}

async function gDeleteBooking(id) {
  if (!confirm('Supprimer cette location ?')) return;
  await api('/api/bookings/' + id, { method: 'DELETE' });
  gCloseModal();
  await gRefresh();
  _gDraw(document.getElementById('gestion-root'));
  toast('Location supprimée');
}

// ── CLIENTS ──────────────────────────────────────────────────────────────────
function _gClients() {
  const q = (window._gClientQ || '').toLowerCase();
  const list = gClients.filter(c => !q || c.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const seuil = gSettings?.fideliteSeuil || 5;
  return `
    <input class="g-inp" placeholder="🔍 Chercher un client…" value="${window._gClientQ || ''}"
      oninput="window._gClientQ=this.value;gNav('clients')" style="margin-bottom:10px">
    <button class="g-btn" style="width:100%;margin-bottom:12px" onclick="gNewClient()">＋ Nouveau client</button>
    ${list.map(c => `
      <div class="g-card" style="cursor:pointer" onclick="gOpenClient('${c.id}')">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <b>${c.name}</b> ${c.rewardsAvailable > 0 ? '🎁' : ''}
            <div style="font-size:12px;color:var(--text2)">${c.phone || c.email || ''}</div>
          </div>
          <div style="text-align:right;font-size:11px;color:var(--text2)">
            ${c.bookingsCount} sortie(s)<br>
            ${c.referralCount ? `⭐ ${c.referralCount}/${seuil} parrainages` : ''}
          </div>
        </div>
      </div>`).join('') || '<div class="g-empty">Aucun client</div>'}`;
}

function gOpenClient(id) { gView = 'clients'; gClientDetail = id; _gDraw(document.getElementById('gestion-root')); }

function _gClientDetail(id) {
  const c = gClients.find(x => x.id === id);
  if (!c) { gClientDetail = null; return _gClients(); }
  const seuil = gSettings?.fideliteSeuil || 5;
  const filleuls = gClients.filter(x => x.referredBy === c.id);
  const hist = gBookings.filter(b => b.clientId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const parrain = c.referredBy ? gClients.find(x => x.id === c.referredBy) : null;
  const prog = c.referralCount % seuil;
  const pct = c.rewardsAvailable > 0 ? 100 : Math.round(prog / seuil * 100);

  return `
    <button class="wiki-back" onclick="gClientDetail=null;gNav('clients')">← Clients</button>
    <div class="g-card">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <div style="font-size:19px;font-weight:900">${c.name}</div>
          ${c.phone ? `<div style="font-size:13px">📞 <a href="tel:${c.phone}">${c.phone}</a></div>` : ''}
          ${c.email ? `<div style="font-size:13px">✉️ ${c.email}</div>` : ''}
          ${parrain ? `<div style="font-size:12px;color:var(--text2)">Parrainé par ${parrain.name}</div>` : ''}
          ${c.notes ? `<div style="font-size:12px;color:var(--text2);margin-top:4px">📝 ${c.notes}</div>` : ''}
        </div>
        <button class="g-btn ghost" style="padding:6px 10px" onclick="gEditClient('${c.id}')">✏️</button>
      </div>
    </div>

    <div class="met-section">⭐ FIDÉLITÉ — PARRAINAGES</div>
    <div class="g-card">
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:6px">
        <span>${c.referralCount} client(s) amené(s)</span>
        <span style="color:var(--gold)">${c.rewardsAvailable} 🎁 dispo</span>
      </div>
      <div style="background:var(--surf2);border-radius:10px;height:10px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--gold),#f97316);border-radius:10px"></div>
      </div>
      <div style="font-size:11px;color:var(--text2);margin-top:4px">
        ${c.rewardsAvailable > 0 ? 'Récompense disponible !' : `Encore ${seuil - prog} parrainage(s) avant la prochaine sortie offerte`}
      </div>
      ${c.rewardsAvailable > 0 ? `
        <button class="g-btn gold" style="width:100%;margin-top:10px" onclick="gUseReward('${c.id}')">
          🎁 Offrir une demi-journée / soirée
        </button>` : ''}
      ${filleuls.length ? `
        <div style="font-size:11px;font-weight:700;color:var(--text2);margin-top:10px">FILLEULS</div>
        ${filleuls.map(f => `<div style="font-size:13px;padding:3px 0;cursor:pointer" onclick="gOpenClient('${f.id}')">→ ${f.name}</div>`).join('')}` : ''}
    </div>

    <div class="met-section">🗓 HISTORIQUE (${hist.length})</div>
    ${hist.map(b => _gBookingCard(b)).join('') || '<div class="g-empty">Aucune sortie</div>'}
    <button class="g-btn" style="width:100%;margin-top:8px" onclick="_gBookingModal({date:todayIso(),slot:'journee',status:'confirme',price:null,clientId:'${c.id}'})">＋ Nouvelle sortie pour ${c.name}</button>
    <button class="g-btn danger ghost" style="width:100%;margin-top:8px" onclick="gDeleteClient('${c.id}')">Supprimer ce client</button>`;
}

function gUseReward(clientId) {
  _gBookingModal({ date: todayIso(), slot: 'soiree', status: 'confirme', price: 0, clientId, isReward: true });
  setTimeout(() => { const cb = document.getElementById('gb-reward'); if (cb) cb.checked = true; }, 50);
}

function gNewClient() { _gClientModal({}); }
function gEditClient(id) {
  const c = gClients.find(x => x.id === id);
  if (c) _gClientModal({ ...c, edit: true });
}

function _gClientModal(c) {
  const parrainOpts = gClients.filter(x => x.id !== c.id)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(x => `<option value="${x.id}" ${c.referredBy === x.id ? 'selected' : ''}>${x.name}</option>`).join('');
  document.getElementById('g-modal').innerHTML = `
    <div class="g-modal-bg" onclick="if(event.target===this)gCloseModal()">
      <div class="g-modal">
        <div style="font-size:16px;font-weight:800;margin-bottom:12px">${c.edit ? '✏️ Modifier' : '＋ Nouveau'} client</div>
        <label class="g-lbl">Nom *</label>
        <input id="gc-name" class="g-inp" value="${(c.name || '').replace(/"/g, '&quot;')}" placeholder="Prénom Nom">
        <label class="g-lbl">Téléphone</label>
        <input id="gc-phone" type="tel" class="g-inp" value="${c.phone || ''}">
        <label class="g-lbl">Email</label>
        <input id="gc-email" type="email" class="g-inp" value="${c.email || ''}">
        <label class="g-lbl">Parrainé par</label>
        <select id="gc-ref" class="g-inp"><option value="">— Personne —</option>${parrainOpts}</select>
        <label class="g-lbl">Notes</label>
        <input id="gc-notes" class="g-inp" value="${(c.notes || '').replace(/"/g, '&quot;')}">
        <div id="gc-err" style="color:var(--red);font-size:12px;font-weight:600;min-height:16px"></div>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button class="g-btn ghost" style="flex:1" onclick="gCloseModal()">Annuler</button>
          <button class="g-btn" style="flex:2" onclick="gSaveClient('${c.edit ? c.id : ''}')">Enregistrer ✓</button>
        </div>
      </div>
    </div>`;
}

async function gSaveClient(id) {
  const body = {
    name: document.getElementById('gc-name').value.trim(),
    phone: document.getElementById('gc-phone').value.trim(),
    email: document.getElementById('gc-email').value.trim(),
    referredBy: document.getElementById('gc-ref').value || null,
    notes: document.getElementById('gc-notes').value.trim(),
  };
  const err = document.getElementById('gc-err');
  if (!body.name) { err.textContent = 'Le nom est requis'; return; }
  try {
    if (id) await api('/api/clients/' + id, { method: 'PUT', body });
    else await api('/api/clients', { method: 'POST', body });
    gCloseModal();
    await gRefresh();
    _gDraw(document.getElementById('gestion-root'));
    toast(id ? 'Client modifié' : 'Client ajouté ✓');
  } catch (e) { err.textContent = e.message; }
}

async function gDeleteClient(id) {
  if (!confirm('Supprimer ce client ? (ses locations sont conservées, anonymisées)')) return;
  await api('/api/clients/' + id, { method: 'DELETE' });
  gClientDetail = null;
  await gRefresh();
  _gDraw(document.getElementById('gestion-root'));
  toast('Client supprimé');
}

// ── SETTINGS ─────────────────────────────────────────────────────────────────
function _gSettings() {
  const t = gSettings?.tarifs || {};
  return `
    <div class="met-section">💶 TARIFS</div>
    <div class="g-card">
      ${Object.entries(SLOTS).map(([k, s]) => `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="flex:1;font-size:14px">${s.ico} ${s.label} <span style="color:var(--muted);font-size:11px">${s.h}</span></span>
          <input id="gt-${k}" type="number" class="g-inp" style="width:90px;margin:0" value="${t[k] ?? 0}"> €
        </div>`).join('')}
      <div style="display:flex;align-items:center;gap:10px;margin:14px 0 8px">
        <span style="flex:1;font-size:14px">⭐ Parrainages pour 1 récompense</span>
        <input id="gt-seuil" type="number" class="g-inp" style="width:90px;margin:0" value="${gSettings?.fideliteSeuil || 5}">
      </div>
      <button class="g-btn" style="width:100%" onclick="gSaveSettings()">Enregistrer les tarifs ✓</button>
    </div>

    <div class="met-section">🔐 MON COMPTE — ${gUser?.name}</div>
    <div class="g-card">
      <label class="g-lbl">PIN actuel</label>
      <input id="gs-curpin" type="password" inputmode="numeric" class="g-inp">
      <label class="g-lbl">Nouveau PIN</label>
      <input id="gs-newpin" type="password" inputmode="numeric" class="g-inp">
      <div id="gs-err" style="font-size:12px;font-weight:600;min-height:16px"></div>
      <button class="g-btn" style="width:100%" onclick="gChangePin()">Changer mon PIN</button>
    </div>

    <div class="g-card">
      <button class="g-btn ghost" style="width:100%" onclick="_gConfigApi()">⚙️ URL du serveur (${apiBase() || 'même domaine'})</button>
      <button class="g-btn danger ghost" style="width:100%;margin-top:8px" onclick="gLogout()">Se déconnecter</button>
    </div>`;
}

async function gSaveSettings() {
  const tarifs = {};
  Object.keys(SLOTS).forEach(k => tarifs[k] = Number(document.getElementById('gt-' + k).value) || 0);
  await api('/api/settings', { method: 'PUT', body: { tarifs, fideliteSeuil: document.getElementById('gt-seuil').value } });
  await gRefresh();
  toast('Tarifs enregistrés ✓');
}

async function gChangePin() {
  const err = document.getElementById('gs-err');
  try {
    await api('/api/me', { method: 'PUT', body: {
      currentPin: document.getElementById('gs-curpin').value,
      newPin: document.getElementById('gs-newpin').value,
    }});
    err.style.color = 'var(--green)'; err.textContent = 'PIN changé ✓';
    document.getElementById('gs-curpin').value = document.getElementById('gs-newpin').value = '';
  } catch (e) { err.style.color = 'var(--red)'; err.textContent = e.message; }
}
