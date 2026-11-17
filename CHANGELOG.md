# Historial de versiones

Formato: versión · resumen. El detalle está en `git log`. La versión vive en `pieb-cancionero/pieb-cancionero.php`.

## 1.33.1 · 2026-11-17

Arreglo de la interfaz con varias iglesias: quien pertenece a una sola iglesia de una instalación con varias se trataba
como si la instalación tuviera una sola. Así, quien administra solo una iglesia veía en «Ajustes y equipo» las secciones
comunes (General, Google, Archivos, Papelera, Copias), que luego fallaban, no veía las etiquetas universales marcadas y la
escaleta impresa llevaba el nombre del cancionero en vez del de su iglesia. Ahora el servidor dice si la instalación tiene
varias iglesias; el selector de iglesia sigue saliendo solo a quien pertenece a más de una.

## 1.33.0 · 2026-11-16

Ajustes por iglesia (fase 5b de `docs/plan-multi-iglesia.md`). Con más de una iglesia, cada una tiene su escaleta (logo,
imagen de cabecera y plantilla), sus fondos de las letras y su correo de bienvenida (envío automático y texto), que
gestiona su propia administración; lo que ya existía queda como de la primera iglesia y las demás empiezan con lo genérico.
El correo de bienvenida dice a qué iglesia se ha añadido a la persona, y la escaleta impresa lleva el nombre de la iglesia
en lugar del nombre del cancionero. El aviso de borrado de canciones va a los administradores centrales. Con una sola
iglesia todo sigue igual.

## 1.32.0 · 2026-11-16

Equipo por iglesia (fase 5a de `docs/plan-multi-iglesia.md`). Con más de una iglesia, cada una tiene su propia lista de
personas, sus administradores, sus responsables de escaleta y su dominio; una persona puede estar en varias, con un rol
distinto en cada una. Los permisos dependen del rol en la iglesia en la que se está trabajando: quien administra una iglesia
gestiona su equipo, su registro de accesos, sus cultos y los fondos de las letras; lo común (nombre del cancionero, acceso
con Google, archivos sin usar, papelera de canciones, copias de seguridad e iglesias) queda para el administrador central,
y en «Ajustes y equipo» cada uno ve solo lo suyo. Un correo puede entrar si está en el equipo de cualquier iglesia. Las
pantallas del escritorio de WordPress de canciones y cultos quedan reservadas al administrador central. Con una sola
iglesia todo sigue igual.

## 1.31.0 · 2026-11-16

Etiquetas por iglesia y etiquetas universales (fase 4b de `docs/plan-multi-iglesia.md`). Con más de una iglesia, cada una
tiene sus propias etiquetas y no ve las de las demás; dos iglesias pueden usar el mismo nombre sin mezclarse. Las etiquetas
que ya existían son de la primera iglesia. Las **etiquetas universales** las ven todas (van marcadas con ★) y solo el
administrador central las crea, las pone y las quita en las canciones; se gestionan en Ajustes y equipo → Iglesias. Al
crear una universal, las etiquetas del mismo nombre de las iglesias se unen en ella. Con una sola iglesia todo sigue igual.

## 1.30.0 · 2026-11-16

Datos de cada iglesia en las canciones comunes (fase 4a de `docs/plan-multi-iglesia.md`). Con más de una iglesia, la ficha
de una canción tiene un bloque «En (tu iglesia)» donde su administración elige la **tonalidad habitual** (entre las que
tienen partitura) y la **partitura principal**; no cambian las de las demás iglesias. La tonalidad de la canción pasa a ser
la «original», común a todas, y una partitura sin tonalidad está en la original. Las **notas para el equipo** son de cada
iglesia y solo las ve ella. Los **audios de ensayo** son de la iglesia que los sube: las demás no los ven ni pueden abrir
el archivo; el administrador central puede publicar uno en todas («Universal») o devolverlo a su iglesia. Con una sola
iglesia todo sigue igual.

## 1.29.0 · 2026-11-16

En una canción se añade, no se destruye (fase 3 de `docs/plan-multi-iglesia.md`). Con más de una iglesia, cualquiera puede
añadir partituras, audios, partituras editables, enlaces y datos que falten, pero lo que añadió otra persona solo lo cambia
o lo quita ella o el administrador central. Un dato ya relleno (título, número, autor, tonalidad, tempo) lo cambia quien lo
rellenó, quien creó la canción o el central; la letra, quien creó la canción o el central; el orden de las partituras (cuál
es la principal), quien creó la canción o el central; y la canción solo la borra quien la creó o el central. El servidor
conserva lo ajeno aunque se le envíe cambiado o no se le envíe (ya no se pierde nada por un guardado incompleto), y el
formulario lo muestra bloqueado con «Añadida por…». Con una sola iglesia no se aplica nada de esto: todo sigue como antes.

## 1.28.0 · 2026-11-16

Cultos por iglesia y cultos privados (fase 2 de `docs/plan-multi-iglesia.md`). Con varias iglesias, cada una ve solo sus
cultos: el filtro está en el servidor, y un culto de otra iglesia responde «no existe» aunque se pida por su número
(también en la escaleta de partida y en la lista de cultos del escritorio de WordPress). Al crear un culto se puede marcar
«Privado: solo lo veo yo»: no aparece para el resto del equipo ni cuenta en las estadísticas, en las veces tocada ni en el
aviso de repetición; su autor puede publicarlo después desde «Más acciones» (o volver a hacerlo privado). Con más de una
iglesia aparece un selector en el menú del usuario y el nombre de la iglesia activa bajo el del cancionero; el
administrador central puede entrar en cualquiera para ayudar. Ajustes y equipo tiene una sección «Iglesias» (solo para el
administrador central) para crear iglesias y cambiarles el nombre. Con una sola iglesia solo cambia la casilla «Privado».

## 1.27.0 · 2026-11-15

Cimientos para usar una misma instalación con varias iglesias (fase 1 de `docs/plan-multi-iglesia.md`), sin cambios
visibles: una instalación de una sola iglesia sigue igual. Existe la entidad «iglesia», con una por defecto que se crea
sola al actualizar; la pertenencia de cada persona se deduce de sus roles actuales; cada culto queda anotado con su
iglesia; y cada partitura, audio, partitura editable y enlace de YouTube nuevo guarda quién lo añadió y desde qué iglesia
(los anteriores se atribuyen a quien subió la canción). Aparece el administrador central, que con una sola iglesia es la
administración de siempre. Todavía no se filtra nada por iglesia ni hay forma de crear más desde la interfaz.

## 1.26.0 · 2026-11-15

Tonalidad por partitura. Al subir o editar una canción, cada partitura puede llevar su tonalidad (sin ella, se entiende que
está en la habitual de la canción). Con partituras en varias tonalidades, la ficha de la canción muestra un selector y solo
se ven las de la tonalidad elegida, también al tocar. En el setlist de un culto, la tonalidad de cada canción deja de ser
texto libre: entra con la habitual y un desplegable permite elegir otra de las disponibles; al tocar el culto y en el PDF
del setlist solo salen las partituras de esa tonalidad. Los cultos anteriores con una tonalidad escrita a mano la conservan
(«escrita a mano») hasta que se elija otra. La tonalidad de cada partitura va también en las copias de seguridad. Si se
cambia la tonalidad habitual de una canción con partituras en varias tonalidades, las que estaban en la habitual conservan
la que tenían.

## 1.25.0 · 2026-11-15

«Cantar el culto»: junto a «Tocar el culto», un lector a pantalla completa con las letras del setlist en lugar de las
partituras (también «Cantar» en el próximo culto de Inicio y un micrófono en cada canción con letra para empezar por ella).
Tiene lo mismo que al tocar: título, tonalidad, tempo y nota del culto arriba, las canciones abajo para saltar de una a
otra, metrónomo, pantalla completa y pantalla siempre encendida. Las flechas, AvPág/RePág o un pedal bajan la letra una
pantalla y, al final, pasan a la canción siguiente; deslizar en horizontal cambia de canción y tocar el centro oculta las
barras. «A−» y «A+» cambian el tamaño del texto, que se recuerda en el dispositivo. Las canciones sin letra se avisan sin
romper la numeración del setlist.

## 1.24.6 · 2026-11-12

«Exportar letras» está siempre en «Más acciones» de un culto con canciones; si ninguna tiene letra, al pulsarla se avisa
en vez de esconder la opción. Además, las opciones de exportar letra ya no dependen de que su archivo haya terminado de
cargarse cuando se pinta la ficha.

## 1.24.5 · 2026-11-12

Pulido por pantalla. Inicio: las cifras usan las mismas tarjetas que el resumen de Canciones, el rótulo del próximo culto
se corta limpio y no se repite el tipo de culto cuando coincide con el título (tampoco en la ficha ni en el PDF del
setlist). Canciones: el recuento del filtro dice «8 canciones»; en el móvil el filtro ocupa su propia fila, «Subida
múltiple» y «Seleccionar» llevan texto, cada fila muestra solo los iconos de lo que la canción tiene y las etiquetas de
filtro son más altas para el dedo. Culto: filas del setlist de la misma altura. Estadísticas: los meses a cero no pintan
barra y el dato de «la mitad de lo que tocamos» se explica mejor. Ajustes: en el menú solo destaca la sección activa, en el
móvil un degradado avisa de que hay más pestañas y «Enviar la bienvenida» ya no dice «a 0 personas». Editor de letra: los
botones de formato caben en una fila.

## 1.24.4 · 2026-11-12

Las confirmaciones dejan de usar el aviso del navegador y pasan a un diálogo propio, con el aspecto del tema: la pregunta,
«Cancelar» y un botón que dice lo que hace («Borrar canción», «Vaciar la papelera», «Cerrar sin guardar»…), en rojo cuando
la acción destruye algo; en ese caso el foco empieza en «Cancelar». En el móvil sale como hoja inferior. Además, con un
formulario con cambios sin guardar ahora también se pregunta al ir atrás con el navegador o al pulsar otra sección (antes
los cambios se perdían sin avisar); «Seguir editando» deja el formulario como estaba.

## 1.24.3 · 2026-11-12

Botones y acciones más ordenados. Las fichas dejan a la vista solo lo habitual y el resto pasa a un menú «Más acciones»:
en la canción quedan Tocar, Editar y Descargar partitura (Copiar enlace, Abrir el PDF original y Borrar van al menú; copiar
y exportar la letra siguen junto a la letra); en el culto quedan Tocar el culto, Editar y Copiar como texto (las descargas,
Duplicar y Borrar van al menú). Borrar aparece siempre separado y en rojo. En la lista de canciones, un único botón
«Seleccionar» sustituye a «Etiquetar» y «Borrar»: se marcan las canciones y después se elige qué hacer con ellas.
«Exportar escaleta» pasa a llamarse «Descargar escaleta» (entrega el archivo directamente). En todos los formularios y
confirmaciones el orden es el mismo: Cancelar primero y la acción principal al final; las confirmaciones de borrado usan
el botón rojo. Los botones que solo llevan icono muestran su nombre al pasar el ratón.

## 1.24.2 · 2026-11-12

Navegación más limpia: queda un solo buscador, el de la barra superior (la lupa en el móvil); se quitan el de la barra
lateral y el de Inicio. En Cultos y Estadísticas desaparece el titular repetido bajo la barra superior; en Cultos se
quitan el botón «Nuevo» de la lista y el enlace «Nuevo culto» del pie (se crea desde la barra superior o el botón «+»),
y «Próximos cultos» de la barra lateral se oculta mientras se está en Cultos. Las fichas y los formularios de canción y
de culto usan la misma cabecera: flecha de volver a la izquierda y el rótulo con estilo de título

## 1.24.1 · 2026-11-12

Arreglos de la interfaz en el móvil: al crear o editar una canción y en la subida múltiple, la barra inferior ya no tapa
«Guardar» y «Cancelar»; el botón flotante «+» solo aparece en las listas (Inicio, Canciones y Cultos) y no encima de
fichas, formularios o estadísticas; la cabecera de «Tocar el culto» se ordena en dos filas sin cortar el título. Las
tarjetas de cifras de Canciones ya no recortan su rótulo, y desaparece el marco azul que rodeaba la ficha al abrirla
con un enlace directo

## 1.24.0 · 2026-11-12

Letras con formato: el campo Letra es un editor con negrita, cursiva, subrayado, «Sección» (títulos como Coro o Verso 1)
y «Estribillo» (líneas sangradas); al pegar desde Word o Google Docs se conserva lo básico. El texto plano se sigue
guardando para la búsqueda y la carga masiva. Exportar letras de una canción o de todo el setlist: hoja en PDF,
presentación PowerPoint, diapositivas en PDF (una por estrofa, con imagen de fondo), OpenLyrics (.xml, para OpenLP,
FreeShow, Quelea…) y texto. Nueva sección de Ajustes «Fondos de las letras» para subir las imágenes de fondo; al exportar
se elige una al azar, una concreta o ninguna

## 1.23.0 · 2026-11-11

Metrónomo en «Tocar el culto» y en la partitura a pantalla completa: botón «Metrónomo» en la barra (o la tecla M) para
mostrarlo u ocultarlo. Empieza en el tempo de la canción, si lo tiene, y cambia al pasar de canción; se ajusta con «−» y
«+», escribiendo el número o marcando el ritmo con «Marcar». Compás con acento en el primer pulso, pulsos visibles y
opción de silenciarlo. Si se oculta mientras suena, un punto en la barra sigue marcando el pulso

## 1.22.0 · 2026-11-11

La escaleta se puede preparar antes de elegir las canciones: los campos de canciones que no se tocan a mano siguen al
setlist y se rellenan solos cuando se añaden canciones, también después de guardar. Nuevo botón «Rellenar con el
setlist» para devolver a lo automático las canciones de los cultos guardados antes. El botón del culto se llama
siempre «Editar», aunque aún no tenga canciones

## 1.21.2 · 2026-11-06

La sección opcional de después de la predicación se llama «Post-sermón». Arrastrar para reordenar (secciones de la
escaleta, sus campos y el setlist) es más fluido: la fila sigue al puntero, las demás se apartan con una animación
corta, la lista se desplaza sola cerca del borde y, al arrastrar una sección, todas se pliegan a su título

## 1.21.1 · 2026-11-06

Los administradores del sitio pueden siempre preparar la escaleta y gestionar el cancionero, aunque su rol no tenga
guardados los permisos (p. ej. en una copia restaurada de la web o antes de entrar al escritorio tras actualizar)

## 1.21.0 · 2026-11-06

Escaleta: cada canción puede llevar una nota opcional, que se imprime debajo en letra pequeña; el Preludio pregunta si
es cantado o instrumental y lo imprime junto a la canción. Dos secciones nuevas, «Respuesta» (después de la
predicación) y «Santa Cena», que empiezan sin incluir en cada culto; las escaletas existentes las reciben solas. Con
«Editar secciones» se puede marcar cualquier sección como opcional y cualquier campo de canciones para que pregunte si
son cantadas o instrumentales

## 1.20.0 · 2026-11-02

Nuevo botón «Etiquetar» en la lista de canciones: se eligen varias canciones (con Mayús se marca un rango) y se les
añade o quita una etiqueta nueva o existente, con barra de progreso. La cabecera de la tabla y la barra de búsqueda
ya no dejan ver las canciones por debajo al hacer scroll en los estilos «Colores» y «Pentagrama»

## 1.19.2 · 2026-11-02

La copia de seguridad guarda también la partitura elegida en cada culto (se recupera por su posición entre las de la
canción), los responsables de escaleta, el nombre y el subtítulo propios y los días de la papelera. Las copias
anteriores se siguen pudiendo restaurar

## 1.19.1 · 2026-11-02

Los accesos directos a la página del cancionero (PC, Android, iPhone/iPad) llevan el icono del Cancionero y abren
como una app: iconos en todos los tamaños y manifiesto web con el nombre de cada instalación

## 1.19.0 · 2026-11-02

Nuevo rol «Responsable de escaleta» (Ajustes y equipo → Equipo → Opciones): prepara la escaleta de los cultos. El resto
del equipo puede ver la escaleta y exportarla, pero no crearla ni cambiarla; los administradores pueden todo

## 1.18.1 · 2026-11-02

Modo culto con un setlist largo: la partitura ya no sale desplazada ni con media página de la siguiente, y las
canciones de abajo se pueden desplazar para llegar a la última

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

