# Arquitectura

*English version: [arquitectura.en.md](arquitectura.en.md)*

Resumen técnico del plugin **Cancionero** para quien llegue nuevo al código.

## Piezas

| Archivo | Responsabilidad |
|---|---|
| `pieb-cancionero.php` | Cabecera del plugin, constantes, roles y capacidades, shortcode `[cancionero]`, carga de scripts y del objeto `PIEB_CANCIONERO` que la interfaz lee; en la página del cancionero, iconos y manifiesto del acceso directo (`wp_head`). |
| `includes/canciones.php` | Tipo de contenido de canción, lectura/escritura de metadatos, subida de archivos, límites de tamaño. |
| `includes/etiquetas.php` | Etiquetas por iglesia y universales (visibilidad, creación, asignación, `GET/POST /etiquetas/universales`). Ver [Iglesias](#iglesias). |
| `includes/rest.php` | API REST `pieb/v1`: listar, ver, crear, actualizar y borrar canciones; subida de archivos por trozos. |
| `includes/archivos.php` | Archivos privados del cancionero: carpeta `cancionero-privado`, entrega con sesión (`?pcan_archivo=ID`), protección y archivos sin usar. |
| `includes/papelera.php` | Papelera del cancionero: quién borró, plazo y limpieza automática, restaurar y eliminar para siempre. |
| `includes/iglesias.php` | Iglesias (tipo `pieb_iglesia`), pertenencia de cada usuario, iglesia activa, administrador central, migración y `GET /iglesias`, `POST /iglesias/activa`. Ver [Iglesias](#iglesias). |
| `includes/cultos.php` | Cultos y setlists (tipo de contenido y API). |
| `includes/ajustes.php` | Temas, ajustes, lista del equipo, preferencias por usuario, copias de seguridad (exportar/importar). |
| `includes/google.php` | Acceso con Google (ID token) y con enlace por correo. |
| `includes/correo.php` | Aspecto común de los correos (cabecera con el logo, tarjeta, botón) y su envío en HTML con texto plano y la cabecera incrustada. |
| `includes/bienvenida.php` | Correo de bienvenida al equipo: registro de envíos, composición del correo (HTML y texto) y `POST /bienvenida`. |
| `includes/avisos.php` | Aviso por correo a los administradores cuando alguien borra una canción: cola de borrados, envío agrupado por cron y composición del correo. |
| `includes/accesos.php` | Registro de accesos: inicios de sesión (fecha, método y tipo de dispositivo), días de uso y `GET /accesos` con los datos en bruto para las estadísticas de «Ajustes y equipo». |
| `includes/escaleta.php` | Escaleta del culto (la hoja impresa con el orden del culto): plantilla genérica y guardada, saneado de la plantilla y de la copia de cada culto, subida de las imágenes de la cabecera y `GET /escaleta`, `POST /escaleta/imagen`. |
| `includes/fondos.php` | Fondos de las letras: imágenes de fondo para las diapositivas de letras (biblioteca de medios normal) y `GET`/`POST /fondos`, `DELETE /fondos/{id}`. |
| `includes/migracion.php` | Convierte los PDF del plugin anterior (`adoracion_culto_*`) en canciones. Idempotente. |
| `assets/cancionero.js` | Interfaz principal (sin dependencias ni compilación): lista, ficha, formulario, subida múltiple, estadísticas, ajustes. Incluye «Acerca del Cancionero» (ruta `#/acerca`, entrada del menú de la cuenta para todos los usuarios): versión, autoría, licencia, código fuente y componentes de terceros; si se añade una librería externa, hay que listarla ahí. |
| `assets/cultos.js` | Pantallas de cultos y editor de setlist. |
| `assets/letras.js` | Exportar letras (hoja en PDF, diapositivas en PDF, PowerPoint, OpenLyrics y texto): diálogo y generadores. Se carga después de `cultos.js` y usa `P.pdf`. |
| `assets/visor.js` | Visor / modo culto para tableta; incluye el metrónomo del lector (Web Audio con programación anticipada, tempo de la canción, tap tempo y compás; atajo «M»). `abrirLector` muestra las partituras del culto (ruta `#/culto/ID/tocar/N`); `abrirCantor` es el mismo lector con la letra de cada canción en vez de la partitura (ruta `#/culto/ID/cantar/N`, `N` = posición en el setlist): scroll vertical por «páginas» (pedal Bluetooth, teclas, toques en los tercios), deslizar en horizontal para cambiar de canción y tamaño de texto guardado en el navegador. |
| `assets/login.js` | Pantalla de acceso. |
| `assets/cancionero.css` | Estilos y temas. Todo cuelga de `[data-pcan-theme]` y variables `--pc-*`. |

La interfaz es una aplicación de una sola página dentro de la página de WordPress; navega con `#/…`
(`#/canciones`, `#/cancion/{id}`, `#/subir`, `#/cultos`, `#/estadisticas`, …).

## Modelo de datos

- Tipos de contenido: `pieb_cancion` (canción), `pieb_culto` (culto). Taxonomía de etiquetas: `pieb_etiqueta`.
- Roles: `equipo_adoracion` («Equipo de adoración»: capacidad `pieb_cancionero_acceso`, ver, subir y editar canciones) y
  `administrador_cancionero` («Administrador del cancionero»: acceso + `pieb_cancionero_gestionar`, es decir, ajustes,
  equipo y borrar cualquier canción). Los administradores y editores de WordPress tienen ambas capacidades; las
  copias de seguridad, la restauración y los ajustes requieren `pieb_cancionero_gestionar`. Las listas de correos «equipo» y
  «administradores» están en los ajustes: al entrar (Google o enlace) o al guardar los ajustes, el rol de administrador
  se concede o se retira según esa lista (`pieb_can_sincronizar_administrador`).
- Rol `responsable_escaleta` («Responsable de escaleta»: acceso + `pieb_can_escaleta`): como el equipo, y además prepara la
  escaleta de los cultos. Quien no tiene `pieb_can_escaleta` (el equipo normal) puede **ver y exportar** la escaleta, pero no
  crearla ni modificarla. Los administradores del cancionero, los administradores y los editores de WordPress también tienen
  `pieb_can_escaleta`. La lista `responsablesEscaleta` de los ajustes se sincroniza con ese rol igual que `administradores`
  (la misma función `pieb_can_sincronizar_administrador` da o quita los dos roles) y sus correos entran también en `emails`.
  La interfaz recibe `escaleta` (booleano) en `PIEB_CANCIONERO`.
- **Prefijo interno `pieb`:** las claves internas (tipos `pieb_cancion`, metadatos `_pieb_*`, ruta REST `pieb/v1`,
  funciones `pieb_can_*`) conservan el prefijo histórico para no romper los datos de instalaciones existentes. Es solo un
  identificador técnico; el nombre visible del producto es «Cancionero».
- Metadatos de **canción** (en `post_meta`):

  | Clave | Contenido |
  |---|---|
  | `_pieb_numero` | Número en el himnario (texto). |
  | `_pieb_autor` | Autor / compositor. |
  | `_pieb_tonalidad` | Tonalidad **original** de la canción (común a todas las iglesias) en notación española: `Do`, `Fa#`, `Sib`, `Mim`… La habitual de cada iglesia es otro dato (`_pieb_ig_{id}`). |
  | `_pieb_tempo` | Entero, pulsaciones por minuto. |
  | `_pieb_letra`, `_pieb_notas` | Texto plano. `_pieb_letra` es siempre texto plano (búsqueda, listado, copiar…); si hay `_pieb_letra_html`, se deriva de él. |
  | `_pieb_letra_html` | Opcional. Letra con formato, HTML saneado: hijos de primer nivel `p`, `h4` (título de sección) o `blockquote` (estribillo, solo con `p`); dentro, solo texto, `br`, `strong`, `em`, `u`; sin atributos. Cada línea es un `<p>` y `<p></p>` separa estrofas. |
  | `_pieb_partituras` | Lista de `{id (adjunto), label, tonalidad}`; mínimo 1. PDF, JPG o PNG, máx. 4 MB. `tonalidad` vacía = la **original** de la canción (`_pieb_tonalidad`), nunca la habitual de una iglesia; las entradas antiguas sin la clave valen `''` (`pieb_can_get_partituras()` la devuelve siempre). La tonalidad efectiva de una partitura es la suya o, si no tiene, la original de la canción; dos tonalidades son iguales si coinciden tras `trim` y minúsculas (`pieb_can_tono_clave()`, sin enarmonías). Al guardar, una tonalidad igual a la original de esa misma petición se guarda como `''`. |
  | `_pieb_youtube` | Lista de `{url, label}`; solo se aceptan enlaces de YouTube válidos. |
  | `_pieb_audios` | Lista de `{id, nombre, descripcion}` (más `autor`, `iglesia` y, opcional, `universal: 1`). MP3/M4A/OGG/WAV/AAC, máx. 10 MB. Cada audio es **de la iglesia que lo subió**; con `universal` (solo lo pone el central) lo ven todas. Ver [Iglesias](#iglesias). |
  | `_pieb_ig_{idIglesia}` | Datos de la canción propios de esa iglesia: `{ tonalidad, principal, notas }` (`tonalidad`: la habitual cruda, `''` = la original; `principal`: ID de la partitura principal, 0 = el orden guardado; `notas`). Si queda todo vacío, la meta se borra. **Las notas de la iglesia por defecto no van aquí sino en `_pieb_notas`** (sin migración). Ver [Iglesias](#iglesias). |
  | `_pieb_editables` | Lista de `{id, descripcion}`: MuseScore, MusicXML… máx. 10 MB. |
  | `_pieb_campos_autor` | `{ campo: idUsuario }`: quién rellenó `titulo`, `numero`, `autor`, `tonalidad` y `tempo`. Solo pesa con varias iglesias (ver [Iglesias](#iglesias)); lo que falta cuenta como rellenado por el creador de la canción. |
  | `autor`, `iglesia` (en cada elemento de las cuatro listas anteriores) | `autor`: ID del usuario que lo añadió; `iglesia`: ID de la iglesia desde la que se añadió. Si faltan, los getters (`pieb_can_get_partituras/audios/editables/youtube`) los completan al leer con el autor de la canción y la iglesia por defecto, sin escribir nada. Al guardar, los elementos nuevos llevan el usuario actual y su iglesia activa; los que se conservan mantienen los suyos (nunca se aceptan del cliente; un enlace de YouTube es «el mismo» si coincide su URL). La API los devuelve en cada partitura, audio, editable y enlace. |

- Metadatos de **culto**: `_pieb_iglesia` (ID de la iglesia; se guarda al crearlo y no cambia al editar; `pieb_can_culto_iglesia()` devuelve la de por defecto si falta; el resumen del culto la trae como `iglesia`), `_pieb_privado` (`'1'` = culto privado, solo lo ve su autor; el resumen trae `privado` y `mio`; **la visibilidad la decide solo `pieb_can_culto_visible()`**, ver [Iglesias](#iglesias)), `_pieb_fecha`, `_pieb_tipo`, `_pieb_notas`, `_pieb_items` (lista de
  `{cancion, tonalidad, nota, partitura}` en orden; `partitura` es el ID del adjunto elegido para ese culto, 0 = la principal (la primera de la canción). Al
  servir el culto, `datos.partituras` lleva solo las partituras cuya tonalidad efectiva coincide con la del item (la suya o, si
  está vacía, la de la canción), con la elegida la primera; si ninguna coincide (tonalidad antigua escrita a mano) o la elegida
  es de otra tonalidad, lleva todas con la elegida la primera. El modo culto y el PDF usan la primera. `datos.tonalidades`
  trae las tonalidades disponibles de la canción. El culto no valida `tonalidad` contra ellas (texto libre en cultos antiguos)),
  `_pieb_escaleta` (opcional: la escaleta de ese culto, con su fila de títulos, sus secciones y sus valores; ver
  [Escaleta del culto](#escaleta-del-culto)).
- Opciones de WordPress: `pieb_can_ajustes` (ajustes: `nombre`, `tema_defecto`, `google_client_id`, `emails`,
  `administradores`, `responsablesEscaleta`, `dominio`, `bienvenida_auto`, `bienvenida_texto`, `pagina`, `aviso_borrado`), `pieb_can_escaleta`
  (identidad de la escaleta de la instalación: logo y cabecera; sin autoload; si no existe se usa la genérica), `pieb_can_fondos` (lista de IDs de adjunto de los fondos de las letras; sin autoload), `pieb_can_bienvenidas`
  (registro de los correos de bienvenida enviados: correo → marca de tiempo; sin autoload), `pieb_can_avisos_borrado`
  (cola de canciones borradas pendientes de avisar; sin autoload; ver [Aviso de canciones borradas](#aviso-de-canciones-borradas)),
  `pieb_can_accesos_desde` (desde cuándo se registran los accesos; sin autoload), `pieb_can_version`, `pieb_can_migrado`.
- Metadatos de **usuario** del registro de accesos: `pieb_can_accesos` (inicios de sesión), `pieb_can_dias` (días de uso)
  y `pieb_can_ultimo_acceso`. Ver [Registro de accesos](#registro-de-accesos).

## API REST (`/wp-json/pieb/v1/`)

Todas las rutas exigen sesión iniciada con la capacidad `pieb_cancionero_acceso` y el encabezado
`X-WP-Nonce` (la interfaz lo recibe en `PIEB_CANCIONERO.nonce`; la base de la API está en `PIEB_CANCIONERO.api`).

| Ruta | Métodos | Notas |
|---|---|---|
| `/canciones` | GET, POST | GET devuelve un **resumen** de todas (`id, titulo, numero, autor, tonalidad` (la habitual de la iglesia activa), `tonalidadOriginal`, `tempo`, etiquetas, letra, miniatura, creada, modificada` y los **conteos** `partituras`, `youtube` y `audios` (solo los que ve quien pregunta); si hay más de una partitura, `variantes` `[{id, label, tonalidad}]` con la tonalidad cruda; y `tonalidades`: las tonalidades efectivas distintas de sus partituras, sin vacías, la habitual de la iglesia activa primero si alguna está en ella). Con la partitura principal de la iglesia activa, esta va primera en `variantes` y da la `miniatura`. POST crea. |
| `/canciones/{id}` | GET, POST, DELETE | GET devuelve la ficha completa (partituras con `archivo`/`url`, audios, `youtube` con `videoId`, notas…). POST **actualiza reemplazando todo** (ver abajo). DELETE manda a la papelera. |
| `/canciones/etiquetar` | POST | Añade y/o quita etiquetas a varias canciones sin tocar el resto de la ficha. Cuerpo JSON `{ids, anadir, quitar}` (hasta 200 ids); devuelve `{canciones: [{id, etiquetas}]}`. La interfaz lo llama por tandas de 40 desde el modo «Etiquetar». |
| `/manifest?pagina=ID` | GET | **Pública** (sin sesión ni nonce). Manifiesto web (`application/manifest+json`) para el acceso directo de la página del cancionero: nombre de la instalación, `start_url`/`scope` de esa página (`pagina` debe tener el shortcode; si no, la portada), `display: standalone` e iconos (192, 512 y maskable). No expone nada privado. |
| `/subidas` | POST | Subida de archivos **por trozos** (un audio de 10 MB cabe aunque PHP limite a 2 MB por petición). |
| `/canciones/{id}/iglesia` | POST | Cuerpo JSON `{ tonalidad?, principal? }` (solo las claves que lleguen): fija la **tonalidad habitual** (`''` = seguir la original, o una de las disponibles; 400 si no; si coincide con la original se guarda `''`) y/o la **partitura principal** (0 = el orden por defecto, o el ID de una partitura de la canción; 400 si no) de la iglesia activa. Solo la administración de esa iglesia o el central (`pieb_can_es_admin_iglesia()`; 403 si no). Responde la ficha. |
| `/canciones/{id}/audios/{audio}/universal` | POST | Cuerpo `{ universal: bool }`: publica un audio en todas las iglesias o lo devuelve a la suya. Solo el central y con varias iglesias (403 si no); 404 si la canción no tiene ese audio. Responde la ficha. |
| `/cultos/{id}/privacidad` | POST | Cuerpo `{ privado: bool }`: hace privado un culto o lo devuelve al equipo. Solo su autor (403 para los demás que lo ven); responde el resumen del culto. |
| `/cultos`, `/cultos/{id}` | GET, POST, DELETE | Cultos y setlists. **Solo los de la iglesia activa y, si son privados, los propios; el resto responde 404.** `POST` acepta `privado` (al crear, cualquiera; al editar, solo el autor). `GET /cultos/{id}` devuelve además `escaleta` (objeto o `null`; no va en el listado) y `POST` la acepta solo si llega (`null` la borra) **y solo de quien tiene `pieb_can_escaleta`**: de cualquier otro se ignora, sin error (el resto del culto sí se guarda y la escaleta que hubiera se conserva). Ver [Escaleta del culto](#escaleta-del-culto). |
| `/escaleta` | GET | **Base de la escaleta de un culto nuevo**: la estructura (sin valores) y la fila de títulos de la última escaleta guardada en cualquier culto, con el logo y la cabecera de la instalación y `desde: {id, titulo}` (el culto de origen; `null` si sale de la plantilla genérica). La lee todo el equipo, porque preparar la escaleta de un culto la necesita. |
| `/escaleta/imagen` | POST | Sube el logo o la imagen de cabecera de la escaleta (JPG o PNG, máx. 2 MB) a la biblioteca de medios normal; responde `{ id, url }` (exige `pieb_cancionero_gestionar`). |
| `/iglesias` | GET, POST | `GET`: iglesias del usuario (al central, todas): `{ activa, central, iglesias: [{id, nombre, rol, ajena}] }`. `POST` `{ nombre }`: crea una iglesia (solo central; 403 si no) y responde igual más `creada: id`. Ver [Iglesias](#iglesias). |
| `/iglesias/{id}` | POST | Cuerpo `{ nombre }`: renombra la iglesia (solo central) y responde el estado. |
| `/iglesias/activa` | POST | Cuerpo `{ iglesia: id }`: elige la iglesia activa del usuario (guarda `_pieb_iglesia_activa`) y responde como el `GET`; 403 si no pertenece a ella (el central puede elegir cualquiera). |
| `/etiquetas`, `/preferencias`, `/huerfanos` | varios | Etiquetas **visibles** (de la iglesia activa y universales) con color como `{ nombre: color }`, preferencias del usuario (`tema`, `idioma` y `notacion`, todos opcionales; vacío = automático), archivos sin usar. |
| `/fondos` | GET, POST | `GET` (cualquiera del equipo): `{ fondos: [{ id, url, miniatura }] }` (`url` a tamaño completo, `miniatura` en tamaño «medium»; omite los adjuntos que ya no existen). `POST` (exige `pieb_cancionero_gestionar`): multipart `archivo`, solo JPG o PNG, máx. 5 MB y 40 fondos; sube a la biblioteca de medios normal y responde `{ id, url, miniatura }`. Ver [Exportar letras](#exportar-letras). |
| `/fondos/{id}` | DELETE | Quita el fondo de la lista y borra su adjunto (exige `pieb_cancionero_gestionar`); responde `{ fondos: [...] }`. |
| `/ajustes` | GET, POST | Ajustes del cancionero y lista del equipo (exige `pieb_cancionero_gestionar`). Los campos de la bienvenida, en [Bienvenida al equipo](#bienvenida-al-equipo). La escaleta de la instalación son solo sus imágenes: `GET` devuelve `escaleta: { logo, cabecera }` y `POST` acepta `escaleta: { logo: {id}|null, cabecera: {id}|null }` solo si llega (lo demás de la escaleta no se toca); ver [Escaleta del culto](#escaleta-del-culto). |
| `/bienvenida` | POST | Envía el correo de bienvenida a una tanda de correos (exige `pieb_cancionero_gestionar`). Ver [Bienvenida al equipo](#bienvenida-al-equipo). |
| `/accesos` | GET | Registro de accesos de cada persona del equipo, en bruto, para las estadísticas (exige `pieb_cancionero_gestionar`). Ver [Registro de accesos](#registro-de-accesos). |
| `/google`, `/enlace`, `/correo-prueba` | POST | Acceso con Google, enlace por correo y prueba de envío. |

### Actualizar una canción (`POST /canciones/{id}`)

Cuerpo `multipart/form-data` con todos estos campos (los ausentes se **vacían**; con varias iglesias el servidor conserva además lo que añadió otra persona y no puedes cambiar, ver [Iglesias](#iglesias)):

`titulo, numero, autor, tonalidad, tempo, etiquetas` (separadas por comas), `letra, letraHtml, notas`,
`youtube` (JSON `[{url,label}]`), `partituras` (JSON `[{id,label,tonalidad}]` de las que se conservan; la `tonalidad` de cada una hay que reenviarla o se pierde),
`nuevasSubidas` (JSON `[{id,nombre,label,tonalidad}]`, archivos ya subidos por trozos; para la vía antigua `nuevas[]` hay `nuevasLabels` y `nuevasTonalidades`, JSON paralelos), `audios`, `audiosSubidos`, `editables`,
`editablesSubidos`. Una canción necesita **al menos una partitura**.

`letraHtml` (letra con formato, ver `_pieb_letra_html`): si llega con contenido, se sanea y manda: `letra` se deriva de él (cada `p`/`h4` una línea, `br` salto, `<p></p>` línea vacía). Si llega vacío, se borra el formato y se guarda `letra` como texto plano. Si **no llega** (scripts que solo envían `letra`), el formato se conserva solo si su texto sigue coincidiendo con `letra`; si no, se borra. `GET /canciones/{id}` devuelve `letraHtml` (`''` si no hay); el listado no la lleva. Los `datos` de cada canción de un culto llevan también `autor` y `letraHtml`, y la copia de seguridad exporta `letraHtml` y la `tonalidad` de cada partitura (una copia antigua sin ella se importa con `''`). `GET /canciones/{id}` devuelve la `tonalidad` cruda en cada partitura.

Para cambiar un solo dato: `GET` la ficha, reconstruir todos los campos con ella y modificar solo el deseado. Receta en
[carga-masiva.md](carga-masiva.md).

## Iglesias

`includes/iglesias.php`. Una instalación puede servir a varias iglesias con un repositorio de canciones común (plan en
[plan-multi-iglesia.md](plan-multi-iglesia.md)). La fase 1 deja los cimientos **sin ningún cambio visible**: una instalación
de una sola iglesia se comporta exactamente igual.

- **Entidad.** Tipo de contenido `pieb_iglesia` (no público, sin interfaz, sin REST nativo); el nombre es el título. Siempre
  hay una, la **por defecto** (opción `pieb_can_iglesia_defecto`), que `pieb_can_iglesia_defecto()` crea sola la primera vez
  con el nombre que tenía el cancionero (la línea bajo el nombre o, si está vacía, el nombre del sitio). `pieb_can_iglesias()`
  lista las publicadas por orden de título.
- **Pertenencia.** Meta de usuario `_pieb_iglesias` = `{ idIglesia: rol }` con rol `equipo`, `escaleta` o `admin`
  (`pieb_can_iglesias_de()`, `pieb_can_rol_en()`). Mientras no exista la meta, quien tiene `pieb_cancionero_acceso`
  pertenece a la iglesia por defecto con el rol que dicen sus capacidades de WordPress (`admin` si tiene
  `pieb_cancionero_gestionar`, `escaleta` si `pieb_can_escaleta`, si no `equipo`). En esta fase no se escribe la meta para nadie:
  los roles de WordPress siguen siendo la fuente de verdad.
- **Iglesia activa.** `pieb_can_iglesia_activa()`: la de la cabecera `X-PCAN-Iglesia` si el usuario pertenece a ella; si no,
  la meta de usuario `_pieb_iglesia_activa`; si no, la primera suya; si no, la de por defecto. La interfaz solo envía la
  cabecera cuando el usuario tiene más de una iglesia. `window.PIEB_CANCIONERO` trae `iglesia` (`{id, nombre}`), `iglesias`
  (`[{id, nombre, rol, ajena}]`) y `central`.
- **Administrador central.** Capacidad `pieb_cancionero_central`, que reciben los administradores de WordPress.
  `pieb_can_es_central()` es verdadero con esa capacidad **o**, mientras solo exista una iglesia, con
  `pieb_cancionero_gestionar` (así la administración de una única iglesia hace de central y nada cambia).
- **Migración.** `pieb_can_migrar_iglesias()` (en `init`, prioridad 20; idempotente; solo trabaja si la opción `pieb_can_multi`
  es menor que 1) asegura la iglesia por defecto, sella con ella todos los cultos que no tengan `_pieb_iglesia` (también los
  de la papelera) y guarda `pieb_can_multi = 1`. No reescribe canciones.
- **Qué hace ya esta fase (2).** Filtra los **cultos** por iglesia y añade los **cultos privados** (ver abajo). Con una sola
  iglesia y sin cultos privados todo se comporta como antes. No cambian los permisos de edición de canciones ni cultos
  por rol. Las canciones siguen siendo comunes a todas las iglesias.
- **El central entra en cualquier iglesia.** Quien tiene la capacidad real `pieb_cancionero_central` puede usar como activa
  (cabecera `X-PCAN-Iglesia`, meta `_pieb_iglesia_activa`, `POST /iglesias/activa`) cualquier iglesia existente, aunque no
  sea miembro. `pieb_can_iglesias_lista_usuario()` le devuelve todas: en las suyas su rol y `ajena: false`; en las demás
  `rol: 'admin'` y `ajena: true`. Para los demás, solo las suyas (`ajena: false`).
- **Crear y renombrar iglesias** (versión mínima; solo con `pieb_cancionero_central`, 403 si no). `POST /iglesias` con
  `{ nombre }` (obligatorio, máx. 80 caracteres) crea la iglesia y añade a quien la crea como `admin` en su meta
  `_pieb_iglesias` (partiendo de la pertenencia que ya tenía deducida, para no perderla). Responde como `GET /iglesias` más
  `creada: id`. `POST /iglesias/{id}` con `{ nombre }` la renombra y responde el estado. Al existir una segunda iglesia,
  quien solo tenía `pieb_cancionero_gestionar` deja de ser central (`pieb_can_es_central()`).
- **Cultos por iglesia y privados.** Meta `_pieb_privado` (`'1'` = privado; si no, no existe). **El filtro vive en una única
  función, `pieb_can_culto_visible($post, $user_id = 0)`** (`includes/cultos.php`): un culto es visible si su iglesia
  (`pieb_can_culto_iglesia()`) es la activa del usuario **y** (no es privado **o** su `post_author` es el usuario). Todo
  lo que lee o cambia cultos pasa por ella: `GET /cultos` (consulta por `_pieb_iglesia` con `pieb_can_cultos_meta_iglesia()`
  y después la función), `GET/POST/DELETE /cultos/{id}` y `POST /cultos/{id}/privacidad` (vía `pieb_can_rest_culto_get()`,
  que responde **404** «El culto no existe» y nunca 403, para no revelar que existe) y la base de `GET /escaleta`
  (`pieb_can_escaleta_ultima()` solo mira cultos visibles). Quien añada una vía nueva que lea cultos debe usarla.
  Al crear, cualquiera puede marcar `privado`; al editar solo lo cambia el autor (de otra persona se ignora). Borrar un culto
  nunca envía aviso (los avisos son de canciones). `pieb_can_culto_resumen()` añade `privado` y `mio` (el autor es el usuario).
- **En una canción se añade, no se destruye (fase 3).** Las canciones siguen siendo comunes, pero **solo con más de una
  iglesia** (`pieb_can_proteccion_activa()`, en `includes/iglesias.php`): cualquiera puede **añadir** a una canción, y nadie
  cambia ni quita lo que añadió otra persona. **Con una sola iglesia la protección no se aplica y todo funciona como siempre**
  (cualquiera del equipo edita cualquier cosa; borra la canción quien la subió o quien gestiona). «Central» =
  `pieb_can_es_central()`; «creador» = `post_author` de la canción. Cada permiso se decide en **una única función**
  (`includes/canciones.php`), que usan el guardado y la API:
  - `pieb_can_puede_elemento($elemento, $post)`: partituras, audios, editables y enlaces de YouTube. Añadir, cualquiera;
    cambiar sus datos o quitarlos, su `autor` (el de la canción si falta) o el central.
  - `pieb_can_puede_ordenar($post)`: el orden de las partituras (la primera es la principal), solo el creador o el central.
    Para los demás se conserva el orden actual y sus partituras nuevas van al final.
  - `pieb_can_puede_campo($campo, $post)`: `titulo`, `numero`, `autor`, `tonalidad`, `tempo`. Un campo **vacío** lo rellena
    cualquiera; uno con valor lo cambia quien lo rellenó, el creador o el central. Quién rellenó cada campo se guarda en la
    meta `_pieb_campos_autor` = `{ campo: idUsuario }` (se actualiza cada vez que un campo cambia de valor, también con una
    sola iglesia; un campo que no figura cuenta como rellenado por el creador).
  - `pieb_can_puede_letra($post)`: sin letra (ni `_pieb_letra` ni `_pieb_letra_html`), cualquiera la añade; con letra, solo el
    creador o el central.
  - `pieb_can_puede_borrar_cancion($post)`: con la protección activa, el creador o el central; si no,
    `pieb_can_usuario_puede_borrar()` (autor o `pieb_cancionero_gestionar`), que es también la regla de los **cultos** y no cambia.
  - Las etiquetas son por iglesia (fase 4b, ver «Etiquetas por iglesia y universales»). Notas, tonalidad habitual, partitura principal y audios: ver «Datos por iglesia (fase 4a)».

  **El servidor fusiona, no rechaza.** `POST /canciones/{id}` sigue siendo un multipart que «reemplaza todo», pero con la
  protección activa conserva lo que quien guarda no puede cambiar, venga lo que venga en la petición (un cliente antiguo o una
  carga masiva que omita datos ya no los destruye): un elemento ajeno se conserva tal cual está guardado
  (`pieb_can_fusionar_elementos()`), un campo o la letra ajenos conservan su valor y el título ajeno no se cambia. Nada de esto
  es un error. «El título es obligatorio» y «al menos una partitura» (que cuenta también las ajenas conservadas) siguen igual.
  La importación de copias de seguridad y la Subida múltiple no cambian de formato.

  **API.** `GET /canciones/{id}` devuelve siempre (con o sin protección): `protegida` (bool); en cada elemento de `partituras`,
  `audios`, `editables` y `youtube`, `mio` (quien pregunta puede cambiarlo o quitarlo; siempre `true` sin protección) y
  `autorNombre` (nombre del autor, `''` si el usuario ya no existe); y `permisos`:
  `{ campos: { titulo, numero, autor, tonalidad, tempo, letra }, ordenar, borrar }` (booleanos; un campo vacío es siempre
  `true`). `puedeBorrar` es `permisos.borrar`. `DELETE /canciones/{id}` aplica la regla nueva (403 si no).
- **Datos por iglesia (fase 4a).** Las canciones son comunes, pero cuatro datos son de cada iglesia. **Con una sola iglesia
  todo se guarda y se comporta como siempre** (sin `_pieb_ig_*`, la habitual es la original, las notas siguen en `_pieb_notas` y
  todos los audios se ven).
  - **Tonalidad.** `_pieb_tonalidad` es la **original** (común; es la que edita el campo `tonalidad` de `POST /canciones/{id}`).
    La **habitual** de una iglesia (`pieb_can_tono_habitual($post_id, $iglesia_id = 0)`) es la `tonalidad` de su
    `_pieb_ig_{id}` si no está vacía y coincide (`pieb_can_tono_clave`) con alguna de las tonalidades en que hay partitura; si no,
    la original. **La tonalidad vacía de una partitura sigue significando «la original»** (`pieb_can_tono_efectivo($partitura,
    $original)` y la normalización al guardar no cambian; no hay migración). `pieb_can_tonalidades()` ordena con la habitual de
    la iglesia activa primero. La API: `tonalidad` = la habitual de la iglesia activa y `tonalidadOriginal` = `_pieb_tonalidad`
    (resumen y ficha). En los cultos, la tonalidad efectiva de un item es la suya o, si está vacía, la habitual de la iglesia
    del culto (`datos.tonalidad`, y `datos.tonalidadOriginal`); las partituras del item se filtran comparando la efectiva de cada
    una (calculada con la original) con la del item.
  - **Partitura principal.** Si la `principal` de la iglesia activa es una partitura que la canción aún tiene,
    `pieb_can_partituras_iglesia()` la pone la primera (ficha, y miniatura y `variantes` del resumen); el guardado de la
    canción no usa esta función, así que no altera el orden que fijó quien la creó. En un culto manda la partitura elegida para él.
  - **Notas.** `notas` de la API son las de la iglesia activa (`pieb_can_notas()`/`pieb_can_notas_guardar()`); las edita cualquier
    miembro con el `notas` de `POST /canciones/{id}`. La iglesia por defecto usa `_pieb_notas`; las demás, `notas` de
    `_pieb_ig_{id}`. La copia de seguridad sigue exportando e importando `_pieb_notas` (las de la iglesia por defecto).
  - **Ficha.** `iglesiaDatos` = `{ tonalidad (cruda, '' = la original), principal, puedeEditar }` (`puedeEditar` =
    `pieb_can_es_admin_iglesia()`: central o rol `admin` en la iglesia activa) y, en la raíz, `puedeUniversal`.
  - **Audios por iglesia y universales.** Cada audio lleva `iglesia`; con `universal: 1` lo ven todas. **Una sola función decide
    quién lo ve: `pieb_can_audio_visible($audio)`** (sin protección, siempre; con ella, universal o de la iglesia activa del
    usuario). La ficha solo devuelve los visibles, y cada uno con `universal`, `iglesiaNombre` y `mio` según
    `pieb_can_puede_audio()` (universal: solo el central; si no, su autor, la administración de la iglesia del audio o el
    central); el contador `audios` del resumen cuenta solo los visibles. Al guardar la canción, los audios de otras
    iglesias y los que no puede cambiar se conservan tal cual (`pieb_can_fusionar_elementos()` con `pieb_can_puede_cambiar_audio()`);
    `universal` nunca se acepta del cliente (se conserva el que tenía) y los audios nuevos llevan la iglesia activa.
  - **Entrega del archivo** (`?pcan_archivo=ID`): con varias iglesias, un audio solo se entrega si es universal, si quien pide
    es central o si **pertenece** a la iglesia del audio (`pieb_can_rol_en`; es una dirección directa, sin cabecera de iglesia
    activa); si no, responde 404 «Archivo no encontrado». Un audio que ninguna canción lista (huérfano) solo lo recibe el central.
    Partituras y editables no cambian.
  - **Otros sitios que leen audios.** La copia de seguridad exporta todos los audios solo al central (a los demás, los visibles);
    «archivos sin usar» y el borrado definitivo de una canción cuentan todos los audios (ninguno de otra iglesia se considera
    huérfano); el aviso de borrado y la papelera (para el central) no cambian.
- **Etiquetas por iglesia y universales (fase 4b).** `includes/etiquetas.php`. **Con una sola iglesia nada cambia ni se guarda
  distinto** (`pieb_can_proteccion_activa()` falso: todo es visible, no se escribe ninguna meta y se asigna con
  `wp_set_object_terms` por nombre, como siempre). Con varias, cada etiqueta (término de `pieb_etiqueta`) es de una iglesia o
  universal:
  - **Metas del término.** `_pieb_iglesia` (ID de la iglesia dueña; si falta, la iglesia por defecto, así que las etiquetas
    anteriores no se migran; para la iglesia por defecto no se escribe) y `_pieb_universal` (`'1'`). El color sigue en `pieb_color`.
  - **Visibilidad.** Una única función, `pieb_can_etiqueta_visible($term, $activa = 0)`: universal, o de la iglesia activa.
  - **Nombres repetidos.** Dos iglesias pueden tener una etiqueta con el mismo nombre (términos distintos; el de una iglesia que
    no es la de por defecto lleva el slug `nombre-ig{id}`). Por eso con protección activa todo se resuelve por ID de término
    dentro de un ámbito (`pieb_can_etiqueta_buscar()`, `pieb_can_etiqueta_universal_buscar()`, `pieb_can_etiqueta_obtener()`),
    nunca por nombre a ciegas.
  - **Asignar** (`pieb_can_etiquetas_fijar($post_id, $nombres)`; lo usan el guardado de la canción, `POST /canciones/etiquetar`
    y la importación de copias). Resultado = los términos que la canción tiene y quien guarda no ve (se conservan siempre) +
    las universales (el central pone las de la lista; quien no lo es conserva las que la canción ya tenía y no puede ponerlas
    ni quitarlas) + un término de la iglesia activa por cada nombre restante (se crea si no existe; el central, con un nombre
    que coincide con una universal, usa esa).
  - **API.** Resumen y ficha: `etiquetas` = nombres visibles y `etiquetasUniversales` = los de ellas que son universales (`[]`
    sin universales). `GET /etiquetas`: `{ nombre: color }` de las visibles (si coinciden, gana la universal).
    `GET /etiquetas/universales`: `{ etiquetas: [{ nombre, color }] }` por nombre. `POST /etiquetas/universales` con
    `{ nombre, universal: bool }` (solo el central y con varias iglesias; 403 si no; responde como el `GET`): `true` marca como
    universal la etiqueta de la iglesia activa con ese nombre (o crea una) y **fusiona** en ella las del mismo nombre de las
    demás iglesias (reasigna sus canciones y borra esos términos); `false` devuelve la universal a la iglesia activa (404 si no
    existe; si esa iglesia ya tenía otra igual, las fusiona). `POST /canciones/etiquetar` mantiene su formato (cada canción
    del resultado añade `etiquetasUniversales`); para quien no es central, poner o quitar una universal se ignora.
  - **Copias de seguridad.** La exportación da las etiquetas visibles para quien exporta; la importación usa
    `pieb_can_etiquetas_fijar()`.
- **Pendiente (fases siguientes).** Las copias de seguridad (`includes/ajustes.php`) siguen exportando e importando los cultos
  de toda la instalación, privados incluidos y sin la iglesia; la fase 5 las adaptará.

## Bienvenida al equipo

`includes/bienvenida.php`. A quien se añade a la lista de correos del equipo se le puede enviar un correo que le explica
cómo entrar. Su botón **«Entrar al cancionero»** lleva un enlace de acceso personal (`pieb_can_bienvenida_enlace`): es el
mismo enlace mágico de `google.php` (transient `pieb_can_enlace_*`, un solo uso, pantalla con «Entrar» para que los
filtros antispam no lo gasten), pero vale `PIEB_CAN_BIENVENIDA_DIAS` (7) días en vez de 15 minutos, y cada bienvenida
anula el botón de la anterior al mismo correo. El correo también explica cómo entrar más adelante (abrir la página,
escribir el correo y pulsar el enlace que llega) y, si el acceso con Google está configurado, que puede usar su botón. A
las cuentas de administración (que solo reciben la prueba) el botón les abre la página sin enlace de acceso.

**Aspecto de los correos** (`includes/correo.php`). La bienvenida y el enlace de acceso comparten aspecto: cabecera con
el logo y tarjeta blanca con título, texto, botón y notas (`pieb_can_correo_*`). Es HTML para clientes de correo (tablas,
estilos en línea, 600 px como máximo, sin `<style>`; la imagen de cabecera `assets/correo-cabecera.jpg` va incrustada en el correo,
`cid:pcan-cabecera`, porque Gmail no la muestra si no puede descargarla de la web) más una versión de texto plano que se
pone como `AltBody`. Las dos cosas se hacen en `phpmailer_init` solo durante el envío; si el servicio de correo no pasa
por ese gancho, la imagen queda enlazada por su dirección absoluta (`pieb_can_correo_enviar`). Los dos se componen
dentro de `pieb_can_en_idioma_del_sitio()`: van en el idioma del sitio. Las cuentas
de administración de WordPress no reciben bienvenida (entran con contraseña).

**Ajustes nuevos** (en `pieb_can_ajustes`): `bienvenida_auto` (bool, `true` por defecto: enviarla automáticamente a quien
entra en la lista), `bienvenida_texto` (texto opcional del administrador que se añade al correo, máx. 1000 caracteres) y
`pagina` (dirección de la página del cancionero; la interfaz la envía como `pagina` = `location.origin +
location.pathname + location.search` en cada guardado y en cada envío, y solo se guarda si es una dirección válida de
esta web; se le quitan el fragmento y la consulta, salvo `page_id` o `p`, que con enlaces permanentes simples son la
propia página). Para los correos se usa la `pagina` de la petición si es válida, si no la guardada y, si tampoco, la portada
(`home_url('/')`). La restauración de una copia de seguridad incluye `bienvenidaAuto` y `bienvenidaTexto` (solo si la
copia los trae) y **nunca envía bienvenidas**.

**`GET /ajustes`** devuelve además `bienvenidaAuto` (bool), `bienvenidaTexto` (string), `pagina` (string, la guardada;
vacía si aún no se conoce) y, en cada elemento de `miembros`: `bienvenida` (marca de tiempo Unix del último envío a ese
correo, 0 si nunca) y `puedeBienvenida` (bool: no es cuenta de administración y tiene acceso).

**`POST /ajustes`** acepta además `bienvenidaAuto`, `bienvenidaTexto` y `pagina` (cada uno solo si llega) y su respuesta es
la de `GET` más `bienvenidaPendiente`: el array de correos a los que la interfaz debe enviar ahora la bienvenida
automática (ver abajo).

**`POST /bienvenida`** (exige `pieb_cancionero_gestionar`). Parámetros: `emails` (array; **máximo 10** por petición, si no
error 400), `pagina` (opcional) y `prueba` (bool). Con `prueba` envía la bienvenida solo al usuario actual (aunque sea una
cuenta de administración, para que vea cómo queda) y sin registrarla; puede llevar `bienvenidaTexto` para probar el
texto que se está escribiendo antes de guardarlo. Sin `prueba`, para cada correo: cuenta de
administración → `omitidos`; no está en la lista del equipo → `omitidos`; más de 3 bienvenidas por hora a ese correo
(`pieb_can_limite`) → `omitidos`; `wp_mail` falla → `fallidos`; si va bien → `enviados` y se anota en el registro.
Respuesta: `{ enviados: [correo], fallidos: [{email, motivo}], omitidos: [{email, motivo}], momento }`, con `momento` la
hora del servidor (Unix) para que la interfaz actualice «enviada el…» sin volver a pedir los ajustes.

**Registro:** la opción `pieb_can_bienvenidas` (correo → marca de tiempo del último envío, sin autoload) se actualiza tras
cada envío correcto (no en las pruebas) y evita repetir la automática.

**Bienvenida automática.** El servidor la *calcula* al guardar los ajustes y la *envía* la interfaz, por tandas:
1. `POST /ajustes` compara la lista de correos nueva con la anterior. Si `bienvenida_auto` está activo, devuelve en
   `bienvenidaPendiente` los correos que entran en la lista con ese guardado, nunca han recibido bienvenida (no están en
   el registro), no han entrado nunca (sin cuenta, o con cuenta sin `pieb_can_ultimo_acceso` ni `pieb_can_google_sub`) y no
   son cuentas de administración.
2. La interfaz envía esos correos llamando a `POST /bienvenida` de 5 en 5, con una barra de progreso. Así el guardado no
   espera a los envíos (cada `wp_mail` puede tardar un segundo con SMTP) ni hay tiempos de espera largos si se pegan 40
   correos de golpe.
3. Un reenvío manual o la prueba usan el mismo endpoint.

## Registro de accesos

`includes/accesos.php`. Para que quien administra vea en «Ajustes y equipo» cuándo entra cada persona y cómo se usa el
cancionero, el plugin guarda un historial mínimo. El servidor solo **registra y devuelve los datos en bruto**; las
estadísticas (entradas por semana, personas activas, métodos y dispositivos más usados…) las calcula la interfaz.

**Qué se guarda**, solo de quien tiene la capacidad `pieb_cancionero_acceso` (incluidos administradores y editores de
WordPress): fecha, método de acceso y tipo de dispositivo. **No** se guarda la IP ni el agente de usuario.

| Dato | Dónde | Contenido |
|---|---|---|
| Inicios de sesión | meta de usuario `pieb_can_accesos` | Lista, lo más nuevo primero, de `{t, m, d}`: `t` hora Unix; `m` método (`enlace`, `google` o `contrasena`); `d` dispositivo (`movil`, `tableta` u `ordenador`). |
| Días de uso | meta de usuario `pieb_can_dias` | Lista de días `Y-m-d` (zona horaria del sitio), lo más nuevo primero, en que la persona abrió el cancionero. |
| Último acceso | meta de usuario `pieb_can_ultimo_acceso` | Hora Unix del último inicio de sesión, sea cual sea el método. |
| Inicio del registro | opción `pieb_can_accesos_desde` (sin autoload) | Hora Unix de la primera anotación. La interfaz la usa para no presentar como «sin uso» lo que es anterior al registro. |

**Inicios de sesión.** `pieb_can_registrar_acceso` se engancha a `wp_login`. El método lo indican los manejadores de
`google.php` que inician la sesión por su cuenta (el enlace por correo y Google llaman a
`pieb_can_metodo_acceso('enlace'|'google')` justo antes de lanzar `wp_login`); si nadie lo indica, es el formulario de
WordPress (`contrasena`). El dispositivo se deduce del agente de usuario (`pieb_can_dispositivo_acceso`): tableta (iPad,
«Tablet», Android sin «Mobile»), móvil u ordenador. Los iPad modernos se presentan como Mac y cuentan como ordenador. En
cada inicio también se actualiza `pieb_can_ultimo_acceso`, así que «Ha entrado» en la lista del equipo funciona con
cualquier método.

**Días de uso.** Iniciar sesión no es usar el cancionero: con «recordarme» la sesión dura 14 días. Por eso
`pieb_can_registrar_dia` anota el día de hoy cada vez que alguien con sesión y acceso abre el cancionero (se llama desde
el shortcode); mira solo el primer día guardado, así que escribe como mucho una vez al día. No cuenta si el shortcode se
procesa en el escritorio o en la API REST (p. ej. al editar la página).

**Cuánto se conserva.** 12 meses (365 días); los inicios de sesión, además, 400 como mucho por persona. Lo más antiguo se
descarta al anotar. Las copias de seguridad **no** incluyen este registro.

**`GET /accesos`** (exige `pieb_cancionero_gestionar`). Respuesta:

```
{
  desde: int,       // pieb_can_accesos_desde (0 si aún no hay nada)
  ahora: int,       // hora del servidor (Unix)
  hoy: 'Y-m-d',     // día de hoy en la zona horaria del sitio
  personas: [{
    email, nombre,  // nombre = display_name o ''
    enLista: bool,  // está en la lista de correos del equipo
    esAdmin: bool,  // manage_options
    esGestor: bool, // como en `miembros` de GET /ajustes
    cuenta: bool,   // tiene cuenta de WordPress
    haEntrado: bool,  // ha entrado alguna vez, también antes del registro (Google o enlace)
    ultimoAcceso: int,  // el mayor entre el último inicio y pieb_can_ultimo_acceso; 0 si nunca
    accesos: [{ t: int, metodo: 'enlace'|'google'|'contrasena', dispositivo: 'movil'|'tableta'|'ordenador' }],
    dias: ['Y-m-d', …]  // lo más nuevo primero
  }]
}
```

`personas` son las mismas de `miembros` en `GET /ajustes` (`pieb_can_miembros`: correos de la lista, tengan o no cuenta, y
cuentas con los roles del cancionero) más cualquier otra cuenta con acceso que tenga algo registrado (p. ej. un
administrador de WordPress que entra al cancionero), ordenadas por correo.

## Escaleta del culto

`includes/escaleta.php`. La escaleta es la hoja impresa del orden del culto: cabecera con dos imágenes (logo y cabecera),
una fila de títulos («ORDEN DE CULTO · texto central · fecha») y una tabla de dos columnas con el nombre de cada sección en
mayúsculas (y una nota opcional debajo, en rojo) y su contenido. El servidor solo guarda, sanea y sirve los datos; el PDF
(`escaleta-AAAA-MM-DD.pdf`) lo genera el navegador (`P.escaletaPdf` en `cultos.js`), sin dependencias.

**Cada culto tiene su escaleta, y se prepara en el propio culto.** La configuración de la escaleta no es una tarea de
administración: el equipo la prepara en la pestaña Escaleta del editor del culto y solo afecta a ese culto. Allí se editan la
fila de títulos (`titulo`, `central`) y, con el botón «Editar secciones», toda la estructura (secciones con sus títulos y notas,
campos, tipos, etiquetas, letra pequeña, textos o valores por defecto, orden, añadir y quitar; el editor es
`P.crearEditorEscaleta` de `cancionero.js`, reutilizado en `cultos.js`). Con «Rellenar» se escribe el valor de cada campo. Al volver
de «Editar secciones» a «Rellenar» se conservan los valores de los campos que siguen existiendo (misma sección y mismo `id`
de campo) con el mismo tipo; los nuevos empiezan «sin tocar».

**Las canciones siguen al setlist mientras nadie las toque.** Al guardar, los textos por defecto pasan a ser valores
explícitos, pero los campos de canciones sin tocar se guardan con `valor: null`: así la escaleta se puede preparar antes de
elegir las canciones y se rellena sola (según el defecto de cada campo) cuando se añaden al setlist. Elegir una canción,
escribirla, ponerle una nota o marcar «Instrumental» fija el valor del campo. El botón «Rellenar con el setlist» devuelve todos
los campos de canciones a `null` (sirve para los cultos guardados antes de la 1.22.0, cuyos campos quedaron fijos).

**Base para un culto nuevo** (`GET /escaleta`). Un culto sin escaleta propia parte de la **última escaleta guardada en
cualquier culto** (`pieb_can_escaleta_ultima`: el culto con `_pieb_escaleta` modificado más recientemente): su estructura sin
valores y sin `oculta`, con su `titulo` y `central`, más el `logo` y la `cabecera` de la instalación y
`desde: { id, titulo }` (el culto de origen, que la interfaz nombra en una nota; `null` si no hay ninguna y sale de la plantilla).
Si no hay ninguna escaleta guardada, se usa la **genérica** del plugin (`pieb_can_escaleta_generica`: preludio, lectura y
oración, bienvenida, vida de comunidad, cantos, ofrenda, niños, predicación, las secciones opcionales post-sermón (id `respuesta`) y santa cena,
despedida, doxología y postludio; textos con `__()`, se arma al llamarla). La base se copia al culto al abrir su pestaña
Escaleta y se guarda con el culto; ahí las secciones con `opcional` empiezan con `oculta: true` («No incluir en este culto»).
`GET /escaleta` copia de cada sección su `opcional` y de cada campo su `modo`, y devuelve `version` (la de la escaleta de la que sale).

```
escaleta (de un culto): {
  titulo, central,                 // celda izquierda y celda central de la fila de títulos (vacío = «ORDEN DE CULTO» y celda vacía)
  version,                         // entero: 2 desde las secciones opcionales y las notas por canción (la genérica es 2; ausente = 0)
  secciones: [ {
    id, titulo, nota,
    opcional,                      // en la estructura: empieza oculta (oculta: true) en cada culto nuevo
    oculta,                        // no se imprime en este culto
    extra,                         // sin uso: todas las secciones se pueden editar; la interfaz lo deja en false
    campos: [ { id, tipo, etiqueta, pequeno, modo, defecto, valor } ]   // modo: solo en cancion/canciones
  } ]
}
```

**Versión de la escaleta.** `version` es un entero que se guarda con la escaleta del culto, con la plantilla y en la base que
devuelve `GET /escaleta` (copiada de la última escaleta; las anteriores no la traen y cuentan como 0). La interfaz (`cultos.js`,
`actualizarEscaleta`, al sanear tanto la escaleta de un culto como la base) pone al día las de versión menor que 2: marca
`modo: true` en el primer campo `cancion` de la sección `preludio`, inserta las secciones `respuesta` y `santa-cena` (si no hay ya
secciones con esos ids) justo tras `predicacion` (si no existe, antes de `despedida`; si tampoco, al final) con `opcional: true` y,
en la escaleta de un culto, `oculta: true` y valores `null`, y pone `version = 2`. Como la versión se guarda, lo que alguien borre
luego no vuelve a aparecer.

`GET /cultos/{id}` la devuelve en `escaleta` (objeto o `null`; no va en el listado de cultos, para no engordarlo) y `POST
/cultos/{id}` la acepta solo si llega (`null` la borra) y solo de quien tiene la capacidad `pieb_can_escaleta` (responsables de
escaleta y administradores; de los demás se ignora sin error). En la interfaz, el resto del equipo ve la pestaña Escaleta en
solo lectura (vista previa de la hoja y «Exportar escaleta»). Las escaletas guardadas antes de que cada culto llevara su fila de
títulos no traen `titulo` ni `central`: la interfaz toma los de la base al abrirlas y el PDF los de la base si faltan.

| `tipo` del campo | Qué es | `defecto` |
|---|---|---|
| `texto` | Una línea. | Texto inicial. |
| `textoLargo` | Varias líneas (cada una se imprime en la suya). | Texto inicial. |
| `cancion` | Una canción del culto o un nombre escrito a mano. | `primera`, `siguiente` (la que va justo después de la última asignada en las secciones anteriores) o `ninguna`. |
| `canciones` | Varias canciones del culto y/o nombres a mano. | `ninguna`, `siguiente` (una sola: la que va justo después de la última asignada en las secciones anteriores) o `restantes` (las que no están en ninguna otra sección). |

Con `etiqueta` se imprime «Etiqueta: valor»; `pequeno` imprime el valor en letra pequeña. `modo` (booleano, solo en `cancion` y
`canciones`; en otros tipos se guarda `false`): el campo pregunta si cada canción es cantada o instrumental, y al imprimir va tras
el nombre « (cantado)» o « (instrumental)» (sin cursiva). `valor`: `texto`/`textoLargo` → texto
(500 y 2000 caracteres como máximo); `cancion` → `{ cancion: id de canción | 0, nombre, nota, instrumental }` (0 + nombre = escrita
a mano; `nota` es un texto de una línea, 200 como máximo, que se imprime debajo de la canción en letra pequeña; `instrumental`
false = cantada y solo se usa si el campo tiene `modo`);
`canciones` → lista de lo mismo (100 como máximo; las entradas vacías se descartan); `null` en cualquier tipo = «aún sin
tocar»: la interfaz aplica el `defecto` al mostrar y al imprimir. El id de canción debe ser el de una canción que exista (si no,
pasa a 0 y se queda el nombre); el `nombre` se guarda también para las canciones del culto, por si luego se quitan del setlist
(sin nombre se usa el título).

**Saneado** (`pieb_can_escaleta_limpiar_*`): como mucho 30 secciones de 10 campos; los `id` ([a-z0-9-]) se limpian y se hacen
únicos (las secciones entre sí y los campos dentro de su sección); `titulo` y `central` de la fila de títulos 60 caracteres,
título de sección 60, nota 120, etiqueta 60 y defecto 500 (`opcional`, `modo`, `instrumental` booleanos con `rest_sanitize_boolean`,
`version` con `absint`); un campo de tipo desconocido se descarta; el defecto de las
canciones solo puede ser uno de los valores de la tabla.

**Identidad de la instalación** (opción `pieb_can_escaleta`, sin autoload; `GET`/`POST /ajustes`, clave `escaleta`, en Ajustes y
equipo → Escaleta). Es lo único de la escaleta que vale para todos los cultos: `logo` (arriba a la derecha) y `cabecera` (arriba a
la izquierda), como `{ id, url } | null` (en `POST` basta `{ id }` o `null`; sin la clave se conserva la imagen, y `POST` sin
`secciones`, `titulo` ni `central` conserva lo que hubiera). Deben ser el id de una imagen de la biblioteca de medios que no sea
un archivo privado del cancionero (si no, `null`) y se devuelven con `wp_get_attachment_image_url` (`url` absoluta; `null` si la
imagen ya no existe). El PDF toma siempre de aquí el logo y la cabecera; el título y el texto central, de la escaleta del culto.

**Imágenes.** `POST /escaleta/imagen` (multipart, campo `archivo`; JPG o PNG, máx. 2 MB; comprueba el contenido real) sube el
logo o la cabecera con `media_handle_sideload` a la biblioteca de medios **normal** (`uploads/AAAA/MM`), no a la carpeta
privada del cancionero: son el logo de la iglesia, no partituras, y pueden ser públicas (el filtro `upload_dir` de
`archivos.php` solo está activo dentro de `pieb_can_adjuntar`, que esta ruta no usa). Responde `{ id, url }`; la interfaz
guarda el `id` con «Guardar ajustes».

**Copias de seguridad.** La plantilla va en `ajustes.escaleta` solo si la instalación tiene una propia (la genérica no se
exporta: en otra web quedaría fija en el idioma de quien exportó) y **sin las imágenes** (`logo` y `cabecera` a `null`: sus ids
no valen en otra web). Al restaurar solo se aplica si la copia la trae y se conservan el logo y la cabecera que ya tuviera esta
web. La escaleta de cada culto va en `cultos[].escaleta` (solo si el culto tiene) con sus canciones identificadas por `uid`
(más `titulo` y `numero`) en lugar de por id, como los `items`, y conservan su `nota` e `instrumental`; al restaurar se buscan en
esta web igual que las del setlist y las que no estén se quedan con el nombre escrito a mano.

## Exportar letras

`assets/letras.js` (`P.exportarLetras(canciones, opciones)`, que se carga después de `cultos.js`) abre un diálogo para exportar
la letra de una canción (ficha de canción: «Exportar letra» y el botón «Exportar» de la sección Letra) o la de todo un setlist
(ficha del culto: «Exportar letras»). `canciones` es `[{ titulo, autor, numero, tonalidad, tempo, nota, letra, letraHtml }]` y
`opciones` `{ titulo, fecha, tipo, esSetlist, nombreArchivo }`. Parte de `P.letra.estrofas(c)` (ver `cancionero.js`): las canciones
sin letra se omiten y se avisa al terminar. Todo se genera en el navegador; la última elección de formato y de fondo se
recuerda en `localStorage`.

| Formato | Resultado |
|---|---|
| Hoja en PDF | pdf-lib, A4, Helvetica (n, b, i, bi) con negrita, cursiva y subrayado; secciones en mayúsculas de color de acento y estribillos con barra lateral; una estrofa no se parte entre páginas si cabe entera; en el setlist, las canciones van numeradas y la siguiente empieza en hoja nueva solo si quedan menos de ~140 pt. Se abre en una pestaña nueva (`P.pdf.abrirVentana` se llama en el propio clic) o se descarga. |
| Diapositivas en PDF | Páginas de 960×540 pt con la imagen de fondo a sangre. |
| PowerPoint (.pptx) | PptxGenJS 3.12.0, **cargada bajo demanda** desde jsDelivr (como pdf-lib). Un *slide master* por fondo distinto, así la imagen no se repite en cada diapositiva; el texto es editable (Arial, blanco, centrado). |
| OpenLyrics (.xml) | Versión 0.9, solo canción individual: `titles`, `authors`, `songbooks` (nombre de la instalación y número), `tempo`, `key` en notación inglesa, `verseOrder` y un `verse` por estrofa (`v1`, `c1`, `b1`, `p1`, `i1`, `e1`; partes `v1a`, `v1b` si una misma sección tiene varias estrofas seguidas; una estrofa repetida con el mismo texto reutiliza su nombre). Sin formato. |
| Texto (.txt) | Título y estrofas separadas por una línea en blanco, sin nombres de sección; en el setlist, canciones separadas por dos líneas en blanco. |

**Diapositivas (PDF y PowerPoint, misma estructura).** Por canción, una de título (título, autor y, en el setlist, la nota del
culto) y una por estrofa. Una estrofa de más de 6 líneas se parte en trozos equilibrados de 5 líneas o menos; el nombre de la
sección va pequeño arriba. El tamaño de letra es el mayor (entre 26 y 60 unidades de una hoja de 960×540) con el que la línea
más ancha cabe en el 86 % del ancho y el bloque en el 78 % del alto; si ni al mínimo cabe, se envuelve (en PowerPoint lo hace
el propio programa). Las utilidades de PDF de `cultos.js` (`cargarPdfLib`, `latin1`, `envolverTexto`, ventana de la pestaña) se
comparten en `P.pdf`.

**Fondos.** Imágenes que sube un administrador en Ajustes y equipo → Fondos de las letras (`includes/fondos.php`). Van a la
biblioteca de medios **normal** (no son partituras), no llevan las marcas `_pieb_*` (no salen en «Archivos sin usar» ni pasan a
la carpeta privada) y **no van en las copias de seguridad**, igual que las imágenes de la escaleta. En el diálogo se elige
«Al azar» (en un setlist, una imagen distinta por canción mientras haya), «Sin imagen» (fondo liso `#111827`) o una concreta. Al
exportar, cada imagen se recorta tipo *cover* a 1920×1080, se oscurece con una capa negra al 45 % y se guarda como JPEG 0,85
(se cachea por id dentro de una exportación).

## Papelera

`includes/papelera.php`. Borrar una canción (`DELETE /canciones/{id}`) la manda a la papelera de WordPress
(`wp_trash_post`) y guarda quién la borró (`_pieb_borrada_por`). Los administradores del cancionero la gestionan en
`#/papelera`: `GET /papelera` (lista con fecha, autor del borrado y días restantes), `POST /papelera/{id}/restaurar`
(vuelve publicada), `DELETE /papelera/{id}` (eliminar para siempre) y `POST /papelera/vaciar`. `GET /canciones/{id}`
también devuelve las borradas a quien gestiona (con `enPapelera` y `papelera`), y sus archivos solo se sirven a esos
usuarios.

Limpieza: el ajuste `papelera_dias` (30 por defecto; 0 = nunca) manda sobre la limpieza de WordPress (filtro
`pre_delete_post` durante `wp_scheduled_delete`) y hay una tarea diaria propia (`pieb_can_limpiar_papelera`). Al eliminar
una canción para siempre, por cualquier vía, `before_delete_post` borra también sus partituras, audios y editables.

## Aviso de canciones borradas

`includes/avisos.php`. Cuando alguien borra una canción desde el cancionero y esta queda en la papelera, los
administradores reciben un correo con la canción, sus archivos, quién la borró y cuándo.

**Ajuste.** `aviso_borrado` (bool, `true` por defecto, también en las instalaciones que ya existían). `GET /ajustes`
devuelve `avisoBorrado` (bool) y `correoAdmin` (el `admin_email` de WordPress, que la interfaz muestra en la ayuda de la
casilla); `POST /ajustes` acepta `avisoBorrado` (solo si llega). La copia de seguridad lo incluye y la restauración lo
aplica solo si la copia lo trae. La casilla está en «Ajustes y equipo → General», en el cuadro «Papelera».

**Cola y envío agrupado.** `pieb_can_rest_borrar` llama a `pieb_can_aviso_borrado_encolar()` cuando la canción ha quedado
en la papelera (si WordPress la elimina directamente porque `EMPTY_TRASH_DAYS` es 0, no hay aviso). Si el aviso está
activo, añade a la opción `pieb_can_avisos_borrado` (sin autoload) una foto tomada en ese momento, porque si luego la
canción se elimina para siempre sus datos y archivos ya no existirían: `{id, titulo, numero, tonalidad, archivos, por:
{id, nombre, email}, cuando}`, con `archivos` los nombres de archivo de partituras, audios y editables (o el título del
adjunto si el archivo ya no está). Después programa el evento `pieb_can_enviar_avisos_borrado` un minuto más tarde
(`wp_schedule_single_event`) si no hay ya uno: el borrado múltiple de la interfaz hace un `DELETE canciones/{id}` por
canción, seguidos, y así todo llega en **un solo correo**. Depende del cron de WordPress, que se dispara con las visitas a
la web (con `DISABLE_WP_CRON` hace falta un cron del sistema que llame a `wp-cron.php`). El manejador toma la cola y la
**vacía antes de enviar**, para no repetir nada si el envío falla; si el aviso se desactivó entretanto, la descarta.

**Destinatarios y correo.** Reciben el aviso los correos de la lista `administradores` de los ajustes y el correo de
administración de la web (`admin_email`), sin repetir. A cada uno se le quitan las canciones que borró él mismo (ya lo
sabe) y, si no le queda ninguna, no se le envía nada. Es un correo por destinatario, compuesto dentro de
`pieb_can_en_idioma_del_sitio()` y enviado con `pieb_can_correo_enviar()` con el aspecto común de `includes/correo.php`: un
recuadro por canción (título con número de himnario y tonalidad, quién la borró y cuándo, archivos), una nota con lo que
tarda en eliminarse de la papelera (`papelera_dias`) y un botón a `#/ajustes/papelera`. Más de 40 canciones en un mismo
correo se resumen con una línea «Y N canciones más» (Gmail recorta los correos muy largos).

## Archivos privados

`includes/archivos.php`. Todo lo que sube el plugin va, mediante el filtro `upload_dir`, a
`uploads/cancionero-privado/` (con `.htaccess` y `index.php`). Se sirve en `/?pcan_archivo=ID[&t=thumbnail|medium|large][&descargar=1]`
(`pieb_can_servir_archivo`, en `init`): exige sesión y la capacidad `pieb_cancionero_acceso`, comprueba que el adjunto
es del cancionero (`_pieb_partitura`, `_pieb_audio`, `_pieb_editable` o hijo de una canción), admite peticiones parciales
(`Range`) y responde con `Cache-Control: private`. Los editables siempre se entregan como descarga. No se usa la API REST
porque `<img>`, `<audio>` e `<iframe>` no pueden enviar el nonce.

Las direcciones que ve la interfaz (`url`, `miniatura`) las genera `pieb_can_url_archivo()` / `pieb_can_url_miniatura()`;
**no usar `wp_get_attachment_url()`** para archivos del cancionero. Los archivos anteriores a la 1.5.0 se mueven con
`POST /archivos/proteger` (tandas de 50; `GET /archivos/estado` informa de pendientes y de si el servidor entrega
la carpeta sin sesión: `protegido`, `expuesto` o `desconocido`). Ambas rutas requieren `pieb_cancionero_gestionar`.

## Subida múltiple

`#/subir`: el usuario arrastra archivos; el título, el número de himnario y la tonalidad se deducen del nombre
(`datosDesdeArchivo` en `cancionero.js`). Algunos patrones: `051 - Cristo coronad.pdf` → 51 · Cristo coronad;
`Todas las promesas 13 A.pdf` → 13 · Todas las promesas · La; `Cuán grande es Él - Sib.pdf` → tonalidad Sib. La
tonalidad se acepta en notación americana (`F#m`, `Bb`) o española y se guarda en española. Cada archivo se sube por
trozos y crea una canción (`youtube` vacío). Un botón quita de la lista las que ya existen.

## Traducciones

Dominio de texto `pieb-cancionero`, archivos en `pieb-cancionero/languages/` (cabecera `Domain Path`). El **idioma base es
el español**: los textos del código están en español y sin archivo de traducción se ve en español, sea cual sea el
idioma de WordPress. Cada idioma añade un `.po` (lo que edita el traductor), su `.mo` (PHP) y un `.json` por archivo
JavaScript. Cómo traducir: [traducir.md](traducir.md).

- **Idioma de cada usuario** (`includes/ajustes.php`): la meta de usuario `pieb_idioma` ('' = el del sitio) se elige
  en el menú de la cuenta y se guarda con `POST /preferencias` (`idioma`). Los idiomas ofrecidos son el español más cada
  `pieb-cancionero-<locale>.mo` de `wp-content/languages/plugins/` o de `languages/` del plugin
  (`pieb_can_idiomas_disponibles`). `pieb_can_idioma()` calcula el locale
  efectivo con respaldo por idioma: si no hay archivo para `en_GB` se usa `en_US`; si no hay ninguno de esa lengua, el
  español base. Solo afecta al dominio `pieb-cancionero`, mediante los filtros `plugin_locale` (para el `.mo`, también en
  las peticiones REST, así que los errores de la API salen en el idioma del usuario) y `load_script_translation_file`
  (cambia el locale del nombre del JSON que WordPress busca). Los correos (el enlace de acceso y la bienvenida) se envían
  en el idioma del sitio (`pieb_can_en_idioma_del_sitio`). Se leen las dos carpetas (la del sistema, donde guardan Loco Translate
  «System» y translate.wordpress.org, y la del plugin) y la del sistema tiene preferencia, tanto para el `.mo`
  (`load_plugin_textdomain` ya la mira primero) como para los `.json` (el filtro los busca primero allí).
- **JavaScript:** `wp-i18n` con `wp_set_script_translations()` para `cancionero`, `cultos`, `visor` y `login`. Cada JSON
  se llama `pieb-cancionero-<locale>-<md5 de "assets/archivo.js">.json`, formato Jed. La configuración `PIEB_CANCIONERO`
  lleva `idioma` (BCP 47, para `Intl`: fechas y números), `idiomas`, `notacion` y `idiomaElegido`/`notacionElegida`.
- **Notación de las tonalidades:** lo guardado no cambia nunca (`Sol`, `Mib`, `La m`). La meta `pieb_notacion` (`latina` o
  `americana`; `POST /preferencias`, `notacion`) decide cómo se muestran. No depende del idioma que elige cada persona:
  si aún no ha elegido, se usa la del idioma de la web (Do-Re-Mi en español, C-D-E en los demás). En JavaScript, `tonoVer()` (expuesta a los demás archivos como `P.tono()`)
  convierte al mostrar y `tonoGuardar()` al guardar; hay que usarlas siempre que se muestre o se edite una tonalidad.
- **Convenciones para quien programe:** todo texto visible va en `__()`, `_n()`, `_x()`, `esc_html__()`… con el dominio
  `'pieb-cancionero'` y en español. Nada de concatenar frases: usar marcadores (`sprintf(__('%1$s de %2$s', …), …)`,
  numerados si hay más de uno) y `_n()` para los plurales. Un comentario `/* translators: … */` justo antes de la llamada
  explica cada marcador o la ambigüedad (pasa al `.pot`). En JS, `__`, `_n`, `_x` y `_nx` son atajos de `cancionero.js`
  (los demás archivos los usan como `P.__`…) que ya llevan el dominio, así que se omite. Solo se extraen literales
  entre comillas. Después: `python herramientas/i18n.py extraer` y `compilar`. Los datos del equipo (títulos, etiquetas,
  tipos de culto ya guardados) no se traducen; las sugerencias predefinidas y los nombres de los roles sí.

## Temas

Variables CSS `--pc-*` por tema: `colores` (por defecto), `pentagrama`, `sitio` (sigue el tema de WordPress), `pulso`,
`claro` (Estudio), `escenario`, `papel` (Partitura). El tema se fija en `data-pcan-theme` y el estilo extra en
`data-pcan-estilo`. El banco de pruebas acepta `?tema=`, `?idioma=` y `?notacion=`.

## Caché de la página

Con sesión, la página del cancionero lleva datos de cada persona (tema, idioma, notación y la clave de la API en
`PIEB_CANCIONERO`): `pieb-cancionero.php` la marca como no cacheable en `template_redirect` (`DONOTCACHEPAGE`,
`nocache_headers()`, la cabecera `X-LiteSpeed-Cache-Control: no-cache` y la acción `litespeed_control_set_nocache`), y
`POST /preferencias` lanza `litespeed_purge_private_all` para borrar la copia privada de LiteSpeed de esa persona. Sin
esto, tras cambiar una preferencia se seguía sirviendo la página anterior. La pantalla de acceso (sin sesión) sí puede
guardarse en caché.
