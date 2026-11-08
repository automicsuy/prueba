'use strict';
// Sección Selección: resumen, convocados, votación (convocados + oncena) y noticias de la Celeste.
// Usa utilidades de app.js ($, esc, ic, avatar, getJSON, etc.); solo declara funciones, app.js las invoca.

/* ---------- Formaciones (filas de atrás hacia adelante) ---------- */
const FORMATIONS = {
  '4-3-3': [['G', ['ARQ']], ['D', ['LD', 'DC', 'DC', 'LI']], ['M', ['MC', 'MC', 'MC']], ['F', ['ED', 'DC', 'EI']]],
  '4-4-2': [['G', ['ARQ']], ['D', ['LD', 'DC', 'DC', 'LI']], ['M', ['MD', 'MC', 'MC', 'MI']], ['F', ['DC', 'DC']]],
  '4-2-3-1': [['G', ['ARQ']], ['D', ['LD', 'DC', 'DC', 'LI']], ['M', ['MCD', 'MCD']], ['M', ['ED', 'MCO', 'EI']], ['F', ['DC']]],
  '3-5-2': [['G', ['ARQ']], ['D', ['DC', 'DC', 'DC']], ['M', ['CD', 'MC', 'MC', 'MC', 'CI']], ['F', ['DC', 'DC']]],
  '5-3-2': [['G', ['ARQ']], ['D', ['CD', 'DC', 'DC', 'DC', 'CI']], ['M', ['MC', 'MC', 'MC']], ['F', ['DC', 'DC']]],
  '3-4-3': [['G', ['ARQ']], ['D', ['DC', 'DC', 'DC']], ['M', ['MD', 'MC', 'MC', 'MI']], ['F', ['ED', 'DC', 'EI']]],
};
const LINE_NAMES = { G: 'Arqueros', D: 'Defensas', M: 'Mediocampistas', F: 'Delanteros' };
const slotsOf = f => FORMATIONS[f].flatMap(([line, labels], r) => labels.map((label, i) => ({ id: `r${r}s${i}`, row: r, i, n: labels.length, line, label })));
const lineOfPos = pos => (['G', 'D', 'M', 'F'].includes(pos) ? pos : 'M');

/* ---------- Estado ---------- */
const sel = {
  view: 'resumen', data: null, elig: null, eligById: {}, sb: null, session: null,
  myVote: null, results: null, draft: null, step: 'squad', q: '', posFilter: 'all', onlySel: false, saving: false,
};
const DRAFT_KEY = () => `celestes:draft:${sel.data?.window?.id || 'x'}`;

async function loadSel() {
  if (sel.data && Date.now() - sel.data._t < 10 * 60_000) return sel.data;
  const d = await getJSON('api/seleccion', 10 * 60_000);
  d._t = Date.now();
  sel.data = d;
  return d;
}
async function loadElig() {
  if (sel.elig) return sel.elig;
  const d = await getJSON('api/elegibles', 24 * 3600_000);
  // Los convocados oficiales siempre se pueden elegir (aunque ESPN no los marque como uruguayos en su club).
  const have = new Set(d.players.map(p => p.id));
  const extra = (sel.data?.squad || []).filter(p => !have.has(p.id)).map(p => ({
    id: p.id, n: p.n, pos: p.pos, age: p.age, club: p.club?.name || '', clubLogo: p.club?.logo || '', photo: p.photo || '', m: p.pj, s20: 0,
  }));
  sel.elig = [...extra, ...d.players];
  sel.eligById = Object.fromEntries(sel.elig.map(p => [p.id, p]));
  return sel.elig;
}
// Datos de un jugador para mostrar (de elegibles, del plantel oficial o de la lista de jugadores).
function pinfo(id) {
  const e = sel.eligById[id];
  const o = sel.data?.squad?.find(x => x.id === id);
  const s = typeof playerById === 'function' ? playerById(id) : null;
  return {
    id, n: e?.n || o?.n || s?.n || `Jugador ${id}`, photo: e?.photo || o?.photo || s?.photo || '',
    pos: e?.pos || o?.pos || s?.pos || '', club: e?.club || o?.club?.name || s?.club?.name || '',
    clubLogo: e?.clubLogo || o?.club?.logo || s?.club?.logo || '',
  };
}

/* ---------- Supabase (inicio de sesión con Google y votos) ---------- */
async function initSupabase() {
  if (sel.sb || !window.supabase) return sel.sb;
  const d = await loadSel();
  if (!d.supabase?.url || !d.supabase?.key) return null;
  sel.sb = window.supabase.createClient(d.supabase.url, d.supabase.key, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
  const { data } = await sel.sb.auth.getSession();
  sel.session = data.session;
  sel.sb.auth.onAuthStateChange((_e, session) => { sel.session = session; if (state.tab === 'sel') renderSel(); });
  return sel.sb;
}
async function signIn(vista = 'votar') {
  saveDraft();
  const sb = await initSupabase();
  if (!sb) return toastMsg('La votación todavía no está configurada.');
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}${location.pathname}?tab=sel&vista=${vista}` } });
  if (error) toastMsg(/provider is not enabled|Unsupported provider/i.test(error.message) ? 'El inicio de sesión con Google todavía no está habilitado.' : `No se pudo iniciar sesión: ${error.message}`);
}
async function signOut() { await sel.sb?.auth.signOut(); sel.session = null; sel.myVote = null; renderSel(); }
async function loadMyVote() {
  if (!sel.sb || !sel.session || !sel.data?.window) return null;
  const { data } = await sel.sb.from('votes').select('*').eq('window_id', sel.data.window.id).maybeSingle();
  sel.myVote = data || null;
  return sel.myVote;
}
async function loadResults() {
  const sb = await initSupabase();
  if (!sb || !sel.data?.window) return null;
  const { data, error } = await sb.rpc('vote_results', { p_window: sel.data.window.id });
  if (error) throw new Error(error.message);
  sel.results = data;
  return data;
}

/* ---------- Borrador del voto (se guarda en el dispositivo hasta enviarlo) ---------- */
function newDraft() { return { squad: [], formation: '4-3-3', lineup: {} }; }
function saveDraft() { try { if (sel.draft) localStorage.setItem(DRAFT_KEY(), JSON.stringify(sel.draft)); } catch { /* sin storage */ } }
function loadDraft() {
  if (sel.draft) return sel.draft;
  try { const raw = localStorage.getItem(DRAFT_KEY()); if (raw) { sel.draft = JSON.parse(raw); return sel.draft; } } catch { /* nada */ }
  if (sel.myVote) {
    const lineup = {};
    const slots = slotsOf(sel.myVote.formation);
    (sel.myVote.lineup || []).forEach((e, k) => { const s = slots.find(x => x.id === e.slot) || slots[k]; if (s) lineup[s.id] = e.player; });
    sel.draft = { squad: sel.myVote.squad.slice(), formation: sel.myVote.formation, lineup };
  } else sel.draft = newDraft();
  return sel.draft;
}

let toastT;
function toastMsg(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200);
}

/* ---------- Render principal ---------- */
const SEL_VIEWS = [['resumen', 'Resumen'], ['forma', 'Cómo llegan'], ['votar', 'Votá'], ['prode', 'Prode'], ['resultados', 'Resultados'], ['convocados', 'Convocados'], ['noticias', 'Noticias']];
let selReq = 0;
async function renderSel() {
  const box = $('#selBody');
  $('#selTabs').innerHTML = SEL_VIEWS.map(([k, l]) => `<button class="${sel.view === k ? 'on' : ''}" data-sel-view="${k}">${l}</button>`).join('');
  const req = ++selReq;
  if (!sel.data) box.innerHTML = loading('Cargando datos de la selección…') + skeleton(4);
  try { await loadSel(); } catch (err) { if (req === selReq) box.innerHTML = errorBox('No se pudieron cargar los datos de la selección.', err, 'retrySel'); return; }
  if (req !== selReq) return;
  setSub(sel.data.upcoming[0] ? `Próximo: ${sel.data.upcoming[0].rival.name}` : 'Selección uruguaya');
  const views = { resumen: viewResumen, convocados: viewConvocados, votar: viewVotar, prode: viewProde, forma: viewForma, resultados: viewResultados, noticias: viewNoticias };
  await (views[sel.view] || viewResumen)(box, req);
}

/* ---------- Resumen ---------- */
function countdown(iso) {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'Ya empezó';
  const d = Math.floor(ms / 86400_000), h = Math.floor((ms % 86400_000) / 3600_000), m = Math.floor((ms % 3600_000) / 60_000);
  return d ? `Faltan ${d} ${d === 1 ? 'día' : 'días'} y ${h} h` : `Faltan ${h} h ${m} min`;
}
const resPill = m => `<span class="res res-${m.res}">${m.res}</span>`;
const flag = (logo, name) => logo ? `<img class="flag" src="${esc(logo)}" alt="" onerror="this.remove()">` : `<span class="flag ph">${esc(initials(name))}</span>`;
function leaderList(list, key, label) {
  return `<ol class="leaders">${list.map((p, i) => `<li data-player="${esc(p.id)}" tabindex="0"><span class="rank">${i + 1}</span>${avatar(p, 'sm')}<span class="ln"><b>${esc(p.n)}</b><small>${esc(p.club)}</small></span><span class="lv"><b>${p[key]}</b><small>${label}</small></span></li>`).join('')}</ol>`;
}
async function viewResumen(box) {
  const d = sel.data;
  const next = d.upcoming[0];
  const w = d.window;
  const r = d.record;
  box.innerHTML = `
    ${next ? `<a class="match-hero" ${next.link ? `href="${esc(next.link)}" target="_blank" rel="noopener"` : ''}>
      <span class="mh-top">${esc(next.comp)} · ${esc(cap(fmtDayLong.format(new Date(next.date))))}, ${fmtTime.format(new Date(next.date))}</span>
      <span class="mh-teams">
        <span class="mh-team">${flag(next.uruLogo, 'Uruguay')}<b>Uruguay</b></span>
        <span class="mh-vs">${next.state === 'in' ? `<b class="live-score">${next.gf} – ${next.ga}</b>` : 'vs'}</span>
        <span class="mh-team">${flag(next.rival.logo, next.rival.name)}<b>${esc(next.rival.name)}</b></span>
      </span>
      <span class="mh-cd">${ic('calendar')}${countdown(next.date)}</span>
      ${next.venue ? `<span class="mh-venue">${ic('pin')}${esc(next.venue)}${next.city ? ', ' + esc(next.city) : ''}</span>` : ''}
    </a>` : `<div class="empty"><b>Sin partidos programados</b><small>ESPN todavía no publicó el próximo partido de la Celeste.</small></div>`}
    ${d.upcoming.length > 1 ? `<h3 class="group-h">También en agenda</h3><div class="card">${d.upcoming.slice(1).map(m => `<div class="mrow">${flag(m.rival.logo, m.rival.name)}<span><b>${m.local ? 'Uruguay vs ' : ''}${esc(m.rival.name)}${m.local ? '' : ' vs Uruguay'}</b><small>${esc(m.comp)} · ${esc(cap(fmtDayLong.format(new Date(m.date))))}, ${fmtTime.format(new Date(m.date))}</small></span></div>`).join('')}</div>` : ''}
    ${w ? `<button class="vote-cta" data-sel-view="votar"><span><b>Armá tu selección</b><small>Votá tus 26 convocados y tu oncena para la ${esc(w.title.replace(/^Fecha FIFA /, 'fecha FIFA de '))}. Cierra: ${esc(cap(fmtDayLong.format(new Date(w.closesAt))))}.</small></span>${ic('right')}</button>` : ''}
    ${next ? `<button class="vote-cta prode-cta" data-sel-view="prode"><span><b>Jugá al prode</b><small>Pronosticá ${next.local ? `Uruguay–${esc(next.rival.name)}` : `${esc(next.rival.name)}–Uruguay`} y el goleador celeste. Armá una liga con tus amigos.</small></span>${ic('right')}</button>` : ''}
    <button class="vote-cta prode-cta" data-sel-view="forma"><span><b>Cómo llegan</b><small>El índice de forma de cada uruguayo en su club, los que piden pista y los convocados en baja.</small></span>${ic('right')}</button>
    <h3 class="group-h">Últimos 12 meses</h3>
    <div class="kpis rec"><div><b>${r.pj}</b><small>Partidos</small></div><div><b>${r.g}</b><small>Ganados</small></div><div><b>${r.e}</b><small>Empates</small></div><div><b>${r.p}</b><small>Perdidos</small></div><div><b>${r.gf}</b><small>Goles a favor</small></div><div><b>${r.gc}</b><small>En contra</small></div></div>
    <h3 class="group-h">Resultados recientes</h3>
    <div class="card">${d.recent.slice(0, 8).map(m => `<a class="mrow" ${m.link ? `href="${esc(m.link)}" target="_blank" rel="noopener"` : ''}>${resPill(m)}${flag(m.rival.logo, m.rival.name)}<span><b>${m.local ? `Uruguay ${m.gf}–${m.ga} ${esc(m.rival.name)}` : `${esc(m.rival.name)} ${m.ga}–${m.gf} Uruguay`}</b><small>${esc(m.comp)} · ${fmtDate(m.date)}</small></span></a>`).join('') || '<p class="kpi-note">Sin datos.</p>'}</div>
    <h3 class="group-h">Líderes en actividad <small>· selección mayor desde 2010</small></h3>
    <div class="seg small" id="leaderSeg"><button class="on" data-leader="goles">Goles</button><button data-leader="partidos">Partidos</button><button data-leader="asistencias">Asistencias</button></div>
    <div id="leaderList">${leaderList(d.leaders.goles, 'g', 'goles')}</div>`;
}

/* ---------- Convocados oficiales ---------- */
async function viewConvocados(box) {
  const sq = sel.data.squad;
  if (!sq.length) { box.innerHTML = `<div class="empty"><b>Sin lista publicada</b><small>ESPN todavía no registró a los convocados de esta fecha.</small></div>`; return; }
  const groups = ['G', 'D', 'M', 'F'].map(l => [l, sq.filter(p => lineOfPos(p.pos) === l)]).filter(([, ps]) => ps.length);
  box.innerHTML = `<p class="section-sub">${sq.length} jugadores en el plantel registrado por ESPN para esta fecha.</p>
    ${groups.map(([l, ps]) => `<h3 class="group-h">${LINE_NAMES[l]} <small>· ${ps.length}</small></h3>
      <div class="plist">${ps.map(p => `<button class="prow" data-player="${esc(p.id)}">${avatar(p, 'md')}
        <span class="pinfo"><b>${esc(p.n)}</b><small>${p.club?.logo ? `<img src="${esc(p.club.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${esc(p.club?.name || '')}${p.age ? ` · ${p.age} años` : ''}</small></span>
        <span class="pnum">${p.pj}<small>PJ</small></span><span class="pnum">${p.g}<small>G</small></span><span></span>
      </button>`).join('')}</div>`).join('')}`;
}

/* ---------- Noticias de la selección ---------- */
async function viewNoticias(box, req) {
  box.innerHTML = loading('Juntando noticias…') + skeleton(4);
  let d;
  try { d = await loadNews(); } catch (err) { if (req === selReq) box.innerHTML = errorBox('No se pudieron cargar las noticias.', err, 'retrySel'); return; }
  if (req !== selReq) return;
  const squadIds = new Set(sel.data.squad.map(p => p.id));
  const items = d.items.filter(n => n.sel || n.ids.some(id => squadIds.has(id)));
  if (!items.length) { box.innerHTML = `<div class="empty"><b>Sin noticias recientes</b></div>`; return; }
  const hi = items.findIndex(n => n.img);
  box.innerHTML = `${hi >= 0 ? newsHero(items[hi]) : ''}<div class="news-list">${items.filter((_, i) => i !== hi).slice(0, 60).map(newsRow).join('')}</div>`;
}

/* ---------- Votación ---------- */
async function viewVotar(box, req) {
  const w = sel.data.window;
  if (!w) { box.innerHTML = `<div class="empty"><b>No hay votación abierta</b><small>Se abre cuando ESPN publique el próximo partido de la Celeste.</small></div>`; return; }
  const closed = Date.parse(w.closesAt) <= Date.now();
  box.innerHTML = loading('Preparando la votación…') + skeleton(3);
  try { await Promise.all([loadElig(), initSupabase()]); if (sel.session) await loadMyVote(); } catch (err) { if (req === selReq) box.innerHTML = errorBox('No se pudo preparar la votación.', err, 'retrySel'); return; }
  if (req !== selReq) return;
  if (closed) { box.innerHTML = `<div class="empty"><b>La votación de esta fecha cerró</b><small>Mirá lo que eligió la gente en Resultados.</small><button class="btn" data-sel-view="resultados">Ver resultados</button></div>`; return; }
  loadDraft();
  const user = sel.session?.user;
  const head = `<div class="vote-head">
      <div><b>${esc(w.title)}</b><small>Cierra ${esc(fmtDayLong.format(new Date(w.closesAt)))}, ${fmtTime.format(new Date(w.closesAt))} · ${countdown(w.closesAt).toLowerCase()}</small></div>
      ${user ? `<span class="who">${user.user_metadata?.avatar_url ? `<img src="${esc(user.user_metadata.avatar_url)}" alt="" referrerpolicy="no-referrer">` : ''}<span>${esc(user.user_metadata?.full_name || user.email || '')}</span><button class="btn text" data-sel-action="logout">Salir</button></span>` : ''}
    </div>
    ${sel.myVote ? `<p class="note ok">${ic('flag')}Ya votaste en esta fecha. Podés cambiar tu voto hasta el cierre.</p>` : ''}
    <div class="stepper"><button class="${sel.step === 'squad' ? 'on' : ''}" data-step="squad"><i>1</i>Convocados <small>${sel.draft.squad.length}/26</small></button><button class="${sel.step === 'xi' ? 'on' : ''}" data-step="xi"><i>2</i>Oncena <small>${Object.keys(sel.draft.lineup).length}/11</small></button></div>`;
  box.innerHTML = head + `<div id="voteStep"></div>`;
  paintStep();
}

function paintStep() {
  const el = $('#voteStep');
  if (!el) return;
  if (sel.step === 'squad') paintSquadStep(el); else paintXiStep(el);
  const st = document.querySelectorAll('.stepper small');
  if (st[0]) st[0].textContent = `${sel.draft.squad.length}/26`;
  if (st[1]) st[1].textContent = `${Object.keys(sel.draft.lineup).length}/11`;
}

function paintSquadStep(el) {
  const dr = sel.draft;
  const chosen = new Set(dr.squad);
  const byLine = l => dr.squad.filter(id => lineOfPos(pinfo(id).pos) === l).length;
  const q = norm(sel.q);
  const list = sel.elig.filter(p => (sel.posFilter === 'all' || lineOfPos(p.pos) === sel.posFilter)
    && (!sel.onlySel || p.m || p.s20) && (!q || norm(p.n).includes(q) || norm(p.club).includes(q)));
  el.innerHTML = `
    <div class="squad-bar">
      <div class="lines">${['G', 'D', 'M', 'F'].map(l => `<span><b>${byLine(l)}</b>${LINE_NAMES[l].slice(0, 3)}.</span>`).join('')}</div>
      <div class="actions tight">
        ${sel.data.squad.length ? `<button class="btn text" data-sel-action="official">Partir de la lista del DT</button>` : ''}
        ${dr.squad.length ? `<button class="btn text" data-sel-action="clear">Vaciar</button>` : ''}
      </div>
    </div>
    ${dr.squad.length ? `<div class="chosen">${dr.squad.map(id => { const p = pinfo(id); return `<button class="chip-p" data-toggle="${esc(id)}" aria-label="Quitar a ${esc(p.n)}">${avatar(p, 'xxs')}${esc(shortName(p.n))}${ic('close')}</button>`; }).join('')}</div>` : ''}
    <label class="search"><svg><use href="#i-search"/></svg><input type="search" id="eligSearch" placeholder="Buscar entre ${sel.elig.length} uruguayos en actividad" value="${esc(sel.q)}" autocomplete="off"></label>
    <div class="fchips">${[['all', 'Todos'], ['G', 'Arqueros'], ['D', 'Defensas'], ['M', 'Medios'], ['F', 'Delanteros']].map(([k, l]) => `<button class="fchip ${sel.posFilter === k ? 'on' : ''}" data-pos-filter="${k}">${l}</button>`).join('')}
      <button class="fchip ${sel.onlySel ? 'on' : ''}" data-sel-action="onlysel">Ya jugaron en la selección</button></div>
    <div class="plist pick">${list.slice(0, 120).map(p => `<button class="prow ${chosen.has(p.id) ? 'chosen-row' : ''}" data-toggle="${esc(p.id)}">${avatar(p, 'md')}
      <span class="pinfo"><b>${esc(p.n)}</b><small>${p.clubLogo ? `<img src="${esc(p.clubLogo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${esc(p.club)} · ${esc(POS[p.pos] || p.pos || '—')}</small>
        <span class="tags">${p.m ? `<span class="tag mayor">Mayor · ${p.m} PJ</span>` : ''}${p.s20 ? '<span class="tag s20">Sub-20</span>' : ''}</span></span>
      <span class="check" aria-hidden="true">${chosen.has(p.id) ? '✓' : '+'}</span>
    </button>`).join('') || '<p class="kpi-note">Sin resultados.</p>'}</div>
    ${list.length > 120 ? `<p class="foot">Mostrando 120 de ${list.length}. Usá el buscador para encontrar a otros.</p>` : ''}
    <div class="vote-foot"><button class="btn filled wide" data-step="xi" ${dr.squad.length < 11 ? 'disabled' : ''}>Siguiente: tu oncena (${dr.squad.length}/26)</button></div>`;
}

function paintXiStep(el) {
  const dr = sel.draft;
  const slots = slotsOf(dr.formation);
  const rows = FORMATIONS[dr.formation].length;
  // Quitar asignaciones que ya no existen (cambio de formación o jugador fuera de la lista).
  Object.keys(dr.lineup).forEach(k => { if (!slots.some(s => s.id === k) || !dr.squad.includes(dr.lineup[k])) delete dr.lineup[k]; });
  const filled = Object.keys(dr.lineup).length;
  el.innerHTML = `
    <div class="fchips">${Object.keys(FORMATIONS).map(f => `<button class="fchip ${dr.formation === f ? 'on' : ''}" data-formation="${f}">${f}</button>`).join('')}</div>
    <div class="pitch" style="--rows:${rows}">
      <div class="pitch-lines"><i class="box top"></i><i class="box bottom"></i><i class="mid"></i><i class="circle"></i></div>
      ${slots.map(s => {
        const pid = dr.lineup[s.id];
        const p = pid ? pinfo(pid) : null;
        const top = 90 - (s.row / (rows - 1)) * 80;
        const left = ((s.i + 1) / (s.n + 1)) * 100;
        return `<button class="slot ${p ? 'set' : ''}" style="top:${top}%;left:${left}%" data-slot="${s.id}">
          ${p ? avatar(p, 'pslot') : `<span class="slot-empty">+</span>`}
          <span class="slot-name">${p ? esc(shortName(p.n)) : esc(s.label)}</span>
        </button>`;
      }).join('')}
    </div>
    <p class="kpi-note">Tocá cada puesto para elegir entre tus ${dr.squad.length} convocados.</p>
    ${filled === 11 ? `<div class="actions center"><button class="btn" data-sel-action="share-mine">${ic('external')}Compartir mi oncena</button></div>` : ''}
    <div class="vote-foot">
      <button class="btn" data-step="squad">Volver a convocados</button>
      <button class="btn filled" data-sel-action="save" ${filled < 11 || sel.saving ? 'disabled' : ''}>${sel.saving ? 'Guardando…' : sel.session ? (sel.myVote ? 'Actualizar mi voto' : 'Enviar mi voto') : 'Iniciar sesión con Google y votar'}</button>
    </div>`;
}

function openSlotPicker(slotId) {
  const dr = sel.draft;
  const s = slotsOf(dr.formation).find(x => x.id === slotId);
  const used = new Set(Object.entries(dr.lineup).filter(([k]) => k !== slotId).map(([, v]) => v));
  const players = dr.squad.map(pinfo).sort((a, b) => (lineOfPos(b.pos) === s.line) - (lineOfPos(a.pos) === s.line) || a.n.localeCompare(b.n));
  showDialog(`${dlgHead(`${esc(s.label)} · ${LINE_NAMES[s.line]}`)}
    <div class="plist pick in-dlg">${players.map(p => `<button class="prow ${used.has(p.id) ? 'dim-row' : ''}" data-assign="${esc(p.id)}" data-slot-id="${esc(slotId)}">${avatar(p, 'md')}
      <span class="pinfo"><b>${esc(p.n)}</b><small>${esc(POS[p.pos] || p.pos || '')}${used.has(p.id) ? ' · ya está en otro puesto' : ''}</small></span>
      <span class="check">${dr.lineup[slotId] === p.id ? '✓' : ''}</span></button>`).join('')}</div>
    ${dr.lineup[slotId] ? `<div class="actions"><button class="btn text" type="button" data-assign="" data-slot-id="${esc(slotId)}">Dejar vacío</button></div>` : ''}`);
}

async function saveVote() {
  const dr = sel.draft;
  saveDraft();
  if (!sel.session) return signIn();
  const slots = slotsOf(dr.formation);
  const lineup = slots.filter(s => dr.lineup[s.id]).map(s => ({ slot: s.id, label: s.label, line: s.line, player: dr.lineup[s.id] }));
  sel.saving = true; paintStep();
  const { error } = await sel.sb.from('votes').upsert({
    user_id: sel.session.user.id, window_id: sel.data.window.id, squad: dr.squad, formation: dr.formation, lineup,
  }, { onConflict: 'user_id,window_id' });
  sel.saving = false;
  if (error) { toastMsg(error.message); paintStep(); return; }
  try { localStorage.removeItem(DRAFT_KEY()); } catch { /* nada */ }
  await loadMyVote();
  toastMsg('Tu voto quedó guardado.');
  sel.view = 'resultados';
  renderSel();
}

/* ---------- Resultados ---------- */
async function viewResultados(box, req) {
  const w = sel.data.window;
  if (!w) { box.innerHTML = `<div class="empty"><b>No hay votación en curso</b></div>`; return; }
  box.innerHTML = loading('Contando votos…') + skeleton(3);
  let r;
  try { await loadElig(); r = await loadResults(); } catch (err) { if (req === selReq) box.innerHTML = errorBox('No se pudieron cargar los resultados.', err, 'retrySel'); return; }
  if (req !== selReq) return;
  if (!r || !r.voters) { box.innerHTML = `<div class="empty"><b>Todavía no hay votos</b><small>Sé el primero en armar tu selección.</small><button class="btn filled" data-sel-view="votar">Votar</button></div>`; return; }
  const official = new Set(sel.data.squad.map(p => p.id));
  const top = r.squad.slice(0, 26);
  const coincide = top.filter(x => official.has(x.player)).length;
  const form = r.formations[0]?.formation || '4-3-3';
  // Oncena de la gente: para cada línea de la formación más votada, los más votados en esa línea.
  const used = new Set();
  const bestIn = (line, k) => r.lineup.filter(x => x.line === line && !used.has(x.player)).slice(0, k).map(x => { used.add(x.player); return x; });
  const xi = {};
  const rows = FORMATIONS[form];
  const perLine = {};
  rows.forEach(([line, labels]) => { perLine[line] = (perLine[line] || 0) + labels.length; });
  const picks = Object.fromEntries(Object.entries(perLine).map(([l, k]) => [l, bestIn(l, k)]));
  slotsOf(form).forEach(s => { const x = picks[s.line].shift(); if (x) xi[s.id] = x; });
  const pct = n => Math.round((n / r.voters) * 100);
  sel.peopleSpec = {
    title: 'La oncena de la gente', formation: form,
    subtitle: `${w.title} · ${r.voters} ${r.voters === 1 ? 'votante' : 'votantes'}`,
    players: Object.fromEntries(Object.entries(xi).map(([slot, x]) => { const p = pinfo(x.player); return [slot, { n: p.n, photo: p.photo, badge: `${pct(x.n)}%` }]; })),
  };
  box.innerHTML = `
    <div class="kpis rec three"><div><b>${r.voters}</b><small>${r.voters === 1 ? 'votante' : 'votantes'}</small></div><div><b>${form}</b><small>formación más votada</small></div><div><b>${official.size ? `${coincide}/26` : '—'}</b><small>coinciden con el DT</small></div></div>
    <h3 class="group-h">La oncena de la gente</h3>
    <div class="pitch result" style="--rows:${rows.length}">
      <div class="pitch-lines"><i class="box top"></i><i class="box bottom"></i><i class="mid"></i><i class="circle"></i></div>
      ${slotsOf(form).map(s => {
        const x = xi[s.id]; const p = x ? pinfo(x.player) : null;
        const top = 90 - (s.row / (rows.length - 1)) * 80, left = ((s.i + 1) / (s.n + 1)) * 100;
        return `<span class="slot set" style="top:${top}%;left:${left}%">${p ? avatar(p, 'pslot') : '<span class="slot-empty">?</span>'}<span class="slot-name">${p ? esc(shortName(p.n)) : esc(s.label)}</span>${x ? `<span class="slot-pct">${pct(x.n)}%</span>` : ''}</span>`;
      }).join('')}
    </div>
    <h3 class="group-h">Los 26 de la gente</h3>
    <div class="plist">${top.map((x, i) => { const p = pinfo(x.player); return `<div class="prow vote-row">
      <span class="rank">${i + 1}</span>${avatar(p, 'sm')}
      <span class="pinfo"><b>${esc(p.n)}</b><small>${official.has(x.player) ? '<span class="tag mayor" title="También está en la lista del DT">DT ✓</span> ' : ''}${esc(p.club)}</small>
        <span class="bar"><i style="width:${pct(x.n)}%"></i></span></span>
      <span class="pnum">${pct(x.n)}%</span></div>`; }).join('')}</div>
    ${r.formations.length > 1 ? `<h3 class="group-h">Formaciones</h3><div class="card pad-sm">${r.formations.map(f => `<div class="frow"><b>${f.formation}</b><span class="bar"><i style="width:${pct(f.n)}%"></i></span><small>${pct(f.n)}%</small></div>`).join('')}</div>` : ''}
    <div class="actions"><button class="btn filled" data-sel-view="votar">${sel.myVote ? 'Cambiar mi voto' : 'Votar'}</button>
      ${sel.myVote ? `<button class="btn" data-sel-action="share-mine">${ic('external')}Compartir mi oncena</button>` : ''}
      <button class="btn" data-sel-action="share-people">${ic('external')}Compartir la de la gente</button></div>`;
}

/* ---------- Eventos de la sección ---------- */
function onSelClick(ev) {
  if (typeof onShareClick === 'function' && onShareClick(ev)) return true;
  if (typeof onProdeClick === 'function' && onProdeClick(ev)) return true;
  if (typeof onFormaClick === 'function' && onFormaClick(ev)) return true;
  const el = ev.target.closest('button, [data-player]');
  if (!el) return false;
  const ds = el.dataset;
  if (ds.selView) { ev.preventDefault(); if ($('#detail').open) $('#detail').close(); sel.view = ds.selView; window.scrollTo({ top: 0 }); renderSel(); return true; }
  if (el.id === 'retrySel') { memCache.clear(); sel.data = null; renderSel(); return true; }
  if (ds.leader) {
    document.querySelectorAll('#leaderSeg button').forEach(b => b.classList.toggle('on', b === el));
    const key = { goles: ['g', 'goles'], partidos: ['pj', 'partidos'], asistencias: ['a', 'asist.'] }[ds.leader];
    $('#leaderList').innerHTML = leaderList(sel.data.leaders[ds.leader], key[0], key[1]);
    return true;
  }
  if (ds.step) { if (ds.step === 'xi' && sel.draft.squad.length < 11) return true; sel.step = ds.step; saveDraft(); renderSel(); return true; }
  if (ds.toggle) {
    const dr = sel.draft, id = ds.toggle;
    if (dr.squad.includes(id)) { dr.squad = dr.squad.filter(x => x !== id); Object.keys(dr.lineup).forEach(k => dr.lineup[k] === id && delete dr.lineup[k]); }
    else if (dr.squad.length >= 26) { toastMsg('Ya tenés 26 convocados. Quitá alguno para sumar otro.'); return true; }
    else dr.squad.push(id);
    saveDraft(); paintStep(); return true;
  }
  if (ds.posFilter) { sel.posFilter = ds.posFilter; paintStep(); return true; }
  if (ds.formation) { sel.draft.formation = ds.formation; saveDraft(); paintStep(); return true; }
  if (ds.slot) { openSlotPicker(ds.slot); return true; }
  if (ds.assign !== undefined && ds.slotId) {
    ev.preventDefault();
    const dr = sel.draft;
    Object.keys(dr.lineup).forEach(k => dr.lineup[k] === ds.assign && delete dr.lineup[k]);
    if (ds.assign) dr.lineup[ds.slotId] = ds.assign; else delete dr.lineup[ds.slotId];
    saveDraft(); $('#detail').close(); paintStep(); return true;
  }
  const a = ds.selAction;
  if (a === 'official') {
    const ids = sel.data.squad.slice().sort((x, y) => y.pj - x.pj).slice(0, 26).map(p => p.id);
    sel.draft.squad = ids; saveDraft(); paintStep();
    if (sel.data.squad.length > 26) toastMsg(`La lista del DT tiene ${sel.data.squad.length}; cargué los 26 con más partidos.`);
    return true;
  }
  if (a === 'clear') { sel.draft = newDraft(); saveDraft(); paintStep(); return true; }
  if (a === 'onlysel') { sel.onlySel = !sel.onlySel; paintStep(); return true; }
  if (a === 'save') { saveVote(); return true; }
  if (a === 'logout') { signOut(); return true; }
  if (a === 'share-mine') { openShareCard(myCardSpec(), 'mia'); return true; }
  if (a === 'share-people' && sel.peopleSpec) { openShareCard(sel.peopleSpec, 'gente'); return true; }
  return false;
}
function onSelInput(ev) {
  if (typeof onProdeInput === 'function' && onProdeInput(ev)) return;
  if (ev.target.id !== 'eligSearch') return;
  sel.q = ev.target.value;
  clearTimeout(onSelInput.t);
  onSelInput.t = setTimeout(() => { const pos = ev.target.selectionStart; paintStep(); const i = $('#eligSearch'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 180);
}
