'use strict';

const LEAGUES = window.LEAGUES;
const LEAGUE_BY_ID = Object.fromEntries(LEAGUES.map(l => [l.id, l]));
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Storage ---------- */
const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin storage */ } },
};

const state = {
  tab: 'agenda',
  day: startOfDay(new Date()),
  sport: 'all',
  onlyFavs: store.get('onlyFavs', false),
  favs: store.get('favs', {}),               // key "sport:teamId" -> {key, sport, id, name, logo}
  disabled: new Set(store.get('disabled', [])),
  errors: {},
};

/* ---------- Fechas ---------- */
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function ymd(d) { return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
const fmtTime = new Intl.DateTimeFormat('es-UY', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtDayShort = new Intl.DateTimeFormat('es-UY', { weekday: 'short', day: 'numeric' });
const fmtDayLong = new Intl.DateTimeFormat('es-UY', { weekday: 'long', day: 'numeric', month: 'long' });

/* ---------- Datos (vía funciones propias en /api, que consultan ESPN del lado del servidor) ---------- */
const APP_VERSION = '5';
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

function hydrate(e) {
  const league = LEAGUE_BY_ID[e.league];
  return league ? { ...e, league, sport: league.sport, date: new Date(e.date) } : null;
}

async function fetchDay(localDay, leagues) {
  if (!leagues.length) return [];
  const from = localDay.toISOString(), to = new Date(addDays(localDay, 1).getTime() - 1).toISOString();
  const data = await getJSON(`api/agenda?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&leagues=${leagues.map(l => l.id).join(',')}`);
  state.errors = data.errors || {};
  return data.events.map(hydrate).filter(Boolean);
}

// Próximos partidos de los favoritos en cada competición donde participan.
async function fetchTeamSchedules(favs) {
  const pairs = favs.flatMap(f => (f.leagues || []).map(lid => `${lid}:${f.id}`));
  if (!pairs.length) return [];
  const data = await getJSON(`api/fixtures?teams=${pairs.join(',')}`, 5 * 60_000);
  return data.events.map(hydrate).filter(Boolean);
}

/* ---------- Favoritos ---------- */
const favKey = (sport, id) => `${sport}:${id}`;
const isFav = (sport, id) => !!state.favs[favKey(sport, id)];
const isFavEvent = e => isFav(e.sport, e.home.id) || isFav(e.sport, e.away.id);
function toggleFav(sport, team) {
  const k = favKey(sport, team.id);
  if (state.favs[k]) { delete state.favs[k]; toast(`Dejaste de seguir a ${team.name}`); }
  else {
    state.favs[k] = { key: k, sport, id: team.id, name: team.name, logo: team.logo, leagues: [...new Set(team.leagues || (team.league ? [team.league] : []))] };
    toast(`Siguiendo a ${team.name} ★`);
  }
  store.set('favs', state.favs);
}

/* ---------- Render ---------- */
function statusHTML(e) {
  if (e.statusName.includes('POSTPONED')) return `<span class="st warn">Postergado</span>`;
  if (e.statusName.includes('CANCELED')) return `<span class="st warn">Cancelado</span>`;
  if (e.state === 'in') {
    const d = e.detail.replace(/^Halftime$|^HT$/i, 'Entretiempo');
    return `<span class="st live"><i></i>${esc(d || e.clock || 'En vivo')}</span>`;
  }
  if (e.state === 'post') return `<span class="st done">Final</span>`;
  return `<span class="st time">${fmtTime.format(e.date)}</span>`;
}

function teamRow(t, e) {
  const fav = isFav(e.sport, t.id);
  const showScore = e.state !== 'pre';
  return `<div class="team ${e.state === 'post' && t.winner ? 'win' : ''}">
    ${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy" width="22" height="22">` : `<span class="nologo"></span>`}
    <span class="tname">${esc(t.short)}${fav ? ' <b class="star">★</b>' : ''}</span>
    ${showScore ? `<span class="score">${esc(t.score)}</span>` : ''}
  </div>`;
}

function eventCard(e, { showDate = false } = {}) {
  return `<button class="match ${isFavEvent(e) ? 'is-fav' : ''} ${e.state === 'in' ? 'is-live' : ''}" data-ev="${esc(e.id)}">
    <div class="m-status">
      ${showDate ? `<span class="m-date">${esc(fmtDayShort.format(e.date))}</span>` : ''}
      ${statusHTML(e)}
    </div>
    <div class="m-teams">${teamRow(e.home, e)}${teamRow(e.away, e)}</div>
    ${e.tv.length ? `<div class="m-tv" title="${esc(e.tv.join(', '))}">📺 ${esc(e.tv.slice(0, 2).join(', '))}</div>` : ''}
  </button>`;
}

function groupByLeague(events) {
  const groups = new Map();
  for (const l of LEAGUES) groups.set(l.id, []);
  events.forEach(e => groups.get(e.league.id)?.push(e));
  return [...groups.entries()].filter(([, evs]) => evs.length);
}

let currentEvents = new Map(); // id -> event (para el diálogo)

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

const skeleton = n => Array.from({ length: n }, () => `<div class="skel"></div>`).join('');

let agendaReq = 0;
async function renderAgenda() {
  renderDays();
  const list = $('#agendaList');
  const req = ++agendaReq;
  list.innerHTML = skeleton(6);
  const leagues = LEAGUES.filter(l => !state.disabled.has(l.id) && (state.sport === 'all' || l.sport === state.sport));
  let events;
  try {
    events = await fetchDay(state.day, leagues);
  } catch (err) {
    if (req !== agendaReq) return;
    list.innerHTML = `<div class="empty">No se pudieron cargar los partidos.<br><small>${esc(err.message)}</small><br><button class="btn" id="retry">Reintentar</button></div>`;
    return;
  }
  if (req !== agendaReq) return;
  let dayEvents = events;
  if (state.onlyFavs) dayEvents = dayEvents.filter(isFavEvent);
  currentEvents = new Map(events.map(e => [e.id, e]));

  const parts = [`<h2 class="section-title">${esc(cap(fmtDayLong.format(state.day)))}</h2>`];
  const favEvents = dayEvents.filter(isFavEvent);
  if (favEvents.length && !state.onlyFavs) {
    parts.push(`<div class="league fav-league"><h3>★ Tus equipos</h3>${favEvents.map(e => eventCard(e)).join('')}</div>`);
  }
  const live = dayEvents.filter(e => e.state === 'in');
  if (live.length > 0) parts.push(`<p class="live-count"><i></i>${live.length} en vivo</p>`);
  for (const [id, evs] of groupByLeague(dayEvents)) {
    const l = LEAGUE_BY_ID[id];
    parts.push(`<div class="league"><h3><span>${l.flag}</span> ${esc(l.name)}</h3>${evs.map(e => eventCard(e)).join('')}</div>`);
  }
  if (!dayEvents.length) {
    const failed = Object.keys(state.errors).length;
    parts.push(`<div class="empty">${state.onlyFavs ? 'Tus equipos no juegan este día.' : 'No hay partidos este día en tus competiciones.'}
      ${failed ? `<br><small>${failed} competiciones sin respuesta de la fuente.</small>` : ''}</div>`);
  }
  list.innerHTML = parts.join('');
  scheduleRefresh(dayEvents);
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

let refreshTimer;
function scheduleRefresh(events) {
  clearTimeout(refreshTimer);
  const soon = events.some(e => e.state === 'in' || (e.state === 'pre' && e.date - Date.now() < 30 * 60_000 && e.date - Date.now() > -3 * 3600_000));
  if (soon) refreshTimer = setTimeout(() => { if (!document.hidden && state.tab === 'agenda') { memCache.clear(); renderAgenda(); } }, 60_000);
}

/* ---------- Mis equipos ---------- */
function renderChips() {
  const favs = Object.values(state.favs);
  $('#favChips').innerHTML = favs.length
    ? favs.map(f => `<span class="chip">${f.logo ? `<img src="${esc(f.logo)}" alt="" width="18" height="18">` : ''}${esc(f.name)}
        <button data-unfav="${esc(f.key)}" aria-label="Quitar ${esc(f.name)}">✕</button></span>`).join('')
    : `<p class="hint">Todavía no seguís ningún equipo.</p>`;
}

let favReq = 0;
async function renderFavs() {
  renderChips();
  const list = $('#favList');
  const favs = Object.values(state.favs);
  if (!favs.length) { list.innerHTML = ''; return; }
  const req = ++favReq;
  list.innerHTML = skeleton(4);
  await enrichFavLeagues();
  const limit = addDays(new Date(), 21).getTime();
  let events;
  try {
    events = (await fetchTeamSchedules(Object.values(state.favs))).filter(e => e.date.getTime() <= limit);
  } catch (err) {
    if (req === favReq) list.innerHTML = `<div class="empty">No se pudieron cargar los partidos.<br><small>${esc(err.message)}</small></div>`;
    return;
  }
  if (req !== favReq) return;
  events.forEach(e => currentEvents.set(e.id, e));
  list.innerHTML = events.length
    ? events.map(e => `<div class="fav-row"><small>${esc(e.league.flag)} ${esc(e.league.name)}</small>${eventCard(e, { showDate: true })}</div>`).join('')
    : `<div class="empty">Sin partidos programados en los próximos 21 días.</div>`;
}

/* Buscador de equipos (lista de equipos de cada competición) */
let teamIndex = null;
async function loadTeamIndex() {
  if (teamIndex) return teamIndex;
  const data = await getJSON('api/teams', 24 * 3600_000);
  teamIndex = data.teams;
  return teamIndex;
}
// Completa en qué competiciones juega cada favorito (p. ej. liga + copa + selecciones).
async function enrichFavLeagues() {
  let idx = [];
  try { idx = await loadTeamIndex(); } catch { /* sin índice: se usan las ligas guardadas */ }
  const byKey = new Map(idx.map(t => [t.key, t]));
  let changed = false;
  for (const f of Object.values(state.favs)) {
    const found = byKey.get(f.key);
    const merged = [...new Set([...(f.leagues || []), ...(found?.leagues || [])])];
    if (merged.length !== (f.leagues || []).length) { f.leagues = merged; changed = true; }
    if (!f.logo && found?.logo) { f.logo = found.logo; changed = true; }
  }
  if (changed) store.set('favs', state.favs);
}

const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function searchTeams(q) {
  const box = $('#teamResults');
  if (q.trim().length < 2) { box.innerHTML = ''; return; }
  if (!teamIndex) box.innerHTML = `<p class="hint">Cargando equipos…</p>`;
  let idx;
  try { idx = await loadTeamIndex(); } catch (err) { box.innerHTML = `<p class="hint">No se pudo cargar la lista de equipos (${esc(err.message)}).</p>`; return; }
  const nq = norm(q);
  const hits = idx.filter(t => norm(t.name).includes(nq)).slice(0, 12);
  box.innerHTML = hits.length
    ? hits.map(t => `<button class="result" data-addfav="${esc(t.key)}">
        ${t.logo ? `<img src="${esc(t.logo)}" alt="" width="24" height="24">` : '<span class="nologo"></span>'}
        <span><b>${esc(t.name)}</b><small>${t.sport === 'basketball' ? '🏀' : '⚽'} ${esc(t.leagues.slice(0, 2).map(id => LEAGUE_BY_ID[id].name).join(' · '))}</small></span>
        <span class="add">${isFav(t.sport, t.id) ? '★' : '☆'}</span>
      </button>`).join('')
    : `<p class="hint">Sin resultados.</p>`;
}

/* ---------- Ajustes ---------- */
function renderSettings() {
  const groups = [...new Set(LEAGUES.map(l => l.group))];
  $('#leagueToggles').innerHTML = groups.map(g => `<h3 class="grp">${esc(g)}</h3>` + LEAGUES.filter(l => l.group === g).map(l => `
    <label class="toggle"><span>${l.flag} ${esc(l.name)} ${state.errors[l.id] ? '<em class="err">sin datos</em>' : ''}</span>
      <input type="checkbox" data-league="${esc(l.id)}" ${state.disabled.has(l.id) ? '' : 'checked'}></label>`).join('')).join('');
  const failed = Object.keys(state.errors).map(id => LEAGUE_BY_ID[id]?.name).filter(Boolean);
  $('#sourceStatus').textContent = `Versión ${APP_VERSION}. ` + (failed.length ? `Sin datos de la fuente para: ${failed.join(', ')}.` : '');
}

/* ---------- Detalle ---------- */
function openDetail(e) {
  const dlg = $('#detail');
  const teamBtn = t => t.id ? `<button class="btn fav-btn" data-favteam="${esc(t.id)}" data-side="${t === e.home ? 'home' : 'away'}">
      ${isFav(e.sport, t.id) ? '★ Siguiendo' : '☆ Seguir'} ${esc(t.short)}</button>` : '';
  dlg.innerHTML = `<form method="dialog" class="dlg">
    <header><small>${e.league.flag} ${esc(e.league.name)}${e.round ? ' · ' + esc(e.round) : ''}</small><button class="icon-btn" value="close" aria-label="Cerrar">✕</button></header>
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
    <div class="actions">
      ${teamBtn(e.home)}${teamBtn(e.away)}
      ${e.state === 'pre' ? `<button class="btn" type="button" data-ics="${esc(e.id)}">🗓️ Agregar al calendario</button>` : ''}
      ${e.link ? `<a class="btn" href="${esc(e.link)}" target="_blank" rel="noopener">Ficha completa ↗</a>` : ''}
    </div>
  </form>`;
  dlg.dataset.ev = e.id;
  if (!dlg.open) dlg.showModal();
}

function downloadICS(e) {
  const dt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = new Date(e.date.getTime() + (e.sport === 'basketball' ? 2.5 : 2) * 3600_000);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MiAgenda//ES', 'BEGIN:VEVENT',
    `UID:${e.id}@mi-agenda`, `DTSTAMP:${dt(new Date())}`, `DTSTART:${dt(e.date)}`, `DTEND:${dt(end)}`,
    `SUMMARY:${e.home.name} vs ${e.away.name} (${e.league.name})`,
    `LOCATION:${e.venue}`, `DESCRIPTION:TV: ${e.tv.join(', ') || 'no informada'}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Empieza el partido', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${e.home.short}-${e.away.short}.ics` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- UI general ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.querySelectorAll('.view').forEach(v => (v.hidden = v.id !== `view-${tab}`));
  if (tab === 'agenda') renderAgenda();
  if (tab === 'favs') renderFavs();
  if (tab === 'ajustes') renderSettings();
}

function rerenderCurrent() { setTab(state.tab); }

document.addEventListener('click', ev => {
  const el = ev.target.closest('button, a');
  if (!el) return;
  if (el.matches('.tabs [role=tab]')) return setTab(el.dataset.tab);
  if (el.id === 'retry') { memCache.clear(); return renderAgenda(); }
  if (el.id === 'prevDay') { state.day = addDays(state.day, -1); return renderAgenda(); }
  if (el.id === 'nextDay') { state.day = addDays(state.day, 1); return renderAgenda(); }
  if (el.matches('.day')) { state.day = addDays(state.day, +el.dataset.off); return renderAgenda(); }
  if (el.matches('#sportFilter button')) {
    state.sport = el.dataset.sport;
    document.querySelectorAll('#sportFilter button').forEach(b => b.classList.toggle('on', b === el));
    return renderAgenda();
  }
  if (el.dataset.ev) { const e = currentEvents.get(el.dataset.ev); if (e) openDetail(e); return; }
  if (el.dataset.favteam) {
    ev.preventDefault();
    const e = currentEvents.get($('#detail').dataset.ev);
    toggleFav(e.sport, { ...e[el.dataset.side], league: e.league.id });
    openDetail(e);
    return;
  }
  if (el.dataset.ics) { ev.preventDefault(); return downloadICS(currentEvents.get(el.dataset.ics)); }
  if (el.dataset.unfav) {
    const f = state.favs[el.dataset.unfav];
    if (f) toggleFav(f.sport, f);
    return renderFavs();
  }
  if (el.dataset.addfav) {
    const t = teamIndex.find(x => x.key === el.dataset.addfav);
    if (t) toggleFav(t.sport, t);
    searchTeams($('#teamSearch').value);
    return renderFavs();
  }
  if (el.id === 'exportFavs') {
    const data = JSON.stringify(Object.values(state.favs));
    navigator.clipboard?.writeText(data).then(() => toast('Favoritos copiados al portapapeles'), () => prompt('Copiá este texto:', data));
    return;
  }
  if (el.id === 'importFavs') {
    const txt = prompt('Pegá el texto exportado:');
    if (!txt) return;
    try {
      JSON.parse(txt).forEach(f => { if (f.key && f.id) state.favs[f.key] = f; });
      store.set('favs', state.favs); toast('Favoritos importados');
    } catch { toast('Texto inválido'); }
  }
});

$('#detail').addEventListener('close', () => { if (state.tab !== 'ajustes') rerenderCurrent(); });
$('#detail').addEventListener('click', ev => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });

$('#onlyFavs').checked = state.onlyFavs;
$('#onlyFavs').addEventListener('change', ev => { state.onlyFavs = ev.target.checked; store.set('onlyFavs', state.onlyFavs); renderAgenda(); });

let searchTimer;
$('#teamSearch').addEventListener('input', ev => { clearTimeout(searchTimer); searchTimer = setTimeout(() => searchTeams(ev.target.value), 200); });
$('#teamSearch').addEventListener('focus', () => loadTeamIndex().catch(() => {}), { once: true });

$('#leagueToggles').addEventListener('change', ev => {
  const id = ev.target.dataset.league;
  if (!id) return;
  ev.target.checked ? state.disabled.delete(id) : state.disabled.add(id);
  store.set('disabled', [...state.disabled]);
});

document.addEventListener('visibilitychange', () => { if (!document.hidden && state.tab === 'agenda') renderAgenda(); });

// Swipe entre días
let touchX = null;
$('#view-agenda').addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
$('#view-agenda').addEventListener('touchend', e => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX; touchX = null;
  if (Math.abs(dx) > 80) { state.day = addDays(state.day, dx < 0 ? 1 : -1); renderAgenda(); }
}, { passive: true });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  // Cuando se activa una versión nueva, recargar una vez para usarla.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}

renderAgenda();
