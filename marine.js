// ── MAZ Fishing — Courants, bancs et placement sur épave ─────────────────────
// Dépend de : marine_data.js (BANKS, TIDAL_STREAM, POSITIONING_TIPS),
// app.js (computeTideExtrema, tideCoefFromRange, ensureTides, _destPoint, waypoints)

const CARDINALS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
const cardinal = deg => CARDINALS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];

// ── Courant de marée ─────────────────────────────────────────────────────────
function _tideContext(ms) {
  const ex = computeTideExtrema(ms - 14 * 3600000, 28);
  const pms = ex.filter(e => e.type === 'PM');
  if (!pms.length) return null;
  const pm = pms.reduce((a, b) => Math.abs(b.t - ms) < Math.abs(a.t - ms) ? b : a);
  const coef = pmCoef(pm, ex) ?? 70;
  return { pm, rel: (ms - pm.t) / 3600000, coef };
}

// Vecteur (u = est, v = nord) en nœuds
const _vec = (dir, spd) => [spd * Math.sin(dir * Math.PI / 180), spd * Math.cos(dir * Math.PI / 180)];

function streamAt(ms) {
  const ctx = _tideContext(ms);
  if (!ctx) return null;
  const rel = Math.max(-6, Math.min(6, ctx.rel));
  const step = TIDAL_STREAM[1][0] - TIDAL_STREAM[0][0];
  const i = Math.max(0, Math.min(TIDAL_STREAM.length - 2, Math.floor((rel - TIDAL_STREAM[0][0]) / step)));
  const a = TIDAL_STREAM[i], b = TIDAL_STREAM[i + 1];
  const f = (rel - a[0]) / (b[0] - a[0]);
  // Interpolation vectorielle (évite les sauts d'angle à la renverse)
  const lerp = (va, vb, t) => [va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t];
  const spring = lerp(_vec(a[1], a[2]), _vec(b[1], b[2]), f);
  const neap   = lerp(_vec(a[3], a[4]), _vec(b[3], b[4]), f);
  const w = Math.max(0, Math.min(1, (ctx.coef - 45) / 50));
  const [u, v] = lerp(neap, spring, w);
  const speed = Math.hypot(u, v);
  const dir = (Math.atan2(u, v) * 180 / Math.PI + 360) % 360;
  const flood = Math.abs(((dir - 70 + 540) % 360) - 180) < 80;
  const phase = speed < 0.4 ? 'Étale' : flood ? 'Flot' : 'Jusant';
  return { dir, speed, phase, coef: ctx.coef, rel: ctx.rel, pmTime: ctx.pm.t };
}

// Prochaine étale (courant minimal) dans les 7 h
function nextSlack(ms) {
  let best = null;
  let prev = streamAt(ms);
  for (let t = ms + 10 * 60000; t < ms + 7 * 3600000; t += 10 * 60000) {
    const s = streamAt(t);
    if (!s || !prev) break;
    if (s.speed < 0.4 && s.speed <= prev.speed) best = { t, s };
    else if (best) return best;
    prev = s;
  }
  return best;
}

// ── Couche des bancs (noms façon carte marine) ───────────────────────────────
const BanksLayer = L.LayerGroup.extend({
  onAdd(map) {
    L.LayerGroup.prototype.onAdd.call(this, map);
    if (!this.getLayers().length) {
      BANKS.forEach(b => {
        if (b.axis) {
          this.addLayer(L.polyline(b.axis, {
            pane: 'bankPane', color: '#5b4a2a', weight: 1.5, opacity: 0.55,
            dashArray: '2 6', interactive: false,
          }));
        }
        const rot = b.brg - 90; // texte le long de l'axe du banc
        this.addLayer(L.marker([b.lat, b.lng], {
          pane: 'bankPane', interactive: false, keyboard: false,
          icon: L.divIcon({
            className: 'bank-label', iconSize: [0, 0],
            html: `<span style="transform:translate(-50%,-50%) rotate(${rot > 90 ? rot - 180 : rot}deg)">${b.name}</span>`,
          }),
        }));
      });
    }
    this._zoomCheck = () => {
      const z = map.getZoom(), pane = map.getPane('bankPane');
      pane.classList.toggle('banks-hidden', z < 10);
      pane.style.setProperty('--bank-fs', (z <= 10 ? 8.5 : z === 11 ? 10 : 12) + 'px');
    };
    map.on('zoomend', this._zoomCheck);
    this._zoomCheck();
  },
  onRemove(map) {
    map.off('zoomend', this._zoomCheck);
    L.LayerGroup.prototype.onRemove.call(this, map);
  },
});

// ── Bloc « Courant & placement » de la fiche épave ───────────────────────────
function _arrowSvg(dir, size = 26, color = '#1c00fe') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="transform:rotate(${dir}deg)"><path d="M12 2 L18 14 L13 12 L13 22 L11 22 L11 12 L6 14 Z" fill="${color}"/></svg>`;
}

function _placementDiagram(w, s) {
  // Repère : épave au centre, 1 px ≈ 1 m, amont à 120 m
  const W = 300, H = 220, cx = W / 2, cy = H / 2;
  const rad = d => d * Math.PI / 180;
  const pt = (brg, dist) => [cx + dist * Math.sin(rad(brg)), cy - dist * Math.cos(rad(brg))];
  const up = pt(s.dir + 180, 95), down = pt(s.dir, 70);
  const len = Math.max(24, Math.min(110, w.length_m || 50));
  const hull = w.orientation_deg != null
    ? `<g transform="translate(${cx} ${cy}) rotate(${w.orientation_deg})"><rect x="-6" y="${-len / 2}" width="12" height="${len}" rx="6" fill="#3b3b4f" stroke="#fff" stroke-width="1.5"/></g>`
    : `<circle cx="${cx}" cy="${cy}" r="9" fill="#3b3b4f" stroke="#fff" stroke-width="1.5"/>`;
  // Flèches de courant en fond
  const flows = [-70, 0, 70].map(o => {
    const [x0, y0] = [cx + o * Math.cos(rad(s.dir)), cy + o * Math.sin(rad(s.dir))];
    const a = [x0 - 120 * Math.sin(rad(s.dir)), y0 + 120 * Math.cos(rad(s.dir))];
    const b = [x0 + 120 * Math.sin(rad(s.dir)), y0 - 120 * Math.cos(rad(s.dir))];
    return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#7fb3e0" stroke-width="1.5" stroke-dasharray="6 6" marker-end="url(#mz-arr)"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="place-svg">
    <defs><marker id="mz-arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#7fb3e0"/></marker></defs>
    <rect width="${W}" height="${H}" rx="14" fill="#e8f2fa"/>
    ${flows}
    <ellipse cx="${down[0]}" cy="${down[1]}" rx="34" ry="22" transform="rotate(${s.dir - 90} ${down[0]} ${down[1]})" fill="#f59e0b" opacity=".22"/>
    <text x="${down[0]}" y="${down[1] + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="#b45309">🐟 bars</text>
    ${hull}
    <circle cx="${up[0]}" cy="${up[1]}" r="11" fill="#1c00fe" stroke="#fff" stroke-width="2"/>
    <text x="${up[0]}" y="${up[1] + 4}" text-anchor="middle" font-size="11">⛵</text>
    <text x="${up[0]}" y="${up[1] - 16}" text-anchor="middle" font-size="10" font-weight="700" fill="#1c00fe">départ dérive</text>
    <text x="10" y="${H - 10}" font-size="9" fill="#6360a0">Le courant porte au ${Math.round(s.dir)}° (${cardinal(s.dir)})</text>
  </svg>`;
}

async function renderPlacement(w) {
  const el = document.getElementById('m-place');
  if (!el) return;
  el.innerHTML = '<div class="g-empty">⏳ Calcul du courant…</div>';
  if (!(await ensureTides())) {
    el.innerHTML = '<div class="g-empty">Marées indisponibles hors ligne</div>';
    return;
  }
  const now = Date.now();
  const s = streamAt(now);
  if (!s) { el.innerHTML = '<div class="g-empty">Courant indisponible</div>'; return; }
  const slack = nextSlack(now);
  const hhmm = t => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const upBrg = (s.dir + 180) % 360;
  const upPt = _destPoint(w.lat, w.lng, upBrg, 0.12);

  // Prochaines heures : fenêtres idéales = courant modéré (0,3–1,2 nd)
  const strip = Array.from({ length: 7 }, (_, k) => {
    const t = now + k * 3600000, x = streamAt(t);
    if (!x) return '';
    const cls = x.speed < 0.3 ? 'slack' : x.speed <= 1.2 ? 'good' : x.speed <= 1.7 ? 'mid' : 'hard';
    return `<div class="cs-cell ${cls}"><div class="cs-h">${k === 0 ? 'Maint.' : hhmm(t).slice(0, 2) + 'h'}</div>
      ${x.speed < 0.3 ? '<div class="cs-slack">≈</div>' : _arrowSvg(x.dir, 18)}
      <div class="cs-v">${x.speed.toFixed(1)}</div></div>`;
  }).join('');

  let axis = '';
  if (w.orientation_deg != null) {
    const diff = Math.abs(((w.orientation_deg - s.dir) % 180 + 180) % 180);
    const a = Math.min(diff, 180 - diff);
    axis = a < 30 ? "L'épave est dans l'axe du courant : dérive facile, passes le long de la coque."
      : a > 60 ? "L'épave est en travers du courant : remous marqué côté aval, poissons calés derrière la coque."
      : "L'épave est de biais par rapport au courant.";
  }

  const phaseTxt = s.phase === 'Étale' ? 'Étale — courant quasi nul'
    : `${s.phase} · porte au ${Math.round(s.dir)}° (${cardinal(s.dir)})`;

  el.innerHTML = `
    <div class="place-now">
      <div class="place-arrow">${s.phase === 'Étale' ? '<span style="font-size:22px">≈</span>' : _arrowSvg(s.dir, 34)}</div>
      <div style="flex:1">
        <div class="place-phase">${phaseTxt}</div>
        <div class="place-sub">${s.speed.toFixed(1)} nd en surface · coef. ~${s.coef}${slack ? ` · étale vers ${hhmm(slack.t)}` : ''}</div>
      </div>
    </div>
    <div class="cs-strip">${strip}</div>
    <div class="cs-legend"><span class="good">idéal</span><span class="mid">soutenu</span><span class="hard">fort</span><span class="slack">étale</span></div>
    ${_placementDiagram(w, s)}
    <div class="ibox" style="margin-top:8px"><p>
      ${s.phase === 'Étale'
        ? "Étale : dérive quasi nulle. Bon moment pour pêcher à la verticale ou au fond, au mouillage, juste en amont de l'épave."
        : `Remontez à <b>~120 m au ${cardinal(upBrg)}</b> de l'épave (amont), bateau en travers du vent, puis laissez dériver vers le ${cardinal(s.dir)}. Continuez 80–100 m après l'épave : les bars attendent en aval.`}
      ${axis ? '<br>' + axis : ''}
    </p></div>
    <button class="g-btn" style="width:100%;margin-top:8px" onclick="addUpstreamMark(${w.id},${upPt[0].toFixed(6)},${upPt[1].toFixed(6)})">📍 Poser un repère « départ de dérive »</button>
    <details class="place-tips"><summary>Conseils de placement (${POSITIONING_TIPS.length})</summary>
      ${POSITIONING_TIPS.map(t => `<div class="pt-item"><b>${t.t}</b><br>${t.x} <a href="${t.s}" target="_blank" rel="noopener">source</a></div>`).join('')}
    </details>
    <div class="place-note">Courant de surface modélisé (Météo-France SMOC, large de Dunkerque), plus faible au fond et variable près des bancs. Faites toujours une dérive à blanc pour mesurer la vraie dérive.</div>`;
}

function addUpstreamMark(wreckId, lat, lng) {
  const w = WRECKS.find(x => x.id === wreckId);
  const wp = { id: Date.now(), lat, lng, type: 'spot', name: `Départ ${w ? w.name : ''}`.trim() };
  const wps = getWaypoints(); wps.push(wp); saveWaypoints(wps);
  _addWpMarker(wp);
  closeModal();
  showP('carte');
  setCarteView('map');
  map.flyTo([lat, lng], 15, { duration: 1 });
  toast('Repère posé en amont de l\'épave');
}

// ── Fiche technique de l'épave ───────────────────────────────────────────────
function _srcLabel(u) {
  if (/wrakkendatabank|afdelingkust/.test(u)) return 'Base belge des épaves';
  if (/emodnet/.test(u) && /heritage/.test(u)) return 'SHOM (EMODnet)';
  if (/emodnet/.test(u)) return 'UKHO (EMODnet)';
  if (/dkepaves/.test(u)) return 'dkepaves';
  if (/wikipedia/.test(u)) return 'Wikipedia';
  return 'Source';
}

function _axisSvg(deg) {
  // Axe sans sens proue/poupe : trait traversant la rose
  return `<svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="#eef0ff" stroke="#c9ccf5"/>
    <text x="22" y="9" text-anchor="middle" font-size="7" font-weight="800" fill="#6360a0">N</text>
    <g transform="rotate(${deg} 22 22)"><rect x="19" y="7" width="6" height="30" rx="3" fill="#3b3b4f"/></g></svg>`;
}

function renderTechSheet(w) {
  const el = document.getElementById('m-tech');
  if (!el) return;
  const cells = [];
  const add = (l, v) => v != null && v !== '' && cells.push(`<div class="ts-cell"><div class="ts-l">${l}</div><div class="ts-v">${v}</div></div>`);
  if (w.length_m) add(w.length_is_ship ? 'Longueur navire' : 'Longueur épave', `${Math.round(w.length_m)} m`);
  if (w.ship_length_m && !w.length_is_ship) add('Longueur navire', `${Math.round(w.ship_length_m)} m`);
  if (w.beam_m) add('Largeur', `${Math.round(w.beam_m)} m`);
  if (w.depth_seabed != null) add(w.depth_ref === 'ZH' ? 'Fond (zéro hydro.)' : 'Fond', `${w.depth_seabed} m`);
  if (w.depth_top != null) add(w.depth_ref === 'ZH' ? 'Sommet (zéro hydro.)' : 'Sommet', w.depth_top < 0 ? `découvre ${Math.abs(w.depth_top)} m` : `${w.depth_top} m`);
  if (w.height_m) add('Hauteur / fond', `${w.height_m} m`);
  if (w.ship_type) add('Type', w.ship_type.replace(/\s*\(SHOM\)/i, ''));

  const axis = w.orientation_deg != null ? `
    <div class="ts-axis">${_axisSvg(w.orientation_deg)}
      <div><div class="ts-l">Axe de l'épave</div>
      <div class="ts-v">${Math.round(w.orientation_deg)}° / ${Math.round(w.orientation_deg + 180)}° (${cardinal(w.orientation_deg)}–${cardinal(w.orientation_deg + 180)})</div></div>
    </div>` : '';

  const src = [...new Set((w.sources || []).map(u => u))].map(u => `<a href="${u}" target="_blank" rel="noopener">${_srcLabel(u)}</a>`).join(' · ');

  if (!cells.length && !axis && !w.state && !w.survey && !w.warn) { el.innerHTML = ''; el.previousElementSibling.style.display = 'none'; return; }
  el.previousElementSibling.style.display = '';
  el.innerHTML = `
    ${cells.length ? `<div class="ts-grid">${cells.join('')}</div>` : ''}
    ${axis}
    ${w.state ? `<div class="ts-state">État : <b>${w.state}</b></div>` : ''}
    ${w.survey ? `<details class="place-tips"><summary>Relevés hydrographiques (SHOM, en anglais)</summary><div class="pt-item">${w.survey}</div></details>` : ''}
    ${w.warn ? `<div class="ts-warn">⚠️ ${w.warn}</div>` : ''}
    ${w.extra ? `<div class="ts-note">Épave issue des bases officielles (${w.source_from || 'UKHO / SHOM / base belge'}), absente de dkepaves.</div>` : ''}
    ${src ? `<div class="ts-src">Sources : ${src}</div>` : ''}`;
}

// ── Silhouettes orientées des épaves (zoom ≥ 15) ─────────────────────────────
const HullsLayer = L.LayerGroup.extend({
  onAdd(map) {
    L.LayerGroup.prototype.onAdd.call(this, map);
    this._upd = () => this._refresh(map);
    map.on('zoomend moveend', this._upd);
    this._refresh(map);
  },
  onRemove(map) {
    map.off('zoomend moveend', this._upd);
    L.LayerGroup.prototype.onRemove.call(this, map);
  },
  _refresh(map) {
    this.clearLayers();
    if (map.getZoom() < 15) return;
    const b = map.getBounds().pad(0.2);
    WRECKS.forEach(w => {
      if (w.orientation_deg == null || !w.length_m || !b.contains([w.lat, w.lng])) return;
      const L_ = w.length_m / 1000, B_ = Math.max(6, w.beam_m || 8) / 1000, o = w.orientation_deg;
      const c = [w.lat, w.lng];
      const bow = _destPoint(c[0], c[1], o, L_ / 2), stern = _destPoint(c[0], c[1], o + 180, L_ / 2);
      const corner = (p, side) => _destPoint(p[0], p[1], o + side, B_ / 2);
      const poly = [corner(bow, 90), corner(bow, -90), corner(stern, -90), corner(stern, 90)];
      this.addLayer(L.polygon(poly, {
        pane: 'seamarkPane', color: '#fff', weight: 1.5, fillColor: '#2b2b3c', fillOpacity: 0.75, interactive: false,
      }));
    });
  },
});
