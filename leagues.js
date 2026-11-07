// Competiciones (slugs de la API pública de ESPN: site.api.espn.com/apis/site/v2/sports/{sport}/{id})
// Para agregar/quitar una competición, editá esta lista.
const LEAGUES_LIST = [
  // Fútbol – ligas
  { id: 'eng.1', sport: 'soccer', name: 'Premier League', group: 'Ligas', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 'esp.1', sport: 'soccer', name: 'LaLiga', group: 'Ligas', flag: '🇪🇸' },
  { id: 'ita.1', sport: 'soccer', name: 'Serie A', group: 'Ligas', flag: '🇮🇹' },
  { id: 'usa.1', sport: 'soccer', name: 'MLS', group: 'Ligas', flag: '🇺🇸' },
  { id: 'arg.1', sport: 'soccer', name: 'Liga Profesional Argentina', group: 'Ligas', flag: '🇦🇷' },
  { id: 'uru.1', sport: 'soccer', name: 'Liga Uruguaya', group: 'Ligas', flag: '🇺🇾' },

  // Fútbol – copas de clubes
  { id: 'uefa.champions', sport: 'soccer', name: 'Champions League', group: 'Copas', flag: '🏆' },
  { id: 'uefa.europa', sport: 'soccer', name: 'Europa League', group: 'Copas', flag: '🏆' },
  { id: 'uefa.europa.conf', sport: 'soccer', name: 'Conference League', group: 'Copas', flag: '🏆' },
  { id: 'uefa.super_cup', sport: 'soccer', name: 'Supercopa UEFA', group: 'Copas', flag: '🏆' },
  { id: 'conmebol.libertadores', sport: 'soccer', name: 'Copa Libertadores', group: 'Copas', flag: '🏆' },
  { id: 'conmebol.sudamericana', sport: 'soccer', name: 'Copa Sudamericana', group: 'Copas', flag: '🏆' },
  { id: 'conmebol.recopa', sport: 'soccer', name: 'Recopa Sudamericana', group: 'Copas', flag: '🏆' },

  // Fútbol – selecciones mayores masculinas
  { id: 'fifa.world', sport: 'soccer', name: 'Mundial', group: 'Selecciones', flag: '🌎' },
  { id: 'fifa.worldq.conmebol', sport: 'soccer', name: 'Eliminatorias CONMEBOL', group: 'Selecciones', flag: '🌎' },
  { id: 'fifa.worldq.uefa', sport: 'soccer', name: 'Eliminatorias UEFA', group: 'Selecciones', flag: '🌍' },
  { id: 'fifa.worldq.concacaf', sport: 'soccer', name: 'Eliminatorias CONCACAF', group: 'Selecciones', flag: '🌎' },
  { id: 'conmebol.america', sport: 'soccer', name: 'Copa América', group: 'Selecciones', flag: '🌎' },
  { id: 'uefa.euro', sport: 'soccer', name: 'Eurocopa', group: 'Selecciones', flag: '🌍' },
  { id: 'uefa.euroq', sport: 'soccer', name: 'Eliminatorias Euro', group: 'Selecciones', flag: '🌍' },
  { id: 'uefa.nations', sport: 'soccer', name: 'UEFA Nations League', group: 'Selecciones', flag: '🌍' },
  { id: 'concacaf.gold', sport: 'soccer', name: 'Copa Oro', group: 'Selecciones', flag: '🌎' },
  { id: 'fifa.friendly', sport: 'soccer', name: 'Amistosos internacionales', group: 'Selecciones', flag: '🤝' },

  // Básquet
  { id: 'nba', sport: 'basketball', name: 'NBA', group: 'Básquet', flag: '🏀' },
  { id: 'fiba', sport: 'basketball', name: 'FIBA (selecciones)', group: 'Básquet', flag: '🌐' },

  // Más ligas: siempre se revisan en la pestaña "Uruguayos"; en la agenda vienen apagadas (se activan en ⚙︎).
  { id: 'conmebol.sudamericano_sub20', sport: 'soccer', name: 'Sudamericano Sub-20', group: 'Más ligas', flag: '🌎', extra: true },
  { id: 'fifa.world.u20', sport: 'soccer', name: 'Mundial Sub-20', group: 'Más ligas', flag: '🌎', extra: true },
  { id: 'bra.1', sport: 'soccer', name: 'Brasileirão', group: 'Más ligas', flag: '🇧🇷', extra: true },
  { id: 'bra.copa_do_brazil', sport: 'soccer', name: 'Copa do Brasil', group: 'Más ligas', flag: '🇧🇷', extra: true },
  { id: 'mex.1', sport: 'soccer', name: 'Liga MX', group: 'Más ligas', flag: '🇲🇽', extra: true },
  { id: 'por.1', sport: 'soccer', name: 'Primeira Liga', group: 'Más ligas', flag: '🇵🇹', extra: true },
  { id: 'esp.2', sport: 'soccer', name: 'LaLiga 2', group: 'Más ligas', flag: '🇪🇸', extra: true },
  { id: 'eng.2', sport: 'soccer', name: 'Championship', group: 'Más ligas', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', extra: true },
  { id: 'ita.2', sport: 'soccer', name: 'Serie B', group: 'Más ligas', flag: '🇮🇹', extra: true },
  { id: 'fra.1', sport: 'soccer', name: 'Ligue 1', group: 'Más ligas', flag: '🇫🇷', extra: true },
  { id: 'ger.1', sport: 'soccer', name: 'Bundesliga', group: 'Más ligas', flag: '🇩🇪', extra: true },
  { id: 'tur.1', sport: 'soccer', name: 'Süper Lig', group: 'Más ligas', flag: '🇹🇷', extra: true },
  { id: 'gre.1', sport: 'soccer', name: 'Superliga Grecia', group: 'Más ligas', flag: '🇬🇷', extra: true },
  { id: 'ksa.1', sport: 'soccer', name: 'Saudi Pro League', group: 'Más ligas', flag: '🇸🇦', extra: true },
  { id: 'arg.copa', sport: 'soccer', name: 'Copa Argentina', group: 'Más ligas', flag: '🇦🇷', extra: true },
  { id: 'chi.1', sport: 'soccer', name: 'Primera Chile', group: 'Más ligas', flag: '🇨🇱', extra: true },
  { id: 'par.1', sport: 'soccer', name: 'Primera Paraguay', group: 'Más ligas', flag: '🇵🇾', extra: true },
  { id: 'ecu.1', sport: 'soccer', name: 'LigaPro Ecuador', group: 'Más ligas', flag: '🇪🇨', extra: true },
  { id: 'col.1', sport: 'soccer', name: 'Primera A Colombia', group: 'Más ligas', flag: '🇨🇴', extra: true },
  { id: 'per.1', sport: 'soccer', name: 'Liga 1 Perú', group: 'Más ligas', flag: '🇵🇪', extra: true },
  { id: 'bol.1', sport: 'soccer', name: 'Primera Bolivia', group: 'Más ligas', flag: '🇧🇴', extra: true },
  { id: 'ven.1', sport: 'soccer', name: 'Primera Venezuela', group: 'Más ligas', flag: '🇻🇪', extra: true },
];

if (typeof window !== 'undefined') window.LEAGUES = LEAGUES_LIST;
if (typeof module !== 'undefined') module.exports = LEAGUES_LIST;
