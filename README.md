# Mi Agenda Deportiva (PWA)

Agenda personal de fútbol y básquet, sin publicidad, con equipos favoritos.

## Qué hace
- Partidos por día (hoy / ayer / mañana, swipe entre días), en tu hora local.
- Resultados y estado **en vivo** (se actualiza solo cada 60 s cuando hay partidos en juego).
- **Equipos favoritos**: buscalos en "Mis equipos" o tocá un partido → "Seguir". Aparecen arriba en la agenda y en una lista de próximos 21 días.
- Canal de TV oficial según ESPN, botón para **agregar al calendario** (.ics con aviso 15 min antes).
- Activar/desactivar competiciones en ⚙︎. Exportar/importar favoritos.
- Instalable (PWA) y funciona offline con los últimos datos.

## Competiciones
Premier League, LaLiga, Serie A, MLS, Liga Argentina, Liga Uruguaya · Champions, Europa League, Conference, Supercopa UEFA, Libertadores, Sudamericana, Recopa · Selecciones mayores masculinas (Mundial, Eliminatorias, Copa América, Euro, Nations League, Copa Oro, amistosos) · NBA, FIBA.
Editá `leagues.js` para agregar o quitar.

## Datos
API pública (no oficial) de ESPN: `site.api.espn.com`. Sin clave. La Liga Uruguaya de Básquet no está disponible en esa fuente.

## Usarla
Es estática, no necesita build:
```bash
python3 -m http.server 8080   # abrir http://localhost:8080
```
Para instalarla en el celular hay que publicarla con HTTPS (Vercel, Netlify o GitHub Pages) y elegir "Agregar a pantalla de inicio".
