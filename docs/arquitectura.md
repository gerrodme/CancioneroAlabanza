# Arquitectura

Resumen técnico del plugin **PIEB Cancionero** para quien llegue nuevo al código.

## Piezas

| Archivo | Responsabilidad |
|---|---|
| `pieb-cancionero.php` | Cabecera del plugin, constantes, roles y capacidades, shortcode `[cancionero]`, carga de scripts y del objeto `PIEB_CANCIONERO` que la interfaz lee. |
| `includes/canciones.php` | Tipo de contenido de canción, lectura/escritura de metadatos, subida de archivos, límites de tamaño. |
| `includes/rest.php` | API REST `pieb/v1`: listar, ver, crear, actualizar y borrar canciones; subida de archivos por trozos. |
| `includes/cultos.php` | Cultos y setlists (tipo de contenido y API). |
| `includes/ajustes.php` | Temas, ajustes, lista del equipo, preferencias por usuario, copias de seguridad (exportar/importar). |
| `includes/google.php` | Acceso con Google (ID token) y con enlace por correo. |
| `includes/migracion.php` | Convierte los PDF del plugin anterior (`adoracion_culto_*`) en canciones. Idempotente. |
| `assets/cancionero.js` | Interfaz principal (sin dependencias ni compilación): lista, ficha, formulario, subida múltiple, estadísticas, ajustes. |
| `assets/cultos.js` | Pantallas de cultos y editor de setlist. |
| `assets/visor.js` | Visor / modo culto para tableta. |
| `assets/login.js` | Pantalla de acceso. |
| `assets/cancionero.css` | Estilos y temas. Todo cuelga de `[data-pcan-theme]` y variables `--pc-*`. |

La interfaz es una aplicación de una sola página dentro de la página de WordPress; navega con `#/…`
(`#/canciones`, `#/cancion/{id}`, `#/subir`, `#/cultos`, `#/estadisticas`, …).

## Modelo de datos

- Tipos de contenido: `pieb_cancion` (canción), `pieb_culto` (culto). Taxonomía de etiquetas: `pieb_etiqueta`.
- Rol `equipo_adoracion` («Equipo de adoración»). Capacidades: `pieb_cancionero_acceso` (ver, subir y editar canciones)
  y `pieb_cancionero_gestionar` (borrar cualquiera, ajustes y copias de seguridad).
- Metadatos de **canción** (en `post_meta`):

  | Clave | Contenido |
  |---|---|
  | `_pieb_numero` | Número en el himnario (texto). |
  | `_pieb_autor` | Autor / compositor. |
  | `_pieb_tonalidad` | Tonalidad en notación española: `Do`, `Fa#`, `Sib`, `Mim`… |
  | `_pieb_tempo` | Entero, pulsaciones por minuto. |
  | `_pieb_letra`, `_pieb_notas` | Texto plano. |
  | `_pieb_partituras` | Lista de `{id (adjunto), label}`; mínimo 1. PDF, JPG o PNG, máx. 4 MB. |
  | `_pieb_youtube` | Lista de `{url, label}`; solo se aceptan enlaces de YouTube válidos. |
  | `_pieb_audios` | Lista de `{id, nombre, descripcion}`. MP3/M4A/OGG/WAV/AAC, máx. 10 MB. |
  | `_pieb_editables` | Lista de `{id, descripcion}`: MuseScore, MusicXML… máx. 10 MB. |

- Metadatos de **culto**: `_pieb_fecha`, `_pieb_tipo`, `_pieb_notas`, `_pieb_items` (lista de
  `{cancion, tonalidad, nota}` en orden).
- Opciones de WordPress: `pieb_can_ajustes` (ajustes), `pieb_can_version`, `pieb_can_migrado`.

## API REST (`/wp-json/pieb/v1/`)

Todas las rutas exigen sesión iniciada con la capacidad `pieb_cancionero_acceso` y el encabezado
`X-WP-Nonce` (la interfaz lo recibe en `PIEB_CANCIONERO.nonce`; la base de la API está en `PIEB_CANCIONERO.api`).

| Ruta | Métodos | Notas |
|---|---|---|
| `/canciones` | GET, POST | GET devuelve un **resumen** de todas (`id, titulo, numero, autor, tonalidad, tempo, etiquetas, letra, miniatura, creada, modificada` y los **conteos** `partituras`, `youtube` y `audios`). POST crea. |
| `/canciones/{id}` | GET, POST, DELETE | GET devuelve la ficha completa (partituras con `archivo`/`url`, audios, `youtube` con `videoId`, notas…). POST **actualiza reemplazando todo** (ver abajo). DELETE manda a la papelera. |
| `/subidas` | POST | Subida de archivos **por trozos** (un audio de 10 MB cabe aunque PHP limite a 2 MB por petición). |
| `/cultos`, `/cultos/{id}` | GET, POST, DELETE | Cultos y setlists. |
| `/etiquetas`, `/preferencias`, `/ajustes`, `/huerfanos` | varios | Etiquetas con color, preferencias del usuario, ajustes, archivos sin usar. |
| `/google`, `/enlace`, `/correo-prueba` | POST | Acceso con Google, enlace por correo y prueba de envío. |

### Actualizar una canción (`POST /canciones/{id}`)

Cuerpo `multipart/form-data` con todos estos campos (los ausentes se **vacían**):

`titulo, numero, autor, tonalidad, tempo, etiquetas` (separadas por comas), `letra, notas`,
`youtube` (JSON `[{url,label}]`), `partituras` (JSON `[{id,label}]` de las que se conservan),
`nuevasSubidas` (JSON, archivos ya subidos por trozos), `audios`, `audiosSubidos`, `editables`,
`editablesSubidos`. Una canción necesita **al menos una partitura**.

Para cambiar un solo dato: `GET` la ficha, reconstruir todos los campos con ella y modificar solo el deseado. Receta en
[carga-masiva.md](carga-masiva.md).

## Subida múltiple

`#/subir`: el usuario arrastra archivos; el título, el número de himnario y la tonalidad se deducen del nombre
(`datosDesdeArchivo` en `cancionero.js`). Algunos patrones: `051 - Cristo coronad.pdf` → 51 · Cristo coronad;
`Todas las promesas 13 A.pdf` → 13 · Todas las promesas · La; `Cuán grande es Él - Sib.pdf` → tonalidad Sib. La
tonalidad se acepta en notación americana (`F#m`, `Bb`) o española y se guarda en española. Cada archivo se sube por
trozos y crea una canción (`youtube` vacío). Un botón quita de la lista las que ya existen.

## Temas

Variables CSS `--pc-*` por tema: `colores` (por defecto), `pentagrama`, `sitio` (sigue el tema de WordPress), `pulso`,
`claro` (Estudio), `escenario`, `papel` (Partitura). El tema se fija en `data-pcan-theme` y el estilo extra en
`data-pcan-estilo`. El banco de pruebas acepta `?tema=`.
