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

- `pieb-cancionero/` plugin: `pieb-cancionero.php` (arranque, roles, shortcode), `includes/` (PHP: `canciones`, `rest`,
  `cultos`, `ajustes`, `google`, `migracion`), `assets/` (`cancionero.js` interfaz principal sin dependencias,
  `cultos.js`, `visor.js`, `login.js`, `cancionero.css`).
- `banco-pruebas/` interfaz con datos simulados (`index.html`); `.claude/launch.json` define el servidor
  `banco-cancionero` (puerto 8765) para verla.
- `herramientas/empaquetar.py` genera `dist/pieb-cancionero.zip`.

## Cómo trabajar

- **Sin PHP local** (en el equipo original): el PHP se revisa leyendo y se prueba en WordPress. CSS y JS sí se verifican
  en el banco de pruebas (`preview_start banco-cancionero` y abrir `/banco-pruebas/index.html#/canciones`).
- **Cada cambio publicable sube la versión** en `pieb-cancionero.php` (cabecera y `PIEB_CAN_VERSION`), se anota en
  `CHANGELOG.md`, se ejecuta `python herramientas/empaquetar.py` y se hace commit con el formato
  `Descripción corta en español (1.x.y)`. El usuario sube el zip a WordPress (Plugins → Subir plugin → Reemplazar).
- No hacer `git push` ni tocar ajustes de seguridad (p. ej. el bloqueo de archivos de Word) sin que el usuario lo pida.
- Preferencias del usuario: cambios pequeños y concretos; botones con texto claro (no solo iconos); acciones
  destructivas en rojo; barras de progreso siempre visibles.

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

## Ideas no hechas

Detectar duplicados desde la propia interfaz, completar tempos desde otras fuentes, publicar *Releases* con el zip.
