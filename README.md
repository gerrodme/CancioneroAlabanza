# Cancionero · PIEB Cancionero

Plugin de WordPress con el cancionero del equipo de Adoración y culto de la Tu iglesia: canciones con partitura,
letra, audios, tempo y YouTube; cultos con su setlist y modo culto para tocar en la tableta; estadísticas;
copias de seguridad; acceso del equipo con enlace por correo.

En producción: <https://tuweb.org/adoracion-y-culto/cancionero/>.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `pieb-cancionero/` | El plugin. La carpeta se llama como el plugin en WordPress. |
| `banco-pruebas/` | Página local con datos simulados para probar la interfaz sin WordPress. |
| `tutorial/` | Tutorial animado con locución (HTML autocontenido) y su vídeo MP4 (este no se versiona). |
| `docs/` | Guía para recuperar el cancionero en un WordPress nuevo. |
| `herramientas/` | Empaquetar el plugin y regenerar la locución y el vídeo del tutorial. |
| `dist/` | El `.zip` para subir a WordPress (no se versiona). |

## Publicar una versión

1. Cambia la versión en `pieb-cancionero/pieb-cancionero.php` (cabecera `Version:` y `PIEB_CAN_VERSION`).
   Así los navegadores descargan los CSS y JS nuevos.
2. `python herramientas/empaquetar.py` → `dist/pieb-cancionero.zip`.
3. En WordPress: **Plugins → Añadir nuevo → Subir plugin** y **Reemplazar el actual con el subido**.

Los cambios pequeños en archivos que ya existen también se pueden aplicar desde el editor de plugins de WordPress;
los archivos nuevos solo llegan con el zip.

## Probar en local

- **Banco de pruebas:** configuración `banco-cancionero` de `.claude/launch.json` (sirve la raíz del repositorio en
  `http://127.0.0.1:8765`) y abre `/banco-pruebas/index.html`. Admite `?tema=sitio|pulso|claro|escenario|papel`.
  Las subidas de archivos no se pueden probar aquí: hace falta WordPress.
- No hay PHP en este equipo: el código PHP se revisa a mano y se prueba en el WordPress real.

## Tutorial

`tutorial/tutorial-cancionero.html` lleva la locución incrustada. Para regenerarla o rehacer el vídeo
(`pip install -r herramientas/tutorial/requirements.txt`, Edge y ffmpeg instalados):

1. `python herramientas/tutorial/grabar_locucion.py` (voz neuronal Elvira; solo envía el texto del guion).
2. `python herramientas/tutorial/incrustar_locucion.py`
3. Con el banco de pruebas en marcha: `python herramientas/tutorial/grabar_video.py`
4. `python herramientas/tutorial/montar_video.py` → `tutorial/tutorial-cancionero-1080p.mp4`

## Datos del cancionero

El contenido (canciones, partituras, cultos, ajustes) vive en WordPress, no en este repositorio. Para guardarlo o
llevarlo a otra web: menú de la cuenta → **Copias de seguridad** (solo administradores). Ver `docs/`.
