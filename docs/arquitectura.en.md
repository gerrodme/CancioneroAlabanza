# Architecture

*Versión en español: [arquitectura.md](arquitectura.md)*

A technical summary of the **Cancionero** plugin for anyone new to the code.

## Pieces

| File | Responsibility |
|---|---|
| `pieb-cancionero.php` | Plugin header, constants, roles and capabilities, the `[cancionero]` shortcode, loading of scripts and of the `PIEB_CANCIONERO` object that the interface reads; on the songbook page, the shortcut icons and manifest (`wp_head`). |
| `includes/canciones.php` | The song content type, reading/writing metadata, file uploads, size limits. |
| `includes/etiquetas.php` | Per-church and universal tags (visibility, creation, assignment, `GET/POST /etiquetas/universales`). See the Churches section. |
| `includes/rest.php` | The `pieb/v1` REST API: list, view, create, update and delete songs; chunked file uploads. |
| `includes/archivos.php` | The songbook's private files: the `cancionero-privado` folder, delivery with a session (`?pcan_archivo=ID`), protection and unused files. |
| `includes/papelera.php` | The songbook trash: who deleted, retention period and automatic cleanup, restore and delete forever; also the per-church service trash (`/cultos/papelera...`). |
| `includes/iglesias.php` | Churches (`pieb_iglesia` type), each user's membership, active church, central administrator, migration and `GET /iglesias`, `POST /iglesias/activa`. See [Churches](#churches). |
| `includes/cultos.php` | Services and setlists (content type and API). |
| `includes/ajustes.php` | Themes, settings, the team list, per-user preferences (theme, language, notation), backups (export/import). |
| `includes/google.php` | Sign-in with Google (ID token) and with an email link. |
| `includes/correo.php` | Shared look of the emails (header with the logo, card, button) and sending them as HTML with plain text and the embedded header. |
| `includes/bienvenida.php` | Welcome email for the team: log of sent emails, composing the email (HTML and plain text) and `POST /bienvenida`. |
| `includes/avisos.php` | Email alert to the administrators when someone deletes a song: queue of deletions, batched sending through cron and composing the email. |
| `includes/accesos.php` | Access log: sign-ins (date, method and device type), days of use and `GET /accesos` with the raw data for the statistics in "Settings and team". |
| `includes/escaleta.php` | Order of service (the printed sheet with the order of the service): generic and saved template, sanitising of the template and of each service's copy, upload of the header images and `GET /escaleta`, `POST /escaleta/imagen`. |
| `includes/fondos.php` | Lyrics backgrounds: background images for the lyrics slides (normal media library) and `GET`/`POST /fondos`, `DELETE /fondos/{id}`. |
| `includes/migracion.php` | Converts the PDFs of the previous plugin (`adoracion_culto_*`) into songs. Idempotent. |
| `assets/cancionero.js` | The main interface (no dependencies or build step): list, song page, form, bulk upload, statistics, settings. It includes "About Cancionero" (route `#/acerca`, an entry in the account menu for every user): version, credits, license, source code and third-party components; if an external library is added, it must be listed there. |
| `assets/cultos.js` | Service screens and the setlist editor. |
| `assets/letras.js` | Exporting lyrics (sheet PDF, slides PDF, PowerPoint, OpenLyrics and text): dialog and generators. Loaded after `cultos.js`; uses `P.pdf`. |
| `assets/visor.js` | Viewer / play mode for tablets; includes the reader's metronome (Web Audio with look-ahead scheduling, song tempo, tap tempo and time signature; shortcut "M"). `abrirLector` shows the service's scores (route `#/culto/ID/tocar/N`); `abrirCantor` is the same reader showing each song's lyrics instead of the score (route `#/culto/ID/cantar/N`, `N` = position in the setlist): vertical scrolling by "pages" (Bluetooth pedal, keys, taps on the side thirds), horizontal swipe to change song, and a text size remembered in the browser. |
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
- Role `responsable_escaleta` ("Order-of-service manager": access + `pieb_can_escaleta`): like the team, and it also prepares
  the order of service of the services. Whoever lacks `pieb_can_escaleta` (the regular team) can **view and export** the order
  of service but not create or change it. Songbook administrators and WordPress administrators and editors also have
  `pieb_can_escaleta`. The `responsablesEscaleta` list in the settings is synchronised with that role just like
  `administradores` (the same function `pieb_can_sincronizar_administrador` grants or removes both roles) and its emails are
  also added to `emails`. The interface receives `escaleta` (boolean) in `PIEB_CANCIONERO`.
- **Internal prefix `pieb`:** the internal keys (types `pieb_cancion`, metadata `_pieb_*`, REST route `pieb/v1`,
  functions `pieb_can_*`) keep the historical prefix so as not to break the data of existing installations. It is only a
  technical identifier; the visible product name is "Cancionero".
- **Song** metadata (in `post_meta`):

  | Key | Content |
  |---|---|
  | `_pieb_numero` | Hymnal number (text). |
  | `_pieb_autor` | Author / composer. |
  | `_pieb_tonalidad` | The song's **original** key (shared by all churches) in Spanish (Latin) notation: `Do`, `Fa#`, `Sib`, `Mim`… Each church's usual key is another datum (`_pieb_ig_{id}`). |
  | `_pieb_tempo` | Integer, beats per minute. |
  | `_pieb_letra`, `_pieb_notas` | Plain text (lyrics, notes). `_pieb_letra` is always plain text (search, list, copy…); when `_pieb_letra_html` exists, it is derived from it. |
  | `_pieb_letra_html` | Optional. Formatted lyrics, sanitized HTML: top-level children `p`, `h4` (section title) or `blockquote` (chorus, containing only `p`); inside, only text, `br`, `strong`, `em`, `u`; no attributes. Each line is a `<p>` and `<p></p>` separates stanzas. |
  | `_pieb_partituras` | List of `{id (attachment), label, tonalidad}`; at least 1. PDF, JPG or PNG, max. 4 MB. Empty `tonalidad` = the song's **original** key (`_pieb_tonalidad`), never a church's usual key; old entries without the key count as `''` (`pieb_can_get_partituras()` always returns it). A score's effective key is its own or, if empty, the song's original; two keys are equal if they match after `trim` and lowercasing (`pieb_can_tono_clave()`, no enharmonics). On save, a key equal to the original key in that same request is stored as `''`. |
  | `_pieb_youtube` | List of `{url, label}`; only valid YouTube links are accepted. |
  | `_pieb_audios` | List of `{id, nombre, descripcion}` (plus `autor`, `iglesia` and, optionally, `universal: 1`). MP3/M4A/OGG/WAV/AAC, max. 10 MB. Each audio **belongs to the church that uploaded it**; with `universal` (only the central administrator sets it) every church sees it. See [Churches](#churches). |
  | `_pieb_ig_{churchId}` | The song's data that is specific to that church: `{ tonalidad, principal, notas }` (`tonalidad`: the raw usual key, `''` = the original; `principal`: ID of the main score, 0 = the stored order; `notas`). When everything is empty the meta is deleted. **The default church's notes are not here but in `_pieb_notas`** (no migration). See [Churches](#churches). |
  | `_pieb_editables` | List of `{id, descripcion}`: MuseScore, MusicXML… max. 10 MB. |
  | `_pieb_campos_autor` | `{ field: userId }`: who filled `titulo`, `numero`, `autor`, `tonalidad` and `tempo`. Only matters with several churches (see [Churches](#churches)); a missing field counts as filled by the song's creator. |
  | `autor`, `iglesia` (on each item of the four lists above) | `autor`: ID of the user who added it; `iglesia`: ID of the church it was added from. If missing, the getters (`pieb_can_get_partituras/audios/editables/youtube`) fill them in on read with the song's author and the default church, writing nothing. On save, new items carry the current user and their active church; kept items keep theirs (they are never accepted from the client; a YouTube link is "the same" if its URL matches). The API returns them on every score, audio, editable and link. |

- **Service** metadata: `_pieb_iglesia` (church ID; saved on creation and unchanged on edit; `pieb_can_culto_iglesia()` returns the default church if missing; the service summary carries it as `iglesia`), `_pieb_borrada_por` (ID of the user who trashed it, as with songs; see [Trash](#trash)), `_pieb_privado` (`'1'` = private service, visible only to its author; the summary carries `privado` and `mio`; **visibility is decided only by `pieb_can_culto_visible()`**, see [Churches](#churches)), `_pieb_fecha`, `_pieb_tipo`, `_pieb_notas`, `_pieb_items` (ordered list of
  `{cancion, tonalidad, nota, partitura}`; `partitura` is the ID of the attachment chosen for that service, 0 = the main
  one (the first of the song). When the service is served, `datos.partituras` holds only the scores whose effective key matches
  the item's (its own or, if empty, the song's), with the chosen one first; if none matches (old hand-typed key) or the chosen
  one is in another key, it holds all of them with the chosen one first. Play mode and the PDF use the first one.
  `datos.tonalidades` lists the song's available keys. The service does not validate `tonalidad` against them (free text in old services)), `_pieb_escaleta` (optional: that service's order of service, with its row of titles,
  its sections and its values; see [Order of service](#order-of-service)).
- WordPress options: `pieb_can_ajustes` (settings: `nombre`, `tema_defecto`, `google_client_id`, `emails`,
  `administradores`, `responsablesEscaleta`, `dominio`, `bienvenida_auto`, `bienvenida_texto`, `pagina`, `aviso_borrado`), `pieb_can_escaleta`
  (the installation's order-of-service identity: logo and header; not autoloaded; if missing, the generic one is used), `pieb_can_fondos` (list of attachment IDs of the lyrics backgrounds; not autoloaded), `pieb_can_bienvenidas`
  (log of the welcome emails sent: email → timestamp; not autoloaded), `pieb_can_avisos_borrado` (queue of deleted songs
  waiting to be reported; not autoloaded; see [Deleted-song alert](#deleted-song-alert)), `pieb_can_accesos_desde`
  (since when accesses are logged; not autoloaded), `pieb_can_version`, `pieb_can_migrado`.
- **User** metadata for the access log: `pieb_can_accesos` (sign-ins), `pieb_can_dias` (days of use) and
  `pieb_can_ultimo_acceso`. See [Access log](#access-log).

## REST API (`/wp-json/pieb/v1/`)

All routes require a signed-in session with the `pieb_cancionero_acceso` capability and the `X-WP-Nonce` header (the
interface receives it in `PIEB_CANCIONERO.nonce`; the API base is in `PIEB_CANCIONERO.api`).

| Route | Methods | Notes |
|---|---|---|
| `/canciones` | GET, POST | GET returns a **summary** of all songs (`id, titulo, numero, autor, tonalidad` (the active church's usual key), `tonalidadOriginal`, `tempo`, etiquetas, letra, creada, modificada` and the **counts** `partituras`, `youtube` and `audios` (only those the caller can see); when there is more than one score, `variantes` `[{id, label, tonalidad}]` with the raw key; and `tonalidades`: the distinct effective keys of its scores, no empties, the active church's usual one first if any score is in it). With the active church's main score, that score comes first in `variantes`. (Up to 1.41 it also carried `miniatura`, which the interface did not use.) The built list is cached per active church and invalidated on its own; the response carries an `ETag` and `Cache-Control: private, no-cache`, and returns 304 when nothing changed. POST creates. |
| `/canciones/{id}` | GET, POST, DELETE | GET returns the full record (scores with `archivo`/`url`, audio, `youtube` with `videoId`, notes…). POST **updates by replacing everything** (see below). DELETE sends it to the trash. |
| `/manifest?pagina=ID` | GET | **Public** (no session or nonce). Web manifest (`application/manifest+json`) for the shortcut to the songbook page: the installation's name, that page's `start_url`/`scope` (`pagina` must hold the shortcode; otherwise the home page), `display: standalone` and icons (192, 512 and maskable). Exposes nothing private. |
| `/subidas` | POST | **Chunked** file upload (a 10 MB audio fits even if PHP limits requests to 2 MB). |
| `/canciones/{id}/iglesia` | POST | JSON body `{ tonalidad?, principal? }` (only the keys that arrive): sets the active church's **usual key** (`''` = follow the original, or one of the available keys; 400 otherwise; if it equals the original, `''` is stored) and/or its **main score** (0 = the default order, or the ID of a score of the song; 400 otherwise). Only that church's administration or the central administrator (`pieb_can_es_admin_iglesia()`; 403 otherwise). Answers the record. |
| `/canciones/{id}/audios/{audio}/universal` | POST | Body `{ universal: bool }`: publishes an audio to every church or returns it to its own. Central administrator only and with several churches (403 otherwise); 404 if the song has no such audio. Answers the record. |
| `/cultos/{id}/privacidad` | POST | Body `{ privado: bool }`: makes a service private or returns it to the team. Author only (403 for others who can see it); answers the service summary. |
| `/cultos`, `/cultos/{id}` | GET, POST, DELETE | Services and setlists. **Only those of the active church and, if private, your own; anything else answers 404.** `POST` accepts `privado` (anyone when creating; only the author when editing). `GET /cultos/{id}` also returns `escaleta` (an object or `null`; it is not in the list) and `POST` accepts it only if present (`null` deletes it) **and only from someone with `pieb_can_escaleta`**: from anyone else it is ignored, without an error (the rest of the service is saved and any existing order of service is kept). See [Order of service](#order-of-service). |
| `/cultos/papelera` | GET | Deleted services the asker can see (from their active church; private ones only their author; the rest, whoever manages the church or its author): `{ cultos: [{id, titulo, fecha, tipo, canciones, privado, mio, borradoEl, borradoPor, caduca, diasRestantes}], dias }`, most recently deleted first (`dias` = `papelera_dias`; 0 = never expires). See [Trash](#trash). |
| `/cultos/papelera/{id}/restaurar` | POST | Restores a service from the trash (back to published) -> `{ restaurado: true, id }`. 404 if it is not in the trash or not visible to the asker. |
| `/cultos/papelera/{id}` | DELETE | Deletes a service from the trash for good -> `{ eliminado: true, id }` (same 404). |
| `/cultos/papelera/vaciar` | POST | Deletes for good the trashed services **visible to the asker** -> `{ eliminados: n }`. |
| `/copia` | GET | Backup data, format `version: 2` (central only). See [Backups](#backups). |
| `/copia/iglesias` | POST | Restores the churches of a `version 2` backup (central only): body `{ iglesias: [...], modo: 'saltar'\|'sobrescribir' }` -> `{ mapa: { backupUid: idOnThisSite }, creadas, emparejadas }`. |
| `/copia/estado`, `/copia/cancion`, `/copia/culto`, `/copia/ajustes` | POST | Restoring a backup (central only), one item at a time; the first three accept `mapa` (the one from `/copia/iglesias`). `/copia/estado` receives services with their `iglesia` and looks only inside it. See [Backups](#backups). |
| `/escaleta` | GET | The **base for a new service's order of service**: the structure (without values) and the row of titles of the last order of service saved in any service, with the installation's logo and header and `desde: {id, titulo}` (the source service; `null` if it comes from the generic template). The whole team reads it, because preparing a service's order of service needs it. |
| `/escaleta/imagen` | POST | Uploads the logo or header image of the order of service (JPG or PNG, max. 2 MB) to the normal media library; replies `{ id, url }` (requires `pieb_cancionero_gestionar`). |
| `/iglesias` | GET, POST | `GET`: the user's churches (all published ones for the central admin): `{ activa, central, iglesias: [{id, nombre, rol, ajena, defecto}], archivadas }`; `archivadas` (central only; `[]` for everyone else) = `[{id, nombre, cultos, etiquetas, audios, datos, vacia}]`. `POST` `{ nombre }`: creates a church (central only; 403 otherwise) and answers the same plus `creada: id`. See [Churches](#churches). |
| `/iglesias/{id}` | POST, DELETE | `POST` `{ nombre }`: renames the church (central only) and answers the state. `DELETE`: deletes it for good (central only), **only if it is archived and empty**; 403 if not central, 404 if it is not among the archived, 400 `pieb_defecto` for the default church, 409 `pieb_no_vacia` (with `data.contenido` = `{cultos, etiquetas, audios, datos}`) if not empty. Answers the full state. |
| `/iglesias/{id}/archivar` | POST | Archives the church (central only): it becomes `post_status = 'draft'` and disappears from the selector, membership and services. 403 if not central; 404 if missing or already archived; 400 `pieb_defecto` for the default church. Answers the full state (`activa`, `central`, `iglesias`, `archivadas`). |
| `/iglesias/{id}/recuperar` | POST | Publishes an archived church again (central only; 404 if it is not archived). Answers the full state. |
| `/iglesias/activa` | POST | Body `{ iglesia: id }`: sets the user's active church (saves `_pieb_iglesia_activa`) and answers like the `GET`; 403 if they do not belong to it (the central admin can pick any). |
| `/etiquetas`, `/preferencias`, `/huerfanos` | various | **Visible** tags (the active church's and universal ones) with color as `{ name: color }`, user preferences (`tema`, `idioma` and `notacion`, all optional; empty = automatic), unused files. |
| `/fondos` | GET, POST | `GET` (anyone on the team): `{ fondos: [{ id, url, miniatura }] }` (`url` full size, `miniatura` at the 'medium' size; skips attachments that no longer exist). `POST` (requires `pieb_cancionero_gestionar`): multipart `archivo`, JPG or PNG only, max. 5 MB and 40 backgrounds; uploads to the normal media library and replies `{ id, url, miniatura }`. See [Exporting lyrics](#exporting-lyrics). |
| `/fondos/{id}` | DELETE | Removes the background from the list and deletes its attachment (requires `pieb_cancionero_gestionar`); replies `{ fondos: [...] }`. |
| `/ajustes` | GET, POST | Songbook settings and the team of the **active church** (requires `pieb_can_puede_gestionar()`; everything that is not the team is changed only by the central admin; see [Churches](#churches), phase 5a). The welcome fields are in [Welcome to the team](#welcome-to-the-team). Since phase 5b, `bienvenidaAuto`, `bienvenidaTexto` and `escaleta` belong to the **active church** and are saved by whoever manages it. The church's order of service is just its images: `GET` returns `escaleta: { logo, cabecera }` and `POST` accepts `escaleta: { logo: {id}|null, cabecera: {id}|null }` only if present (the rest of the order of service is not touched); see [Order of service](#order-of-service). |
| `/bienvenida` | POST | Sends the welcome email to a batch of addresses (requires `pieb_cancionero_gestionar`). See [Welcome to the team](#welcome-to-the-team). |
| `/accesos` | GET | Raw access log of every team member, for the statistics (requires `pieb_cancionero_gestionar`). See [Access log](#access-log). |
| `/google`, `/enlace`, `/correo-prueba` | POST | Google sign-in, email link and a test email. |

### Updating a song (`POST /canciones/{id}`)

A `multipart/form-data` body with all of these fields (missing ones are **emptied**; with several churches the server also keeps what someone else added and you cannot change, see [Churches](#churches)):

`titulo, numero, autor, tonalidad, tempo, etiquetas` (comma-separated), `letra, letraHtml, notas`,
`youtube` (JSON `[{url,label}]`), `partituras` (JSON `[{id,label,tonalidad}]` of the ones that are kept; resend each one's `tonalidad` or it is lost),
`nuevasSubidas` (JSON `[{id,nombre,label,tonalidad}]`, files already uploaded in chunks; the old `nuevas[]` route has parallel JSON `nuevasLabels` and `nuevasTonalidades`), `audios`, `audiosSubidos`, `editables`,
`editablesSubidos`. A song needs **at least one score or some lyrics** (since 1.39; before, always a score).

`letraHtml` (formatted lyrics, see `_pieb_letra_html`): when it arrives non-empty it is sanitized and wins: `letra` is derived from it (each `p`/`h4` is a line, `br` a line break, `<p></p>` an empty line). When it arrives empty, the formatting is deleted and `letra` is stored as plain text. When it is **not sent** (scripts that only send `letra`), the formatting is kept only if its text still matches `letra`; otherwise it is deleted. `GET /canciones/{id}` returns `letraHtml` (`''` if none); the list does not. The `datos` of each song in a service also carry `autor` and `letraHtml`, and the backup exports `letraHtml` and each score's `tonalidad` (an old backup without it imports with `''`). `GET /canciones/{id}` returns the raw `tonalidad` on each score.

To change a single value: `GET` the record, rebuild all the fields from it and modify only the one you want. Recipe in
[carga-masiva.en.md](carga-masiva.en.md).

## Churches

`includes/iglesias.php`. One installation can serve several churches with a shared song repository (plan in
[plan-multi-iglesia.md](plan-multi-iglesia.md), in Spanish). Phase 1 lays the foundations with **no visible change**: a
single-church installation behaves exactly as before.

- **Entity.** Content type `pieb_iglesia` (not public, no UI, no native REST; `post_status = 'draft'` = archived, see below); the name is the title. There is always one,
  the **default** (option `pieb_can_iglesia_defecto`), which `pieb_can_iglesia_defecto()` creates by itself the first time
  with the name the songbook had (the line under the name or, if empty, the site name). `pieb_can_iglesias()` lists the
  published ones ordered by title.
- **Membership.** User meta `_pieb_iglesias` = `{ churchId: role }` with role `equipo`, `escaleta` or `admin`
  (`pieb_can_iglesias_de()`, `pieb_can_rol_en()`). While the meta does not exist, anyone with `pieb_cancionero_acceso`
  belongs to the default church with the role their WordPress capabilities imply (`admin` with
  `pieb_cancionero_gestionar`, `escaleta` with `pieb_can_escaleta`, otherwise `equipo`). In this phase the meta is written
  for nobody: WordPress roles remain the source of truth.
- **Active church.** `pieb_can_iglesia_activa()`: the one in the `X-PCAN-Iglesia` header if the user belongs to it;
  otherwise the user meta `_pieb_iglesia_activa`; otherwise their first church; otherwise the default. The UI sends the
  header only when the user has more than one church. `window.PIEB_CANCIONERO` carries `iglesia` (`{id, nombre}`),
  `iglesias` (`[{id, nombre, rol, ajena}]`) and `central`.
- **Central administrator.** Capability `pieb_cancionero_central`, granted to WordPress administrators.
  `pieb_can_es_central()` is true with that capability **or**, while only one church exists, with
  `pieb_cancionero_gestionar` (so a single church's administration acts as central and nothing changes).
- **Migration.** `pieb_can_migrar_iglesias()` (on `init`, priority 20; idempotent; only works if the option `pieb_can_multi`
  is below 1) ensures the default church, stamps every service lacking `_pieb_iglesia` with it (trash included) and saves
  `pieb_can_multi = 1`. It does not rewrite songs.
- **What this phase does (2).** Filters **services** by church and adds **private services** (see below). With one church
  and no private services everything behaves as before. Role-based edit permissions on songs and services do not change.
  Songs are still shared by all churches.
- **The central administrator enters any church.** Whoever has the real `pieb_cancionero_central` capability can use any
  existing church as active (header `X-PCAN-Iglesia`, meta `_pieb_iglesia_activa`, `POST /iglesias/activa`), even without
  being a member. `pieb_can_iglesias_lista_usuario()` returns all of them: for their own, their role and `ajena: false`; for
  the rest `rol: 'admin'` and `ajena: true`. For everyone else, only their own (`ajena: false`).
- **Creating and renaming churches** (minimal version; only with `pieb_cancionero_central`, 403 otherwise). `POST /iglesias`
  with `{ nombre }` (required, max 80 characters) creates the church and adds its creator as `admin` in their
  `_pieb_iglesias` meta (starting from the membership already deduced, so it is not lost). It answers like `GET /iglesias`
  plus `creada: id`. `POST /iglesias/{id}` with `{ nombre }` renames it and answers the state. Once a second church exists,
  someone who only had `pieb_cancionero_gestionar` stops being central (`pieb_can_es_central()`).
- **Services per church, and private ones.** Meta `_pieb_privado` (`'1'` = private; otherwise absent). **The filter lives in
  a single function, `pieb_can_culto_visible($post, $user_id = 0)`** (`includes/cultos.php`): a service is visible if its
  church (`pieb_can_culto_iglesia()`) is the user's active one **and** (it is not private **or** its `post_author` is the
  user). Everything that reads or changes services goes through it: `GET /cultos` (query by `_pieb_iglesia` with
  `pieb_can_cultos_meta_iglesia()`, then the function), `GET/POST/DELETE /cultos/{id}` and `POST /cultos/{id}/privacidad`
  (via `pieb_can_rest_culto_get()`, which answers **404** "The service does not exist" and never 403, so as not to reveal
  it exists) and the base of `GET /escaleta` (`pieb_can_escaleta_ultima()` only looks at visible services). Anyone adding a
  new route that reads services must use it. When creating, anyone can set `privado`; when editing, only the author changes
  it (ignored from anyone else). Deleting a service never sends a notice (notices are for songs). `pieb_can_culto_resumen()`
  adds `privado` and `mio` (the author is the user).
- **In a song you add, you do not destroy (phase 3).** Songs are still shared, but **only with more than one church**
  (`pieb_can_proteccion_activa()`, in `includes/iglesias.php`): anyone can **add** to a song, and nobody changes or removes
  what someone else added. **With a single church the protection is not applied and everything works as always** (anyone on
  the team edits anything; whoever uploaded the song or manages the songbook deletes it). "Central" = `pieb_can_es_central()`;
  "creator" = the song's `post_author`. Each permission is decided in **one single function** (`includes/canciones.php`),
  used by both saving and the API:
  - `pieb_can_puede_elemento($elemento, $post)`: scores, audio, editable files and YouTube links. Anyone adds; changing their
    data or removing them is for their `autor` (the song's if missing) or the central administrator.
  - `pieb_can_puede_ordenar($post)`: the order of the scores (the first is the main one), only the creator or the central
    administrator. For everyone else the current order is kept and their new scores go last.
  - `pieb_can_puede_campo($campo, $post)`: `titulo`, `numero`, `autor`, `tonalidad`, `tempo`. Anyone fills an **empty** field;
    one with a value is changed by whoever filled it, the creator or the central administrator. Who filled each field is stored
    in the meta `_pieb_campos_autor` = `{ field: userId }` (updated whenever a field changes value, also with one church; a
    field not listed counts as filled by the creator).
  - `pieb_can_puede_letra($post)`: with no lyrics (neither `_pieb_letra` nor `_pieb_letra_html`) anyone adds them; with lyrics,
    only the creator or the central administrator.
  - `pieb_can_puede_borrar_cancion($post)`: with the protection active, the creator or the central administrator; otherwise
    `pieb_can_usuario_puede_borrar()` (author or `pieb_cancionero_gestionar`), which is also the **service** rule and does not change.
  - Tags are per church (phase 4b, see "Per-church and universal tags"). Notes, usual key, main score and audio: see "Per-church data (phase 4a)".

  **The server merges, it does not reject.** `POST /canciones/{id}` is still a multipart that "replaces everything", but with
  the protection active it keeps whatever the saver cannot change, whatever the request says (an old client or a bulk load that
  omits data no longer destroys it): someone else's element is kept as stored (`pieb_can_fusionar_elementos()`), someone else's
  field or lyrics keep their value and someone else's title is not changed. None of this is an error. "The title is required"
  and "at least one score" (which also counts the kept scores of others) are unchanged. Backup import and Bulk upload keep
  their format.

  **API.** `GET /canciones/{id}` always returns (with or without protection): `protegida` (bool); on each item of `partituras`,
  `audios`, `editables` and `youtube`, `mio` (the asker can change or remove it; always `true` without protection) and
  `autorNombre` (author's display name, `''` if the user no longer exists); and `permisos`:
  `{ campos: { titulo, numero, autor, tonalidad, tempo, letra }, ordenar, borrar }` (booleans; an empty field is always `true`).
  `puedeBorrar` is `permisos.borrar`. `DELETE /canciones/{id}` applies the new rule (403 otherwise).
- **Per-church data (phase 4a).** Songs are shared, but four data are each church's own. **With a single church everything is
  stored and behaves as always** (no `_pieb_ig_*`, the usual key is the original, notes stay in `_pieb_notas`, and every audio
  is visible).
  - **Key.** `_pieb_tonalidad` is the **original** key (shared; it is what the `tonalidad` field of `POST /canciones/{id}`
    edits). A church's **usual** key (`pieb_can_tono_habitual($post_id, $iglesia_id = 0)`) is the `tonalidad` of its
    `_pieb_ig_{id}` if it is not empty and matches (`pieb_can_tono_clave`) one of the keys in which a score exists; otherwise
    the original. **A score's empty key still means "the original"** (`pieb_can_tono_efectivo($partitura, $original)` and the
    normalisation on save do not change; no migration). `pieb_can_tonalidades()` puts the active church's usual key first. In
    the API: `tonalidad` = the active church's usual key and `tonalidadOriginal` = `_pieb_tonalidad` (summary and record). In
    services, an item's effective key is its own or, if empty, the usual key of the service's church (`datos.tonalidad`, and
    `datos.tonalidadOriginal`); the item's scores are filtered by comparing each score's effective key (computed with the
    original) with the item's.
  - **Main score.** If the active church's `principal` is a score the song still has, `pieb_can_partituras_iglesia()` puts it
    first (record, and the summary's `variantes`); saving the song does not use this function, so it does not
    alter the order set by whoever created it. In a service, the score chosen for it wins.
  - **Notes.** The API's `notas` are the active church's (`pieb_can_notas()`/`pieb_can_notas_guardar()`); any member edits them
    with the `notas` of `POST /canciones/{id}`. The default church uses `_pieb_notas`; the others use `notas` of `_pieb_ig_{id}`.
    The backup exports `_pieb_notas` as `notas` (the default church's) and, besides, `iglesias` with each church's
    `_pieb_ig_{id}` (see [Backups](#backups)).
  - **Record.** `iglesiaDatos` = `{ tonalidad (raw, '' = the original), principal, puedeEditar }` (`puedeEditar` =
    `pieb_can_es_admin_iglesia()`: central or `admin` role in the active church) and, at the root, `puedeUniversal`.
  - **Per-church and universal audio.** Each audio carries `iglesia`; with `universal: 1` every church sees it. **One function
    decides who sees it: `pieb_can_audio_visible($audio)`** (without protection, always; with it, universal or belonging to the
    user's active church). The record only returns the visible ones, each with `universal`, `iglesiaNombre` and `mio` according
    to `pieb_can_puede_audio()` (universal: only the central administrator; otherwise its author, the administration of the
    audio's church or the central administrator); the summary's `audios` counter counts only visible ones. When saving the
    song, other churches' audio and audio the user cannot change are kept as they are (`pieb_can_fusionar_elementos()` with
    `pieb_can_puede_cambiar_audio()`); `universal` is never accepted from the client (the existing value is kept) and new
    audio carries the active church.
  - **File delivery** (`?pcan_archivo=ID`): with several churches an audio is delivered only if it is universal, the requester is
    central, or **belongs** to the audio's church (`pieb_can_rol_en`; it is a direct URL, with no active-church header);
    otherwise it answers 404 "File not found". An audio that no song lists (orphan) is delivered only to the central
    administrator. Scores and editable files do not change.
  - **Other places that read audio.** The backup (central only) exports every audio, each with its `iglesia` and `universal` (formerly: others got the visible
    ones); "unused files" and the permanent deletion of a song count every audio (no other church's audio is considered an
    orphan); the deletion alert and the trash (for the central administrator) do not change.
- **Per-church and universal tags (phase 4b).** `includes/etiquetas.php`. **With a single church nothing changes and nothing is
  stored differently** (`pieb_can_proteccion_activa()` false: everything is visible, no meta is written and tags are assigned with
  `wp_set_object_terms` by name, as always). With several churches each tag (a `pieb_etiqueta` term) belongs to one church or is
  universal:
  - **Term meta.** `_pieb_iglesia` (ID of the owning church; if missing, the default church, so existing tags need no migration;
    it is not written for the default church) and `_pieb_universal` (`'1'`). The color stays in `pieb_color`.
  - **Visibility.** One single function, `pieb_can_etiqueta_visible($term, $activa = 0)`: universal, or of the active church.
  - **Repeated names.** Two churches may have a tag with the same name (distinct terms; a non-default church's term gets the
    slug `name-ig{id}`). So with protection on everything is resolved by term ID within a scope
    (`pieb_can_etiqueta_buscar()`, `pieb_can_etiqueta_universal_buscar()`, `pieb_can_etiqueta_obtener()`), never by name blindly.
  - **Assigning** (`pieb_can_etiquetas_fijar($post_id, $nombres)`; used by saving a song, `POST /canciones/etiquetar` and
    backup import). Result = the terms the song has that the saver cannot see (always kept) + universal ones (the central admin
    sets those in the list; anyone else keeps the ones the song already had and can neither add nor remove them) + one term of
    the active church per remaining name (created if missing; the central admin, for a name matching a universal tag, uses that).
  - **API.** Summary and detail: `etiquetas` = visible names and `etiquetasUniversales` = those among them that are universal
    (`[]` with none). `GET /etiquetas`: `{ name: color }` of the visible ones (on a clash the universal wins).
    `GET /etiquetas/universales`: `{ etiquetas: [{ nombre, color }] }` by name. `POST /etiquetas/universales` with
    `{ nombre, universal: bool }` (central admin only and with several churches; 403 otherwise; responds like the `GET`): `true`
    makes the active church's tag of that name universal (or creates one) and **merges** into it the same-named tags of the other
    churches (their songs are reassigned and those terms deleted); `false` hands the universal tag back to the active church
    (404 if it does not exist; if that church already had one, they are merged). `POST /canciones/etiquetar` keeps its format
    (each song in the result adds `etiquetasUniversales`); for non-central users adding or removing a universal tag is ignored.
  - **Backups.** Export gives ALL of each song's tags as `{ nombre, iglesia: uid|null }` (`null` = universal); import creates them
    in the church the map says (`pieb_can_etiqueta_obtener()`) or as universal (`pieb_can_etiqueta_universal_obtener()`), never in the
    active church. Plain strings from old backups go to the default church.
- **Per-church team and permissions by active church (phase 5a).** **With a single church everything behaves and is stored as
  before.**
  - **Team.** `pieb_can_equipo($iglesia_id)` returns `{ emails, administradores, responsablesEscaleta, dominio }`. The **default**
    church keeps using those keys of the `pieb_can_ajustes` option (no migration); the others use the `_pieb_equipo` meta of their
    post. `pieb_can_equipo_guardar($iglesia_id, $equipo)` normalizes the emails and also puts administrators and service-order
    managers in `emails`. `pieb_can_equipo()` only reads options and metas (it does not depend on membership: avoids recursion).
  - **Membership by email.** `pieb_can_iglesias_de($user_id)` (remembered per request; cleared with `pieb_can_iglesias_de(0, true)`)
    adds up: the user's email in each team (`admin` in `administradores`, `escaleta` in `responsablesEscaleta`, `equipo` in `emails`
    or with that church's domain); the user meta `_pieb_iglesias` (churches created in 1.28; its entry for a church is deleted when
    that person's role in it changes); and, only in the default church, compatibility with WordPress roles
    (`pieb_can_rol_por_capacidades()`): if the person is not in another church all their capabilities count; if they are, only roles
    that do not belong to the plugin (administrator, editor...), so the WordPress role of someone who administers another church is not
    inherited here. The higher role wins (`admin` > `escaleta` > `equipo`).
  - **Access.** An email gets in if it is allowed in **any** church (`pieb_can_email_permitido($email)`, which no longer takes the
    settings; used by Google, the email link and account creation). `pieb_can_sincronizar_administrador($user)` gives the WordPress
    administrator role if they administer some church and the service-order manager role if they are one in some church; those roles
    serve WordPress, the plugin no longer decides permissions with them. Someone removed from a list only loses the access role if
    they are in no other church.
  - **Permissions.** `pieb_can_puede_gestionar($user_id = 0)` = central or `admin` role in the **active** church
    (`pieb_can_es_admin_iglesia()`); `pieb_can_puede_escaleta()` = central or `admin`/`escaleta` role in it. With a single church they
    equal the usual `pieb_cancionero_gestionar` / `pieb_can_escaleta` capabilities. `window.PIEB_CANCIONERO.gestionar` and `.escaleta`
    come from them.
  - **What belongs to the church and what to the central admin.**
    | Church (`pieb_can_puede_gestionar`; service order: `_escaleta`) | Central (`pieb_can_es_central`) |
    |---|---|
    | Team and domain (`/ajustes`), `/accesos` (only people of the active church), `/bienvenida` (only to emails of its team), `/fondos` (upload and delete), `/escaleta/imagen`, deleting a service (author or admin), saving a service's order sheet; in `/ajustes` also the welcome (`bienvenidaAuto`, `bienvenidaTexto`) and the order-sheet template (`escaleta`) | The rest of `/ajustes` (name, subtitle, trash days, theme, Google, deletion alert, page), `/huerfanos`, backups (`/copia...`), song trash and its files, `/archivos/...`, viewing a deleted song, mail test, migration |
  - **`/ajustes`.** `GET` (whoever manages the active church): same format, but `emails`, `administradores`,
    `responsablesEscaleta`, `dominio` and `miembros` are those of the **active church**; adds `central` (bool) and
    `iglesia: { id, nombre }`. `miembros` (`pieb_can_miembros($iglesia_id)`): the people on its lists and, only in the default church,
    accounts with a songbook role that are on no list. `POST`: the four team fields are saved in the active church; everything else is
    changed only by the central admin (anyone else's is silently ignored). Role sync and `bienvenidaPendiente` stay, now over the
    active church's list. A church admin may add someone already in another church. When a church is created, its creator goes into the
    new church's `administradores` (besides the meta).
- **Per-church settings and names (phase 5b).** **With a single church everything behaves and is stored as always.**
  - **Per-church store.** `pieb_can_dato_iglesia($clave, $iglesia_id = 0, $defecto = null)` and
    `pieb_can_dato_iglesia_guardar($clave, $iglesia_id, $valor)` (0 = active church). The **default** church reads and writes its
    usual place (no migration); the others use the `_pieb_dato_{clave}` meta of their `pieb_iglesia` post:
    | Data | Default church | Other churches |
    |---|---|---|
    | Order-sheet template (with logo and header) | option `pieb_can_escaleta` | meta `_pieb_dato_escaleta` (without it, the plugin's generic one, never another church's) |
    | Lyrics backgrounds (list of ids) | option `pieb_can_fondos` | meta `_pieb_dato_fondos` |
    | Welcome: `bienvenida_auto`, `bienvenida_texto` | keys of the `pieb_can_ajustes` option | meta `_pieb_dato_bienvenida` = `{ auto, texto }` (default `auto = true`, `texto = ''`) |
  - **What belongs to each church and what is global.** Per church (the active one): team, order-sheet template, backgrounds and
    welcome email (automatic/text settings). Global (central admin): service name and subtitle, trash days, default theme, Google
    Client ID, deletion alert (`aviso_borrado`), page used in emails, backups.
  - **`/ajustes`.** `GET`: `bienvenidaAuto`, `bienvenidaTexto` and `escaleta` are the active church's. `POST`: whoever manages the
    active church (without being central) now also saves, besides the four team fields, `bienvenidaAuto`, `bienvenidaTexto` and
    `escaleta` (the template is validated before anything is saved); the rest stays central-only and is silently ignored.
    `bienvenidaPendiente` uses the active church's `auto`.
  - **`/escaleta`, `/escaleta/imagen`.** The template and its images (logo and header) are the active church's
    (`pieb_can_escaleta_guardada()` / `_guardar()` / `_plantilla()` work with it); `POST /escaleta/imagen` requires managing the
    active church. A service's printed sheet uses the images that come from `GET /escaleta`, always the active church's (the
    services you see are the active church's).
  - **`/fondos`.** `GET`, upload and delete work with the active church's list; the limit of 40 is per church; a background is
    deleted only by whoever manages the church that has it (404 if its id is not in the active church's list).
  - **Welcome email.** Uses the `auto` and `texto` of the church it is sent for. With protection on (several churches) it adds
    the sentence "You have been added to the team of {church} in {service}."; with a single church, the usual text.
  - **Names.** Sign-in screen, sign-in link email, phone manifest/install, PowerPoint/OpenLyrics and the WordPress menu use the
    **service** name (`pieb_can_nombre()`); the interface shows the church name (`PIEB_CANCIONERO.iglesia.nombre`) where it applies.
  - **Deletion alert.** With protection on, recipients are the **central** administrators (accounts with `pieb_cancionero_central`
    and the site admin email), not the default church's list; with a single church, the usual ones. The `aviso_borrado` switch is global.
- **Archiving churches (phase 5c).** An archived church becomes `post_status = 'draft'`: since `pieb_can_iglesias()`, membership
  (`pieb_can_iglesias_de()`), the selector, `pieb_can_puede_entrar_en()`, `pieb_can_equipos_todos()` and the visibility of its
  services only count **published** churches, it vanishes everywhere with no further changes; recovering it means going back to
  `publish`. Central only (`POST /iglesias/{id}/archivar` and `/recuperar`). **The default church can be neither archived nor
  deleted** (400 `pieb_defecto`). Whoever had it as active falls back to another by themselves (`pieb_can_iglesia_activa()`).
  Deleting it for good (`DELETE /iglesias/{id}`) requires it to be archived **and empty**: no service in any state (trash
  included), no own tag (term with meta `_pieb_iglesia` = id), no audio with its `iglesia` and no `_pieb_ig_{id}` with data
  (key, notes or main score) in any song (`pieb_can_iglesias_contenido()`); its team, order-sheet template, backgrounds and welcome
  go with it. `GET /iglesias` and the other state responses (`pieb_can_iglesias_estado()`) add `defecto` to each church and,
  for the central admin only, `archivadas` with the counts of what each one holds (`vacia` = all zero).
- **Backups.** Since phase 5c they carry the churches and what is specific to each; see [Backups](#backups).

## Welcome to the team

`includes/bienvenida.php`. Someone added to the team's email list can be sent an email that explains how to get in. Its
**"Enter the songbook"** button carries a personal sign-in link (`pieb_can_bienvenida_enlace`): the same magic link as in
`google.php` (`pieb_can_enlace_*` transient, single use, a screen with "Enter" so spam filters do not use it up), but it
lasts `PIEB_CAN_BIENVENIDA_DIAS` (7) days instead of 15 minutes, and every welcome email cancels the button of the previous
one to the same address. The email also explains how to get in later (open the page, type the email and press the link
that arrives) and, if Google sign-in is set up, that they can use its button. For administrator accounts (which only get
the test email) the button opens the page without a sign-in link.

**Look of the emails** (`includes/correo.php`). The welcome email and the sign-in link share their look: a header with
the logo and a white card with a title, text, button and notes (`pieb_can_correo_*`). It is HTML for email clients
(tables, inline styles, 600 px at most, no `<style>`; the header
image `assets/correo-cabecera.jpg` is embedded in the email, `cid:pcan-cabecera`, because Gmail does not show it if it
cannot download it from the site) plus a plain-text version set as `AltBody`. Both are done in `phpmailer_init`, only
while sending; if the mail service skips that hook, the image stays linked by its absolute URL (`pieb_can_correo_enviar`). Both are composed
inside `pieb_can_en_idioma_del_sitio()`: they go out in the site's language. WordPress administrator accounts do not get a welcome email (they sign
in with a password).

**New settings** (in `pieb_can_ajustes`): `bienvenida_auto` (bool, `true` by default: send it automatically to whoever
enters the list), `bienvenida_texto` (optional text from the administrator added to the email, max. 1000 characters) and
`pagina` (address of the songbook page; the interface sends it as `pagina` = `location.origin + location.pathname +
location.search` with every save and every send, and it is only stored if it is a valid address of this site; the
fragment and the query are removed, except `page_id` or `p`, which with plain permalinks are the page itself). The
emails use the request's `pagina` if valid, otherwise the stored one and, failing that, the home page (`home_url('/')`).
Restoring a backup includes each church's welcome (`iglesias[].bienvenida`; in old backups, `bienvenidaAuto` and `bienvenidaTexto`,
which go to the default church; only if the backup carries them) and **never sends
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

## Access log

`includes/accesos.php`. So that whoever administers can see in "Settings and team" when each person signs in and how the
songbook is used, the plugin keeps a minimal history. The server only **records and returns the raw data**; the statistics
(sign-ins per week, active people, most used methods and devices…) are calculated by the interface.

**What is stored**, only for people with the `pieb_cancionero_acceso` capability (including WordPress administrators and
editors): date, sign-in method and device type. The IP address and the user agent are **not** stored.

| Data | Where | Content |
|---|---|---|
| Sign-ins | user meta `pieb_can_accesos` | List, newest first, of `{t, m, d}`: `t` Unix time; `m` method (`enlace` = email link, `google` or `contrasena` = password); `d` device (`movil` = phone, `tableta` = tablet or `ordenador` = computer). |
| Days of use | user meta `pieb_can_dias` | List of `Y-m-d` days (site time zone), newest first, on which the person opened the songbook. |
| Last access | user meta `pieb_can_ultimo_acceso` | Unix time of the last sign-in, whatever the method. |
| Start of the log | option `pieb_can_accesos_desde` (not autoloaded) | Unix time of the first entry. The interface uses it so as not to show as "no use" what simply predates the log. |

**Sign-ins.** `pieb_can_registrar_acceso` hooks into `wp_login`. The method is set by the handlers in `google.php` that
start the session on their own (the email link and Google call `pieb_can_metodo_acceso('enlace'|'google')` right before
firing `wp_login`); if nobody sets it, it is the WordPress form (`contrasena`). The device is inferred from the user agent
(`pieb_can_dispositivo_acceso`): tablet (iPad, "Tablet", Android without "Mobile"), phone or computer. Modern iPads
present themselves as a Mac and count as a computer. Every sign-in also updates `pieb_can_ultimo_acceso`, so "Has signed
in" in the team list works with any method.

**Days of use.** Signing in is not using the songbook: with "remember me" the session lasts 14 days. That is why
`pieb_can_registrar_dia` records today's date every time someone with a session and access opens the songbook (it is
called from the shortcode); it only looks at the first stored day, so it writes at most once a day. It does not count when
the shortcode is processed in the dashboard or in the REST API (e.g. when editing the page).

**How long it is kept.** 12 months (365 days); sign-ins are also capped at 400 per person. Older entries are dropped when
a new one is recorded. Backups do **not** include this log.

**`GET /accesos`** (requires `pieb_cancionero_gestionar`). Response:

```
{
  desde: int,       // pieb_can_accesos_desde (0 if there is nothing yet)
  ahora: int,       // server time (Unix)
  hoy: 'Y-m-d',     // today in the site time zone
  personas: [{
    email, nombre,  // nombre = display_name or ''
    enLista: bool,  // is in the team email list
    esAdmin: bool,  // manage_options
    esGestor: bool, // as in `miembros` of GET /ajustes
    cuenta: bool,   // has a WordPress account
    haEntrado: bool,  // has ever signed in, also before the log existed (Google or link)
    ultimoAcceso: int,  // the greater of the last sign-in and pieb_can_ultimo_acceso; 0 if never
    accesos: [{ t: int, metodo: 'enlace'|'google'|'contrasena', dispositivo: 'movil'|'tableta'|'ordenador' }],
    dias: ['Y-m-d', …]  // newest first
  }]
}
```

`personas` are the same as `miembros` in `GET /ajustes` (`pieb_can_miembros`: the list's emails, with or without an
account, and accounts with the songbook roles) plus any other account with access that has something recorded (e.g. a
WordPress administrator who enters the songbook), ordered by email.

## Order of service

`includes/escaleta.php`. The order of service (`escaleta`) is the printed sheet with the order of the service: a header with
two images (logo and header), a row of titles ("ORDER OF SERVICE · centre text · date") and a two-column table with the name
of each section in capitals (and an optional note under it, in red) and its content. The server only stores, sanitises and
serves the data; the PDF (`escaleta-YYYY-MM-DD.pdf`) is generated by the browser (`P.escaletaPdf` in `cultos.js`), with no
dependencies.

**Each service has its own order of service, and it is prepared in the service itself.** Setting up the order of service is
not an administration task: the team prepares it in the Order of service tab of the service editor and it only affects that
service. There they edit the row of titles (`titulo`, `central`) and, with the "Edit sections" button, the whole structure
(sections with their titles and notes, fields, types, labels, small type, default texts or values, order, add and remove; the
editor is `P.crearEditorEscaleta` in `cancionero.js`, reused in `cultos.js`). "Fill in" is for writing each field's value. When
going back from "Edit sections" to "Fill in", the values of fields that still exist (same section and same field `id`) with the
same type are kept; new ones start "untouched".

**Songs follow the setlist while nobody touches them.** On saving, default texts become explicit values, but untouched song
fields are saved with `valor: null`: so the order of service can be prepared before choosing the songs and fills itself in
(according to each field's default) when they are added to the setlist. Choosing or typing a song, adding a note or ticking
"Instrumental" fixes the field's value. The "Fill from the setlist" button sets every song field back to `null` (useful for
services saved before 1.22.0, whose fields were fixed).

**Base for a new service** (`GET /escaleta`). A service without its own order of service starts from the **last order of
service saved in any service** (`pieb_can_escaleta_ultima`: the service whose `_pieb_escaleta` was modified most recently):
its structure without values and without `oculta`, with its `titulo` and `central`, plus the installation's `logo` and
`cabecera` and `desde: { id, titulo }` (the source service, which the interface names in a note; `null` if there is none and it
comes from the template). If no order of service has been saved yet, the plugin's **generic** one is used
(`pieb_can_escaleta_generica`: prelude, reading and prayer, welcome, community life, songs of praise, offering, children,
preaching, the optional post-sermon (id `respuesta`) and Lord's Supper sections, farewell, doxology and postlude; texts with `__()`, built when the
function is called). The base is copied into the service when its Order of service tab is opened and it is saved with the
service; there, sections with `opcional` start with `oculta: true` ("Do not include in this service"). `GET /escaleta` copies
each section's `opcional` and each field's `modo`, and returns `version` (that of the order of service it comes from).

```
escaleta (of a service): {
  titulo, central,                 // left cell and centre cell of the row of titles (empty = "ORDER OF SERVICE" and an empty cell)
  version,                         // integer: 2 since the optional sections and per-song notes (the generic one is 2; missing = 0)
  secciones: [ {
    id, titulo, nota,
    opcional,                      // in the structure: starts hidden (oculta: true) in every new service
    oculta,                        // not printed in this service
    extra,                         // unused: every section can be edited; the interface leaves it false
    campos: [ { id, tipo, etiqueta, pequeno, modo, defecto, valor } ]   // modo: only in cancion/canciones
  } ]
}
```

**Version of the order of service.** `version` is an integer stored with a service's order of service, with the template and in
the base returned by `GET /escaleta` (copied from the last order of service; older ones do not carry it and count as 0). The
interface (`cultos.js`, `actualizarEscaleta`, applied when sanitising both a service's order of service and the base) brings
those with a version below 2 up to date: it sets `modo: true` on the first `cancion` field of the `preludio` section, inserts
the `respuesta` and `santa-cena` sections (if no sections with those ids exist) right after `predicacion` (if missing, before
`despedida`; if that is missing too, at the end) with `opcional: true` and, in a service's order of service, `oculta: true` and
`null` values, and sets `version = 2`. Because the version is saved, anything someone deletes later does not come back.

`GET /cultos/{id}` returns it in `escaleta` (an object or `null`; it is not in the list of services, to keep it light) and
`POST /cultos/{id}` accepts it only if present (`null` deletes it) and only from someone with the `pieb_can_escaleta` capability
(order-of-service managers and administrators; from anyone else it is ignored without an error). In the interface, the rest of
the team sees the Order of service tab read-only (a preview of the sheet and "Export order of service"). Orders of service saved before each service carried its
own row of titles have no `titulo` or `central`: the interface takes the base's when opening them and the PDF uses the base's
if they are missing.

| Field `tipo` | What it is | `defecto` |
|---|---|---|
| `texto` | One line. | Initial text. |
| `textoLargo` | Several lines (each is printed on its own line). | Initial text. |
| `cancion` | One song of the service or a hand-written name. | `primera` (first), `siguiente` (the one right after the last one assigned in the previous sections) or `ninguna` (none). |
| `canciones` | Several songs of the service and/or hand-written names. | `ninguna` (none), `siguiente` (a single one: the one right after the last one assigned in the previous sections) or `restantes` (the ones not in any other section). |

With `etiqueta` it prints "Label: value"; `pequeno` prints the value in small type. `modo` (boolean, only in `cancion` and
`canciones`; `false` is stored for other types): the field asks whether each song is sung or instrumental, and when printing
" (cantado)" or " (instrumental)" follows the name (not italic). `valor`: `texto`/`textoLargo` → text (500 and
2000 characters at most); `cancion` → `{ cancion: song id | 0, nombre, nota, instrumental }` (0 + name = hand-written; `nota`
is a one-line text, 200 characters at most, printed under the song in small type; `instrumental` false = sung, and only used
if the field has `modo`); `canciones` → a list of the
same (100 at most; empty entries are dropped); `null` for any type = "not touched yet": the interface applies the `defecto`
when displaying and printing. The song id must be that of an existing song (otherwise it becomes 0 and the name stays); the
`nombre` is also stored for the service's songs, in case they are later removed from the setlist (without a name the song's
title is used).

**Sanitising** (`pieb_can_escaleta_limpiar_*`): at most 30 sections of 10 fields; the `id`s ([a-z0-9-]) are cleaned and made
unique (sections among themselves and fields within their section); `titulo` and `central` of the row of titles 60 characters,
section title 60, note 120, label 60 and default 500 (`opcional`, `modo`, `instrumental` booleans with `rest_sanitize_boolean`,
`version` with `absint`); a field of unknown type is dropped; the default of the song types can
only be one of the values in the table.

**The installation's identity** (option `pieb_can_escaleta`, not autoloaded; `GET`/`POST /ajustes`, key `escaleta`, in Settings
and team → Order of service). It is the only part of the order of service that applies to every service: `logo` (top right) and
`cabecera` (top left), as `{ id, url } | null` (in `POST`, `{ id }` or `null` is enough; if the key is missing the image is
kept, and a `POST` without `secciones`, `titulo` or `central` keeps whatever was there). They must be the id of an image in the
media library that is not a private songbook file (otherwise `null`) and are returned with `wp_get_attachment_image_url`
(absolute `url`; `null` if the image no longer exists). The PDF always takes the logo and the header from here; the title and
the centre text, from the service's order of service.

**Images.** `POST /escaleta/imagen` (multipart, field `archivo`; JPG or PNG, max. 2 MB; the real content is checked) uploads
the logo or header with `media_handle_sideload` to the **normal** media library (`uploads/YYYY/MM`), not to the songbook's
private folder: they are the church's logo, not scores, and may be public (the `upload_dir` filter in `archivos.php` is only
active inside `pieb_can_adjuntar`, which this route does not use). It replies `{ id, url }`; the interface stores the `id` with
"Save settings".

**Backups.** The template (since 1.34 in `iglesias[].escaleta`; before, in `ajustes.escaleta`) goes only if the installation has its own (the generic one is not exported: on
another site it would stay fixed in the language of whoever exported) and **without the images** (`logo` and `cabecera` set
to `null`: their ids are not valid on another site). When restoring it is only applied if the backup has it, and the logo and
header this site already has are kept. Each service's order of service goes in `cultos[].escaleta` (only if the service has
one), with its songs identified by `uid` (plus `titulo` and `numero`) instead of by id, like the `items`, and keeping each song's `nota` and `instrumental`; when restoring they are
looked up on this site the same way as the setlist's songs, and any that are missing keep just the hand-written name.

## Exporting lyrics

`assets/letras.js` (`P.exportarLetras(canciones, opciones)`, loaded after `cultos.js`) opens a dialog to export the lyrics of one
song (song page: "Exportar letra" and the "Exportar" button of the Lyrics section) or of a whole setlist (service page: "Exportar
letras"). `canciones` is `[{ titulo, autor, numero, tonalidad, tempo, nota, letra, letraHtml }]` and `opciones` is `{ titulo, fecha,
tipo, esSetlist, nombreArchivo }`. It starts from `P.letra.estrofas(c)` (see `cancionero.js`): songs without lyrics are skipped and
the user is told at the end. Everything is generated in the browser; the last choice of format and background is remembered in
`localStorage`.

| Format | Result |
|---|---|
| Sheet PDF | pdf-lib, A4, Helvetica (n, b, i, bi) with bold, italic and underline; section names in capitals in the accent colour and choruses with a side bar; a stanza is not split across pages if it fits whole; in a setlist the songs are numbered and the next one starts on a new sheet only if less than ~140 pt are left. It opens in a new tab (`P.pdf.abrirVentana` is called in the click itself) or is downloaded. |
| Slides PDF | 960x540 pt pages with the background image full-bleed. |
| PowerPoint (.pptx) | PptxGenJS 3.12.0, **loaded on demand** from jsDelivr (like pdf-lib). One slide master per distinct background, so the image is not repeated in every slide; the text is editable (Arial, white, centred). |
| OpenLyrics (.xml) | Version 0.9, single song only: `titles`, `authors`, `songbooks` (the installation's name and the number), `tempo`, `key` in English notation, `verseOrder` and one `verse` per stanza (`v1`, `c1`, `b1`, `p1`, `i1`, `e1`; parts `v1a`, `v1b` when one section has several consecutive stanzas; a repeated stanza with the same text reuses its name). No formatting. |
| Text (.txt) | Title and stanzas separated by a blank line, without section names; in a setlist, songs are separated by two blank lines. |

**Slides (PDF and PowerPoint, same structure).** Per song, one title slide (title, author and, in a setlist, the service note) and
one per stanza. A stanza of more than 6 lines is split into balanced chunks of 5 lines or fewer; the section name is shown small at
the top. The font size is the largest (between 26 and 60 units of a 960x540 sheet) at which the widest line fits in 86 % of the
width and the block in 78 % of the height; if it does not fit even at the minimum, lines are wrapped (in PowerPoint the program does
it). The PDF helpers in `cultos.js` (`cargarPdfLib`, `latin1`, `envolverTexto`, the tab window) are shared as `P.pdf`.

**Backgrounds.** Images an administrator uploads in Settings and team -> Fondos de las letras (`includes/fondos.php`). They go to
the **normal** media library (they are not scores), do not carry the `_pieb_*` marks (so they do not show up in "unused files" and
are not moved to the private folder) and are **not included in backups**, just like the order-of-service images. In the dialog you
pick "Al azar" (random; in a setlist, a different image per song while there are enough), "Sin imagen" (plain `#111827`
background) or a specific one. On export each image is cropped *cover*-style to 1920x1080, darkened with a 45 % black layer and
saved as JPEG 0.85 (cached by id within an export).

## Trash

`includes/papelera.php`. Deleting a song (`DELETE /canciones/{id}`) sends it to the WordPress trash (`wp_trash_post`) and
records who deleted it (`_pieb_borrada_por`). Songbook administrators manage it at `#/papelera`: `GET /papelera` (list
with date, who deleted it and days left), `POST /papelera/{id}/restaurar` (back to published), `DELETE /papelera/{id}`
(delete for good) and `POST /papelera/vaciar`. `GET /canciones/{id}` also returns deleted songs to those who manage (with
`enPapelera` and `papelera`), and their files are only served to those users.

Cleanup: the `papelera_dias` setting (30 by default; 0 = never) overrides WordPress's cleanup (filter `pre_delete_post`
during `wp_scheduled_delete`), and there is a daily task of its own (`pieb_can_limpiar_papelera`). When a song is deleted
for good, by any route, `before_delete_post` also deletes its scores, audio and editable files.

**Service trash (phase 5c).** Deleting a service (`DELETE /cultos/{id}`) also sends it to the WordPress trash and the
`wp_trash_post` hook records who deleted it in `_pieb_borrada_por` (as with songs; cleared on restore). Each church sees and
restores its own: `GET /cultos/papelera`, `POST /cultos/papelera/{id}/restaurar`, `DELETE /cultos/papelera/{id}` and
`POST /cultos/papelera/vaciar` (permission `pieb_can_rest_acceso`; visibility is decided **only** by
`pieb_can_culto_papelera_visible($post)`: a service of the active church and, if private, only its author; otherwise whoever
manages the church (`pieb_can_puede_gestionar()`) or its author; the central admin does **not** see other people's private ones).
What is not visible answers 404 and `vaciar` only deletes what is visible. A restored service comes back published (filter
`wp_untrash_post_status`). Automatic cleanup (filter `pre_delete_post` and `pieb_can_limpiar_papelera`) also covers services with
the same `papelera_dias` period. `GET /cultos/{id}` for a trashed service still answers 404. The **song** trash (`/papelera...`)
remains central-only.

## Backups

`includes/ajustes.php` (`/copia...` routes, central only). The browser builds the backup: it asks `GET /copia`, downloads each file
and saves everything in a ZIP; to restore it uploads the files in chunks and creates songs and services one by one. Format
**`version: 2`** (phase 5c, several churches; restoring does not depend on the church the central admin is looking at):

- `iglesias`: one per **published** church (archived ones are left out): `{ uid, nombre, defecto, equipo: { emails, administradores,
  responsablesEscaleta, dominio }, bienvenida: { auto, texto }, escaleta (template without logo or header, or null), fondos }`.
  `uid` = `pieb_can_uid($id)` (`_pieb_uid`). Each one's data is read with `pieb_can_equipo($id)` and `pieb_can_dato_iglesia()`,
  not from the active church. `fondos` is always `null`: they are media-library images and their ids are not valid elsewhere.
- `ajustes`: only global things (`temaDefecto`, `googleClientId`, `avisoBorrado`, `papeleraDias` and `nombre`/`subtitulo` if custom).
- Each song adds `iglesias: { churchUid: { tonalidad, notas, principal } }` with its `_pieb_ig_{id}` (churches with no data are
  omitted; `principal` = position of the score among the exported ones, -1 if none). The top-level `notas` is still `_pieb_notas`.
  `etiquetas` is the list of `{ nombre, iglesia: uid|null }` with all the song's tags. Each audio adds `iglesia` (uid) and `universal`.
- Each service adds `iglesia` (uid) and `privado`. Services of all published churches are exported, **except other people's
  private ones** (they are not dumped into the central admin's file; their own are).

**Restoring.** For a backup with `version >= 2` the browser first calls `POST /copia/iglesias` with `{ iglesias, modo }`: each
church is matched by `uid`, else by name (case-insensitive), else, being the default one, with this site's default church, and
if nothing matches it is **created** (`pieb_can_iglesia_crear()`, like `POST /iglesias`). The backup's `uid` is set if the church had none.
With `modo: 'saltar'` those that already existed are left alone; otherwise (and always for new ones) their team (**merged** into the
current one: never leaves anyone without access), welcome text and order-sheet template (keeping the site's logo and header)
are restored. **It never sends welcome emails.** It answers `{ mapa, creadas, emparejadas }`. That `mapa` (backup `uid` -> id here)
travels in `/copia/estado`, `/copia/cancion` and `/copia/culto`:

- Services: looked up **inside their church** (`pieb_can_copia_buscar('culto', ..., $iglesia_id)`); their church is `mapa[culto.iglesia]`
  and, if the backup has none or it is not in the map, the **default church** (never the active one). `_pieb_iglesia` and
  `_pieb_privado` are saved.
- Songs: after the common data, each mapped church's `_pieb_ig_{id}` is restored (`principal`, from position to id), tags in their
  church or as universal, and each audio with its `iglesia` and `universal` (default church if missing).
- An **old backup** (no `iglesias`) does not call `/copia/iglesias`: everything goes to the default church and `POST /copia/ajustes`
  with its old fields (`emails`, `dominio`, `bienvenidaAuto`, `bienvenidaTexto`, `responsablesEscaleta`, `escaleta`) applies them to the
  default church explicitly. With a new backup, `/copia/ajustes` only touches global settings.

## Deleted-song alert

`includes/avisos.php`. When someone deletes a song from the songbook and it ends up in the trash, the administrators get an
email with the song, its files, who deleted it and when.

**Setting.** `aviso_borrado` (bool, `true` by default, also on installations that already existed). `GET /ajustes` returns
`avisoBorrado` (bool) and `correoAdmin` (WordPress's `admin_email`, which the interface shows in the checkbox's help text);
`POST /ajustes` accepts `avisoBorrado` (only if present). The backup includes it and restoring applies it only if the
backup carries it. The checkbox is in "Settings and team → General", in the "Trash" box.

**Queue and batched sending.** `pieb_can_rest_borrar` calls `pieb_can_aviso_borrado_encolar()` once the song is in the
trash (if WordPress deletes it outright because `EMPTY_TRASH_DAYS` is 0, there is no alert). If the alert is on, it adds
to the option `pieb_can_avisos_borrado` (not autoloaded) a snapshot taken at that moment, because if the song is later
deleted for good its data and files would no longer exist: `{id, titulo, numero, tonalidad, archivos, por: {id, nombre,
email}, cuando}`, where `archivos` are the file names of scores, audio and editable files (or the attachment's title if the
file is gone). It then schedules the event `pieb_can_enviar_avisos_borrado` one minute later (`wp_schedule_single_event`) if
there is not one already: the interface's multiple delete does one `DELETE canciones/{id}` per song, back to back, so
everything arrives in **a single email**. It depends on WordPress cron, which fires with visits to the site (with
`DISABLE_WP_CRON` a system cron that calls `wp-cron.php` is needed). The handler takes the queue and **empties it before
sending**, so nothing is repeated if sending fails; if the alert was turned off in the meantime, it discards the queue.

**Recipients and email.** The alert goes to the emails in the `administradores` list of the settings and to the site's
administration email (`admin_email`), without repeats. Each one has the songs they deleted themselves removed (they already
know) and, if none is left, nothing is sent to them. It is one email per recipient, composed inside
`pieb_can_en_idioma_del_sitio()` and sent with `pieb_can_correo_enviar()` in the shared look of `includes/correo.php`: a box
per song (title with hymnal number and key, who deleted it and when, files), a note about how long it stays in the trash
(`papelera_dias`) and a button to `#/ajustes/papelera`. More than 40 songs in one email are summarised with an "And N more
songs" line (Gmail clips very long emails).

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
- **Key notation:** what is stored never changes (`Sol`, `Mib`, `La m`). The user meta `pieb_notacion` (`latina` or
  `americana`; `POST /preferencias`, `notacion`) decides how keys are shown. It does not depend on the language each
  person picks: until they choose, the site language's one is used (Do-Re-Mi in Spanish, C-D-E in the others). In JavaScript, `tonoVer()` (exposed to the other files as `P.tono()`)
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

## Page cache

When signed in, the songbook page carries per-person data (theme, language, notation and the API key in
`PIEB_CANCIONERO`): `pieb-cancionero.php` marks it as non-cacheable in `template_redirect` (`DONOTCACHEPAGE`,
`nocache_headers()`, the `X-LiteSpeed-Cache-Control: no-cache` header and the `litespeed_control_set_nocache` action),
and `POST /preferencias` fires `litespeed_purge_private_all` to clear that person's private LiteSpeed copy. Without this,
the old page kept being served after changing a preference. The sign-in screen (no session) can still be cached.
