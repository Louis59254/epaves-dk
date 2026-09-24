// ── MAZ Fishing — Rendu bathymétrique « type Navionics » ─────────────────────
// Sources (visualisation publique, rendu recalculé dans le navigateur) :
//   • SHOM — MNT côtier détroit du Pas-de-Calais, maille 20 m, zéro hydrographique (PBMA)
//     « SHOM, 2016. MNT topo-bathymétrique côtier à 20m du détroit du Pas-de-Calais (TANDEM) »
//   • EMODnet Bathymetry — maille ~115 m, en secours hors couverture SHOM
// Chaque pixel reçu est décodé en profondeur, puis recoloré (palette pêche),
// ombré (relief des bancs et dunes) et traversé d'isobathes.

const EMODNET_WMS = 'https://ows.emodnet-bathymetry.eu/wms';
const SHOM_WMS    = 'https://services.data.shom.fr/INSPIRE/wms/r';
const SHOM_LAYER  = 'MNT_COTIER_DETROIT_PDC_20m_PBMA_WMSR_3857';
const SHOM_BBOX   = [92789.6, 6533294.1, 283143.7, 6680509.4]; // EPSG:3857

// Palette SHOM officielle (légende du service) : [hauteur m, r, g, b]
// Négatif = sous le zéro hydrographique. Au-delà de +5 m (terre), pas décodé.
const SHOM_PALETTE = [
  [  5,  98, 157, 108],
  [  0, 128, 255, 255],
  [ -5, 131, 224, 252],
  [-10, 106, 181, 255],
  [-20,   0, 128, 255],
  [-40,  62,  62, 255],
  [-50,   0,   0, 176],
  [-85,  23,   5, 122],
];

// EMODnet demandé avec une rampe linéaire codée dans le canal rouge : -60 m → 0, +10 m → 255
const EMOD_MIN = -60, EMOD_MAX = 10;
const EMOD_SLD = `<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld"><NamedLayer><Name>emodnet:mean</Name><UserStyle><FeatureTypeStyle><Rule><RasterSymbolizer><ColorMap><ColorMapEntry color="#000000" quantity="${EMOD_MIN}"/><ColorMapEntry color="#ff0000" quantity="${EMOD_MAX}"/><ColorMapEntry color="#ff0000" quantity="${EMOD_MAX + 0.01}" opacity="0"/></ColorMap></RasterSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>`;

// Palette d'affichage — chaud = peu profond, comme les cartes de pêche
const DEPTH_RAMP = [
  [   3, '#c9b77a'], // estran découvrant
  [   0, '#d94a3a'],
  [  -2, '#ee6a3b'],
  [  -4, '#f59a42'],
  [  -6, '#f8c852'],
  [  -8, '#e3e063'],
  [ -10, '#b2da73'],
  [ -13, '#78cc92'],
  [ -16, '#4fbcb2'],
  [ -20, '#3ea5cf'],
  [ -25, '#3a86c9'],
  [ -30, '#3c67b6'],
  [ -40, '#394d9e'],
  [ -60, '#2e3a7c'],
];

// Isobathes (profondeurs positives) ; les majeures sont tracées plus foncées
const ISO_LEVELS = [2, 5, 10, 15, 20, 30, 40];
const ISO_MAJOR  = new Set([5, 10, 20]);

// Marge (px) demandée autour de chaque tuile : lissage et ombrage sans raccord visible
const TILE_MARGIN = 12;

// Flou moyen séparable (fenêtre 2r+1), ignore les NaN ; 2 passes ≈ gaussien
function _smooth(src, W, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const pass = (a, b, horiz) => {
    for (let line = 0; line < W; line++) {
      let sum = 0, cnt = 0;
      const at = k => horiz ? line * W + k : k * W + line;
      for (let k = 0; k < r; k++) { const v = a[at(k)]; if (!Number.isNaN(v)) { sum += v; cnt++; } }
      for (let k = 0; k < W; k++) {
        const add = k + r, rem = k - r - 1;
        if (add < W) { const v = a[at(add)]; if (!Number.isNaN(v)) { sum += v; cnt++; } }
        if (rem >= 0) { const v = a[at(rem)]; if (!Number.isNaN(v)) { sum -= v; cnt--; } }
        b[at(k)] = Number.isNaN(a[at(k)]) || !cnt ? NaN : sum / cnt;
      }
    }
  };
  pass(src, tmp, true); pass(tmp, out, false);
  pass(out, tmp, true); pass(tmp, out, false);
  return out;
}

// ── Tables précalculées ──────────────────────────────────────────────────────
const RAMP_LUT = (() => {
  // hauteur -60.0 … +3.0 par pas de 0.1 m → [r,g,b]
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const stops = DEPTH_RAMP.map(([q, c]) => [q, hex(c)]);
  const n = 631, lut = new Uint8Array(n * 3);
  for (let k = 0; k < n; k++) {
    const d = -60 + k / 10;
    let j = 0;
    while (j < stops.length - 2 && d < stops[j + 1][0]) j++;
    const [q0, c0] = stops[j], [q1, c1] = stops[j + 1];
    const t = Math.max(0, Math.min(1, (q0 - d) / (q0 - q1)));
    for (let c = 0; c < 3; c++) lut[k * 3 + c] = Math.round(c0[c] + t * (c1[c] - c0[c]));
  }
  return lut;
})();

function _rampIndex(d) {
  const k = Math.round((d + 60) * 10);
  return (k < 0 ? 0 : k > 630 ? 630 : k) * 3;
}

const _shomCache = new Map();
// Couleur SHOM → hauteur (projection sur la polyligne de la palette dans l'espace RGB)
function decodeShom(r, g, b) {
  const key = (r << 16) | (g << 8) | b;
  let v = _shomCache.get(key);
  if (v !== undefined) return v;
  let best = Infinity, depth = null;
  for (let i = 0; i < SHOM_PALETTE.length - 1; i++) {
    const [d0, r0, g0, b0] = SHOM_PALETTE[i], [d1, r1, g1, b1] = SHOM_PALETTE[i + 1];
    const vx = r1 - r0, vy = g1 - g0, vz = b1 - b0;
    let t = ((r - r0) * vx + (g - g0) * vy + (b - b0) * vz) / (vx * vx + vy * vy + vz * vz);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = r0 + t * vx - r, ey = g0 + t * vy - g, ez = b0 + t * vz - b;
    const dist = ex * ex + ey * ey + ez * ez;
    if (dist < best) { best = dist; depth = d0 + t * (d1 - d0); }
  }
  // Trop loin de la rampe = terre / texte / bord → pas une profondeur
  v = (best < 500 && depth < 3) ? depth : null;
  if (_shomCache.size > 300000) _shomCache.clear();
  _shomCache.set(key, v);
  return v;
}

// Charge une image WMS et renvoie ses pixels ; 1 nouvel essai, abandon après 20 s
function _loadPixels(url, size, retry = 1) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { img.src = ''; resolve(null); }, 20000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        resolve(ctx.getImageData(0, 0, size, size).data);
      } catch { resolve(null); }
    };
    img.onerror = () => {
      clearTimeout(timer);
      if (retry > 0) setTimeout(() => _loadPixels(url, size, retry - 1).then(resolve), 800);
      else resolve(null);
    };
    img.src = url;
  });
}

// ── Couche profondeurs ───────────────────────────────────────────────────────
const DepthLayer = L.GridLayer.extend({
  options: { contours: true, exaggeration: 4 },

  initialize(options) {
    L.GridLayer.prototype.initialize.call(this, options);
    this._depth = new Map(); // clé tuile → { D, W, dpr }
    this.on('tileunload', e => this._depth.delete(this._tileCoordsToKey(e.coords)));
  },

  setContours(on) {
    this.options.contours = on;
    if (this._map) this.redraw();
  },

  createTile(coords, done) {
    const tile = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const M = TILE_MARGIN;
    const N = Math.round(256 * dpr), W = N + 2 * M;
    tile.width = tile.height = N;

    const ts = this.getTileSize();
    const nwPt = coords.scaleBy(ts);
    const nw = this._map.unproject(nwPt, coords.z);
    const se = this._map.unproject(nwPt.add(ts), coords.z);
    const p1 = L.CRS.EPSG3857.project(nw), p2 = L.CRS.EPSG3857.project(se);
    const res = (p2.x - p1.x) / N;
    const bbox = [p1.x - M * res, p2.y - M * res, p2.x + M * res, p1.y + M * res];
    const bboxStr = bbox.map(v => v.toFixed(2)).join(',');
    const lat = (nw.lat + se.lat) / 2;

    const inShom = bbox[2] > SHOM_BBOX[0] && bbox[0] < SHOM_BBOX[2] && bbox[3] > SHOM_BBOX[1] && bbox[1] < SHOM_BBOX[3];
    const shomUrl = `${SHOM_WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=${SHOM_LAYER}&STYLES=&SRS=EPSG:3857&BBOX=${bboxStr}&WIDTH=${W}&HEIGHT=${W}&FORMAT=image/png&TRANSPARENT=TRUE`;
    const emodUrl = `${EMODNET_WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=emodnet:mean&STYLES=&SRS=EPSG:3857&BBOX=${bboxStr}&WIDTH=${W}&HEIGHT=${W}&FORMAT=image/png&TRANSPARENT=TRUE&INTERPOLATIONS=bicubic&SLD_BODY=${encodeURIComponent(EMOD_SLD)}`;

    (async () => {
      const D = new Float32Array(W * W).fill(NaN);
      let gaps = W * W;
      if (inShom) {
        const s = await _loadPixels(shomUrl, W);
        if (s) {
          gaps = 0;
          for (let i = 0, p = 0; i < W * W; i++, p += 4) {
            if (s[p + 3] < 200) { gaps++; continue; }          // hors couverture SHOM
            const d = decodeShom(s[p], s[p + 1], s[p + 2]);
            D[i] = d === null ? Infinity : d;                   // Infinity = terre SHOM
          }
        }
      }
      if (gaps > 0) {
        const e = await _loadPixels(emodUrl, W);
        if (e) {
          for (let i = 0, p = 0; i < W * W; i++, p += 4) {
            if (!Number.isNaN(D[i]) || e[p + 3] < 200) continue;
            D[i] = EMOD_MIN + e[p] / 255 * (EMOD_MAX - EMOD_MIN);
          }
        }
      }
      for (let i = 0; i < D.length; i++) if (D[i] === Infinity) D[i] = NaN;

      // Lissage ~ demi-maille SHOM (20 m) : efface les paliers de couleur du PNG source
      const mpp = res * Math.cos(lat * Math.PI / 180);
      const r = Math.max(1, Math.min(6, Math.round(10 / mpp)));
      const S = _smooth(D, W, r);

      this._render(tile, S, N, W, M, mpp);
      if (coords.z >= 13) this._soundings(tile, S, W, M, dpr, coords);
      this._depth.set(this._tileCoordsToKey(coords), { D: S, W, M, dpr });
      done(null, tile);
    })();
    return tile;
  },

  _render(tile, D, N, W, M, mpp) {
    const ctx = tile.getContext('2d');
    const img = ctx.createImageData(N, N), o = img.data;
    const k = this.options.exaggeration / (2 * mpp);
    // Lumière NO, hauteur 45° (convention des cartes ombrées)
    const Lx = -0.5, Ly = -0.5, Lz = Math.SQRT1_2;
    const band = d => { const p = -d; let b = 0; for (const l of ISO_LEVELS) if (p >= l) b++; return b; };
    const contours = this.options.contours;

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = (y + M) * W + (x + M), oi = (y * N + x) * 4;
        const d = D[i];
        if (Number.isNaN(d)) { o[oi + 3] = 0; continue; }

        const nb = j => (Number.isNaN(D[j]) ? d : D[j]);
        const dzdx = (nb(i + 1) - nb(i - 1)) * k;
        const dzdy = (nb(i + W) - nb(i - W)) * k;
        const shade = (-dzdx * Lx - dzdy * Ly + Lz) / Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
        const f = 0.3 + 0.98 * shade; // plat ≈ 1.0, pentes éclairées > 1, pentes à l'ombre < 1

        const ri = _rampIndex(d);
        let r = RAMP_LUT[ri] * f, g = RAMP_LUT[ri + 1] * f, b = RAMP_LUT[ri + 2] * f;

        if (contours) {
          const b0 = band(d), bR = band(nb(i + 1)), bD = band(nb(i + W));
          if (b0 !== bR || b0 !== bD) {
            const lvl = ISO_LEVELS[Math.max(b0, bR, bD) - 1];
            const a = ISO_MAJOR.has(lvl) ? 0.75 : 0.45;
            r = r * (1 - a) + 29 * a; g = g * (1 - a) + 42 * a; b = b * (1 - a) + 68 * a;
          }
        }
        o[oi]     = r > 255 ? 255 : r;
        o[oi + 1] = g > 255 ? 255 : g;
        o[oi + 2] = b > 255 ? 255 : b;
        o[oi + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  // Sondes chiffrées façon carte marine (13₅ = 13,5 m), grille calée sur la carte
  _soundings(tile, D, W, M, dpr, coords) {
    const ctx = tile.getContext('2d');
    const step = 72;                       // px CSS entre deux sondes
    const ts = this.getTileSize().x;
    const ox = coords.x * ts, oy = coords.y * ts;
    const big = Math.round(10.5 * dpr), small = Math.round(8 * dpr);
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    for (let gy = Math.ceil(oy / step) * step; gy < oy + ts; gy += step) {
      for (let gx = Math.ceil(ox / step) * step; gx < ox + ts; gx += step) {
        // décalage d'une ligne sur deux → motif en quinconce, plus lisible
        const sx = gx + ((gy / step) % 2 ? step / 2 : 0);
        const lx = sx - ox, ly = gy - oy;
        if (lx < 10 || lx > ts - 18 || ly < 12 || ly > ts - 4) continue;
        const d = D[Math.round(ly * dpr + M) * W + Math.round(lx * dpr + M)];
        if (Number.isNaN(d) || d > 0) continue;
        const v = Math.round(-d * 10) / 10;
        const main = String(Math.floor(v)), dec = String(Math.round((v - Math.floor(v)) * 10));
        const x = lx * dpr, y = ly * dpr;
        ctx.font = `600 ${big}px -apple-system, system-ui, sans-serif`;
        const wMain = ctx.measureText(main).width;
        ctx.font = `600 ${small}px -apple-system, system-ui, sans-serif`;
        const wDec = dec === '0' ? 0 : ctx.measureText(dec).width;
        const x0 = x - (wMain + wDec) / 2;
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2.5 * dpr;
        ctx.fillStyle = '#1d2a44';
        ctx.font = `600 ${big}px -apple-system, system-ui, sans-serif`;
        ctx.strokeText(main, x0, y); ctx.fillText(main, x0, y);
        if (dec !== '0') {
          ctx.font = `600 ${small}px -apple-system, system-ui, sans-serif`;
          ctx.strokeText(dec, x0 + wMain, y + 3 * dpr); ctx.fillText(dec, x0 + wMain, y + 3 * dpr);
        }
      }
    }
  },

  // Profondeur lue dans les tuiles déjà chargées (instantané, marche hors réseau)
  depthAt(latlng) {
    if (!this._map || this._tileZoom == null) return undefined;
    const z = this._tileZoom, ts = this.getTileSize().x;
    const p = this._map.project(latlng, z);
    const tx = Math.floor(p.x / ts), ty = Math.floor(p.y / ts);
    const t = this._depth.get(`${tx}:${ty}:${z}`);
    if (!t) return undefined;
    const px = Math.floor((p.x - tx * ts) * t.dpr), py = Math.floor((p.y - ty * ts) * t.dpr);
    const d = t.D[(py + t.M) * t.W + (px + t.M)];
    return Number.isNaN(d) ? null : d;
  },
});

// Pseudo-couche : active/désactive les isobathes dessinées par DepthLayer
const IsobathToggle = L.Layer.extend({
  initialize(depthLayer) { this._dl = depthLayer; },
  onAdd() { this._dl.setContours(true); },
  onRemove() { this._dl.setContours(false); },
});

// Tuiles OSM dont les pixels « eau » deviennent transparents → seule la terre reste
// (masque le bruit bathymétrique des polders, garde villes, routes et noms)
const LandMaskLayer = L.GridLayer.extend({
  createTile(coords, done) {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 256;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ctx = tile.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, 256, 256), p = data.data;
      for (let i = 0; i < p.length; i += 4) {
        // Eau OSM = #aad3df ; fondu progressif sur les bords anticrénelés
        const d = Math.abs(p[i] - 170) + Math.abs(p[i + 1] - 211) + Math.abs(p[i + 2] - 223);
        if (d < 16) p[i + 3] = 0;
        else if (d < 44) p[i + 3] = Math.round((d - 16) / 28 * 255);
      }
      ctx.putImageData(data, 0, 0);
      done(null, tile);
    };
    img.onerror = () => done(null, tile);
    img.src = `https://tile.openstreetmap.org/${coords.z}/${coords.x}/${coords.y}.png`;
    return tile;
  },
});
