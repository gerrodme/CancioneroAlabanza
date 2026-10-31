# Contexto del proyecto (para retomar el trabajo)

Plugin de WordPress **Cancionero**: herramienta para que cualquier grupo gestione sus partituras. Autor: Gerson
Rodrigo Menéndez. Léase junto con [README.md](README.md) y [docs/arquitectura.md](docs/arquitectura.md).
Idioma de la interfaz, de los comentarios del código y de los mensajes de commit: **español**.

## Principios del proyecto

- El repositorio es **solo la solución**. Nunca incluir partituras, audios, listas de canciones ni datos de ninguna
  instalación concreta (ni URLs, ni recuentos, ni nombres de personas o grupos). Software libre: código
  GPL-2.0-or-later, documentación CC BY-SA 4.0.
- El contenido vive en cada WordPress, no en el repo. La URL de la instalación piloto se pregunta al usuario cuando
  haga falta; si está tras un acceso protegido, el usuario inicia sesión él mismo (nunca teclear credenciales).

## Nombre

El producto se llama simplemente **Cancionero** y cada instalación puede ponerle su propio nombre (Ajustes y equipo →
General; opción `nombre`). El prefijo interno `pieb` (`pieb_cancion`, `_pieb_*`, `pieb/v1`, `pieb_can_*`, carpeta
`pieb-cancionero/`) es un identificador técnico heredado: **no se renombra** para no romper datos ya guardados. Una
renombrada completa exigiría una migración de datos.

## Estructura rápida

- `pieb-cancionero/` plugin: `pieb-cancionero.php` (arranque, roles, shortcode, página sin caché con sesión),
  `includes/` (PHP: `canciones`, `rest`, `archivos`, `papelera`, `cultos`, `ajustes` (ajustes, equipo, preferencias,
  copias de seguridad), `google` (Google y enlace mágico), `correo` (aspecto común de los correos), `bienvenida`,
  `accesos`, `avisos` (aviso de borrado), `escaleta` (hoja impresa del culto), `migracion`), `assets/` (`cancionero.js`
  interfaz principal sin dependencias, con Ajustes y equipo; `cultos.js` cultos, estadísticas, PDF del setlist y de la
  escaleta; `visor.js` modo culto; `login.js`; `cancionero.css`; imágenes `correo-cabecera.jpg`, `icono.png`,
  `logo-cancionero.png`). Qué hace cada pieza, con su API y sus datos: [docs/arquitectura.md](docs/arquitectura.md).
- `banco-pruebas/` interfaz con datos simulados (`index.html`); `.claude/launch.json` define el servidor
  `banco-cancionero` (puerto 8765) para verla.
- `docs/imagenes/logo/` logo (SVG y PNG, versión para fondo oscuro y claro, e icono): letras de la tipografía Unbounded
  Black pasadas a trazos (con la «E» enderezada) en los colores del vídeo. La cabecera del correo de bienvenida es
  `pieb-cancionero/assets/correo-cabecera.jpg` (el logo sobre fondo de neón, 1200×360).
- `docs/imagenes/` capturas del README, hechas con el banco de pruebas por `herramientas/capturas.py` (datos y partitura inventados; nunca
  capturar datos ni partituras reales). `social-preview.png` es la imagen para compartir el repositorio (se sube a mano en GitHub).
- `herramientas/empaquetar.py` genera `dist/pieb-cancionero-<versión>.zip` (la versión va al final del nombre del archivo);
  `i18n.py` gestiona las traducciones; `comprobar_php.py` revisa que paréntesis y llaves del PHP cuadren (no hay PHP).
- Fuera del repositorio (en `.gitignore`): `dist/` (zips y material de la instalación piloto, como mu-plugins o imágenes
  de su escaleta) y `video/` (vídeos promocionales hechos con Remotion y voz de ElevenLabs; material local, no se sube).

## Cómo trabajar

- **Sin PHP local** (en el equipo original): el PHP se revisa leyendo, con `python herramientas/comprobar_php.py`, y lo
  prueba el usuario en WordPress. CSS y JS sí se verifican en el banco de pruebas (`preview_start banco-cancionero` y
  abrir `/banco-pruebas/index.html#/canciones`); cada función nueva añade su simulación en el `fetch` falso de
  `banco-pruebas/index.html`. `node --check` comprueba la sintaxis de los JS.
- **Trucos del banco:** el navegador guarda en caché los JS/CSS (`?v=130` fijo): antes de recargar, pedir cada archivo con
  `fetch(url, {cache: 'reload'})`. Si las capturas del navegador integrado fallan (ventana oculta), usar Playwright con
  Edge desde Python (`chromium.launch(channel='msedge')`); los PDF se capturan con `expect_download` y se ven
  renderizándolos con `pymupdf`. Para mirar un PDF que pase el usuario, renderizarlo también con `pymupdf`.
- **Cada cambio publicable sube la versión** en `pieb-cancionero.php` (cabecera y `PIEB_CAN_VERSION`), se anota en
  `CHANGELOG.md`, se ejecuta `python herramientas/empaquetar.py` y se hace commit con el formato
  `Descripción corta en español (1.x.y)`. El usuario sube el zip a WordPress (Plugins → Subir plugin → Reemplazar).
- **Textos traducibles** (ver [docs/traducir.md](docs/traducir.md)): todo texto visible va con `__()`/`_n()` del dominio
  `pieb-cancionero` (en JS, los atajos de `P`, con marcadores y comentario `translators:`); las tonalidades siempre con
  `P.tono()`. Tras cambiar textos: `python herramientas/i18n.py extraer`, traducir `en_US.po` y `compilar` (el zip ya compila).
- **Flujo habitual:** una rama por función (`git switch -c nombre`), un commit por versión, el usuario prueba el zip en
  su WordPress y, cuando dice «fusiona y publica»: `git merge --ff-only` en `main`, borrar la rama, `git push` y
  Release en GitHub con el zip (`gh release create vX.Y.Z dist/….zip --target main --title "Cancionero X.Y.Z"
  --notes-file …`, notas en español y en inglés como las anteriores; `gh` está en `C:\Program Files\GitHub CLI\gh.exe`).
- **Subagentes:** el usuario prefiere que la programación la hagan agentes Sonnet. Cada encargo lleva el contrato de
  datos/API, qué archivos puede tocar cada uno (si van en paralelo) y que NO toquen `languages/`, la versión ni
  `CHANGELOG.md` ni hagan commit; después, desde la sesión principal, se revisa, se prueba en el banco, se traduce, se
  sube la versión y se hace commit.
- No hacer `git push` ni tocar ajustes de seguridad (p. ej. el bloqueo de archivos de Word) sin que el usuario lo pida.
- Preferencias del usuario: cambios pequeños y concretos; botones con texto claro (no solo iconos); acciones
  destructivas en rojo; barras de progreso siempre visibles.

## Seguridad de los archivos (importante)

Las partituras pueden tener derechos de autor: se guardan en `uploads/cancionero-privado/` y solo se entregan con sesión
(`?pcan_archivo=ID`, ver [docs/arquitectura.md](docs/arquitectura.md)). Nunca generar direcciones con
`wp_get_attachment_url()` para archivos del cancionero. Al probar cambios de subida o de URLs, comprobar en producción
con una ventana privada (sin sesión) que el archivo da 403.

## Operar sobre los datos sin programar el plugin

Todo lo que hace la interfaz está en la API REST (`/wp-json/pieb/v1/…`, ver arquitectura). Para tareas masivas
(rellenar tonalidad, tempo o YouTube; emparejar carpetas) se puede usar el **navegador integrado con la sesión del
usuario** y `fetch` desde la consola con `PIEB_CANCIONERO.api` y `PIEB_CANCIONERO.nonce`. Receta y trampas en
[docs/carga-masiva.md](docs/carga-masiva.md). Puntos críticos:

- Actualizar una canción es un `POST /canciones/{id}` **multipart que reemplaza todos los campos**: hay que reenviar
  todo lo existente o se pierde. Siempre comprobar después con un `GET`.
- Un navegador automatizado no puede subir archivos locales ni llamar a `localhost`: la subida de partituras la hace
  el usuario con **Subida múltiple**; después se completan los datos por API.
- Solo rellenar campos vacíos; no pisar datos del equipo.

## Lo que hay que saber de las instalaciones

- **Caché del alojamiento:** con LiteSpeed Cache o la CDN del alojamiento, una página personal guardada en caché hace
  que no cambien el idioma o la notación y que caduque la clave de la API. Por eso la página del cancionero se marca
  como no cacheable con sesión (ver arquitectura); si algo «no cambia» tras guardar, sospechar primero de la caché.
- **Correo:** los correos (enlace de acceso, bienvenida, aviso de borrado) usan `wp_mail`; la web necesita un SMTP
  (p. ej. FluentSMTP). La cabecera va incrustada en el correo porque Gmail no muestra imágenes que no puede descargar.
- **Código propio de una web** (redirecciones, arreglos de su tema…): nunca en el plugin; va en un mu-plugin aparte que
  se guarda fuera del repositorio y se sube a `wp-content/mu-plugins/` de esa web.
- **Escaleta:** cada culto parte de la última escaleta preparada; la estructura se edita en el propio culto y en
  Ajustes solo están el logo y la imagen de cabecera de la iglesia (las sube el usuario: un navegador automatizado no
  puede subir archivos).

## Ideas no hechas

Detectar duplicados desde la propia interfaz, completar tempos desde otras fuentes.
