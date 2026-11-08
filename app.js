'use strict';
// Celestes: los uruguayos de la selección — partidos, estadísticas, noticias y videos.

const APP_VERSION = '8';
const LEAGUES = window.LEAGUES;
const LEAGUE_BY_ID = Object.fromEntries(LEAGUES.map(l => [l.id, l]));
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- Estado y almacenamiento local ---------- */
const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin storage */ } },
};
const state = {
  tab: 'uru',
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
const errorBox = (msg, err, retryId) => `<div class="empty">${msg}<br><small>${esc(err.message)}</small><br><button class="btn" id="${retryId}">Reintentar</button></div>`;

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
    ${e.tv.length ? `<div class="m-tv" title="${esc(e.tv.join(', '))}">📺 ${esc(e.tv.slice(0, 2).join(', '))}</div>` : ''}
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
    const lvl = p.m ? '<b class="lvl mayor">Mayor</b>' : p.s20 ? '<b class="lvl s20">Sub-20</b>' : '';
    return `<li><span class="pname">${esc(p.n)}</span> <small>${esc(team)}${p.p ? ' · ' + esc(p.p) : ''}</small> ${lvl}</li>`;
  }).join('');
}

let uruReq = 0;
async function renderUru() {
  renderDays();
  const list = $('#uruList');
  const req = ++uruReq;
  list.innerHTML = `<p class="hint">Revisando planteles… la primera vez del día puede tardar unos segundos.</p>` + skeleton(4);
  let d;
  try { d = await fetchUru(state.day); } catch (err) {
    if (req === uruReq) list.innerHTML = errorBox('No se pudo revisar los planteles.', err, 'retryUru');
    return;
  }
  if (req !== uruReq) return;
  d.events.forEach(e => currentEvents.set(e.id, e));
  const parts = [`<h2 class="section-title">${esc(cap(fmtDayLong.format(state.day)))}</h2>`];
  const sel = d.events.filter(e => d.seleccion[e.id]);
  if (sel.length) {
    parts.push(`<div class="league uru-league"><h3>🇺🇾 Selección uruguaya</h3>${sel.map(e =>
      eventCard(e, `<span class="uru-badge">${d.seleccion[e.id] === 'sub20' ? 'Sub-20' : 'Mayor'}</span>`)).join('')}</div>`);
  }
  const withPlayers = d.events.filter(e => !d.seleccion[e.id] && shownPlayers(d.players[e.id] || []).length);
  const total = withPlayers.reduce((n, e) => n + shownPlayers(d.players[e.id]).length, 0);
  const live = withPlayers.filter(e => e.state === 'in').length;
  if (withPlayers.length) parts.push(`<p class="hint">${withPlayers.length} ${withPlayers.length === 1 ? 'partido' : 'partidos'} · ${total} ${total === 1 ? 'jugador' : 'jugadores'}${live ? ` · <b class="live-txt">${live} en vivo</b>` : ''}</p>`);
  for (const [id, evs] of groupByLeague(withPlayers)) {
    const l = LEAGUE_BY_ID[id];
    parts.push(`<div class="league"><h3><span>${l.flag}</span> ${esc(l.name)}</h3>${evs.map(e =>
      `<div class="uru-item">${eventCard(e)}<ul class="uru-players">${playerChips(shownPlayers(d.players[e.id]), e)}</ul></div>`).join('')}</div>`);
  }
  if (!sel.length && !withPlayers.length) {
    parts.push(`<div class="empty">No hay partidos con uruguayos ${state.uruAll ? '' : 'de selección '}este día.${state.uruAll ? '' : '<br><small>Probá activar "Incluir otros uruguayos".</small>'}</div>`);
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
  showDialog(`<header><small>${e.league.flag} ${esc(e.league.name)}${e.round ? ' · ' + esc(e.round) : ''}</small><button class="icon-btn" value="close" aria-label="Cerrar">✕</button></header>
    <div class="vs">
      <div>${e.home.logo ? `<img src="${esc(e.home.logo)}" alt="" width="56" height="56">` : ''}<b>${esc(e.home.name)}</b></div>
      <div class="vs-mid">${e.state === 'pre' ? `<span class="big">${fmtTime.format(e.date)}</span>` : `<span class="big">${esc(e.home.score)} – ${esc(e.away.score)}</span>`}${statusHTML(e)}</div>
      <div>${e.away.logo ? `<img src="${esc(e.away.logo)}" alt="" width="56" height="56">` : ''}<b>${esc(e.away.name)}</b></div>
    </div>
    <ul class="facts">
      <li>📅 ${esc(cap(fmtDayLong.format(e.date)))}, ${fmtTime.format(e.date)}</li>
      ${e.venue ? `<li>📍 ${esc(e.venue)}${e.city ? ', ' + esc(e.city) : ''}</li>` : ''}
      <li>📺 ${e.tv.length ? esc(e.tv.join(', ')) : 'Transmisión no informada'}</li>
    </ul>
    ${list?.length ? `<h4 class="dlg-sub">🇺🇾 Uruguayos en los planteles</h4><ul class="uru-players">${playerChips(list, e)}</ul>` : ''}
    <div class="actions">
      ${e.state === 'pre' ? `<button class="btn" type="button" data-ics="${esc(e.id)}">🗓️ Agregar al calendario</button>` : ''}
      ${e.link ? `<a class="btn" href="${esc(e.link)}" target="_blank" rel="noopener">Ficha completa ↗</a>` : ''}
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
const lvlTags = p => `${p.mayor ? '<b class="lvl mayor">Mayor</b>' : ''}${p.sub20 ? '<b class="lvl s20">Sub-20</b>' : ''}`;

let statsReq = 0;
async function renderStats() {
  const box = $('#statsList');
  const req = ++statsReq;
  if (!statsData) box.innerHTML = `<p class="hint">Cargando jugadores… la primera vez puede tardar hasta un minuto.</p>` + skeleton(6);
  let list;
  try { list = await loadStats(); } catch (err) {
    if (req === statsReq) box.innerHTML = errorBox('No se pudieron cargar las estadísticas.', err, 'retryStats');
    return;
  }
  if (req !== statsReq) return;
  const q = norm(state.statsQuery);
  const rows = list
    .filter(p => (state.statsLevel === 'all' || p[state.statsLevel]) && (!q || norm(p.n).includes(q) || norm(p.club.name).includes(q)))
    .sort(SORTS[state.statsSort] || SORTS.selPj);
  const lvlName = state.statsLevel === 'sub20' ? 'Sub-20' : state.statsLevel === 'mayor' ? 'Mayor' : 'Selección';
  box.innerHTML = rows.length ? `<p class="hint">${rows.length} jugadores en actividad</p>
    <div class="table-wrap"><table class="stats">
      <thead><tr><th class="l">Jugador</th><th title="Partidos con la selección">PJ<small>${lvlName}</small></th><th title="Goles con la selección">G<small>${lvlName}</small></th><th title="Goles con el club esta temporada">G<small>club</small></th><th title="Asistencias con el club esta temporada">A<small>club</small></th></tr></thead>
      <tbody>${rows.map(p => `<tr data-player="${esc(p.id)}">
        <td class="l"><span class="pname">${esc(p.n)}</span><small>${p.club.logo ? `<img src="${esc(p.club.logo)}" alt="" width="14" height="14" loading="lazy">` : ''}${esc(p.club.name)}${p.age ? ' · ' + p.age : ''}</small><span class="tags">${lvlTags(p)}</span></td>
        <td>${selTot(p, 'pj')}</td><td>${selTot(p, 'g')}</td><td>${p.temp.g}</td><td>${p.temp.a}</td></tr>`).join('')}</tbody>
    </table></div>` : `<div class="empty">Sin resultados.</div>`;
}

function openPlayer(id) {
  const p = statsData?.find(x => x.id === id);
  if (!p) return;
  const selBlock = (title, s) => s ? `<h4 class="dlg-sub">${title}</h4>
    <div class="kpis"><div><b>${s.pj}</b><small>Partidos</small></div><div><b>${s.tit}</b><small>Titular</small></div><div><b>${s.g}</b><small>Goles</small></div><div><b>${s.a}</b><small>Asist.</small></div><div><b>${s.ta}</b><small>Amarillas</small></div><div><b>${s.tr}</b><small>Rojas</small></div></div>
    <p class="hint">Último partido: ${fmtDate(s.last)}</p>` : '';
  showDialog(`<header><small>${lvlTags(p)}</small><button class="icon-btn" value="close" aria-label="Cerrar">✕</button></header>
    <div class="player-head">${p.club.logo ? `<img src="${esc(p.club.logo)}" alt="" width="48" height="48">` : ''}
      <div><h3>${esc(p.n)}</h3><small>${esc(p.club.name)}${p.pos ? ' · ' + esc(p.pos) : ''}${p.age ? ' · ' + p.age + ' años' : ''}</small></div></div>
    <div class="actions"><button class="btn" type="button" data-videos-of="${esc(p.id)}">▶️ Videos</button><button class="btn" type="button" data-news-of="${esc(p.id)}">📰 Noticias</button></div>
    ${selBlock('🇺🇾 Selección Mayor', p.mayor)}
    ${selBlock('🇺🇾 Sub-20', p.sub20)}
    <h4 class="dlg-sub">Club · temporada actual</h4>
    <div class="table-wrap"><table class="stats small">
      <thead><tr><th class="l">Competición</th><th>Tit</th><th>G</th><th>A</th><th>Rem</th><th>Arco</th><th>TA</th><th>TR</th></tr></thead>
      <tbody>${p.splits.map(sp => `<tr><td class="l">${esc(sp.name)}</td><td>${sp.tit}</td><td>${sp.g}</td><td>${sp.a}</td><td>${sp.sh}</td><td>${sp.sog}</td><td>${sp.ta}</td><td>${sp.tr}</td></tr>`).join('')}
      <tr class="tot"><td class="l">Total</td><td>${p.temp.tit}</td><td>${p.temp.g}</td><td>${p.temp.a}</td><td>${p.temp.sh}</td><td>${p.temp.sog}</td><td>${p.temp.ta}</td><td>${p.temp.tr}</td></tr></tbody>
    </table></div>
    ${p.next ? `<h4 class="dlg-sub">Próximo partido</h4><p class="next">${esc(p.next.name)}<br><small>${esc(p.next.league)} · ${esc(cap(fmtDayLong.format(new Date(p.next.date))))}, ${fmtTime.format(new Date(p.next.date))}</small></p>` : ''}
    <div id="playerNews"></div>
    <div class="actions"><a class="btn" href="${esc(p.link)}" target="_blank" rel="noopener">Ficha en ESPN ↗</a></div>`);
  // Últimas noticias del jugador.
  loadNews().then(d => {
    const items = d.items.filter(n => n.ids.includes(p.id)).slice(0, 4);
    const box = $('#playerNews');
    if (box && items.length) box.innerHTML = `<h4 class="dlg-sub">Últimas noticias</h4><div class="news-mini">${items.map(newsCard).join('')}</div>`;
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
function newsCard(n) {
  const names = n.ids.map(id => newsData?.d.names[id]).filter(Boolean);
  return `<a class="news" href="${esc(n.link)}" target="_blank" rel="noopener">
    ${n.img ? `<img src="${esc(n.img)}" alt="" loading="lazy">` : ''}
    <div><b>${esc(n.t)}</b><small>${esc(n.src || '')} · ${ago(n.date)}</small>
    ${names.length ? `<span class="tags">${names.slice(0, 3).map(x => `<i class="ptag">${esc(x)}</i>`).join('')}</span>` : n.sel ? '<span class="tags"><i class="ptag sel">Selección</i></span>' : ''}</div>
  </a>`;
}
let newsReq = 0;
async function renderNews() {
  const box = $('#newsList');
  const req = ++newsReq;
  if (!newsData) box.innerHTML = `<p class="hint">Juntando noticias…</p>` + skeleton(5);
  let d;
  try { d = await loadNews(); } catch (err) {
    if (req === newsReq) box.innerHTML = errorBox('No se pudieron cargar las noticias.', err, 'retryNews');
    return;
  }
  if (req !== newsReq) return;
  // Selector: jugadores con noticias, ordenados por cantidad.
  const counts = {};
  d.items.forEach(n => n.ids.forEach(id => { counts[id] = (counts[id] || 0) + 1; }));
  const sel = $('#newsPlayer');
  const opts = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id, c]) => `<option value="${esc(id)}">${esc(d.names[id] || id)} (${c})</option>`);
  sel.innerHTML = `<option value="">Todas las noticias (${d.items.length})</option><option value="sel">Solo selección</option>${opts.join('')}`;
  sel.value = state.newsPlayer;
  const items = d.items.filter(n => !state.newsPlayer || (state.newsPlayer === 'sel' ? n.sel : n.ids.includes(state.newsPlayer)));
  box.innerHTML = items.length ? items.slice(0, 150).map(newsCard).join('') : `<div class="empty">Sin noticias recientes para este filtro.</div>`;
}

/* ---------- Videos ---------- */
const KIND_LABEL = { gol: 'Gol', resumen: 'Resumen', short: 'Short', clip: 'Clip', largo: 'Video' };
const fmtSecs = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
let videoReq = 0;
async function renderVideos() {
  const box = $('#videoList');
  const req = ++videoReq;
  loadStats().catch(() => {}); // para llenar el selector de jugadores
  box.innerHTML = `<p class="hint">Buscando videos…</p>` + skeleton(4);
  let d;
  try { d = await getJSON(`api/videos${state.videoPlayer ? `?player=${encodeURIComponent(state.videoPlayer)}` : ''}`, 6 * 3600_000); } catch (err) {
    if (req === videoReq) box.innerHTML = errorBox('No se pudieron cargar los videos.', err, 'retryVideos');
    return;
  }
  if (req !== videoReq) return;
  if (d.error === 'no_key') {
    box.innerHTML = `<div class="empty"><b>Falta la clave de YouTube.</b><br><small>Para ver videos hay que cargar una clave gratuita de la API de YouTube en Vercel (variable <code>YOUTUBE_API_KEY</code>).</small></div>`;
    return;
  }
  if (d.error) { box.innerHTML = errorBox('YouTube devolvió un error.', new Error(d.error), 'retryVideos'); return; }
  const vids = d.videos.filter(v => state.videoKind === 'all' || v.kind === state.videoKind);
  box.innerHTML = vids.length ? `<div class="vgrid">${vids.map(v => `<button class="vcard ${v.kind === 'short' ? 'is-short' : ''}" data-video="${esc(v.id)}" data-title="${esc(v.t)}">
      <span class="thumb"><img src="${esc(v.thumb)}" alt="" loading="lazy"><i>${v.kind === 'short' ? 'Short' : fmtSecs(v.secs)}</i></span>
      <b>${esc(v.t)}</b><small>${esc(v.ch)} · ${ago(v.date)} · ${KIND_LABEL[v.kind] || ''}</small>
    </button>`).join('')}</div>` : `<div class="empty">No hay videos recientes${state.videoKind !== 'all' ? ' de este tipo' : ''}.</div>`;
}
function openVideo(id, title) {
  showDialog(`<header><small>${esc(title)}</small><button class="icon-btn" value="close" aria-label="Cerrar">✕</button></header>
    <div class="player"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0" title="${esc(title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
    <div class="actions"><a class="btn" href="https://www.youtube.com/watch?v=${encodeURIComponent(id)}" target="_blank" rel="noopener">Abrir en YouTube ↗</a></div>`);
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
function showDialog(html) {
  const dlg = $('#detail');
  dlg.innerHTML = `<form method="dialog" class="dlg">${html}</form>`;
  if (!dlg.open) dlg.showModal();
}
$('#detail').addEventListener('close', () => { $('#detail').innerHTML = ''; }); // corta el video al cerrar
$('#detail').addEventListener('click', ev => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.querySelectorAll('section.view').forEach(v => (v.hidden = v.id !== `view-${tab}`));
  $('#dayNav').hidden = tab !== 'uru';
  window.scrollTo(0, 0);
  ({ uru: renderUru, stats: renderStats, news: renderNews, videos: renderVideos })[tab]();
}
function syncSeg(sel, val) { document.querySelectorAll(`${sel} button`).forEach(b => b.classList.toggle('on', (b.dataset.level || b.dataset.kind) === val)); }

document.addEventListener('click', ev => {
  const el = ev.target.closest('button, a');
  if (!el) return;
  if (el.matches('.tabs [role=tab]')) return setTab(el.dataset.tab);
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
  if (el.dataset.newsOf) { ev.preventDefault(); $('#detail').close(); state.newsPlayer = el.dataset.newsOf; return setTab('news'); }
  if (el.matches('#statsLevel button')) { state.statsLevel = el.dataset.level; syncSeg('#statsLevel', el.dataset.level); return renderStats(); }
  if (el.matches('#videoKind button')) { state.videoKind = el.dataset.kind; syncSeg('#videoKind', el.dataset.kind); return renderVideos(); }
});

$('#statsList').addEventListener('click', ev => { const tr = ev.target.closest('tr[data-player]'); if (tr) openPlayer(tr.dataset.player); });
$('#statsSort').value = state.statsSort;
$('#statsSort').addEventListener('change', ev => { state.statsSort = ev.target.value; store.set('statsSort', state.statsSort); renderStats(); });
let statsTimer;
$('#statsSearch').addEventListener('input', ev => { clearTimeout(statsTimer); statsTimer = setTimeout(() => { state.statsQuery = ev.target.value; renderStats(); }, 150); });
$('#uruAll').checked = state.uruAll;
$('#uruAll').addEventListener('change', ev => { state.uruAll = ev.target.checked; store.set('uruAll', state.uruAll); renderUru(); });
$('#newsPlayer').addEventListener('change', ev => { state.newsPlayer = ev.target.value; renderNews(); });
$('#videoPlayer').addEventListener('change', ev => { state.videoPlayer = ev.target.value; renderVideos(); });
$('#appVersion').textContent = `Videos de YouTube (se actualizan cada 12 h). Versión ${APP_VERSION}.`;

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

setTab('uru');
