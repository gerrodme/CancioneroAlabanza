# Historial de versiones

Formato: versión · resumen. El detalle está en `git log`. La versión vive en `pieb-cancionero/pieb-cancionero.php`.

## 1.18.0 · 2026-10-31

La ofrenda de la escaleta admite varias canciones (campo de canciones con la nueva opción «la siguiente a la última
asignada»; al cambiar de tipo entre una y varias canciones se conserva lo elegido). La vista previa ocupa media pantalla,
alineada con el campo Título. «Exportar escaleta» abre el PDF en una pestaña nueva con el botón «Descargar PDF». Nueva
pantalla «Acerca del Cancionero» en el menú de la cuenta, para todos: versión, autoría, licencias y componentes de terceros

## 1.17.0 · 2026-10-31

Los campos de texto largo de la escaleta tienen un editor con formato: negrita, cursiva, subrayado, lista con viñetas y
lista numerada (también Ctrl+B, I, U); se ve en la vista previa y en el PDF. Al pegar entra solo el texto

## 1.16.1 · 2026-10-31

Al editar o crear un culto en pantalla ancha, la lista de cultos se contrae a las fechas y vuelve a la normalidad al
terminar; la vista previa de la escaleta es más grande en PC

## 1.16.0 · 2026-10-31

Vista previa en vivo de la escaleta en el editor del culto: en pantallas anchas va al lado del editor y acompaña al
bajar; en las estrechas, el botón flotante «Ver escaleta» la abre y la cierra

## 1.15.2 · 2026-10-31

El PDF de la escaleta lleva abajo a la derecha, pequeño y atenuado, «Powered by» con el logo del Cancionero

## 1.15.1 · 2026-10-31

La escaleta se prepara en cada culto: su pestaña Escaleta tiene «Rellenar» y «Editar secciones» (secciones, campos,
textos por defecto y orden), y su propia fila de títulos; lo que se cambia solo afecta a ese culto. Un culto nuevo parte
de la última escaleta preparada. En Ajustes y equipo → Escaleta quedan solo el logo y la imagen de cabecera

## 1.15.0 · 2026-10-31

Escaleta del culto: la hoja impresa con el orden del culto. En Ajustes y equipo → Escaleta se define la plantilla
(imagen de cabecera, logo de la iglesia, fila de títulos y secciones ordenables arrastrando, con campos de texto o de
canciones del culto y sus valores por defecto). Cada culto tiene una pestaña Escaleta que se rellena sola con sus
canciones (preludio, ofrenda, postludio…), se puede retocar, ocultar secciones o añadir otras, y «Exportar escaleta»
genera un PDF A4

## 1.14.2 · 2026-10-31

El plugin deja de llevar código propio de una web concreta: una redirección de una página antigua y un ajuste del menú
del tema Vantage para pantallas táctiles. Quien use ese ajuste del menú debe instalarlo como mu-plugin aparte antes de
actualizar

## 1.14.1 · 2026-10-31

El idioma y la notación vuelven a cambiar al elegirlos: con sesión, la página del cancionero ya no se guarda en caché
(LiteSpeed y la CDN del alojamiento servían la copia anterior), y al guardar una preferencia se borra la copia privada.
La notación ya no depende del idioma: se elige Do-Re-Mi o C-D-E (sin «Auto») y se mantiene al cambiar de idioma

## 1.14.0 · 2026-10-31

Equipo sin duplicidades: desaparecen las áreas de texto de correos y administradores, y todo se gestiona en la lista.
Botón «Añadir personas» (uno o varios correos a la vez, con la bienvenida y su progreso), buscador, y en cada persona
«Opciones» para hacerla administradora o quitarla del equipo. Los cambios de la lista se guardan al momento; el
dominio permitido pasa a su propio apartado

## 1.13.1 · 2026-10-30

Modo culto: al tocar la partitura para ocultar las barras ya no se queda la pantalla gris, y la X lo cierra a la
primera (al entrar desde un enlace se abrían dos lectores, uno encima del otro)

## 1.13.0 · 2026-10-30

Aviso de canciones borradas: cuando alguien borra una canción, los administradores del cancionero y el correo de
administración de la web reciben un correo con la canción, sus archivos, quién la borró y cuándo, y un botón a la
papelera. Los borrados seguidos llegan juntos, un minuto después. Se desactiva en Ajustes y equipo → General

## 1.12.0 · 2026-10-30

Accesos: en Ajustes y equipo, quién entra y cuánto se usa el cancionero. Personas activas, inicios de sesión, días de uso,
quién no ha entrado nunca, gráfica por semana o mes, cómo entran (enlace, Google o contraseña), desde qué dispositivo y
qué días se usa, con el detalle de cada persona. Se registra desde esta versión y se guardan 12 meses, sin direcciones IP

## 1.11.3 · 2026-10-30

El correo con el enlace de acceso tiene el mismo aspecto que la bienvenida (cabecera con el logo, botón «Entrar al
cancionero») y un texto más cercano. Las piezas comunes de los correos están en includes/correo.php

## 1.11.2 · 2026-10-30

El botón del correo de bienvenida, ahora «Entrar al cancionero», deja dentro: lleva un enlace de acceso personal que
sirve una vez durante 7 días (antes llevaba a la pantalla de pedir el enlace). El correo explica cómo entrar más adelante

## 1.11.1 · 2026-10-30

La cabecera con el logo va incrustada en el correo de bienvenida: se ve aunque Gmail no pueda descargarla de la web.
El correo del destinatario ya no sale como enlace azul subrayado

## 1.11.0 · 2026-10-30

Logo del Cancionero y correo de bienvenida: quien se añade a la lista del equipo recibe un correo con el logo, el botón
para abrir el cancionero y cómo entrar (se puede desactivar y añadirle un texto propio). En Ajustes y equipo → Equipo se
elige a quién reenviarla, con barra de progreso, y hay una bienvenida de prueba

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

