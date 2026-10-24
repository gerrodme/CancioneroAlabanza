/* Cancionero · visor de partituras para tableta
 *
 * - Pinta cada página con PDF.js (o la imagen) y recorta el margen en blanco para aprovechar la pantalla.
 * - Las páginas se pasan en horizontal: deslizar, tocar los laterales, flechas, AvPág/RePág o pedal Bluetooth.
 * - En horizontal (tableta apaisada) muestra dos páginas a la vez de la misma canción.
 */
(function () {
  'use strict';

  var P = window.PCAN;
  if (!P) { return; }
  var h = P.h, append = P.append, icono = P.icono;

  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  // ---------------------------------------------------------------- carga de documentos

  var pdfjsPromesa = null;
  function cargarPdfjs() {
    if (window.pdfjsLib) { return Promise.resolve(window.pdfjsLib); }
    if (pdfjsPromesa) { return pdfjsPromesa; }
    pdfjsPromesa = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PDFJS;
      s.onload = function () {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        resolve(window.pdfjsLib);
      };
      s.onerror = function () { pdfjsPromesa = null; reject(new Error('No se pudo cargar el visor de PDF.')); };
      document.head.appendChild(s);
    });
    return pdfjsPromesa;
  }

  var documentos = {};

  /** Devuelve { paginas, base(n), pintar(n, ctx, escala, dx, dy) } para un PDF o una imagen. */
  function abrirDocumento(fuente) {
    var clave = fuente.url;
    if (documentos[clave]) { return documentos[clave]; }

    if (fuente.tipo === 'pdf') {
      documentos[clave] = cargarPdfjs().then(function (lib) {
        return lib.getDocument({ url: fuente.url, withCredentials: true }).promise;
      }).then(function (pdf) {
        var paginas = {};
        function pagina(n) { return paginas[n] || (paginas[n] = pdf.getPage(n)); }
        return {
          paginas: pdf.numPages,
          base: function (n) {
            return pagina(n).then(function (pg) { var vp = pg.getViewport({ scale: 1 }); return { w: vp.width, h: vp.height }; });
          },
          pintar: function (n, ctx, escala, dx, dy) {
            return pagina(n).then(function (pg) {
              return pg.render({ canvasContext: ctx, viewport: pg.getViewport({ scale: escala }), transform: [1, 0, 0, 1, dx, dy] }).promise;
            });
          }
        };
      });
    } else {
      documentos[clave] = new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          resolve({
            paginas: 1,
            base: function () { return Promise.resolve({ w: img.naturalWidth, h: img.naturalHeight }); },
            pintar: function (n, ctx, escala, dx, dy) {
              ctx.drawImage(img, dx, dy, img.naturalWidth * escala, img.naturalHeight * escala);
              return Promise.resolve();
            }
          });
        };
        img.onerror = function () { reject(new Error('No se pudo cargar la imagen.')); };
        img.src = fuente.url;
      });
    }
    documentos[clave].catch(function () { delete documentos[clave]; });
    return documentos[clave];
  }

  // ---------------------------------------------------------------- recorte del margen en blanco

  var recortes = {};

  /** Caja con contenido de la página, en fracciones (0–1) del tamaño original. */
  function recorte(fuente, doc, n) {
    var clave = fuente.url + '#' + n;
    if (recortes[clave]) { return recortes[clave]; }
    recortes[clave] = doc.base(n).then(function (base) {
      var escala = 900 / Math.max(base.w, base.h);
      var w = Math.max(1, Math.round(base.w * escala));
      var alto = Math.max(1, Math.round(base.h * escala));
      var lienzo = document.createElement('canvas');
      lienzo.width = w;
      lienzo.height = alto;
      var ctx = lienzo.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, alto);
      return doc.pintar(n, ctx, escala, 0, 0).then(function () { return cajaConTinta(ctx, w, alto); });
    }).catch(function () { return { x: 0, y: 0, w: 1, h: 1 }; });
    return recortes[clave];
  }

  /** La misma caja con contenido, para quien no tiene el documento abierto (el PDF del setlist). */
  function cajaContenido(fuente, n) {
    return abrirDocumento(fuente).then(function (doc) { return recorte(fuente, doc, n); });
  }

  function cajaConTinta(ctx, w, alto) {
    var d = ctx.getImageData(0, 0, w, alto).data;
    var filas = new Uint32Array(alto);
    var cols = new Uint32Array(w);
    for (var y = 0; y < alto; y++) {
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        if (d[i + 3] > 16 && (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) < 190000) { filas[y]++; cols[x]++; }
      }
    }
    // Se ignoran motas sueltas (polvo del escáner): una fila o columna cuenta si tiene algo de tinta de verdad.
    var minFila = Math.max(2, w * 0.003), minCol = Math.max(2, alto * 0.003);
    var y0 = 0, y1 = alto - 1, x0 = 0, x1 = w - 1;
    while (y0 < alto && filas[y0] < minFila) { y0++; }
    while (y1 > y0 && filas[y1] < minFila) { y1--; }
    while (x0 < w && cols[x0] < minCol) { x0++; }
    while (x1 > x0 && cols[x1] < minCol) { x1--; }
    if (y0 >= y1 || x0 >= x1) { return { x: 0, y: 0, w: 1, h: 1 }; }
    var margen = Math.round(Math.max(w, alto) * 0.012);
    x0 = Math.max(0, x0 - margen); y0 = Math.max(0, y0 - margen);
    x1 = Math.min(w, x1 + margen); y1 = Math.min(alto, y1 + margen);
    return { x: x0 / w, y: y0 / alto, w: (x1 - x0) / w, h: (y1 - y0) / alto };
  }

  /** Pinta la página recortada para que quepa en W×H (px CSS). */
  function pintarPagina(fuente, n, W, H) {
    return abrirDocumento(fuente).then(function (doc) {
      return Promise.all([doc.base(n), recorte(fuente, doc, n)]).then(function (r) {
        var base = r[0], bb = r[1];
        var cw = bb.w * base.w, ch = bb.h * base.h;
        var ajuste = Math.min(W / cw, H / ch);
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var escala = ajuste * dpr;
        var lienzo = document.createElement('canvas');
        lienzo.className = 'pcan-pagina';
        lienzo.width = Math.max(1, Math.round(cw * escala));
        lienzo.height = Math.max(1, Math.round(ch * escala));
        lienzo.style.width = Math.round(cw * ajuste) + 'px';
        lienzo.style.height = Math.round(ch * ajuste) + 'px';
        var ctx = lienzo.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, lienzo.width, lienzo.height);
        return doc.pintar(n, ctx, escala, -bb.x * base.w * escala, -bb.y * base.h * escala).then(function () { return lienzo; });
      });
    });
  }

  // ---------------------------------------------------------------- escenario (páginas en horizontal)

  /**
   * opciones: { canciones: [{ titulo, partitura: {url, tipo} }], dosPaginas: true, alCambiar(estado), alTocarCentro() }
   */
  function crearEscenario(opciones) {
    var canciones = opciones.canciones;
    var el = h('div', { class: 'pcan-escenario' });
    var capaToque = h('div', { class: 'pcan-escenario-toque', 'aria-hidden': 'true' });
    var aviso = h('div', { class: 'pcan-escenario-msg', role: 'status', text: 'Cargando partitura…' });
    append(el, [aviso, capaToque]);

    var paginas = []; // [{ c: índice de canción, n: página }]
    var pliegos = []; // [[índices de paginas], ...]
    var actual = 0;
    var hoja = null;
    var turno = 0;
    var destruido = false;
    var listo = false;

    function dosALaVez() {
      if (opciones.dosPaginas === false) { return false; }
      return el.clientWidth / Math.max(1, el.clientHeight) > 1.15;
    }

    function calcularPliegos() {
      var dos = dosALaVez();
      pliegos = [];
      var porCancion = {};
      paginas.forEach(function (p, i) { (porCancion[p.c] = porCancion[p.c] || []).push(i); });
      canciones.forEach(function (c, ci) {
        var lista = porCancion[ci] || [];
        for (var k = 0; k < lista.length; k += dos ? 2 : 1) { pliegos.push(lista.slice(k, k + (dos ? 2 : 1))); }
      });
    }

    function cargar() {
      paginas = [];
      listo = false;
      return Promise.all(canciones.map(function (c) {
        if (!c.partitura) { return Promise.resolve(0); }
        return abrirDocumento(c.partitura).then(function (d) { return d.paginas; }).catch(function () { return 0; });
      })).then(function (cuentas) {
        cuentas.forEach(function (n, ci) {
          for (var k = 1; k <= n; k++) { paginas.push({ c: ci, n: k }); }
        });
        listo = true;
        calcularPliegos();
        if (!paginas.length) { aviso.textContent = 'No se pudo abrir la partitura.'; aviso.hidden = false; }
      });
    }

    function estado() {
      var pl = pliegos[actual] || [];
      var p = paginas[pl[0]];
      if (!p) { return { cancion: 0, pagina: 0, paginas: 0, pliego: actual, pliegos: pliegos.length }; }
      var total = paginas.filter(function (q) { return q.c === p.c; }).length;
      var ultima = paginas[pl[pl.length - 1]].n;
      return { cancion: p.c, pagina: p.n, hasta: ultima, paginas: total, pliego: actual, pliegos: pliegos.length };
    }

    function mostrar(indice, direccion) {
      if (!listo || !pliegos.length) { return Promise.resolve(); }
      actual = Math.max(0, Math.min(indice, pliegos.length - 1));
      var mio = ++turno;
      var pl = pliegos[actual];
      var W = el.clientWidth, H = el.clientHeight;
      // Aún sin tamaño (no está en pantalla): el observador de tamaño lo pintará cuando lo tenga.
      if (W < 10 || H < 10) { if (opciones.alCambiar) { opciones.alCambiar(estado()); } return Promise.resolve(); }
      var hueco = pl.length > 1 ? 10 : 0;
      var anchoHuecoTotal = hueco * (pl.length - 1);
      var slotW = (W - anchoHuecoTotal) / pl.length;
      if (opciones.alCambiar) { opciones.alCambiar(estado()); }
      aviso.hidden = true;

      return Promise.all(pl.map(function (pi) {
        var p = paginas[pi];
        return pintarPagina(canciones[p.c].partitura, p.n, slotW, H);
      })).then(function (lienzos) {
        if (mio !== turno || destruido) { return; }
        var nueva = h('div', { class: 'pcan-hoja' + (direccion ? ' entra-' + (direccion > 0 ? 'derecha' : 'izquierda') : '') }, lienzos);
        var vieja = hoja;
        el.insertBefore(nueva, capaToque);
        hoja = nueva;
        if (vieja) {
          vieja.classList.add(direccion > 0 ? 'sale-izquierda' : direccion < 0 ? 'sale-derecha' : 'sale');
          setTimeout(function () { vieja.remove(); }, 260);
        }
        requestAnimationFrame(function () { nueva.classList.remove('entra-derecha', 'entra-izquierda'); });
        // Se prepara la siguiente página para que el paso sea instantáneo.
        var sig = pliegos[actual + 1];
        if (sig) { sig.forEach(function (pi) { var p = paginas[pi]; abrirDocumento(canciones[p.c].partitura).then(function (d) { recorte(canciones[p.c].partitura, d, p.n); }); }); }
      }).catch(function (e) {
        if (mio !== turno) { return; }
        aviso.textContent = e.message || 'No se pudo mostrar la página.';
        aviso.hidden = false;
      });
    }

    function siguiente() { if (actual < pliegos.length - 1) { mostrar(actual + 1, 1); return true; } return false; }
    function anterior() { if (actual > 0) { mostrar(actual - 1, -1); return true; } return false; }

    function irACancion(ci, alFinal) {
      for (var i = 0; i < pliegos.length; i++) {
        if (paginas[pliegos[i][0]].c === ci) {
          if (alFinal) { while (pliegos[i + 1] && paginas[pliegos[i + 1][0]].c === ci) { i++; } }
          return mostrar(i, i > actual ? 1 : i < actual ? -1 : 0);
        }
      }
      return Promise.resolve();
    }

    // Gestos: deslizar o tocar el tercio izquierdo/derecho.
    var inicio = null;
    capaToque.addEventListener('pointerdown', function (e) { inicio = { x: e.clientX, y: e.clientY, t: Date.now() }; });
    capaToque.addEventListener('pointerup', function (e) {
      if (!inicio) { return; }
      var dx = e.clientX - inicio.x, dy = e.clientY - inicio.y;
      var rect = el.getBoundingClientRect();
      inicio = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (dx < 0) { siguiente(); } else { anterior(); }
      } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        var rel = (e.clientX - rect.left) / rect.width;
        if (rel < 0.3) { anterior(); }
        else if (rel > 0.7) { siguiente(); }
        else if (opciones.alTocarCentro) { opciones.alTocarCentro(); }
      }
    });
    capaToque.addEventListener('pointercancel', function () { inicio = null; });

    // Al girar la tableta o cambiar el tamaño se recalcula (una o dos páginas) y se repinta.
    var temporizador = null;
    var observador = window.ResizeObserver ? new ResizeObserver(function () {
      clearTimeout(temporizador);
      temporizador = setTimeout(function () {
        if (!listo || !el.clientWidth) { return; }
        var primera = (pliegos[actual] || [0])[0];
        calcularPliegos();
        var nuevo = 0;
        pliegos.forEach(function (pl, i) { if (pl.indexOf(primera) !== -1) { nuevo = i; } });
        mostrar(nuevo, 0);
      }, 150);
    }) : null;
    if (observador) { observador.observe(el); }

    var promesa = cargar();

    return {
      el: el,
      listo: promesa,
      mostrar: function (i) { return promesa.then(function () { return mostrar(i || 0, 0); }); },
      siguiente: siguiente,
      anterior: anterior,
      irACancion: function (ci, alFinal) { return promesa.then(function () { return irACancion(ci, alFinal); }); },
      estado: estado,
      cambiarFuente: function (ci, fuente) {
        canciones[ci].partitura = fuente;
        promesa = cargar().then(function () { return irACancion(ci); });
        return promesa;
      },
      destruir: function () { destruido = true; if (observador) { observador.disconnect(); } el.remove(); }
    };
  }

  // ---------------------------------------------------------------- lector a pantalla completa

  /**
   * opciones: { titulo, canciones: [{ id, titulo, numero, tono, tempo, nota, letra, partituras: [...] }], inicio, alCerrar(), alCambiar(i) }
   */
  function abrirLector(opciones) {
    var canciones = opciones.canciones;
    var variante = canciones.map(function () { return 0; });
    var cancionActual = -1;
    var verLetra = false;
    var wakeLock = null;

    var titulo = h('div', { class: 'pcan-lector-titulo' });
    var btnLetra = h('button', { type: 'button', class: 'pcan-chip-btn', onclick: function () { alternarLetra(); } }, icono('letra'), h('span', { text: 'Letra' }));
    var selVariante = h('select', { class: 'pcan-lector-variante', 'aria-label': 'Versión de la partitura', onchange: function () { cambiarVariante(+selVariante.value); } });
    var paginaInfo = h('span', { class: 'pcan-lector-pagina' });
    var letra = h('div', { class: 'pcan-lector-letra', hidden: true });
    var pastillas = h('div', { class: 'pcan-lector-canciones', role: 'tablist', 'aria-label': 'Canciones' });

    var escenario = crearEscenario({
      canciones: canciones.map(function (c) { return { titulo: c.titulo, partitura: c.partituras[0] || null }; }),
      alCambiar: actualizar,
      alTocarCentro: function () { capa.classList.toggle('is-limpio'); }
    });

    var flechaIzq = h('button', { type: 'button', class: 'pcan-lector-flecha is-izq', 'aria-label': 'Página anterior', onclick: function () { anterior(); } }, icono('anterior'));
    var flechaDer = h('button', { type: 'button', class: 'pcan-lector-flecha is-der', 'aria-label': 'Página siguiente', onclick: function () { siguiente(); } }, icono('siguiente'));

    var capa = h('div', { class: 'pcan-lector', role: 'dialog', 'aria-modal': 'true', 'aria-label': opciones.titulo || 'Partitura', tabindex: '-1' },
      h('div', { class: 'pcan-lector-barra' },
        h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': 'Cerrar', onclick: cerrar }, icono('cerrar')),
        titulo,
        selVariante,
        btnLetra,
        h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': 'Pantalla completa', title: 'Pantalla completa', onclick: pantallaCompleta }, icono('expandir'))),
      h('div', { class: 'pcan-lector-cuerpo' }, escenario.el, letra, flechaIzq, flechaDer),
      h('div', { class: 'pcan-lector-pie' }, pastillas, paginaInfo));
    P.temaEn(capa);

    canciones.forEach(function (c, i) {
      append(pastillas, h('button', {
        type: 'button', role: 'tab', class: 'pcan-lector-pastilla', title: c.titulo,
        onclick: function () { verLetra = false; mostrarLetra(); escenario.irACancion(i); }
      }, h('span', { class: 'pcan-lector-pastilla-n', text: String(i + 1) }), h('span', { class: 'pcan-lector-pastilla-t', text: c.titulo })));
    });
    if (canciones.length < 2) { pastillas.hidden = true; }

    function actualizar(est) {
      var c = canciones[est.cancion];
      if (est.cancion !== cancionActual) {
        cancionActual = est.cancion;
        titulo.innerHTML = '';
        append(titulo, [
          canciones.length > 1 ? h('span', { class: 'pcan-lector-n', text: (est.cancion + 1) + '/' + canciones.length }) : null,
          h('strong', { text: (c.numero ? c.numero + ' · ' : '') + c.titulo }),
          c.tono ? h('span', { class: 'pcan-tono', text: c.tono }) : null,
          c.tempo ? h('span', { class: 'pcan-lector-tempo', title: c.tempo + ' pulsaciones por minuto', text: '♩ = ' + c.tempo }) : null,
          c.nota ? h('span', { class: 'pcan-lector-nota', text: c.nota }) : null
        ]);
        btnLetra.hidden = !c.letra;
        selVariante.innerHTML = '';
        selVariante.hidden = c.partituras.length < 2;
        c.partituras.forEach(function (p, k) { append(selVariante, h('option', { value: String(k), text: p.label || 'Partitura ' + (k + 1) })); });
        selVariante.value = String(variante[est.cancion]);
        Array.prototype.forEach.call(pastillas.children, function (b, k) {
          b.classList.toggle('is-active', k === est.cancion);
          b.setAttribute('aria-selected', k === est.cancion ? 'true' : 'false');
          if (k === est.cancion && b.scrollIntoView) { b.scrollIntoView({ block: 'nearest', inline: 'center' }); }
        });
        if (opciones.alCambiar) { opciones.alCambiar(est.cancion); }
      }
      paginaInfo.textContent = est.paginas ? 'Pág. ' + (est.hasta > est.pagina ? est.pagina + '–' + est.hasta : est.pagina) + ' de ' + est.paginas : '';
      flechaIzq.disabled = est.pliego === 0;
      flechaDer.disabled = est.pliego >= est.pliegos - 1;
    }

    function cambiarVariante(k) {
      variante[cancionActual] = k;
      var ci = cancionActual;
      cancionActual = -1;
      escenario.cambiarFuente(ci, canciones[ci].partituras[k]);
    }

    function mostrarLetra() {
      var c = canciones[Math.max(0, cancionActual)];
      letra.hidden = !verLetra;
      escenario.el.hidden = verLetra;
      btnLetra.classList.toggle('is-active', verLetra);
      if (verLetra) { letra.textContent = c.letra; letra.scrollTop = 0; }
    }

    function alternarLetra() { verLetra = !verLetra; mostrarLetra(); }

    // En modo letra, «siguiente» salta a la siguiente canción.
    function siguiente() {
      if (verLetra) { if (cancionActual < canciones.length - 1) { verLetra = false; mostrarLetra(); escenario.irACancion(cancionActual + 1); } return; }
      escenario.siguiente();
    }
    function anterior() {
      if (verLetra) { verLetra = false; mostrarLetra(); return; }
      escenario.anterior();
    }

    function teclas(e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { return; }
      if (['ArrowRight', 'PageDown', ' ', 'ArrowDown', 'Enter'].indexOf(e.key) !== -1) { e.preventDefault(); siguiente(); }
      else if (['ArrowLeft', 'PageUp', 'ArrowUp', 'Backspace'].indexOf(e.key) !== -1) { e.preventDefault(); anterior(); }
      else if (e.key === 'Home') { e.preventDefault(); escenario.irACancion(cancionActual); }
      else if (e.key === 'l' || e.key === 'L') { if (canciones[cancionActual] && canciones[cancionActual].letra) { alternarLetra(); } }
      else if (e.key === 'f' || e.key === 'F') { pantallaCompleta(); }
      else if (e.key === 'Escape' && !document.fullscreenElement) { cerrar(); }
    }

    function pantallaCompleta() {
      if (document.fullscreenElement) { document.exitFullscreen(); }
      else if (capa.requestFullscreen) { capa.requestFullscreen().catch(function () { P.aviso('Este navegador no permite pantalla completa', 'error'); }); }
    }

    function cerrar() {
      document.removeEventListener('keydown', teclas);
      if (document.fullscreenElement) { document.exitFullscreen().catch(function () {}); }
      if (wakeLock) { wakeLock.release().catch(function () {}); }
      escenario.destruir();
      capa.remove();
      document.documentElement.classList.remove('pcan-lock');
      if (opciones.alCerrar) { opciones.alCerrar(); }
    }

    document.body.appendChild(capa);
    document.documentElement.classList.add('pcan-lock');
    document.addEventListener('keydown', teclas);
    // Mantiene la pantalla encendida mientras se toca.
    if (navigator.wakeLock) { navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }).catch(function () {}); }
    capa.focus();
    escenario.irACancion(Math.max(0, Math.min(opciones.inicio || 0, canciones.length - 1)));

    return { cerrar: cerrar, irACancion: function (i) { return escenario.irACancion(i); } };
  }

  // ---------------------------------------------------------------- visor compacto (ficha de canción)

  function visorCompacto(cancion, partitura, alPantallaCompleta) {
    var info = h('span', { class: 'pcan-visor-info' });
    var prev = h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': 'Página anterior', onclick: function () { esc.anterior(); } }, icono('anterior'));
    var next = h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': 'Página siguiente', onclick: function () { esc.siguiente(); } }, icono('siguiente'));
    var esc = crearEscenario({
      canciones: [{ titulo: cancion.titulo, partitura: partitura }],
      alCambiar: function (e) {
        info.textContent = e.paginas ? 'Pág. ' + (e.hasta > e.pagina ? e.pagina + '–' + e.hasta : e.pagina) + ' de ' + e.paginas : '';
        prev.disabled = e.pliego === 0;
        next.disabled = e.pliego >= e.pliegos - 1;
      },
      alTocarCentro: alPantallaCompleta
    });
    var caja = h('div', { class: 'pcan-visor' },
      h('div', { class: 'pcan-visor-marco' }, esc.el),
      h('div', { class: 'pcan-visor-controles' }, prev, info, next,
        h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-visor-full', onclick: alPantallaCompleta }, icono('expandir'), 'Pantalla completa')));
    esc.mostrar(0);
    return { el: caja, destruir: esc.destruir };
  }

  P.Visor = { crearEscenario: crearEscenario, abrirLector: abrirLector, visorCompacto: visorCompacto, cajaContenido: cajaContenido };
})();
