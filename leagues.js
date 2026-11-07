// Competiciones (slugs de la API pública de ESPN: site.api.espn.com/apis/site/v2/sports/{sport}/{id})
// Para agregar/quitar una competición, editá esta lista.
window.LEAGUES = [
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
];
