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
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      // Quand une nouvelle version est trouvée, recharger automatiquement
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            window.location.reload();
          }
        });
      });
      // Forcer la vérification d'une mise à jour à chaque ouverture
      reg.update();
    }).catch(() => {});
  }
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

  L.control.attribution({ prefix: '© OSM · OpenSeaMap' }).addTo(map);

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
  if (id === 'meteo') loadMeteo();
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

// ── MÉTÉO / MARÉES ────────────────────────────────────────────────────────────

// Harmoniques de marée pour Dunkerque (source SHOM)
const TIDE_REF = Date.UTC(1900, 0, 1, 0, 0, 0);
const DK_CONST = [
  { A: 3.09, s: 28.9841, G: 132.5 }, // M2
  { A: 0.93, s: 30.0000, G: 163.7 }, // S2
  { A: 0.57, s: 28.4397, G: 112.7 }, // N2
  { A: 0.25, s: 30.0821, G: 163.1 }, // K2
  { A: 0.17, s: 57.9682, G:  58.5 }, // M4
  { A: 0.10, s: 15.0411, G: 289.1 }, // K1
  { A: 0.09, s: 58.9841, G:  95.0 }, // MS4
  { A: 0.07, s: 13.9430, G: 265.6 }, // O1
  { A: 0.03, s: 14.9589, G: 288.8 }, // P1
];
const DK_MSL = 3.00;

function tideH(ms) {
  const h = (ms - TIDE_REF) / 3600000;
  return DK_MSL + DK_CONST.reduce((s, c) => s + c.A * Math.cos((c.s * h - c.G) * Math.PI / 180), 0);
}

function computeTideExtrema(startMs, durationH) {
  const step = 5 * 60 * 1000; // 5 min
  const pts = [];
  for (let t = startMs; t <= startMs + durationH * 3600000; t += step) {
    pts.push({ t, h: tideH(t) });
  }
  const extrema = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1].h, c = pts[i].h, n = pts[i + 1].h;
    if (c > p && c > n) extrema.push({ t: pts[i].t, h: c, type: 'PM' });
    if (c < p && c < n) extrema.push({ t: pts[i].t, h: c, type: 'BM' });
  }
  return extrema;
}

function windDir(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function beaufort(kts) {
  if (kts < 1) return 'B0 Calme';
  if (kts < 4) return 'B1 Très légère brise';
  if (kts < 7) return 'B2 Légère brise';
  if (kts < 11) return 'B3 Petite brise';
  if (kts < 17) return 'B4 Jolie brise';
  if (kts < 22) return 'B5 Brise fraîche';
  if (kts < 28) return 'B6 Vent frais';
  if (kts < 34) return 'B7 Grand frais';
  return 'B8+ Coup de vent';
}

function wmoDesc(code) {
  if (code === 0)  return ['☀️', 'Ensoleillé'];
  if (code <= 2)   return ['🌤️', 'Peu nuageux'];
  if (code <= 3)   return ['☁️', 'Couvert'];
  if (code <= 48)  return ['🌫️', 'Brouillard'];
  if (code <= 57)  return ['🌦️', 'Bruine'];
  if (code <= 67)  return ['🌧️', 'Pluie'];
  if (code <= 77)  return ['❄️', 'Neige'];
  if (code <= 82)  return ['🌦️', 'Averses'];
  if (code <= 86)  return ['❄️', 'Averses neige'];
  return ['⛈️', 'Orage'];
}

function fishingCond(windKt, waveM) {
  if (windKt < 15 && waveM < 0.5) return { cls: 'good', label: 'Excellentes conditions', sub: '✅ Parfait pour sortir !' };
  if (windKt < 22 && waveM < 1.0) return { cls: 'ok',   label: 'Conditions acceptables', sub: '⚠️ Sortie possible avec précautions' };
  return { cls: 'bad', label: 'Mer agitée', sub: '🚫 Conditions difficiles — rester à quai' };
}

function fmtTime(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(i) {
  const d = new Date(); d.setDate(d.getDate() + i);
  if (i === 0) return "Auj.";
  if (i === 1) return "Demain";
  return d.toLocaleDateString('fr-FR', { weekday: 'short' });
}

let _meteoLoaded = false;

async function loadMeteo() {
  if (_meteoLoaded) return;
  const el = document.getElementById('met-scroll');

  try {
    // Météo + Marine (Open-Meteo, sans clé API)
    const [wx, marine] = await Promise.all([
      fetch('https://api.open-meteo.com/v1/forecast?latitude=51.03&longitude=2.37&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,wind_speed_10m_max&wind_speed_unit=kn&timezone=Europe%2FParis&forecast_days=5').then(r => r.json()),
      fetch('https://marine-api.open-meteo.com/v1/marine?latitude=51.0&longitude=2.5&current=wave_height,wave_direction,wave_period&forecast_days=1&timezone=Europe%2FParis').then(r => r.json()),
    ]);

    const cur = wx.current;
    const waveH = marine.current?.wave_height ?? 0;
    const waveDir = marine.current?.wave_direction ?? 0;
    const [ico, desc] = wmoDesc(cur.weather_code);
    const cond = fishingCond(cur.wind_speed_10m, waveH);

    // Marées — 48h depuis minuit
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const extrema = computeTideExtrema(now.getTime(), 48);
    // Garder seulement les 6 prochains
    const upcoming = extrema.filter(e => e.t >= Date.now()).slice(0, 6);

    // Coefficient de marée (estimé via amplitude M2+S2)
    function tideCoef(h, type) {
      const range = type === 'PM' ? h - DK_MSL : DK_MSL - h;
      const maxRange = DK_CONST[0].A + DK_CONST[1].A; // M2 + S2 max
      return Math.round((range / maxRange) * 120);
    }

    // Prévisions journalières
    const days = wx.daily;
    const forecastCards = days.time.map((_, i) => {
      const [fIco] = wmoDesc(days.weather_code[i]);
      return `<div class="fc-card">
        <div class="fc-day">${dayLabel(i)}</div>
        <div class="fc-ico">${fIco}</div>
        <div class="fc-temp">${Math.round(days.temperature_2m_max[i])}°</div>
        <div class="fc-wind">💨 ${Math.round(days.wind_speed_10m_max[i])} kt</div>
      </div>`;
    }).join('');

    const tideRows = upcoming.map(e => {
      const isPM = e.type === 'PM';
      const coef = tideCoef(e.h, e.type);
      return `<div class="tide-row">
        <div class="tide-ico">${isPM ? '🔼' : '🔽'}</div>
        <div class="tide-time">${fmtTime(e.t)}</div>
        <div>
          <div class="tide-type ${isPM ? 'pm' : 'bm'}">${isPM ? 'Pleine mer' : 'Basse mer'}</div>
          ${isPM ? `<div class="tide-coef">Coef. ~${coef}</div>` : ''}
        </div>
        <div class="tide-h">${e.h.toFixed(1)} m</div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="met-section">🌊 Conditions actuelles</div>
      <div class="met-now-grid">
        <div class="met-card">
          <div class="met-card-ico">${ico}</div>
          <div class="met-card-v">${Math.round(cur.temperature_2m)}°C</div>
          <div class="met-card-l">Météo</div>
          <div class="met-card-sub">${desc}</div>
        </div>
        <div class="met-card">
          <div class="met-card-ico">💨</div>
          <div class="met-card-v">${Math.round(cur.wind_speed_10m)} kt</div>
          <div class="met-card-l">Vent · ${windDir(cur.wind_direction_10m)}</div>
          <div class="met-card-sub">${beaufort(cur.wind_speed_10m)}</div>
        </div>
        <div class="met-card">
          <div class="met-card-ico">🌊</div>
          <div class="met-card-v">${waveH.toFixed(1)} m</div>
          <div class="met-card-l">Vagues</div>
          <div class="met-card-sub">Dir. ${windDir(waveDir)} · T ${(marine.current?.wave_period ?? 0).toFixed(0)}s</div>
        </div>
        <div class="met-card">
          <div class="met-card-ico">💨</div>
          <div class="met-card-v">${Math.round(cur.wind_gusts_10m)} kt</div>
          <div class="met-card-l">Rafales</div>
          <div class="met-card-sub">Max prévues</div>
        </div>
      </div>
      <div class="met-cond">
        <div class="met-cond-dot ${cond.cls}"></div>
        <div class="met-cond-txt">
          <div class="met-cond-title">${cond.label}</div>
          <div class="met-cond-sub">${cond.sub}</div>
        </div>
      </div>

      <div class="met-section">🌊 Marées — Dunkerque</div>
      <div class="tide-card">${tideRows || '<div class="tide-row"><div style="color:var(--muted);font-size:13px">Calcul en cours…</div></div>'}</div>
      <div style="font-size:10px;color:var(--muted);margin:6px 2px 0">Prédiction harmonique SHOM — indicatif, non certifié</div>

      <div class="met-section">📅 Prévisions 5 jours</div>
      <div class="forecast-strip">${forecastCards}</div>
    `;
    _meteoLoaded = true;
    // Rafraîchir toutes les 30 minutes
    setTimeout(() => { _meteoLoaded = false; }, 30 * 60 * 1000);

  } catch (e) {
    el.innerHTML = `<div class="met-loading">❌ Impossible de charger la météo.<br><small>Vérifiez votre connexion.</small></div>`;
  }
}
