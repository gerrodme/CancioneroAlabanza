# Plan: rediseño del menú del usuario y de «Ajustes y equipo»

Rama `menus`. Dos fases, una versión cada una.

## Problema

- **Menú del usuario** (al pulsar el nombre o el avatar): ha llegado a unas 20 filas (7 temas, 3 idiomas, 3 notaciones,
  3 de administración, 2 de salida y la versión). En el móvil no cabe en la pantalla y hay que desplazarse dentro.
- **Ajustes y equipo**: un único formulario de unos 2 000 px de alto con 7 apartados seguidos (General, Equipo, Acceso con
  Google, Protección de los archivos, Archivos sin usar, Apariencia) y el botón de guardar abajo del todo. Además, la
  Papelera y las Copias de seguridad son otras dos ventanas aparte, a las que se llega desde el menú.

## Fase 1 · Menú del usuario compacto (1.10.0)

Mismo menú en la barra lateral y en el avatar del móvil. De arriba abajo:

1. **Cabecera**: nombre y, debajo, el rol en pequeño («Administración del cancionero» o «Equipo»).
2. **Preferencias**, directamente en el menú pero compactas:
   - **Tema**: rejilla de 2 columnas con fichas (muestra de color + nombre), la elegida marcada. 7 temas en 4 filas en
     lugar de 7.
   - **Idioma**: una sola fila con un desplegable (`<select>`) con «Automático (idioma del sitio)» y cada idioma. Solo
     si hay más de un idioma.
   - **Notación**: control segmentado de 3 botones con texto («Auto», «Do-Re-Mi», «C-D-E»).
   Cambiar el tema se aplica al momento, como ahora; idioma y notación guardan y recargan, como ahora.
3. **Administración** (solo quien puede gestionar): una única fila **«Ajustes y equipo»** (la Papelera y las Copias pasan
   a ser secciones de ese panel en la fase 2; hasta entonces se mantienen sus dos filas).
4. **Salida**: «Volver a la web» y «Cerrar sesión».
5. **Pie**: versión en pequeño.

Objetivo: que quepa entero sin desplazarse en un móvil de 844 px de alto y en un portátil de 768 px. En el móvil se
abre como hoja inferior (*bottom sheet*) a todo lo ancho; si aun así no cabe, solo se desplaza la zona central.
Accesible con teclado (Tab, flechas en la rejilla y el segmentado, Esc cierra) y con `aria` correctos
(`radiogroup`/`radio` con `aria-checked`).

Debe verse bien en los 7 temas (`cancionero.css` tiene reglas por tema para el menú).

## Fase 2 · «Ajustes y equipo» por secciones (1.10.1)

Un panel más ancho con **navegación por secciones**: lista a la izquierda en pantallas anchas y pestañas desplazables
arriba en el móvil. Cada sección tiene su propia ruta para poder enlazarla y volver a ella:

| Sección | Ruta | Contenido |
|---|---|---|
| General | `#/ajustes` (o `#/ajustes/general`) | Nombre, línea bajo el nombre, tema por defecto, días que se conservan las canciones borradas |
| Equipo | `#/ajustes/equipo` | Correos con acceso y su estado, administradores del cancionero, dominio permitido, correo de prueba |
| Acceso con Google | `#/ajustes/google` | Client ID y cómo obtenerlo |
| Archivos | `#/ajustes/archivos` | Protección de los archivos y archivos sin usar |
| Papelera | `#/ajustes/papelera` | La papelera actual (con un enlace al plazo de conservación, que está en General) |
| Copias de seguridad | `#/ajustes/copias` | La pantalla de copias actual |

- Las rutas antiguas `#/papelera` y `#/copias` siguen funcionando (abren su sección).
- **Guardar**: los campos de General, Equipo, Google siguen siendo un solo formulario con
  un único «Guardar ajustes», en una barra fija abajo, visible solo en esas secciones. Si hay cambios sin guardar, la
  barra lo indica y avisar antes de cerrar. Si el servidor devuelve un error de un campo, se abre su sección.
- Archivos, Papelera y Copias tienen sus propias acciones (como ahora) y no muestran «Guardar».
- La versión del plugin, en el pie de la navegación.
- Menú del usuario: la fila «Ajustes y equipo» sustituye a Papelera y Copias.
- Documentación (español e inglés) que diga «menú de la cuenta → Copias de seguridad» o «→ Papelera»: pasa a
  «Ajustes y equipo → Copias de seguridad / Papelera» (README, guías, `guia-recuperar-cancionero*.html`).

## Para las dos fases

- Textos nuevos con `__()`/`_n()` y comentario `translators:` si llevan marcadores; `python herramientas/i18n.py
  extraer`, traducir lo nuevo en `pieb-cancionero-en_US.po`, `compilar`. En inglés los textos son más largos: comprobar
  que caben.
- Probar en el banco de pruebas en español e inglés, a 1440×900, 1366×768 y 390×844, y en los temas Colores,
  Pentagrama, Escenario y Partitura. Sin errores de consola.
- Cambios pequeños y fieles al estilo actual (helper `h()`, clases `pcan-*`, variables CSS del tema). Botones con texto
  claro; acciones destructivas en rojo; barras de progreso visibles.
