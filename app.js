// ── Épaves DK — App ────────────────────────────────────────────────────────

let map, cluster, userMarker, userCircle, watchId;
let userLat = null, userLng = null;
let activeWreck = null;
let currentSort = 'name';
let currentQF   = 'all';
let mapCatFilter = null;
let mapDistFilter = 999;

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  buildCatChips();
  renderList();
  renderSpots();
  renderPeches();
  document.getElementById('sf-date').value = new Date().toISOString().split('T')[0];
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});

// ── Map ─────────────────────────────────────────────────────────────────────
function initMap() {
  map = L.map('leaflet-map', {
    center: DK_CENTER, zoom: DK_ZOOM,
    zoomControl: true, attributionControl: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OSM'
  }).addTo(map);

  L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
    maxZoom: 18, opacity: 0.75
  }).addTo(map);

  L.control.attribution({ prefix: '© OSM · OpenSeaMap · dkepaves.free.fr' }).addTo(map);

  cluster = L.markerClusterGroup({
    maxClusterRadius: 40,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
  });

  plotAll();
  map.addLayer(cluster);
}

function catColor(cat) { return (CAT[cat] || CAT.autre).color; }
function catEmoji(cat) { return (CAT[cat] || CAT.autre).emoji; }

function markerIcon(w) {
  const c = w.visible_low_tide ? '#fbbf24' : catColor(w.category);
  const s = w.depth_max && w.depth_max > 30 ? 13 : 11;
  return L.divIcon({
    className: '',
    html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${c};border:2.5px solid rgba(255,255,255,.85);box-shadow:0 2px 8px rgba(0,0,0,.6);cursor:pointer"></div>`,
    iconSize: [s, s], iconAnchor: [s/2, s/2]
  });
}

function depthStr(w) {
  if (w.visible_low_tide) return '<span style="color:#fbbf24">Marée basse</span>';
  if (!w.depth_max) return '<span style="color:#64748b">Prof. inconnue</span>';
  return `<span style="color:#00c2e0">${w.depth_max} m</span>`;
}

function plotAll(list) {
  cluster.clearLayers();
  const src = list || getFilteredMap();
  src.forEach(w => {
    const m = L.marker([w.lat, w.lng], { icon: markerIcon(w) });
    m.bindPopup(`
      <div class="pname">${w.name}</div>
      <div class="psub">${(CAT[w.category]||CAT.autre).label}${w.sunk_year ? ' · ' + w.sunk_year : ''}</div>
      <div class="pdepth">${depthStr(w)}</div>
      <button class="pbtn" onclick="openModal(${w.id})">Voir la fiche ›</button>
    `, { maxWidth: 200, closeButton: false });
    cluster.addLayer(m);
  });
  document.getElementById('mbadge').textContent = src.length;
}

function getFilteredMap() {
  const q = (document.getElementById('msearch')?.value || '').toLowerCase();
  return WRECKS.filter(w => {
    if (q && !w.name.toLowerCase().includes(q)) return false;
    if (mapCatFilter && w.category !== mapCatFilter) return false;
    if (w.dist_port_nm > mapDistFilter) return false;
    return true;
  });
}

function mapSearch() {
  plotAll();
  document.getElementById('map-filters').classList.remove('open');
}

function toggleMapF() {
  document.getElementById('map-filters').classList.toggle('open');
}

function buildCatChips() {
  const wrap = document.getElementById('cat-chips');
  wrap.innerHTML = `<span class="chip on" data-c="" onclick="setCatF(this)">Toutes</span>`;
  Object.entries(CAT).forEach(([k, v]) => {
    const count = WRECKS.filter(w => w.category === k).length;
    if (!count) return;
    wrap.innerHTML += `<span class="chip cat-chip" data-c="${k}" onclick="setCatF(this)">${v.emoji} ${v.label} (${count})</span>`;
  });
}

function setCatF(el) {
  document.querySelectorAll('#cat-chips .chip').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  mapCatFilter = el.dataset.c || null;
  plotAll();
}

function setDistF(el) {
  document.querySelectorAll('#dist-chips .chip').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  mapDistFilter = parseInt(el.dataset.d);
  plotAll();
}

// ── GPS ─────────────────────────────────────────────────────────────────────
function toggleGPS() { watchId ? stopGPS() : startGPS(); }

function startGPS() {
  if (!navigator.geolocation) { toast('GPS non disponible'); return; }
  const btn = document.getElementById('gps-btn');
  document.getElementById('gps-lbl').textContent = '…';
  watchId = navigator.geolocation.watchPosition(
    pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      updateMeDot();
      document.getElementById('gps-lbl').textContent = 'Actif';
      btn.classList.add('on');
      document.getElementById('sort-gps').style.display = '';
      renderList();
    },
    () => {
      document.getElementById('gps-lbl').textContent = 'GPS';
      btn.classList.remove('on');
      watchId = null;
      toast('GPS non disponible ou refusé');
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

function stopGPS() {
  navigator.geolocation.clearWatch(watchId); watchId = null;
  userLat = userLng = null;
  if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
  if (userCircle) { map.removeLayer(userCircle); userCircle = null; }
  document.getElementById('gps-lbl').textContent = 'GPS';
  document.getElementById('gps-btn').classList.remove('on');
  document.getElementById('sort-gps').style.display = 'none';
  renderList();
}

function updateMeDot() {
  const ico = L.divIcon({ className: '', html: '<div class="medot" style="background:#1c00fe;border:3px solid #fff;box-shadow:0 0 0 5px rgba(28,0,254,.25)"></div>', iconSize: [16,16], iconAnchor: [8,8] });
  if (userMarker) userMarker.setLatLng([userLat, userLng]);
  else { userMarker = L.marker([userLat, userLng], { icon: ico, zIndexOffset: 9999 }).addTo(map); userMarker.bindPopup('<b>Vous êtes ici</b>'); }
  if (userCircle) userCircle.setLatLng([userLat, userLng]);
  else userCircle = L.circle([userLat, userLng], { radius: 300, color: '#1c00fe', fillColor: '#1c00fe', fillOpacity: 0.08, weight: 1 }).addTo(map);
}

function centerMe() {
  if (!userLat) { startGPS(); toast('Activation GPS…'); return; }
  map.flyTo([userLat, userLng], 13, { duration: 1.2 });
}

function distToUser(w) {
  if (!userLat || !w.lat) return null;
  return haversineKm({ lat: userLat, lng: userLng }, w);
}

function fmtKm(km) {
  const nm = km / 1.852;
  if (nm < 0.3) return Math.round(km * 1000) + ' m';
  if (nm < 10)  return nm.toFixed(1) + ' nm';
  return Math.round(nm) + ' nm';
}

// ── Panels ───────────────────────────────────────────────────────────────────
function showP(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('on'));
  document.getElementById('p-' + id).classList.add('on');
  document.getElementById('nt-' + id).classList.add('on');
  if (id === 'map') setTimeout(() => map.invalidateSize(), 60);
  if (id === 'spots') renderSpots();
  if (id === 'peches') renderPeches();
  document.getElementById('map-filters').classList.remove('open');
}

// ── List ─────────────────────────────────────────────────────────────────────
function setSort(el) {
  document.querySelectorAll('.sbtn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  currentSort = el.dataset.s;
  renderList();
}

function setQF(el) {
  document.querySelectorAll('.qf').forEach(e => e.classList.remove('on'));
  el.classList.add('on');
  currentQF = el.dataset.q;
  renderList();
}

function getListFiltered() {
  const q = (document.getElementById('lsearch')?.value || '').toLowerCase();
  return WRECKS.filter(w => {
    if (q && !w.name.toLowerCase().includes(q) && !(w.note||'').toLowerCase().includes(q)) return false;
    switch (currentQF) {
      case 'lowtide': return w.visible_low_tide;
      case 'dynamo':  return w.op_dynamo;
      case 'shallow': return w.depth_max && w.depth_max <= 15;
      case 'deep':    return w.depth_max && w.depth_max >= 30;
      case 'near':    return w.dist_port_nm <= 10;
      case 'chalk':   return w.category === 'chalk';
      case 'sub':     return w.category === 'sub';
      default:        return true;
    }
  });
}

function renderList() {
  let list = getListFiltered();
  if (currentSort === 'name')  list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  if (currentSort === 'depth') list.sort((a, b) => (a.depth_max || 999) - (b.depth_max || 999));
  if (currentSort === 'port')  list.sort((a, b) => a.dist_port_nm - b.dist_port_nm);
  if (currentSort === 'dist') {
    list.sort((a, b) => {
      const da = distToUser(a), db = distToUser(b);
      if (da == null && db == null) return 0;
      if (da == null) return 1; if (db == null) return -1;
      return da - db;
    });
  }
  const el = document.getElementById('wlist');
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">🔍</div><p>Aucune épave trouvée</p></div>`;
    return;
  }
  el.innerHTML = list.map(cardHTML).join('');
}

function cardHTML(w) {
  const c = catColor(w.category);
  const ico = catEmoji(w.category);
  const dTxt = w.visible_low_tide ? 'Marée basse' : (w.depth_max ? w.depth_max + ' m' : '?');
  const dColor = w.visible_low_tide ? 'var(--gold)' : (!w.depth_max ? 'var(--muted)' : 'var(--sea)');
  const distUser = distToUser(w);
  const yearTag  = w.sunk_year ? `<span class="tag ty">${w.sunk_year}</span>` : '';
  const portTag  = `<span class="tag ts">${w.dist_port_nm} nm</span>`;
  const dynTag   = w.op_dynamo ? `<span class="tag td">Dynamo</span>` : '';
  const tideTag  = w.visible_low_tide ? `<span class="tag tl">🏖 Marée basse</span>` : '';
  return `
  <div class="wc" style="--acc:${c}" onclick="openModal(${w.id})">
    <div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:${c};border-radius:3px 0 0 3px"></div>
    <div class="wc-top">
      <div class="wc-ico" style="background:${c}20">${ico}</div>
      <div class="wc-info">
        <div class="wc-name">${w.name}</div>
        <div class="wc-sub">${(CAT[w.category]||CAT.autre).label}</div>
      </div>
      <div class="wc-r">
        <span class="dpill" style="background:${dColor}18;color:${dColor}">${dTxt}</span>
        ${distUser != null ? `<span style="font-size:11px;color:var(--green);font-weight:600">${fmtKm(distUser)}</span>` : ''}
      </div>
    </div>
    <div class="wmeta">${yearTag}${dynTag}${tideTag}${portTag}</div>
    <div class="wgps">${w.gps_raw}</div>
  </div>`;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(id) {
  const w = WRECKS.find(x => x.id === id);
  if (!w) return;
  activeWreck = w;
  const c = catColor(w.category);

  document.getElementById('m-ico').style.cssText = `background:${c}20`;
  document.getElementById('m-ico').textContent = catEmoji(w.category);
  document.getElementById('m-name').textContent = w.name;
  document.getElementById('m-type').textContent = (CAT[w.category]||CAT.autre).label + (w.op_dynamo ? ' · Opération Dynamo 1940' : '');

  const tags = [];
  if (w.sunk_year)        tags.push(`<span class="tag ty">${w.sunk_year}</span>`);
  if (w.op_dynamo)        tags.push(`<span class="tag td">⚔️ Dynamo</span>`);
  if (w.visible_low_tide) tags.push(`<span class="tag tl">🏖 Visible marée basse</span>`);
  document.getElementById('m-tags').innerHTML = tags.join('');

  const dTxt = w.visible_low_tide ? 'Marée basse' : (w.depth_max ? w.depth_max + ' m' : '—');
  document.getElementById('m-depth').textContent = dTxt;
  document.getElementById('m-year').textContent = w.sunk_year || '—';
  document.getElementById('m-port').textContent = w.dist_port_nm + ' nm';
  const du = distToUser(w);
  document.getElementById('m-dist').textContent = du != null ? fmtKm(du) : 'GPS requis';

  document.getElementById('m-gps').textContent = w.gps_raw;

  const nw = document.getElementById('m-note-wrap');
  if (w.note) { document.getElementById('m-note').textContent = w.note; nw.style.display = ''; }
  else nw.style.display = 'none';

  // Espèces — cartes enrichies avec emoji + meilleure saison
  document.getElementById('m-sp').innerHTML = '<div class="fish-grid">' +
    (w.species.length ? w.species.map(s => {
      // species stockées comme "Bar 🐟" — extraire nom et emoji
      const dbKey = Object.keys(FISH_DB).find(k => s.includes(k)) || '';
      const f = FISH_DB[dbKey] || { emoji: '🐟', best: '' };
      const parts = s.split(' ');
      const emo = parts.length > 1 ? parts[parts.length - 1] : f.emoji;
      const name = dbKey || s;
      return `<div class="fish-card">
        <span class="fish-emo">${emo}</span>
        <div class="fish-info">
          <div class="fish-name">${name}</div>
          ${f.best ? `<div class="fish-best">📅 ${f.best}</div>` : ''}
        </div>
      </div>`;
    }).join('') : '<p style="color:var(--muted);font-size:13px;padding:4px 8px">Données espèces non disponibles</p>') +
  '</div>';

  // Techniques — liste numérotée + conseil + saison
  const tip = getTechniques(w);
  const t   = TECHNIQUES[w.category] || TECHNIQUES.autre;
  document.getElementById('m-techs').innerHTML =
    '<div class="tech-cards">' +
      tip.techs.map((tech, i) => `
        <div class="tech-card">
          <span class="tech-num">${i + 1}</span>
          <span class="tech-name">${tech}</span>
        </div>`).join('') +
    '</div>' +
    `<div class="tech-tip-box"><p>💡 ${tip.note}</p></div>` +
    `<div class="season-pill">🗓 ${t.saison.replace(/^🗓\s*/, '')}</div>`;

  // Catches history
  updateModalCatches(w.id);

  document.getElementById('mbg').classList.add('open');

  if (document.getElementById('p-map').classList.contains('on')) {
    map.flyTo([w.lat, w.lng], 13, { duration: 1 });
  }
}

function updateModalCatches(wreckId) {
  const sessions = getSessions().filter(s => s.wreckId === wreckId);
  const el = document.getElementById('m-catches');
  if (!sessions.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:4px 0">Aucune prise enregistrée ici. Enregistre ta prochaine session !</p>';
    return;
  }
  const allCatches = sessions.flatMap(s => s.catches);
  const bySpecies = {};
  allCatches.forEach(c => {
    if (!bySpecies[c.species]) bySpecies[c.species] = { count: 0, maxW: 0, maxS: 0 };
    bySpecies[c.species].count++;
    if (c.weight > bySpecies[c.species].maxW) bySpecies[c.species].maxW = c.weight;
    if (c.size   > bySpecies[c.species].maxS) bySpecies[c.species].maxS = c.size;
  });
  el.innerHTML = `
    <p style="font-size:11px;color:var(--muted);margin-bottom:8px">${sessions.length} session${sessions.length>1?'s':''} · ${allCatches.length} prise${allCatches.length>1?'s':''}</p>
    ${Object.entries(bySpecies).sort((a,b) => b[1].count - a[1].count).map(([sp, d]) => `
      <div class="catch-stat">
        <span class="catch-sp">${sp}</span>
        <span class="catch-n">×${d.count}</span>
        ${d.maxW ? `<span class="catch-rec">🏆 ${d.maxW} kg</span>` : ''}
        ${d.maxS ? `<span class="catch-rec">${d.maxS} cm</span>` : ''}
      </div>`).join('')}`;
}

function closeMBG(e) { if (e.target === document.getElementById('mbg')) closeModal(); }
function closeModal() { document.getElementById('mbg').classList.remove('open'); }

function copyGPS() {
  if (!activeWreck) return;
  navigator.clipboard.writeText(activeWreck.gps_raw)
    .then(() => toast('GPS copié ✓'))
    .catch(() => toast(activeWreck.gps_raw));
}

function navToWreck() {
  if (!activeWreck) return;
  window.open(`https://maps.google.com/?q=${activeWreck.lat},${activeWreck.lng}`, '_blank');
}

function saveWreck() {
  if (!activeWreck) return;
  const spots = getSpots();
  const key = 'epave-' + activeWreck.id;
  if (spots.find(s => s.id === key)) { toast(activeWreck.name + ' déjà sauvegardé'); return; }
  spots.push({
    id: key, name: activeWreck.name, lat: activeWreck.lat, lng: activeWreck.lng,
    gps: activeWreck.gps_raw, note: (CAT[activeWreck.category]||CAT.autre).label + (activeWreck.depth_max ? ' · ' + activeWreck.depth_max + 'm' : ''),
    ts: Date.now()
  });
  saveSpots(spots);
  toast(activeWreck.name + ' sauvegardé ✓');
  closeModal();
}

function openSFFromModal() {
  const w = activeWreck;
  closeModal();
  openSF(w ? w.id : null);
}

// ── Spots ─────────────────────────────────────────────────────────────────────
function getSpots() {
  try { return JSON.parse(localStorage.getItem('dkepaves_spots') || '[]'); } catch { return []; }
}
function saveSpots(s) { localStorage.setItem('dkepaves_spots', JSON.stringify(s)); }

function addMySpot() {
  if (!userLat) { startGPS(); toast('Active le GPS puis réessaie'); return; }
  const name = prompt('Nom du spot :', 'Spot ' + new Date().toLocaleDateString('fr-FR'));
  if (!name) return;
  const gps = toDDM(userLat, 'lat') + ' / ' + toDDM(userLng, 'lng');
  const spots = getSpots();
  spots.push({ id: 'custom-' + Date.now(), name, lat: userLat, lng: userLng, gps, note: 'Point personnel', ts: Date.now() });
  saveSpots(spots);
  renderSpots();
  toast('"' + name + '" enregistré ✓');
}

function delSpot(id) {
  saveSpots(getSpots().filter(s => s.id !== id));
  renderSpots();
  toast('Spot supprimé');
}

function renderSpots() {
  const spots = getSpots().sort((a, b) => b.ts - a.ts);
  const el = document.getElementById('slist');
  if (!spots.length) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">📍</div><p>Aucun spot sauvegardé</p><p style="font-size:12px;margin-top:8px">Active le GPS et enregistre ta position,<br>ou sauvegarde une épave depuis sa fiche.</p></div>`;
    return;
  }
  el.innerHTML = spots.map(s => `
    <div class="sc">
      <div class="sc-ico">${s.id.startsWith('epave-') ? '⚓' : '📍'}</div>
      <div class="sc-info">
        <div class="sc-name">${s.name}</div>
        <div class="sc-gps">${s.gps || (s.lat?.toFixed(5) + ', ' + s.lng?.toFixed(5))}</div>
        <div style="font-size:11px;color:var(--text2)">${s.note || ''}</div>
      </div>
      <button class="sc-del" onclick="delSpot('${s.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6m4-6v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    </div>`).join('');
}

// ── Sessions pêche ─────────────────────────────────────────────────────────
function getSessions() {
  try { return JSON.parse(localStorage.getItem('dkepaves_sessions') || '[]'); } catch { return []; }
}
function saveSessions(s) { localStorage.setItem('dkepaves_sessions', JSON.stringify(s)); }

let _sfWreckId = null;
let _catchCtr  = 0;

function openSF(wreckId = null) {
  _sfWreckId = wreckId;
  _catchCtr  = 0;
  document.getElementById('sf-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('sf-wind').value = '';
  document.getElementById('sf-note').value = '';
  document.getElementById('sf-catches').innerHTML = '';
  document.getElementById('sf-wreck-q').value = '';
  document.getElementById('sf-wreck-drop').innerHTML = '';
  document.querySelectorAll('#sf-tide .sfp, #sf-sea .sfp').forEach(p => p.classList.remove('on'));

  const selEl = document.getElementById('sf-wreck-sel');
  if (wreckId) {
    const w = WRECKS.find(x => x.id === wreckId);
    if (w) { _renderSFSel(w); }
  } else {
    selEl.style.display = 'none';
    selEl.innerHTML = '';
  }

  document.getElementById('sfbg').classList.add('open');
}

function _renderSFSel(w) {
  const selEl = document.getElementById('sf-wreck-sel');
  selEl.style.display = '';
  selEl.innerHTML = `
    <div class="sf-sel" style="margin-top:6px">
      <span>${catEmoji(w.category)} ${w.name} <span style="font-size:11px;color:var(--muted);font-weight:400">${w.dist_port_nm} nm · ${(CAT[w.category]||CAT.autre).label}</span></span>
      <button onclick="clearSFWreck()">✕</button>
    </div>`;
  document.getElementById('sf-wreck-q').style.display = 'none';
}

function clearSFWreck() {
  _sfWreckId = null;
  document.getElementById('sf-wreck-sel').style.display = 'none';
  document.getElementById('sf-wreck-sel').innerHTML = '';
  document.getElementById('sf-wreck-q').style.display = '';
  document.getElementById('sf-wreck-q').value = '';
  document.getElementById('sf-wreck-drop').innerHTML = '';
}

function filterSFWrecks() {
  const q = document.getElementById('sf-wreck-q').value.toLowerCase().trim();
  const drop = document.getElementById('sf-wreck-drop');
  if (!q || q.length < 2) { drop.innerHTML = ''; return; }
  const matches = WRECKS.filter(w => w.name.toLowerCase().includes(q)).slice(0, 8);
  drop.innerHTML = matches.map(w =>
    `<div class="sf-drop-item" onclick="selectSFWreck(${w.id})">
       <span>${catEmoji(w.category)} ${w.name}</span>
       <span style="color:var(--muted);font-size:11px">${w.dist_port_nm} nm</span>
     </div>`
  ).join('');
}

function selectSFWreck(id) {
  const w = WRECKS.find(x => x.id === id);
  if (!w) return;
  _sfWreckId = w.id;
  document.getElementById('sf-wreck-drop').innerHTML = '';
  _renderSFSel(w);
}

function setSFPill(el, group) {
  const wasOn = el.classList.contains('on');
  document.querySelectorAll(`#sf-${group} .sfp`).forEach(p => p.classList.remove('on'));
  if (!wasOn) el.classList.add('on');
}

function addCatchRow(speciesHint = '') {
  _catchCtr++;
  const div = document.createElement('div');
  div.className = 'catch-row';
  div.innerHTML = `
    <div class="cr-top">
      <input list="fish-list" class="cr-inp cr-species" placeholder="Espèce (Bar, Lieu jaune…)" value="${speciesHint}">
      <button class="cr-kept" onclick="toggleKept(this)">🎣 Gardé</button>
      <button class="cr-del" onclick="this.closest('.catch-row').remove()">✕</button>
    </div>
    <div class="cr-bot">
      <input type="number" step="0.01" class="cr-inp cr-weight" placeholder="kg">
      <input type="number" class="cr-inp cr-size" placeholder="cm">
      <input list="tech-list" class="cr-inp cr-tech" placeholder="Technique">
    </div>`;
  document.getElementById('sf-catches').appendChild(div);
  div.querySelector('.cr-species').focus();
}

function toggleKept(btn) {
  const on = btn.classList.toggle('released');
  btn.textContent = on ? '↩️ Relâché' : '🎣 Gardé';
}

function saveSession() {
  const dateVal = document.getElementById('sf-date').value;
  if (!dateVal) { toast('Choisis une date'); return; }

  const tideEl = document.querySelector('#sf-tide .sfp.on');
  const seaEl  = document.querySelector('#sf-sea .sfp.on');

  const catches = [];
  document.querySelectorAll('.catch-row').forEach(row => {
    const species = row.querySelector('.cr-species').value.trim();
    if (!species) return;
    catches.push({
      species,
      weight:    parseFloat(row.querySelector('.cr-weight').value) || null,
      size:      parseFloat(row.querySelector('.cr-size').value)   || null,
      technique: row.querySelector('.cr-tech').value.trim()        || null,
      kept:      !row.querySelector('.cr-kept').classList.contains('released'),
    });
  });

  const session = {
    id: Date.now(),
    date: dateVal,
    wreckId:   _sfWreckId,
    wreckName: _sfWreckId ? (WRECKS.find(w => w.id === _sfWreckId)?.name || null) : null,
    conditions: {
      tide: tideEl?.dataset.v || null,
      sea:  seaEl?.dataset.v  || null,
      wind: document.getElementById('sf-wind').value.trim() || null,
    },
    catches,
    note: document.getElementById('sf-note').value.trim() || null,
  };

  const sessions = getSessions();
  sessions.unshift(session);
  saveSessions(sessions);

  document.getElementById('sfbg').classList.remove('open');
  document.getElementById('sf-wreck-q').style.display = '';
  renderPeches();

  if (_sfWreckId && activeWreck?.id === _sfWreckId) {
    updateModalCatches(_sfWreckId);
  }

  const n = catches.length;
  toast(`Session enregistrée · ${n} prise${n !== 1 ? 's' : ''} ✓`);
}

function closeSF() {
  document.getElementById('sfbg').classList.remove('open');
  document.getElementById('sf-wreck-q').style.display = '';
}
function closeSFBg(e) { if (e.target === document.getElementById('sfbg')) closeSF(); }

function renderPeches() {
  const sessions = getSessions();
  const totalCatches = sessions.reduce((n, s) => n + s.catches.length, 0);
  const weights = sessions.flatMap(s => s.catches.filter(c => c.weight).map(c => c.weight));
  const best = weights.length ? Math.max(...weights) : null;
  document.getElementById('ps-sessions').textContent = sessions.length;
  document.getElementById('ps-prises').textContent   = totalCatches;
  document.getElementById('ps-best').textContent     = best ? best + ' kg' : '—';

  const el = document.getElementById('selist');
  if (!sessions.length) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">🎣</div><p>Aucune session enregistrée</p><p style="font-size:12px;margin-top:8px">Enregistre tes sorties pêche<br>et suis tes prises épave par épave.</p></div>`;
    return;
  }
  el.innerHTML = sessions.map(s => sessionCardHTML(s)).join('');
}

function sessionCardHTML(s) {
  const dateStr = new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
  const w = s.wreckId ? WRECKS.find(x => x.id === s.wreckId) : null;
  const wreckColor = w ? catColor(w.category) : 'var(--sea)';
  const wreckLabel = s.wreckName || '🌊 Pleine mer';

  const topSpecies = [...new Set(s.catches.map(c => c.species))].slice(0, 4);
  const kept       = s.catches.filter(c => c.kept).length;
  const released   = s.catches.length - kept;

  const condParts = [
    s.conditions.tide && (s.conditions.tide === 'montante' ? '↑' : s.conditions.tide === 'descendante' ? '↓' : '→') + ' ' + s.conditions.tide,
    s.conditions.sea  && (s.conditions.sea === 'belle' ? '⛵' : s.conditions.sea === 'agitée' ? '〰️' : '🌊') + ' ' + s.conditions.sea,
    s.conditions.wind && '💨 ' + s.conditions.wind,
  ].filter(Boolean).join(' · ');

  const weights  = s.catches.filter(c => c.weight).map(c => c.weight);
  const bestKg   = weights.length ? Math.max(...weights) : null;

  return `
  <div class="sec-card" style="border-left:3px solid ${wreckColor}" onclick="sessionClick(${s.id})">
    <div class="sec-top">
      <div>
        <div class="sec-date">${dateStr}</div>
        <div class="sec-wreck" style="color:${wreckColor}">${wreckLabel}</div>
      </div>
      <div class="sec-counts">
        <span class="sec-badge">${s.catches.length} prise${s.catches.length !== 1 ? 's' : ''}</span>
        ${released > 0 ? `<span class="sec-badge sec-rel">${released} relâché${released > 1 ? 's' : ''}</span>` : ''}
      </div>
    </div>
    ${condParts ? `<div class="sec-cond">${condParts}</div>` : ''}
    ${topSpecies.length ? `<div class="sec-species">${topSpecies.map(sp => `<span class="spc">${sp}</span>`).join('')}</div>` : ''}
    ${bestKg ? `<div class="sec-best">🏆 Meilleure prise : ${bestKg} kg</div>` : ''}
    ${s.note ? `<div class="sec-note">${s.note}</div>` : ''}
    <button class="sec-del" onclick="event.stopPropagation();delSession(${s.id})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      </svg>
    </button>
  </div>`;
}

function sessionClick(id) {
  const s = getSessions().find(x => x.id === id);
  if (s?.wreckId) openModal(s.wreckId);
}

function delSession(id) {
  saveSessions(getSessions().filter(s => s.id !== id));
  renderPeches();
  toast('Session supprimée');
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function toDDM(deg, axis) {
  const d = Math.floor(Math.abs(deg));
  const m = ((Math.abs(deg) - d) * 60).toFixed(3);
  const dir = axis === 'lat' ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  return `${d}°${m}'${dir}`;
}

function toast(msg, dur = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('on'), dur);
}
