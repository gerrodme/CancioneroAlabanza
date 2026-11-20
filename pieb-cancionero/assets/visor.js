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
  // Atajos de traducción compartidos por cancionero.js (este archivo se carga después y depende de él).
  var __ = P.__, sprintf = P.sprintf;

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
      s.onerror = function () { pdfjsPromesa = null; reject(new Error(__('No se pudo cargar el visor de PDF.'))); };
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
        img.onerror = function () { reject(new Error(__('No se pudo cargar la imagen.'))); };
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
    var aviso = h('div', { class: 'pcan-escenario-msg', role: 'status', text: __('Cargando partitura…') });
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
        if (!paginas.length) { aviso.textContent = __('No se pudo abrir la partitura.'); aviso.hidden = false; }
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
        aviso.textContent = e.message || __('No se pudo mostrar la página.');
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

  /** «Pág. 2 de 5» (o «Pág. 1–2 de 5» cuando se ven dos páginas a la vez). */
  function textoPagina(est) {
    if (!est.paginas) { return ''; }
    return sprintf(/* translators: 1: página que se ve («2») o páginas («1–2»), 2: total de páginas de la partitura */ __('Pág. %1$s de %2$d'), est.hasta > est.pagina ? est.pagina + '–' + est.hasta : est.pagina, est.paginas);
  }

  // ---------------------------------------------------------------- metrónomo del lector

  var METRO_MIN = 20, METRO_MAX = 300, METRO_DEFECTO = 100;

  function leerAlmacen(clave, defecto) {
    try { var v = window.localStorage.getItem(clave); return v === null ? defecto : v; } catch (e) { return defecto; }
  }
  function guardarAlmacen(clave, valor) {
    try { window.localStorage.setItem(clave, String(valor)); } catch (e) { /* sin almacenamiento: vale solo para esta sesión */ }
  }

  /** Tempo de una canción como entero válido (20–300), o 0 si no lo tiene. */
  function tempoValido(tempo) {
    var n = parseInt(tempo, 10);
    return n >= METRO_MIN && n <= METRO_MAX ? n : 0;
  }

  function limitarTempo(n) { return Math.max(METRO_MIN, Math.min(METRO_MAX, Math.round(n))); }

  /**
   * Metrónomo con Web Audio. Programa los clics por adelantado (setInterval de 25 ms que agenda 100 ms por delante con
   * audioContext.currentTime) para que no dependa de la precisión de los temporizadores. Ocultar el panel NO lo para:
   * el botón de la barra muestra un pulso pequeño mientras suena y el botón «Parar» está siempre en el panel.
   * `boton` es el botón de la barra (lo crea quien lo usa). Devuelve { panel, alternar(), cambiarCancion(i), destruir() }.
   */
  function crearMetronomo(canciones, boton) {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = null;
    var sonando = false;
    var bpm = METRO_DEFECTO;
    var ultimoBpm = METRO_DEFECTO;
    var manual = {};          // tempo ajustado a mano, por posición de canción, mientras el lector está abierto
    var cancion = -1;
    var compas = parseInt(leerAlmacen('pcan-metro-compas', '4'), 10);
    if ([1, 2, 3, 4, 6].indexOf(compas) === -1) { compas = 4; }
    var conSonido = leerAlmacen('pcan-metro-sonido', '1') !== '0';
    var abierto = leerAlmacen('pcan-metro-abierto', '0') === '1';
    var temporizador = null, cuadro = 0, pulsoTimer = null;
    var proximo = 0, pulso = 0, cola = [];
    var toques = [];
    var repetir = null;

    // --- interfaz
    var campo = h('input', {
      type: 'number', class: 'pcan-metro-bpm', min: String(METRO_MIN), max: String(METRO_MAX), step: '1', inputmode: 'numeric',
      'aria-label': __('Pulsaciones por minuto'),
      onchange: function () { fijar(parseInt(campo.value, 10), true); },
      onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); campo.blur(); } }
    });
    function botonPaso(texto, etiqueta, delta) {
      var b = h('button', { type: 'button', class: 'pcan-metro-paso', 'aria-label': etiqueta, title: etiqueta, text: texto });
      // Al mantener pulsado repite; el clic con teclado (detail 0) da un solo paso.
      b.addEventListener('pointerdown', function (e) {
        if (e.button) { return; }
        paso(delta);
        detenerRepeticion();
        repetir = setTimeout(function () { repetir = setInterval(function () { paso(delta); }, 80); }, 450);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (n) { b.addEventListener(n, detenerRepeticion); });
      b.addEventListener('click', function (e) { if (e.detail === 0) { paso(delta); } });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      return b;
    }
    function detenerRepeticion() { if (repetir) { clearTimeout(repetir); clearInterval(repetir); repetir = null; } }
    function paso(delta) { fijar(bpm + delta, true); }

    var btnMenos = botonPaso('−', __('Bajar un pulso por minuto'), -1);
    var btnMas = botonPaso('+', __('Subir un pulso por minuto'), 1);
    var btnMarcar = h('button', { type: 'button', class: 'pcan-metro-sec', title: __('Toca varias veces al ritmo para calcular el tempo'), onclick: marcar, text: __('Marcar') });
    var btnCancion = h('button', { type: 'button', class: 'pcan-metro-enlace', onclick: function () { delete manual[cancion]; fijar(tempoValido(canciones[cancion].tempo) || ultimoBpm, false); } });
    var selCompas = h('select', { class: 'pcan-metro-compas', 'aria-label': __('Pulsos por compás'), onchange: function () { compas = +selCompas.value; guardarAlmacen('pcan-metro-compas', compas); pulso = 0; pintarPuntos(); } });
    [1, 2, 3, 4, 6].forEach(function (n) { append(selCompas, h('option', { value: String(n), text: String(n) })); });
    selCompas.value = String(compas);
    var puntos = h('div', { class: 'pcan-metro-puntos', 'aria-hidden': 'true' });
    var btnSonido = h('button', { type: 'button', class: 'pcan-metro-sec', onclick: function () { conSonido = !conSonido; guardarAlmacen('pcan-metro-sonido', conSonido ? '1' : '0'); pintarSonido(); } });
    var btnMarcha = h('button', { type: 'button', class: 'pcan-metro-marcha', onclick: function () { if (sonando) { parar(); } else { empezar(); } } });
    var btnOcultar = h('button', { type: 'button', class: 'pcan-metro-sec', onclick: function () { alternar(); }, text: __('Ocultar') });

    var panel = h('div', { class: 'pcan-metro', role: 'group', 'aria-label': __('Metrónomo'), hidden: !abierto },
      h('div', { class: 'pcan-metro-cab' }, h('strong', { text: __('Metrónomo') }), btnOcultar),
      h('div', { class: 'pcan-metro-fila' },
        btnMenos, h('label', { class: 'pcan-metro-valor' }, campo, h('span', { text: 'BPM' })), btnMas, btnMarcar),
      h('div', { class: 'pcan-metro-fila' },
        h('label', { class: 'pcan-metro-compas-l' }, h('span', { text: __('Compás') }), selCompas), puntos, btnSonido),
      h('div', { class: 'pcan-metro-fila' }, btnMarcha),
      btnCancion);
    // Las teclas de página del lector no deben dispararse al usar los botones del panel (Espacio e Intro los activan).
    panel.addEventListener('keydown', function (e) {
      if ([' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'Backspace'].indexOf(e.key) !== -1) { e.stopPropagation(); }
    });

    var pulsoBoton = h('i', { class: 'pcan-metro-pulso', 'aria-hidden': 'true', hidden: true });
    boton.insertBefore(pulsoBoton, boton.lastChild);
    boton.addEventListener('click', function () { alternar(); });

    function pintarBoton() {
      boton.classList.toggle('is-active', abierto);
      boton.setAttribute('aria-pressed', abierto ? 'true' : 'false');
      boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
      pulsoBoton.hidden = !sonando;
    }
    function pintarSonido() { btnSonido.textContent = conSonido ? __('Sonido: sí') : __('Sonido: no'); btnSonido.setAttribute('aria-pressed', conSonido ? 'true' : 'false'); }
    function pintarMarcha() {
      btnMarcha.textContent = sonando ? __('Parar') : __('Empezar');
      btnMarcha.classList.toggle('is-parar', sonando);
      pintarBoton();
    }
    function pintarPuntos(activo) {
      if (puntos.children.length !== compas) {
        puntos.innerHTML = '';
        for (var i = 0; i < compas; i++) { append(puntos, h('span', { class: 'pcan-metro-punto' + (i === 0 ? ' is-primero' : '') })); }
      }
      Array.prototype.forEach.call(puntos.children, function (p, k) { p.classList.toggle('is-on', k === activo); });
    }
    function pintarTempo() {
      campo.value = String(bpm);
      var t = cancion >= 0 ? tempoValido(canciones[cancion].tempo) : 0;
      // Sin tempo en la canción no hay enlace; si ya es el de la canción, se oculta sin quitar su hueco (el panel no debe moverse al pulsar +/−).
      btnCancion.hidden = !t;
      btnCancion.style.visibility = t === bpm ? 'hidden' : '';
      btnCancion.textContent = t ? sprintf(/* translators: %d: tempo de la canción en pulsaciones por minuto */ __('Volver al tempo de la canción (%d)'), t) : '';
    }

    // --- tempo
    function fijar(n, esManual) {
      if (isNaN(n)) { pintarTempo(); return; }
      bpm = limitarTempo(n);
      ultimoBpm = bpm;
      if (esManual && cancion >= 0) { manual[cancion] = bpm; }
      pintarTempo();
    }

    function marcar() {
      var ahora = Date.now();
      if (toques.length && ahora - toques[toques.length - 1] > 2000) { toques = []; }
      toques.push(ahora);
      if (toques.length > 6) { toques.shift(); }
      if (toques.length >= 2) { fijar(60000 / ((toques[toques.length - 1] - toques[0]) / (toques.length - 1)), true); }
    }

    /** Al cambiar de canción: su tempo, salvo que se haya ajustado a mano para ella. Si suena, sigue al tempo nuevo. */
    function cambiarCancion(i) {
      cancion = i;
      var c = canciones[i];
      bpm = manual[i] || tempoValido(c && c.tempo) || ultimoBpm || METRO_DEFECTO;
      pintarTempo();
    }

    // --- sonido y reloj
    function clic(cuando, acento) {
      if (!conSonido) { return; }
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = acento ? 1600 : 1000;
      g.gain.setValueAtTime(0.0001, cuando);
      g.gain.exponentialRampToValueAtTime(acento ? 0.9 : 0.6, cuando + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, cuando + 0.06);
      o.connect(g); g.connect(ctx.destination);
      o.start(cuando); o.stop(cuando + 0.08);
    }

    function agenda() {
      while (proximo < ctx.currentTime + 0.1) {
        clic(proximo, pulso === 0);
        cola.push({ t: proximo, p: pulso });
        proximo += 60 / bpm;
        pulso = (pulso + 1) % compas;
      }
    }

    function dibuja() {
      if (!sonando) { return; }
      var ultimo = null;
      while (cola.length && cola[0].t <= ctx.currentTime) { ultimo = cola.shift(); }
      if (ultimo) {
        pintarPuntos(ultimo.p);
        pulsoBoton.classList.add('is-on');
        clearTimeout(pulsoTimer);
        pulsoTimer = setTimeout(function () { pulsoBoton.classList.remove('is-on'); }, 90);
      }
      cuadro = requestAnimationFrame(dibuja);
    }

    function empezar() {
      if (!AC) { P.aviso(__('Este navegador no permite reproducir sonido'), 'error'); return; }
      // Se crea y se reanuda dentro del gesto del usuario (el botón), como exigen los navegadores.
      if (!ctx) { try { ctx = new AC(); } catch (e) { P.aviso(__('Este navegador no permite reproducir sonido'), 'error'); return; } }
      if (ctx.state === 'suspended' && ctx.resume) { ctx.resume(); }
      sonando = true;
      pulso = 0;
      cola = [];
      proximo = ctx.currentTime + 0.06;
      agenda();
      temporizador = setInterval(agenda, 25);
      cuadro = requestAnimationFrame(dibuja);
      pintarMarcha();
    }

    function parar() {
      sonando = false;
      clearInterval(temporizador); temporizador = null;
      cancelAnimationFrame(cuadro);
      clearTimeout(pulsoTimer);
      cola = [];
      pulsoBoton.classList.remove('is-on');
      pintarPuntos();
      pintarMarcha();
    }

    function alternar() {
      abierto = !abierto;
      guardarAlmacen('pcan-metro-abierto', abierto ? '1' : '0');
      panel.hidden = !abierto;
      pintarBoton();
      if (abierto) { btnMarcha.focus(); } else { boton.focus(); }
    }

    function destruir() {
      parar();
      detenerRepeticion();
      if (ctx && ctx.close) { ctx.close().catch(function () {}); }
      ctx = null;
    }

    pintarSonido(); pintarPuntos(); pintarMarcha(); pintarTempo();
    return { panel: panel, alternar: alternar, cambiarCancion: cambiarCancion, destruir: destruir };
  }

  /**
   * Vídeo de YouTube de la canción, en un panel flotante sobre el lector. Ocultar el panel NO para el vídeo (como el
   * metrónomo): el botón de la barra muestra un punto mientras suena. El iframe solo se crea al pulsar «play», y se
   * quita al parar, al cambiar de canción y al cerrar el lector. El estado abierto/cerrado no se guarda.
   * `canciones` lleva `youtube: [{ videoId, label }]`; `boton` es el botón de la barra (lo crea quien lo usa).
   * Devuelve { panel, alternar(), cambiarCancion(i), destruir() }.
   */
  function crearVideo(canciones, boton) {
    var cancion = -1;
    var version = 0;
    var abierto = false;
    var sonando = false;

    function videosDe(i) {
      var c = canciones[i];
      return ((c && c.youtube) || []).filter(function (y) { return y && y.videoId; });
    }

    var btnOcultar = h('button', { type: 'button', class: 'pcan-metro-sec', onclick: function () { alternar(); }, text: __('Ocultar') });
    var btnParar = h('button', { type: 'button', class: 'pcan-metro-sec', onclick: function () { parar(); }, text: __('Parar'), hidden: true });
    var selVersion = h('select', { class: 'pcan-video-version', 'aria-label': __('Versión del vídeo'), onchange: function () { version = +selVersion.value; parar(); pintarEnlace(); } });
    var zona = h('div', { class: 'pcan-video-zona' });
    var enlace = h('a', { class: 'pcan-metro-enlace pcan-video-enlace', target: '_blank', rel: 'noopener', text: __('Abrir en YouTube') });

    var panel = h('div', { class: 'pcan-video-lector', role: 'group', 'aria-label': __('Vídeo'), hidden: true },
      h('div', { class: 'pcan-metro-cab' }, h('strong', { text: __('Vídeo') }), h('span', { class: 'pcan-video-acciones' }, btnParar, btnOcultar)),
      selVersion, zona, enlace);
    // Las teclas de página del lector no deben dispararse al usar los controles del panel.
    panel.addEventListener('keydown', function (e) {
      if ([' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'Backspace'].indexOf(e.key) !== -1) { e.stopPropagation(); }
    });

    var puntoBoton = h('i', { class: 'pcan-video-sonando', 'aria-hidden': 'true', hidden: true });
    boton.insertBefore(puntoBoton, boton.lastChild);
    boton.addEventListener('click', function () { alternar(); });

    function actual() { return videosDe(cancion)[version] || null; }

    function pintarBoton() {
      var hay = videosDe(cancion).length > 0;
      boton.hidden = !hay;
      boton.classList.toggle('is-active', abierto && hay);
      boton.classList.toggle('is-sonando', sonando);
      boton.setAttribute('aria-pressed', abierto && hay ? 'true' : 'false');
      boton.setAttribute('aria-expanded', abierto && hay ? 'true' : 'false');
      puntoBoton.hidden = !(sonando && !abierto);
      panel.hidden = !(abierto && hay);
      btnParar.hidden = !sonando;
    }

    function pintarEnlace() {
      var y = actual();
      enlace.hidden = !y;
      if (y) { enlace.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(y.videoId); }
    }

    /** Muestra la miniatura de la versión actual con su botón de play; el iframe no existe hasta pulsarlo. */
    function miniatura() {
      zona.innerHTML = '';
      var y = actual();
      if (!y) { return; }
      var nombre = y.label || __('vídeo');
      append(zona, h('button', {
        type: 'button', class: 'pcan-video-thumb', 'aria-label': sprintf(/* translators: %s: descripción del vídeo */ __('Reproducir %s'), nombre),
        onclick: function () { reproducir(); }
      }, h('img', { src: 'https://i.ytimg.com/vi/' + encodeURIComponent(y.videoId) + '/mqdefault.jpg', alt: '' }), h('span', { class: 'pcan-play' }, icono('play'))));
    }

    function reproducir() {
      var y = actual();
      if (!y) { return; }
      zona.innerHTML = '';
      append(zona, h('iframe', {
        src: 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(y.videoId) + '?autoplay=1&rel=0&playsinline=1',
        title: y.label || __('Vídeo'), allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true, frameborder: '0'
      }));
      sonando = true;
      pintarBoton();
    }

    /** Quita el iframe (el vídeo deja de sonar) y vuelve a la miniatura. */
    function parar() {
      sonando = false;
      miniatura();
      pintarBoton();
    }

    function alternar() {
      if (!videosDe(cancion).length) { return; }
      abierto = !abierto;
      pintarBoton();
      if (abierto) { var b = zona.querySelector('button, iframe'); if (b) { b.focus(); } } else { boton.focus(); }
    }

    function cambiarCancion(i) {
      cancion = i;
      version = 0;
      sonando = false;
      var vs = videosDe(i);
      selVersion.innerHTML = '';
      vs.forEach(function (y, k) { append(selVersion, h('option', { value: String(k), text: y.label || sprintf(/* translators: %d: posición de la versión del vídeo (1, 2, 3…) */ __('Versión %d'), k + 1) })); });
      selVersion.hidden = vs.length < 2;
      if (!vs.length) { abierto = false; }
      miniatura();
      pintarEnlace();
      pintarBoton();
    }

    function destruir() {
      sonando = false;
      zona.innerHTML = '';
    }

    boton.hidden = true;
    return { panel: panel, alternar: alternar, cambiarCancion: cambiarCancion, destruir: destruir };
  }

  /** Rellena el título de la barra del lector (y del cantor): contador, número · título, tono, tempo y nota. */
  function pintarTituloLector(titulo, c, i, total) {
    titulo.innerHTML = '';
    // Dos grupos (contador y título | tono, tempo y nota): en escritorio son transparentes; en móvil van en filas distintas.
    append(titulo, [
      h('span', { class: 'pcan-lector-t1' }, [
        total > 1 ? h('span', { class: 'pcan-lector-n', text: (i + 1) + '/' + total }) : null,
        h('strong', { text: (c.numero ? c.numero + ' · ' : '') + c.titulo })
      ]),
      h('span', { class: 'pcan-lector-t2' }, [
        c.tono ? h('span', { class: 'pcan-tono', text: P.tono(c.tono) }) : null,
        c.tempo ? h('span', { class: 'pcan-lector-tempo', title: sprintf(/* translators: %s: tempo en pulsaciones por minuto */ __('%s pulsaciones por minuto'), c.tempo), text: '♩ = ' + c.tempo }) : null,
        c.nota ? h('span', { class: 'pcan-lector-nota', text: c.nota }) : null
      ])
    ]);
  }

  // ---------------------------------------------------------------- lector a pantalla completa

  /**
   * opciones: { titulo, canciones: [{ id, titulo, numero, tono, tempo, nota, letra, letraHtml, partituras: [...] }], inicio, alCerrar(), alCambiar(i) }
   */
  function abrirLector(opciones) {
    var canciones = opciones.canciones;
    var variante = canciones.map(function () { return 0; });
    var cancionActual = -1;
    var verLetra = false;
    var wakeLock = null;

    var titulo = h('div', { class: 'pcan-lector-titulo' });
    var btnLetra = h('button', { type: 'button', class: 'pcan-chip-btn', onclick: function () { alternarLetra(); } }, icono('letra'), h('span', { text: __('Letra') }));
    var btnVideo = h('button', { type: 'button', class: 'pcan-chip-btn', 'aria-pressed': 'false', 'aria-expanded': 'false', title: __('Vídeo (V)') }, icono('youtube'), h('span', { text: __('Vídeo') }));
    var btnMetro = h('button', { type: 'button', class: 'pcan-chip-btn', 'aria-label': __('Metrónomo'), 'aria-pressed': 'false', 'aria-expanded': 'false', title: __('Metrónomo (M)') }, icono('metronomo'), h('span', { text: __('Metrónomo') }));
    var selVariante = h('select', { class: 'pcan-lector-variante', 'aria-label': __('Versión de la partitura'), onchange: function () { cambiarVariante(+selVariante.value); } });
    var paginaInfo = h('span', { class: 'pcan-lector-pagina' });
    var letra = h('div', { class: 'pcan-lector-letra', hidden: true });
    var pastillas = h('div', { class: 'pcan-lector-canciones', role: 'tablist', 'aria-label': __('Canciones') });

    var escenario = crearEscenario({
      canciones: canciones.map(function (c) { return { titulo: c.titulo, partitura: c.partituras[0] || null }; }),
      alCambiar: actualizar,
      alTocarCentro: function () { capa.classList.toggle('is-limpio'); }
    });

    var flechaIzq = h('button', { type: 'button', class: 'pcan-lector-flecha is-izq', 'aria-label': __('Página anterior'), onclick: function () { anterior(); } }, icono('anterior'));
    var flechaDer = h('button', { type: 'button', class: 'pcan-lector-flecha is-der', 'aria-label': __('Página siguiente'), onclick: function () { siguiente(); } }, icono('siguiente'));

    var metro = crearMetronomo(canciones, btnMetro);
    var video = crearVideo(canciones, btnVideo);

    var capa = h('div', { class: 'pcan-lector', role: 'dialog', 'aria-modal': 'true', 'aria-label': opciones.titulo || __('Partitura'), tabindex: '-1' },
      h('div', { class: 'pcan-lector-barra' },
        h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': __('Cerrar'), onclick: cerrar }, icono('cerrar')),
        titulo,
        selVariante,
        btnLetra,
        btnVideo,
        btnMetro,
        h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': __('Pantalla completa'), title: __('Pantalla completa'), onclick: pantallaCompleta }, icono('expandir'))),
      h('div', { class: 'pcan-lector-cuerpo' }, escenario.el, letra, flechaIzq, flechaDer, h('div', { class: 'pcan-lector-paneles' }, video.panel, metro.panel)),
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
        pintarTituloLector(titulo, c, est.cancion, canciones.length);
        btnLetra.hidden = !c.letra;
        selVariante.innerHTML = '';
        selVariante.hidden = c.partituras.length < 2;
        c.partituras.forEach(function (p, k) { append(selVariante, h('option', { value: String(k), text: p.label || sprintf(/* translators: %d: posición de la partitura en la lista (1, 2, 3…) */ __('Partitura %d'), k + 1) })); });
        selVariante.value = String(variante[est.cancion]);
        Array.prototype.forEach.call(pastillas.children, function (b, k) {
          b.classList.toggle('is-active', k === est.cancion);
          b.setAttribute('aria-selected', k === est.cancion ? 'true' : 'false');
          if (k === est.cancion && b.scrollIntoView) { b.scrollIntoView({ block: 'nearest', inline: 'center' }); }
        });
        metro.cambiarCancion(est.cancion);
        video.cambiarCancion(est.cancion);
        if (opciones.alCambiar) { opciones.alCambiar(est.cancion); }
      }
      paginaInfo.textContent = textoPagina(est);
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
      if (verLetra) {
        var rica = c.letraHtml && P.letra;
        letra.classList.toggle('is-rica', !!rica);
        if (rica) { letra.innerHTML = P.letra.normalizar(c.letraHtml); } else { letra.textContent = c.letra; }
        letra.scrollTop = 0;
      }
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
      else if (e.key === 'm' || e.key === 'M') { metro.alternar(); }
      else if (e.key === 'v' || e.key === 'V') { video.alternar(); }
      else if (e.key === 'f' || e.key === 'F') { pantallaCompleta(); }
      else if (e.key === 'Escape' && !document.fullscreenElement) { cerrar(); }
    }

    function pantallaCompleta() {
      if (document.fullscreenElement) { document.exitFullscreen(); }
      else if (capa.requestFullscreen) { capa.requestFullscreen().catch(function () { P.aviso(__('Este navegador no permite pantalla completa'), 'error'); }); }
    }

    function cerrar() {
      document.removeEventListener('keydown', teclas);
      metro.destruir();
      video.destruir();
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

  // ---------------------------------------------------------------- cantor: el mismo lector, con la letra en vez de la partitura

  var CANTAR_TAMS = [16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64];

  /**
   * Lector de letras a pantalla completa («Cantar el culto»). Misma carcasa, barra, pastillas y metrónomo que `abrirLector`,
   * pero el cuerpo es la letra de la canción, con scroll vertical.
   * opciones: { titulo, canciones: [{ id, titulo, numero, tono, tempo, nota, letra, letraHtml }], inicio, alCerrar(), alCambiar(i) }
   * Devuelve { cerrar, irACancion(i) }.
   */
  function abrirCantor(opciones) {
    var canciones = opciones.canciones;
    var cancionActual = -1;
    var wakeLock = null;
    var destino = null, destinoTimer = null;
    var reducido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var titulo = h('div', { class: 'pcan-lector-titulo' });
    var btnMenos = h('button', { type: 'button', class: 'pcan-chip-btn pcan-cantar-tam', 'aria-label': __('Letra más pequeña'), title: __('Letra más pequeña'), onclick: function () { cambiarTam(-1); }, text: 'A−' });
    var btnMas = h('button', { type: 'button', class: 'pcan-chip-btn pcan-cantar-tam', 'aria-label': __('Letra más grande'), title: __('Letra más grande'), onclick: function () { cambiarTam(1); }, text: 'A+' });
    var btnVideo = h('button', { type: 'button', class: 'pcan-chip-btn', 'aria-pressed': 'false', 'aria-expanded': 'false', title: __('Vídeo (V)') }, icono('youtube'), h('span', { text: __('Vídeo') }));
    var btnMetro = h('button', { type: 'button', class: 'pcan-chip-btn', 'aria-label': __('Metrónomo'), 'aria-pressed': 'false', 'aria-expanded': 'false', title: __('Metrónomo (M)') }, icono('metronomo'), h('span', { text: __('Metrónomo') }));
    var letra = h('div', { class: 'pcan-lector-letra' });
    var pastillas = h('div', { class: 'pcan-lector-canciones', role: 'tablist', 'aria-label': __('Canciones') });
    var flechaIzq = h('button', { type: 'button', class: 'pcan-lector-flecha is-izq', 'aria-label': __('Página anterior'), onclick: function () { anterior(); } }, icono('anterior'));
    var flechaDer = h('button', { type: 'button', class: 'pcan-lector-flecha is-der', 'aria-label': __('Página siguiente'), onclick: function () { siguiente(); } }, icono('siguiente'));
    var metro = crearMetronomo(canciones, btnMetro);
    var video = crearVideo(canciones, btnVideo);

    var capa = h('div', { class: 'pcan-lector is-cantar', role: 'dialog', 'aria-modal': 'true', 'aria-label': opciones.titulo || __('Letra'), tabindex: '-1' },
      h('div', { class: 'pcan-lector-barra' },
        h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': __('Cerrar'), onclick: cerrar }, icono('cerrar')),
        titulo,
        btnMenos,
        btnMas,
        btnVideo,
        btnMetro,
        h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': __('Pantalla completa'), title: __('Pantalla completa'), onclick: pantallaCompleta }, icono('expandir'))),
      h('div', { class: 'pcan-lector-cuerpo' }, letra, flechaIzq, flechaDer, h('div', { class: 'pcan-lector-paneles' }, video.panel, metro.panel)),
      h('div', { class: 'pcan-lector-pie' }, pastillas));
    P.temaEn(capa);

    canciones.forEach(function (c, i) {
      append(pastillas, h('button', {
        type: 'button', role: 'tab', class: 'pcan-lector-pastilla', title: c.titulo,
        onclick: function () { irA(i, false); }
      }, h('span', { class: 'pcan-lector-pastilla-n', text: String(i + 1) }), h('span', { class: 'pcan-lector-pastilla-t', text: c.titulo })));
    });
    if (canciones.length < 2) { pastillas.hidden = true; }

    // --- tamaño del texto: pasos entre 16 y 64 px; se guarda y se aplica con una variable CSS
    var tam = 0;
    function pintarTam() {
      btnMenos.disabled = tam <= CANTAR_TAMS[0];
      btnMas.disabled = tam >= CANTAR_TAMS[CANTAR_TAMS.length - 1];
    }
    function cambiarTam(dir) {
      var nuevo = tam;
      if (dir > 0) {
        for (var i = 0; i < CANTAR_TAMS.length; i++) { if (CANTAR_TAMS[i] > tam) { nuevo = CANTAR_TAMS[i]; break; } }
      } else {
        for (var k = CANTAR_TAMS.length - 1; k >= 0; k--) { if (CANTAR_TAMS[k] < tam) { nuevo = CANTAR_TAMS[k]; break; } }
      }
      if (nuevo === tam) { return; }
      // Se conserva la posición relativa dentro de la letra al cambiar el tamaño.
      var max = letra.scrollHeight - letra.clientHeight;
      var rel = max > 0 ? letra.scrollTop / max : 0;
      tam = nuevo;
      capa.style.setProperty('--pcan-cantar-tam', tam + 'px');
      guardarAlmacen('pcan-cantar-tam', tam);
      destino = null;
      letra.scrollTop = rel * Math.max(0, letra.scrollHeight - letra.clientHeight);
      pintarTam();
      pintarFlechas();
    }

    // --- contenido
    function mostrarCancion(i) {
      var c = canciones[i];
      if (i !== cancionActual) {
        cancionActual = i;
        pintarTituloLector(titulo, c, i, canciones.length);
        Array.prototype.forEach.call(pastillas.children, function (b, k) {
          b.classList.toggle('is-active', k === i);
          b.setAttribute('aria-selected', k === i ? 'true' : 'false');
          if (k === i && b.scrollIntoView) { b.scrollIntoView({ block: 'nearest', inline: 'center' }); }
        });
        metro.cambiarCancion(i);
        video.cambiarCancion(i);
        if (opciones.alCambiar) { opciones.alCambiar(i); }
      }
      letra.innerHTML = '';
      letra.classList.remove('is-rica', 'is-vacia');
      if (c.letraHtml && P.letra) {
        letra.classList.add('is-rica');
        letra.innerHTML = P.letra.normalizar(c.letraHtml);
      } else if (c.letra) {
        letra.textContent = c.letra;
      } else {
        letra.classList.add('is-vacia');
        append(letra, h('p', { class: 'pcan-cantar-vacio', text: __('Esta canción no tiene letra') }));
      }
    }

    /** Muestra la canción i, desde arriba o (si alFinal) colocada al final de la letra. */
    function irA(i, alFinal) {
      i = Math.max(0, Math.min(i, canciones.length - 1));
      destino = null;
      mostrarCancion(i);
      letra.scrollTop = alFinal ? letra.scrollHeight : 0;
      pintarFlechas();
    }

    // --- scroll por «páginas»: como el pedal pasa página al tocar, «siguiente» baja casi una pantalla y, al final, cambia de canción
    function posicion() { return destino !== null ? destino : letra.scrollTop; }
    function maximo() { return Math.max(0, letra.scrollHeight - letra.clientHeight); }
    function desplazarA(y) {
      destino = Math.max(0, Math.min(y, maximo()));
      clearTimeout(destinoTimer);
      destinoTimer = setTimeout(function () { destino = null; pintarFlechas(); }, 600);
      if (letra.scrollTo) { letra.scrollTo({ top: destino, behavior: reducido ? 'auto' : 'smooth' }); } else { letra.scrollTop = destino; }
    }
    function siguiente() {
      var pos = posicion();
      if (pos >= maximo() - 2) { if (cancionActual < canciones.length - 1) { irA(cancionActual + 1, false); } return; }
      desplazarA(pos + letra.clientHeight * 0.85);
    }
    function anterior() {
      var pos = posicion();
      if (pos <= 2) { if (cancionActual > 0) { irA(cancionActual - 1, true); } return; }
      desplazarA(pos - letra.clientHeight * 0.85);
    }

    function pintarFlechas() {
      var pos = letra.scrollTop;
      flechaIzq.disabled = cancionActual <= 0 && pos <= 2;
      flechaDer.disabled = cancionActual >= canciones.length - 1 && pos >= maximo() - 2;
    }
    letra.addEventListener('scroll', pintarFlechas);
    window.addEventListener('resize', pintarFlechas);

    // --- gestos sobre la letra (el scroll vertical es el nativo): deslizar en horizontal = otra canción;
    // toque corto en los tercios = página anterior/siguiente; en el centro = ocultar o mostrar las barras
    var toque = null;
    letra.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) { toque = null; return; }
      toque = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    });
    letra.addEventListener('pointercancel', function () { toque = null; });
    letra.addEventListener('pointerup', function (e) {
      var t = toque;
      toque = null;
      if (!t || t.id !== e.pointerId) { return; }
      var dx = e.clientX - t.x, dy = e.clientY - t.y;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) { if (cancionActual < canciones.length - 1) { irA(cancionActual + 1, false); } }
        else if (cancionActual > 0) { irA(cancionActual - 1, false); }
        return;
      }
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10 || Date.now() - t.t > 600) { return; }
      var sel = window.getSelection && window.getSelection();
      if (sel && String(sel).length) { return; }
      var caja = letra.getBoundingClientRect();
      var rel = (e.clientX - caja.left) / (caja.width || 1);
      if (rel < 1 / 3) { anterior(); }
      else if (rel > 2 / 3) { siguiente(); }
      else { capa.classList.toggle('is-limpio'); }
    });

    function teclas(e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { return; }
      if (['ArrowRight', 'PageDown', ' ', 'ArrowDown', 'Enter'].indexOf(e.key) !== -1) { e.preventDefault(); siguiente(); }
      else if (['ArrowLeft', 'PageUp', 'ArrowUp', 'Backspace'].indexOf(e.key) !== -1) { e.preventDefault(); anterior(); }
      else if (e.key === 'Home') { e.preventDefault(); desplazarA(0); }
      else if (e.key === 'm' || e.key === 'M') { metro.alternar(); }
      else if (e.key === 'v' || e.key === 'V') { video.alternar(); }
      else if (e.key === 'f' || e.key === 'F') { pantallaCompleta(); }
      else if (e.key === 'Escape' && !document.fullscreenElement) { cerrar(); }
    }

    function pantallaCompleta() {
      if (document.fullscreenElement) { document.exitFullscreen(); }
      else if (capa.requestFullscreen) { capa.requestFullscreen().catch(function () { P.aviso(__('Este navegador no permite pantalla completa'), 'error'); }); }
    }

    function cerrar() {
      document.removeEventListener('keydown', teclas);
      window.removeEventListener('resize', pintarFlechas);
      clearTimeout(destinoTimer);
      metro.destruir();
      video.destruir();
      if (document.fullscreenElement) { document.exitFullscreen().catch(function () {}); }
      if (wakeLock) { wakeLock.release().catch(function () {}); }
      capa.remove();
      document.documentElement.classList.remove('pcan-lock');
      if (opciones.alCerrar) { opciones.alCerrar(); }
    }

    document.body.appendChild(capa);
    document.documentElement.classList.add('pcan-lock');
    document.addEventListener('keydown', teclas);
    if (navigator.wakeLock) { navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }).catch(function () {}); }
    capa.focus();

    // Tamaño inicial: el guardado, o el que da la hoja de estilos (se lee ya con la capa en la página).
    var guardado = parseInt(leerAlmacen('pcan-cantar-tam', ''), 10);
    if (guardado >= CANTAR_TAMS[0] && guardado <= CANTAR_TAMS[CANTAR_TAMS.length - 1]) {
      tam = guardado;
      capa.style.setProperty('--pcan-cantar-tam', tam + 'px');
    } else {
      tam = Math.round(parseFloat(window.getComputedStyle(letra).fontSize)) || 24;
    }
    pintarTam();

    irA(Math.max(0, Math.min(opciones.inicio || 0, canciones.length - 1)), false);

    return { cerrar: cerrar, irACancion: function (i) { irA(i, false); return Promise.resolve(); } };
  }

  // ---------------------------------------------------------------- visor compacto (ficha de canción)

  function visorCompacto(cancion, partitura, alPantallaCompleta) {
    var info = h('span', { class: 'pcan-visor-info' });
    var prev = h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': __('Página anterior'), onclick: function () { esc.anterior(); } }, icono('anterior'));
    var next = h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': __('Página siguiente'), onclick: function () { esc.siguiente(); } }, icono('siguiente'));
    var esc = crearEscenario({
      canciones: [{ titulo: cancion.titulo, partitura: partitura }],
      alCambiar: function (e) {
        info.textContent = textoPagina(e);
        prev.disabled = e.pliego === 0;
        next.disabled = e.pliego >= e.pliegos - 1;
      },
      alTocarCentro: alPantallaCompleta
    });
    var caja = h('div', { class: 'pcan-visor' },
      h('div', { class: 'pcan-visor-marco' }, esc.el),
      h('div', { class: 'pcan-visor-controles' }, prev, info, next,
        h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-visor-full', onclick: alPantallaCompleta }, icono('expandir'), __('Pantalla completa'))));
    esc.mostrar(0);
    return { el: caja, destruir: esc.destruir };
  }

  P.Visor = { crearEscenario: crearEscenario, abrirLector: abrirLector, abrirCantor: abrirCantor, visorCompacto: visorCompacto, cajaContenido: cajaContenido };
})();
