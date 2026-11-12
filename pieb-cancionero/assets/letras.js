/* Cancionero · exportar letras (hoja en PDF, diapositivas, PowerPoint, OpenLyrics y texto) */
(function () {
  'use strict';

  var P = window.PCAN;
  if (!P || !P.pdf) { return; }
  var h = P.h, append = P.append, icono = P.icono, api = P.api, aviso = P.aviso;
  var __ = P.__, _n = P._n, sprintf = P.sprintf;
  var CFG = P.cfg || {};
  var LOCALE = P.locale || 'es-ES';

  var PPTX_LIB = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
  var CLAVE_PREFS = 'pcan_exportar_letras';

  // Diapositivas: se calculan en una hoja de 960 × 540 unidades (el PDF las usa tal cual en puntos; PowerPoint, a 0,75 pt por unidad).
  var DW = 960, DH = 540;
  var DIAPO_LH = 1.3;
  var FONDO_LISO = [17, 24, 39];      // #111827
  var MAX_TROZO = 5;                  // líneas como mucho por diapositiva (una estrofa de más de 6 se parte)

  // ---------------------------------------------------------------- utilidades

  function pausa() { return new Promise(function (resolve) { setTimeout(resolve, 0); }); }

  /** Ejecuta fn(0..n-1) una tras otra, dejando respirar al navegador entre cada una (para que se repinte el progreso). */
  function secuencial(n, fn) {
    var p = Promise.resolve();
    for (var i = 0; i < n; i++) {
      (function (k) { p = p.then(function () { return fn(k); }).then(pausa); })(i);
    }
    return p;
  }

  function pref(clave, valor) {
    try {
      var o = JSON.parse(localStorage.getItem(CLAVE_PREFS) || '{}') || {};
      if (valor === undefined) { return o[clave]; }
      o[clave] = valor;
      localStorage.setItem(CLAVE_PREFS, JSON.stringify(o));
    } catch (e) { /* sin almacenamiento: no se recuerda nada */ }
    return undefined;
  }

  function slug(t) {
    var s = String(t || '').normalize ? String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '') : String(t || '');
    s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'cancion';
  }

  function hoyISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fechaLarga(iso) {
    var p = String(iso || '').split('-');
    if (!p[0]) { return ''; }
    var s = new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** Texto plano de una línea (lista de trozos). */
  function textoLinea(l) { return l.map(function (r) { return r.t; }).join('').replace(/\s+$/, ''); }

  /** Descarga unos bytes o un texto con el tipo MIME indicado. */
  function descargar(contenido, nombre, tipo) {
    var url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    var a = h('a', { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function aBase64(bytes) {
    var s = '', paso = 0x8000;
    for (var i = 0; i < bytes.length; i += paso) { s += String.fromCharCode.apply(null, bytes.subarray(i, i + paso)); }
    return btoa(s);
  }

  /** Nombre del archivo (sin extensión): «<prefijo>-<título>» o, en un setlist, «<prefijo>-AAAA-MM-DD». */
  function nombreBase(op, prefijo, plural) {
    var resto = op.esSetlist ? (op.fecha || hoyISO()) : slug(op.nombreArchivo || op.titulo);
    return (op.esSetlist && plural ? plural : prefijo) + '-' + resto;
  }

  // ---------------------------------------------------------------- fondos

  var cacheFondos = {};
  var fondoFallo = false;

  /** Imagen de fondo lista para la diapositiva: JPEG de 1920 × 1080 (recorte tipo «cover») oscurecido al 45 %. Cachea por id. */
  function fondoImagen(f) {
    if (!f) { return Promise.resolve(null); }
    if (cacheFondos[f.id]) { return cacheFondos[f.id]; }
    var p = fetch(f.url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) { throw new Error(String(r.status)); }
      return r.blob();
    }).then(function (blob) {
      return createImageBitmap(blob);
    }).then(function (bmp) {
      var c = document.createElement('canvas');
      c.width = 1920; c.height = 1080;
      var ctx = c.getContext('2d');
      var esc = Math.max(1920 / bmp.width, 1080 / bmp.height);
      var w = bmp.width * esc, hh = bmp.height * esc;
      ctx.drawImage(bmp, (1920 - w) / 2, (1080 - hh) / 2, w, hh);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, 1920, 1080);
      return new Promise(function (resolve, reject) { c.toBlob(function (b) { if (b) { resolve(b); } else { reject(new Error('jpeg')); } }, 'image/jpeg', 0.85); });
    }).then(function (b) { return b.arrayBuffer(); }).then(function (buf) {
      return { id: f.id, bytes: new Uint8Array(buf) };
    }).catch(function () { fondoFallo = true; return null; });
    cacheFondos[f.id] = p;
    return p;
  }

  /** Fondo de cada canción: null (liso) o un elemento de `lista`. Con «al azar» y un setlist, una imagen distinta por canción mientras haya. */
  function repartirFondos(n, eleccion, lista) {
    var res = [], i;
    if (eleccion === 'ninguno' || !lista.length) {
      for (i = 0; i < n; i++) { res.push(null); }
      return res;
    }
    if (eleccion !== 'azar') {
      var f = lista.filter(function (x) { return String(x.id) === String(eleccion); })[0] || null;
      for (i = 0; i < n; i++) { res.push(f); }
      return res;
    }
    var orden = lista.slice();
    for (i = orden.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = orden[i];
      orden[i] = orden[j]; orden[j] = t;
    }
    for (i = 0; i < n; i++) { res.push(orden[i % orden.length]); }
    return res;
  }

  // ---------------------------------------------------------------- diapositivas (estructura común a PDF y PowerPoint)

  /** Una estrofa de más de 6 líneas se parte en trozos equilibrados de 5 líneas o menos. */
  function trocear(lineas) {
    if (lineas.length <= 6) { return [lineas]; }
    var k = Math.ceil(lineas.length / MAX_TROZO), tam = Math.ceil(lineas.length / k), res = [];
    for (var i = 0; i < lineas.length; i += tam) { res.push(lineas.slice(i, i + tam)); }
    return res;
  }

  /** Diapositivas de una canción: la del título y una por estrofa (o por trozo de estrofa). */
  function diapositivasDe(c, esSetlist) {
    var out = [{ tipo: 'titulo', titulo: c.titulo, autor: c.autor || '', nota: esSetlist ? (c.nota || '') : '' }];
    P.letra.estrofas(c).forEach(function (e) {
      trocear(e.lineas).forEach(function (t) { out.push({ tipo: 'estrofa', nombre: e.nombre || '', lineas: t }); });
    });
    return out;
  }

  /** «Fuentes» que miden con un lienzo 2D y Arial, con la misma forma que las de pdf-lib (para PowerPoint). */
  var ctxMedida = null;
  function fuentesLienzo() {
    if (!ctxMedida) { ctxMedida = document.createElement('canvas').getContext('2d'); }
    function mk(estilo) {
      return { widthOfTextAtSize: function (t, size) { ctxMedida.font = estilo + size + 'px Arial, Helvetica, sans-serif'; return ctxMedida.measureText(t).width; } };
    }
    return { n: mk(''), b: mk('bold '), i: mk('italic '), bi: mk('italic bold ') };
  }

  /**
   * Mayor tamaño de letra (entre min y max) con el que ninguna línea se parte y el bloque cabe en altoMax; si ni al mínimo cabe,
   * las líneas largas se envuelven. Devuelve { size, filas } (filas: las líneas ya medidas, con sus trozos).
   */
  function ajustar(lineas, fuentes, anchoMax, altoMax, min, max) {
    var size = max;
    for (;;) {
      var filas = [];
      lineas.forEach(function (l) { filas = filas.concat(P.pdf.envolverTexto(l, anchoMax, size, fuentes)); });
      if ((filas.length === lineas.length && filas.length * size * DIAPO_LH <= altoMax) || size <= min) { return { size: size, filas: filas }; }
      size -= 2;
    }
  }

  // ---------------------------------------------------------------- hoja en PDF

  function generarHoja(L, canciones, op, progreso) {
    return L.PDFDocument.create().then(function (doc) {
      return Promise.all([
        doc.embedFont(L.StandardFonts.Helvetica), doc.embedFont(L.StandardFonts.HelveticaBold),
        doc.embedFont(L.StandardFonts.HelveticaOblique), doc.embedFont(L.StandardFonts.HelveticaBoldOblique)
      ]).then(function (fs) {
        var F = { n: fs[0], b: fs[1], i: fs[2], bi: fs[3] };
        var PW = 595.28, PH = 841.89, MX = 56, MT = 56, MB = 64;
        var ANCHO = PW - 2 * MX, LIM = PH - MB;
        var ACENTO = L.rgb(0.1, 0.2, 0.5), GRIS = L.rgb(0.42, 0.45, 0.5), NEGRO = L.rgb(0.08, 0.08, 0.1);
        var paginas = [], pag = null, y = 0;
        var env = P.pdf.envolverTexto;

        function nueva() { pag = doc.addPage([PW, PH]); paginas.push(pag); y = MT; }
        function pintarFila(fila, x, size, color) {
          var xx = x, base = PH - (y + size * 0.95);
          fila.segs.forEach(function (s) {
            pag.drawText(s.t, { x: xx, y: base, size: size, font: F[s.f], color: color });
            if (s.u) { pag.drawLine({ start: { x: xx, y: base - size * 0.12 }, end: { x: xx + s.w, y: base - size * 0.12 }, thickness: Math.max(0.5, size * 0.05), color: color }); }
            xx += s.w;
          });
        }
        /** Texto suelto (título, metadatos…) que puede ocupar varias líneas; devuelve su altura. */
        function bloque(texto, f, size, lh, color, ancho, x) {
          var filas = env([{ t: texto, f: f }], ancho, size, F);
          filas.forEach(function (fila) { pintarFila(fila, x, size, color); y += lh; });
        }
        function alturaBloque(texto, f, size, lh, ancho) { return env([{ t: texto, f: f }], ancho, size, F).length * lh; }

        function estrofa(e) {
          var anchoE = e.coro ? ANCHO - 16 : ANCHO, x0 = MX + (e.coro ? 16 : 0), lh = 17.4, altoNombre = e.nombre ? 15 : 0;
          var filas = [];
          e.lineas.forEach(function (l) { filas = filas.concat(env(l, anchoE, 12, F)); });
          var alto = altoNombre + filas.length * lh;
          if (y + alto > LIM && alto <= LIM - MT) { nueva(); }
          if (e.nombre) {
            if (y + altoNombre + lh > LIM) { nueva(); }
            pag.drawText(P.pdf.latin1(e.nombre.toUpperCase()), { x: x0, y: PH - (y + 9.5), size: 9.5, font: F.b, color: ACENTO });
            y += altoNombre;
          }
          var ini = y;
          function cerrarBarra() {
            if (e.coro && y > ini) { pag.drawLine({ start: { x: MX + 4, y: PH - ini }, end: { x: MX + 4, y: PH - y + 3 }, thickness: 1.5, color: ACENTO }); }
          }
          filas.forEach(function (fila) {
            if (y + lh > LIM) { cerrarBarra(); nueva(); ini = y; }
            pintarFila(fila, x0, 12, NEGRO);
            y += lh;
          });
          cerrarBarra();
          y += 12;
        }

        nueva();
        if (op.esSetlist) {
          var cab = [op.titulo, fechaLarga(op.fecha)].filter(Boolean).join(' · ');
          if (cab) {
            bloque(cab, 'b', 10.5, 15, GRIS, ANCHO, MX);
            pag.drawLine({ start: { x: MX, y: PH - y - 2 }, end: { x: PW - MX, y: PH - y - 2 }, thickness: 0.6, color: L.rgb(0.8, 0.82, 0.85) });
            y += 22;
          }
        }

        return secuencial(canciones.length, function (i) {
          progreso(i + 1, canciones.length);
          var c = canciones[i];
          if (i > 0) { if (y > LIM - 140) { nueva(); } else { y += 30; } }
          var titulo = op.esSetlist ? (i + 1) + '. ' + c.titulo : c.titulo;
          var meta = [
            c.numero ? sprintf(/* translators: %s: número de himnario */ __('Nº %s'), c.numero) : '',
            c.autor || '',
            c.tonalidad ? P.tono(c.tonalidad) : '',
            c.tempo ? sprintf(/* translators: %s: tempo en pulsaciones por minuto */ __('%s ppm'), c.tempo) : ''
          ].filter(Boolean).join(' · ');
          var est = P.letra.estrofas(c);
          var altoCab = alturaBloque(titulo, 'b', 20, 25, ANCHO) + (meta ? alturaBloque(meta, 'n', 10, 14, ANCHO) : 0)
            + (op.esSetlist && c.nota ? alturaBloque(c.nota, 'i', 10, 14, ANCHO) : 0) + 12;
          // El título no se queda solo al pie de una hoja: se pide sitio también para el principio de la primera estrofa.
          if (y + altoCab + 80 > LIM) { nueva(); }
          bloque(titulo, 'b', 20, 25, NEGRO, ANCHO, MX);
          if (meta) { bloque(meta, 'n', 10, 14, GRIS, ANCHO, MX); }
          if (op.esSetlist && c.nota) { bloque(c.nota, 'i', 10, 14, GRIS, ANCHO, MX); }
          y += 12;
          est.forEach(estrofa);
        }).then(function () {
          paginas.forEach(function (p, k) {
            var t = (k + 1) + ' / ' + paginas.length, w = F.n.widthOfTextAtSize(t, 8.5);
            p.drawText(t, { x: (PW - w) / 2, y: 28, size: 8.5, font: F.n, color: GRIS });
          });
          return doc.save();
        });
      });
    });
  }

  // ---------------------------------------------------------------- diapositivas en PDF

  function generarDiapositivasPdf(L, canciones, fondos, op, progreso) {
    return L.PDFDocument.create().then(function (doc) {
      return Promise.all([
        doc.embedFont(L.StandardFonts.Helvetica), doc.embedFont(L.StandardFonts.HelveticaBold),
        doc.embedFont(L.StandardFonts.HelveticaOblique), doc.embedFont(L.StandardFonts.HelveticaBoldOblique)
      ]).then(function (fs) {
        var F = { n: fs[0], b: fs[1], i: fs[2], bi: fs[3] };
        var BLANCO = L.rgb(1, 1, 1);
        var imagenes = {};
        var env = P.pdf.envolverTexto;

        function dibujarFilas(pag, filas, size, topY, opciones) {
          var lh = size * DIAPO_LH;
          filas.forEach(function (fila, k) {
            var base = DH - (topY + k * lh + lh / 2 + size * 0.33), x = (DW - fila.w) / 2;
            fila.segs.forEach(function (s) {
              var tx = { x: x, y: base, size: size, font: F[s.f], color: BLANCO };
              if (opciones && opciones.opacidad !== undefined) { tx.opacity = opciones.opacidad; }
              pag.drawText(s.t, tx);
              if (s.u) {
                var ln = { start: { x: x, y: base - size * 0.12 }, end: { x: x + s.w, y: base - size * 0.12 }, thickness: Math.max(1, size * 0.05), color: BLANCO };
                if (opciones && opciones.opacidad !== undefined) { ln.opacity = opciones.opacidad; }
                pag.drawLine(ln);
              }
              x += s.w;
            });
          });
        }

        function diapo(d, img) {
          var pag = doc.addPage([DW, DH]);
          if (img) { pag.drawImage(img, { x: 0, y: 0, width: DW, height: DH }); }
          else { pag.drawRectangle({ x: 0, y: 0, width: DW, height: DH, color: L.rgb(FONDO_LISO[0] / 255, FONDO_LISO[1] / 255, FONDO_LISO[2] / 255) }); }
          if (d.tipo === 'titulo') {
            var t = ajustar([[{ t: d.titulo, f: 'b' }]], F, DW * 0.86, DH * 0.4, 30, 72);
            var bloques = [{ filas: t.filas, size: t.size, sep: 0 }];
            if (d.autor) { var a = ajustar([[{ t: d.autor, f: 'n' }]], F, DW * 0.86, DH * 0.12, 16, 28); bloques.push({ filas: a.filas, size: a.size, sep: 22 }); }
            if (d.nota) { var n = ajustar([[{ t: d.nota, f: 'i' }]], F, DW * 0.86, DH * 0.12, 14, 22); bloques.push({ filas: n.filas, size: n.size, sep: 14 }); }
            var total = 0;
            bloques.forEach(function (b) { total += b.sep + b.filas.length * b.size * DIAPO_LH; });
            var yy = (DH - total) / 2;
            bloques.forEach(function (b) { yy += b.sep; dibujarFilas(pag, b.filas, b.size, yy, { opacidad: b === bloques[0] ? 1 : 0.85 }); yy += b.filas.length * b.size * DIAPO_LH; });
            return;
          }
          var r = ajustar(d.lineas, F, DW * 0.86, DH * 0.78, 26, 60);
          var alto = r.filas.length * r.size * DIAPO_LH;
          dibujarFilas(pag, r.filas, r.size, (DH - alto) / 2, null);
          if (d.nombre) {
            var rot = env([{ t: d.nombre, f: 'n' }], DW * 0.86, 20, F);
            dibujarFilas(pag, rot.slice(0, 1), 20, 24, { opacidad: 0.65 });
          }
        }

        // Cada imagen distinta se incrusta una sola vez.
        var distintos = [];
        fondos.forEach(function (f) { if (f && distintos.indexOf(f) === -1) { distintos.push(f); } });
        return secuencial(distintos.length, function (k) {
          return fondoImagen(distintos[k]).then(function (im) { return im ? doc.embedJpg(im.bytes) : null; }).then(function (e) { imagenes[distintos[k].id] = e; });
        }).then(function () {
          return secuencial(canciones.length, function (i) {
            progreso(i + 1, canciones.length);
            var img = fondos[i] ? imagenes[fondos[i].id] : null;
            diapositivasDe(canciones[i], op.esSetlist).forEach(function (d) { diapo(d, img); });
          });
        }).then(function () { return doc.save(); });
      });
    });
  }

  // ---------------------------------------------------------------- PowerPoint

  function cargarPptx() {
    if (window.PptxGenJS) { return Promise.resolve(window.PptxGenJS); }
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PPTX_LIB;
      s.onload = function () { if (window.PptxGenJS) { resolve(window.PptxGenJS); } else { reject(new Error(__('No se pudo cargar el generador de PowerPoint.'))); } };
      s.onerror = function () { reject(new Error(__('No se pudo cargar el generador de PowerPoint.'))); };
      document.head.appendChild(s);
    });
  }

  /** Trozos de las líneas de una estrofa como texto de PowerPoint: cada línea es un párrafo. */
  function trozosPptx(lineas) {
    var out = [];
    lineas.forEach(function (l, i) {
      l.forEach(function (r, j) {
        var o = { bold: r.f === 'b' || r.f === 'bi', italic: r.f === 'i' || r.f === 'bi' };
        if (r.u) { o.underline = { style: 'sng' }; }
        if (j === l.length - 1 && i < lineas.length - 1) { o.breakLine = true; }
        out.push({ text: r.t, options: o });
      });
    });
    return out;
  }

  function generarPptx(Pptx, canciones, fondos, op, nombre, progreso) {
    var pptx = new Pptx();
    pptx.layout = 'LAYOUT_16x9';
    pptx.title = op.titulo || (canciones[0] && canciones[0].titulo) || '';
    pptx.company = CFG.nombre || 'Cancionero';
    var U = 10 / DW;                       // unidades de diapositiva a pulgadas
    var PT = 0.75;                         // unidades a puntos
    var fuentes = fuentesLienzo();
    var base = { fontFace: 'Arial', color: 'FFFFFF', align: 'center', margin: 0, shadow: { type: 'outer', color: '000000', opacity: 0.5, blur: 6, offset: 2, angle: 45 } };
    function opts(extra) { var o = {}, k; for (k in base) { o[k] = base[k]; } for (k in extra) { o[k] = extra[k]; } return o; }

    pptx.defineSlideMaster({ title: 'FONDO_LISO', background: { color: '111827' } });
    var distintos = [];
    fondos.forEach(function (f) { if (f && distintos.indexOf(f) === -1) { distintos.push(f); } });
    var maestras = {};
    return secuencial(distintos.length, function (k) {
      return fondoImagen(distintos[k]).then(function (im) {
        if (!im) { return; }
        var titulo = 'FONDO_' + distintos[k].id;
        pptx.defineSlideMaster({ title: titulo, background: { data: 'image/jpeg;base64,' + aBase64(im.bytes), path: 'fondo.jpg' } });   // «path» solo fija la extensión (jpg) del archivo dentro del .pptx
        maestras[distintos[k].id] = titulo;
      });
    }).then(function () {
      return secuencial(canciones.length, function (i) {
        progreso(i + 1, canciones.length);
        var maestra = fondos[i] && maestras[fondos[i].id] ? maestras[fondos[i].id] : 'FONDO_LISO';
        diapositivasDe(canciones[i], op.esSetlist).forEach(function (d) {
          var slide = pptx.addSlide({ masterName: maestra });
          if (d.tipo === 'titulo') {
            var t = ajustar([[{ t: d.titulo, f: 'b' }]], fuentes, DW * 0.86, DH * 0.4, 30, 72);
            var runs = [{ text: d.titulo, options: { bold: true, fontSize: Math.round(t.size * PT), breakLine: !!(d.autor || d.nota) } }];
            if (d.autor) { runs.push({ text: d.autor, options: { fontSize: 21, breakLine: !!d.nota, paraSpaceBefore: 14 } }); }
            if (d.nota) { runs.push({ text: d.nota, options: { fontSize: 16, italic: true, paraSpaceBefore: 8 } }); }
            slide.addText(runs, opts({ x: DW * 0.07 * U, y: DH * 0.11 * U, w: DW * 0.86 * U, h: DH * 0.78 * U, valign: 'middle' }));
            return;
          }
          var r = ajustar(d.lineas, fuentes, DW * 0.86, DH * 0.78, 26, 60);
          slide.addText(trozosPptx(d.lineas), opts({
            x: DW * 0.07 * U, y: DH * 0.11 * U, w: DW * 0.86 * U, h: DH * 0.78 * U, valign: 'middle',
            fontSize: Math.round(r.size * PT), lineSpacingMultiple: 1.1
          }));
          if (d.nombre) {
            slide.addText(d.nombre, opts({ x: DW * 0.07 * U, y: 14 * U, w: DW * 0.86 * U, h: 36 * U, valign: 'middle', fontSize: 15, transparency: 35, shadow: undefined }));
          }
        });
      });
    }).then(function () { return pptx.writeFile({ fileName: nombre }); });
  }

  // ---------------------------------------------------------------- OpenLyrics y texto

  function xml(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  /** Tonalidad guardada (latina: Do, Mib, La m) en notación inglesa para OpenLyrics (C, Eb, Am); '' si no se reconoce. */
  function tonoIngles(tono) {
    var m = String(tono || '').trim().match(/^(do|re|mi|fa|sol|la|si)\s*([#♯b♭]?)\s*(m(?![a-z]{2})|menor)?/i);
    if (!m) { return ''; }
    var letra = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' }[m[1].toLowerCase()];
    return letra + (/[#♯]/.test(m[2]) ? '#' : /[b♭]/.test(m[2]) ? 'b' : '') + (m[3] ? 'm' : '');
  }

  function sinAcentos(t) { var s = String(t || ''); return (s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s).toLowerCase(); }

  /** Tipo de estrofa de OpenLyrics según el nombre de la sección: v (verso), c (coro), b (puente), p (pre-coro), i (intro), e (final). */
  function tipoOpenLyrics(e) {
    var n = sinAcentos(e.nombre);
    if (!n) { return e.coro ? 'c' : 'v'; }
    if (/pre[\s-]?(coro|estribillo|chorus)/.test(n)) { return 'p'; }
    if (/coro|estribillo|chorus|refrain/.test(n)) { return 'c'; }
    if (/puente|bridge/.test(n)) { return 'b'; }
    if (/intro/.test(n)) { return 'i'; }
    if (/final|outro|coda/.test(n)) { return 'e'; }
    return 'v';
  }

  function generarOpenLyrics(c) {
    var est = P.letra.estrofas(c);
    var contador = {}, vistos = {}, versos = [], orden = [];
    var letras = 'abcdefghijklmnopqrstuvwxyz';
    var i = 0;
    while (i < est.length) {
      // Estrofas seguidas de una misma sección con nombre: partes a, b, c… de un mismo verso.
      var grupo = [est[i]];
      while (est[i].nombre && i + grupo.length < est.length && est[i + grupo.length].nombre === est[i].nombre && est[i + grupo.length].coro === est[i].coro) { grupo.push(est[i + grupo.length]); }
      i += grupo.length;
      var tipo = tipoOpenLyrics(grupo[0]);
      var textos = grupo.map(function (e) { return e.lineas.map(textoLinea); });
      var clave = tipo + '\n' + textos.map(function (t) { return t.join('\n'); }).join('\n\n');
      if (vistos[clave]) { vistos[clave].forEach(function (n) { orden.push(n); }); continue; }
      contador[tipo] = (contador[tipo] || 0) + 1;
      var nombres = [];
      textos.forEach(function (t, k) {
        var nombre = tipo + contador[tipo] + (textos.length > 1 ? letras.charAt(k) : '');
        nombres.push(nombre);
        versos.push('    <verse name="' + nombre + '">\n      <lines>' + t.map(xml).join('<br/>') + '</lines>\n    </verse>');
      });
      vistos[clave] = nombres;
      nombres.forEach(function (n) { orden.push(n); });
    }
    var ahora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    var tono = tonoIngles(c.tonalidad);
    var props = ['    <titles><title>' + xml(c.titulo) + '</title></titles>'];
    if (c.autor) { props.push('    <authors><author>' + xml(c.autor) + '</author></authors>'); }
    if (c.numero) { props.push('    <songbooks><songbook name="' + xml(CFG.nombre || 'Cancionero') + '" entry="' + xml(c.numero) + '"/></songbooks>'); }
    if (+c.tempo > 0) { props.push('    <tempo type="bpm">' + (+c.tempo) + '</tempo>'); }
    if (tono) { props.push('    <key>' + tono + '</key>'); }
    if (orden.length) { props.push('    <verseOrder>' + orden.join(' ') + '</verseOrder>'); }
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9" createdIn="' + xml('Cancionero ' + (CFG.version || '')).trim() + '" modifiedDate="' + ahora + '">\n'
      + '  <properties>\n' + props.join('\n') + '\n  </properties>\n'
      + '  <lyrics>\n' + versos.join('\n') + '\n  </lyrics>\n</song>\n';
  }

  function generarTexto(canciones) {
    return canciones.map(function (c) {
      var estrofas = P.letra.estrofas(c).map(function (e) { return e.lineas.map(textoLinea).join('\n'); });
      return c.titulo + '\n\n' + estrofas.join('\n\n');
    }).join('\n\n\n') + '\n';
  }

  // ---------------------------------------------------------------- diálogo

  function formatos(unica) {
    return [
      { id: 'hoja', titulo: __('Hoja en PDF'), ayuda: __('Para imprimir o leer.') },
      { id: 'pptx', titulo: __('Presentación PowerPoint (.pptx)'), ayuda: __('Una diapositiva por estrofa con imagen de fondo. Se puede editar.') },
      { id: 'diap', titulo: __('Diapositivas en PDF'), ayuda: __('Las mismas diapositivas, para proyectar desde cualquier dispositivo.') },
      unica ? { id: 'openlyrics', titulo: __('OpenLyrics (.xml)'), ayuda: __('Para OpenLP, FreeShow, Quelea…') } : null,
      { id: 'txt', titulo: __('Texto (.txt)'), ayuda: __('Estrofas separadas por una línea en blanco, para pegar o importar en programas de proyección.') }
    ].filter(Boolean);
  }

  /**
   * Abre el diálogo para exportar letras. canciones: [{ titulo, autor, numero, tonalidad, tempo, nota, letra, letraHtml }];
   * opciones: { titulo, fecha, tipo, esSetlist, nombreArchivo }.
   */
  P.exportarLetras = function (canciones, opciones) {
    var op = opciones || {};
    var lista = (canciones || []).filter(function (c) { return c && P.letra.estrofas(c).length; });
    var sinLetra = (canciones || []).filter(function (c) { return c && !P.letra.estrofas(c).length; }).map(function (c) { return c.titulo; });
    var unica = !op.esSetlist && lista.length === 1;
    var FORMATOS = formatos(unica);

    var formato = pref('formato');
    if (!FORMATOS.some(function (f) { return f.id === formato; })) { formato = 'hoja'; }
    var eleccion = String(pref('fondo') || 'azar');
    var fondos = [];
    var enCurso = false;

    var previo = document.activeElement;
    var idTitulo = 'pcan-lx-t-' + Date.now();
    var cuerpo = h('div', { class: 'pcan-modal-cuerpo' });
    var bX = h('button', { type: 'button', class: 'pcan-icon-btn pcan-modal-x', 'aria-label': __('Cerrar'), onclick: function () { cerrar(); } }, icono('cerrar'));
    var errorBox = h('p', { class: 'pcan-form-error', role: 'alert', hidden: true });
    var textoProg = h('span');
    var relleno = h('span');
    var progreso = h('div', { class: 'pcan-modal-progreso', role: 'status', hidden: true }, textoProg, h('div', { class: 'pcan-progress' }, relleno));
    var bCancelar = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sec', onclick: function () { cerrar(); } }, __('Cancelar'));
    var bExportar = h('button', { type: 'button', class: 'pcan-btn pcan-btn-primary', onclick: function () { exportar(); } }, icono('descargar'), __('Exportar'));
    var pie = h('div', { class: 'pcan-modal-pie' }, errorBox, progreso, h('div', { class: 'pcan-modal-acciones' }, bCancelar, bExportar));
    var ventana = h('div', { class: 'pcan-modal pcan-lx', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': idTitulo, tabindex: '-1' },
      h('div', { class: 'pcan-modal-cab' }, h('div', { class: 'pcan-modal-titulo' }, h('h2', { id: idTitulo, text: op.esSetlist ? __('Exportar letras del setlist') : __('Exportar letra') })), bX),
      cuerpo, pie);
    var capa = h('div', { class: 'pcan-modal-capa pcan-lx-capa', onclick: function (e) { if (e.target === capa) { cerrar(); } } }, ventana);
    P.temaEn(capa);

    function cerrar() {
      if (enCurso) { return; }
      if (capa.parentNode) { capa.parentNode.removeChild(capa); }
      try { if (previo && previo.focus && document.contains(previo)) { previo.focus({ preventScroll: true }); } } catch (e) { /* nada */ }
    }
    capa.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); return; }
      if (e.key === 'Tab') {
        var f = Array.prototype.filter.call(ventana.querySelectorAll('a[href], button, input, [tabindex="0"]'), function (el) { return !el.disabled && el.offsetParent !== null; });
        if (!f.length) { e.preventDefault(); ventana.focus(); return; }
        var dentro = ventana.contains(document.activeElement) && document.activeElement !== ventana;
        if (e.shiftKey && (!dentro || document.activeElement === f[0])) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (!dentro || document.activeElement === f[f.length - 1])) { e.preventDefault(); f[0].focus(); }
      }
    });

    // --- formato
    var radiosFormato = {};
    var opcionesFormato = FORMATOS.map(function (f) {
      var r = h('input', { type: 'radio', name: 'pcan-lx-formato', value: f.id, class: 'pcan-lx-radio', checked: f.id === formato });
      radiosFormato[f.id] = r;
      r.addEventListener('change', function () { formato = f.id; pref('formato', formato); actualizar(); });
      return h('label', { class: 'pcan-lx-op' }, r, h('span', { class: 'pcan-lx-op-txt' }, h('strong', { text: f.titulo }), h('small', { text: f.ayuda })));
    });

    // --- fondo
    var cajaFondos = h('div', { class: 'pcan-lx-fondos' });
    var seccionFondo = h('fieldset', { class: 'pcan-lx-grupo', hidden: true }, h('legend', { text: __('Fondo') }), cajaFondos);
    function pintarFondos(cargando) {
      cajaFondos.innerHTML = '';
      if (cargando) { append(cajaFondos, h('p', { class: 'pcan-muted', text: __('Cargando…') })); return; }
      if (eleccion !== 'azar' && eleccion !== 'ninguno' && !fondos.some(function (f) { return String(f.id) === eleccion; })) { eleccion = 'azar'; }
      function ficha(valor, contenido, etiqueta) {
        var r = h('input', { type: 'radio', name: 'pcan-lx-fondo', value: valor, class: 'pcan-lx-radio', checked: eleccion === valor, 'aria-label': etiqueta });
        r.addEventListener('change', function () { eleccion = valor; pref('fondo', valor); marcar(); });
        return h('label', { class: 'pcan-lx-fondo' + (eleccion === valor ? ' is-sel' : '') }, r, contenido);
      }
      var rejilla = h('div', { class: 'pcan-lx-rejilla' },
        ficha('azar', h('span', { class: 'pcan-lx-fondo-txt', text: __('Al azar') }), __('Al azar')),
        ficha('ninguno', h('span', { class: 'pcan-lx-fondo-txt is-liso', text: __('Sin imagen') }), __('Sin imagen')),
        fondos.map(function (f, k) {
          return ficha(String(f.id), h('img', { src: f.miniatura || f.url, alt: sprintf(/* translators: %d: número de la imagen de fondo */ __('Fondo %d'), k + 1), loading: 'lazy' }), sprintf(__('Fondo %d'), k + 1));
        }));
      append(cajaFondos, rejilla);
      if (!fondos.length) {
        append(cajaFondos, h('p', { class: 'pcan-help' }, __('Aún no hay imágenes de fondo.'), ' ',
          CFG.gestionar ? h('a', { href: '#/ajustes/fondos', onclick: function () { enCurso = false; cerrar(); } }, __('Subir fondos en Ajustes')) : null));
      }
    }
    function marcar() {
      Array.prototype.forEach.call(cajaFondos.querySelectorAll('label.pcan-lx-fondo'), function (l) { l.classList.toggle('is-sel', l.querySelector('input').checked); });
    }

    function actualizar() {
      Array.prototype.forEach.call(ventana.querySelectorAll('label.pcan-lx-op'), function (l) { l.classList.toggle('is-sel', l.querySelector('input').checked); });
      seccionFondo.hidden = !(formato === 'pptx' || formato === 'diap');
      bExportar.disabled = enCurso || !lista.length;
    }

    function mostrarError(t) { errorBox.textContent = t || ''; errorBox.hidden = !t; }
    function bloquear(si) {
      enCurso = si;
      bX.disabled = si;
      bCancelar.disabled = si;
      Array.prototype.forEach.call(ventana.querySelectorAll('input'), function (i) { i.disabled = si; });
      progreso.hidden = !si;
      actualizar();
    }
    function avance(i, n) {
      textoProg.textContent = sprintf(/* translators: 1: canción que se está preparando, 2: total de canciones */ __('Preparando… %1$d de %2$d'), i, n);
      relleno.style.width = Math.round((i - 1) / n * 100) + '%';
    }

    // --- contenido
    append(cuerpo, [
      lista.length ? h('p', { class: 'pcan-help', text: op.esSetlist || lista.length > 1
        ? sprintf(_n('%d canción con letra.', '%d canciones con letra.', lista.length), lista.length)
        : lista[0].titulo }) : h('p', { class: 'pcan-form-error', text: __('Ninguna de las canciones tiene letra, así que no hay nada que exportar.') }),
      sinLetra.length && lista.length ? h('p', { class: 'pcan-help', text: sprintf(/* translators: %s: títulos de las canciones sin letra, separados por comas */ __('Sin letra (se omiten): %s'), sinLetra.join(', ')) }) : null,
      h('fieldset', { class: 'pcan-lx-grupo' }, h('legend', { text: __('Formato') }), h('div', { class: 'pcan-lx-ops' }, opcionesFormato)),
      seccionFondo]);

    /** Genera y entrega el archivo; devuelve una promesa con el texto del aviso de éxito. */
    function exportar() {
      if (enCurso || !lista.length) { return; }
      mostrarError('');
      var f = formato;
      // La pestaña del PDF se abre ya, en el propio clic, o el navegador la bloquearía.
      var ventanaPdf = (f === 'hoja' || f === 'diap') ? P.pdf.abrirVentana(__('Preparando las letras…')) : null;
      bloquear(true);
      avance(1, lista.length);
      fondoFallo = false;
      var elegidos = [];
      // Si la lista de fondos aún se está cargando, se espera a tenerla antes de repartirlos.
      var conFondos = (f === 'pptx' || f === 'diap') ? cargaFondos.then(function () { elegidos = repartirFondos(lista.length, eleccion, fondos); }) : Promise.resolve();

      function entregarPdf(bytes, nombre) {
        var abierta = false;
        if (ventanaPdf && !ventanaPdf.closed) {
          try { P.pdf.mostrarEnVentana(ventanaPdf, bytes, nombre); abierta = true; } catch (e) { abierta = false; }
        }
        if (!abierta) { P.pdf.guardar(bytes, nombre); }
        return abierta ? __('PDF abierto en una pestaña nueva.') : __('PDF descargado.');
      }

      var tarea;
      if (f === 'hoja') {
        tarea = P.pdf.cargar().then(function (L) { return generarHoja(L, lista, op, avance); }).then(function (bytes) { return entregarPdf(bytes, nombreBase(op, 'letra', 'letras') + '.pdf'); });
      } else if (f === 'diap') {
        tarea = conFondos.then(function () { return P.pdf.cargar(); }).then(function (L) { return generarDiapositivasPdf(L, lista, elegidos, op, avance); }).then(function (bytes) { return entregarPdf(bytes, nombreBase(op, 'diapositivas') + '.pdf'); });
      } else if (f === 'pptx') {
        tarea = conFondos.then(function () { return cargarPptx(); }).then(function (Pptx) { return generarPptx(Pptx, lista, elegidos, op, nombreBase(op, 'letra', 'letras') + '.pptx', avance); }).then(function () { return __('Presentación descargada.'); });
      } else if (f === 'openlyrics') {
        tarea = Promise.resolve().then(function () {
          descargar(generarOpenLyrics(lista[0]), slug(op.nombreArchivo || lista[0].titulo) + '.xml', 'application/xml;charset=utf-8');
          return __('Archivo OpenLyrics descargado.');
        });
      } else {
        tarea = Promise.resolve().then(function () {
          descargar(generarTexto(lista), nombreBase(op, 'letra', 'letras') + '.txt', 'text/plain;charset=utf-8');
          return __('Texto descargado.');
        });
      }

      tarea.then(function (mensaje) {
        enCurso = false;
        cerrar();
        var extra = [];
        if (fondoFallo) { extra.push(__('No se pudo cargar alguna imagen de fondo; se usó el fondo liso.')); }
        if (sinLetra.length) { extra.push(sprintf(/* translators: %s: títulos de las canciones sin letra, separados por comas */ __('Sin letra: %s'), sinLetra.join(', '))); }
        aviso([mensaje].concat(extra).join(' '), undefined, extra.length ? 7000 : 2600);
      }).catch(function (e) {
        var msj = e && e.message ? e.message : __('No se pudo exportar la letra.');
        if (ventanaPdf) { P.pdf.errorEnVentana(ventanaPdf, msj); }
        bloquear(false);
        mostrarError(msj);
        aviso(msj, 'error');
      });
    }

    var raiz = (P.ui && P.ui.panel && P.ui.panel.closest && P.ui.panel.closest('.pcan')) || document.body;
    raiz.appendChild(capa);
    actualizar();
    ventana.focus({ preventScroll: true });

    // Los fondos se piden al abrir (solo hacen falta para las diapositivas).
    pintarFondos(true);
    var cargaFondos = api('fondos').then(function (r) { fondos = (r && r.fondos) || []; }).catch(function () { fondos = []; }).then(function () { pintarFondos(false); });
  };
})();
