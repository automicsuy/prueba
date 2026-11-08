// Índice de forma (0-100) de un jugador con sus últimos partidos de CLUB (gameLog de ESPN).
// Tres partes, transparentes y explicables:
//   Rodaje (0-40): titular 8 pts, suplente 4 pts por partido (últimos 5). Se castiga si hace mucho que no juega.
//   Aporte (0-35): goles, asistencias y tiros al arco (arqueros: vallas invictas y atajadas), según el puesto.
//   Nivel (0-25): exigencia de la liga del club.

const NATIONAL = new Set(['212', '7345']);
// Nivel de liga por "slug" de ESPN.
const TIER = {
  'eng.1': 25, 'esp.1': 25, 'ita.1': 25, 'ger.1': 25, 'fra.1': 24,
  'por.1': 20, 'ned.1': 20, 'bra.1': 20, 'arg.1': 19, 'tur.1': 18, 'bel.1': 18, 'mex.1': 18, 'usa.1': 17,
  'eng.2': 17, 'ksa.1': 16, 'gre.1': 16, 'sco.1': 15, 'aut.1': 16, 'sui.1': 16, 'den.1': 15, 'rus.1': 15,
  'esp.2': 15, 'ita.2': 15, 'ger.2': 15, 'fra.2': 14, 'col.1': 14, 'chi.1': 13, 'ecu.1': 13, 'par.1': 12,
  'uru.1': 12, 'per.1': 11, 'bol.1': 10, 'ven.1': 10,
};
const leagueTier = slug => TIER[slug] ?? 12;

const num = v => Number(v) || 0;
function parseGameLog(gl) {
  const st = gl?.statistics?.[0];
  if (!st) return [];
  const idx = n => st.names.indexOf(n);
  const v = (row, n) => (idx(n) >= 0 ? num(row.stats[idx(n)]) : 0);
  return (st.events || []).map(row => {
    const ev = gl.events?.[row.eventId] || {};
    if (NATIONAL.has(String(ev.team?.id))) return null; // solo partidos de club
    const app = String(row.stats[idx('appearances')] || '');
    return {
      id: row.eventId, d: ev.gameDate || '', lg: ev.leagueShortName || ev.leagueName || '',
      opp: ev.opponent?.displayName || '', oppLogo: ev.opponent?.logo || '', home: ev.atVs === 'vs',
      score: ev.score || '', res: ev.gameResult || '',
      st: /start/i.test(app) ? 'T' : /sub/i.test(app) ? 'S' : '-',
      g: v(row, 'totalGoals'), a: v(row, 'goalAssists'), sog: v(row, 'shotsOnTarget'),
      cs: v(row, 'cleanSheet'), sv: v(row, 'saves'), gc: v(row, 'goalsConceded'), tr: v(row, 'redCards'),
    };
  }).filter(Boolean).sort((x, y) => Date.parse(y.d) - Date.parse(x.d));
}

function partScores(games, pos) {
  const rodaje = games.reduce((n, m) => n + (m.st === 'T' ? 8 : m.st === 'S' ? 4 : 0), 0);
  let aporte;
  if (pos === 'G') aporte = games.reduce((n, m) => n + m.cs * 6 + Math.min(m.sv, 6) * 0.8 - Math.max(0, m.gc - 1) * 1.5, 0) + 8;
  else {
    const w = { F: [6, 4, 1], M: [7, 5, 1], D: [9, 6, 0.5] }[pos] || [7, 5, 1];
    aporte = games.reduce((n, m) => n + m.g * w[0] + m.a * w[1] + m.sog * w[2], 0);
    if (pos === 'D') aporte += games.filter(m => m.st === 'T').length * 2; // a un defensa se lo valora por jugar
  }
  aporte -= games.reduce((n, m) => n + m.tr * 4, 0);
  return { rodaje: Math.min(40, rodaje), aporte: Math.max(0, Math.min(35, aporte)) };
}

function formIndex(games, pos, leagueSlug, now = Date.now()) {
  const last5 = games.slice(0, 5);
  if (!last5.length) return { index: 0, rodaje: 0, aporte: 0, nivel: 0, trend: 0, daysOff: null };
  const daysOff = Math.floor((now - Date.parse(last5[0].d)) / 86400_000);
  // Sin jugar hace mucho: probablemente lesionado, suplente o sin club.
  const fresh = daysOff <= 21 ? 1 : daysOff <= 35 ? 0.7 : daysOff <= 60 ? 0.4 : 0.15;
  const p = partScores(last5, pos);
  const nivel = leagueTier(leagueSlug);
  const index = Math.round((p.rodaje * fresh) + (p.aporte * fresh) + nivel * (0.4 + 0.6 * fresh));
  // Tendencia: los 2 últimos contra los 3 anteriores (por partido).
  const per = gs => { if (!gs.length) return null; const s = partScores(gs, pos); return (s.rodaje + s.aporte) / gs.length; };
  const a = per(last5.slice(0, 2)), b = per(last5.slice(2));
  const trend = a == null || b == null ? 0 : a - b > 3 ? 1 : b - a > 3 ? -1 : 0;
  return { index: Math.max(0, Math.min(100, index)), rodaje: Math.round(p.rodaje * fresh), aporte: Math.round(p.aporte * fresh), nivel: Math.round(nivel * (0.4 + 0.6 * fresh)), trend: fresh < 1 ? -1 : trend, daysOff };
}

module.exports = { parseGameLog, formIndex, leagueTier };
