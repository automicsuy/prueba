// TEMPORAL: datos de la selección en ESPN (se elimina antes de producción).
const { espn } = require('./_lib');
module.exports = async (req, res) => {
  const out = {};
  try {
    for (const l of ['fifa.friendly', 'fifa.worldq.conmebol', 'fifa.world']) {
      try {
        const r = await espn(`soccer/${l}/teams/212/roster`);
        let a = r.athletes || []; if (a[0]?.items) a = a.flatMap(g => g.items);
        out[`roster:${l}`] = { n: a.length, coach: r.coach, sample: a.slice(0, 40).map(x => `${x.displayName} (${x.position?.abbreviation}) ${x.id}`), season: r.season?.year };
      } catch (e) { out[`roster:${l}`] = String(e.message); }
    }
    for (const l of ['fifa.friendly', 'fifa.worldq.conmebol', 'conmebol.america', 'fifa.world']) {
      try {
        const r = await espn(`soccer/${l}/teams/212/schedule`, 'fixture=true');
        out[`next:${l}`] = (r.events || []).slice(0, 5).map(e => `${e.date} ${e.name} | ${e.competitions?.[0]?.venue?.fullName || ''}`);
      } catch (e) { out[`next:${l}`] = String(e.message); }
    }
    const t = await espn('soccer/fifa.friendly/teams/212');
    out.team = { keys: Object.keys(t.team || {}), record: t.team?.record, nextEvent: (t.team?.nextEvent || []).map(e => `${e.date} ${e.name}`), standingSummary: t.team?.standingSummary, logo: t.team?.logos?.[0]?.href };
  } catch (e) { out.error = String(e.stack); }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(out, null, 1));
};
