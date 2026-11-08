'use strict';
// "Cómo llegan": índice de forma (0-100) de los uruguayos en actividad, solo con partidos de club,
// y el voto rápido "¿Lo convocás?" en la ficha de cada jugador.

const forma = { scope: 'all', line: 'all' };
const formTone = i => (i >= 70 ? 'hi' : i >= 45 ? 'mid' : 'lo');
const trendMark = t => (t > 0 ? '<span class="trend up" title="En alza" aria-label="En alza">▲</span>'
  : t < 0 ? '<span class="trend down" title="En baja" aria-label="En baja">▼</span>'
  : '<span class="trend eq" title="Estable" aria-label="Estable">–</span>');
const RES = { W: 'ganó', L: 'perdió', D: 'empató' };
function gameTitle(m) {
  return `${m.st === 'T' ? 'Titular' : 'Suplente'} vs ${m.opp} (${RES[m.res] || ''} ${m.score})${m.g ? ` · ${m.g} gol${m.g > 1 ? 'es' : ''}` : ''}${m.a ? ` · ${m.a} asist.` : ''}${m.cs ? ' · valla invicta' : ''}`;
}
// Los 5 últimos partidos, del más viejo al más nuevo: lleno = titular, hueco = suplente; G/A si aportó.
function formStrip(f) {
  const last = (f?.last || []).slice(0, 5).reverse();
  return `<span class="fstrip" aria-label="Últimos partidos">${last.map(m => `<i class="${m.st === 'T' ? 't' : 's'} ${m.g ? 'g' : m.a ? 'a' : m.cs ? 'c' : ''}" title="${esc(gameTitle(m))}">${m.g ? 'G' : m.a ? 'A' : m.cs ? '0' : ''}</i>`).join('')}</span>`;
}
const formChip = f => (f.i == null ? '<span class="fchip-i lo" title="Sin partidos registrados en los últimos 45 días"><b>s/d</b></span>'
  : `<span class="fchip-i ${formTone(f.i)}"><b>${f.i}</b>${trendMark(f.t)}</span>`);

async function viewForma(box, req) {
  box.innerHTML = loading('Midiendo cómo llegan…') + skeleton(5);
  try { await loadStats(); } catch (err) { if (req === selReq) box.innerHTML = errorBox('No se pudieron cargar los jugadores.', err, 'retrySel'); return; }
  if (req !== selReq) return;
  paintForma(box);
}
function paintForma(box = $('#selBody')) {
  const official = new Set((sel.data?.squad || []).map(p => p.id));
  const all = (statsData || []).filter(p => p.form && p.form.last?.length);
  const list = all.filter(p => (forma.scope === 'all' || (forma.scope === 'in' ? official.has(p.id) : !official.has(p.id)))
    && (forma.line === 'all' || lineOfPos(p.pos) === forma.line))
    .sort((a, b) => (b.form.i ?? -1) - (a.form.i ?? -1) || b.form.t - a.form.t);
  // Los que "piden pista": buena forma y fuera de la lista del DT.
  const knocking = all.filter(p => !official.has(p.id) && p.mayor && p.form.i != null && p.form.i >= 65).sort((a, b) => b.form.i - a.form.i).slice(0, 3);
  const falling = all.filter(p => official.has(p.id) && p.form.i != null && (p.form.i < 45 || p.form.t < 0)).sort((a, b) => a.form.i - b.form.i).slice(0, 3);
  const mini = (p, why) => `<button class="kn" data-player="${esc(p.id)}">${avatar(p, 'sm')}<span><b>${esc(shortName(p.n))}</b><small>${esc(why)}</small></span>${formChip(p.form)}</button>`;
  box.innerHTML = `
    <p class="section-sub">Índice de 0 a 100 con los últimos 5 partidos de <b class="plain">club</b>: rodaje (titular o suplente), aporte (goles, asistencias, tiros al arco; arqueros: vallas invictas y atajadas) y nivel de la liga.</p>
    ${knocking.length || falling.length ? `<div class="kn-grid">
      ${knocking.length ? `<div class="kn-box"><h3 class="group-h">${ic('flag')}Piden pista</h3>${knocking.map(p => mini(p, p.club.name)).join('')}</div>` : ''}
      ${falling.length ? `<div class="kn-box"><h3 class="group-h">Convocados en baja</h3>${falling.map(p => mini(p, p.form.off > 21 ? `Sin jugar hace ${p.form.off} días` : p.club.name)).join('')}</div>` : ''}
    </div>` : ''}
    <div class="toolbar tight">
      <div class="seg small" role="group" aria-label="Lista del DT">${[['all', 'Todos'], ['in', 'En la lista del DT'], ['out', 'Fuera de la lista']].map(([k, l]) => `<button class="${forma.scope === k ? 'on' : ''}" data-forma-scope="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="fchips">${[['all', 'Todos'], ['G', 'Arqueros'], ['D', 'Defensas'], ['M', 'Medios'], ['F', 'Delanteros']].map(([k, l]) => `<button class="fchip ${forma.line === k ? 'on' : ''}" data-forma-line="${k}">${l}</button>`).join('')}</div>
    <div class="plist forma">${list.map((p, i) => `<button class="prow" data-player="${esc(p.id)}">
      <span class="rank">${i + 1}</span>${avatar(p, 'md')}
      <span class="pinfo"><b>${esc(p.n)}${official.has(p.id) ? ' <span class="tag mayor" title="Está en la lista del DT">DT</span>' : ''}</b>
        <small>${p.club.logo ? `<img src="${esc(p.club.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${esc(p.club.name)}</small>
        ${formStrip(p.form)}</span>
      ${formChip(p.form)}
    </button>`).join('') || '<p class="kpi-note pad">Sin jugadores para este filtro.</p>'}</div>
    <p class="foot">Fuente: últimos partidos registrados por ESPN. El índice no sabe de lesiones ni de decisiones tácticas: si un jugador no juega hace semanas, baja. «s/d»: sin partidos registrados en 45 días (lesión, falta de datos o sin club).</p>`;
}

/* ---------- Ficha: bloque de forma y "¿Lo convocás?" ---------- */
function formBlock(p) {
  const f = p.form;
  if (!f || !f.last?.length) return '';
  return `<h4 class="dlg-sub">Cómo llega · últimos partidos de club</h4>
    <div class="fbox">
      ${f.i == null ? `<p class="kpi-note">Sin partidos registrados en los últimos ${f.off} días: puede estar lesionado o ESPN no tiene sus datos recientes.</p>` : ''}
      <div class="fbox-top" ${f.i == null ? 'hidden' : ''}>${formChip(f)}<div class="fparts">
        <span><i style="width:${(f.r / 40) * 100}%"></i><small>Rodaje ${f.r}/40</small></span>
        <span><i style="width:${(f.a / 35) * 100}%"></i><small>Aporte ${f.a}/35</small></span>
        <span><i style="width:${(f.n / 25) * 100}%"></i><small>Nivel de liga ${f.n}/25</small></span>
      </div></div>
      <ol class="flog">${f.last.map(m => `<li><span class="st ${m.st === 'T' ? 't' : 's'}">${m.st === 'T' ? 'TIT' : 'SUP'}</span>
        <span class="fl-opp">${m.oppLogo ? `<img src="${esc(m.oppLogo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<b>${m.home ? 'vs' : '@'} ${esc(m.opp)}</b><small>${esc(m.lg)} · ${fmtDate(m.d)}</small></span>
        <span class="fl-res r-${esc(m.res)}">${esc(m.score)}</span>
        <span class="fl-ga">${m.g ? `<b>${m.g} G</b>` : ''}${m.a ? `<b>${m.a} A</b>` : ''}${m.cs ? '<b>Invicto</b>' : ''}</span></li>`).join('')}</ol>
    </div>
    <div id="callBox"></div>`;
}
async function paintCallBox(p) {
  const box = $('#callBox');
  const w = sel.data?.window;
  if (!box || !w || Date.parse(w.closesAt) <= Date.now()) return;
  const sb = await initSupabase().catch(() => null);
  if (!sb || !$('#callBox')) return;
  const [{ data: st }, mine] = await Promise.all([
    sb.rpc('player_call_stats', { p_window: w.id, p_player: p.id }),
    sel.session ? sb.from('player_calls').select('yes').eq('window_id', w.id).eq('player_id', p.id).maybeSingle().then(r => r.data) : null,
  ]);
  const s = st?.[0] || { yes: 0, total: 0 };
  const pct = s.total ? Math.round((s.yes / s.total) * 100) : null;
  const my = mine ? mine.yes : null;
  $('#callBox').innerHTML = `<div class="callq">
    <b>¿Lo convocás para ${esc(w.title.replace(/^Fecha FIFA /, 'la fecha de '))}?</b>
    <div class="callq-btns">
      <button type="button" class="btn ${my === true ? 'filled' : ''}" data-call="${esc(p.id)}:1">Sí</button>
      <button type="button" class="btn ${my === false ? 'filled' : ''}" data-call="${esc(p.id)}:0">No</button>
    </div>
    <small>${pct == null ? 'Todavía nadie votó por él.' : `${pct}% de ${s.total} ${Number(s.total) === 1 ? 'hincha' : 'hinchas'} lo convoca.`}</small>
  </div>`;
}
async function castCall(id, yes) {
  if (!sel.session) { toastMsg('Iniciá sesión con Google para votar.'); return signIn('forma'); }
  const { error } = await sel.sb.from('player_calls').upsert({ window_id: sel.data.window.id, player_id: id, yes }, { onConflict: 'user_id,window_id,player_id' });
  if (error) return toastMsg(error.message);
  toastMsg(yes ? 'Lo convocaste.' : 'Lo dejaste afuera.');
  const p = statsData?.find(x => x.id === id);
  if (p) paintCallBox(p);
}

function onFormaClick(ev) {
  const b = ev.target.closest('[data-forma-scope], [data-forma-line], [data-call]');
  if (!b) return false;
  ev.preventDefault();
  if (b.dataset.formaScope) forma.scope = b.dataset.formaScope;
  if (b.dataset.formaLine) forma.line = b.dataset.formaLine;
  if (b.dataset.call) { const [id, v] = b.dataset.call.split(':'); castCall(id, v === '1'); return true; }
  paintForma();
  return true;
}
