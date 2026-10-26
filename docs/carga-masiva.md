# Carga masiva y enriquecimiento de datos

*English version: [carga-masiva.en.md](carga-masiva.en.md)*

Cómo se cargó y completó el cancionero a partir de carpetas de archivos, para poder repetirlo o continuarlo. No
requiere cambiar el plugin: se hace con la propia API REST desde un navegador con la sesión iniciada.

## Flujo general

1. **Inventariar** la carpeta de origen (PDF, imágenes, `.doc`, enlaces de YouTube `.url`).
2. **Comparar con el cancionero**: pedir la lista (`GET /canciones`) y emparejar por título normalizado (sin tildes,
   mayúsculas ni sufijos como «cropped», «sin bordes», «LS», «v2»). Revisar a mano los dudosos: ninguna coincidencia
   por parecido de texto es fiable al 100 %.
3. **Preparar una carpeta «PARA SUBIR»** con un archivo por canción, nombrado `Título - Tono.pdf` (la tonalidad en el
   nombre se lee sola al subir).
4. **Subir** con «Subida múltiple» (lo hace una persona: ver limitaciones).
5. **Completar** tonalidad, tempo y YouTube por API.

## Leer la API desde el navegador

En la página del cancionero (con sesión iniciada), en la consola o con una herramienta de automatización:

```js
const c = PIEB_CANCIONERO, H = { 'X-WP-Nonce': c.nonce };
const lista = await (await fetch(c.api + 'canciones', { headers: H, credentials: 'same-origin' })).json();
const ficha = await (await fetch(c.api + 'canciones/' + id, { headers: H, credentials: 'same-origin' })).json();
```

## Cambiar un dato de una canción (sin perder el resto)

`POST /canciones/{id}` reemplaza **todos** los campos. Patrón seguro:

```js
const fd = new FormData();
fd.append('titulo', g.titulo); fd.append('numero', g.numero || ''); fd.append('autor', g.autor || '');
fd.append('tonalidad', nuevaTonalidad); fd.append('tempo', g.tempo || '');
fd.append('etiquetas', (g.etiquetas || []).join(',')); fd.append('letra', g.letra || ''); fd.append('notas', g.notas || '');
fd.append('youtube', JSON.stringify(g.youtube.map(y => ({ url: y.url, label: y.label }))));
fd.append('partituras', JSON.stringify(g.partituras.map(p => ({ id: p.id, label: p.label }))));
fd.append('nuevasSubidas', '[]');
fd.append('audios', JSON.stringify(g.audios.map(a => ({ id: a.id, nombre: a.nombre, descripcion: a.descripcion }))));
fd.append('audiosSubidos', '[]');
await fetch(c.api + 'canciones/' + id, { method: 'POST', headers: H, credentials: 'same-origin', body: fd });
```

Después, **releer la canción y comparar** título, autor, letra, notas, nº de partituras, audios y YouTube con la copia
anterior; así se detecta cualquier pérdida. Trabajar con 3–6 peticiones en paralelo es suficiente. Solo rellenar campos
**vacíos** para no pisar datos del equipo. (Si la ficha tiene editables, reenviar también `editables`/`editablesSubidos`.)

## Leer tonalidad y tempo de las partituras

- La tonalidad y el tempo se leen de la **primera página**: armadura, primer acorde y la indicación `♩ = 96`. Las hojas
  de acordes casi nunca traen tempo; no se inventa. La tonalidad se guarda en notación española (`Sol`, `Fa#`, `Mim`).
- Para ver muchas portadas de golpe se generaron **mosaicos** (varias primeras páginas recortadas en una imagen) con
  PyMuPDF + Pillow, y se anotaron a mano los datos legibles. Los PDF sin capa de texto no se pueden leer por texto.
- Ante una armadura ambigua (mayor/menor), mejor dejarlo vacío que equivocarse.

## YouTube

- Los `.url` de Windows son texto: la línea `URL=` contiene el enlace. Se emparejan con las canciones por el nombre.
- Para canciones sin enlace se buscó una versión de referencia (original o versión en español); solo se añaden las muy
  conocidas o las claras. Si no hay vídeo fiable, no se añade nada.
- Solo se aceptan enlaces válidos de YouTube (`watch?v=`, `youtu.be/`, `embed/`, `shorts/`, `live/`).

## Limitaciones conocidas (importantes)

- **Subir archivos**: un navegador automatizado no puede elegir archivos del disco ni llamar a `localhost`; la subida de
  partituras la hace una persona con **Subida múltiple**. Límite: 4 MB por partitura (un PDF mayor se puede comprimir
  con `PyMuPDF`: `doc.rewrite_images(dpi_threshold=150, dpi_target=130, quality=70)`).
- **Word (`.doc`)** suele estar bloqueado por el *Centro de confianza*. Alternativas: abrirlos a mano y *Guardar como PDF*,
  o desbloquear el tipo de archivo en Word. Sin Word se puede extraer el texto con `antiword` y dibujarlo en monoespaciado
  en un PDF (los acordes quedan aproximadamente alineados; se pierden estilos).
- **Duplicados**: el emparejamiento por nombre no distingue «versión distinta» de «mismo archivo subido dos veces».
  Revisar antes de borrar; las versiones en otro tono son legítimas.
- **Nombres con acentos** en Windows: al llamar a programas externos, copiar el archivo a un nombre ASCII temporal.
