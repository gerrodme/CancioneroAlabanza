# Historial de versiones

Formato: versión · resumen. El detalle está en `git log`. La versión vive en `pieb-cancionero/pieb-cancionero.php`.

## 1.10.3 · 2026-10-29

Borrado múltiple de canciones: botones fijos «Seleccionar las N de la lista» y «Quitar la selección»; el botón «+» se
oculta mientras se eligen y la casilla marcada ya no pierde el ✓ al pasar el ratón por encima

## 1.10.2 · 2026-10-26

Al restaurar una copia, lo leído del archivo se muestra en una ventana emergente con el progreso siempre a la vista

## 1.10.1 · 2026-10-26

Ajustes y equipo por secciones (General, Equipo, Acceso con Google, Archivos, Papelera y Copias de seguridad), cada una con su dirección; la Papelera y las Copias se abren desde ahí

## 1.10.0 · 2026-10-26

Menú del usuario más compacto: temas en rejilla, idioma en un desplegable y notación en un selector; en el móvil se abre desde abajo

## 1.9.2 · 2026-10-26

Usa también las traducciones instaladas en wp-content/languages/plugins (Loco Translate, WordPress.org)

## 1.9.1 · 2026-10-26

Documentación en inglés y guía para traducir el Cancionero a otros idiomas

## 1.9.0 · 2026-10-26

Cancionero en inglés: cada usuario elige su idioma en el menú; en inglés las tonalidades salen por defecto en notación americana

## 1.8.3 · 2026-10-26

Cultos, setlist, modo culto, estadísticas e inicio de sesión preparados para traducirse

## 1.8.2 · 2026-10-26

Textos de la interfaz principal preparados para traducirse; plurales y frases adaptables a cada idioma

## 1.8.1 · 2026-10-26

Textos del servidor (mensajes, correos, avisos) preparados para traducirse

## 1.8.0 · 2026-10-26

Preparado para traducciones: idioma y notación de las tonalidades elegibles por usuario (Do-Re-Mi o C-D-E, en el menú del
usuario; lo guardado no cambia), fechas con el idioma del usuario, infraestructura de traducción de WordPress
(`languages/`, `wp.i18n`) y herramienta `herramientas/i18n.py` para extraer y compilar los textos

## 1.7.4 · 2026-10-25

El zip del plugin incluye el texto de la licencia GPL (`license.txt`)

## 1.7.3 · 2026-10-25

Al vaciar la papelera se muestra una barra de progreso («Eliminando 3 de 20…»); restaurar y eliminar una canción muestran
el botón como «en curso»

## 1.7.2 · 2026-10-25

Corrige «Restaurar» en la papelera: llamaba por error a la función que restaura copias de seguridad

## 1.7.1 · 2026-10-25

En pantallas bajas (tableta apaisada) la lista de próximos cultos del menú lateral se desplaza dentro de su caja y ya no
tapa el botón del usuario

## 1.7.0 · 2026-10-25

Partitura principal marcable en la ficha, y papelera del cancionero para administradores: ver las canciones borradas,
abrirlas, restaurarlas o eliminarlas para siempre, con limpieza automática configurable (30 días por defecto)

## 1.6.0 · 2026-10-24

En el setlist de un culto se puede elegir qué partitura se usa de las canciones con varias: la elegida es la que se abre en
el modo culto y la que va en el PDF del setlist

## 1.5.6 · 2026-10-24

Los administradores del cancionero pueden hacer y restaurar copias de seguridad

## 1.5.5 · 2026-10-24

Línea bajo el nombre del cancionero configurable (por defecto, el nombre de la web), versión del plugin visible en Ajustes y
filtro en Restaurar para ver todas las canciones y cultos o solo las que no existen

## 1.5.4 · 2026-10-24

Restaurar copias: dos canciones con el mismo título y sin número ya no se confunden y se restauran las dos (si tienen identificadores distintos)

## 1.5.3 · 2026-10-24

Las páginas públicas de adjuntos de WordPress dejan de mostrar el título y el nombre de las partituras (responden 404)

## 1.5.2 · 2026-10-24

Corrige un error crítico al subir o restaurar archivos con la 1.5.0/1.5.1 (el filtro de la carpeta privada se llamaba a sí mismo)

## 1.5.1 · 2026-10-24

Los archivos privados ya no se pueden reabrir desde la caché del navegador tras cerrar sesión (el navegador revalida cada vez)

## 1.5.0 · 2026-10-24

Archivos privados: partituras, audios y editables se guardan en una carpeta que el servidor no sirve y solo se entregan
a quien ha iniciado sesión; botón para proteger los archivos existentes y aviso si el servidor no respeta la protección

## 1.4.0 · 2026-10-24

Nombre del cancionero configurable en Ajustes, administradores del cancionero (rol propio con ajustes y borrado, sin ser
administradores de WordPress) y el producto pasa a llamarse «Cancionero»

## 1.3.3 · 2026-10-24

Proyecto genérico para publicar: licencias, documentación, autoría y textos de ejemplo sin datos de ninguna iglesia

## 1.3.2 · 2026-10-24

Botones «Subida múltiple» y «Borrar» con texto; Borrar en rojo

## 1.3.1 · 2026-10-24

Subida múltiple: barra de progreso siempre visible en la barra inferior

## 1.3.0 · 2026-10-24

Ordenar por cualquier columna, etiquetas con color y editor de culto compacto

## 1.2.2 · 2026-10-24

Acciones siempre visibles en las fichas, sin menú «⋯»

## 1.2.1 · 2026-10-24

PDF del setlist sin los márgenes en blanco de las partituras

## 1.2.0 · 2026-10-24

Partituras editables como adjuntos de la canción

## 1.1.3 · 2026-10-23

Tema «Pentagrama» completo en todas las pantallas

## 1.1.2 · 2026-10-23

Cultos más vivos: portada, cuenta atrás y setlist más completo

## 1.1.1 · 2026-10-23

Temas «Colores» y «Pentagrama»; «Colores» por defecto

## 1.0.10 · 2026-10-23

Menú del sitio: los desplegables se abren con clic o toque

## 1.0.9 · 2026-10-23

Ficha de canción adaptable a la pantalla

## 1.0.8 · 2026-10-23

Formulario de canción adaptable a la pantalla

## 1.0.7 · 2026-10-23

Inicio adaptable al dispositivo y sin scroll lateral en móvil

## 1.0.6 · 2026-10-23

Primera versión pública del plugin Cancionero

