# Plan: varias iglesias en una misma instalación

Rama `multi-iglesia`. Cinco fases, cada una publicable por separado. Se queda dentro de WordPress: una instalación sirve a
varias iglesias con un repositorio de canciones común. Una instalación de una sola iglesia sigue funcionando igual, sin
ver nada nuevo.

## Decisiones tomadas

- **Canciones comunes**, cultos de cada iglesia. Una iglesia nunca ve los cultos de otra.
- **Cultos privados**: solo los ve quien los creó.
- **En una canción se añade, no se destruye.** Cualquiera puede añadir partituras, letra, audios o datos que falten. Lo
  que añadió otra persona no se puede cambiar ni borrar; lo propio sí.
- **Borrar una canción entera**: solo quien la creó y el administrador central.
- **Por iglesia**: tonalidad habitual, notas para el equipo, etiquetas, equipo, ajustes y estadísticas. El administrador
  central puede crear etiquetas «universales», visibles en todas.
- **Tonalidades**: una partitura en una tonalidad nueva la ven todas las iglesias, pero no cambia la habitual de ninguna.
  La habitual la elige el administrador de cada iglesia.
- Una persona puede pertenecer a **varias iglesias**, con un rol distinto en cada una.

## Modelo de datos

| Qué | Hoy | Con varias iglesias |
|---|---|---|
| Iglesia | No existe | Tipo de contenido nuevo `pieb_iglesia` (nombre y sus ajustes). Siempre hay al menos una. |
| Pertenencia | Rol de WordPress, global | Meta de usuario `_pieb_iglesias`: `{ idIglesia: rol }` (equipo, escaleta, administración). |
| Administrador central | No existe | Capacidad nueva `pieb_cancionero_central`. La reciben los administradores de WordPress. |
| Culto | Sin dueño | `_pieb_iglesia` (obligatorio) y `_pieb_privado` (0/1; privado = solo su autor). |
| Canción | Datos únicos | Los datos comunes siguen en la canción. Lo de cada iglesia va en `_pieb_ig_{id}`: `{ tonalidad, notas, principal }`. |
| Partitura, audio, editable, YouTube | `{ id, label, … }` | Cada elemento añade `autor` (usuario) e `iglesia` (desde dónde se subió). |
| Audios de ensayo | Comunes | **De cada iglesia**: solo los ve la que los subió. El administrador central puede marcar uno como `universal`, y entonces lo ven todas. |
| Tonalidad de una partitura | Vacía = «la habitual» | **Siempre explícita.** La habitual pasa a ser de cada iglesia, así que «vacía» deja de tener sentido. |
| Campos de la canción (título, número, autor, tempo, letra) | Sin autor | `_pieb_campos_autor`: quién rellenó cada campo. |
| Etiqueta | Término global | Meta del término `iglesia` (0 = universal). |
| Ajustes | Una opción global | Se dividen: globales (Google, protección de archivos, copias) y por iglesia (nombre, tipos de culto, escaleta, fondos, bienvenida). |

Se mantiene el prefijo `pieb` y no se renombra nada de lo existente.

## Reglas de permisos

| Acción | Quién |
|---|---|
| Ver canciones y sus archivos | Cualquier miembro de cualquier iglesia. |
| Crear una canción | Cualquier miembro. |
| Añadir partitura, editable o YouTube a una canción | Cualquier miembro. |
| Añadir, cambiar o quitar audios de ensayo | Miembros de la iglesia, sobre los audios de su iglesia. |
| Publicar un audio en todas las iglesias (y retirarlo) | Administrador central. |
| Cambiar o quitar uno de esos elementos | Quien lo añadió y el administrador central. |
| Rellenar un campo vacío (letra, tempo, autor…) | Cualquier miembro. |
| Cambiar un campo ya relleno | Quien lo rellenó, quien creó la canción y el administrador central. |
| Corregir la letra | Quien creó la canción y el administrador central. |
| Borrar la canción | Quien la creó y el administrador central. |
| Tonalidad habitual y notas de la iglesia | Administrador de esa iglesia. |
| Etiquetas de la iglesia (crear y poner) | Como hoy, dentro de su iglesia. |
| Etiquetas universales (crear y poner) | Administrador central. |
| Ver, crear y editar cultos | Miembros de esa iglesia, con las reglas de rol actuales. |
| Culto privado | Solo su autor. No cuenta en las estadísticas de la iglesia. |
| Equipo y ajustes de una iglesia | Administrador de esa iglesia. |
| Crear iglesias, papelera de canciones, copias, ajustes globales | Administrador central. |

## Cambios en la API

- **Iglesia activa.** Cada petición lleva la iglesia en la que se está trabajando (cabecera `X-PCAN-Iglesia`). El servidor
  comprueba que el usuario pertenece a ella; si falta, usa la última elegida. La interfaz la recibe en `PIEB_CANCIONERO`.
- **`/iglesias`** (GET): las del usuario. Crear, renombrar y archivar, solo el administrador central.
- **`/cultos`**: filtra siempre por la iglesia activa y por privacidad. Nunca devuelve un culto de otra iglesia, ni
  pidiéndolo por su número (404).
- **`/canciones`**: el resumen y el detalle devuelven `tonalidad` ya resuelta para la iglesia activa, además de
  `tonalidadOriginal`, `notas` de esa iglesia y, en cada elemento, `mio` (si lo puede cambiar quien pregunta).
- **Guardar una canción deja de reemplazarlo todo.** Hoy `POST /canciones/{id}` vacía lo que no llega; con varias
  iglesias eso permitiría destruir datos ajenos. Pasa a aceptar solo lo que el usuario puede cambiar y a ignorar (o
  rechazar con 403) lo demás. Es el cambio más delicado: afecta al formulario y a la receta de carga masiva.
- **`/canciones/{id}/iglesia`** (POST): tonalidad habitual y notas de la iglesia activa.
- **`/etiquetas`**: devuelve las de la iglesia activa más las universales, con `universal: true|false`.
- **`/ajustes`**: se separa en ajustes de la iglesia y ajustes globales.
- **Estadísticas y «veces tocada»**: salen de los cultos, así que quedan por iglesia sin más cambios que el filtro.

## Interfaz

- **Con una sola iglesia** no aparece nada nuevo.
- **Con varias**: un selector de iglesia en el menú del usuario; cambiarla recarga los datos.
- **Formulario de canción**: lo que no se puede cambiar aparece bloqueado, con quién lo añadió. «Añadir partitura» sigue
  disponible para todos.
- **Ficha de canción**: junto a la tonalidad, «Habitual en tu iglesia» editable por su administrador.
- **Culto**: casilla «Privado (solo yo)» al crearlo y una marca visible en la lista.
- **Ajustes y equipo**: lo de la iglesia para su administrador; una sección «Iglesias» y los ajustes globales, solo para
  el central.

## Fases

1. **Cimientos (sin cambios visibles).** Tipo `pieb_iglesia`, iglesia por defecto, pertenencias a partir de los roles
   actuales, capacidad del administrador central, iglesia activa en la API. Migración: todos los cultos pasan a la
   iglesia por defecto. Lo que aún no tiene autor ni iglesia se resuelve al leerlo (quien subió la canción y la iglesia
   por defecto), sin reescribir todas las canciones; lo nuevo ya los guarda. Con una sola iglesia, su administración
   hace de administración central.
2. **Cultos por iglesia y privados.** Filtro en el servidor, casilla «Privado», estadísticas por iglesia, selector de
   iglesia en el menú.
3. **Canciones: añadir sin destruir.** Autor por elemento y por campo, guardado parcial, formulario con bloqueos, borrado
   solo por el creador o el central.
4. **Datos por iglesia.** Tonalidad habitual, notas, etiquetas y audios por iglesia; etiquetas y audios universales. Aquí
   las partituras con tonalidad vacía reciben de forma explícita la habitual que tenían.
5. **Ajustes, equipo y administración central.** Ajustes divididos, equipo por iglesia, alta de iglesias, copias de
   seguridad con iglesias y pertenencias, papelera (canciones para el central, cultos para cada iglesia).

Cada fase añade su simulación al banco de pruebas (parámetro `?iglesias=2` para ver el modo con varias).

## Riesgos

- **Fugas entre iglesias.** El filtro tiene que estar en el servidor, en un único punto por el que pasen todas las
  consultas de cultos. Hay que probar a mano que pedir un culto ajeno por su número da 404.
- **Guardado parcial de canciones.** Cambia un contrato que hoy usan el formulario, la subida múltiple, la carga masiva y
  la importación de copias.
- **Migración.** Se ejecuta una vez sobre datos reales; antes hay que tener copia de seguridad y la migración debe poder
  repetirse sin duplicar nada.
- **Caché del alojamiento.** La página ya no se cachea con sesión; la iglesia activa no debe viajar en la URL de la página.

## Decisiones de detalle

1. **Letra.** La corrige quien creó la canción y el administrador central. Si la canción no tiene letra, cualquiera puede
   añadirla.
2. **Audios de ensayo.** De cada iglesia: solo los ve y los gestiona la iglesia que los subió (`iglesia` en cada audio y
   filtro en el servidor, también al entregar el archivo). El administrador central puede **publicar** un audio en todas
   las iglesias (`universal`), igual que las etiquetas universales; un audio universal solo lo cambia o lo retira él.
3. **Partitura principal.** Cada iglesia puede elegir la suya (`principal` en `_pieb_ig_{id}`); si no elige, vale el
   orden que se fijó al crear la canción.
4. **Culto privado.** Se puede publicar después en la iglesia (y volver a hacerlo privado solo su autor).
5. **Alta de personas.** El administrador de una iglesia puede añadir a alguien que ya está en otra, sin pasar por el
   central.

## Nombres: el del servicio y el de cada iglesia

Hoy hay un nombre (`nombre`) y una línea debajo (`subtitulo`, por defecto el nombre del sitio). Propuesta: `nombre` pasa a
ser el del **servicio común** y el de la **iglesia activa** ocupa el lugar del subtítulo.

| Dónde sale hoy el nombre | Con varias iglesias | Por qué |
|---|---|---|
| Pantalla de acceso | Servicio | Antes de entrar no se sabe de qué iglesia es la persona. |
| Correo con el enlace de acceso | Servicio | Lo mismo: es anterior a la sesión, y una persona puede estar en varias iglesias. |
| Icono y nombre al instalar en el móvil (manifiesto) | Servicio | Es uno por dirección web; no puede cambiar según quién entre. |
| Cabecera de la interfaz | Servicio, y debajo la iglesia activa | Ya hay dos líneas; con varias iglesias la segunda es el selector. |
| Correo de bienvenida | «Te han añadido a *Iglesia* en *Servicio*» | Lo envía el administrador de una iglesia concreta. |
| Aviso de borrado | Canciones: servicio (al central). Cultos: iglesia (a su administración). | Sigue a quién puede restaurarlo. |
| Escaleta y PDF del setlist | Iglesia | Son documentos de un culto; el logo y la cabecera ya son de cada iglesia. |
| PowerPoint y OpenLyrics | Servicio | El número de himnario es del repositorio común. |
| Menú de WordPress | Servicio | Solo lo ve el administrador central. |

Con una sola iglesia no cambia nada: el nombre de siempre y el subtítulo de siempre.
