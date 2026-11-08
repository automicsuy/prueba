// TEMPORAL: verificar cómo contar goles y asistencias (se elimina antes de producción).
const { espn } = require('./_lib');
const { pool } = require('./_uru');
module.exports = async (req, res) => {
  try {
    const who = new URL(req.url, 'http://x').searchParams.get('id') || '290538';
    const leagues = ['fifa.world', 'fifa.worldq.conmebol', 'conmebol.america', 'fifa.friendly'];
    const jobs = [];
    for (const l of leagues) for (let y = 2019; y <= 2026; y++) jobs.push({ l, y });
    const evs = (await pool(jobs, 12, async ({ l, y }) => (await espn(`soccer/${l}/teams/212/schedule`, `season=${y}`)).events?.map(e => ({ id: e.id, l })) || [])).flat().filter(e => e && e.id);
    const found = [];
    await pool(evs, 12, async ({ id, l }) => {
      const d = await espn(`soccer/${l}/summary`, `event=${id}`);
      const t = (d.rosters || []).find(r => String(r.team?.id) === '212');
      const me = t?.roster?.find(p => String(p.athlete?.id) === who);
      const sp = (me?.plays || []).filter(p => p.scoringPlay);
      if (!sp.length) return;
      found.push({
        id, l, plays: me.plays,
        keyEvents: (d.keyEvents || []).filter(k => k.scoringPlay).map(k => ({ type: k.type?.text, team: k.team?.id, period: k.period?.number, shootout: k.shootout, clock: k.clock?.displayValue, who: (k.participants || []).map(p => p.athlete?.displayName || p.athlete?.id) })),
      });
    });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ events: evs.length, withScoring: found.length, found: found.slice(0, 6) }, null, 1));
  } catch (e) { res.end(String(e.stack)); }
};
