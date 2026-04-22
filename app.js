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
  // Update dynamic counts
  document.querySelector('[data-q="all"]').textContent = `Toutes (${WRECKS.length})`;
  document.getElementById('mbadge').textContent = WRECKS.length;
  document.getElementById('h-count').textContent = WRECKS.length;
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
let carteView = 'map';

function showP(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('on'));
  document.getElementById('p-' + id).classList.add('on');
  document.getElementById('nt-' + id).classList.add('on');
  if (id === 'carte' && carteView === 'map') setTimeout(() => map.invalidateSize(), 60);
  if (id === 'spots') renderSpots();
  if (id === 'peches') renderPeches();
  if (id === 'meteo') loadMeteo();
  if (id === 'info') renderInfo();
  document.getElementById('map-filters').classList.remove('open');
}

function setCarteView(v) {
  carteView = v;
  document.getElementById('carte-map-view').style.display  = v === 'map'  ? 'flex' : 'none';
  document.getElementById('carte-list-view').classList.toggle('on', v === 'list');
  document.getElementById('ctog-map').classList.toggle('on',  v === 'map');
  document.getElementById('ctog-list').classList.toggle('on', v === 'list');
  if (v === 'map') { setTimeout(() => map.invalidateSize(), 60); }
  if (v === 'list') { renderList(); }
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

  // Espèces — cartes enrichies avec emoji + meilleure saison + lien wiki
  const SPECIES_NAME_MAP = {
    'Bar':'bar','Lieu':'lieu','Cabillaud':'cabillaud','Merlan':'merlan','Sole':'sole',
    'Plie':'plie','Grondin':'grondin','Seiche':'seiche','Raie':'raie','Dorade':'dorade',
    'Congre':'congre','Turbot':'turbot','Flet':'flet','Maquereau':'maquereau'
  };
  document.getElementById('m-sp').innerHTML = '<div class="fish-grid">' +
    (w.species.length ? w.species.map(s => {
      const dbKey = Object.keys(FISH_DB).find(k => s.includes(k)) || '';
      const f = FISH_DB[dbKey] || { emoji: '🐟', best: '' };
      const parts = s.split(' ');
      const emo = parts.length > 1 ? parts[parts.length - 1] : f.emoji;
      const name = dbKey || s;
      const wikiId = SPECIES_NAME_MAP[name] || WIKI_SPECIES.find(x => s.toLowerCase().includes(x.id))?.id || '';
      const wikiAttr = wikiId ? `onclick="document.getElementById('epave-modal').style.display='none';showP('info');wikiNav('species-d','${wikiId}')" style="cursor:pointer"` : '';
      const wikiHint = wikiId ? `<div class="fish-wiki-hint">📖 Voir la fiche</div>` : '';
      return `<div class="fish-card" ${wikiAttr}>
        <span class="fish-emo">${emo}</span>
        <div class="fish-info">
          <div class="fish-name">${name}</div>
          ${f.best ? `<div class="fish-best">📅 ${f.best}</div>` : ''}
          ${wikiHint}
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

  if (document.getElementById('p-carte').classList.contains('on')) {
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

// ── WIKI DATA ─────────────────────────────────────────────────────────────────
const WIKI_SPECIES = [
  { id:'bar', name:'Bar européen', nick:'Loup de mer', emoji:'🐟', latin:'Dicentrarchus labrax', taille:42, quota:'3/jour (avr–déc)', quotaAlert:true, saisons:[0,0,0,1,1,1,1,1,1,1,0,0], meilleures:'Sept–Oct', marees:'Montante · Descendante', profondeur:'5–30m (épaves, digues)', techniques:['Spinning leurres souples','Popper surface','Jigging vertical','Pêche à la posée'], leurres:['Shad 12–18cm (lançon)','Slug 15cm','Popper','Stickbait'], appats:['Arénicole','Sandeel vivant','Calamar'], desc:"Le bar commun est LE poisson phare de Dunkerque. Prédateur actif, il fréquente les épaves, les digues et les passes à fort courant. Particulièrement actif en période de migration automnale, il chasse en meute dans les courants.", conseils:"Pêcher à l'étale de basse mer sur les épaves peu profondes. Les imitations de lançon (sandeel) sont très efficaces en Manche. Sortir 1h avant la pleine mer montante pour les meilleures captures depuis les digues.", regie:"⚠️ Quota 3 bar/jour d'avril à décembre. NO-KILL OBLIGATOIRE du 1er février au 31 mars.", color:'#1c00fe' },
  { id:'maquereau', name:'Maquereau', emoji:'🐡', latin:'Scomber scombrus', taille:20, quota:'20/jour', saisons:[0,0,0,1,1,1,1,1,0,0,0,0], meilleures:'Mai–Août', marees:'Toutes marées', profondeur:'0–30m (pélagique)', techniques:['Ligne à plumes','Sabiki','Spinning ultra-léger','Traine légère'], leurres:['Plumes 6 hameçons (rouge/blanc)','Sabiki','Leurre 3–5cm'], appats:['Morceaux de poisson','Calamar'], desc:"Le maquereau arrive dans les eaux dunkerquoises en mai-juin et repart en septembre. Poisson de bancs, visible en surface quand il chasse. Excellent appât vivant pour le bar.", conseils:"En bancs en surface, utiliser les plumes en lancer-ramener rapide. Le matin et le soir sont les meilleurs moments. Les bancs sont souvent signalés par des oiseaux en surface.", regie:'Taille min : 20cm. Quota : 20/jour.', color:'#059669' },
  { id:'lieu', name:'Lieu jaune', emoji:'🟡', latin:'Pollachius pollachius', taille:30, quota:'2/jour · Fermé janv–avr', quotaAlert:true, saisons:[0,0,0,0,1,1,1,1,1,1,1,0], meilleures:'Oct–Nov', marees:'Descendante · Étale BM', profondeur:'15–50m (épaves)', techniques:['Jigging vertical','Ascenseur au leurre souple','Traine lente','Verticale jig'], leurres:['Shad 15–20cm (blanc/naturel)','Slug 20cm','Jig 60–150g','Black Minnow 200'], appats:['Calamar','Sandeel'], desc:"Le lieu jaune est le poisson roi des épaves dunkerquoises. Il stationne en bancs denses autour des structures. Les grands lieux (70–90cm) descendent des fonds atlantiques en hiver.", conseils:"Méthode ascenseur : descendre jusqu'au fond, remonter en moulinant régulièrement. Tresse multicolore (10m/couleur) indispensable. Pêcher 2–5m AU-DESSUS de l'épave.", regie:"⚠️ Pêche FERMÉE du 1er janvier au 30 avril. Quota : 2 lieux/jour du 1er mai au 31 déc. Taille : 30cm.", color:'#f59e0b' },
  { id:'cabillaud', name:'Cabillaud', nick:'Morue', emoji:'🎣', latin:'Gadus morhua', taille:35, quota:'20/jour', saisons:[1,1,0,0,0,0,0,0,0,1,1,1], meilleures:'Nov–Fév', marees:'Montante · Faibles coeff', profondeur:'15–60m (fonds sableux, épaves)', techniques:['Surfcasting','Pêche au fond','Jigging lourd'], leurres:['Jig 80–200g','Leurre souple 20cm'], appats:['Grosse arénicole','Calamar','Couteau','Hareng'], desc:"La morue fréquente les eaux de la Manche en automne-hiver. Poisson de fond, il recherche les épaves et les enrochements. Les jetées dunkerquoises offrent de bonnes captures en décembre.", conseils:"Faibles coefficients souvent meilleurs (le courant réduit maintient l'appât en place). Pêcher la nuit depuis les jetées en décembre avec grosse arénicole.", regie:'Taille min : 35cm. Quota : 20/jour.', color:'#6360a0' },
  { id:'merlan', name:'Merlan', emoji:'🐠', latin:'Merlangius merlangus', taille:23, quota:'20/jour', saisons:[1,1,0,0,0,0,0,0,0,0,1,1], meilleures:'Déc–Fév', marees:'Montante', profondeur:'10–40m (fonds sableux)', techniques:['Surfcasting nocturne','Pêche au fond','Palangrotte'], leurres:[], appats:['Arénicole','Crevette','Calamar','Ver de vase'], desc:"Poisson hivernal par excellence à Dunkerque, le merlan arrive en bancs en novembre-décembre. Sa chair délicate est très appréciée en cuisine. Se prend facilement depuis les jetées ou les plages.", conseils:"Pêche nocturne depuis les jetées très productive en décembre. La petite arénicole est l'appât idéal. Les plages de Malo-les-Bains offrent une bonne pêche au surfcasting.", regie:'Taille : 23cm. Quota : 20/jour.', color:'#64748b' },
  { id:'sole', name:'Sole', emoji:'🫓', latin:'Solea solea', taille:24, quota:'10/jour', saisons:[0,0,0,1,1,1,1,1,0,0,0,0], meilleures:'Avr–Jul', marees:'Nuit · Montante douce', profondeur:'0–10m (fonds sableux)', techniques:['Surfcasting nocturne','Pêche à la posée'], leurres:[], appats:['Arénicole vive','Crevette grise','Ver de vase'], desc:"La sole est le poisson gastronomique des plages dunkerquoises. Timide et nocturne, elle se pêche surtout la nuit sur sable lors des températures douces au printemps.", conseils:"Pêche strictement nocturne de 22h à 3h. Petits hameçons (n°2–4) avec arénicole vive. Ne pas déplacer le montage trop souvent. Plages de Malo et Bray-Dunes très productives.", regie:'Taille : 24cm. Quota : 10/jour.', color:'#d97706' },
  { id:'plie', name:'Plie', nick:'Carrelet', emoji:'🪸', latin:'Pleuronectes platessa', taille:27, quota:'20/jour', saisons:[0,0,1,1,1,1,1,1,0,0,0,0], meilleures:'Mar–Jun', marees:'Montante · Coeff ≥60', profondeur:'0–40m (fonds sableux)', techniques:['Surfcasting','Pêche au fond','Pêche à la posée'], leurres:['Jig léger avec appât'], appats:['Couteau','Crevette grise','Crabe mou','Arénicole'], desc:"La plie est très présente dans les eaux dunkerquoises au printemps. Poisson plat de fond, elle se nourrit de crustacés et de vers sur les bancs sableux.", conseils:"Pêcher sur fonds sableux plats avec couteaux ou arénicoles. Les grandes marées de printemps sont idéales. Les bancs de Flandre (3–15m) sont riches en plies.", regie:'Taille : 27cm. Quota : 20/jour.', color:'#92400e' },
  { id:'grondin', name:'Grondin rouge', emoji:'🦞', latin:'Chelidonichthys cuculus', taille:20, quota:'Pas de quota', saisons:[0,0,0,0,1,1,1,1,1,1,0,0], meilleures:'Jun–Sep', marees:'Descendante', profondeur:'20–60m (fonds sableux, épaves)', techniques:['Jigging léger','Pêche au fond'], leurres:['Petit shad 8–12cm','Jig 40–80g'], appats:['Calamar','Crevette','Poisson mort manoeuvré'], desc:"Caractéristique des épaves de la Manche, le grondin rouge émet un bruit lorsqu'on le sort de l'eau. Prise fréquente et annexe lors de la pêche du lieu jaune.", conseils:"Commun sur les épaves dunkerquoises en été. Sa chair rosée est excellente mais sous-estimée. Se tient au fond, pêcher avec un jig ou leurre souple.", regie:'Taille : 20cm. Aucun quota officiel.', color:'#dc2626' },
  { id:'seiche', name:'Seiche', emoji:'🦑', latin:'Sepia officinalis', taille:13, quota:'20/jour', saisons:[0,0,1,1,1,1,0,0,0,0,0,0], meilleures:'Mar–Mai', marees:'Montante · Coeff 60-90', profondeur:'5–30m (épaves, herbiers)', techniques:['Turlutte (EGI)','Pêche au vif','Traine lente'], leurres:['Turlutte EGI 2.5–3.5 (naturel/crevette)'], appats:['Crevette vivante','Calamar'], desc:"La seiche arrive sur les côtes dunkerquoises au printemps pour se reproduire sur les épaves peu profondes. Sa pêche à la turlutte est très ludique et la chair est excellente.", conseils:"Animation darting : lancer la turlutte, laisser couler au fond, tirer brusquement vers le haut, pause. Les seiches attaquent souvent à la descente. La nuit avec turlutte lumineuse est très productive.", regie:'Taille manteau : 13cm. Quota : 20/jour.', color:'#7c3aed' },
  { id:'raie', name:'Raie bouclée', emoji:'🦈', latin:'Raja clavata', taille:45, quota:'5/jour', saisons:[0,0,0,0,0,1,1,1,1,0,0,0], meilleures:'Jun–Sep', marees:'Étale · Faibles courants', profondeur:'10–50m (fonds sableux)', techniques:['Pêche au fond','Surfcasting lourd'], leurres:[], appats:['Hareng','Maquereau coupé','Calamar','Crevette'], desc:"La raie bouclée est la plus commune dans les eaux dunkerquoises. Elle chasse sur les fonds sableux lors des étales de marée. La joue de raie est un mets délicat.", conseils:"Pêcher à l'étale de BM ou PM. Gros montages avec appâts odorants. Elle résiste avec ses ailes au ferrage. Changer l'appât régulièrement (crabes voleurs).", regie:'Taille : 45cm. Quota : 5/jour. Relâcher les espèces non identifiées.', color:'#065f46' },
  { id:'dorade', name:'Dorade grise', emoji:'⭕', latin:'Spondyliosoma cantharus', taille:23, quota:'20/jour', saisons:[0,0,0,0,0,1,1,1,1,0,0,0], meilleures:'Jul–Sep', marees:'Montante · Nuit', profondeur:'5–30m (épaves, digues)', techniques:['Pêche aux appâts','Spinning léger','Drop shot'], leurres:['Shad 8–12cm','Vers artificiel'], appats:['Crabe mou','Moule','Crevette','Calamar'], desc:"La dorade grise est attirée par les eaux tièdes des rejets de la centrale de Gravelines en été. Elle fréquente aussi les épaves et digues.", conseils:"La zone de Gravelines est un hotspot en juillet-août. Pêcher la nuit de préférence. Les crabes mous sont l'appât le plus efficace. Peut se prendre en popper depuis les digues.", regie:'Taille : 23cm. Quota : 20/jour.', color:'#0ea5e9' },
  { id:'congre', name:'Congre', emoji:'🐍', latin:'Conger conger', taille:58, quota:'5/jour', saisons:[0,0,0,0,1,1,1,1,1,1,0,0], meilleures:'Jun–Oct', marees:'Nuit · Étale', profondeur:'10–50m (épaves)', techniques:['Pêche au fond','Jigging lourd XXL'], leurres:['Jig 100–200g','Leurre souple XXL'], appats:['Maquereau entier','Calmar entier','Hareng'], desc:"Le congre vit dans les cavités des épaves. Il peut atteindre de très grandes tailles (>2m). Poisson de nuit, sa pêche nécessite du matériel costaud et du ferme au ferrage.", conseils:"Matériel renforcé : tresse PE 3–4, bas de ligne acier. Le congre se réfugie dans la structure au ferrage, ferrer et tenir ! Maquereau entier au fond la nuit sur les épaves profondes.", regie:'Taille : 58cm. Quota : 5/jour.', color:'#1a1a2e' },
  { id:'turbot', name:'Turbot', emoji:'🪅', latin:'Scophthalmus maximus', taille:30, quota:'5/jour', saisons:[0,0,0,0,0,1,1,1,1,0,0,0], meilleures:'Jun–Août', marees:'Descendante · Étale', profondeur:'5–50m (fonds sableux)', techniques:['Traine lente','Pêche au vif','Jigging lent'], leurres:['Imitation lançon (sandeel)','Shad naturel'], appats:['Sandeel vivant','Calamar','Sprat'], desc:"Le turbot est le poisson gastronomique ultime, rare mais présent en été. Sa pêche est difficile mais la récompense est à la hauteur. Les fonds sableux entre les épaves sont ses zones de chasse.", conseils:"Traine lente (1–2 nœuds) sur fonds sableux avec sandeel naturel. Attaques discrètes. Prise accessoire rare mais recherchée lors des sorties bateau.", regie:'Taille : 30cm. Quota : 5/jour.', color:'#0f766e' },
  { id:'flet', name:'Flet', emoji:'🫓', latin:'Platichthys flesus', taille:23, quota:'20/jour', saisons:[1,1,1,0,0,0,0,0,0,1,1,1], meilleures:'Oct–Mar', marees:'Montante · Forte marée', profondeur:'0–20m (estuaires, plages)', techniques:['Surfcasting','Pêche à la posée légère'], leurres:[], appats:['Arénicole','Crevette grise','Ver de vase'], desc:"Le flet est le poisson plat le plus commun des côtes dunkerquoises. Résistant, il supporte les eaux saumâtres et est présent toute l'année, surtout en automne-hiver.", conseils:"Facile à pêcher depuis les plages avec arénicole. Les fortes marées d'hiver le poussent sur les plages. Indicateur fiable de la présence de poissons.", regie:'Taille : 23cm. Quota : 20/jour.', color:'#64748b' },
];

const WIKI_TECHNIQUES = [
  { id:'jigging', name:'Jigging vertical', emoji:'🎯', brief:'La méthode reine sur épaves', niveau:'Intermédiaire', cibles:['Lieu jaune','Bar','Cabillaud','Grondin','Congre'], canne:'Canne jigging 1,80–1,90m · 60–180g', moulinet:'4000–5000 · ratio ≥6:1', ligne:'Tresse PE 1.5–2 multicolore (10m/couleur) + fluoro 40cm', leurres:['Jig métal 60–180g','Leurre souple 15–20cm (tête 30–60g)','Black Minnow 200'], technique:"Laisser descendre jusqu'au fond en comptant les couleurs. Animation dandine (tirées vives + pauses) sur 2–3m, puis redescendre. Méthode ascenseur : descendre et remonter en moulinant sans animer.", astuces:["Pêcher 2–5m AU-DESSUS de l'épave (pas au fond)","Tresse multicolore : indispensable pour connaître la profondeur du leurre","Marée descendante + coeff 70–90 = conditions idéales","Varier les animations : dandine, linéaire, pause longue"], saison:'Toute l\'année · Meilleur oct–mars pour le lieu' },
  { id:'spinning', name:'Spinning aux leurres', emoji:'🎪', brief:'Depuis les jetées et le bord', niveau:'Débutant à Avancé', cibles:['Bar','Maquereau','Lieu','Dorade'], canne:'Canne spinning 2,10–2,40m · 10–40g', moulinet:'3000–4000 · ratio ≥6:1', ligne:'Tresse PE 0.8–1.2 + fluoro 25–35cm', leurres:['Shad 10–15cm (sandeel, lançon)','Slug 12–15cm','Stickbait','Popper'], technique:"Lancer loin, laisser couler à la profondeur souhaitée, ramener en animant : tirées-pauses, linéaire, stop-and-go. Le bar attaque souvent à la pause ou à la descente du leurre.", astuces:["Imitations de lançon (sandeel) : les plus efficaces en Manche","Pêcher 1h après le lever du soleil ou en soirée","Montante douce (coeff 60–80) = idéal depuis les digues de Dunkerque","Couleurs naturelles par eau claire, flashy par eau chargée"], saison:'Printemps à automne (bar) · Été (maquereau)' },
  { id:'surfcasting', name:'Surfcasting', emoji:'🎣', brief:'Depuis la plage avec appâts naturels', niveau:'Intermédiaire', cibles:['Sole','Plie','Flet','Cabillaud','Merlan','Bar'], canne:'Canne surf 3,60–4,50m · 100–200g', moulinet:'6000–8000 · 300m tresse min', ligne:'Nylon 30–35/100 ou tresse PE 2', leurres:['Bas de ligne 2–3 hameçons (n°1–4) + lest fuseau 80–200g'], technique:"Lancer loin (60–100m+) pour les zones profondes. Poser sur pied avec signal sonore. Attendre la touche franchement avant de ferrer. Changer l'appât à chaque lancer.", astuces:["Arénicole vive = appât universel · changer souvent (crabes voleurs)","Pêche nocturne très efficace pour la sole (22h–3h)","Forte marée descendante pour le bar depuis les plages","⚠️ Juillet-août : plages surveillées 10h–19h, pas de pêche !"], saison:'Toute l\'année · Meilleur automne-hiver et printemps' },
  { id:'plumes', name:'Ligne à plumes', emoji:'🪶', brief:'Simple et efficace pour les bancs', niveau:'Débutant', cibles:['Maquereau','Bar (petits)','Merlan'], canne:'Canne spinning ou float 2m+', moulinet:'2500–4000', ligne:'Nylon 20–25/100 ou tresse légère', leurres:['Plumes 6 hameçons (rouge/blanc)','Sabiki','Lest 30–60g'], technique:"Lancer le montage loin, laisser couler 2–5m, ramener rapidement en vibrant la canne. En bateau : laisser le courant porter les plumes pendant la dérive.", astuces:["Le matin tôt et le soir = meilleurs moments","Chercher les bancs : oiseaux en surface, remous, flashes","Les maquereaux capturés = excellents appâts vivants pour le bar","En bateau sur dérive : très efficace sans effort"], saison:'Mai à Septembre' },
  { id:'turlutte', name:'Pêche à la turlutte', emoji:'🦑', brief:'Seiches et calmars à la turlutte EGI', niveau:'Débutant à Intermédiaire', cibles:['Seiche','Calmar'], canne:'Canne Eging légère 2,10–2,30m', moulinet:'2500–3500', ligne:'Tresse PE 0.6–0.8 + fluoro 12–18/100', leurres:['Turlutte EGI 2.5–3.5 (imitation crevette)','Turlutte lestée pour les fonds'], technique:"Lancer, laisser couler au fond. Tirer brusquement vers le haut (darting) pour que la turlutte bondit, puis longue pause en laissant redescendre. La seiche attaque souvent à la descente.", astuces:["Couleurs naturelles (beige, pink) les plus efficaces","Turlutte UV la nuit = très productif","Mars–mai : seiches concentrées sur les épaves de ponte","La seiche change de couleur : signe d'attaque imminente !"], saison:'Mars à Juin' },
  { id:'posee', name:'Pêche à la posée', emoji:'⚓', brief:'Technique polyvalente et accessible', niveau:'Débutant', cibles:['Plie','Sole','Flet','Grondin','Raie','Dorade'], canne:'Canne à posée 2,40–3m · 50–100g', moulinet:'4000–6000', ligne:'Tresse PE 1.5 + bas de ligne nylon 50cm', leurres:['1–2 hameçons n°2–1/0 + plomb torpille 50–100g'], technique:"Lancer et laisser reposer sur le fond. Tenir la ligne légèrement tendue. Ferrer à la touche franche. Idéal depuis le bateau à l'ancre sur les fonds plats ou les épaves.", astuces:["Appâts naturels frais = indispensable, changer régulièrement","Courant modéré ou faible pour garder l'appât en place","Technique idéale pour les débutants et les enfants","Bon pour combiner plusieurs espèces différentes"], saison:'Printemps à Automne' },
];

const WIKI_REGLEMENTATION = [
  { sp:'Bar européen', emo:'🐟', sz:'42 cm', qt:'3/jour · No-kill fév–mars', alert:true },
  { sp:'Maquereau', emo:'🐡', sz:'20 cm', qt:'20/jour' },
  { sp:'Lieu jaune', emo:'🟡', sz:'30 cm', qt:'2/jour · Fermé jan–avr', alert:true },
  { sp:'Cabillaud', emo:'🎣', sz:'35 cm', qt:'20/jour' },
  { sp:'Merlan', emo:'🐠', sz:'23 cm', qt:'20/jour' },
  { sp:'Sole', emo:'🫓', sz:'24 cm', qt:'10/jour' },
  { sp:'Plie (Carrelet)', emo:'🪸', sz:'27 cm', qt:'20/jour' },
  { sp:'Grondin rouge', emo:'🦞', sz:'20 cm', qt:'—' },
  { sp:'Seiche', emo:'🦑', sz:'13 cm', qt:'20/jour' },
  { sp:'Raie bouclée', emo:'🦈', sz:'45 cm', qt:'5/jour', alert:true },
  { sp:'Dorade grise', emo:'⭕', sz:'23 cm', qt:'20/jour' },
  { sp:'Congre', emo:'🐍', sz:'58 cm', qt:'5/jour' },
  { sp:'Turbot', emo:'🪅', sz:'30 cm', qt:'5/jour' },
  { sp:'Flet', emo:'🫓', sz:'23 cm', qt:'20/jour' },
  { sp:'Anguille', emo:'〰️', sz:'—', qt:'⛔ Interdite', alert:true },
];

const WIKI_MAREES = [
  { ico:'📈', title:'Grandes marées (Coeff ≥ 70)', text:"Les forts coefficients brassent les sédiments et activent les prédateurs. La marée montante pousse les poissons vers les hauts fonds. Préférer la 1ère heure de montante." },
  { ico:'📉', title:'Petites marées (Coeff < 70)', text:"Pêche plus difficile depuis les plages. Concentrer les efforts sur les épaves, enrochements et digues. La nuit améliore souvent les résultats. Le spinning reste efficace." },
  { ico:'⬆️', title:'Marée montante', text:"Idéale pour le bar et le lieu. Les poissons remontent sur les hauts fonds à la recherche de nourriture. Excellent pour le spinning depuis les digues." },
  { ico:'⬇️', title:'Marée descendante', text:"Le lieu jaune préfère la descendante sur les épaves. Le courant entraîne les proies vers les prédateurs en embuscade derrière les structures." },
  { ico:'➡️', title:'Étale (BM ou PM)', text:"Moment propice aux poissons de fond : raie, sole, turbot, seiche. Les poissons chassent activement pendant les quelques minutes de calme." },
];

const WIKI_SAISONS = [
  { ico:'🌸', label:'Printemps (Mar–Mai)', tip:'Seiche et dorade arrivent. Bar très actif. Plie abondante sur les fonds sableux. Idéal pour découvrir la pêche.' },
  { ico:'☀️', label:'Été (Jun–Aoû)', tip:'Maquereau, dorade (Gravelines), grondin, seiche. Plages surveillées 10h–19h. Sortir tôt le matin ou en soirée.' },
  { ico:'🍂', label:'Automne (Sep–Nov)', tip:"LA saison du bar et du lieu jaune. Conditions souvent excellentes. Migrations actives. Meilleure période pour l'épave." },
  { ico:'❄️', label:'Hiver (Déc–Fév)', tip:'Merlan et cabillaud depuis les jetées. Bar no-kill en fév. Sorties moins fréquentes mais belles prises pour qui ose.' },
];

const WIKI_SECURITE = [
  '🚨 Toujours consulter Météo-France Marine avant de partir',
  '📡 VHF canal 16 obligatoire en mer · Balise de détresse recommandée',
  '🦺 Gilet de sauvetage porté en permanence à bord',
  '📱 Informer un proche : zone, heure départ + retour prévue',
  '⛽ Plein de carburant avec 50% de réserve minimum',
  '🌊 Ne jamais pêcher depuis les digues par forte houle',
  '🦟 Quota arénicole : 100 vers/jour/personne maximum',
];

// ── WIKI RENDERING ────────────────────────────────────────────────────────────
let _wikiSection = 'home';
let _wikiId = null;

function renderInfo() {
  _wikiSection = 'home';
  _wikiId = null;
  _drawInfo();
}

function _drawInfo() {
  const el = document.getElementById('info-scroll');
  if (!el) return;
  if (_wikiSection === 'home')            el.innerHTML = _wikiHome();
  else if (_wikiSection === 'species')    el.innerHTML = _wikiSpeciesList();
  else if (_wikiSection === 'species-d')  el.innerHTML = _wikiSpeciesDetail(_wikiId);
  else if (_wikiSection === 'techniques') el.innerHTML = _wikiTechList();
  else if (_wikiSection === 'tech-d')     el.innerHTML = _wikiTechDetail(_wikiId);
  else if (_wikiSection === 'regie')      el.innerHTML = _wikiRegie();
  else if (_wikiSection === 'conseils')   el.innerHTML = _wikiConseils();
  el.scrollTop = 0;
}

function wikiNav(section, id) {
  _wikiSection = section;
  _wikiId = id || null;
  _drawInfo();
}

function _wikiHome() {
  return `<div class="wiki-home">
    <div class="wiki-title">📚 Wiki Pêche</div>
    <div class="wiki-subtitle">Tout savoir pour pêcher à Dunkerque et en Manche — espèces, techniques, réglementation et conseils locaux</div>
    <div class="wiki-cats">
      <div class="wiki-cat" onclick="wikiNav('species')">
        <div class="wiki-cat-ico">🐟</div>
        <div class="wiki-cat-name">Espèces</div>
        <div class="wiki-cat-sub">${WIKI_SPECIES.length} fiches détaillées</div>
      </div>
      <div class="wiki-cat" onclick="wikiNav('techniques')">
        <div class="wiki-cat-ico">🎣</div>
        <div class="wiki-cat-name">Techniques</div>
        <div class="wiki-cat-sub">${WIKI_TECHNIQUES.length} méthodes expliquées</div>
      </div>
      <div class="wiki-cat" onclick="wikiNav('regie')">
        <div class="wiki-cat-ico">📋</div>
        <div class="wiki-cat-name">Réglementation</div>
        <div class="wiki-cat-sub">Tailles & quotas 2026</div>
      </div>
      <div class="wiki-cat" onclick="wikiNav('conseils')">
        <div class="wiki-cat-ico">🌊</div>
        <div class="wiki-cat-name">Marées & Conseils</div>
        <div class="wiki-cat-sub">Lire les marées, sécurité</div>
      </div>
    </div>
    <div class="met-section">🌟 TOP ESPÈCES DU MOMENT</div>
    <div class="fish-wiki-grid">
      ${['bar','lieu','seiche','maquereau'].map(id => {
        const s = WIKI_SPECIES.find(x => x.id === id);
        return _fishMiniCard(s);
      }).join('')}
    </div>
    <div class="met-section" style="margin-top:14px">⚠️ RAPPEL RÉGLEMENTATION</div>
    <div class="wiki-alert">🐟 Bar : No-kill obligatoire fév–mars · 3 bars/jour max avr–déc · 42cm minimum<br>🟡 Lieu jaune : Pêche FERMÉE janv–avr · 2 lieux/jour max · 30cm minimum</div>
  </div>`;
}

function _fishMiniCard(s) {
  const dots = s.saisons.map((v,i) => `<div class="sdot ${v?'on':''}" title="${['J','F','M','A','M','J','J','A','S','O','N','D'][i]}"></div>`).join('');
  return `<div class="fish-wiki-card" onclick="wikiNav('species-d','${s.id}')">
    <div class="fish-wiki-emo">${s.emoji}</div>
    <div class="fish-wiki-name">${s.name}</div>
    ${s.nick ? `<div class="fish-wiki-nick">${s.nick}</div>` : ''}
    <div class="fish-wiki-size">≥ ${s.taille} cm · ${s.quota}</div>
    <div class="fish-season-dots">${dots}</div>
  </div>`;
}

function _wikiSpeciesList() {
  return `<div class="wiki-section-wrap">
    <div class="wiki-section-hd">
      <button class="wiki-back" onclick="wikiNav('home')">← Retour</button>
      <div class="wiki-section-title">🐟 Espèces</div>
    </div>
    <div class="fish-wiki-grid">${WIKI_SPECIES.map(s => _fishMiniCard(s)).join('')}</div>
  </div>`;
}

function _wikiSpeciesDetail(id) {
  const s = WIKI_SPECIES.find(x => x.id === id);
  if (!s) return _wikiSpeciesList();
  const mnths = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const saison = s.saisons.map((v,i) => v ? `<span class="wchip green">✓ ${mnths[i]}</span>` : '').filter(Boolean).join('');
  const techChips = s.techniques.map(t => `<span class="wchip blue">🎣 ${t}</span>`).join('');
  const leurreChips = s.leurres.map(l => `<span class="wchip orange">🪝 ${l}</span>`).join('');
  const appatChips = s.appats.map(a => `<span class="wchip green">🪱 ${a}</span>`).join('');
  return `<div class="fish-detail-wrap">
    <div class="wiki-section-hd">
      <button class="wiki-back" onclick="wikiNav('species')">← Espèces</button>
    </div>
    <div class="fish-detail-hero">
      <div class="fish-detail-emo">${s.emoji}</div>
      <div class="fish-detail-info">
        <div class="fish-detail-name">${s.name}</div>
        ${s.nick ? `<div class="fish-detail-nick">${s.nick}</div>` : ''}
        <div class="fish-detail-latin">${s.latin}</div>
      </div>
    </div>
    ${s.quotaAlert ? `<div class="wiki-alert">${s.regie}</div>` : ''}
    <div class="wiki-grid-2">
      <div class="wiki-box"><div class="wiki-box-l">Taille légale</div><div class="wiki-box-v good">≥ ${s.taille} cm</div></div>
      <div class="wiki-box"><div class="wiki-box-l">Quota</div><div class="wiki-box-v ${s.quotaAlert?'alert':'warn'}">${s.quota}</div></div>
      <div class="wiki-box"><div class="wiki-box-l">Meilleure saison</div><div class="wiki-box-v">${s.meilleures}</div></div>
      <div class="wiki-box"><div class="wiki-box-l">Marées favorables</div><div class="wiki-box-v">${s.marees}</div></div>
    </div>
    <div class="wiki-box" style="margin-bottom:10px"><div class="wiki-box-l">Profondeur & habitat</div><div class="wiki-box-v" style="font-size:13px;margin-top:5px">${s.profondeur}</div></div>
    <div class="wiki-lbl">📅 SAISONS</div>
    <div class="wiki-chips">${saison}</div>
    <div class="wiki-lbl">📖 DESCRIPTION</div>
    <div class="wiki-text"><p>${s.desc}</p></div>
    <div class="wiki-lbl">💡 CONSEILS LOCAUX</div>
    <div class="wiki-text"><p>${s.conseils}</p></div>
    <div class="wiki-lbl">🎣 TECHNIQUES</div>
    <div class="wiki-chips">${techChips}</div>
    ${s.leurres.length ? `<div class="wiki-lbl">🪝 LEURRES</div><div class="wiki-chips">${leurreChips}</div>` : ''}
    ${s.appats.length ? `<div class="wiki-lbl">🪱 APPÂTS</div><div class="wiki-chips">${appatChips}</div>` : ''}
    ${!s.quotaAlert ? `<div class="wiki-lbl">📋 RÉGLEMENTATION</div><div class="wiki-text"><p>${s.regie}</p></div>` : ''}
    <button style="width:100%;margin-top:4px;background:var(--sea);border:none;color:#fff;border-radius:var(--r);padding:13px;font-size:14px;font-weight:700;cursor:pointer" onclick="wikiNav('techniques')">Voir les techniques de pêche →</button>
    <div style="height:12px"></div>
  </div>`;
}

function _wikiTechList() {
  return `<div class="wiki-section-wrap">
    <div class="wiki-section-hd">
      <button class="wiki-back" onclick="wikiNav('home')">← Retour</button>
      <div class="wiki-section-title">🎣 Techniques</div>
    </div>
    <div class="tech-wiki-list">
      ${WIKI_TECHNIQUES.map(t => `
        <div class="tech-wiki-card" onclick="wikiNav('tech-d','${t.id}')">
          <div class="tech-wiki-ico">${t.emoji}</div>
          <div class="tech-wiki-info">
            <div class="tech-wiki-name">${t.name}</div>
            <div class="tech-wiki-brief">${t.brief}</div>
            <div class="tech-wiki-lvl">Niveau : ${t.niveau}</div>
          </div>
          <div style="color:var(--muted);font-size:18px">›</div>
        </div>`).join('')}
    </div>
  </div>`;
}

function _wikiTechDetail(id) {
  const t = WIKI_TECHNIQUES.find(x => x.id === id);
  if (!t) return _wikiTechList();
  const cibles = t.cibles.map(c => `<span class="wchip blue">${c}</span>`).join('');
  const leurres = t.leurres.map(l => `<span class="wchip orange">🪝 ${l}</span>`).join('');
  const astuces = t.astuces.map(a => `<div class="astuce-item">💡 ${a}</div>`).join('');
  return `<div class="wiki-section-wrap">
    <div class="wiki-section-hd">
      <button class="wiki-back" onclick="wikiNav('techniques')">← Techniques</button>
    </div>
    <div class="tech-detail-hero">
      <div class="tech-detail-emo">${t.emoji}</div>
      <div class="tech-detail-name">${t.name}</div>
      <div class="tech-detail-brief">${t.brief}</div>
      <div class="tech-detail-lvl">Niveau : ${t.niveau}</div>
    </div>
    <div class="wiki-lbl">🐟 ESPÈCES CIBLÉES</div>
    <div class="wiki-chips" style="margin-bottom:10px">${cibles}</div>
    <div class="wiki-lbl">🎒 MATÉRIEL</div>
    <div class="materiel-box">
      <div class="materiel-row"><div class="materiel-key">Canne</div><div class="materiel-val">${t.canne}</div></div>
      <div class="materiel-row"><div class="materiel-key">Moulinet</div><div class="materiel-val">${t.moulinet}</div></div>
      <div class="materiel-row"><div class="materiel-key">Ligne</div><div class="materiel-val">${t.ligne}</div></div>
    </div>
    <div class="wiki-lbl">🪝 LEURRES / APPÂTS</div>
    <div class="wiki-chips" style="margin-bottom:10px">${leurres}</div>
    <div class="wiki-lbl">⚙️ TECHNIQUE</div>
    <div class="wiki-text"><p>${t.technique}</p></div>
    <div class="wiki-lbl">💡 ASTUCES & CONSEILS</div>
    <div class="astuce-list">${astuces}</div>
    <div class="wiki-box" style="margin-top:10px"><div class="wiki-box-l">Saison</div><div class="wiki-box-v" style="font-size:13px;margin-top:4px">📅 ${t.saison}</div></div>
    <div style="height:12px"></div>
  </div>`;
}

function _wikiRegie() {
  const rows = WIKI_REGLEMENTATION.map(r => `
    <div class="reg-row">
      <div class="reg-sp">${r.emo} ${r.sp}</div>
      <div class="reg-sz">${r.sz}</div>
      <div class="reg-qt ${r.alert?'alert':''}">${r.qt}</div>
    </div>`).join('');
  return `<div class="wiki-section-wrap">
    <div class="wiki-section-hd">
      <button class="wiki-back" onclick="wikiNav('home')">← Retour</button>
      <div class="wiki-section-title">📋 Réglementation 2026</div>
    </div>
    <div class="wiki-alert">Réglementation pêche récréative en mer. Vérifier les arrêtés annuels (DIRM Nord) — ces données sont indicatives.</div>
    <div class="reg-table">
      <div class="reg-hd"><span style="flex:2">Espèce</span><span style="flex:1;text-align:center">Taille min</span><span style="flex:2;text-align:right">Quota/jour</span></div>
      ${rows}
    </div>
    <div class="wiki-lbl">📌 RÈGLES GÉNÉRALES</div>
    <div class="wiki-text"><p>• Marquage obligatoire : ablation de la partie inférieure de la nageoire caudale dès la capture des espèces réglementées<br>• Arénicole : 100 vers maximum par marée et par personne<br>• Anguille : pêche TOTALEMENT INTERDITE (tous stades)<br>• Trémail fixe : autorisation annuelle requise, interdit juin–septembre<br>• Juillet–août : pêche interdite depuis les plages surveillées de 10h à 19h</p></div>
  </div>`;
}

function _wikiConseils() {
  const mareeCards = WIKI_MAREES.map(m => `
    <div class="conseil-card">
      <div class="conseil-ico">${m.ico}</div>
      <div><div class="conseil-title">${m.title}</div><div class="conseil-text">${m.text}</div></div>
    </div>`).join('');
  const saisonCards = WIKI_SAISONS.map(s => `
    <div class="saison-card">
      <div class="saison-ico">${s.ico}</div>
      <div class="saison-label">${s.label}</div>
      <div class="saison-tip">${s.tip}</div>
    </div>`).join('');
  const securite = WIKI_SECURITE.map(s => `<div class="securite-item">${s}</div>`).join('');
  return `<div class="wiki-section-wrap">
    <div class="wiki-section-hd">
      <button class="wiki-back" onclick="wikiNav('home')">← Retour</button>
      <div class="wiki-section-title">🌊 Marées & Conseils</div>
    </div>
    <div class="wiki-lbl">🌊 LIRE LES MARÉES</div>
    ${mareeCards}
    <div class="wiki-lbl">📅 CALENDRIER DES SAISONS</div>
    <div class="saison-grid">${saisonCards}</div>
    <div class="wiki-lbl">🚨 SÉCURITÉ EN MER</div>
    <div class="securite-list">${securite}</div>
    <div class="wiki-lbl">🎯 APPÂTS NATURELS LOCAUX</div>
    <div class="wiki-text"><p>• <strong>Arénicole</strong> : à Malo Terminus lors des grandes marées. Max 100/marée. Conservation enroulée dans du journal au frigo.<br>• <strong>Couteaux</strong> : grandes marées uniquement, sur les bancs les plus bas. À conserver au frais dans l'eau de mer.<br>• <strong>Crevettes bouquets</strong> : la nuit aux abords des digues et enrochements. Conservation avec bulleur.<br>• <strong>Crabes mous</strong> : trouvés de nuit dans les zones de mue. Garder dans algues humides au frais.</p></div>
    <div style="height:12px"></div>
  </div>`;
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
// Constantes harmoniques calibrées empiriquement pour Dunkerque
// Formule: h = Z0 + Σ A·cos(σt − G) avec t en heures depuis 1900-01-01 UTC
const DK_CONST = [
  { A: 2.10, s: 28.9841, G:  91.2 }, // M2 — calibré sur marées avril 2026
  { A: 0.99, s: 30.0000, G: 182.0 }, // S2
  { A: 0.20, s: 28.4397, G: 344.8 }, // N2
  { A: 0.16, s: 30.0821, G: 170.3 }, // K2
  { A: 0.17, s: 57.9682, G:  66.3 }, // M4
  { A: 0.09, s: 58.9841, G: 111.0 }, // MS4
  { A: 0.07, s: 15.0411, G: 305.7 }, // K1
  { A: 0.06, s: 13.9430, G: 264.9 }, // O1
];
const DK_MSL = 3.80;

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
let _hourlyWx = null;
let _hourlyMarine = null;

function tideCoef(h, type) {
  const range = type === 'PM' ? h - DK_MSL : DK_MSL - h;
  return Math.max(20, Math.min(120, Math.round((range / (DK_CONST[0].A + DK_CONST[1].A)) * 120)));
}

async function loadMeteo() {
  if (_meteoLoaded) return;
  const el = document.getElementById('met-scroll');

  try {
    const [wx, marine] = await Promise.all([
      fetch('https://api.open-meteo.com/v1/forecast?latitude=51.03&longitude=2.37&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,wind_speed_10m_max&wind_speed_unit=kn&timezone=Europe%2FParis&forecast_days=5').then(r => r.json()),
      fetch('https://marine-api.open-meteo.com/v1/marine?latitude=51.0&longitude=2.5&current=wave_height,wave_direction,wave_period&hourly=wave_height,wave_period,wave_direction&forecast_days=5&timezone=Europe%2FParis').then(r => r.json()),
    ]);

    _hourlyWx     = wx.hourly;
    _hourlyMarine = marine.hourly;

    const cur   = wx.current;
    const waveH = marine.current?.wave_height ?? 0;
    const waveDir = marine.current?.wave_direction ?? 0;
    const [ico, desc] = wmoDesc(cur.weather_code);
    const cond  = fishingCond(cur.wind_speed_10m, waveH);

    // Strip 14 jours
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const dateChips = Array.from({length:14}, (_,i) => {
      const d = new Date(todayStart.getTime() + i*86400000);
      const day = d.toLocaleDateString('fr-FR',{weekday:'short'});
      const num = d.getDate();
      const mon = d.toLocaleDateString('fr-FR',{month:'short'});
      return `<div class="tide-chip${i===0?' active':''}" onclick="selectTideDate(${d.getTime()},this)">
        <div class="tide-chip-day">${day}</div>
        <div class="tide-chip-num">${num}</div>
        <div class="tide-chip-month">${mon}</div>
      </div>`;
    }).join('');

    // Prévisions — cartes cliquables
    const days = wx.daily;
    const forecastCards = days.time.map((_, i) => {
      const [fIco] = wmoDesc(days.weather_code[i]);
      return `<div class="fc-card" id="fc-${i}" onclick="toggleDayDetail(${i})">
        <div class="fc-day">${dayLabel(i)}</div>
        <div class="fc-ico">${fIco}</div>
        <div class="fc-temp">${Math.round(days.temperature_2m_max[i])}°</div>
        <div class="fc-wind">💨${Math.round(days.wind_speed_10m_max[i])}kt</div>
        <div class="fc-chev">▾</div>
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
          <div class="met-card-sub">Dir. ${windDir(waveDir)} · ${(marine.current?.wave_period??0).toFixed(0)}s</div>
        </div>
        <div class="met-card">
          <div class="met-card-ico">💨</div>
          <div class="met-card-v">${Math.round(cur.wind_gusts_10m)} kt</div>
          <div class="met-card-l">Rafales max</div>
          <div class="met-card-sub">Prévues aujourd'hui</div>
        </div>
      </div>
      <div class="met-cond">
        <div class="met-cond-dot ${cond.cls}"></div>
        <div class="met-cond-txt">
          <div class="met-cond-title">${cond.label}</div>
          <div class="met-cond-sub">${cond.sub}</div>
        </div>
      </div>

      <div class="met-section">📅 Prévisions — toucher pour le détail</div>
      <div class="forecast-strip">${forecastCards}</div>
      <div id="day-detail-wrap"></div>

      <div class="met-section">🌊 Marées — Dunkerque</div>
      <div class="tide-date-strip">${dateChips}</div>
      <div id="tide-day-detail"></div>
      <div style="font-size:10px;color:var(--muted);margin:4px 2px 16px">Prédiction harmonique SHOM — indicatif</div>
    `;

    renderTideDayDetail(todayStart.getTime());
    _meteoLoaded = true;
    setTimeout(() => { _meteoLoaded = false; }, 30 * 60 * 1000);

  } catch(err) {
    el.innerHTML = `<div class="met-loading">❌ Impossible de charger la météo.<br><small>Vérifiez votre connexion.</small></div>`;
  }
}

function selectTideDate(ms, el) {
  document.querySelectorAll('.tide-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderTideDayDetail(ms);
}

function renderTideChart(dateMs) {
  const W = 320, H = 100, PX = 12, PY = 8;
  const pts = [];
  for (let i = 0; i <= 96; i++) {
    pts.push({ t: dateMs + i * 15 * 60000, h: tideH(dateMs + i * 15 * 60000) });
  }
  const minH = Math.min(...pts.map(p => p.h));
  const maxH = Math.max(...pts.map(p => p.h));
  const sx = t  => PX + ((t - dateMs) / 86400000) * (W - 2*PX);
  const sy = h  => PY + (1 - (h - minH) / (maxH - minH)) * (H - 2*PY);

  const linePts = pts.map(p => `${sx(p.t).toFixed(1)},${sy(p.h).toFixed(1)}`).join(' ');
  const areaPath = `M${sx(pts[0].t).toFixed(1)},${sy(pts[0].h).toFixed(1)} ` +
    pts.slice(1).map(p => `L${sx(p.t).toFixed(1)},${sy(p.h).toFixed(1)}`).join(' ') +
    ` L${sx(pts[pts.length-1].t).toFixed(1)},${H+PY} L${sx(pts[0].t).toFixed(1)},${H+PY} Z`;

  const extrema = computeTideExtrema(dateMs, 26).filter(e => e.t >= dateMs && e.t < dateMs + 86400000 + 3600000);
  const dots = extrema.map(e => {
    const cx = sx(e.t).toFixed(1), cy = sy(e.h).toFixed(1);
    const isPM = e.type === 'PM';
    const labelY = isPM ? +cy - 7 : +cy + 14;
    return `<circle cx="${cx}" cy="${cy}" r="4" fill="${isPM?'#1c00fe':'#8a87aa'}" stroke="#fff" stroke-width="1.5"/>
    <text x="${cx}" y="${labelY}" text-anchor="middle" font-size="9" font-weight="800" fill="${isPM?'#1c00fe':'#5c59a0'}">${e.h.toFixed(1)}m</text>`;
  }).join('');

  const now = Date.now();
  const nowLine = (now >= dateMs && now < dateMs + 86400000)
    ? `<line x1="${sx(now).toFixed(1)}" y1="${PY}" x2="${sx(now).toFixed(1)}" y2="${H}" stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="3,2" opacity=".8"/>`
    : '';

  const hours = [0,6,12,18,24].map(h => {
    const x = sx(dateMs + h*3600000).toFixed(1);
    return `<text x="${x}" y="${H+14}" text-anchor="middle" font-size="9" fill="#b0aece">${h}h</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H+18}" style="width:100%;display:block;overflow:visible">
    <defs>
      <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1c00fe" stop-opacity=".18"/>
        <stop offset="100%" stop-color="#1c00fe" stop-opacity=".02"/>
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#tg)"/>
    <polyline points="${linePts}" fill="none" stroke="#1c00fe" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${nowLine}${dots}${hours}
  </svg>`;
}

function renderTideDayDetail(dateMs) {
  const el = document.getElementById('tide-day-detail');
  if (!el) return;
  const extrema = computeTideExtrema(dateMs - 3600000, 26)
    .filter(e => e.t >= dateMs && e.t < dateMs + 86400000 + 3600000);

  const dateLabel = new Date(dateMs).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});

  const rows = extrema.map(e => {
    const isPM = e.type === 'PM';
    const coef = tideCoef(e.h, e.type);
    return `<div class="tide-row">
      <div class="tide-ico">${isPM ? '🔼' : '🔽'}</div>
      <div class="tide-time">${fmtTime(e.t)}</div>
      <div style="flex:1">
        <div class="tide-type ${isPM?'pm':'bm'}">${isPM?'Pleine mer':'Basse mer'}</div>
        ${isPM ? `<div class="tide-coef">Coefficient ~${coef}</div>` : ''}
      </div>
      <div class="tide-h">${e.h.toFixed(1)} m</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="tide-chart-wrap">
      <div class="tide-chart-title">${dateLabel.charAt(0).toUpperCase()+dateLabel.slice(1)}</div>
      ${renderTideChart(dateMs)}
    </div>
    <div class="tide-card">${rows || '<div class="tide-row" style="color:var(--muted);font-size:13px">Aucune marée calculée</div>'}</div>
  `;
}

function toggleDayDetail(dayIdx) {
  const wrap = document.getElementById('day-detail-wrap');
  const isOpen = wrap.dataset.day == dayIdx && wrap.innerHTML;

  document.querySelectorAll('.fc-card').forEach((c, i) => c.classList.toggle('active', !isOpen && i === dayIdx));

  if (isOpen) { wrap.innerHTML = ''; wrap.dataset.day = ''; return; }

  const SLOTS = [[6,'Matin'],[10,'Matinée'],[14,'Après-midi'],[18,'Soir']];
  const rows = SLOTS.map(([h, label]) => {
    const idx  = dayIdx * 24 + h;
    const [sico] = wmoDesc(_hourlyWx.weather_code[idx] ?? 0);
    const wind  = Math.round(_hourlyWx.wind_speed_10m[idx] ?? 0);
    const gusts = Math.round(_hourlyWx.wind_gusts_10m[idx] ?? 0);
    const temp  = Math.round(_hourlyWx.temperature_2m[idx] ?? 0);
    const wave  = +(_hourlyMarine.wave_height[idx] ?? 0);
    const dir   = windDir(_hourlyWx.wind_direction_10m[idx] ?? 0);
    const cond  = fishingCond(wind, wave);
    return `<div class="dslot">
      <div class="dslot-label">${label}<small>${h}h00</small></div>
      <div class="dslot-ico">${sico}</div>
      <div class="dslot-info">
        <div class="dslot-temp">${temp}°C</div>
        <div class="dslot-meta">💨 ${wind} kt ${dir} — rafales ${gusts} kt</div>
        <div class="dslot-meta">🌊 ${wave.toFixed(1)} m · ${beaufort(wind)}</div>
      </div>
      <div class="dslot-dot ${cond.cls}" title="${cond.label}"></div>
    </div>`;
  }).join('');

  wrap.dataset.day = dayIdx;
  wrap.innerHTML = `<div class="day-detail">${rows}</div>`;
}
