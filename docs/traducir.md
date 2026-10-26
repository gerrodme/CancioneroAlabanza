# Traducir el Cancionero a otro idioma

*English version: [translate.en.md](translate.en.md)*

El Cancionero ya viene en **español** (idioma base) e **inglés**, y cualquiera puede añadir otro idioma sin tocar el
código. Cada persona elige su idioma en el menú de su cuenta (**Idioma**), y por defecto se usa el de WordPress.

## Qué hay en `pieb-cancionero/languages/`

| Archivo | Para qué sirve |
|---|---|
| `pieb-cancionero.pot` | La **plantilla**: todos los textos del plugin, en español, sin traducir. Es el punto de partida de un idioma nuevo. |
| `pieb-cancionero-<locale>.po` | Lo que **edita el traductor** (p. ej. `pieb-cancionero-en_US.po`, `pieb-cancionero-pt_BR.po`). Texto original y traducción, con comentarios para el traductor. |
| `pieb-cancionero-<locale>.mo` | El `.po` compilado, que lee WordPress para los textos del servidor (PHP). Se genera, no se edita. |
| `pieb-cancionero-<locale>-<hash>.json` | Los mismos textos para JavaScript (uno por archivo `.js`; el `<hash>` es el md5 de su ruta). Se generan, no se editan. |

El `<locale>` es el código de WordPress: `idioma_PAÍS`, como `en_US`, `pt_BR`, `fr_FR`, `de_DE` o `it_IT`. El menú de la
cuenta ofrece el español y cada idioma que tenga su `.mo` en esta carpeta. Si alguien usa `en_GB` y no hay ese archivo,
se le muestra el primero de la misma lengua (`en_US`).

## Tres maneras de traducir

### a) Loco Translate (dentro de WordPress, sin programar)

1. Instala y activa el plugin gratuito **Loco Translate**.
2. Ve a **Loco Translate → Plugins → Cancionero** y pulsa **New language** (Nuevo idioma). La plantilla `.pot` se elige sola.
3. Elige el idioma y, como ubicación del archivo, la carpeta del propio plugin (la que Loco llama *Author*:
   `wp-content/plugins/pieb-cancionero/languages/`). El Cancionero solo ofrece los idiomas que tienen su `.mo` en esa
   carpeta: los archivos guardados en `wp-content/languages/plugins/` (*System*) o en la carpeta propia de Loco no se
   detectan.
4. Traduce cada texto en el editor y pulsa **Save** (Guardar). Loco crea el `.po` y el `.mo`. Los textos de JavaScript
   necesitan además los `.json`: las versiones recientes de Loco los generan al guardar; si no aparecen en la carpeta,
   compila el `.po` con el método c.
5. Entra en el cancionero, abre el menú de tu cuenta y elige el idioma nuevo en **Idioma**.

**Ojo con las actualizaciones:** al actualizar el plugin («Reemplazar el actual con el subido») WordPress sustituye la
carpeta del plugin y los archivos que no vengan en el zip desaparecen. Antes de actualizar, **descarga el `.po`** desde
el editor de Loco (**Download .po**) y guárdalo. Si lo envías al proyecto (ver «Cómo enviarlo»), se incluirá en las
versiones siguientes y no tendrás que preocuparte. Esa descarga del `.po` es también la forma de **compartirlo**.

### b) Poedit, a partir de la plantilla

1. Instala [Poedit](https://poedit.net), abre `pieb-cancionero.pot` y elige **Crear nueva traducción** (*Create new
   translation*) con el idioma deseado.
2. Guárdalo con el nombre exacto `pieb-cancionero-<locale>.po` en `pieb-cancionero/languages/`, por ejemplo
   `pieb-cancionero-pt_BR.po` o `pieb-cancionero-fr_FR.po`. Con otro nombre no se reconoce.
3. Traduce y guarda: Poedit crea el `.mo` al lado.
4. Genera los `.json` de JavaScript con la herramienta del repositorio (método c, `compilar`).

### c) Desde el repositorio, con `herramientas/i18n.py`

Necesita Python y `pip install -r herramientas/requirements.txt` (instala `polib`). Desde la raíz del repositorio:

```bash
python herramientas/i18n.py extraer    # actualiza pieb-cancionero.pot y los .po con los textos nuevos del código
python herramientas/i18n.py compilar   # por cada .po: el .mo, los .json de JavaScript y banco-pruebas/i18n/<locale>.js
python herramientas/i18n.py estado     # porcentaje traducido de cada idioma
```

Para empezar un idioma nuevo, crea el `.po` con Poedit como en el método b (o copia `pieb-cancionero.pot` como
`pieb-cancionero-<locale>.po` y rellena en la cabecera `Language:`, `Language-Team:` y `Plural-Forms:` con las reglas de
tu idioma). Después, `compilar`. `python herramientas/empaquetar.py` también ejecuta `compilar` antes de hacer el zip.

## Cómo probarlo

- **En el banco de pruebas** (sin WordPress): tras `compilar`, arranca `python -m http.server 8765 --bind 127.0.0.1` en
  la raíz del repositorio y abre `http://127.0.0.1:8765/banco-pruebas/index.html?idioma=pt_BR` (cambia el `locale`). Con
  `&notacion=americana` o `&notacion=latina` ves también la notación. Es lo más rápido para revisar textos cortados,
  botones que no caben, plurales y fechas. Lo que depende de PHP (errores de la API, correos, nombres de los roles) solo
  se ve en WordPress.
- **En WordPress:** genera el zip con `python herramientas/empaquetar.py`, súbelo (Plugins → Añadir nuevo → Subir plugin →
  Reemplazar el actual con el subido), entra en el cancionero y elige el idioma en el menú de la cuenta. Mejor en un
  sitio de pruebas.

## Cómo enviarlo

- **Pull request** con `pieb-cancionero-<locale>.po` y lo compilado (`.mo`, los `.json` y `banco-pruebas/i18n/<locale>.js`).
  Ver [CONTRIBUTING.md](../CONTRIBUTING.md).
- O **abre un Issue** y adjunta el `.po` (comprimido en `.zip` si hace falta): quien mantiene el proyecto lo compila y lo
  incluye en la siguiente versión.

Indica qué porcentaje está traducido (`estado`) y si piensas mantenerlo al día cuando salgan textos nuevos.

## Consejos

- **Marcadores:** respeta `%s`, `%d`, `%1$s`, `%2$s`: son datos que el programa rellena (un nombre, un número). Puedes
  cambiar su **orden** en la frase si tu idioma lo necesita (por eso los hay numerados), pero no borrarlos ni cambiarlos.
- **Plurales:** los textos con singular y plural tienen una casilla por cada forma de tu idioma (Poedit y Loco las
  muestran según `Plural-Forms`). Rellénalas todas.
- **Comentarios para traductores:** las notas que empiezan por `translators:` explican qué es cada marcador o en qué
  contexto aparece el texto. Léelas, sobre todo si una palabra puede significar dos cosas.
- **Contexto:** la misma palabra puede aparecer con distinto contexto (por ejemplo «Tono» como tonalidad de la canción)
  y traducirse distinto.
- **Botones y menús:** se ven en espacios reducidos (móvil, tableta). Prefiere la forma más corta que siga siendo clara
  y comprueba el resultado en el banco de pruebas.
- **Tonalidades:** no hay que traducirlas. Lo guardado es siempre `Sol`, `Mib`, `La m`… y la interfaz las muestra en
  Do-Re-Mi o en C-D-E según la **Notación** que cada persona elija (por defecto, Do-Re-Mi en español y C-D-E en los
  demás idiomas).
- **PDF del setlist:** por ahora solo admite caracteres latinos (Latin-1); las letras de otros alfabetos (cirílico,
  griego, árabe, chino…) se omiten en el PDF. El resto de la interfaz no tiene esa limitación.
- **Datos del equipo:** los títulos, etiquetas y tipos de culto ya guardados no se traducen; solo la interfaz.
- **Terminología:** usa siempre la misma palabra para el mismo concepto. Como referencia, el glosario español → inglés
  (el [`pieb-cancionero-en_US.po`](../pieb-cancionero/languages/pieb-cancionero-en_US.po) completo sirve de ejemplo):

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
