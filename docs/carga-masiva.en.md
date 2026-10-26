# Bulk loading and data enrichment

*Versión en español: [carga-masiva.md](carga-masiva.md)*

How the songbook was loaded and completed from folders of files, so that it can be repeated or continued. It does not
require changing the plugin: it is done with the REST API itself, from a browser with a signed-in session.

## General flow

1. **Take inventory** of the source folder (PDFs, images, `.doc` files, YouTube `.url` links).
2. **Compare with the songbook**: ask for the list (`GET /canciones`) and match by normalized title (without accents,
   capitals or suffixes such as "cropped", "no borders", "LS", "v2"). Check the doubtful ones by hand: no match based on
   text similarity is 100% reliable.
3. **Prepare an "UPLOAD" folder** with one file per song, named `Title - Key.pdf` (the key in the name is read
   automatically on upload).
4. **Upload** with "Bulk upload" (done by a person: see the limitations).
5. **Complete** key, tempo and YouTube through the API.

## Reading the API from the browser

On the songbook page (signed in), in the console or with an automation tool:

```js
const c = PIEB_CANCIONERO, H = { 'X-WP-Nonce': c.nonce };
const lista = await (await fetch(c.api + 'canciones', { headers: H, credentials: 'same-origin' })).json();
const ficha = await (await fetch(c.api + 'canciones/' + id, { headers: H, credentials: 'same-origin' })).json();
```

## Changing one value of a song (without losing the rest)

`POST /canciones/{id}` replaces **all** the fields. Safe pattern:

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

Afterwards, **read the song again and compare** title, author, lyrics, notes, number of scores, audio and YouTube with
the previous copy; that is how any loss is detected. Working with 3–6 parallel requests is enough. Only fill in **empty**
fields so as not to overwrite the team's data. (If the song has editable files, also resend
`editables`/`editablesSubidos`.)

## Reading key and tempo from the scores

- Key and tempo are read from the **first page**: key signature, first chord and the `♩ = 96` marking. Chord sheets
  almost never carry a tempo; it is not made up. The key is stored in Spanish notation (`Sol`, `Fa#`, `Mim`).
- To look at many covers at once, **mosaics** were generated (several cropped first pages in one image) with PyMuPDF +
  Pillow, and the legible data was noted by hand. PDFs without a text layer cannot be read as text.
- With an ambiguous key signature (major/minor), it is better to leave it empty than to get it wrong.

## YouTube

- Windows `.url` files are text: the `URL=` line contains the link. They are matched to songs by name.
- For songs without a link, a reference version was searched for (the original or a Spanish version); only the very
  well-known or clear ones are added. If there is no reliable video, nothing is added.
- Only valid YouTube links are accepted (`watch?v=`, `youtu.be/`, `embed/`, `shorts/`, `live/`).

## Known limitations (important)

- **Uploading files**: an automated browser cannot pick files from disk or call `localhost`; uploading scores is done by
  a person with **Bulk upload**. Limit: 4 MB per score (a larger PDF can be compressed with `PyMuPDF`:
  `doc.rewrite_images(dpi_threshold=150, dpi_target=130, quality=70)`).
- **Word (`.doc`)** is usually blocked by the *Trust Center*. Alternatives: open them by hand and *Save as PDF*, or
  unblock the file type in Word. Without Word you can extract the text with `antiword` and draw it in monospace in a PDF
  (chords end up roughly aligned; styles are lost).
- **Duplicates**: matching by name cannot tell a "different version" from "the same file uploaded twice". Check before
  deleting; versions in another key are legitimate.
- **File names with accents** on Windows: when calling external programs, copy the file to a temporary ASCII name.
