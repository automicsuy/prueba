'use strict';
// Prode de la Celeste Mayor: pronóstico de resultado + goleador uruguayo, ranking general y ligas de amigos.
// Puntos: resultado exacto 5 · ganador o empate 2 · goleador uruguayo +3 (los calcula la base de datos).

const PENDING_KEY = 'celestes:prode:pending';
const LIGA_KEY = 'celestes:prode:liga';
const prode = { matches: null, picks: {}, edits: {}, ranking: null, leagues: [], scope: 'all', nick: '', saving: {} };

// Invitación por link: ?tab=sel&vista=prode&liga=CODIGO (se guarda hasta que la persona inicie sesión).
(() => {
  const code = new URLSearchParams(location.search).get('liga');
  if (code && /^[A-Za-z2-9]{6}$/.test(code)) { try { localStorage.setItem(LIGA_KEY, code.toUpperCase()); } catch { /* nada */ } }
})();
const pendingLiga = () => { try { return localStorage.getItem(LIGA_KEY) || ''; } catch { return ''; } };

function pointsOf(pk, m) {
  if (!pk || m.state !== 'post' || m.home_score == null) return null;
  const exact = pk.home === m.home_score && pk.away === m.away_score;
  const out = Math.sign(pk.home - pk.away) === Math.sign(m.home_score - m.away_score);
  return (exact ? 5 : out ? 2 : 0) + (pk.scorer && m.uru_scorers.includes(pk.scorer) ? 3 : 0);
}

async function loadProde() {
  const sb = await initSupabase();
  if (!sb) throw new Error('El prode todavía no está configurado.');
  const since = new Date(Date.now() - 45 * 86400_000).toISOString();
  const { data, error } = await sb.from('prode_matches').select('*').gte('kickoff', since).order('kickoff');
  if (error) throw new Error(error.message);
  prode.matches = data || [];
  if (sel.session) {
    await flushPending();
    await joinPendingLiga();
    const [{ data: picks }, { data: prof }, { data: leagues }] = await Promise.all([
      sb.from('prode_picks').select('*'),
      sb.from('prode_profiles').select('nickname').maybeSingle(),
      sb.rpc('prode_my_leagues'),
    ]);
    prode.picks = Object.fromEntries((picks || []).map(p => [p.match_id, p]));
    prode.nick = prof?.nickname || '';
    prode.leagues = leagues || [];
    if (prode.scope !== 'all' && !prode.leagues.some(l => l.id === prode.scope)) prode.scope = 'all';
  } else { prode.picks = {}; prode.leagues = []; prode.scope = 'all'; }
  await loadRanking();
}
async function loadRanking() {
  const { data, error } = await sel.sb.rpc('prode_ranking', { p_league: prode.scope === 'all' ? null : prode.scope, p_limit: 50 });
  prode.ranking = error ? [] : data || [];
}

// Pronósticos hechos antes de iniciar sesión: se guardan al volver del login.
async function flushPending() {
  let pend = {};
  try { pend = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}'); } catch { /* nada */ }
  const rows = Object.entries(pend).filter(([id]) => { const m = prode.matches.find(x => x.id === id); return m && Date.parse(m.kickoff) > Date.now(); })
    .map(([match_id, p]) => ({ match_id, home: p.home, away: p.away, scorer: p.scorer || null }));
  if (rows.length) {
    const { error } = await sel.sb.from('prode_picks').upsert(rows, { onConflict: 'user_id,match_id' });
    if (!error) toastMsg(rows.length === 1 ? 'Guardé tu pronóstico.' : `Guardé tus ${rows.length} pronósticos.`);
  }
  try { localStorage.removeItem(PENDING_KEY); } catch { /* nada */ }
}
async function joinPendingLiga() {
  const code = pendingLiga();
  if (!code) return;
  const { data, error } = await sel.sb.rpc('prode_join_league', { p_code: code });
  try { localStorage.removeItem(LIGA_KEY); } catch { /* nada */ }
  if (error || !data) return toastMsg(error?.message || 'No se pudo entrar a la liga.');
  prode.scope = data.id;
  toastMsg(`Te uniste a la liga “${data.name}”.`);
}

/* ---------- Vista ---------- */
const teamCell = (name, logo) => `<span class="pt-team">${flag(logo, name)}<b>${esc(name)}</b></span>`;
function current(m) { return prode.edits[m.id] || prode.picks[m.id] || null; }
function scorerOptions(val) {
  const sq = (sel.data?.squad || []).filter(p => lineOfPos(p.pos) !== 'G').slice().sort((a, b) => b.g - a.g || b.pj - a.pj || a.n.localeCompare(b.n));
  return `<option value="">Sin goleador (opcional)</option>${sq.map(p => `<option value="${esc(p.id)}" ${val === p.id ? 'selected' : ''}>${esc(p.n)}${p.g ? ` · ${p.g} goles` : ''}</option>`).join('')}`;
}
function matchCard(m) {
  const open = Date.parse(m.kickoff) > Date.now();
  const pk = current(m);
  const saved = prode.picks[m.id];
  const dirty = !!prode.edits[m.id];
  const d = new Date(m.kickoff);
  const when = `${esc(m.comp ? `${m.comp} · ` : '')}${esc(cap(fmtDayLong.format(d)))}, ${fmtTime.format(d)}`;
  if (open) {
    const h = pk?.home ?? 0, a = pk?.away ?? 0;
    const stepper = (sideKey, v) => `<span class="pt-step"><button type="button" data-prode-step="${m.id}:${sideKey}:-1" aria-label="Restar gol" ${v <= 0 ? 'disabled' : ''}>−</button><b>${v}</b><button type="button" data-prode-step="${m.id}:${sideKey}:1" aria-label="Sumar gol">+</button></span>`;
    return `<article class="ptcard">
      <header><span>${when}</span><small>${countdown(m.kickoff).replace('Faltan', 'Cierra en')}</small></header>
      <div class="pt-row">${teamCell(m.home, m.home_logo)}${stepper('home', h)}<i>–</i>${stepper('away', a)}${teamCell(m.away, m.away_logo)}</div>
      <label class="select wide pt-scorer"><span>Goleador uruguayo <small>+3</small></span><select data-prode-scorer="${m.id}">${scorerOptions(pk?.scorer || '')}</select></label>
      <footer>${saved && !dirty ? `<span class="pt-ok">${ic('flag')}Pronóstico guardado</span>` : '<span></span>'}
        <button type="button" class="btn ${dirty || !saved ? 'filled' : ''}" data-prode-save="${m.id}" ${prode.saving[m.id] || (saved && !dirty) ? 'disabled' : ''}>${prode.saving[m.id] ? 'Guardando…' : saved ? (dirty ? 'Guardar cambio' : 'Guardado') : sel.session ? 'Guardar' : 'Guardar e iniciar sesión'}</button></footer>
    </article>`;
  }
  const pts = pointsOf(saved, m);
  const score = m.state === 'pre' ? 'vs' : `${m.home_score ?? '–'} – ${m.away_score ?? '–'}`;
  const sc = saved?.scorer ? (sel.data?.squad || []).find(p => p.id === saved.scorer)?.n || pinfo(saved.scorer).n : '';
  return `<article class="ptcard done">
    <header><span>${when}</span><small>${m.state === 'in' ? '<b class="live">En juego</b>' : m.state === 'post' ? 'Final' : 'Cerrado'}</small></header>
    <div class="pt-row">${teamCell(m.home, m.home_logo)}<b class="pt-final">${score}</b>${teamCell(m.away, m.away_logo)}</div>
    <footer><span class="pt-mine">${saved ? `Tu pronóstico: <b>${saved.home}–${saved.away}</b>${sc ? ` · ${esc(shortName(sc))}` : ''}` : 'No pronosticaste este partido'}</span>
      ${pts != null && saved ? `<span class="pt-pts ${pts ? 'win' : ''}">+${pts}</span>` : ''}</footer>
  </article>`;
}

async function viewProde(box, req) {
  box.innerHTML = loading('Cargando el prode…') + skeleton(3);
  try { await loadProde(); } catch (err) { if (req === selReq) box.innerHTML = errorBox('No se pudo cargar el prode.', err, 'retrySel'); return; }
  if (req !== selReq) return;
  const user = sel.session?.user;
  const upcoming = prode.matches.filter(m => Date.parse(m.kickoff) > Date.now());
  const played = prode.matches.filter(m => Date.parse(m.kickoff) <= Date.now()).reverse();
  const total = prode.matches.reduce((s, m) => s + (pointsOf(prode.picks[m.id], m) || 0), 0);
  const me = prode.ranking?.find(r => r.is_me);
  const liga = pendingLiga();
  box.innerHTML = `
    <div class="prode-head">
      <div><b>Prode de la Celeste</b><small>Exacto <b>5</b> · Ganador o empate <b>2</b> · Goleador uruguayo <b>+3</b></small></div>
      ${user ? `<div class="ph-kpi"><b>${total}</b><small>${me ? `puesto ${me.pos}` : 'puntos'}</small></div>` : ''}
    </div>
    ${!user ? `<div class="note">${liga ? `Te invitaron a una liga (código <b>${esc(liga)}</b>). ` : ''}Iniciá sesión con Google para guardar tus pronósticos y entrar al ranking.<button type="button" class="btn text" data-prode-action="login">Iniciar sesión</button></div>`
      : `<p class="prode-who">Jugás como <b>${esc(prode.nick || me?.nickname || 'Hincha')}</b><button type="button" class="btn text" data-prode-action="nick">Cambiar apodo</button><button type="button" class="btn text" data-sel-action="logout">Salir</button></p>`}
    <h3 class="group-h">${ic('calendar')}Próximos partidos</h3>
    ${upcoming.length ? upcoming.map(matchCard).join('') : `<div class="empty"><b>No hay partidos para pronosticar</b><small>Aparecen apenas ESPN publica el próximo partido de la Celeste.</small></div>`}
    ${played.length ? `<h3 class="group-h">Jugados</h3>${played.map(matchCard).join('')}` : ''}
    <h3 class="group-h">Ranking</h3>
    <div class="seg small scroll" id="prodeScope"><button type="button" class="${prode.scope === 'all' ? 'on' : ''}" data-prode-scope="all">General</button>${prode.leagues.map(l => `<button type="button" class="${prode.scope === l.id ? 'on' : ''}" data-prode-scope="${l.id}">${esc(l.name)}</button>`).join('')}</div>
    <div id="prodeRank">${rankingList()}</div>
    <h3 class="group-h">Ligas de amigos</h3>
    <div class="card pad-sm leagues">
      ${prode.leagues.map(l => `<div class="lrow"><span><b>${esc(l.name)}</b><small>Código ${esc(l.code)} · ${l.members} ${l.members === 1 ? 'jugador' : 'jugadores'}</small></span>
        <button type="button" class="btn text" data-prode-share="${l.id}">Invitar</button><button type="button" class="btn text" data-prode-leave="${l.id}">Salir</button></div>`).join('')}
      <p class="kpi-note">${prode.leagues.length ? '' : 'Creá una liga, mandá el link por WhatsApp y competí con tus amigos.'}</p>
      <div class="actions"><button type="button" class="btn filled" data-prode-action="create">Crear liga</button><button type="button" class="btn" data-prode-action="join">Unirme con código</button></div>
    </div>`;
}
function rankingList() {
  const r = prode.ranking || [];
  if (!r.length) return `<div class="empty"><b>Todavía no hay puntos</b><small>El ranking arranca cuando termine el primer partido.</small></div>`;
  return `<ol class="leaders prank">${r.map(x => `<li class="${x.is_me ? 'me' : ''}"><span class="rank">${x.pos}</span><span class="av sm"><b>${esc(initials(x.nickname))}</b></span>
    <span class="ln"><b>${esc(x.nickname)}${x.is_me ? ' <small>(vos)</small>' : ''}</b><small>${x.played} ${x.played === 1 ? 'partido' : 'partidos'} · ${x.exact} ${x.exact === 1 ? 'exacto' : 'exactos'}</small></span>
    <span class="lv"><b>${x.points}</b><small>pts</small></span></li>`).join('')}</ol>`;
}
function repaintProdeCard(id) {
  const m = prode.matches.find(x => x.id === id);
  const el = document.querySelector(`[data-prode-save="${id}"]`)?.closest('.ptcard');
  if (m && el) el.outerHTML = matchCard(m);
}

/* ---------- Acciones ---------- */
async function saveProde(id) {
  const pk = current(prode.matches.find(x => x.id === id)) || { home: 0, away: 0, scorer: null };
  if (!sel.session) {
    let pend = {};
    try { pend = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}'); } catch { /* nada */ }
    pend[id] = { home: pk.home, away: pk.away, scorer: pk.scorer || null };
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(pend)); } catch { /* nada */ }
    return signIn('prode');
  }
  prode.saving[id] = true; repaintProdeCard(id);
  const { data, error } = await sel.sb.from('prode_picks').upsert({ match_id: id, home: pk.home, away: pk.away, scorer: pk.scorer || null }, { onConflict: 'user_id,match_id' }).select().single();
  prode.saving[id] = false;
  if (error) { toastMsg(error.message); repaintProdeCard(id); return; }
  prode.picks[id] = data; delete prode.edits[id];
  repaintProdeCard(id);
  toastMsg('Pronóstico guardado.');
}
function editPick(id, patch) {
  const base = current(prode.matches.find(x => x.id === id)) || { home: 0, away: 0, scorer: null };
  prode.edits[id] = { home: base.home, away: base.away, scorer: base.scorer || null, ...patch };
  const s = prode.picks[id];
  if (s && s.home === prode.edits[id].home && s.away === prode.edits[id].away && (s.scorer || null) === (prode.edits[id].scorer || null)) delete prode.edits[id];
}

function askText(title, label, value, action, hint = '', max = 40) {
  showDialog(`${dlgHead(esc(title))}
    <label class="field"><span>${esc(label)}</span><input id="prodeInput" maxlength="${max}" value="${esc(value)}" autocomplete="off" enterkeyhint="done" onkeydown="if(event.key==='Enter'){event.preventDefault();this.closest('form').querySelector('[data-prode-action]').click()}"></label>
    ${hint ? `<p class="kpi-note">${hint}</p>` : ''}
    <div class="actions"><button type="button" class="btn filled" data-prode-action="${action}">Aceptar</button></div>`, 'ask');
  setTimeout(() => $('#prodeInput')?.focus(), 50);
}
async function rpcOrToast(fn, args) {
  const { data, error } = await sel.sb.rpc(fn, args);
  if (error) { toastMsg(error.message); return null; }
  return data;
}
async function shareLeague(l) {
  const url = `${location.origin}${location.pathname}?tab=sel&vista=prode&liga=${l.code}`;
  const text = `Sumate a mi liga “${l.name}” del Prode de la Celeste en Celestes. Código: ${l.code}`;
  if (navigator.share) { try { await navigator.share({ title: 'Prode de la Celeste', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toastMsg('Copié la invitación: pegala en WhatsApp.'); } catch { toastMsg(`Código de la liga: ${l.code}`); }
}

function onProdeClick(ev) {
  const b = ev.target.closest('[data-prode-step], [data-prode-save], [data-prode-scope], [data-prode-action], [data-prode-share], [data-prode-leave]');
  if (!b) return false;
  ev.preventDefault();
  const ds = b.dataset;
  if (ds.prodeStep) {
    const [id, side, delta] = ds.prodeStep.split(':');
    const cur = current(prode.matches.find(x => x.id === id)) || {};
    editPick(id, { [side]: Math.max(0, Math.min(20, (cur[side] ?? 0) + Number(delta))) });
    repaintProdeCard(id); return true;
  }
  if (ds.prodeSave) { saveProde(ds.prodeSave); return true; }
  if (ds.prodeScope) {
    prode.scope = ds.prodeScope;
    document.querySelectorAll('#prodeScope button').forEach(x => x.classList.toggle('on', x === b));
    $('#prodeRank').innerHTML = loading('Cargando ranking…');
    loadRanking().then(() => { const el = $('#prodeRank'); if (el) el.innerHTML = rankingList(); });
    return true;
  }
  if (ds.prodeShare) { const l = prode.leagues.find(x => x.id === ds.prodeShare); if (l) shareLeague(l); return true; }
  if (ds.prodeLeave) {
    const l = prode.leagues.find(x => x.id === ds.prodeLeave);
    if (l && confirm(`¿Salir de la liga “${l.name}”?`)) rpcOrToast('prode_leave_league', { p_league: l.id }).then(() => renderSel());
    return true;
  }
  const a = ds.prodeAction;
  const needLogin = ['nick', 'create', 'join'].includes(a) && !sel.session;
  if (a === 'login' || needLogin) { signIn('prode'); return true; }
  if (a === 'nick') askText('Tu apodo', 'Así aparecés en los rankings', prode.nick || '', 'savenick', 'Entre 2 y 24 caracteres. No uses datos personales.', 24);
  if (a === 'create') askText('Nueva liga', 'Nombre de la liga', '', 'docreate', 'Después te doy un link para invitar a tus amigos.');
  if (a === 'join') askText('Unirme a una liga', 'Código de 6 letras', '', 'dojoin', '', 6);
  const val = ($('#prodeInput')?.value || '').trim();
  if (a === 'savenick') {
    if (val.length < 2) { toastMsg('El apodo necesita al menos 2 caracteres.'); return true; }
    sel.sb.from('prode_profiles').upsert({ user_id: sel.session.user.id, nickname: val }).then(({ error }) => {
      if (error) return toastMsg(error.message);
      $('#detail').close(); toastMsg('Apodo actualizado.'); renderSel();
    });
  }
  if (a === 'docreate') {
    if (val.length < 2) { toastMsg('Poné un nombre de al menos 2 caracteres.'); return true; }
    rpcOrToast('prode_create_league', { p_name: val }).then(l => { if (!l) return; $('#detail').close(); prode.scope = l.id; renderSel().then(() => shareLeague(l)); });
  }
  if (a === 'dojoin') {
    if (!/^[A-Za-z2-9]{6}$/.test(val)) { toastMsg('El código tiene 6 letras o números.'); return true; }
    rpcOrToast('prode_join_league', { p_code: val }).then(l => { if (!l) return; $('#detail').close(); prode.scope = l.id; toastMsg(`Te uniste a “${l.name}”.`); renderSel(); });
  }
  return true;
}
function onProdeInput(ev) {
  const id = ev.target.dataset?.prodeScorer;
  if (!id) return false;
  editPick(id, { scorer: ev.target.value || null });
  repaintProdeCard(id);
  return true;
}
