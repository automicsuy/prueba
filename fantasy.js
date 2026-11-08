'use strict';
// Fantasy de legionarios: cada semana elegís 5 uruguayos (arquero, defensa, medio, delantero y comodín) y un capitán.
// Suman con lo que hacen en sus clubes. La jornada cierra el viernes a las 12:00 de Uruguay.

const FANT_SLOTS = [['g', 'Arquero', 'G'], ['d', 'Defensa', 'D'], ['m', 'Medio', 'M'], ['f', 'Delantero', 'F'], ['x', 'Comodín', null]];
const FANT_PENDING = 'celestes:fantasy:pending';
const fant = { team: null, saved: null, live: null, prev: null, scores: {}, ranking: null, rscope: 'round', league: 'all', leagues: [], q: '' };

const F_DAY = 86400_000;
const fLock = r => Date.parse(`${r}T15:00:00Z`);
function fRoundOf(ts) {
  const d = new Date(ts);
  const back = (d.getUTCDay() - 5 + 7) % 7;
  let fri = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
  if (ts < fLock(fri.toISOString().slice(0, 10))) fri = new Date(fri.getTime() - 7 * F_DAY);
  return fri.toISOString().slice(0, 10);
}
const fOpen = () => new Date(fLock(fRoundOf(Date.now())) + 7 * F_DAY).toISOString().slice(0, 10);
const fRunning = () => fRoundOf(Date.now());
const fPrev = () => new Date(fLock(fRunning()) - 7 * F_DAY).toISOString().slice(0, 10);
const fDate = r => cap(fmtDayLong.format(new Date(fLock(r))));
const teamIds = t => (t ? [t.g, t.d, t.m, t.f, t.x].filter(Boolean) : []);
const fPlayer = id => statsData?.find(p => p.id === id) || null;

async function loadFantasy() {
  await loadStats();
  const sb = await initSupabase();
  if (!sb) throw new Error('El fantasy todavía no está configurado.');
  const rounds = [fRunning(), fPrev()];
  const { data: sc } = await sb.from('fantasy_scores').select('round_id,player_id,pts,detail').in('round_id', rounds);
  fant.scores = {};
  (sc || []).forEach(s => { (fant.scores[s.round_id] ||= {})[s.player_id] = s; });
  if (sel.session) {
    await flushFantasyPending();
    const [{ data: teams }, { data: leagues }] = await Promise.all([
      sb.from('fantasy_teams').select('*').in('round_id', [fOpen(), ...rounds]),
      sb.rpc('prode_my_leagues'),
    ]);
    const byRound = Object.fromEntries((teams || []).map(t => [t.round_id, t]));
    fant.saved = byRound[fOpen()] || null;
    fant.live = byRound[fRunning()] || null;
    fant.prev = byRound[fPrev()] || null;
    fant.leagues = leagues || [];
  } else { fant.saved = fant.live = fant.prev = null; fant.leagues = []; }
  if (!fant.team) fant.team = fant.saved ? { ...fant.saved } : loadFantasyDraft() || (fant.live ? { ...fant.live } : {});
  if (fant.league !== 'all' && !fant.leagues.some(l => l.id === fant.league)) fant.league = 'all';
  await loadFantasyRanking();
}
async function loadFantasyRanking() {
  const { data, error } = await sel.sb.rpc('fantasy_ranking', { p_round: fant.rscope === 'round' ? fRunning() : null, p_league: fant.league === 'all' ? null : fant.league, p_limit: 50 });
  fant.ranking = error ? [] : data || [];
}
function loadFantasyDraft() { try { const d = JSON.parse(localStorage.getItem(FANT_PENDING) || 'null'); return d && d.round === fOpen() ? d.team : null; } catch { return null; } }
function saveFantasyDraft() { try { localStorage.setItem(FANT_PENDING, JSON.stringify({ round: fOpen(), team: fant.team })); } catch { /* nada */ } }
async function flushFantasyPending() {
  const t = loadFantasyDraft();
  if (!t || teamIds(t).length < 5 || !t.captain) return;
  const { error } = await sel.sb.from('fantasy_teams').upsert({ round_id: fOpen(), ...pickTeam(t) }, { onConflict: 'user_id,round_id' });
  if (!error) { try { localStorage.removeItem(FANT_PENDING); } catch { /* nada */ } toastMsg('Guardé tu equipo del fantasy.'); }
}
const pickTeam = t => ({ g: t.g, d: t.d, m: t.m, f: t.f, x: t.x, captain: t.captain });

function teamPoints(t, round) {
  if (!t) return null;
  const sc = fant.scores[round] || {};
  return teamIds(t).reduce((n, id) => n + (sc[id]?.pts || 0) * (id === t.captain ? 2 : 1), 0);
}

/* ---------- Vista ---------- */
async function viewFantasy(box, req) {
  box.innerHTML = loading('Armando el fantasy…') + skeleton(4);
  try { await loadFantasy(); } catch (err) { if (req === selReq) box.innerHTML = errorBox('No se pudo cargar el fantasy.', err, 'retrySel'); return; }
  if (req !== selReq) return;
  paintFantasy(box);
}
function slotCard(slot, label, t, editable, round) {
  const id = t?.[slot];
  const p = id ? fPlayer(id) : null;
  const sc = round ? fant.scores[round]?.[id] : null;
  const isCap = id && t.captain === id;
  if (!p) return `<button type="button" class="fslot empty" ${editable ? `data-fant-slot="${slot}"` : 'disabled'}><span class="slot-empty">+</span><b>${label}</b><small>${editable ? 'Elegir' : 'Sin elegir'}</small></button>`;
  return `<div class="fslot ${isCap ? 'cap' : ''}">
    <button type="button" class="fslot-main" ${editable ? `data-fant-slot="${slot}"` : `data-player="${esc(p.id)}"`}>${avatar(p, 'md')}
      <span class="pinfo"><small class="fs-l">${label}${isCap ? ' · Capitán ×2' : ''}</small><b>${esc(shortName(p.n))}</b><small>${esc(p.club.name)}</small></span></button>
    ${round ? `<span class="fs-pts ${sc?.pts ? 'on' : ''}" title="${esc((sc?.detail || []).map(x => `${x.opp}: ${x.why.join(', ')}`).join(' · '))}">${sc ? (sc.pts * (isCap ? 2 : 1)) : '–'}<small>pts</small></span>`
      : editable ? `<button type="button" class="capbtn ${isCap ? 'on' : ''}" data-fant-cap="${esc(p.id)}" aria-label="Capitán" title="Hacerlo capitán">C</button>` : formChip(p.form)}
  </div>`;
}
function paintFantasy(box = $('#selBody')) {
  const user = sel.session?.user;
  const open = fOpen(), t = fant.team || {};
  const full = teamIds(t).length === 5 && t.captain;
  const dirty = !fant.saved || ['g', 'd', 'm', 'f', 'x', 'captain'].some(k => fant.saved[k] !== t[k]);
  const missing = 5 - teamIds(t).length;
  const saveLabel = missing > 0 ? `Faltan ${missing} ${missing === 1 ? 'jugador' : 'jugadores'}` : !t.captain ? 'Elegí el capitán' : !dirty ? 'Equipo guardado' : user ? 'Guardar equipo' : 'Guardar e iniciar sesión';
  box.innerHTML = `
    <div class="prode-head">
      <div><b>Fantasy de legionarios</b><small>Titular <b>2</b> · suplente <b>1</b> · gol <b>5</b> (defensa y arquero <b>6</b>) · asistencia <b>3</b> · valla invicta <b>4</b> · roja <b>−3</b> · capitán <b>×2</b></small></div>
      ${fant.live ? `<div class="ph-kpi"><b>${teamPoints(fant.live, fRunning())}</b><small>esta jornada</small></div>` : ''}
    </div>
    ${!user ? `<div class="note">Armá tu equipo; para guardarlo y entrar al ranking iniciá sesión con Google.<button type="button" class="btn text" data-fant-login>Iniciar sesión</button></div>` : ''}
    <h3 class="group-h">${ic('calendar')}Tu equipo para la jornada del ${esc(fDate(open))} <small>· cierra 12:00</small></h3>
    <div class="fteam">${FANT_SLOTS.map(([s, l]) => slotCard(s, l, t, true, null)).join('')}</div>
    <p class="kpi-note">${full ? 'Tocá la C para elegir al capitán: suma doble.' : 'Elegí un jugador por puesto y uno libre. Los ordenamos por cómo llegan.'}</p>
    <div class="vote-foot"><button type="button" class="btn filled wide" data-fant-save ${!full || !dirty ? 'disabled' : ''}>${saveLabel}</button></div>
    ${fant.live ? `<h3 class="group-h">En juego · jornada del ${esc(fDate(fRunning()))}</h3><div class="fteam">${FANT_SLOTS.map(([s, l]) => slotCard(s, l, fant.live, false, fRunning())).join('')}</div>` : ''}
    ${fant.prev ? `<h3 class="group-h">Jornada anterior · ${teamPoints(fant.prev, fPrev())} pts</h3><div class="fteam">${FANT_SLOTS.map(([s, l]) => slotCard(s, l, fant.prev, false, fPrev())).join('')}</div>` : ''}
    <h3 class="group-h">Ranking</h3>
    <div class="seg small" id="fantR"><button type="button" class="${fant.rscope === 'round' ? 'on' : ''}" data-fant-rscope="round">Jornada</button><button type="button" class="${fant.rscope === 'season' ? 'on' : ''}" data-fant-rscope="season">Temporada</button></div>
    <div class="seg small scroll" id="fantL"><button type="button" class="${fant.league === 'all' ? 'on' : ''}" data-fant-league="all">General</button>${fant.leagues.map(l => `<button type="button" class="${fant.league === l.id ? 'on' : ''}" data-fant-league="${l.id}">${esc(l.name)}</button>`).join('')}</div>
    <div id="fantRank">${fantasyRankList()}</div>
    <p class="foot">Los puntos salen de los partidos de club registrados por ESPN (ligas y copas; no cuentan los de la selección). Las ligas de amigos son las mismas del prode.</p>`;
}
function fantasyRankList() {
  const r = fant.ranking || [];
  if (!r.length) return `<div class="empty"><b>Todavía no hay puntos</b><small>El ranking arranca cuando cierre la primera jornada.</small></div>`;
  return `<ol class="leaders prank">${r.map(x => `<li class="${x.is_me ? 'me' : ''}"><span class="rank">${x.pos}</span><span class="av sm"><b>${esc(initials(x.nickname))}</b></span>
    <span class="ln"><b>${esc(x.nickname)}${x.is_me ? ' <small>(vos)</small>' : ''}</b><small>${x.rounds} ${x.rounds === 1 ? 'jornada' : 'jornadas'}</small></span>
    <span class="lv"><b>${x.points}</b><small>pts</small></span></li>`).join('')}</ol>`;
}

function openFantasyPicker(slot) {
  const [, label, pos] = FANT_SLOTS.find(s => s[0] === slot);
  const t = fant.team || {};
  const used = new Set(teamIds(t).filter(id => id !== t[slot]));
  const q = norm(fant.q);
  const list = (statsData || []).filter(p => ['G', 'D', 'M', 'F'].includes(p.pos) && (!pos || p.pos === pos) && !used.has(p.id)
    && (!q || norm(p.n).includes(q) || norm(p.club.name).includes(q)))
    .sort((a, b) => (b.form?.i ?? -1) - (a.form?.i ?? -1));
  showDialog(`${dlgHead(`${label}${pos ? '' : ' · cualquier puesto'}`)}
    <label class="search"><svg><use href="#i-search"/></svg><input type="search" id="fantSearch" data-fant-search="${slot}" placeholder="Buscar jugador o club" value="${esc(fant.q)}" autocomplete="off"></label>
    <div class="plist pick in-dlg forma">${list.slice(0, 80).map(p => `<button type="button" class="prow ${t[slot] === p.id ? 'chosen-row' : ''}" data-fant-pick="${slot}:${esc(p.id)}">
      <span class="rank">${esc(p.pos)}</span>${avatar(p, 'md')}
      <span class="pinfo"><b>${esc(p.n)}</b><small>${p.club.logo ? `<img src="${esc(p.club.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${esc(p.club.name)}</small>${formStrip(p.form)}</span>
      ${formChip(p.form)}</button>`).join('') || '<p class="kpi-note pad">Sin resultados.</p>'}</div>
    ${t[slot] ? `<div class="actions"><button type="button" class="btn text" data-fant-pick="${slot}:">Quitar</button></div>` : ''}`);
}

async function saveFantasy() {
  const t = fant.team;
  saveFantasyDraft();
  if (!sel.session) return signIn('fantasy');
  const { data, error } = await sel.sb.from('fantasy_teams').upsert({ round_id: fOpen(), ...pickTeam(t) }, { onConflict: 'user_id,round_id' }).select().single();
  if (error) return toastMsg(error.message);
  try { localStorage.removeItem(FANT_PENDING); } catch { /* nada */ }
  fant.saved = data;
  toastMsg('Equipo guardado. ¡Suerte este finde!');
  paintFantasy();
}

function onFantasyClick(ev) {
  const b = ev.target.closest('[data-fant-slot], [data-fant-pick], [data-fant-cap], [data-fant-save], [data-fant-rscope], [data-fant-league], [data-fant-login]');
  if (!b) return false;
  ev.preventDefault();
  const ds = b.dataset;
  fant.team ||= {};
  if (ds.fantLogin !== undefined) { signIn('fantasy'); return true; }
  if (ds.fantSlot) { fant.q = ''; openFantasyPicker(ds.fantSlot); return true; }
  if (ds.fantPick !== undefined) {
    const [slot, id] = ds.fantPick.split(':');
    if (fant.team.captain === fant.team[slot]) delete fant.team.captain;
    if (id) fant.team[slot] = id; else delete fant.team[slot];
    if (!fant.team.captain && teamIds(fant.team).length === 5) fant.team.captain = fant.team.f || fant.team.x;
    saveFantasyDraft(); $('#detail').close(); paintFantasy(); return true;
  }
  if (ds.fantCap) { fant.team.captain = ds.fantCap; saveFantasyDraft(); paintFantasy(); return true; }
  if (ds.fantSave !== undefined) { saveFantasy(); return true; }
  if (ds.fantRscope) fant.rscope = ds.fantRscope;
  if (ds.fantLeague) fant.league = ds.fantLeague;
  document.querySelectorAll('#fantR button').forEach(x => x.classList.toggle('on', x.dataset.fantRscope === fant.rscope));
  document.querySelectorAll('#fantL button').forEach(x => x.classList.toggle('on', x.dataset.fantLeague === fant.league));
  $('#fantRank').innerHTML = loading('Cargando ranking…');
  loadFantasyRanking().then(() => { const el = $('#fantRank'); if (el) el.innerHTML = fantasyRankList(); });
  return true;
}
function onFantasyInput(ev) {
  const slot = ev.target.dataset?.fantSearch;
  if (!slot) return false;
  fant.q = ev.target.value;
  clearTimeout(onFantasyInput.t);
  onFantasyInput.t = setTimeout(() => { openFantasyPicker(slot); const i = $('#fantSearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200);
  return true;
}

// El buscador del selector vive en el diálogo (fuera de la sección).
document.getElementById('detail').addEventListener('input', onFantasyInput);
