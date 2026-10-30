# Architecture

*Versión en español: [arquitectura.md](arquitectura.md)*

A technical summary of the **Cancionero** plugin for anyone new to the code.

## Pieces

| File | Responsibility |
|---|---|
| `pieb-cancionero.php` | Plugin header, constants, roles and capabilities, the `[cancionero]` shortcode, loading of scripts and of the `PIEB_CANCIONERO` object that the interface reads. |
| `includes/canciones.php` | The song content type, reading/writing metadata, file uploads, size limits. |
| `includes/rest.php` | The `pieb/v1` REST API: list, view, create, update and delete songs; chunked file uploads. |
| `includes/cultos.php` | Services and setlists (content type and API). |
| `includes/ajustes.php` | Themes, settings, the team list, per-user preferences (theme, language, notation), backups (export/import). |
| `includes/google.php` | Sign-in with Google (ID token) and with an email link. |
| `includes/bienvenida.php` | Welcome email for the team: log of sent emails, composing the email (HTML and plain text) and `POST /bienvenida`. |
| `includes/migracion.php` | Converts the PDFs of the previous plugin (`adoracion_culto_*`) into songs. Idempotent. |
| `assets/cancionero.js` | The main interface (no dependencies or build step): list, song page, form, bulk upload, statistics, settings. |
| `assets/cultos.js` | Service screens and the setlist editor. |
| `assets/visor.js` | Viewer / play mode for tablets. |
| `assets/login.js` | Sign-in screen. |
| `assets/cancionero.css` | Styles and themes. Everything hangs off `[data-pcan-theme]` and `--pc-*` variables. |

The interface is a single-page application inside the WordPress page; it navigates with `#/…`
(`#/canciones`, `#/cancion/{id}`, `#/subir`, `#/cultos`, `#/estadisticas`, …).

## Data model

- Content types: `pieb_cancion` (song), `pieb_culto` (service). Tag taxonomy: `pieb_etiqueta`.
- Roles: `equipo_adoracion` ("Worship team": capability `pieb_cancionero_acceso`, view, upload and edit songs) and
  `administrador_cancionero` ("Songbook administrator": access + `pieb_cancionero_gestionar`, that is, settings, team and
  deleting any song). WordPress administrators and editors have both capabilities; backups, restoring and settings
  require `pieb_cancionero_gestionar`. The "team" and "administrators" email lists are in the settings: when someone
  signs in (Google or link) or when the settings are saved, the administrator role is granted or removed according to
  that list (`pieb_can_sincronizar_administrador`).
- **Internal prefix `pieb`:** the internal keys (types `pieb_cancion`, metadata `_pieb_*`, REST route `pieb/v1`,
  functions `pieb_can_*`) keep the historical prefix so as not to break the data of existing installations. It is only a
  technical identifier; the visible product name is "Cancionero".
- **Song** metadata (in `post_meta`):

  | Key | Content |
  |---|---|
  | `_pieb_numero` | Hymnal number (text). |
  | `_pieb_autor` | Author / composer. |
  | `_pieb_tonalidad` | Key in Spanish (Latin) notation: `Do`, `Fa#`, `Sib`, `Mim`… |
  | `_pieb_tempo` | Integer, beats per minute. |
  | `_pieb_letra`, `_pieb_notas` | Plain text (lyrics, notes). |
  | `_pieb_partituras` | List of `{id (attachment), label}`; at least 1. PDF, JPG or PNG, max. 4 MB. |
  | `_pieb_youtube` | List of `{url, label}`; only valid YouTube links are accepted. |
  | `_pieb_audios` | List of `{id, nombre, descripcion}`. MP3/M4A/OGG/WAV/AAC, max. 10 MB. |
  | `_pieb_editables` | List of `{id, descripcion}`: MuseScore, MusicXML… max. 10 MB. |

- **Service** metadata: `_pieb_fecha`, `_pieb_tipo`, `_pieb_notas`, `_pieb_items` (ordered list of
  `{cancion, tonalidad, nota, partitura}`; `partitura` is the ID of the attachment chosen for that service, 0 = the main
  one (the first of the song). When the service is served, the chosen one is placed first in `datos.partituras`, which is
  the one used by play mode and the PDF).
- WordPress options: `pieb_can_ajustes` (settings: `nombre`, `tema_defecto`, `google_client_id`, `emails`,
  `administradores`, `dominio`, `bienvenida_auto`, `bienvenida_texto`, `pagina`), `pieb_can_bienvenidas` (log of the
  welcome emails sent: email → timestamp; not autoloaded), `pieb_can_version`, `pieb_can_migrado`.

## REST API (`/wp-json/pieb/v1/`)

All routes require a signed-in session with the `pieb_cancionero_acceso` capability and the `X-WP-Nonce` header (the
interface receives it in `PIEB_CANCIONERO.nonce`; the API base is in `PIEB_CANCIONERO.api`).

| Route | Methods | Notes |
|---|---|---|
| `/canciones` | GET, POST | GET returns a **summary** of all songs (`id, titulo, numero, autor, tonalidad, tempo, etiquetas, letra, miniatura, creada, modificada` and the **counts** `partituras`, `youtube` and `audios`). POST creates. |
| `/canciones/{id}` | GET, POST, DELETE | GET returns the full record (scores with `archivo`/`url`, audio, `youtube` with `videoId`, notes…). POST **updates by replacing everything** (see below). DELETE sends it to the trash. |
| `/subidas` | POST | **Chunked** file upload (a 10 MB audio fits even if PHP limits requests to 2 MB). |
| `/cultos`, `/cultos/{id}` | GET, POST, DELETE | Services and setlists. |
| `/etiquetas`, `/preferencias`, `/huerfanos` | various | Tags with color, user preferences (`tema`, `idioma` and `notacion`, all optional; empty = automatic), unused files. |
| `/ajustes` | GET, POST | Songbook settings and the team list (requires `pieb_cancionero_gestionar`). The welcome fields are in [Welcome to the team](#welcome-to-the-team). |
| `/bienvenida` | POST | Sends the welcome email to a batch of addresses (requires `pieb_cancionero_gestionar`). See [Welcome to the team](#welcome-to-the-team). |
| `/google`, `/enlace`, `/correo-prueba` | POST | Google sign-in, email link and a test email. |

### Updating a song (`POST /canciones/{id}`)

A `multipart/form-data` body with all of these fields (missing ones are **emptied**):

`titulo, numero, autor, tonalidad, tempo, etiquetas` (comma-separated), `letra, notas`,
`youtube` (JSON `[{url,label}]`), `partituras` (JSON `[{id,label}]` of the ones that are kept),
`nuevasSubidas` (JSON, files already uploaded in chunks), `audios`, `audiosSubidos`, `editables`,
`editablesSubidos`. A song needs **at least one score**.

To change a single value: `GET` the record, rebuild all the fields from it and modify only the one you want. Recipe in
[carga-masiva.en.md](carga-masiva.en.md).

## Welcome to the team

`includes/bienvenida.php`. Someone added to the team's email list can be sent an email that explains how to get in: open
the songbook page, type their email and press the link they receive (and, if Google sign-in is set up, that they can also
use the Google button). It is HTML for email clients (tables, inline styles, 600 px at most, no `<style>`; the header
image `assets/correo-cabecera.jpg` is embedded in the email, `cid:pcan-cabecera`, because Gmail does not show it if it
cannot download it from the site) plus a plain-text version set as `AltBody`. Both are done in `phpmailer_init`, only
while sending; if the mail service skips that hook, the image stays linked by its absolute URL. It is composed inside `pieb_can_en_idioma_del_sitio()`, like the
sign-in link: it goes out in the site's language. WordPress administrator accounts do not get a welcome email (they sign
in with a password).

**New settings** (in `pieb_can_ajustes`): `bienvenida_auto` (bool, `true` by default: send it automatically to whoever
enters the list), `bienvenida_texto` (optional text from the administrator added to the email, max. 1000 characters) and
`pagina` (address of the songbook page; the interface sends it as `pagina` = `location.origin + location.pathname +
location.search` with every save and every send, and it is only stored if it is a valid address of this site; the
fragment and the query are removed, except `page_id` or `p`, which with plain permalinks are the page itself). The
emails use the request's `pagina` if valid, otherwise the stored one and, failing that, the home page (`home_url('/')`).
Restoring a backup includes `bienvenidaAuto` and `bienvenidaTexto` (only if the backup carries them) and **never sends
welcome emails**.

**`GET /ajustes`** also returns `bienvenidaAuto` (bool), `bienvenidaTexto` (string), `pagina` (string, the stored one;
empty if not known yet) and, in each element of `miembros`: `bienvenida` (Unix timestamp of the last send to that
address, 0 if never) and `puedeBienvenida` (bool: not an administrator account and has access).

**`POST /ajustes`** also accepts `bienvenidaAuto`, `bienvenidaTexto` and `pagina` (each one only if present) and its
response is that of `GET` plus `bienvenidaPendiente`: the array of addresses the interface must now send the automatic
welcome to (see below).

**`POST /bienvenida`** (requires `pieb_cancionero_gestionar`). Parameters: `emails` (array; **at most 10** per request,
otherwise error 400), `pagina` (optional) and `prueba` (bool). With `prueba` it sends the welcome email only to the current
user (even an administrator account, so they can see how it looks) and does not log it; it may carry `bienvenidaTexto` to
try the text being written before saving it. Without `prueba`, for every
address: administrator account → `omitidos`; not in the team list → `omitidos`; more than 3 welcome emails per hour to
that address (`pieb_can_limite`) → `omitidos`; `wp_mail` fails → `fallidos`; if it goes well → `enviados` and it is
logged. Response: `{ enviados: [email], fallidos: [{email, motivo}], omitidos: [{email, motivo}], momento }`, where
`momento` is the server time (Unix) so the interface can update "sent on…" without asking for the settings again.

**Log:** the option `pieb_can_bienvenidas` (email → timestamp of the last send, not autoloaded) is updated after every
successful send (not for tests) and prevents repeating the automatic one.

**Automatic welcome.** The server *works out* who should get it when the settings are saved, and the interface *sends* it,
in batches:
1. `POST /ajustes` compares the new email list with the previous one. If `bienvenida_auto` is on, it returns in
   `bienvenidaPendiente` the addresses that enter the list with that save, have never received a welcome email (they are not
   in the log), have never signed in (no account, or an account with neither `pieb_can_ultimo_acceso` nor
   `pieb_can_google_sub`) and are not administrator accounts.
2. The interface sends those addresses by calling `POST /bienvenida` 5 at a time, with a progress bar. This way saving
   does not wait for the sends (each `wp_mail` can take a second with SMTP) and there are no long timeouts if 40 addresses
   are pasted at once.
3. A manual resend or the test uses the same endpoint.

## Trash

`includes/papelera.php`. Deleting a song (`DELETE /canciones/{id}`) sends it to the WordPress trash (`wp_trash_post`) and
records who deleted it (`_pieb_borrada_por`). Songbook administrators manage it at `#/papelera`: `GET /papelera` (list
with date, who deleted it and days left), `POST /papelera/{id}/restaurar` (back to published), `DELETE /papelera/{id}`
(delete for good) and `POST /papelera/vaciar`. `GET /canciones/{id}` also returns deleted songs to those who manage (with
`enPapelera` and `papelera`), and their files are only served to those users.

Cleanup: the `papelera_dias` setting (30 by default; 0 = never) overrides WordPress's cleanup (filter `pre_delete_post`
during `wp_scheduled_delete`), and there is a daily task of its own (`pieb_can_limpiar_papelera`). When a song is deleted
for good, by any route, `before_delete_post` also deletes its scores, audio and editable files.

## Private files

`includes/archivos.php`. Everything the plugin uploads goes, through the `upload_dir` filter, to
`uploads/cancionero-privado/` (with `.htaccess` and `index.php`). It is served at
`/?pcan_archivo=ID[&t=thumbnail|medium|large][&descargar=1]` (`pieb_can_servir_archivo`, on `init`): it requires a
session and the `pieb_cancionero_acceso` capability, checks that the attachment belongs to the songbook
(`_pieb_partitura`, `_pieb_audio`, `_pieb_editable` or a child of a song), supports partial requests (`Range`) and
replies with `Cache-Control: private`. Editable files are always delivered as a download. The REST API is not used
because `<img>`, `<audio>` and `<iframe>` cannot send the nonce.

The addresses the interface sees (`url`, `miniatura`) are generated by `pieb_can_url_archivo()` /
`pieb_can_url_miniatura()`; **do not use `wp_get_attachment_url()`** for songbook files. Files from before 1.5.0 are moved
with `POST /archivos/proteger` (batches of 50; `GET /archivos/estado` reports what is pending and whether the server
hands out the folder without a session: `protegido`, `expuesto` or `desconocido`). Both routes require
`pieb_cancionero_gestionar`.

## Bulk upload

`#/subir`: the user drags files; the title, hymnal number and key are worked out from the name (`datosDesdeArchivo` in
`cancionero.js`). Some patterns: `051 - Cristo coronad.pdf` → 51 · Cristo coronad; `Todas las promesas 13 A.pdf` → 13 ·
Todas las promesas · La; `Cuán grande es Él - Sib.pdf` → key Sib. The key is accepted in American notation (`F#m`, `Bb`)
or Spanish and is stored in Spanish. Each file is uploaded in chunks and creates a song (`youtube` empty). A button
removes the ones that already exist from the list.

## Translations

Text domain `pieb-cancionero`, files in `pieb-cancionero/languages/` (the `Domain Path` header). The **base language is
Spanish**: the texts in the code are in Spanish, and without a translation file the interface shows Spanish whatever the
WordPress language is. Each language adds a `.po` (what the translator edits), its `.mo` (PHP) and one `.json` per
JavaScript file. How to translate: [translate.en.md](translate.en.md).

- **Each user's language** (`includes/ajustes.php`): the user meta `pieb_idioma` ('' = the site's) is chosen in the
  account menu and saved with `POST /preferencias` (`idioma`). The languages offered are Spanish plus every
  `pieb-cancionero-<locale>.mo` in `wp-content/languages/plugins/` or in the plugin's `languages/`
  (`pieb_can_idiomas_disponibles`). `pieb_can_idioma()` works out the effective
  locale with a fallback by language: if there is no file for `en_GB`, `en_US` is used; if there is none of that
  language, base Spanish. It only affects the `pieb-cancionero` domain, through the filters `plugin_locale` (for the
  `.mo`, also on REST requests, so API errors come out in the user's language) and `load_script_translation_file`
  (changes the locale in the name of the JSON that WordPress looks for). The emails (the sign-in link and the welcome) are sent in
  the site's language (`pieb_can_en_idioma_del_sitio`). Both folders are read (the system one, where Loco Translate "System" and
  translate.wordpress.org save, and the plugin's own) and the system one takes precedence, both for the `.mo`
  (`load_plugin_textdomain` already looks there first) and for the `.json` files (the filter looks there first).
- **JavaScript:** `wp-i18n` with `wp_set_script_translations()` for `cancionero`, `cultos` and `visor` (and `login`).
  Each JSON is named `pieb-cancionero-<locale>-<md5 of "assets/file.js">.json`, in Jed format. The `PIEB_CANCIONERO`
  configuration carries `idioma` (BCP 47, for `Intl`: dates and numbers), `idiomas`, `notacion` and
  `idiomaElegido`/`notacionElegida`.
- **Key notation:** what is stored never changes (`Sol`, `Mib`, `La m`). The user meta `pieb_notacion` ('' = automatic,
  `latina` or `americana`; `POST /preferencias`, `notacion`) decides how keys are shown: automatically, Do-Re-Mi for
  Spanish and C-D-E for every other language. In JavaScript, `tonoVer()` (exposed to the other files as `P.tono()`)
  converts when displaying and `tonoGuardar()` when saving; use them every time a key is shown or edited.
- **Conventions for developers:** every visible text goes in `__()`, `_n()`, `_x()`, `esc_html__()`… with the domain
  `'pieb-cancionero'`, written in Spanish. Never concatenate sentences: use placeholders (`sprintf(__('%1$s de %2$s',
  …), …)`, numbered when there is more than one) and `_n()` for plurals. A `/* translators: … */` comment right before the
  call explains each placeholder or the ambiguity (it goes into the `.pot`). In JS, `__`, `_n`, `_x` and `_nx` are
  shortcuts defined in `cancionero.js` (the other files use them as `P.__`…) that already carry the domain, so it is
  omitted. Only string literals are extracted. Afterwards: `python herramientas/i18n.py extraer` and `compilar`. Team data
  (titles, tags, service types already saved) is not translated; the predefined suggestions and role names are.

## Themes

CSS `--pc-*` variables per theme: `colores` (default, "Colors"), `pentagrama` ("Staff"), `sitio` ("Like the site",
follows the WordPress theme), `pulso` ("Pulse"), `claro` ("Studio"), `escenario` ("Stage"), `papel` ("Score"). The theme
is set in `data-pcan-theme` and the extra style in `data-pcan-estilo`. The test bench accepts `?tema=`, `?idioma=` and
`?notacion=`.
