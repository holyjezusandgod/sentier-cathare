/* Tekent de kaart, het hoogteprofiel en de dagkaarten.
 *
 * Input : de globale DATA uit kaart.html — vijf etappes met hun punten
 *         (lat, lon, hoogte) en 114 waypoints uit OpenStreetMap.
 * Output: een werkende kaart in #map, een profiel in #profile en de
 *         dagkaarten in #days.
 * Waarom: alles in één bestand naast de GPX'en, zodat de kaart ook werkt
 *         als je hem van een USB-stick opent zonder server.
 */

const DAY_COLOR = {1: '#e8590c', 2: '#2563eb', 3: '#65a30d', 4: '#c026d3', 5: '#0d9488'};

/* Afstand tussen twee punten. Input: twee [lat, lon]. Output: meters. */
function haversine(a, b) {
  const R = 6371008.8, r = Math.PI / 180;
  const la1 = a[0] * r, la2 = b[0] * r;
  const dla = (b[0] - a[0]) * r, dlo = (b[1] - a[1]) * r;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* Zet de etappes om in één reeks meetpunten langs de hele tocht.
 * Output: {pts: [{km, ele, day}], bounds: {...}, edges: [{km, name}]} */
function buildProfile(stages) {
  const pts = [];
  const edges = [];
  let km = 0;
  stages.forEach((s, i) => {
    if (i === 0) edges.push({km: 0, name: s.frm});
    const t = s.track;
    for (let j = 0; j < t.length; j++) {
      if (j > 0) km += haversine(t[j - 1], t[j]) / 1000;
      pts.push({km, ele: t[j][2], day: s.day});
    }
    edges.push({km, name: s.to});
  });
  return {pts, edges, total: km};
}

/* ---------------------------------------------------------------- kopcijfers */
function renderTotals(stages) {
  const km = stages.reduce((a, s) => a + s.km, 0);
  const up = stages.reduce((a, s) => a + s.up_m, 0);
  const down = stages.reduce((a, s) => a + s.down_m, 0);
  const high = Math.max(...stages.map(s => s.max_m));
  /* Duizendtallen met een smalle spatie; een punt zou botsen met de komma in 85,3 km. */
  const grp = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
  const cells = [
    [km.toFixed(1).replace('.', ',') + ' km', 'te lopen'],
    ['+' + grp(up) + ' m', 'stijging'],
    ['\u2212' + grp(down) + ' m', 'daling'],
    [grp(high) + ' m', 'hoogste punt'],
  ];
  document.getElementById('totals').innerHTML = cells
    .map(([v, l]) => `<div class="tot"><b>${v}</b><span>${l}</span></div>`).join('');
}

/* ------------------------------------------------------------ hoogteprofiel */
const PROF = {pad: {t: 12, r: 10, b: 26, l: 36}};

/* Tekent het profiel opnieuw op de huidige breedte.
 * Input: de profielpunten. Output: niets; vult de SVG. */
function drawProfile(prof) {
  const svg = document.getElementById('profile');
  const W = svg.clientWidth || 390, H = +svg.getAttribute('height');
  const {t, r, b, l} = PROF.pad;
  const iw = W - l - r, ih = H - t - b;
  const eles = prof.pts.map(p => p.ele).filter(v => v != null);
  const lo = Math.floor(Math.min(...eles) / 100) * 100;
  const hi = Math.ceil(Math.max(...eles) / 100) * 100;
  const X = km => l + (km / prof.total) * iw;
  const Y = e => t + ih - ((e - lo) / (hi - lo)) * ih;
  PROF.X = X; PROF.Y = Y; PROF.lo = lo; PROF.hi = hi; PROF.box = {t, b, l, iw, ih, W, H};

  const parts = [];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`);

  // Recessief raster met echte hoogtes als labels.
  const step = (hi - lo) > 700 ? 200 : 100;
  for (let e = lo; e <= hi; e += step) {
    parts.push(`<line x1="${l}" y1="${Y(e).toFixed(1)}" x2="${l + iw}" y2="${Y(e).toFixed(1)}"
      stroke="var(--rule)" stroke-width="1"/>`);
    parts.push(`<text x="${l - 6}" y="${(Y(e) + 3.5).toFixed(1)}" text-anchor="end"
      font-size="9.5" fill="var(--muted)" font-family="var(--body)">${e}</text>`);
  }

  // Eén vlak en één lijn per dag, zodat de dagkleur de dag aangeeft.
  for (const day of [1, 2, 3, 4, 5]) {
    const seg = prof.pts.filter(p => p.day === day && p.ele != null);
    if (!seg.length) continue;
    const line = seg.map((p, i) => `${i ? 'L' : 'M'}${X(p.km).toFixed(1)},${Y(p.ele).toFixed(1)}`).join('');
    const area = line + `L${X(seg[seg.length - 1].km).toFixed(1)},${(t + ih).toFixed(1)}`
                      + `L${X(seg[0].km).toFixed(1)},${(t + ih).toFixed(1)}Z`;
    parts.push(`<path d="${area}" fill="${DAY_COLOR[day]}" opacity="0.16"/>`);
    parts.push(`<path d="${line}" fill="none" stroke="${DAY_COLOR[day]}" stroke-width="2"
      stroke-linejoin="round"/>`);
  }

  // Dorpen op de dagovergangen, met de naam staand zodat niets overlapt.
  prof.edges.forEach((e, i) => {
    const x = X(e.km);
    parts.push(`<line x1="${x.toFixed(1)}" y1="${t}" x2="${x.toFixed(1)}" y2="${t + ih}"
      stroke="var(--rule)" stroke-width="1" stroke-dasharray="2 3"/>`);
    const anchor = i === 0 ? 'start' : (i === prof.edges.length - 1 ? 'end' : 'middle');
    parts.push(`<text x="${x.toFixed(1)}" y="${H - 15}" text-anchor="${anchor}"
      font-size="9.5" fill="var(--fg-2)" font-family="var(--body)" font-weight="600">${e.name}</text>`);
    parts.push(`<text x="${x.toFixed(1)}" y="${H - 4}" text-anchor="${anchor}"
      font-size="9" fill="var(--muted)" font-family="var(--body)">${Math.round(e.km)} km</text>`);
  });

  parts.push(`<line class="cross" x1="0" y1="${t}" x2="0" y2="${t + ih}"
    stroke="var(--fg)" stroke-width="1" opacity="0"/>`);
  parts.push(`<circle class="cross-dot" r="3.5" fill="var(--bg)" stroke="var(--fg)"
    stroke-width="2" opacity="0"/>`);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = parts.join('');
}

/* Hangt de kruisdraad met uitlezing aan het profiel.
 * Input: profielpunten en een terugroep om de stip op de kaart te zetten. */
function wireProfileHover(prof, onMove) {
  const svg = document.getElementById('profile');
  const read = document.getElementById('profread');
  const dayName = {};
  DATA.stages.forEach(s => dayName[s.day] = `${s.frm} → ${s.to}`);

  function move(ev) {
    const box = svg.getBoundingClientRect();
    const px = (ev.clientX - box.left) * (PROF.box.W / box.width);
    const km = Math.max(0, Math.min(prof.total,
      (px - PROF.box.l) / PROF.box.iw * prof.total));
    let best = prof.pts[0], bd = Infinity;
    for (const p of prof.pts) {
      const d = Math.abs(p.km - km);
      if (d < bd) { bd = d; best = p; }
    }
    const x = PROF.X(best.km), y = PROF.Y(best.ele);
    const line = svg.querySelector('.cross'), dot = svg.querySelector('.cross-dot');
    line.setAttribute('x1', x); line.setAttribute('x2', x); line.setAttribute('opacity', '0.45');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('opacity', '1');
    read.innerHTML =
      `<span>Dag ${best.day} · <b>${dayName[best.day]}</b></span>` +
      `<span>km <b>${best.km.toFixed(1).replace('.', ',')}</b></span>` +
      `<span>hoogte <b>${Math.round(best.ele)} m</b></span>`;
    onMove(best);
  }
  function leave() {
    svg.querySelector('.cross').setAttribute('opacity', '0');
    svg.querySelector('.cross-dot').setAttribute('opacity', '0');
    read.innerHTML = '<span>Beweeg over het profiel voor hoogte en afstand.</span>';
    onMove(null);
  }
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerleave', leave);
}

/* ------------------------------------------------------------- dagkaarten */
/* Zet de vijf dagen in de linkerkolom. Input: etappes en een klik-terugroep. */
function renderDays(stages, onPick) {
  /* De regel 'Slapen:' onder elke dag komt uit DATA.nachten, de samenvatting
     die slaapkaart.py maakt uit de actuele lijst. Vroeger werd hij uit de
     waypoints geraden; toen stond er maandenlang een hotel dat al dicht was. */
  const perNacht = {};
  (DATA.nachten || []).forEach(n => { perNacht[n.nacht] = n; });
  const nightOf = {1: 'ma 23 nov', 2: 'di 24 nov', 3: 'wo 25 nov', 4: 'do 26 nov', 5: 'vr 27 nov'};

  document.getElementById('days').innerHTML = stages.map(s => {
    const delta = Math.abs(s.km - s.planned_km) >= 1.5
      ? `<span class="flag">plan zei ${String(s.planned_km).replace('.', ',')} km</span>` : '';
    const n = perNacht[nightOf[s.day]] || {};
    const merk = n.toestand === 'vrij'
      ? '<span class="flag" style="background:#15803d;color:#fff">vrij</span>'
      : (n.toestand === 'wacht'
          ? '<span class="flag">wacht op antwoord</span>'
          : '<span class="flag" style="background:#9f1239;color:#fff">niets vrij</span>');
    const sleep = n.keuze
      ? `<div class="day-sleep">Slapen: <b>${n.keuze}</b>, ${n.plaats || ''} ${merk}
           <span class="tel">${n.vrij} vrij · ${n.wacht} onbekend · ${n.dicht} dicht</span></div>`
      : `<div class="day-sleep">Slapen: ${merk}</div>`;
    return `<button class="day" type="button" data-day="${s.day}" aria-current="false"
              style="--chip:${DAY_COLOR[s.day]}">
        <div class="day-top">
          <i class="chip"></i>
          <span class="day-name">${s.frm} → ${s.to}</span>
          <span class="day-date">${s.date}</span>
        </div>
        <div class="day-figs">
          <span>${String(s.km).replace('.', ',')} km</span>
          <span>+${s.up_m} m</span>
          <span>−${s.down_m} m</span>
          <span>${s.min_m}–${s.max_m} m</span>
          ${delta}
        </div>
        ${sleep}
      </button>`;
  }).join('');

  document.querySelectorAll('.day').forEach(el => {
    el.addEventListener('click', () => {
      const d = +el.dataset.day;
      document.querySelectorAll('.day').forEach(o =>
        o.setAttribute('aria-current', String(+o.dataset.day === d)));
      onPick(d);
    });
  });
}

/* --------------------------------------------------------------- de kaart */
const GROUPS = [
  /* Slapen staat in drie lagen, want dat is de enige vraag die telt: kan ik
     hier terecht, weet ik het nog niet, of is het dicht? De dichte plekken
     blijven zichtbaar — anders schrijf je volgende week dezelfde mail nog eens. */
  {key: 'bed_ok',   label: 'Slapen — vrij',      color: '#15803d',
   kinds: ['Slaapplaats vrij'], on: true},
  {key: 'bed_vraag', label: 'Slapen — nog geen antwoord', color: '#b45309',
   kinds: ['Slaapplaats onbekend'], on: true},
  {key: 'bed_dicht', label: 'Slapen — dicht',     color: '#9f1239',
   kinds: ['Slaapplaats dicht'], on: false},
  {key: 'castle', label: 'Kasteel',            color: '#7c3aed', kinds: ['Kasteel'], on: true},
  {key: 'food',   label: 'Eten &amp; winkel',  color: '#7c2d12',
   kinds: ['Restaurant', 'Café', 'Bar', 'Pub', 'Snelbuffet', 'Markt',
           'Bakker', 'Banketbakker', 'Slager', 'Traiteur', 'Buurtwinkel',
           'Supermarkt', 'Dorpswinkel', 'Voedingswinkel', 'Groentewinkel',
           'Boerderijwinkel', 'Kaaswinkel'], on: true},
  {key: 'water',  label: 'Water, hut, toilet', color: '#0369a1',
   kinds: ['Drinkwater', 'Schuilhut', 'Toilet'], on: true},
  {key: 'trans',  label: 'Vervoer &amp; apotheek', color: '#475569',
   kinds: ['Bushalte', 'Treinstation', 'Treinhalte', 'Apotheek', 'Tankstation', 'Bank', 'Geldautomaat'], on: true},
  {key: 'place',  label: 'Dorpen',             color: '#78837d', kinds: ['Dorp', 'Stad'], on: false},
];

function buildMap() {
  const map = L.map('map', {zoomControl: true, scrollWheelZoom: true});
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'});
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17, subdomains: 'abc',
    attribution: 'Kaart: <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA), data &copy; OpenStreetMap'});
  const sat = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18, attribution: 'Luchtbeeld: Esri, Maxar, Earthstar Geographics'});
  topo.addTo(map);
  L.control.layers({'Topografisch (hoogtelijnen)': topo, 'OpenStreetMap': osm, 'Luchtbeeld': sat},
    null, {position: 'topleft'}).addTo(map);
  L.control.scale({imperial: false, position: 'bottomleft'}).addTo(map);

  // De vijf etappes, elk met een witte bies zodat de kleur op elke ondergrond leest.
  const lines = {};
  const all = [];
  DATA.stages.forEach(s => {
    const latlngs = s.track.map(p => [p[0], p[1]]);
    all.push(...latlngs);
    L.polyline(latlngs, {color: '#ffffff', weight: 7, opacity: 0.85}).addTo(map);
    const line = L.polyline(latlngs, {color: DAY_COLOR[s.day], weight: 3.5, opacity: 1}).addTo(map);
    line.bindPopup(
      `<span class="pop-t">Dag ${s.day}: ${s.frm} → ${s.to}</span>
       <span class="pop-k">${s.date}</span>
       <div class="pop-d">${String(s.km).replace('.', ',')} km · +${s.up_m} m / −${s.down_m} m ·
         hoogte ${s.min_m}–${s.max_m} m<br>OSM-relatie ${s.rel}</div>`);
    lines[s.day] = line;
  });

  // Waypoints, per groep in een eigen laag zodat je ze kunt uitzetten.
  const layers = {};
  /* Welke wandeldag eindigt in welke nacht: nacht 22 ligt voor dag 1, dus die
     krijgt geen kleur van een dag; 23 t/m 27 horen bij dag 1 t/m 5. */
  const NIGHT_DAY = {22: 0, 23: 1, 24: 2, 25: 3, 26: 4, 27: 5};
  GROUPS.forEach(g => {
    const lay = L.layerGroup();
    DATA.waypoints.filter(w => g.kinds.includes(w.kind)).forEach(w => {
      const name = w.name.replace('[SLAAP] ', '');
      const bits = w.desc.split(' | ');
      const popup =
        `<span class="pop-t">${name}</span>
         <span class="pop-k">${w.kind}</span>
         <div class="pop-d">${bits.join('<br>')}</div>`;
      let m;
      if (g.key.startsWith('bed_')) {
        /* Eén speld per slaapplaats, met het nachtnummer erin. Vrij is gevuld
           groen, nog-geen-antwoord is wit met een rand (leeg = onbeantwoord),
           dicht is grijs en doorzichtig. Vorm en vulling zeggen het dus ook
           zonder kleur te hoeven onderscheiden. */
        const nacht = w.nacht_nr || 0;
        const vrij = g.key === 'bed_ok';
        const dicht = g.key === 'bed_dicht';
        const vulling = vrij ? g.color : (dicht ? '#9ca3af' : '#ffffff');
        const inkt = vrij || dicht ? '#ffffff' : g.color;
        m = L.marker([w.lat, w.lon], {
          icon: L.divIcon({className: '', iconSize: [26, 26], iconAnchor: [13, 26],
            html: `<div class="bedpin" style="background:${vulling};
                     border:2px solid ${dicht ? '#6b7280' : g.color};
                     ${dicht ? 'opacity:.75;' : ''}">
                     <b style="color:${inkt}">${nacht || '\u2022'}</b></div>`}),
          zIndexOffset: vrij ? 1200 : (dicht ? 600 : 900), title: name});
      } else if (g.key === 'place') {
        m = L.marker([w.lat, w.lon], {
          icon: L.divIcon({className: '', iconSize: [1, 1],
            html: `<div style="position:absolute;translate:-50% -50%;white-space:nowrap;
              font:600 11px var(--body);color:#1b201d;text-shadow:0 0 3px #fff,0 0 3px #fff,
              0 0 3px #fff">${name}</div>`})});
      } else {
        m = L.circleMarker([w.lat, w.lon], {radius: 5, color: '#fff', weight: 1.6,
          fillColor: g.color, fillOpacity: 1, title: name});
      }
      m.bindPopup(popup).addTo(lay);
    });
    if (g.key === 'bed_ok' || g.key === 'bed_vraag') (DATA.detours || [])
      .filter(d => (g.key === 'bed_ok') === (d.vrij === true))
      .forEach(d => {
      /* Stippellijn hotel -> pad. Rood als je er echt voor moet omlopen,
         grijsgroen als het om een paar stappen gaat. */
      const ver = d.meter > 600;
      L.polyline([d.van, d.naar], {
        color: ver ? g.color : '#5b7f6b', weight: ver ? 3 : 2,
        opacity: 0.95, dashArray: ver ? '6 6' : '3 5'})
        .bindPopup(
          `<span class="pop-t">${d.naam}</span>
           <span class="pop-k">omweg vanaf het pad</span>
           <div class="pop-d">${ver
             ? (d.te_voet_m
                 ? `<b>${String((d.te_voet_m / 1000).toFixed(1)).replace('.', ',')} km te voet</b>
                    (${d.te_voet_min} min), heen en terug
                    ${String((2 * d.te_voet_m / 1000).toFixed(1)).replace('.', ',')} km<br>
                    hemelsbreed maar ${String((d.meter / 1000).toFixed(1)).replace('.', ',')} km —
                    de weg draait mee met het dal`
                 : `<b>${String((d.meter / 1000).toFixed(1)).replace('.', ',')} km</b> hemelsbreed
                    van het pad; loopafstand niet gemeten`)
             : `<b>${d.meter} m</b> van het pad — praktisch erlangs`}<br>
             je verlaat dag ${d.dag} op km ${String(d.km).replace('.', ',')}<br>
             nacht ${d.nacht}</div>`)
        .addTo(lay);
    });
    layers[g.key] = lay;
    if (g.on) lay.addTo(map);
  });

  document.getElementById('filters').innerHTML = GROUPS.map(g => {
    const n = DATA.waypoints.filter(w => g.kinds.includes(w.kind)).length;
    return `<label><input type="checkbox" id="f-${g.key}" ${g.on ? 'checked' : ''}>
      <i class="dot" style="background:${g.color}"></i>${g.label} <span
      style="color:var(--muted)">${n}</span></label>`;
  }).join('');
  GROUPS.forEach(g => {
    document.getElementById('f-' + g.key).addEventListener('change', e => {
      e.target.checked ? layers[g.key].addTo(map) : map.removeLayer(layers[g.key]);
    });
  });

  const whole = L.latLngBounds(all);
  map.fitBounds(whole, {padding: [28, 28]});

  // Stip die met de kruisdraad van het profiel meeloopt.
  let ghost = null;
  function showGhost(p) {
    if (ghost) { map.removeLayer(ghost); ghost = null; }
    if (!p) return;
    let km = 0, found = null;
    for (const s of DATA.stages) {
      for (let j = 0; j < s.track.length; j++) {
        if (j > 0) km += haversine(s.track[j - 1], s.track[j]) / 1000;
        if (!found && km >= p.km) found = s.track[j];
      }
      if (found) break;
    }
    if (!found) return;
    ghost = L.circleMarker([found[0], found[1]], {radius: 7, color: '#fff', weight: 2.5,
      fillColor: '#111827', fillOpacity: 1, interactive: false}).addTo(map);
  }

  return {
    map,
    zoomTo: d => map.fitBounds(lines[d].getBounds(), {padding: [34, 34]}),
    zoomAll: () => map.fitBounds(whole, {padding: [28, 28]}),
    showGhost,
  };
}

/* ------------------------------------------------------------- bestanden */
function renderFiles(stages) {
  const rows = stages.map(s => [
    `gpx/etappe-${s.day}-${s.frm.toLowerCase()}-${s.to.toLowerCase()}.gpx`,
    `Dag ${s.day}: ${s.frm} → ${s.to}`, `${String(s.km).replace('.', ',')} km`]);
  const totaal = stages.reduce((a, s) => a + s.km, 0);
  rows.push(['gpx/sentier-cathare-totaal.gpx', 'Alle vijf dagen in één track',
             totaal.toFixed(1).replace('.', ',') + ' km']);
  rows.push(['gpx/waypoints.gpx', 'Slaapadressen en voorzieningen',
             DATA.waypoints.length + ' punten']);
  document.getElementById('files').innerHTML = rows
    .map(([h, t, s]) => `<a href="${h}" download>${t}<span>${s}</span></a>`).join('');
}

/* ------------------------------------------------------------------- start */
const prof = buildProfile(DATA.stages);
renderTotals(DATA.stages);
renderDays(DATA.stages, d => view.zoomTo(d));
renderFiles(DATA.stages);
const view = buildMap();
drawProfile(prof);
wireProfileHover(prof, p => view.showGhost(p));

let t = null;
addEventListener('resize', () => {
  clearTimeout(t);
  t = setTimeout(() => { drawProfile(prof); view.map.invalidateSize(); }, 150);
});

// Thema-knop: volgt eerst het systeem en wisselt daarna hard.
const themer = document.getElementById('themer');
function labelThemer() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
    || (!document.documentElement.getAttribute('data-theme')
        && matchMedia('(prefers-color-scheme: dark)').matches);
  themer.textContent = dark ? 'Licht' : 'Donker';
  return dark;
}
labelThemer();
themer.addEventListener('click', () => {
  const dark = labelThemer();
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  labelThemer();
  drawProfile(prof);
});
