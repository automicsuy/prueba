'use strict';
// Celestes: los uruguayos de la selección — partidos, estadísticas, noticias y videos.

const APP_VERSION = '14';
const LEAGUES = window.LEAGUES;
const LEAGUE_BY_ID = Object.fromEntries(LEAGUES.map(l => [l.id, l]));
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const ic = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;

/* ---------- Estado y almacenamiento local ---------- */
const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin storage */ } },
};
const state = {
  tab: 'sel',
  day: startOfDay(new Date()),
  uruAll: store.get('uruAll', false),
  statsLevel: 'all',
  statsSort: store.get('statsSort', 'selPj'),
  statsQuery: '',
  newsPlayer: '',
  videoPlayer: '',
  videoKind: 'all',
};

/* ---------- Fechas ---------- */
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function ymd(d) { return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
const fmtTime = new Intl.DateTimeFormat('es-UY', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtDayShort = new Intl.DateTimeFormat('es-UY', { weekday: 'short', day: 'numeric' });
const fmtDayLong = new Intl.DateTimeFormat('es-UY', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtDate = d => (d ? new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d)) : '—');
function ago(iso) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `hace ${Math.max(m, 1)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

/* ---------- Datos ---------- */
const memCache = new Map(); // url -> {t, data}
async function getJSON(url, ttl = 60_000) {
  const hit = memCache.get(url);
  if (hit && Date.now() - hit.t < ttl) return hit.data;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Servidor respondió ${res.status}`);
  const data = await res.json();
  memCache.set(url, { t: Date.now(), data });
  return data;
}
const skeleton = n => Array.from({ length: n }, () => `<div class="skel"></div>`).join('');
const errorBox = (msg, err, retryId) => `<div class="empty"><b>${msg}</b><small>${esc(err.message)}</small><button class="btn" id="${retryId}">${ic('refresh')}Reintentar</button></div>`;
const loading = msg => `<p class="loading-note">${msg}</p>`;
const initials = n => String(n || '').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
// Avatar: foto si existe; si falla o no hay, quedan las iniciales debajo.
const avatar = (p, cls = '') => `<span class="av ${cls}"><b>${esc(initials(p?.n))}</b>${p?.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
const playerById = id => statsData?.find(x => x.id === id) || null;
const shortName = n => { const w = String(n).split(/\s+/); return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(' ')}` : n; };

function hydrate(e) {
  const league = LEAGUE_BY_ID[e.league];
  return league ? { ...e, league, date: new Date(e.date) } : null;
}

/* ---------- Partidos con uruguayos ---------- */
const uruCache = new Map(); // ymd -> {t, data}
async function fetchUru(localDay) {
  const key = ymd(localDay);
  const hit = uruCache.get(key);
  if (hit && Date.now() - hit.t < 5 * 60_000) return hit.data;
  const from = localDay.toISOString(), to = new Date(addDays(localDay, 1).getTime() - 1).toISOString();
  const raw = await getJSON(`api/uruguayos?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, 5 * 60_000);
  const data = { events: raw.events.map(hydrate).filter(Boolean), players: raw.players || {}, seleccion: raw.seleccion || {} };
  uruCache.set(key, { t: Date.now(), data });
  return data;
}
const uruFor = e => uruCache.get(ymd(startOfDay(e.date)))?.data;
const shownPlayers = list => (state.uruAll ? list : list.filter(p => p.m || p.s20));
const currentEvents = new Map(); // id -> evento (para el detalle)

function statusHTML(e) {
  if (e.statusName.includes('POSTPONED')) return `<span class="st warn">Postergado</span>`;
  if (e.statusName.includes('CANCELED')) return `<span class="st warn">Cancelado</span>`;
  if (e.state === 'in') return `<span class="st live"><i></i>${esc(e.detail.replace(/^Halftime$|^HT$/i, 'Entretiempo') || e.clock || 'En vivo')}</span>`;
  if (e.state === 'post') return `<span class="st done">Final</span>`;
  return `<span class="st time">${fmtTime.format(e.date)}</span>`;
}
function teamRow(t, e) {
  return `<div class="team ${e.state === 'post' && t.winner ? 'win' : ''}">
    ${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy" width="22" height="22">` : `<span class="nologo"></span>`}
    <span class="tname">${esc(t.short)}</span>
    ${e.state !== 'pre' ? `<span class="score">${esc(t.score)}</span>` : ''}
  </div>`;
}
function eventCard(e, badge = '') {
  return `<button class="match ${e.state === 'in' ? 'is-live' : ''}" data-ev="${esc(e.id)}">
    <div class="m-status">${statusHTML(e)}${badge}</div>
    <div class="m-teams">${teamRow(e.home, e)}${teamRow(e.away, e)}</div>
    ${e.tv.length ? `<div class="m-tv" title="${esc(e.tv.join(', '))}">${ic('tv')}<span>${esc(e.tv.slice(0, 2).join(', '))}</span></div>` : ''}
  </button>`;
}
function groupByLeague(events) {
  const groups = new Map(LEAGUES.map(l => [l.id, []]));
  events.forEach(e => groups.get(e.league.id)?.push(e));
  return [...groups.entries()].filter(([, evs]) => evs.length);
}
function renderDays() {
  const today = startOfDay(new Date());
  let html = '';
  for (let i = -2; i <= 2; i++) {
    const d = addDays(state.day, i);
    const label = sameDay(d, today) ? 'Hoy' : sameDay(d, addDays(today, 1)) ? 'Mañana' : sameDay(d, addDays(today, -1)) ? 'Ayer' : fmtDayShort.format(d);
    html += `<button class="day ${i === 0 ? 'on' : ''}" data-off="${i}">${esc(label)}</button>`;
  }
  $('#days').innerHTML = html;
}
function playerChips(list, e) {
  return list.map(p => {
    const team = p.side === 'home' ? e.home.short : e.away.short;
    const lvl = p.m ? '<span class="tag mayor">Mayor</span>' : p.s20 ? '<span class="tag s20">Sub-20</span>' : '';
    const known = playerById(p.id);
    return `<li ${known ? `data-player="${esc(p.id)}" tabindex="0"` : ''}>${avatar(known || p, 'xs')}<span class="pname">${esc(p.n)}</span><small>${esc(team)}${p.p ? ' · ' + esc(POS[p.p] || p.p) : ''}</small>${lvl}</li>`;
  }).join('');
}

let uruReq = 0;
let lastUru = null;
async function renderUru() {
  renderDays();
  setSub(SUBS.uru());
  const list = $('#uruList');
  const req = ++uruReq;
  list.innerHTML = loading('Revisando planteles… la primera vez del día puede tardar unos segundos.') + skeleton(4);
  let d;
  try { d = await fetchUru(state.day); } catch (err) {
    if (req === uruReq) list.innerHTML = errorBox('No se pudo revisar los planteles.', err, 'retryUru');
    return;
  }
  if (req !== uruReq) return;
  lastUru = d;
  paintUru(d);
  // Con la lista de jugadores llegan las fotos: se repinta sin volver a pedir los partidos.
  if (!statsData) loadStats().then(() => { if (req === uruReq && state.tab === 'uru') paintUru(lastUru); }).catch(() => {});
}

function paintUru(d) {
  const list = $('#uruList');
  d.events.forEach(e => currentEvents.set(e.id, e));
  const sel = d.events.filter(e => d.seleccion[e.id]);
  const withPlayers = d.events.filter(e => !d.seleccion[e.id] && shownPlayers(d.players[e.id] || []).length);
  const total = withPlayers.reduce((n, e) => n + shownPlayers(d.players[e.id]).length, 0);
  const live = withPlayers.filter(e => e.state === 'in').length;
  const parts = [`<h2 class="section-title">${esc(cap(fmtDayLong.format(state.day)))}</h2>`];
  parts.push(`<p class="section-sub">${withPlayers.length || sel.length
    ? `${withPlayers.length} ${withPlayers.length === 1 ? 'partido' : 'partidos'} · ${total} ${total === 1 ? 'jugador' : 'jugadores'}${live ? ` · <b>${live} en vivo</b>` : ''}`
    : 'Sin partidos'}</p>`);

  // Carrusel "Hoy juegan": jugadores de selección con su partido.
  const featured = [];
  const seenP = new Set();
  withPlayers.slice().sort((a, b) => (b.state === 'in') - (a.state === 'in') || a.date - b.date).forEach(e => {
    (d.players[e.id] || []).filter(p => p.m || p.s20).forEach(p => {
      if (seenP.has(p.id)) return;
      seenP.add(p.id);
      const rival = p.side === 'home' ? e.away.short : e.home.short;
      featured.push({ p, e, rival });
    });
  });
  featured.sort((a, b) => (b.p.m - a.p.m) || (!!playerById(b.p.id)?.photo - !!playerById(a.p.id)?.photo));
  if (featured.length) {
    parts.push(`<div class="rail" role="list" aria-label="Hoy juegan">${featured.slice(0, 24).map(({ p, e, rival }) => {
      const known = playerById(p.id);
      return `<button class="rail-card" role="listitem" data-player="${esc(p.id)}" data-ev-fallback="${esc(e.id)}">
        ${avatar(known || p, 'lg')}
        <b>${esc(shortName(p.n))}</b>
        <small>vs ${esc(rival)}</small>
        <span class="rail-st">${e.state === 'in' ? `<i></i>${esc(e.detail || 'En vivo')}` : e.state === 'post' ? 'Final' : fmtTime.format(e.date)}</span>
      </button>`;
    }).join('')}</div>`);
  }

  if (sel.length) {
    parts.push(`<div class="group sel"><h3 class="group-h">${ic('flag')}Selección uruguaya</h3><div class="card">${sel.map(e =>
      eventCard(e, `<span class="tag solid">${d.seleccion[e.id] === 'sub20' ? 'Sub-20' : 'Mayor'}</span>`)).join('')}</div></div>`);
  }
  for (const [id, evs] of groupByLeague(withPlayers)) {
    const l = LEAGUE_BY_ID[id];
    parts.push(`<div class="group"><h3 class="group-h">${esc(l.name)}</h3><div class="card">${evs.map(e =>
      `<div class="uru-item">${eventCard(e)}<ul class="uru-players">${playerChips(shownPlayers(d.players[e.id]), e)}</ul></div>`).join('')}</div></div>`);
  }
  if (!sel.length && !withPlayers.length) {
    parts.push(`<div class="empty"><b>No juegan uruguayos ${state.uruAll ? '' : 'de selección '}este día</b>${state.uruAll ? '<small>Probá con otro día.</small>' : '<small>Probá otro día o activá "Incluir otros uruguayos".</small>'}</div>`);
  }
  list.innerHTML = parts.join('');
  scheduleRefresh(d.events);
}

let refreshTimer;
function scheduleRefresh(events) {
  clearTimeout(refreshTimer);
  const soon = events.some(e => e.state === 'in' || (e.state === 'pre' && e.date - Date.now() < 30 * 60_000 && e.date - Date.now() > -3 * 3600_000));
  if (soon) refreshTimer = setTimeout(() => { if (!document.hidden && state.tab === 'uru') { memCache.clear(); uruCache.clear(); renderUru(); } }, 90_000);
}

function openEvent(e) {
  const list = uruFor(e)?.players[e.id];
  showDialog(`${dlgHead(`${esc(e.league.name)}${e.round ? ' · ' + esc(e.round) : ''}`)}
    <div class="vs">
      <div>${e.home.logo ? `<img src="${esc(e.home.logo)}" alt="" width="56" height="56">` : ''}<b>${esc(e.home.name)}</b></div>
      <div class="vs-mid">${e.state === 'pre' ? `<span class="big">${fmtTime.format(e.date)}</span>` : `<span class="big">${esc(e.home.score)} – ${esc(e.away.score)}</span>${statusHTML(e)}`}</div>
      <div>${e.away.logo ? `<img src="${esc(e.away.logo)}" alt="" width="56" height="56">` : ''}<b>${esc(e.away.name)}</b></div>
    </div>
    <ul class="facts">
      <li>${ic('calendar')}${esc(cap(fmtDayLong.format(e.date)))}, ${fmtTime.format(e.date)}</li>
      ${e.venue ? `<li>${ic('pin')}${esc(e.venue)}${e.city ? ', ' + esc(e.city) : ''}</li>` : ''}
      <li>${ic('tv')}${e.tv.length ? esc(e.tv.join(', ')) : 'Transmisión no informada'}</li>
    </ul>
    ${list?.length ? `<h4 class="dlg-sub">Uruguayos en los planteles</h4><ul class="uru-players in-dlg">${playerChips(list, e)}</ul>` : ''}
    <div class="actions">
      ${e.state === 'pre' ? `<button class="btn filled" type="button" data-ics="${esc(e.id)}">${ic('calendar')}Agregar al calendario</button>` : ''}
      ${e.link ? `<a class="btn text" href="${esc(e.link)}" target="_blank" rel="noopener">Ficha en ESPN${ic('external')}</a>` : ''}
    </div>`);
}

function downloadICS(e) {
  const dt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = new Date(e.date.getTime() + 2 * 3600_000);
  const names = (uruFor(e)?.players[e.id] || []).filter(p => p.m || p.s20).map(p => p.n).join(', ');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Celestes//ES', 'BEGIN:VEVENT',
    `UID:${e.id}@celestes`, `DTSTAMP:${dt(new Date())}`, `DTSTART:${dt(e.date)}`, `DTEND:${dt(end)}`,
    `SUMMARY:${e.home.name} vs ${e.away.name} (${e.league.name})`,
    `LOCATION:${e.venue}`, `DESCRIPTION:${names ? 'Uruguayos: ' + names + '. ' : ''}TV: ${e.tv.join(', ') || 'no informada'}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Empieza el partido', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' })), download: `${e.home.short}-${e.away.short}.ics` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Jugadores (estadísticas) ---------- */
let statsData = null;
async function loadStats() {
  if (statsData) return statsData;
  statsData = (await getJSON('api/jugadores', 6 * 3600_000)).players;
  fillPlayerSelects();
  return statsData;
}
const selTot = (p, k) => (state.statsLevel === 'sub20' ? p.sub20?.[k] || 0 : state.statsLevel === 'mayor' ? p.mayor?.[k] || 0 : (p.mayor?.[k] || 0) + (p.sub20?.[k] || 0));
const SORTS = {
  selPj: (a, b) => selTot(b, 'pj') - selTot(a, 'pj'),
  selG: (a, b) => selTot(b, 'g') - selTot(a, 'g') || selTot(b, 'pj') - selTot(a, 'pj'),
  clubG: (a, b) => b.temp.g - a.temp.g || b.temp.a - a.temp.a,
  clubA: (a, b) => b.temp.a - a.temp.a || b.temp.g - a.temp.g,
  clubTit: (a, b) => b.temp.tit - a.temp.tit,
  age: (a, b) => (a.age || 99) - (b.age || 99),
  name: (a, b) => a.n.localeCompare(b.n),
};
const lvlTags = p => `${p.mayor ? '<span class="tag mayor">Mayor</span>' : ''}${p.sub20 ? '<span class="tag s20">Sub-20</span>' : ''}`;

let statsReq = 0;
async function renderStats() {
  const box = $('#statsList');
  const req = ++statsReq;
  if (!statsData) box.innerHTML = loading('Cargando jugadores… la primera vez puede tardar hasta un minuto.') + skeleton(6);
  let list;
  try { list = await loadStats(); } catch (err) {
    if (req === statsReq) box.innerHTML = errorBox('No se pudieron cargar las estadísticas.', err, 'retryStats');
    return;
  }
  if (req !== statsReq) return;
  setSub(`${list.length} jugadores en actividad`);
  const q = norm(state.statsQuery);
  const rows = list
    .filter(p => (state.statsLevel === 'all' || p[state.statsLevel]) && (!q || norm(p.n).includes(q) || norm(p.club.name).includes(q)))
    .sort(SORTS[state.statsSort] || SORTS.selPj);
  const lvlName = state.statsLevel === 'sub20' ? 'Sub-20' : state.statsLevel === 'mayor' ? 'Mayor' : 'Sel.';
  box.innerHTML = rows.length ? `<div class="plist">
      <div class="plist-head"><span>${rows.length} ${rows.length === 1 ? 'jugador' : 'jugadores'}</span><span title="Partidos con la selección">PJ<small>${lvlName}</small></span><span title="Goles con la selección">G<small>${lvlName}</small></span><span title="Goles con el club esta temporada">G<small>club</small></span></div>
      ${rows.map(p => `<button class="prow" data-player="${esc(p.id)}">
        ${avatar(p, 'md')}
        <span class="pinfo"><b>${esc(p.n)}</b><small>${p.club.logo ? `<img src="${esc(p.club.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${esc(p.club.name)}${p.age ? ` · ${p.age} años` : ''}</small><span class="tags">${lvlTags(p)}</span></span>
        ${[selTot(p, 'pj'), selTot(p, 'g'), p.temp.g].map(v => `<span class="pnum ${v ? '' : 'dim'}">${v}</span>`).join('')}
      </button>`).join('')}
    </div>` : `<div class="empty"><b>Sin resultados</b><small>Probá con otro nombre o club.</small></div>`;
}

function openPlayer(id) {
  const p = statsData?.find(x => x.id === id);
  if (!p) return;
  const selBlock = (title, s) => s ? `<h4 class="dlg-sub">${title}</h4>
    <div class="kpis"><div><b>${s.pj}</b><small>Partidos</small></div><div><b>${s.tit}</b><small>Titular</small></div><div><b>${s.g}</b><small>Goles</small></div><div><b>${s.a}</b><small>Asist.</small></div><div><b>${s.ta}</b><small>Amarillas</small></div><div><b>${s.tr}</b><small>Rojas</small></div></div>
    <p class="kpi-note">Último partido: ${fmtDate(s.last)}</p>` : '';
  showDialog(`<div class="phero">
      <button class="icon-btn phero-close" value="close" aria-label="Cerrar">${ic('close')}</button>
      ${avatar(p, 'xl')}
      <div class="phero-txt">
        <span class="tags">${lvlTags(p)}</span>
        <h3>${esc(p.n)}</h3>
        <p>${p.club.logo ? `<img src="${esc(p.club.logo)}" alt="" onerror="this.remove()">` : ''}${esc(p.club.name)}${p.pos ? ' · ' + esc(POS[p.pos] || p.pos) : ''}${p.age ? ' · ' + p.age + ' años' : ''}</p>
      </div>
    </div>
    <div class="actions"><button class="btn filled" type="button" data-videos-of="${esc(p.id)}">${ic('play')}Videos</button><button class="btn" type="button" data-news-of="${esc(p.id)}">${ic('news')}Noticias</button></div>
    ${typeof formBlock === 'function' ? formBlock(p) : ''}
    ${selBlock('Selección Mayor', p.mayor)}
    ${selBlock('Selección Sub-20', p.sub20)}
    <h4 class="dlg-sub">Club · temporada actual</h4>
    ${p.splits.length ? `<div class="table-wrap"><table class="stats small">
      <thead><tr><th class="l">Competición</th><th>Tit</th><th>G</th><th>A</th><th>Rem</th><th>Arco</th><th>TA</th><th>TR</th></tr></thead>
      <tbody>${p.splits.map(sp => `<tr><td class="l">${esc(sp.name)}</td><td>${sp.tit}</td><td>${sp.g}</td><td>${sp.a}</td><td>${sp.sh}</td><td>${sp.sog}</td><td>${sp.ta}</td><td>${sp.tr}</td></tr>`).join('')}
      <tr class="tot"><td class="l">Total</td><td>${p.temp.tit}</td><td>${p.temp.g}</td><td>${p.temp.a}</td><td>${p.temp.sh}</td><td>${p.temp.sog}</td><td>${p.temp.ta}</td><td>${p.temp.tr}</td></tr></tbody>
    </table></div>` : `<p class="kpi-note">ESPN no tiene estadísticas de esta temporada para su liga.</p>`}
    ${p.next ? `<h4 class="dlg-sub">Próximo partido</h4><div class="next">${ic('calendar')}<div><b>${esc(p.next.name.replace(' at ', ' vs. '))}</b><small>${esc(p.next.league)} · ${esc(cap(fmtDayLong.format(new Date(p.next.date))))}, ${fmtTime.format(new Date(p.next.date))}</small></div></div>` : ''}
    <div id="playerNews"></div>
    <div class="actions"><a class="btn text" href="${esc(p.link)}" target="_blank" rel="noopener">Ficha en ESPN${ic('external')}</a></div>`, 'pcard');
  if (typeof paintCallBox === 'function') loadSel().then(() => paintCallBox(p)).catch(() => {});
  // Últimas noticias del jugador.
  loadNews().then(d => {
    const items = d.items.filter(n => n.ids.includes(p.id)).slice(0, 4);
    const box = $('#playerNews');
    if (box && items.length) box.innerHTML = `<h4 class="dlg-sub">Últimas noticias</h4><div class="news-list">${items.map(n => newsRow(n)).join('')}</div>`;
  }).catch(() => {});
}

/* ---------- Noticias ---------- */
let newsData = null;
async function loadNews() {
  if (newsData && Date.now() - newsData.t < 15 * 60_000) return newsData.d;
  const d = await getJSON('api/noticias', 15 * 60_000);
  newsData = { t: Date.now(), d };
  return d;
}
const favicon = n => n.domain ? `<img class="fav" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(n.domain)}&sz=64" alt="" loading="lazy" onerror="this.remove()">` : '';
const newsTags = n => {
  const people = n.ids.map(id => newsData?.d.people[id]).filter(Boolean);
  return people.length ? `<span class="ntags">${people.slice(0, 3).map(p => `<span class="ntag">${avatar(p, 'xxs')}${esc(shortName(p.n))}</span>`).join('')}</span>`
    : n.sel ? '<span class="ntags"><span class="ntag sel">Selección</span></span>' : '';
};
const newsMeta = n => `<span class="nmeta">${favicon(n)}<span>${esc(n.src || n.domain)}</span><span class="dot">·</span><span>${ago(n.date)}</span></span>`;
function newsHero(n) {
  return `<a class="nhero" href="${esc(n.link)}" target="_blank" rel="noopener">
    <span class="nhero-img"><img src="${esc(n.img)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></span>
    <span class="nhero-txt">${newsMeta(n)}<b>${esc(n.t)}</b>${n.desc ? `<p>${esc(n.desc)}</p>` : ''}${newsTags(n)}</span>
  </a>`;
}
function newsRow(n) {
  return `<a class="nrow" href="${esc(n.link)}" target="_blank" rel="noopener">
    <span class="nrow-txt">${newsMeta(n)}<b>${esc(n.t)}</b>${n.desc ? `<p>${esc(n.desc)}</p>` : ''}${newsTags(n)}</span>
    ${n.img ? `<span class="nrow-img"><img src="${esc(n.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></span>` : ''}
  </a>`;
}
let newsReq = 0;
async function renderNews() {
  const box = $('#newsList');
  const req = ++newsReq;
  if (!newsData) box.innerHTML = loading('Juntando noticias…') + skeleton(5);
  let d;
  try { d = await loadNews(); } catch (err) {
    if (req === newsReq) box.innerHTML = errorBox('No se pudieron cargar las noticias.', err, 'retryNews');
    return;
  }
  if (req !== newsReq) return;
  // Filtros: chips con la foto de cada jugador, ordenados por cantidad de notas.
  const counts = {};
  d.items.forEach(n => n.ids.forEach(id => { counts[id] = (counts[id] || 0) + 1; }));
  const chip = (val, label, extra = '') => `<button class="fchip ${state.newsPlayer === val ? 'on' : ''}" data-news-filter="${esc(val)}">${extra}${label}</button>`;
  $('#newsFilters').innerHTML = chip('', 'Todas') + chip('sel', 'Selección')
    + Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 40)
      .map(([id, c]) => chip(id, `${esc(shortName(d.people[id]?.n || id))} <small>${c}</small>`, avatar(d.people[id], 'xxs'))).join('');
  const items = d.items.filter(n => !state.newsPlayer || (state.newsPlayer === 'sel' ? n.sel : n.ids.includes(state.newsPlayer)));
  if (!items.length) { box.innerHTML = `<div class="empty"><b>Sin noticias recientes</b><small>No hay notas de los últimos 10 días para este filtro.</small></div>`; return; }
  const heroIdx = items.findIndex(n => n.img);
  const hero = heroIdx >= 0 ? items[heroIdx] : null;
  const rest = items.filter((_, i) => i !== heroIdx).slice(0, 120);
  box.innerHTML = `${hero ? newsHero(hero) : ''}<div class="news-list">${rest.map(newsRow).join('')}</div>`;
}

/* ---------- Videos ---------- */
const KIND_LABEL = { gol: 'Gol', resumen: 'Resumen', short: 'Short', clip: 'Clip', largo: 'Video' };
const fmtSecs = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
let videoReq = 0;
async function renderVideos() {
  const box = $('#videoList');
  const req = ++videoReq;
  loadStats().catch(() => {}); // para llenar el selector de jugadores
  box.innerHTML = loading('Buscando videos…') + skeleton(4);
  let d;
  try { d = await getJSON(`api/videos${state.videoPlayer ? `?player=${encodeURIComponent(state.videoPlayer)}` : ''}`, 6 * 3600_000); } catch (err) {
    if (req === videoReq) box.innerHTML = errorBox('No se pudieron cargar los videos.', err, 'retryVideos');
    return;
  }
  if (req !== videoReq) return;
  if (d.error === 'no_key') {
    box.innerHTML = `<div class="empty"><b>Los videos todavía no están activados</b><small>Falta cargar la clave gratuita de YouTube en Vercel (variable <code>YOUTUBE_API_KEY</code>).</small></div>`;
    return;
  }
  if (d.error) { box.innerHTML = errorBox('YouTube devolvió un error.', new Error(d.error), 'retryVideos'); return; }
  const vids = d.videos.filter(v => state.videoKind === 'all' || v.kind === state.videoKind);
  box.innerHTML = vids.length ? `<div class="vgrid">${vids.map(v => `<button class="vcard ${v.kind === 'short' ? 'is-short' : ''}" data-video="${esc(v.id)}" data-title="${esc(v.t)}">
      <span class="thumb"><img src="${esc(v.thumb)}" alt="" loading="lazy"><i>${v.kind === 'short' ? 'Short' : fmtSecs(v.secs)}</i></span>
      <b>${esc(v.t)}</b><small>${esc(v.ch)} · ${ago(v.date)} · ${KIND_LABEL[v.kind] || ''}</small>
    </button>`).join('')}</div>` : `<div class="empty"><b>Sin videos recientes</b><small>${state.videoKind !== 'all' ? 'Probá con otro tipo de video.' : 'No encontramos videos de las últimas semanas.'}</small></div>`;
}
function openVideo(id, title) {
  showDialog(`${dlgHead(esc(title))}
    <div class="player"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0" title="${esc(title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
    <div class="actions"><a class="btn text" href="https://www.youtube.com/watch?v=${encodeURIComponent(id)}" target="_blank" rel="noopener">Abrir en YouTube${ic('external')}</a></div>`);
}

function fillPlayerSelects() {
  if (!statsData) return;
  const sorted = statsData.slice().sort((a, b) => (b.mayor?.pj || 0) - (a.mayor?.pj || 0) || a.n.localeCompare(b.n));
  const opts = sorted.map(p => `<option value="${esc(p.id)}">${esc(p.n)}${p.mayor ? '' : ' (Sub-20)'}</option>`).join('');
  const vs = $('#videoPlayer');
  vs.innerHTML = `<option value="">Selección uruguaya</option>${opts}`;
  vs.value = state.videoPlayer;
}

/* ---------- UI general ---------- */
const POS = { G: 'Arquero', D: 'Defensa', M: 'Mediocampista', F: 'Delantero' };
const dlgHead = label => `<header class="dlg-head"><span>${label}</span><button class="icon-btn" value="close" aria-label="Cerrar">${ic('close')}</button></header>`;
const SUBS = { sel: () => 'Selección uruguaya', uru: () => 'Uruguayos en la cancha', stats: () => statsData ? `${statsData.length} jugadores en actividad` : 'Jugadores en actividad', news: () => 'Últimos 10 días', videos: () => 'Goles, resúmenes y shorts' };
function setSub(text) { $('#appbarSub').textContent = text; }

function showDialog(html, kind = '') {
  const dlg = $('#detail');
  dlg.innerHTML = `<form method="dialog" class="dlg ${kind}">${html}</form>`;
  if (!dlg.open) dlg.showModal();
}
$('#detail').addEventListener('close', () => { $('#detail').innerHTML = ''; }); // corta el video al cerrar
$('#detail').addEventListener('click', ev => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.navbar button').forEach(b => (b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  document.querySelectorAll('section.view').forEach(v => (v.hidden = v.id !== `view-${tab}`));
  setSub(SUBS[tab]());
  window.scrollTo(0, 0);
  if (tab === 'sel') loadStats().catch(() => {}); // fotos y fichas de jugadores
  ({ sel: renderSel, uru: renderUru, stats: renderStats, news: renderNews, videos: renderVideos })[tab]();
}
function syncSeg(sel, val) { document.querySelectorAll(`${sel} button`).forEach(b => b.classList.toggle('on', (b.dataset.level || b.dataset.kind) === val)); }

document.addEventListener('click', ev => {
  // Sección Selección (y su selector de jugadores en el diálogo).
  if ((state.tab === 'sel' || ev.target.closest('#detail')) && typeof onSelClick === 'function' && onSelClick(ev)) return;
  const el = ev.target.closest('button, a');
  if (!el) return;
  if (el.matches('.navbar button')) return setTab(el.dataset.tab);
  if (el.id === 'prevDay') { state.day = addDays(state.day, -1); return renderUru(); }
  if (el.id === 'nextDay') { state.day = addDays(state.day, 1); return renderUru(); }
  if (el.matches('.day')) { state.day = addDays(state.day, +el.dataset.off); return renderUru(); }
  if (el.id === 'retryUru') { memCache.clear(); uruCache.clear(); return renderUru(); }
  if (el.id === 'retryStats') { memCache.clear(); statsData = null; return renderStats(); }
  if (el.id === 'retryNews') { memCache.clear(); newsData = null; return renderNews(); }
  if (el.id === 'retryVideos') { memCache.clear(); return renderVideos(); }
  if (el.dataset.ev) { const e = currentEvents.get(el.dataset.ev); if (e) openEvent(e); return; }
  if (el.dataset.ics) { ev.preventDefault(); return downloadICS(currentEvents.get(el.dataset.ics)); }
  if (el.dataset.video) return openVideo(el.dataset.video, el.dataset.title);
  if (el.dataset.videosOf) { ev.preventDefault(); $('#detail').close(); state.videoPlayer = el.dataset.videosOf; state.videoKind = 'all'; syncSeg('#videoKind', 'all'); fillPlayerSelects(); return setTab('videos'); }
  if (el.dataset.newsFilter !== undefined) { state.newsPlayer = el.dataset.newsFilter; window.scrollTo({ top: 0 }); return renderNews(); }
  if (el.dataset.player && !el.closest('#statsList')) { if (playerById(el.dataset.player)) return openPlayer(el.dataset.player); if (el.dataset.evFallback) { const e = currentEvents.get(el.dataset.evFallback); if (e) openEvent(e); } return; }
  if (el.dataset.newsOf) { ev.preventDefault(); $('#detail').close(); state.newsPlayer = el.dataset.newsOf; return setTab('news'); }
  if (el.matches('#statsLevel button')) { state.statsLevel = el.dataset.level; syncSeg('#statsLevel', el.dataset.level); return renderStats(); }
  if (el.matches('#videoKind button')) { state.videoKind = el.dataset.kind; syncSeg('#videoKind', el.dataset.kind); return renderVideos(); }
});

$('#statsList').addEventListener('click', ev => { const row = ev.target.closest('[data-player]'); if (row) openPlayer(row.dataset.player); });
// Jugadores dentro de las tarjetas de partido (son <li>, no botones).
$('#uruList').addEventListener('click', ev => { const li = ev.target.closest('li[data-player]'); if (li) { ev.stopPropagation(); openPlayer(li.dataset.player); } });
$('#view-sel').addEventListener('input', onSelInput);
// Líderes de la sección Selección (son <li>).
$('#view-sel').addEventListener('click', ev => { const li = ev.target.closest('li[data-player]'); if (li && playerById(li.dataset.player)) openPlayer(li.dataset.player); });
$('#statsSort').value = state.statsSort;
$('#statsSort').addEventListener('change', ev => { state.statsSort = ev.target.value; store.set('statsSort', state.statsSort); renderStats(); });
let statsTimer;
$('#statsSearch').addEventListener('input', ev => { clearTimeout(statsTimer); statsTimer = setTimeout(() => { state.statsQuery = ev.target.value; renderStats(); }, 150); });
$('#uruAll').checked = state.uruAll;
$('#uruAll').addEventListener('change', ev => { state.uruAll = ev.target.checked; store.set('uruAll', state.uruAll); renderUru(); });

$('#videoPlayer').addEventListener('change', ev => { state.videoPlayer = ev.target.value; renderVideos(); });
$('#appVersion').textContent = `Videos de YouTube (se actualizan cada 12 h). Versión ${APP_VERSION}.`;

// La barra superior muestra un borde al desplazarse.
addEventListener('scroll', () => $('.appbar').classList.toggle('scrolled', scrollY > 4), { passive: true });

document.addEventListener('visibilitychange', () => { if (!document.hidden && state.tab === 'uru') renderUru(); });

// Swipe entre días en Partidos
let touchX = null;
$('#view-uru').addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
$('#view-uru').addEventListener('touchend', e => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX; touchX = null;
  if (Math.abs(dx) > 80) { state.day = addDays(state.day, dx < 0 ? 1 : -1); renderUru(); }
}, { passive: true });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}

// Enlace directo (p. ej. al volver del inicio de sesión con Google): ?tab=sel&vista=votar
const params = new URLSearchParams(location.search);
if (params.get('vista') && typeof sel !== 'undefined') sel.view = params.get('vista');
if (params.has('tab') && !params.has('code')) history.replaceState(null, '', location.pathname);
setTab(['sel', 'uru', 'stats', 'news', 'videos'].includes(params.get('tab')) ? params.get('tab') : 'sel');
// Limpia el ?code= de la URL una vez que Supabase lo canjeó por la sesión.
if (params.has('code')) setTimeout(() => history.replaceState(null, '', location.pathname), 4000);
