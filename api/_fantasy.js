// Fantasy de legionarios: jornadas semanales y puntos por partido de club.
// Jornada = el viernes en que cierra (12:00 de Uruguay = 15:00 UTC). El equipo de la jornada R suma
// los partidos jugados desde ese cierre hasta el cierre del viernes siguiente.
// Puntos: titular 2, suplente 1, gol 5 (defensa o arquero 6), asistencia 3, valla invicta 4 (arquero o defensa titular), roja -3.

const DAY = 86400_000;
const lockOf = round => Date.parse(`${round}T15:00:00Z`);
// Viernes cuyo cierre es el último anterior (o igual) a ts.
function roundOf(ts) {
  const d = new Date(ts);
  const back = (d.getUTCDay() - 5 + 7) % 7; // días desde el último viernes
  let fri = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
  if (ts < Date.parse(`${fri.toISOString().slice(0, 10)}T15:00:00Z`)) fri = new Date(fri.getTime() - 7 * DAY);
  return fri.toISOString().slice(0, 10);
}
// Jornada abierta para armar equipo: la del próximo cierre.
const openRound = (now = Date.now()) => new Date(lockOf(roundOf(now)) + 7 * DAY).toISOString().slice(0, 10);

function gamePoints(m, pos) {
  if (m.st !== 'T' && m.st !== 'S') return { pts: 0, why: [] };
  const why = [];
  let pts = m.st === 'T' ? 2 : 1;
  why.push(m.st === 'T' ? 'Titular +2' : 'Suplente +1');
  const gv = pos === 'D' || pos === 'G' ? 6 : 5;
  if (m.g) { pts += m.g * gv; why.push(`${m.g} gol${m.g > 1 ? 'es' : ''} +${m.g * gv}`); }
  if (m.a) { pts += m.a * 3; why.push(`${m.a} asist. +${m.a * 3}`); }
  if ((pos === 'G' || pos === 'D') && m.st === 'T' && m.ga === 0) { pts += 4; why.push('Valla invicta +4'); }
  if (m.tr) { pts -= 3 * m.tr; why.push('Roja −3'); }
  return { pts, why };
}

// Puntos de cada jugador en las jornadas que tocan sus partidos recientes.
function roundScores(players) {
  const out = [];
  players.forEach(p => {
    const pos = ['G', 'D', 'M', 'F'].includes(p.pos) ? p.pos : null;
    if (!pos) return;
    const byRound = {};
    (p.form?.last || []).forEach(m => {
      const t = Date.parse(m.d);
      if (!t || t > Date.now()) return;
      const r = roundOf(t);
      const gp = gamePoints(m, pos);
      (byRound[r] ||= { pts: 0, detail: [] });
      byRound[r].pts += gp.pts;
      byRound[r].detail.push({ d: m.d, opp: m.opp, score: m.score, why: gp.why, pts: gp.pts });
    });
    // Solo las 2 últimas jornadas (la que corre y la anterior); las viejas ya quedaron guardadas.
    const recent = new Set([roundOf(Date.now()), roundOf(Date.now() - 7 * DAY)]);
    Object.entries(byRound).filter(([r]) => recent.has(r)).forEach(([r, v]) => out.push({ round: r, id: p.id, pts: v.pts, detail: v.detail }));
  });
  return out;
}

async function syncFantasy(players) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY, token = process.env.VOTE_WINDOW_TOKEN;
  if (!url || !key || !token) return;
  const elig = players.filter(p => ['G', 'D', 'M', 'F'].includes(p.pos)).map(p => ({ id: p.id, n: p.n, pos: p.pos, club: p.club?.name || '' }));
  try {
    await fetch(`${url}/rest/v1/rpc/fantasy_sync`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_token: token, p_players: elig, p_scores: roundScores(players) }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { /* el fantasy sigue con lo último cargado */ }
}

module.exports = { lockOf, roundOf, openRound, gamePoints, roundScores, syncFantasy };
