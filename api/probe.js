// TEMPORAL: inspección de estructuras de ESPN (se elimina antes de producción).
const trim = (o, n = 2500) => (o === undefined ? null : JSON.stringify(o).slice(0, n));
async function get(u) {
  const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } });
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}
module.exports = async (req, res) => { try { await main(req, res); } catch (e) { res.end(String(e.stack)); } };
async function main(req, res) {
  const out = {};
  const sch = await get('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.friendly/teams/212/schedule?season=2024');
  const ev = (sch.body.events || [])[0];
  out.event = ev && { id: ev.id, date: ev.date };
  if (ev) {
    const s = await get(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.friendly/summary?event=${ev.id}`);
    const t = (s.body.rosters || []).find(r => String(r.team?.id) === '212');
    out.rosterEntryStarter = t && trim(t.roster.find(p => p.starter), 2500);
    out.rosterEntrySub = t && trim(t.roster.find(p => !p.starter && p.subbedIn), 1500);
  }
  const a = await get('https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/235818');
  const ath = a.body.athlete || {};
  out.athleteKeys = Object.keys(ath);
  out.athletePick = { team: ath.team && { id: ath.team.id, name: ath.team.displayName, slug: ath.team.slug }, headshot: ath.headshot, age: ath.age, active: ath.active, status: ath.status, position: ath.position?.abbreviation, displayDOB: ath.displayDOB, flag: ath.flag };
  const o = await get('https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/235818/overview');
  out.nextGame = trim(o.body.nextGame, 1500);
  out.gameLog = trim(o.body.gameLog, 1500);
  const old = await get('https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/18587/overview');
  out.forlanOverview = trim(old.body.statistics, 800);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(out, null, 1));
}
