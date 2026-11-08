// GET /api/partidos?id=<ESPN athlete id> → partidos de club de la temporada de un jugador:
// por competición (jugados, titular, suplente, minutos) y cada partido con titular/suplente, minutos, goles, asistencias y tarjetas.
const { pool } = require('./_uru');

const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes';
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const NATIONAL = new Set(['212', '7345']);
const H = { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } };

async function get(url) {
  const r = await fetch(url, { ...H, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`ESPN HTTP ${r.status}`);
  return r.json();
}
const num = v => Number(v) || 0;
const minuteOf = s => { const m = /^(\d+)/.exec(String(s || '')); return m ? Math.min(90, Number(m[1])) : null; };

// Titular/suplente y minutos desde la planilla del partido.
async function lineupOf(league, eventId, athleteId) {
  const s = await get(`${SITE}/${league}/summary?event=${eventId}`);
  for (const r of s.rosters || []) {
    const p = (r.roster || []).find(x => String(x.athlete?.id) === athleteId);
    if (!p) continue;
    const subs = (p.plays || []).filter(x => x.substitution).map(x => minuteOf(x.clock?.displayValue)).filter(x => x != null);
    let min = null;
    if (p.starter) min = p.subbedOut && subs.length ? subs[subs.length - 1] : 90;
    else if (p.subbedIn && subs.length) min = Math.max(1, 90 - subs[0]) - (p.subbedOut && subs.length > 1 ? 90 - subs[1] : 0);
    return { st: p.starter ? 'T' : p.subbedIn ? 'S' : '-', min, pos: p.position?.abbreviation || '' };
  }
  return { st: '-', min: null, pos: '' };
}

module.exports = async (req, res) => {
  const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
  res.setHeader('content-type', 'application/json; charset=utf-8');
  if (!/^\d{1,12}$/.test(id)) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'id inválido' })); }
  try {
    const ov = await get(`${WEB}/${id}/overview`);
    const st = ov.statistics || {};
    const idx = n => (st.names || []).indexOf(n);
    const splits = (st.splits || []).filter(sp => !NATIONAL.has(String(sp.teamId)) && sp.leagueSlug);
    // Partidos por competición (el gamelog lista los partidos en los que jugó).
    const comps = await pool(splits, 4, async sp => {
      const gl = await get(`${WEB}/${id}/gamelog?league=${encodeURIComponent(sp.leagueSlug)}`);
      const names = gl.names || [];
      const v = (row, n) => num(row.stats?.[names.indexOf(n)]);
      const rows = (gl.seasonTypes || []).flatMap(t => (t.categories || []).flatMap(c => c.events || []));
      const matches = rows.map(row => {
        const ev = gl.events?.[row.eventId] || {};
        if (NATIONAL.has(String(ev.team?.id))) return null;
        return {
          id: row.eventId, league: sp.leagueSlug, comp: ev.leagueShortName || sp.displayName, d: ev.gameDate || '',
          opp: ev.opponent?.displayName || '', oppLogo: ev.opponent?.logo || '', home: ev.atVs === 'vs',
          score: ev.score || '', res: ev.gameResult || '',
          g: v(row, 'totalGoals'), a: v(row, 'goalAssists'), sh: v(row, 'totalShots'), sog: v(row, 'shotsOnTarget'),
          ta: v(row, 'yellowCards'), tr: v(row, 'redCards'),
        };
      }).filter(Boolean);
      return { name: sp.displayName.replace(/^\d{4}(-\d{2})?\s+/, ''), slug: sp.leagueSlug, tit: num(sp.stats?.[idx('starts')]), matches };
    });
    const ok = comps.filter(c => c && !c.error);
    const all = ok.flatMap(c => c.matches).sort((a, b) => Date.parse(b.d) - Date.parse(a.d));
    // Detalle de titular/suplente y minutos para los últimos 15 partidos.
    const detail = await pool(all.slice(0, 15), 6, m => lineupOf(m.league, m.id, id));
    all.slice(0, 15).forEach((m, i) => { const l = detail[i]; if (l && !l.error) Object.assign(m, l); });
    const byComp = ok.map(c => {
      const pj = c.matches.length;
      const tit = Math.min(c.tit, pj);
      return { name: c.name, slug: c.slug, pj, tit, sup: pj - tit, g: c.matches.reduce((n, m) => n + m.g, 0), a: c.matches.reduce((n, m) => n + m.a, 0) };
    }).filter(c => c.pj);
    const sum = k => byComp.reduce((n, c) => n + c[k], 0);
    const mins = all.filter(m => m.min != null);
    res.setHeader('cache-control', 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400');
    res.statusCode = 200;
    res.end(JSON.stringify({
      id, totals: { pj: sum('pj'), tit: sum('tit'), sup: sum('sup'), g: sum('g'), a: sum('a'), min: mins.reduce((n, m) => n + m.min, 0), minOf: mins.length },
      byComp, matches: all.slice(0, 25),
    }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
};
