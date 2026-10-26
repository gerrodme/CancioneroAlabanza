# Plan: Cancionero multilenguaje

Rama `multilenguaje`. Objetivo: añadir inglés y dejar el plugin listo para que la comunidad añada idiomas sin tocar el
código. Una versión por fase (cada fase se puede publicar sola: con el español como idioma base nada cambia para las
instalaciones actuales).

## Decisiones

- **Sistema estándar de WordPress (gettext).** PHP: `__()`, `_n()`, `_x()`, `esc_html__()`…; JS: `wp.i18n`
  (`__`, `_n`, `_x`, `sprintf`) con `wp_set_script_translations()`. Dominio de texto: `pieb-cancionero`. Archivos en
  `pieb-cancionero/languages/`: plantilla `.pot`, y por idioma `.po` (lo que edita el traductor), `.mo` (PHP) y `.json`
  (uno por archivo JS). Se traduce con Poedit o con Loco Translate desde el propio WordPress.
- **Idioma base: español.** Los textos del código siguen en español (`__('Nueva canción', 'pieb-cancionero')`). Sin
  archivo de traducción se ve en español, así que funciona igual en `es_ES`, `es_MX`, `es_AR`… El inglés es una
  traducción más (`en_US`).
- **Idioma de cada usuario.** Por defecto, el de WordPress (Ajustes → Generales). Cada usuario puede elegir otro en su
  menú (como el tema); se guarda en la meta de usuario `pieb_idioma` ('' = el del sitio). Solo afecta al cancionero, no
  al resto de la web. Respaldo por idioma: si no hay archivo para `en_GB` se usa `en_US`; en general, el primer archivo
  con el mismo idioma (`pt_PT` → `pt_BR`).
- **Notación de las tonalidades.** Lo guardado no cambia nunca (`Sol`, `Mib`, `La m`…). Al mostrarse: en español por
  defecto Do-Re-Mi y en otros idiomas por defecto americana (G, Eb, Am). Cada usuario puede cambiarla en su menú (meta
  `pieb_notacion`: '' automático, `latina`, `americana`). Los formularios muestran la notación elegida pero guardan el
  valor de siempre. La subida múltiple ya entiende las dos al leer los nombres de archivo.
- **Fechas y números** con `Intl` y el idioma del usuario (hoy está fijo `es-ES`).
- **Plurales** con `_n()` y frases con marcadores (`sprintf('%1$s de %2$s', …)`) en lugar de trozos concatenados, para
  que cada idioma pueda ordenar las palabras.
- **Datos del equipo:** no se traducen (títulos, etiquetas, tipos de culto ya guardados). Sí se traducen las
  sugerencias predefinidas (tipos de culto, título automático del culto) y los nombres de los roles al mostrarse.
- **Nombre:** «Cancionero» es la marca. El nombre por defecto de una instalación sin nombre propio es traducible
  (en inglés, «Songbook»).
- **Documentación:** toda en inglés también (`README.en.md`, `CONTRIBUTING.en.md`, `docs/*.en.md`), más una guía
  bilingüe para traductores. `CLAUDE.md` sigue solo en español.

## Glosario español → inglés

| Español | Inglés |
|---|---|
| Cancionero (nombre por defecto) | Songbook |
| canción / canciones | song / songs |
| partitura (principal) | score (main score) |
| partitura editable | editable score |
| letra | lyrics |
| tonalidad / tono | key |
| número de himnario | hymnal number |
| etiqueta | tag |
| culto | service |
| setlist | setlist |
| modo culto · Tocar | play mode · Play |
| equipo de adoración | worship team |
| administrador del cancionero | songbook administrator |
| papelera | trash |
| copia de seguridad | backup |
| subida múltiple | bulk upload |
| estadísticas | statistics |
| ficha (de la canción) | song page |

## Herramienta: `herramientas/i18n.py`

Sin PHP ni WP-CLI en el equipo de desarrollo, así que la herramienta es Python (`polib`, en `herramientas/requirements.txt`):

- `python herramientas/i18n.py extraer` → `languages/pieb-cancionero.pot`. Busca en PHP y JS las llamadas `__`, `_x`,
  `_n`, `_nx`, `esc_html__`, `esc_attr__`, `esc_html_e`, `esc_attr_e`, `_e` con el dominio, con referencias
  archivo:línea y los comentarios `/* translators: … */`. Si ya hay `.po`, los actualiza (`msgmerge`): añade lo nuevo y
  marca lo que ya no existe.
- `python herramientas/i18n.py compilar` → por cada `.po`: el `.mo` y los JSON de JS con el nombre que espera WordPress
  (`pieb-cancionero-<locale>-<md5 de "assets/archivo.js">.json`, formato Jed), y `banco-pruebas/i18n/<locale>.js`
  para el banco de pruebas.
- `python herramientas/i18n.py estado` → porcentaje traducido por idioma.
- `empaquetar.py` llama a `compilar` antes de hacer el zip.

## Fases

### Fase 1 · Infraestructura, idioma y notación (1.8.0)
- Cabecera `Domain Path: /languages`, carpeta `languages/`, `load_plugin_textdomain()` en `init`.
- Idioma del usuario: filtros `plugin_locale` (dominio `pieb-cancionero`) y `load_script_translation_file` con el
  idioma elegido y el respaldo por idioma. También en las peticiones REST (mensajes de error en su idioma).
- Los scripts dependen de `wp-i18n` y llevan `wp_set_script_translations()` (cancionero, visor, cultos, login).
- Configuración JS: `idioma` (BCP 47, p. ej. `en-US`), `idiomas` disponibles (español + los que tengan `.mo`),
  `notacion` efectiva y la elegida.
- `/preferencias` acepta `idioma` y `notacion` además de `tema`.
- En `cancionero.js`: atajos `__`, `_n`, `_x`, `sprintf` (compartidos con los otros JS vía `P`), fechas con el idioma,
  función única para mostrar tonalidades en la notación elegida y su uso en todas partes (lista, filtros, ficha,
  formularios, setlist, PDF, texto copiado, visor, estadísticas). Buscar «G» encuentra también «Sol».
- Menú del usuario: «Idioma» y «Notación» junto a «Tema».
- `herramientas/i18n.py` y su uso desde `empaquetar.py`.
- Banco de pruebas: `banco-pruebas/wp-i18n.js` (imitación mínima de `wp.i18n`) y `?idioma=en_US` para probar.

### Fase 2 · Textos de PHP (1.8.1)
Todos los textos visibles de `pieb-cancionero.php` e `includes/*.php`: errores de la API, correos (el del enlace de
acceso va en el idioma del sitio), avisos, nombres de los roles al mostrarse, comprobación de protección de archivos.

### Fase 3 · Textos de `cancionero.js` (1.8.2)
Unos 360 textos: interfaz principal, formularios, subida múltiple, ajustes, copias, papelera, búsqueda. Plurales con
`_n()`, frases con marcadores, comentarios para traductores donde haya ambigüedad.

### Fase 4 · `cultos.js`, `visor.js`, `login.js` (1.8.3)
Cultos, setlist (también el PDF y el texto para WhatsApp), modo culto, estadísticas e inicio de sesión. Tipos de culto
y título automático traducibles.

### Fase 5 · Inglés (1.9.0)
`languages/pieb-cancionero-en_US.po` completo con el glosario, compilado. Revisión en el banco con `?idioma=en_US`:
textos cortados, botones que no caben, fechas, plurales y notación.

### Fase 6 · Documentación en inglés (1.9.1)
`README.en.md`, `CONTRIBUTING.en.md`, `docs/arquitectura.en.md`, `docs/carga-masiva.en.md`,
`docs/guia-recuperar-cancionero.en.html` con enlaces cruzados entre idiomas, y `docs/traducir.md` / `docs/translate.en.md`:
cómo añadir un idioma (Poedit o Loco Translate, `i18n.py`, cómo enviar el `.po` en un Pull request).

## Cómo se prueba

- JS y CSS en el banco de pruebas, en español (sin parámetro) y en inglés (`?idioma=en_US`).
- PHP: no hay PHP local; se revisa leyendo y se prueba en WordPress con cada zip (un sitio de pruebas mejor que el de
  producción): idioma del sitio en español y en inglés, cambio de idioma y notación desde el menú, mensajes de error de
  la API, correo de acceso y que los archivos privados siguen dando 403 sin sesión.
