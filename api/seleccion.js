// GET /api/seleccion → todo sobre la selección mayor: próximos partidos, resultados recientes, balance,
// convocados (plantel actual registrado por ESPN), líderes entre los jugadores en actividad y la fecha de votación.
const { espn, send, compact } = require('./_lib');
const { URU_TEAM_ID, getSelecciones, pool } = require('./_uru');
const { photoIndex, findPhoto } = require('./_photos');

const LEAGUES = ['fifa.friendly', 'fifa.worldq.conmebol', 'conmebol.america', 'fifa.world'];
const LEAGUE_NAMES = { 'fifa.friendly': 'Amistoso', 'fifa.worldq.conmebol': 'Eliminatorias', 'conmebol.america': 'Copa América', 'fifa.world': 'Mundial' };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Partidos de Uruguay (pasados y futuros) de las últimas temporadas.
async function matches() {
  const y = new Date().getFullYear();
  const jobs = LEAGUES.flatMap(l => [y - 1, y, y + 1].map(season => ({ l, season })));
  const res = await pool(jobs, 12, async ({ l, season }) => {
    const d = await espn(`soccer/${l}/teams/${URU_TEAM_ID}/schedule`, `season=${season}`);
    return (d.events || []).map(ev => ({ ...compact(ev, l), comp: LEAGUE_NAMES[l] }));
  });
  const seen = new Map();
  res.flat().forEach(e => e && e.id && seen.set(e.id, e));
  return [...seen.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

const side = e => (e.home.id === URU_TEAM_ID ? { uru: e.home, rival: e.away, local: true } : { uru: e.away, rival: e.home, local: false });
function shape(e) {
  const { uru, rival, local } = side(e);
  const gf = Number(uru.score), ga = Number(rival.score);
  return {
    id: e.id, date: e.date, state: e.state, comp: e.comp, venue: e.venue, city: e.city, link: e.link, tv: e.tv, local,
    rival: { name: rival.name, short: rival.short, logo: rival.logo }, uruLogo: uru.logo,
    gf: e.state === 'pre' ? null : gf, ga: e.state === 'pre' ? null : ga,
    res: e.state !== 'post' ? null : gf > ga ? 'G' : gf < ga ? 'P' : 'E',
  };
}

// Crea/actualiza la fecha de votación en Supabase (solo el servidor tiene la clave).
async function ensureWindow(win) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY, token = process.env.VOTE_WINDOW_TOKEN;
  if (!url || !key || !token) return;
  try {
    await fetch(`${url}/rest/v1/rpc/ensure_window`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_id: win.id, p_title: win.title, p_closes_at: win.closesAt, p_token: token }),
    });
  } catch { /* la votación se muestra igual; el voto falla con un mensaje claro si la fecha no existe */ }
}

module.exports = async (req, res) => {
  try {
    const [all, sel, photos, roster, playersRes] = await Promise.all([
      matches(),
      getSelecciones(req.headers.host),
      photoIndex().catch(() => null),
      espn(`soccer/fifa.friendly/teams/${URU_TEAM_ID}/roster`).catch(() => ({})),
      fetch(`https://${req.headers.host}/api/jugadores`).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const now = Date.now();
    const upcoming = all.filter(e => e.state !== 'post' && Date.parse(e.date) > now - 3 * 3600_000).map(shape);
    const past = all.filter(e => e.state === 'post').map(shape).reverse();

    // Balance de los últimos 12 meses.
    const last12 = past.filter(m => now - Date.parse(m.date) < 365 * 86400_000);
    const record = { pj: last12.length, g: 0, e: 0, p: 0, gf: 0, gc: 0 };
    last12.forEach(m => { record[m.res.toLowerCase()]++; record.gf += m.gf; record.gc += m.ga; });

    // Convocados: plantel registrado por ESPN para la fecha actual.
    let athletes = roster.athletes || [];
    if (athletes[0]?.items) athletes = athletes.flatMap(g => g.items || []);
    const active = Object.fromEntries((playersRes?.players || []).map(p => [p.id, p]));
    const squad = athletes.map(a => {
      const id = String(a.id);
      const p = active[id];
      const st = sel.stats?.mayor?.[id] || null;
      return {
        id, n: a.displayName, pos: a.position?.abbreviation || '', age: a.age || null,
        club: p?.club || null,
        photo: p?.photo || (photos && findPhoto(photos, a.displayName, (a.dateOfBirth || '').slice(0, 10))) || '',
        pj: st?.pj || 0, g: st?.g || 0,
      };
    });

    // Líderes entre los jugadores en actividad (selección mayor, desde 2010).
    const actives = (playersRes?.players || []).filter(p => p.mayor);
    const pick = p => ({ id: p.id, n: p.n, photo: p.photo, club: p.club?.name || '', pj: p.mayor.pj, g: p.mayor.g, a: p.mayor.a });
    const leaders = {
      goles: actives.slice().sort((a, b) => b.mayor.g - a.mayor.g || b.mayor.pj - a.mayor.pj).slice(0, 8).map(pick),
      partidos: actives.slice().sort((a, b) => b.mayor.pj - a.mayor.pj).slice(0, 8).map(pick),
      asistencias: actives.slice().sort((a, b) => b.mayor.a - a.mayor.a || b.mayor.pj - a.mayor.pj).slice(0, 8).map(pick),
    };

    // Fecha de votación: el mes del próximo partido; cierra cuando empieza el primero de esa fecha.
    let window = null;
    const next = upcoming[0];
    if (next) {
      const d = new Date(next.date);
      const id = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const sameWindow = upcoming.filter(m => m.date.slice(0, 7) === next.date.slice(0, 7));
      const title = `Fecha FIFA ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}: ${sameWindow.map(m => m.rival.name).join(' y ')}`;
      window = { id, title, closesAt: next.date, matches: sameWindow.map(m => m.id) };
      if (Date.parse(next.date) - now < 75 * 86400_000) await ensureWindow(window);
    }

    res.setHeader('cache-control', 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600');
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      upcoming: upcoming.slice(0, 6), recent: past.slice(0, 10), record, squad, leaders, window,
      supabase: { url: process.env.SUPABASE_URL || '', key: process.env.SUPABASE_ANON_KEY || '' },
      builtAt: new Date().toISOString(),
    }));
  } catch (e) {
    send(res, 502, { error: String(e.message || e) });
  }
};
