/* Cancionero · aplicación principal */
(function () {
  'use strict';

  var CFG = window.PIEB_CANCIONERO || {};
  var root = document.getElementById('pieb-cancionero');
  if (!root || !CFG.api) { return; }

  // ---------------------------------------------------------------- traducciones (wp.i18n)

  // Atajos con el dominio de texto ya fijado; si wp.i18n no estuviera cargado devuelven el texto tal cual.
  var WPI = window.wp && window.wp.i18n;
  var DOMINIO = 'pieb-cancionero';

  function __(texto) { return WPI && WPI.__ ? WPI.__(texto, DOMINIO) : texto; }
  function _x(texto, contexto) { return WPI && WPI._x ? WPI._x(texto, contexto, DOMINIO) : texto; }
  function _n(singular, plural, n) { return WPI && WPI._n ? WPI._n(singular, plural, n, DOMINIO) : (+n === 1 ? singular : plural); }
  function _nx(singular, plural, n, contexto) { return WPI && WPI._nx ? WPI._nx(singular, plural, n, contexto, DOMINIO) : (+n === 1 ? singular : plural); }

  /** Sustituye %s, %d y %1$s (respaldo sencillo del sprintf de WordPress). */
  function sprintf(formato) {
    if (WPI && WPI.sprintf) { return WPI.sprintf.apply(WPI, arguments); }
    var args = arguments, sig = 1;
    return String(formato).replace(/%(?:(\d+)\$)?([sd%])/g, function (m, pos, tipo) {
      if (tipo === '%') { return '%'; }
      var v = pos ? args[+pos] : args[sig++];
      return tipo === 'd' ? String(parseInt(v, 10) || 0) : String(v);
    });
  }

  /** Frase con un marcador %s que se rellena con un nodo (p. ej. una tecla): devuelve los trozos para pasarlos a h(). */
  function conNodo(frase, nodo) {
    var p = String(frase).split('%s');
    return [p[0], nodo, p.slice(1).join('%s')];
  }

  /** Idioma para fechas y números (BCP 47), el del usuario. */
  var LOCALE = CFG.idioma || 'es-ES';

  var TONALIDADES = ['Do', 'Do#', 'Reb', 'Re', 'Mib', 'Mi', 'Fa', 'Fa#', 'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si',
    'Do m', 'Do# m', 'Re m', 'Mib m', 'Mi m', 'Fa m', 'Fa# m', 'Sol m', 'Sol# m', 'La m', 'Sib m', 'Si m'];

  /** Programa con el que se abre cada partitura editable, según su extensión (la misma lista que admite el servidor). */
  var PROGRAMAS_EDITABLES = {
    mscz: 'MuseScore', mscx: 'MuseScore', musicxml: 'MusicXML', mxl: 'MusicXML', xml: 'MusicXML', sib: 'Sibelius',
    mus: 'Finale', musx: 'Finale', dorico: 'Dorico', gp: 'Guitar Pro', gp3: 'Guitar Pro', gp4: 'Guitar Pro', gp5: 'Guitar Pro',
    gpx: 'Guitar Pro', enc: 'Encore', cap: 'Capella', capx: 'Capella', ly: 'LilyPond', mid: 'MIDI', midi: 'MIDI'
  };

  function programaEditable(nombre) {
    var m = String(nombre || '').match(/\.([a-z0-9]+)$/i);
    return m ? PROGRAMAS_EDITABLES[m[1].toLowerCase()] || '' : '';
  }

  /** Posición de una tonalidad en el círculo de quintas (0 = Do, 1 = Sol…); las menores, con su relativa mayor. -1 si no se reconoce. */
  function quintaDe(tono) {
    var m = String(tono || '').trim().match(/^(do|re|mi|fa|sol|la|si|[a-g])\s*([#♯b♭]?)\s*(m(?![a-z]{2})|menor)?/i);
    if (!m) { return -1; }
    var base = { do: 0, re: 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11, c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
    var semitono = base + (/[#♯]/.test(m[2]) ? 1 : /[b♭]/.test(m[2]) ? -1 : 0) + (m[3] ? 3 : 0);
    return ((((semitono % 12) + 12) % 12) * 7) % 12;
  }

  // Notación de las tonalidades: lo guardado es siempre latino (Do, Mib, La m); al mostrarlo se pasa a la notación elegida.
  var LETRAS_AMERICANAS = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };
  var NOTAS_LATINAS = { c: 'Do', d: 'Re', e: 'Mi', f: 'Fa', g: 'Sol', a: 'La', b: 'Si' };
  var RE_TONO_LATINO = /^(do|re|mi|fa|sol|la|si)\s*([#♯b♭]?)\s*(m|menor)?$/i;
  var RE_TONO_AMERICANO = /^([A-G])\s*([#♯b♭]?)\s*(m|min)?$/;

  function alteracionAscii(a) { return a === '♯' ? '#' : a === '♭' ? 'b' : a; }

  /** Tonalidad tal como se muestra: en notación americana (C, Ebm, G#m) si el usuario la eligió; si no, o si no se reconoce, igual. */
  function tonoVer(valor) {
    var v = String(valor === null || valor === undefined ? '' : valor).trim();
    if (CFG.notacion !== 'americana') { return v; }
    var m = v.match(RE_TONO_LATINO);
    if (!m) { return v; }
    return LETRAS_AMERICANAS[m[1].toLowerCase()] + alteracionAscii(m[2]) + (m[3] ? 'm' : '');
  }

  /** Lo contrario: lo que el usuario escribe (C, Eb, Am…) pasa a la forma guardada (Do, Mib, La m). Lo desconocido, tal cual. */
  function tonoGuardar(texto) {
    var v = String(texto === null || texto === undefined ? '' : texto).trim(), m;
    if ((m = v.match(RE_TONO_AMERICANO))) {
      return NOTAS_LATINAS[m[1].toLowerCase()] + alteracionAscii(m[2]) + (m[3] ? ' m' : '');
    }
    return v;
  }

  var state = {
    canciones: [],
    indice: [],
    query: '',
    etiqueta: '',
    orden: 'titulo',
    ordenInverso: false,
    coloresEtiquetas: {},
    cargado: false,
    error: '',
    vista: 'inicio',
    seleccion: { canciones: 0, cultos: 0 },
    filtro: '',
    uso: {},
    usoCargado: false,
    tema: CFG.tema || 'claro'
  };

  // Rutas y ganchos que registran otros módulos (cultos.js).
  var rutasExtra = [];
  var ganchos = { fichaCancion: [], vistas: {}, inicio: [], paleta: [], detalleVacio: {} };

  // ---------------------------------------------------------------- utilidades

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) { return; }
        if (k === 'class') { el.className = v; }
        else if (k === 'text') { el.textContent = v; }
        else if (k.slice(0, 2) === 'on') { el.addEventListener(k.slice(2), v); }
        else if (v === true) { el.setAttribute(k, ''); }
        else { el.setAttribute(k, v); }
      });
    }
    for (var i = 2; i < arguments.length; i++) { append(el, arguments[i]); }
    return el;
  }

  /** Pastilla de tonalidad; con el estilo «Colores» cada tonalidad lleva su color (--tono-h, por el círculo de quintas). */
  function pastillaTono(valorTono, attrs) {
    var q = quintaDe(valorTono);
    var a = { class: 'pcan-key', text: tonoVer(valorTono), style: q < 0 ? null : '--tono-h: ' + (q * 30) };
    Object.keys(attrs || {}).forEach(function (k) { a[k] = k === 'class' ? a.class + ' ' + attrs[k] : attrs[k]; });
    return h('span', a);
  }

  function append(el, child) {
    if (child === null || child === undefined || child === false) { return; }
    if (Array.isArray(child)) { child.forEach(function (c) { append(el, c); }); return; }
    el.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }

  function norm(v) {
    return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  var ICONOS = {
    buscar: 'M10.5 3a7.5 7.5 0 0 1 5.96 12.06l4.24 4.24-1.42 1.42-4.24-4.24A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z',
    mas: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
    cerrar: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z',
    partitura: 'M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM9 12h8v1.5H9V12zm0 3h8v1.5H9V15zm0 3h5v1.5H9V18z',
    letra: 'M4 5h16v2H4V5zm0 4h16v2H4V9zm0 4h10v2H4v-2zm0 4h12v2H4v-2z',
    youtube: 'M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3L10 15z',
    audio: 'M12 3a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h2v-8H5v-1a7 7 0 0 1 14 0v1h-3v8h2a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9z',
    editar: 'M4 17.2V20h2.8l8.3-8.3-2.8-2.8L4 17.2zM19.7 7.1a1 1 0 0 0 0-1.4l-1.4-1.4a1 1 0 0 0-1.4 0l-1.3 1.3 2.8 2.8 1.3-1.3z',
    enlace: 'M10.6 13.4a1 1 0 0 1 0-1.4l3-3a1 1 0 1 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0zM8.5 19.5a4 4 0 0 1-2.8-6.8l2.1-2.1 1.4 1.4-2.1 2.1a2 2 0 0 0 2.8 2.8l2.1-2.1 1.4 1.4-2.1 2.1a4 4 0 0 1-2.8 1.2zm7.7-6.1-1.4-1.4 2.1-2.1a2 2 0 0 0-2.8-2.8L12 9.2l-1.4-1.4 2.1-2.1a4 4 0 0 1 5.6 5.6l-2.1 2.1z',
    borrar: 'M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm4 2v8h1.5v-8H10zm3.5 0v8H15v-8h-1.5z',
    descargar: 'M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3V3zM5 18h14v2H5v-2z',
    abrir: 'M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3zM5 5h6v2H6v11h11v-5h2v7H4V5h1z',
    play: 'M8 5v14l11-7L8 5z',
    nota: 'M12 3v10.6A4 4 0 1 0 14 17V7h4V3h-6z',
    subir: 'M11 16V6.8L7.7 10.1 6.3 8.7 12 3l5.7 5.7-1.4 1.4L13 6.8V16h-2zM5 18h14v2H5v-2z',
    lista: 'M4 6h2v2H4V6zm4 0h12v2H8V6zm-4 5h2v2H4v-2zm4 0h12v2H8v-2zm-4 5h2v2H4v-2zm4 0h12v2H8v-2z',
    calendario: 'M7 2h2v2h6V2h2v2h3v17H4V4h3V2zm-1 8v9h12v-9H6zm0-2h12V6H6v2z',
    arrastrar: 'M9 5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 7a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 7a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9-14a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 7a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 7a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z',
    arriba: 'M12 7.4 6.7 12.7 5.3 11.3 12 4.6l6.7 6.7-1.4 1.4L12 7.4zM11 8h2v11h-2z',
    abajo: 'M12 16.6l5.3-5.3 1.4 1.4-6.7 6.7-6.7-6.7 1.4-1.4 5.3 5.3zM11 5h2v11h-2z',
    copiar: 'M8 3h11v13h-2V5H8V3zM5 7h11v14H5V7zm2 2v10h7V9H7z',
    pantalla: 'M3 4h18v13H3V4zm2 2v9h14V6H5zm3 13h8v2H8v-2z',
    expandir: 'M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z',
    anterior: 'M15.4 6.4 14 5l-7 7 7 7 1.4-1.4L9.8 12z',
    siguiente: 'M8.6 6.4 10 5l7 7-7 7-1.4-1.4 5.6-5.6z',
    aviso: 'M12 2 1 21h22L12 2zm-1 7h2v6h-2V9zm0 8h2v2h-2v-2z',
    ajustes: 'M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5-2.2-1.8zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
    salir: 'M10 3h9v18h-9v-2h7V5h-7V3zm-.6 4.6L11 6l6 6-6 6-1.6-1.6 3.4-3.4H3v-2h9.8L9.4 7.6z',
    casa: 'M12 3 2 11h3v10h6v-6h2v6h6V11h3L12 3z',
    check: 'M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z',
    filtro: 'M3 5h18v2l-7 7v5l-4 2v-7L3 7V5z',
    puntos: 'M5 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z',
    'salir-web': 'M5 4h7v2H7v12h5v2H5V4zm9.6 3.6L16 6l6 6-6 6-1.4-1.6 3.4-3.4H9v-2h9z',
    grafica: 'M4 20h16v-2H4v2zm1-4h3V9H5v7zm5 0h3V4h-3v12zm5 0h3v-5h-3v5z',
    editable: 'M6 2h8l6 6v5h-2V9h-5V4H6v16h6v2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm12.6 12 2.4 2.4-5.6 5.6H13v-2.4l5.6-5.6z',
    equipo: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5c0-2.3-4.7-3.5-7-3.5zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z',
    acceso: 'M12.7 10A6 6 0 1 0 7 18a6 6 0 0 0 5.7-4H17v4h4v-4h2v-4H12.7zM7 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4z'
  };

  function icono(nombre) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'pcan-ico');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ICONOS[nombre] || '');
    svg.appendChild(p);
    return svg;
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'X-WP-Nonce': CFG.nonce };
    var body = opts.body;
    if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.json); }
    return fetch(CFG.api + path, {
      method: opts.method || (opts.json !== undefined ? 'POST' : 'GET'),
      headers: headers,
      body: body,
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var err = new Error(data && data.message ? data.message : sprintf(/* translators: %d: código de error HTTP */ __('Error %d'), r.status));
          err.codigo = data && data.code;
          throw err;
        }
        return data;
      });
    });
  }

  // Subida con barra de progreso (fetch no informa del progreso de envío).
  function apiSubir(path, formData, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', CFG.api + path);
      xhr.setRequestHeader('X-WP-Nonce', CFG.nonce);
      xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) { onProgress(e.loaded / e.total); } };
      xhr.onload = function () {
        var data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) { /* respuesta no JSON */ }
        if (xhr.status >= 200 && xhr.status < 300) { resolve(data); }
        else if (xhr.status === 413) { reject(new Error(__('Los archivos son demasiado grandes para el servidor.'))); }
        else {
          var err = new Error(data.message || sprintf(/* translators: %d: código de error HTTP */ __('Error %d al guardar.'), xhr.status));
          err.codigo = data.code;
          reject(err);
        }
      };
      xhr.onerror = function () { reject(new Error(__('No se pudo conectar con el servidor.'))); };
      xhr.send(formData);
    });
  }

  /** `ms` alarga el tiempo en pantalla (por defecto 2,6 s) para los avisos largos, como una lista de correos con su motivo. */
  function aviso(texto, tipo, ms) {
    var t = h('div', { class: 'pcan-toast' + (tipo === 'error' ? ' is-error' : ''), role: 'status', text: texto });
    temaEn(t);
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('is-out'); }, ms || 2600);
    setTimeout(function () { t.remove(); }, (ms || 2600) + 500);
  }

  function copiar(texto, mensaje) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(function () { aviso(mensaje); }, function () { aviso(__('No se pudo copiar'), 'error'); });
    } else {
      aviso(__('Este navegador no permite copiar'), 'error');
    }
  }

  function tamano(bytes) {
    return bytes > 1048576 ? (bytes / 1048576).toFixed(1).replace(/\.0$/, '') + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  /**
   * Sube un archivo en trozos más pequeños que el límite de PHP del servidor y devuelve el id de la subida,
   * que luego se envía al guardar la canción. onProgress recibe de 0 a 1.
   */
  function subirPorTrozos(file, tipo, onProgress) {
    var id = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(16)), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    var trozo = CFG.trozo || 1048576;
    function enviar(desde, reintentos) {
      if (desde >= file.size) { return Promise.resolve(id); }
      var largo = Math.min(trozo, file.size - desde);
      var fd = new FormData();
      fd.append('id', id);
      fd.append('tipo', tipo);
      fd.append('nombre', file.name);
      fd.append('total', String(file.size));
      fd.append('desde', String(desde));
      fd.append('trozo', file.slice(desde, desde + largo), 'trozo');
      return apiSubir('subidas', fd, function (p) { if (onProgress) { onProgress((desde + p * largo) / file.size); } })
        .then(function (r) { return enviar(r.recibido, 2); }, function (err) {
          // Un corte de red se reintenta; si el servidor ya tenía otra cantidad, se empieza de nuevo.
          if (reintentos > 0 && err.codigo !== 'pieb_tamano' && err.codigo !== 'pieb_tipo') { return enviar(err.codigo === 'pieb_orden' ? 0 : desde, reintentos - 1); }
          throw err;
        });
    }
    return enviar(0, 2);
  }

  function enlaceCancion(id) {
    return location.href.split('#')[0] + '#/cancion/' + id;
  }

  function iniciales(nombre) {
    return String(nombre || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join('');
  }

  // ---------------------------------------------------------------- temas

  var varsSitio = null;

  // «Como la web»: toma colores y tipografía del tema activo de WordPress en este momento.
  function variablesDelSitio() {
    if (varsSitio) { return varsSitio; }
    var fuera = function (sel) {
      var lista = document.querySelectorAll(sel);
      for (var i = 0; i < lista.length; i++) { if (!root.contains(lista[i])) { return lista[i]; } }
      return null;
    };
    var transparente = function (c) { return !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c); };
    var luminancia = function (c) {
      var m = String(c).match(/\d+(\.\d+)?/g);
      if (!m) { return 1; }
      return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255;
    };
    var body = getComputedStyle(document.body);
    var enlace = fuera('.entry-content a, main a, #content a, a');
    var titular = fuera('.entry-title, h1, h2');
    // Acento: el primer fondo oscuro de la cabecera o la navegación del tema; si no hay, el color de los enlaces.
    var acento = '';
    var candidatos = document.querySelectorAll('.main-navigation, #masthead, .site-header, header[role=banner], body > header, header nav, nav');
    for (var i = 0; i < candidatos.length && !acento; i++) {
      if (root.contains(candidatos[i])) { continue; }
      var fondoNav = getComputedStyle(candidatos[i]).backgroundColor;
      if (!transparente(fondoNav) && luminancia(fondoNav) < 0.6) { acento = fondoNav; }
    }
    if (!acento) { acento = enlace ? getComputedStyle(enlace).color : '#1f3b73'; }
    // Fondo: el del contenedor donde está insertado el cancionero.
    var fondo = '';
    for (var el = root.parentElement; el && !fondo; el = el.parentElement) {
      var bgc = getComputedStyle(el).backgroundColor;
      if (!transparente(bgc)) { fondo = bgc; }
    }
    varsSitio = {
      '--pc-accent': acento,
      '--pc-accent-ink': luminancia(acento) > 0.6 ? '#111' : '#fff',
      '--pc-text': body.color,
      '--pc-bg': fondo || '#fff',
      '--pc-font': body.fontFamily,
      '--pc-font-head': titular ? getComputedStyle(titular).fontFamily : body.fontFamily
    };
    return varsSitio;
  }

  /** «Colores» y «Pentagrama» son estilos sobre la base de «Como la web». */
  var ESTILOS = { colores: 'sitio', pentagrama: 'sitio' };

  /** Aplica el tema actual a un elemento raíz (la app, el lector, los avisos). */
  function temaEn(el) {
    var base = ESTILOS[state.tema] || state.tema;
    el.setAttribute('data-pcan-theme', base);
    if (ESTILOS[state.tema]) { el.setAttribute('data-pcan-estilo', state.tema); } else { el.removeAttribute('data-pcan-estilo'); }
    var vars = base === 'sitio' ? variablesDelSitio() : null;
    // «Como la web» toma de WordPress solo el color de acento; letra y fondos son los del cancionero.
    ['--pc-accent', '--pc-accent-ink', '--pc-text', '--pc-bg', '--pc-font', '--pc-font-head'].forEach(function (k) {
      if (vars && (k === '--pc-accent' || k === '--pc-accent-ink')) { el.style.setProperty(k, vars[k]); } else { el.style.removeProperty(k); }
    });
  }

  function aplicarTema(nombre, guardar) {
    state.tema = nombre;
    temaEn(root);
    var app = true; // todos los temas se abren a pantalla completa
    root.classList.toggle('is-app', app);
    document.documentElement.classList.toggle('pcan-app-open', app);
    // En modo aplicación se respeta la barra de administración de WordPress, si se muestra.
    var barra = document.getElementById('wpadminbar');
    var alto = app && barra ? barra.offsetHeight : 0;
    root.style.top = alto ? alto + 'px' : '';
    root.style.setProperty('--pc-admin', alto + 'px');
    if (guardar) {
      api('preferencias', { json: { tema: nombre } }).catch(function () { aviso(__('No se pudo guardar el tema'), 'error'); });
    }
    if (ui.menuTemas) { pintarMenuTemas(); }
  }

  // ---------------------------------------------------------------- datos

  function cargar() {
    // Los colores de las etiquetas llegan aparte; si fallan, cada etiqueta usa uno provisional (colorEtiqueta).
    api('etiquetas').then(function (colores) {
      state.coloresEtiquetas = colores && typeof colores === 'object' ? colores : {};
      if (ui.lista) { pintarChips(); pintarLista(); }
    }).catch(function () {});
    return api('canciones').then(function (lista) {
      state.canciones = lista;
      state.indice = lista.map(function (c) {
        return {
          c: c,
          titulo: norm(c.titulo),
          autor: norm(c.autor),
          etiquetas: norm(c.etiquetas.join(' ')),
          letra: norm(c.letra),
          numero: String(c.numero || '').replace(/^0+/, ''),
          // La tonalidad se encuentra escribiéndola en cualquier notación («Sol» o «G», «Mib» o «Eb»).
          tonos: tonosBuscables(c.tonalidad)
        };
      });
      state.cargado = true;
      state.error = '';
    }).catch(function (e) {
      state.error = e.message;
      state.cargado = true;
    });
  }

  // Misma paleta que el servidor (PIEB_CAN_COLORES_ETIQUETA): cada etiqueta recibe uno al crearse.
  var COLORES_ETIQUETA = ['#2f6fd6', '#d4553f', '#2e9e6b', '#8a4fd0', '#d4890f', '#1f8fa3', '#c2407a', '#5c6bc0', '#7a8f1f', '#a0522d', '#0f766e', '#b45309'];

  /** Color de una etiqueta: el que le asignó el servidor o, si aún no existe (recién escrita), uno estable según su nombre. */
  function colorEtiqueta(nombre) {
    if (state.coloresEtiquetas[nombre]) { return state.coloresEtiquetas[nombre]; }
    var n = 0;
    for (var i = 0; i < nombre.length; i++) { n = (n * 31 + nombre.charCodeAt(i)) % 9973; }
    return COLORES_ETIQUETA[n % COLORES_ETIQUETA.length];
  }

  function estiloEtiqueta(nombre) {
    return '--tag: ' + colorEtiqueta(nombre);
  }

  function etiquetasTodas() {
    var cuenta = {};
    state.canciones.forEach(function (c) {
      c.etiquetas.forEach(function (e) { cuenta[e] = (cuenta[e] || 0) + 1; });
    });
    return Object.keys(cuenta).sort(function (a, b) { return a.localeCompare(b, LOCALE); })
      .map(function (e) { return { nombre: e, n: cuenta[e] }; });
  }

  /** Formas en que se puede escribir una tonalidad al buscar: sin espacios ni mayúsculas, en latino y en americano. */
  function tonosBuscables(valor) {
    var v = String(valor || '').trim();
    if (!v) { return []; }
    var latino = tonoGuardar(v);
    var americano = (function () {
      var m = latino.match(RE_TONO_LATINO);
      return m ? LETRAS_AMERICANAS[m[1].toLowerCase()] + alteracionAscii(m[2]) + (m[3] ? 'm' : '') : latino;
    })();
    return [latino, americano, v].map(function (t) { return t.toLowerCase().replace(/\s+/g, ''); });
  }

  function buscar(query, etiqueta) {
    var q = norm(query);
    var qTono = String(query || '').trim().toLowerCase().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, '');
    var tokens = q ? q.split(' ') : [];
    var esNumero = /^\d+$/.test(q);
    var res = [];

    state.indice.forEach(function (it) {
      if (etiqueta && it.c.etiquetas.indexOf(etiqueta) === -1) { return; }
      if (!q) { res.push({ c: it.c, score: 0 }); return; }

      var score = 0;
      var enLetra = false;
      if (esNumero && it.numero) {
        if (it.numero === q.replace(/^0+/, '')) { score = 100; }
        else if (it.numero.indexOf(q) === 0) { score = 60; }
      }
      if (qTono && it.tonos.indexOf(qTono) !== -1) { score = Math.max(score, 45); }
      if (it.titulo.indexOf(q) === 0) { score = Math.max(score, 50); }
      else if (it.titulo.indexOf(q) !== -1) { score = Math.max(score, 40); }

      if (!score) {
        var todo = it.titulo + ' ' + it.autor + ' ' + it.etiquetas + ' ' + it.letra;
        if (tokens.every(function (t) { return todo.indexOf(t) !== -1; })) {
          var enTitulo = tokens.every(function (t) { return it.titulo.indexOf(t) !== -1; });
          var enMeta = tokens.every(function (t) { return (it.titulo + ' ' + it.autor + ' ' + it.etiquetas).indexOf(t) !== -1; });
          if (enTitulo) { score = 30; }
          else if (enMeta) { score = 20; }
          else { score = it.letra.indexOf(q) !== -1 ? 15 : 10; enLetra = true; }
        }
      }
      if (score) { res.push({ c: it.c, score: score, enLetra: enLetra }); }
    });

    res.sort(function (a, b) {
      if (b.score !== a.score) { return b.score - a.score; }
      return comparar(a.c, b.c);
    });
    return res;
  }

  // Sentido natural de cada orden: lo alfabético y numérico, de menor a mayor; fechas, uso y recursos, primero lo que más tiene.
  var ORDENES = {
    titulo: { texto: __('A–Z'), asc: true }, numero: { texto: __('Nº himnario'), asc: true }, tono: { texto: _x('Tono', 'tonalidad de la canción'), asc: true },
    tempo: { texto: __('Tempo'), asc: true }, etiquetas: { texto: __('Etiquetas'), asc: true }, recientes: { texto: __('Recientes'), asc: false },
    uso: { texto: __('Más tocadas'), asc: false }, partituras: { texto: __('Partituras'), asc: false }, letra: { texto: __('Con letra'), asc: false },
    audios: { texto: __('Audios'), asc: false }, editables: { texto: __('Editables'), asc: false }, youtube: { texto: 'YouTube', asc: false }
  };

  /** Valor por el que se ordena cada columna; null si la canción no tiene ese dato (va siempre al final). */
  function valorOrden(c, orden) {
    var n;
    switch (orden) {
      case 'numero': n = parseInt(c.numero, 10); return isNaN(n) ? null : n;
      case 'tono': return c.tonalidad ? tonoVer(c.tonalidad) : null;
      case 'tempo': n = parseInt(c.tempo, 10); return isNaN(n) ? null : n;
      case 'etiquetas': return c.etiquetas.length ? c.etiquetas.slice().sort(function (x, y) { return x.localeCompare(y, LOCALE); })[0] : null;
      case 'recientes': return c.creada;
      case 'uso': n = state.uso[c.id]; return n ? n.n * 1e9 + Number(String(n.ultima).replace(/\D/g, '').slice(0, 8)) : 0;
      case 'letra': return c.letra ? 1 : 0;
      case 'partituras': case 'audios': case 'editables': case 'youtube': return c[orden] || 0;
      default: return c.titulo;
    }
  }

  function comparar(a, b) {
    var orden = ORDENES[state.orden] ? state.orden : 'titulo';
    var va = valorOrden(a, orden), vb = valorOrden(b, orden);
    var r = 0;
    if (va === null || vb === null) { r = va === vb ? 0 : va === null ? 1 : -1; }
    else {
      r = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), LOCALE, { sensitivity: 'base' });
      // Sentido: el natural de la columna, o el contrario si se ha vuelto a pulsar su cabecera.
      if (ORDENES[orden].asc === state.ordenInverso) { r = -r; }
    }
    return r || a.titulo.localeCompare(b.titulo, LOCALE, { sensitivity: 'base' });
  }

  /** Ordena por una columna; si ya era esa, invierte el sentido. */
  function ordenarPor(orden) {
    state.ordenInverso = state.orden === orden ? !state.ordenInverso : false;
    state.orden = orden;
    if (ui.orden) { ui.orden.value = orden; }
    pintarLista();
  }

  // Fragmento de la letra donde aparece la búsqueda.
  function fragmentoLetra(letra, q) {
    var lineas = String(letra || '').split(/\n+/);
    var tokens = norm(q).split(' ');
    for (var i = 0; i < lineas.length; i++) {
      var n = norm(lineas[i]);
      if (tokens.every(function (t) { return n.indexOf(t) !== -1; })) { return lineas[i].trim(); }
    }
    for (var j = 0; j < lineas.length; j++) {
      if (norm(lineas[j]).indexOf(tokens[0]) !== -1) { return lineas[j].trim(); }
    }
    return '';
  }

  function resaltar(texto, q) {
    var nq = norm(q);
    if (!nq) { return [texto]; }
    // Busca la coincidencia sobre la versión sin acentos, que conserva las posiciones carácter a carácter.
    var plano = String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    var original = String(texto).normalize('NFC');
    if (plano.length !== original.length) { return [texto]; }
    var idx = plano.indexOf(nq);
    if (idx === -1) { return [texto]; }
    return [original.slice(0, idx), h('mark', { text: original.slice(idx, idx + nq.length) }), original.slice(idx + nq.length)];
  }

  // ---------------------------------------------------------------- estructura

  var ui = { detalle: {} };
  var VISTAS = [
    { vista: 'inicio', href: '#/', icono: 'casa', texto: __('Inicio') },
    { vista: 'canciones', href: '#/canciones', icono: 'nota', texto: __('Canciones') },
    { vista: 'cultos', href: '#/cultos', icono: 'calendario', texto: __('Cultos') },
    { vista: 'estadisticas', href: '#/estadisticas', icono: 'grafica', texto: __('Estadísticas') }
  ];
  var VISTAS_DIVIDIDAS = { cultos: __('Elige un culto para ver su setlist') };

  /** Con espacio suficiente, la lista y la ficha se ven a la vez (como en las apps de atril para tableta). */
  function esAncho() { return root.clientWidth >= 1000; }

  function montar() {
    root.innerHTML = '';

    ui.buscador = h('input', {
      type: 'search', class: 'pcan-search-input', placeholder: __('Filtrar por título, número, letra o etiqueta'),
      autocomplete: 'off', 'aria-label': __('Filtrar canciones'), enterkeyhint: 'search',
      oninput: function (e) { state.query = e.target.value; pintarLista(); }
    });
    ui.contador = h('span', { class: 'pcan-count' });
    ui.orden = h('select', {
      class: 'pcan-select', 'aria-label': __('Ordenar'),
      onchange: function (e) { state.orden = e.target.value; state.ordenInverso = false; pintarLista(); }
    }, Object.keys(ORDENES).map(function (k) { return h('option', { value: k, text: ORDENES[k].texto }); }));
    ui.chips = h('div', { class: 'pcan-chips', role: 'toolbar', 'aria-label': __('Filtrar por etiqueta') });
    ui.lista = h('div', { class: 'pcan-list', role: 'list' });
    ui.panel = h('div', { class: 'pcan-panel-wrap', hidden: true });

    // Barra lateral (pantallas anchas).
    ui.sideCultos = h('div', { class: 'pcan-side-cultos' });
    ui.sideUser = h('button', {
      type: 'button', class: 'pcan-side-user', 'aria-haspopup': 'true', 'aria-expanded': 'false',
      onclick: function (e) { e.stopPropagation(); alternarMenu(undefined, ui.sideUser); }
    }, h('span', { class: 'pcan-avatar', 'aria-hidden': 'true' }, iniciales(CFG.userName)),
      h('span', { class: 'pcan-side-user-text' }, h('strong', { text: CFG.userName }), h('small', { text: __('Tema y ajustes') })));
    var lateral = h('aside', { class: 'pcan-side', 'aria-label': __('Navegación del cancionero') },
      h('a', { class: 'pcan-brand', href: '#/' },
        h('span', { class: 'pcan-brand-logo', 'aria-hidden': 'true' }, icono('nota')),
        h('span', { class: 'pcan-brand-text' }, h('strong', { text: CFG.nombre || 'Cancionero' }), h('small', { text: CFG.sitio }))),
      h('button', { type: 'button', class: 'pcan-side-search', onclick: function () { abrirPaleta(); } },
        icono('buscar'), h('span', { text: __('Buscar') }), h('kbd', { text: atajo() })),
      ui.sideNav = h('nav', { class: 'pcan-side-nav', 'aria-label': __('Secciones') }, VISTAS.map(function (v) {
        return h('a', { href: v.href, class: 'pcan-side-link', 'data-vista': v.vista }, icono(v.icono), h('span', { text: v.texto }));
      })),
      h('div', { class: 'pcan-side-section' }, h('p', { class: 'pcan-side-label', text: __('Próximos cultos') }), ui.sideCultos),
      h('div', { class: 'pcan-side-foot' }, ui.sideUser));

    // Barra superior.
    ui.titulo = h('h1', { class: 'pcan-top-title' });
    ui.btnNuevo = h('a', { class: 'pcan-btn pcan-btn-primary pcan-top-nuevo', href: '#/nueva' }, icono('mas'), h('span', { text: __('Nueva canción') }));
    ui.topUser = h('button', {
      type: 'button', class: 'pcan-avatar pcan-top-avatar', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': sprintf(/* translators: %s: nombre de la persona */ __('Menú de %s'), CFG.userName),
      onclick: function (e) { e.stopPropagation(); alternarMenu(undefined, ui.topUser); }
    }, iniciales(CFG.userName));
    var superior = h('header', { class: 'pcan-top' },
      h('a', { class: 'pcan-brand pcan-top-brand', href: '#/' },
        h('span', { class: 'pcan-brand-logo', 'aria-hidden': 'true' }, icono('nota'))),
      ui.titulo,
      h('button', { type: 'button', class: 'pcan-top-search', onclick: function () { abrirPaleta(); }, 'aria-label': __('Buscar') },
        icono('buscar'), h('span', { class: 'pcan-top-search-text', text: __('Buscar canciones, cultos o acciones') }), h('kbd', { text: atajo() })),
      ui.btnNuevo,
      ui.topUser);

    // Navegación inferior y botón flotante (móvil).
    ui.tabbar = h('nav', { class: 'pcan-tabbar', 'aria-label': __('Secciones') }, VISTAS.map(function (v) {
      return h('a', { href: v.href, class: 'pcan-tab-link', 'data-vista': v.vista }, icono(v.icono), h('span', { text: v.texto }));
    }));
    ui.fab = h('a', { class: 'pcan-fab', href: '#/nueva', 'aria-label': __('Nueva canción') }, icono('mas'));

    // Menú de usuario (preferencias y enlaces), compartido por la barra lateral y la superior.
    // En el móvil es una hoja inferior con fondo oscurecido (ui.menuFondo).
    ui.menuTemas = h('div', { class: 'pcan-menu-temas', role: 'radiogroup', 'aria-label': __('Tema') });
    // Idioma (solo si hay más de uno disponible) y notación de las tonalidades: se guardan y se recarga la página,
    // porque cambiar el idioma exige cargar otras traducciones.
    var idiomas = CFG.idiomas || {};
    ui.menuIdioma = Object.keys(idiomas).length > 1 ? h('select', {
      class: 'pcan-menu-select', id: 'pcan-menu-idioma',
      onchange: function (e) { guardarPreferencia({ idioma: e.target.value }); }
    }) : null;
    ui.menuNotacion = h('div', { class: 'pcan-menu-segmento', role: 'radiogroup', 'aria-labelledby': 'pcan-menu-notacion-t' });
    function enlaceMenu(href, icon, texto) {
      return h('a', { class: 'pcan-menu-item', href: href }, icono(icon), texto);
    }
    ui.menuFondo = h('div', { class: 'pcan-menu-fondo', hidden: true });
    ui.menu = h('div', { class: 'pcan-menu', hidden: true, role: 'dialog', 'aria-label': sprintf(/* translators: %s: nombre de la persona */ __('Menú de %s'), CFG.userName) },
      h('div', { class: 'pcan-menu-user' }, h('strong', { text: CFG.userName }),
        h('span', { text: CFG.gestionar ? __('Administración del cancionero') : __('Equipo') })),
      h('div', { class: 'pcan-menu-cuerpo' },
        h('p', { class: 'pcan-menu-label', text: __('Tema') }),
        ui.menuTemas,
        ui.menuIdioma ? h('div', { class: 'pcan-menu-fila' }, h('label', { class: 'pcan-menu-label', 'for': 'pcan-menu-idioma', text: __('Idioma') }), ui.menuIdioma) : null,
        h('p', { class: 'pcan-menu-label', id: 'pcan-menu-notacion-t', text: __('Notación') }),
        ui.menuNotacion,
        CFG.gestionar ? h('div', { class: 'pcan-menu-grupo' },
          h('p', { class: 'pcan-menu-label', text: __('Administración') }),
          enlaceMenu('#/ajustes', 'ajustes', __('Ajustes y equipo'))) : null),
      h('div', { class: 'pcan-menu-pie' },
        enlaceMenu(CFG.homeUrl, 'salir-web', __('Volver a la web')),
        enlaceMenu(CFG.logoutUrl, 'salir', __('Cerrar sesión')),
        CFG.version ? h('p', { class: 'pcan-menu-version', text: 'Cancionero ' + CFG.version }) : null));
    // Elegir un enlace cierra el menú; las flechas recorren la rejilla de temas y el segmentado.
    ui.menu.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a.pcan-menu-item') : null;
      if (a) { cerrarMenu(true); }
    });
    ui.menu.addEventListener('keydown', teclasMenu);
    pintarMenuTemas();
    pintarMenuPreferencias();

    // Vistas.
    ui.vistaInicio = h('section', { class: 'pcan-vista', 'data-vista': 'inicio' });
    ui.vistaCanciones = h('section', { class: 'pcan-vista', 'data-vista': 'canciones', hidden: true });
    ui.vistaCultos = h('section', { class: 'pcan-vista', 'data-vista': 'cultos', hidden: true });
    ui.vistaEstadisticas = h('section', { class: 'pcan-vista', 'data-vista': 'estadisticas', hidden: true });

    ui.detalle.canciones = h('div', { class: 'pcan-split-detail', 'aria-live': 'polite' });
    ui.detalle.cultos = h('div', { class: 'pcan-split-detail', 'aria-live': 'polite' });
    ui.listaCultos = h('div', { class: 'pcan-split-list' });

    ui.resumen = h('div', { class: 'pcan-resumen', role: 'toolbar', 'aria-label': __('Filtrar por recursos') });
    ui.thead = h('div', { class: 'pcan-thead' });
    append(ui.vistaCanciones, h('div', { class: 'pcan-split' },
      h('div', { class: 'pcan-split-list' },
        ui.resumen,
        h('div', { class: 'pcan-toolbar' },
          h('label', { class: 'pcan-search' }, icono('filtro'), ui.buscador, ui.contador),
          ui.orden,
          h('a', { class: 'pcan-btn pcan-btn-sec pcan-lote-btn', href: '#/subir', title: __('Subir varias canciones de golpe'), 'aria-label': __('Subida múltiple') }, icono('subir'), h('span', { class: 'pcan-lote-btn-txt', text: __('Subida múltiple') })),
          CFG.gestionar ? (ui.btnMarcar = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sec pcan-lote-btn pcan-lote-btn-borrar', title: __('Elegir canciones para borrarlas'), 'aria-label': __('Borrar'), 'aria-pressed': 'false', onclick: function () { alternarMarcado(); } }, icono('borrar'), h('span', { class: 'pcan-lote-btn-txt', text: __('Borrar') }))) : null),
        ui.chips,
        ui.thead,
        ui.lista,
        ui.barraMarcado = h('div', { class: 'pcan-barra-marcado', role: 'toolbar', 'aria-label': __('Canciones seleccionadas'), hidden: true })),
      ui.detalle.canciones));
    ui.splitCultos = h('div', { class: 'pcan-split' }, ui.listaCultos, ui.detalle.cultos);
    append(ui.vistaCultos, ui.splitCultos);
    Object.keys(ui.detalle).forEach(vaciarDetalle);

    append(root, h('div', { class: 'pcan-shell' },
      lateral,
      h('div', { class: 'pcan-body' },
        superior,
        h('main', { class: 'pcan-main' }, ui.vistaInicio, ui.vistaCanciones, ui.vistaCultos, ui.vistaEstadisticas))));
    append(root, [ui.tabbar, ui.fab, ui.panel, ui.menuFondo, ui.menu]);

    document.addEventListener('click', function (e) {
      if (!ui.menu.hidden && !ui.menu.contains(e.target)) { cerrarMenu(false); }
    });
    // Al cruzar el ancho de la vista dividida se vuelve a pintar la ruta en el sitio adecuado.
    var ancho = esAncho();
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        if (esAncho() !== ancho) { ancho = esAncho(); if (panelModo === 'split' || panelModo === 'sheet') { ruta(); } }
      }).observe(root);
    }

    mostrarVista(state.vista);
  }

  function atajo() { return /Mac|iP(hone|ad)/.test(navigator.platform) ? '⌘K' : 'Ctrl K'; }

  function vaciarDetalle(vista) {
    var host = ui.detalle[vista];
    host.innerHTML = '';
    // Canciones no tiene vista dividida: su ficha es una página que sustituye a la biblioteca.
    if (vista === 'canciones') {
      ui.vistaCanciones.classList.remove('is-pagina');
      state.seleccion[vista] = 0;
      return;
    }
    // Una vista puede llenar el hueco con su propia portada (los cultos muestran el próximo y lo pendiente).
    if (!(ganchos.detalleVacio[vista] && ganchos.detalleVacio[vista](host))) {
      append(host, h('div', { class: 'pcan-detail-empty' },
        h('span', { class: 'pcan-detail-empty-ico', 'aria-hidden': 'true' }, icono(vista === 'cultos' ? 'calendario' : 'partitura')),
        h('p', { text: VISTAS_DIVIDIDAS[vista] }),
        h('p', { class: 'pcan-muted' }, conNodo(/* translators: %s: la tecla «/» (atajo del teclado) */ __('o pulsa %s para buscar'), h('kbd', { text: '/' })))));
    }
    state.seleccion[vista] = 0;
    marcarSeleccion(vista);
  }

  function marcarSeleccion(vista) {
    var cont = vista === 'cultos' ? ui.listaCultos : ui.lista;
    if (!cont) { return; }
    Array.prototype.forEach.call(cont.querySelectorAll('[data-id]'), function (el) {
      var sel = +el.getAttribute('data-id') === state.seleccion[vista];
      el.classList.toggle('is-selected', sel);
      if (sel) { el.setAttribute('aria-current', 'true'); } else { el.removeAttribute('aria-current'); }
    });
  }

  function pintarMenuTemas() {
    ui.menuTemas.innerHTML = '';
    Object.keys(CFG.temas || {}).forEach(function (clave) {
      var activo = state.tema === clave;
      append(ui.menuTemas, h('button', {
        type: 'button', role: 'radio', 'aria-checked': activo ? 'true' : 'false', class: 'pcan-tema-opcion' + (activo ? ' is-active' : ''),
        onclick: function (e) { e.stopPropagation(); aplicarTema(clave, true); }
      }, h('span', { class: 'pcan-tema-muestra', 'data-muestra': clave, 'aria-hidden': 'true' }), h('span', { class: 'pcan-tema-nombre', text: CFG.temas[clave] }), activo ? icono('check') : null));
    });
    tabulacionCircular(ui.menuTemas);
  }

  /** Un solo botón del grupo (el elegido, o el primero) entra en el orden de Tab; las flechas mueven el foco dentro del grupo. */
  function tabulacionCircular(cont) {
    var bs = cont.querySelectorAll('[role="radio"]');
    var sel = cont.querySelector('[aria-checked="true"]') || bs[0];
    Array.prototype.forEach.call(bs, function (b) { b.setAttribute('tabindex', b === sel ? '0' : '-1'); });
  }

  /** Flechas dentro de la rejilla de temas (2 columnas) y del segmentado de notación (una fila); solo mueven el foco. */
  function teclasMenu(e) {
    var grupo = e.target.closest ? e.target.closest('[role="radiogroup"]') : null;
    if (!grupo || e.target.getAttribute('role') !== 'radio') { return; }
    var bs = Array.prototype.slice.call(grupo.querySelectorAll('[role="radio"]'));
    var i = bs.indexOf(e.target), n = bs.length, j = i;
    var rejilla = grupo === ui.menuTemas;
    if (e.key === 'ArrowRight') { j = rejilla ? Math.min(i + 1, n - 1) : (i + 1) % n; }
    else if (e.key === 'ArrowLeft') { j = rejilla ? Math.max(i - 1, 0) : (i - 1 + n) % n; }
    else if (e.key === 'ArrowDown') { j = rejilla ? Math.min(i + 2, n - 1) : (i + 1) % n; }
    else if (e.key === 'ArrowUp') { j = rejilla ? Math.max(i - 2, 0) : (i - 1 + n) % n; }
    else if (e.key === 'Home') { j = 0; }
    else if (e.key === 'End') { j = n - 1; }
    else { return; }
    e.preventDefault();
    bs.forEach(function (b, k) { b.setAttribute('tabindex', k === j ? '0' : '-1'); });
    bs[j].focus();
  }

  /** Guarda una preferencia del usuario (idioma o notación) y recarga para aplicarla. */
  function guardarPreferencia(datos) {
    api('preferencias', { json: datos }).then(function () { window.location.reload(); })
      .catch(function () { aviso(__('No se pudo guardar la preferencia'), 'error'); });
  }

  function pintarMenuPreferencias() {
    var idiomas = CFG.idiomas || {};
    if (ui.menuIdioma) {
      ui.menuIdioma.innerHTML = '';
      [['', __('Automático (idioma del sitio)')]].concat(Object.keys(idiomas).map(function (k) { return [k, idiomas[k]]; })).forEach(function (o) {
        append(ui.menuIdioma, h('option', { value: o[0], text: o[1] }));
      });
      ui.menuIdioma.value = CFG.idiomaElegido || '';
    }
    // La notación no depende del idioma: se elige una de las dos y se marca la que está en uso (si la persona aún no ha
    // elegido, la del idioma de la web).
    var enUso = CFG.notacion === 'americana' ? 'americana' : 'latina';
    ui.menuNotacion.innerHTML = '';
    [['latina', 'Do-Re-Mi'], ['americana', 'C-D-E']].forEach(function (o) {
      var activo = enUso === o[0];
      append(ui.menuNotacion, h('button', {
        type: 'button', role: 'radio', 'aria-checked': activo ? 'true' : 'false', class: 'pcan-menu-seg' + (activo ? ' is-active' : ''),
        onclick: function (e) {
          e.stopPropagation();
          if (!activo) { guardarPreferencia({ notacion: o[0] }); }
        }
      }, o[1]));
    });
    tabulacionCircular(ui.menuNotacion);
  }

  var menuOrigen = null;

  /** Cierra el menú; con devolverFoco, el foco vuelve al botón que lo abrió. */
  function cerrarMenu(devolverFoco) {
    var origen = menuOrigen;
    alternarMenu(false);
    if (devolverFoco && origen) { origen.focus(); }
  }

  function alternarMenu(abrir, origen) {
    if (!ui.menu) { return; }
    var mostrar = abrir === undefined ? ui.menu.hidden || (origen && origen !== menuOrigen) : abrir;
    ui.menu.hidden = !mostrar;
    ui.menuFondo.hidden = !mostrar;
    [ui.sideUser, ui.topUser].forEach(function (b) { if (b) { b.setAttribute('aria-expanded', mostrar && b === origen ? 'true' : 'false'); } });
    if (!mostrar) { menuOrigen = null; return; }
    menuOrigen = origen;
    // En el móvil es una hoja inferior (la fija el CSS); en pantallas anchas se coloca junto al botón que lo abre:
    // hacia arriba en la barra lateral, hacia abajo en la superior.
    var movil = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    var r = origen.getBoundingClientRect();
    if (movil) {
      ui.menu.style.top = ui.menu.style.bottom = ui.menu.style.left = '';
    } else if (origen === ui.sideUser) {
      ui.menu.style.top = '';
      ui.menu.style.bottom = (window.innerHeight - r.top + 8) + 'px';
      ui.menu.style.left = Math.max(8, r.left) + 'px';
    } else {
      ui.menu.style.bottom = '';
      ui.menu.style.top = (r.bottom + 8) + 'px';
      ui.menu.style.left = Math.max(8, r.right - 288) + 'px';
    }
    var foco = ui.menu.querySelector('.pcan-menu-temas [tabindex="0"]');
    if (foco) { foco.focus(); }
  }

  function mostrarVista(vista) {
    var cambia = state.vista !== vista;
    state.vista = vista;
    [ui.vistaInicio, ui.vistaCanciones, ui.vistaCultos, ui.vistaEstadisticas].forEach(function (s) {
      s.hidden = s.getAttribute('data-vista') !== vista;
    });
    [ui.sideNav, ui.tabbar].forEach(function (nav) {
      Array.prototype.forEach.call(nav.querySelectorAll('[data-vista]'), function (a) {
        var activo = a.getAttribute('data-vista') === vista;
        a.classList.toggle('is-active', activo);
        if (activo) { a.setAttribute('aria-current', 'page'); } else { a.removeAttribute('aria-current'); }
      });
    });
    var def = VISTAS.filter(function (v) { return v.vista === vista; })[0];
    ui.titulo.textContent = def ? def.texto : '';
    var nuevo = vista === 'cultos' ? { href: '#/culto/nuevo', texto: __('Nuevo culto') } : { href: '#/nueva', texto: __('Nueva canción') };
    ui.btnNuevo.setAttribute('href', nuevo.href);
    ui.btnNuevo.lastChild.textContent = nuevo.texto;
    ui.fab.setAttribute('href', nuevo.href);
    ui.fab.setAttribute('aria-label', nuevo.texto);
    root.setAttribute('data-vista', vista);
    if (ganchos.vistas[vista]) { ganchos.vistas[vista](cambia); }
    if (vista === 'inicio' && cambia) { pintarInicio(); }
    if (cambia) { (root.classList.contains('is-app') ? root : document.scrollingElement).scrollTop = 0; }
  }

  // ---------------------------------------------------------------- paleta de búsqueda (Ctrl/⌘ K)

  var paleta = null;

  function abrirPaleta(inicial) {
    if (paleta) { paleta.input.focus(); return; }
    var input = h('input', { type: 'search', class: 'pcan-paleta-input', placeholder: __('Busca una canción por título, número o letra… o un culto, o una acción'), autocomplete: 'off', 'aria-label': __('Buscar'), enterkeyhint: 'go' });
    var lista = h('div', { class: 'pcan-paleta-lista', role: 'listbox' });
    var activo = 0;
    var items = [];

    var acciones = [
      { titulo: __('Nueva canción'), sub: __('Subir partitura, letra y audios'), icono: 'mas', href: '#/nueva' },
      { titulo: __('Subir varias canciones'), sub: __('Una canción por archivo, con su nombre como título'), icono: 'subir', href: '#/subir' },
      { titulo: __('Nuevo culto'), sub: __('Preparar un setlist'), icono: 'calendario', href: '#/culto/nuevo' },
      { titulo: __('Estadísticas'), sub: __('Qué tocamos y qué no'), icono: 'grafica', href: '#/estadisticas' }
    ].concat(CFG.gestionar ? [
      { titulo: __('Ajustes y equipo'), sub: __('Nombre, tema por defecto, plazo de la papelera'), icono: 'ajustes', href: '#/ajustes' },
      { titulo: __('Equipo'), sub: __('Correos con acceso, administradores y dominio'), icono: 'equipo', href: '#/ajustes/equipo' },
      { titulo: __('Accesos'), sub: __('Quién entra y cuánto se usa'), icono: 'grafica', href: '#/ajustes/accesos' },
      { titulo: __('Escaleta'), sub: __('Logo e imagen de cabecera de la hoja impresa del culto'), icono: 'lista', href: '#/ajustes/escaleta' },
      { titulo: __('Acceso con Google'), sub: __('Client ID de Google'), icono: 'acceso', href: '#/ajustes/google' },
      { titulo: __('Archivos'), sub: __('Protección y archivos sin usar'), icono: 'partitura', href: '#/ajustes/archivos' },
      { titulo: __('Papelera'), sub: __('Restaurar o eliminar canciones borradas'), icono: 'borrar', href: '#/ajustes/papelera' },
      { titulo: __('Copias de seguridad'), sub: __('Descargar o restaurar una copia'), icono: 'descargar', href: '#/ajustes/copias' }] : [])
      .concat(Object.keys(CFG.temas || {}).map(function (k) {
        return { titulo: sprintf(/* translators: %s: nombre del tema visual */ __('Tema: %s'), CFG.temas[k]), sub: __('Cambiar la apariencia'), icono: 'tema', fn: function () { aplicarTema(k, true); } };
      }));

    function pintar() {
      var q = input.value.trim();
      var nq = norm(q);
      items = [];
      lista.innerHTML = '';
      var grupos = [];
      var canciones = q ? buscar(q, '').slice(0, 7) : state.canciones.slice().sort(function (a, b) { return b.creada.localeCompare(a.creada); }).slice(0, 5).map(function (c) { return { c: c }; });
      if (canciones.length) {
        grupos.push({ titulo: q ? __('Canciones') : __('Añadidas recientemente'), items: canciones.map(function (r) {
          return { titulo: r.c.titulo, sub: [r.c.numero ? sprintf(/* translators: %s: número de himnario */ __('Nº %s'), r.c.numero) : '', tonoVer(r.c.tonalidad), r.enLetra ? '«' + fragmentoLetra(r.c.letra, q) + '»' : ''].filter(Boolean).join(' · '), icono: 'nota', href: '#/cancion/' + r.c.id, num: r.c.numero };
        }) });
      }
      ganchos.paleta.forEach(function (fn) { var g = fn(q); if (g && g.items.length) { grupos.push(g); } });
      var acc = acciones.filter(function (a) { return !nq || norm(a.titulo + ' ' + a.sub).indexOf(nq) !== -1; });
      // Primero las acciones cuyo título coincide, después las que solo coinciden en la descripción.
      if (nq) { acc = acc.filter(function (a) { return norm(a.titulo).indexOf(nq) !== -1; }).concat(acc.filter(function (a) { return norm(a.titulo).indexOf(nq) === -1; })); }
      if (acc.length) { grupos.push({ titulo: __('Acciones'), items: acc }); }

      if (!grupos.length) {
        append(lista, h('div', { class: 'pcan-paleta-vacio' }, sprintf(/* translators: %s: lo que se ha escrito en el buscador */ __('Nada coincide con «%s».'), q) + ' ', h('a', { href: '#/nueva', onclick: cerrar, text: __('Añadir esta canción') })));
        return;
      }
      grupos.forEach(function (g) {
        append(lista, h('p', { class: 'pcan-paleta-grupo', text: g.titulo }));
        g.items.forEach(function (it) {
          var i = items.length;
          items.push(it);
          append(lista, h('button', {
            type: 'button', role: 'option', class: 'pcan-paleta-item' + (i === activo ? ' is-active' : ''), 'aria-selected': i === activo ? 'true' : 'false',
            onmousemove: function () { if (activo !== i) { activo = i; marcar(); } },
            onclick: function () { elegir(it); }
          }, h('span', { class: 'pcan-paleta-ico', 'aria-hidden': 'true' }, it.num ? it.num : icono(it.icono)),
            h('span', { class: 'pcan-paleta-texto' }, h('strong', { text: it.titulo }), it.sub ? h('span', { text: it.sub }) : null),
            icono('siguiente')));
        });
      });
      activo = Math.min(activo, items.length - 1);
    }

    function marcar() {
      Array.prototype.forEach.call(lista.querySelectorAll('.pcan-paleta-item'), function (b, i) {
        b.classList.toggle('is-active', i === activo);
        b.setAttribute('aria-selected', i === activo ? 'true' : 'false');
        if (i === activo && b.scrollIntoView) { b.scrollIntoView({ block: 'nearest' }); }
      });
    }

    function elegir(it) {
      cerrar();
      if (it.fn) { it.fn(); } else if (it.href) { location.hash = it.href; }
    }

    function cerrar() {
      if (!paleta) { return; }
      paleta.capa.remove();
      paleta = null;
      document.documentElement.classList.remove('pcan-lock');
    }

    input.addEventListener('input', function () { activo = 0; pintar(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); activo = Math.min(activo + 1, items.length - 1); marcar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activo = Math.max(activo - 1, 0); marcar(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (items[activo]) { elegir(items[activo]); } }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); }
    });

    var capa = h('div', { class: 'pcan-paleta-capa', onclick: function (e) { if (e.target === capa) { cerrar(); } } },
      h('div', { class: 'pcan-paleta', role: 'dialog', 'aria-modal': 'true', 'aria-label': __('Buscar') },
        h('div', { class: 'pcan-paleta-campo' }, icono('buscar'), input, h('kbd', { text: 'Esc' })),
        lista,
        h('div', { class: 'pcan-paleta-pie' }, h('span', null, h('kbd', { text: '↑' }), h('kbd', { text: '↓' }), ' ' + __('moverse')), h('span', null, h('kbd', { text: '↵' }), ' ' + __('abrir')))));
    paleta = { capa: capa, input: input };
    append(root, capa);
    document.documentElement.classList.add('pcan-lock');
    if (inicial) { input.value = inicial; }
    pintar();
    input.focus();
  }

  // ---------------------------------------------------------------- vista: inicio

  function saludo() {
    var hora = new Date().getHours();
    var parte = hora < 6 ? __('Buenas noches') : hora < 13 ? __('Buenos días') : hora < 21 ? __('Buenas tardes') : __('Buenas noches');
    return sprintf(/* translators: 1: saludo («Buenos días»…), 2: nombre de pila de la persona */ __('%1$s, %2$s'), parte, String(CFG.userName || '').split(' ')[0]);
  }

  /** Cifras del repertorio en inicio; cada una abre Canciones con el filtro correspondiente. */
  function pintarCifras() {
    if (!ui.cifras) { return; }
    var cs = state.canciones;
    var cuenta = function (fn) { return cs.filter(fn).length; };
    var datos = cs.length ? [
      [__('Canciones'), cs.length, ''],
      [__('Con audio'), cuenta(function (c) { return c.audios; }), 'audio'],
      [__('Con letra'), cuenta(function (c) { return c.letra; }), 'letra'],
      state.usoCargado ? [__('Nunca tocadas'), cuenta(function (c) { return !state.uso[c.id]; }), 'nunca'] : [__('Con YouTube'), cuenta(function (c) { return c.youtube; }), 'youtube']
    ] : [];
    ui.cifras.innerHTML = '';
    append(ui.cifras, datos.map(function (d) {
      return h('a', { class: 'pcan-cifra', href: '#/canciones', onclick: function () { state.filtro = d[2]; if (ui.lista) { pintarLista(); } } },
        h('strong', { text: String(d[1]) }), h('span', { text: d[0] }));
    }));
  }

  function pintarInicio() {
    var cont = ui.vistaInicio;
    cont.innerHTML = '';
    var hoy = new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    var heroe = h('div', { class: 'pcan-home-hero' });
    var tarjetas = h('div', { class: 'pcan-home-grid' });
    ui.cifras = h('div', { class: 'pcan-home-cifras', 'aria-label': __('El repertorio en cifras') });
    pintarCifras();

    var recientes = state.canciones.slice().sort(function (a, b) { return b.creada.localeCompare(a.creada); }).slice(0, 5);
    append(tarjetas, h('section', { class: 'pcan-home-card' },
      h('header', { class: 'pcan-home-card-head' }, h('h2', { text: __('Añadidas recientemente') }), h('a', { href: '#/canciones', text: __('Ver todas') })),
      recientes.length ? h('ul', { class: 'pcan-mini-lista' }, recientes.map(function (c) {
        return h('li', null, h('a', { href: '#/cancion/' + c.id },
          h('span', { class: 'pcan-num is-sm' + (c.numero ? '' : ' is-empty') }, c.numero ? c.numero : icono('nota')),
          h('span', { class: 'pcan-mini-texto' }, h('strong', { text: c.titulo }), h('span', { text: [c.autor, tonoVer(c.tonalidad)].filter(Boolean).join(' · ') || __('Sin datos adicionales') }))));
      })) : h('p', { class: 'pcan-muted', text: __('Aún no hay canciones.') })));

    append(cont, h('div', { class: 'pcan-home' },
      h('div', { class: 'pcan-home-saludo' }, h('p', { class: 'pcan-home-fecha', text: hoy.charAt(0).toUpperCase() + hoy.slice(1) }), h('h1', { text: saludo() })),
      h('button', { type: 'button', class: 'pcan-home-buscar', onclick: function () { abrirPaleta(); } },
        icono('buscar'), h('span', { text: __('¿Qué canción buscas?') }), h('kbd', { text: atajo() })),
      heroe,
      h('div', { class: 'pcan-home-atajos' },
        h('a', { class: 'pcan-atajo', href: '#/nueva' }, h('span', { class: 'pcan-atajo-ico' }, icono('mas')), h('span', null, h('strong', { text: __('Nueva canción') }), h('small', { text: __('Partitura, letra y audios') }))),
        h('a', { class: 'pcan-atajo', href: '#/culto/nuevo' }, h('span', { class: 'pcan-atajo-ico' }, icono('calendario')), h('span', null, h('strong', { text: __('Nuevo culto') }), h('small', { text: __('Preparar el setlist') }))),
        h('a', { class: 'pcan-atajo', href: '#/estadisticas' }, h('span', { class: 'pcan-atajo-ico' }, icono('grafica')), h('span', null, h('strong', { text: __('Estadísticas') }), h('small', { text: __('Qué tocamos y qué no') })))),
      ui.cifras,
      tarjetas));

    ganchos.inicio.forEach(function (fn) { fn(heroe, tarjetas); });
  }

  // ---------------------------------------------------------------- vista: canciones

  function pintarChips() {
    ui.chips.innerHTML = '';
    var todas = etiquetasTodas();
    if (!todas.length) { ui.chips.hidden = true; return; }
    ui.chips.hidden = false;
    var chip = function (nombre, etiqueta, n) {
      var activo = state.etiqueta === etiqueta;
      return h('button', {
        type: 'button', class: 'pcan-chip' + (activo ? ' is-active' : ''), 'aria-pressed': activo ? 'true' : 'false',
        style: etiqueta ? estiloEtiqueta(etiqueta) : null,
        onclick: function () { state.etiqueta = activo && etiqueta ? '' : etiqueta; pintarChips(); pintarLista(); }
      }, nombre, n !== undefined ? h('span', { class: 'pcan-chip-n', text: String(n) }) : null);
    };
    append(ui.chips, chip(_x('Todas', 'filtro de etiquetas: todas las canciones'), '', state.canciones.length));
    todas.forEach(function (e) { append(ui.chips, chip(e.nombre, e.nombre, e.n)); });
  }

  function pasaFiltro(c) {
    if (state.filtro === 'letra') { return !!c.letra; }
    if (state.filtro === 'audio') { return !!c.audios; }
    if (state.filtro === 'editable') { return !!c.editables; }
    if (state.filtro === 'youtube') { return !!c.youtube; }
    if (state.filtro === 'nunca') { return !state.uso[c.id]; }
    return true;
  }

  /** Quita el punto de las abreviaturas («lun.», «sept.») sin tocar otros signos del idioma. */
  function sinPunto(texto) {
    return String(texto).replace(/\.(?=\s|$)/g, '');
  }

  function fechaCorta(iso) {
    var p = String(iso || '').slice(0, 10).split('-');
    if (p.length < 3) { return ''; }
    return sinPunto(new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }));
  }

  /** Fecha con año (26 oct 2026), en el idioma del usuario. */
  function fechaCompleta(iso) {
    var p = String(iso || '').slice(0, 10).split('-');
    if (p.length < 3) { return ''; }
    return sinPunto(new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }));
  }

  /** Lo mismo desde una marca de tiempo Unix (en segundos). */
  function fechaMarca(segundos) {
    return sinPunto(new Date(segundos * 1000).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }));
  }

  /** Resumen de la biblioteca: cada cifra es también un filtro. */
  function pintarResumen() {
    ui.resumen.innerHTML = '';
    var total = state.canciones.length;
    var cuenta = function (fn) { return state.canciones.filter(fn).length; };
    var tarjetas = [
      { id: '', texto: __('Canciones'), n: total, icono: 'nota' },
      { id: 'letra', texto: __('Con letra'), n: cuenta(function (c) { return c.letra; }), icono: 'letra' },
      { id: 'audio', texto: __('Con audio'), n: cuenta(function (c) { return c.audios; }), icono: 'audio' },
      { id: 'editable', texto: __('Con editable'), n: cuenta(function (c) { return c.editables; }), icono: 'editable' },
      { id: 'youtube', texto: __('Con YouTube'), n: cuenta(function (c) { return c.youtube; }), icono: 'youtube' }
    ];
    if (state.usoCargado) {
      tarjetas.push({ id: 'nunca', texto: __('Nunca tocadas'), n: cuenta(function (c) { return !state.uso[c.id]; }), icono: 'calendario' });
    }
    tarjetas.forEach(function (t) {
      var activo = state.filtro === t.id;
      append(ui.resumen, h('button', {
        type: 'button', class: 'pcan-resumen-item' + (activo ? ' is-active' : ''), 'aria-pressed': activo ? 'true' : 'false',
        title: t.id ? sprintf(/* translators: %s: nombre del filtro en minúsculas (con letra, con audio…) */ __('Mostrar solo: %s'), t.texto.toLowerCase()) : __('Mostrar todas'),
        onclick: function () { state.filtro = activo ? '' : t.id; pintarLista(); }
      },
        h('span', { class: 'pcan-resumen-ico', 'aria-hidden': 'true' }, icono(t.icono)),
        h('span', { class: 'pcan-resumen-n', text: String(t.n) }),
        h('span', { class: 'pcan-resumen-t', text: t.texto + (t.id && total ? ' · ' + Math.round(t.n / total * 100) + '%' : '') })));
    });
  }

  /** Cabecera de la tabla (pantallas anchas): cada columna ordena; pulsarla otra vez invierte el sentido. */
  function pintarCabecera() {
    ui.thead.innerHTML = '';
    function flecha(orden) {
      if (state.orden !== orden) { return null; }
      var asc = ORDENES[orden].asc !== state.ordenInverso;
      return h('span', { class: 'pcan-th-flecha', 'aria-hidden': 'true', text: asc ? '▴' : '▾' });
    }
    function boton(clase, orden, titulo, contenido) {
      var activo = state.orden === orden;
      return h('button', {
        type: 'button', class: clase + ' pcan-th' + (activo ? ' is-active' : ''), 'aria-pressed': activo ? 'true' : 'false',
        title: activo ? sprintf(/* translators: %s: nombre de la columna */ __('Ordenar por %s (pulsa otra vez para invertir)'), titulo) : sprintf(/* translators: %s: nombre de la columna */ __('Ordenar por %s'), titulo),
        onclick: function () { ordenarPor(orden); }
      }, contenido, flecha(orden));
    }
    var col = function (clase, texto, orden) { return boton(clase, orden, texto.toLowerCase(), texto); };
    var rec = function (orden, nombre, ico) { return boton('pcan-th-rec', orden, nombre, icono(ico)); };
    append(ui.thead, [
      col('pcan-c-num', __('Nº'), 'numero'),
      col('pcan-c-titulo', __('Título'), 'titulo'),
      col('pcan-c-tono', _x('Tono', 'tonalidad de la canción'), 'tono'),
      col('pcan-c-tempo', __('Tempo'), 'tempo'),
      col('pcan-c-tags', __('Etiquetas'), 'etiquetas'),
      h('span', { class: 'pcan-c-rec' },
        rec('partituras', __('partituras'), 'partitura'), rec('letra', __('letra'), 'letra'), rec('audios', __('audios'), 'audio'),
        rec('editables', __('partituras editables'), 'editable'), rec('youtube', __('vídeos de YouTube'), 'youtube')),
      col('pcan-c-uso', __('Tocada'), 'uso'),
      col('pcan-c-fecha', __('Añadida'), 'recientes')
    ]);
  }

  /** Punto de un recurso (partitura, letra, audio…); `titulo` ya lleva el recuento o «Sin …». */
  function puntoRecurso(n, nombre, titulo, extra) {
    return h('span', { class: 'pcan-dot' + (n ? ' is-on' : '') + (extra || ''), title: titulo },
      icono(nombre), n > 1 ? h('small', { text: String(n) }) : null);
  }

  // ---------------------------------------------------------------- borrado masivo (administradores)

  // null: lista normal. Objeto { id: true }: modo selección, cada fila es una casilla.
  var marcadas = null;

  function alternarMarcado(activar) {
    marcadas = (activar === undefined ? !marcadas : activar) ? {} : null;
    if (ui.btnMarcar) {
      ui.btnMarcar.setAttribute('aria-pressed', marcadas ? 'true' : 'false');
      ui.btnMarcar.classList.toggle('is-active', !!marcadas);
    }
    // Mientras se eligen canciones para borrar, el botón flotante «+» sobra y en el móvil taparía la barra.
    if (ui.fab) { ui.fab.hidden = !!marcadas; }
    pintarLista();
  }

  function idsMarcados() {
    return Object.keys(marcadas || {}).filter(function (k) { return marcadas[k]; }).map(Number);
  }

  function pintarBarraMarcado(visibles) {
    var barra = ui.barraMarcado;
    if (!barra) { return; }
    barra.innerHTML = '';
    barra.hidden = !marcadas;
    if (!marcadas) { return; }
    var ids = idsMarcados();
    var todas = visibles.length && visibles.every(function (id) { return marcadas[id]; });
    var confirmar = h('div', { class: 'pcan-barra-confirmar', role: 'alert', hidden: true });
    append(barra, [
      h('span', { class: 'pcan-barra-n', text: ids.length ? sprintf(_n('%d seleccionada', '%d seleccionadas', ids.length), ids.length) : __('Toca las canciones que quieras borrar') }),
      // Dos botones fijos: marcar todas las de la lista (con el filtro aplicado) y desmarcar todas.
      visibles.length ? h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', disabled: todas, onclick: function () {
        visibles.forEach(function (id) { marcadas[id] = true; });
        pintarLista();
      } }, icono('check'), sprintf(_n('Seleccionar la canción de la lista', 'Seleccionar las %d de la lista', visibles.length), visibles.length)) : null,
      h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', disabled: !ids.length, onclick: function () {
        marcadas = {};
        pintarLista();
      } }, __('Quitar la selección')),
      h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-danger', disabled: !ids.length, onclick: function () { confirmar.hidden = false; } }, icono('borrar'), __('Borrar')),
      h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () { alternarMarcado(false); } }, __('Cancelar')),
      confirmar]);
    append(confirmar, [
      h('span', { text: sprintf(_n('Se moverá %d canción a la papelera: deja de verse en el cancionero y en los setlists aparecerá como eliminada. Un administrador puede recuperarla desde «Papelera».', 'Se moverán %d canciones a la papelera: dejan de verse en el cancionero y en los setlists aparecerán como eliminadas. Un administrador puede recuperarlas desde «Papelera».', ids.length), ids.length) }),
      h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-primary', onclick: function (e) { e.currentTarget.disabled = true; borrarMarcadas(ids, confirmar); } }, __('Sí, borrar')),
      h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () { confirmar.hidden = true; } }, __('No'))]);
  }

  function borrarMarcadas(ids, caja) {
    var hechas = 0, fallos = 0;
    ids.reduce(function (cadena, id) {
      return cadena.then(function () {
        caja.firstChild.textContent = sprintf(/* translators: 1: número de la canción que se está borrando, 2: total de canciones */ __('Borrando %1$d de %2$d…'), hechas + 1, ids.length);
        return api('canciones/' + id, { method: 'DELETE' }).then(null, function () { fallos++; }).then(function () { hechas++; });
      });
    }, Promise.resolve()).then(function () {
      var ok = ids.length - fallos;
      aviso(sprintf(_n('%d canción movida a la papelera', '%d canciones movidas a la papelera', ok), ok) + (fallos ? ' · ' + sprintf(_n('%d no se pudo borrar', '%d no se pudieron borrar', fallos), fallos) : ''), fallos ? 'error' : undefined);
      alternarMarcado(false);
      return cargar().then(function () { pintarChips(); pintarLista(); });
    });
  }

  function pintarLista() {
    ui.lista.innerHTML = '';
    pintarBarraMarcado([]);
    pintarResumen();
    pintarCabecera();

    if (!state.cargado) { append(ui.lista, h('div', { class: 'pcan-empty', text: __('Cargando canciones…') })); return; }
    if (state.error) { append(ui.lista, h('div', { class: 'pcan-empty is-error', text: sprintf(/* translators: %s: motivo del error */ __('No se pudieron cargar las canciones: %s'), state.error) })); return; }

    var res = buscar(state.query, state.etiqueta).filter(function (r) { return pasaFiltro(r.c); });
    ui.contador.textContent = String(res.length);
    ui.contador.title = sprintf(_n('%d canción', '%d canciones', res.length), res.length);
    ui.thead.hidden = !res.length;

    if (!state.canciones.length) {
      append(ui.lista, h('div', { class: 'pcan-empty' },
        h('p', { text: __('Todavía no hay canciones.') }),
        h('a', { class: 'pcan-btn pcan-btn-primary', href: '#/nueva' }, icono('mas'), __('Subir la primera'))));
      return;
    }
    if (!res.length) {
      append(ui.lista, h('div', { class: 'pcan-empty' },
        h('p', { text: state.query ? sprintf(/* translators: %s: lo que se ha escrito en el buscador */ __('Ninguna canción coincide con «%s».'), state.query) : __('Ninguna canción cumple este filtro.') }),
        state.filtro || state.etiqueta
          ? h('button', { type: 'button', class: 'pcan-btn', onclick: function () { state.filtro = ''; state.etiqueta = ''; pintarChips(); pintarLista(); } }, __('Quitar filtros'))
          : h('a', { class: 'pcan-btn', href: '#/nueva' }, icono('mas'), __('Añadirla al cancionero'))));
      return;
    }

    var frag = document.createDocumentFragment();
    var visibles = res.map(function (r) { return r.c.id; });
    res.forEach(function (r) {
      var c = r.c;
      var snippet = r.enLetra ? fragmentoLetra(c.letra, state.query) : '';
      var uso = state.uso[c.id];

      // En modo selección la fila no abre la canción: marca o desmarca su casilla.
      var marcar = function (e) {
        if (e.type === 'keydown' && e.key !== ' ' && e.key !== 'Enter') { return; }
        e.preventDefault();
        marcadas[c.id] = !marcadas[c.id];
        var fila = e.currentTarget, casilla = fila.querySelector('.pcan-casilla');
        fila.classList.toggle('is-marcada', marcadas[c.id]);
        fila.setAttribute('aria-checked', String(marcadas[c.id]));
        casilla.innerHTML = '';
        if (marcadas[c.id]) { append(casilla, icono('check')); }
        pintarBarraMarcado(visibles);
      };
      append(frag, h('a', {
        class: 'pcan-row' + (marcadas ? ' is-marcando' + (marcadas[c.id] ? ' is-marcada' : '') : ''),
        role: marcadas ? 'checkbox' : 'listitem', 'aria-checked': marcadas ? String(!!marcadas[c.id]) : null, tabindex: marcadas ? '0' : null,
        href: marcadas ? null : '#/cancion/' + c.id, 'data-id': String(c.id),
        onclick: marcadas ? marcar : null, onkeydown: marcadas ? marcar : null
      },
        marcadas ? h('span', { class: 'pcan-num pcan-casilla', 'aria-hidden': 'true' }, marcadas[c.id] ? icono('check') : null)
          : h('span', { class: 'pcan-num' + (c.numero ? '' : ' is-empty'), 'aria-label': c.numero ? sprintf(/* translators: %s: número de himnario */ __('Número %s'), c.numero) : null },
            c.numero ? c.numero : icono('nota')),
        h('span', { class: 'pcan-row-main' },
          h('span', { class: 'pcan-row-title' }, resaltar(c.titulo, state.query)),
          c.autor ? h('span', { class: 'pcan-row-autor', text: c.autor }) : null,
          snippet ? h('span', { class: 'pcan-row-snippet' }, '«', resaltar(snippet, state.query), '»') : null),
        h('span', { class: 'pcan-row-meta' },
          h('span', { class: 'pcan-c-tono' }, c.tonalidad ? pastillaTono(c.tonalidad) : null),
          h('span', { class: 'pcan-c-tempo', title: c.tempo ? sprintf(/* translators: %s: tempo en pulsaciones por minuto */ __('%s pulsaciones por minuto'), c.tempo) : null, text: c.tempo ? '♩ ' + c.tempo : '' }),
          h('span', { class: 'pcan-c-tags' }, c.etiquetas.map(function (e) { return h('span', { class: 'pcan-tag', style: estiloEtiqueta(e), text: e }); }))),
        h('span', { class: 'pcan-c-rec' },
          puntoRecurso(c.partituras, 'partitura', c.partituras ? sprintf(_n('%d partitura', '%d partituras', c.partituras), c.partituras) : __('Sin partitura')),
          puntoRecurso(c.letra ? 1 : 0, 'letra', c.letra ? __('1 letra') : __('Sin letra')),
          puntoRecurso(c.audios, 'audio', c.audios ? sprintf(_n('%d audio', '%d audios', c.audios), c.audios) : __('Sin audio')),
          puntoRecurso(c.editables, 'editable', c.editables ? sprintf(_n('%d partitura editable', '%d partituras editables', c.editables), c.editables) : __('Sin partitura editable')),
          puntoRecurso(c.youtube, 'youtube', c.youtube ? sprintf(_n('%d vídeo', '%d vídeos', c.youtube), c.youtube) : __('Sin vídeo'), c.youtube ? ' is-yt' : '')),
        h('span', { class: 'pcan-c-uso' + (uso ? '' : ' is-nunca') },
          !state.usoCargado ? '' : uso ? [h('strong', { text: sprintf(_n('%d vez', '%d veces', uso.n), uso.n) }), ' · ' + fechaCorta(uso.ultima)] : __('Nunca')),
        h('span', { class: 'pcan-c-fecha', text: fechaCorta(c.creada) })));
    });
    append(ui.lista, frag);
    marcarSeleccion('canciones');
    pintarBarraMarcado(visibles);
  }

  // ---------------------------------------------------------------- detalle: vista dividida, hoja o diálogo

  // panelModo: null | 'split' (a la derecha de la lista) | 'sheet' (pantalla completa en móvil) | 'modal' (diálogo centrado)
  var panelModo = null;
  var panelVista = null;
  var panelSucio = false;
  var ultimoFoco = null;
  var alCerrarPanel = [];
  var scrollLista = 0;

  function desplazador() { return root.classList.contains('is-app') ? root : document.scrollingElement; }

  /**
   * opciones: { vista: 'canciones'|'cultos', id: n, modal: bool, compacta: bool }
   * En pantallas anchas la ficha aparece junto a la lista; en móvil, como una página encima.
   * compacta: en vista dividida contrae la lista (solo el bloque de fecha de cada culto) para dar sitio al editor;
   * cualquier otra apertura, o cerrar el panel, devuelve la lista a su ancho normal.
   */
  function abrirPanel(contenido, etiqueta, opciones) {
    opciones = opciones && typeof opciones === 'object' ? opciones : {};
    if (!panelModo || panelModo === 'split') { ultimoFoco = document.activeElement; }
    limpiarPanel();
    compactarLista(false);

    var pagina = !opciones.modal && opciones.vista === 'canciones';
    var dividida = !pagina && !opciones.modal && opciones.vista && VISTAS_DIVIDIDAS[opciones.vista] && esAncho();
    var enLinea = pagina || dividida;
    var panel = h('div', { class: 'pcan-panel', role: enLinea ? 'region' : 'dialog', 'aria-modal': enLinea ? null : 'true', 'aria-label': etiqueta, tabindex: '-1' }, contenido);
    // Un formulario con cambios sin guardar pide confirmación antes de cerrarse.
    panelSucio = false;
    var marcar = function () { if (panel.querySelector('form')) { panelSucio = true; } };
    panel.addEventListener('input', marcar);
    panel.addEventListener('change', marcar);

    if (pagina) {
      // La canción se abre como página: sustituye a la biblioteca y al cerrarla se vuelve al mismo punto.
      if (panelModo === 'split' && panelVista) { vaciarDetalle(panelVista); }
      if (state.vista !== 'canciones') { mostrarVista('canciones'); scrollLista = 0; }
      else if (panelModo !== 'pagina') { scrollLista = desplazador().scrollTop; }
      ui.detalle.canciones.innerHTML = '';
      append(ui.detalle.canciones, panel);
      ui.vistaCanciones.classList.add('is-pagina');
      desplazador().scrollTop = 0;
      panelModo = 'pagina';
      panelVista = 'canciones';
      ui.panel.hidden = true;
      document.documentElement.classList.remove('pcan-lock');
    } else if (dividida) {
      if (state.vista !== opciones.vista) { mostrarVista(opciones.vista); }
      Object.keys(ui.detalle).forEach(function (v) { if (v !== opciones.vista && panelVista === v) { vaciarDetalle(v); } });
      var host = ui.detalle[opciones.vista];
      host.innerHTML = '';
      append(host, panel);
      host.scrollTop = 0;
      panelModo = 'split';
      panelVista = opciones.vista;
      ui.panel.hidden = true;
      document.documentElement.classList.remove('pcan-lock');
      if (opciones.compacta && opciones.vista === 'cultos') { compactarLista(true); }
    } else {
      if ((panelModo === 'split' || panelModo === 'pagina') && panelVista) { vaciarDetalle(panelVista); }
      ui.panel.className = 'pcan-panel-wrap' + (opciones.modal ? ' is-modal' : '') + (opciones.ancho ? ' is-ancho' : '');
      append(ui.panel, [h('div', { class: 'pcan-backdrop', onclick: function () { volverPanel(); } }), panel]);
      ui.panel.hidden = false;
      document.documentElement.classList.add('pcan-lock');
      panelModo = opciones.modal ? 'modal' : 'sheet';
      panelVista = opciones.vista || null;
    }
    if (opciones.vista && opciones.id !== undefined) {
      state.seleccion[opciones.vista] = +opciones.id || 0;
      marcarSeleccion(opciones.vista);
    }
    panel.focus({ preventScroll: true });
  }

  function compactarLista(si) {
    if (ui.splitCultos) { ui.splitCultos.classList.toggle('is-compacta', !!si); }
  }

  function limpiarPanel() {
    alCerrarPanel.forEach(function (fn) { fn(); });
    alCerrarPanel = [];
    ui.panel.innerHTML = '';
    compactarLista(false);
  }

  function baseVista() {
    return state.vista === 'inicio' ? '' : '#/' + state.vista;
  }

  /** «Volver» y «Cerrar» del panel: si se llegó desde otra pantalla del cancionero se retrocede en el historial,
   *  igual que el botón del navegador; así no se apilan entradas y «atrás» nunca salta fuera del cancionero. */
  function volverPanel() {
    var anterior = hashes[posicion - 1];
    var propio = history.state && history.state.pcan === posicion;
    if (propio && anterior !== undefined && anterior !== location.hash && !/^#\/(nueva|editar\/|subir|ajustes|culto\/(nuevo|editar|duplicar)|culto\/\d+\/tocar)/.test(anterior)) {
      if (panelSucio && !window.confirm(__('¿Cerrar sin guardar los cambios?'))) { return; }
      panelSucio = false;
      history.back();
      return;
    }
    cerrarPanel();
  }

  function cerrarPanel() {
    if (panelSucio && !window.confirm(__('¿Cerrar sin guardar los cambios?'))) { return; }
    var base = baseVista();
    if (location.hash !== base && !(base === '' && location.hash === '#/')) {
      history.pushState('', document.title, location.pathname + location.search + base);
    }
    ocultarPanel();
  }

  function ocultarPanel() {
    panelSucio = false;
    var eraSplit = panelModo === 'split';
    var eraPagina = panelModo === 'pagina';
    limpiarPanel();
    ui.panel.hidden = true;
    document.documentElement.classList.remove('pcan-lock');
    if (eraPagina) {
      vaciarDetalle('canciones');
      var destino = scrollLista;
      requestAnimationFrame(function () { desplazador().scrollTop = destino; });
    }
    else if (eraSplit && panelVista) { vaciarDetalle(panelVista); }
    else if (panelVista) { state.seleccion[panelVista] = 0; marcarSeleccion(panelVista); }
    if (panelModo && ultimoFoco && ultimoFoco.focus && document.contains(ultimoFoco)) { ultimoFoco.focus({ preventScroll: true }); }
    panelModo = null;
    panelVista = null;
  }

  function cabeceraPanel(titulo, extra) {
    return h('div', { class: 'pcan-panel-head' },
      h('button', { type: 'button', class: 'pcan-icon-btn pcan-panel-back', 'aria-label': __('Volver'), onclick: function () { volverPanel(); } }, icono('anterior')),
      h('div', { class: 'pcan-panel-title' }, titulo),
      extra || null,
      h('button', { type: 'button', class: 'pcan-icon-btn pcan-panel-x', 'aria-label': __('Cerrar'), onclick: function () { volverPanel(); } }, icono('cerrar')));
  }

  /** Acciones secundarias de una ficha: botones pequeños con icono y texto, siempre a la vista (nada escondido en un «⋯»). */
  function accionesSecundarias(items) {
    var lista = items.filter(Boolean);
    if (!lista.length) { return null; }
    return h('div', { class: 'pcan-acciones-sec' }, lista.map(function (it) {
      var attrs = { class: 'pcan-btn pcan-btn-sm pcan-btn-sec' + (it.peligro ? ' is-danger' : '') };
      if (it.href) {
        attrs.href = it.href;
        if (it.descargar) { attrs.download = it.descargar; }
        if (it.nueva) { attrs.target = '_blank'; attrs.rel = 'noopener'; }
        return h('a', attrs, icono(it.icono), it.texto);
      }
      attrs.type = 'button';
      attrs.onclick = it.fn;
      return h('button', attrs, icono(it.icono), it.texto);
    }));
  }

  // ---------------------------------------------------------------- vista: ficha de canción

  function verCancion(id) {
    abrirPanel(h('div', { class: 'pcan-panel-loading', text: __('Cargando canción…') }), __('Canción'), { vista: 'canciones', id: id });
    api('canciones/' + id).then(function (c) { pintarFicha(c); })
      .catch(function (e) {
        abrirPanel([cabeceraPanel(h('h2', { text: __('Canción no disponible') })), h('div', { class: 'pcan-panel-body' }, h('p', { text: e.message }))], __('Error'), { vista: 'canciones' });
      });
  }

  function lectorDeCancion(c, partitura) {
    if (!P.Visor || !c.partituras.length) { return; }
    var orden = c.partituras.slice();
    if (partitura) { orden.splice(orden.indexOf(partitura), 1); orden.unshift(partitura); }
    P.Visor.abrirLector({
      titulo: c.titulo,
      canciones: [{ id: c.id, titulo: c.titulo, numero: c.numero, tono: c.tonalidad, tempo: c.tempo, nota: '', letra: c.letra, partituras: orden }]
    });
  }

  function seccion(titulo, icon, contenido, accion) {
    return h('section', { class: 'pcan-det-sec' },
      h('header', { class: 'pcan-det-sec-head' }, h('h3', null, icono(icon), titulo), accion || null),
      contenido);
  }

  function pintarFicha(c) {
    var visor = null;
    var extra = h('div', { class: 'pcan-ficha-extra' });
    var faltan = [
      !c.letra ? { texto: __('Letra'), icono: 'letra' } : null,
      !c.audios.length ? { texto: __('Audio'), icono: 'audio' } : null,
      !c.youtube.length ? { texto: __('Vídeo'), icono: 'youtube' } : null
    ].filter(Boolean);

    var cabecera = h('div', { class: 'pcan-det-hero' },
      h('div', { class: 'pcan-det-kicker' },
        c.numero ? h('span', { class: 'pcan-det-num', text: sprintf(/* translators: %s: número de himnario */ __('Nº %s'), c.numero) }) : null,
        c.etiquetas.map(function (e) {
          return h('button', {
            type: 'button', class: 'pcan-tag is-link', style: estiloEtiqueta(e), title: __('Ver canciones con esta etiqueta'),
            onclick: function () { state.etiqueta = e; state.query = ''; ui.buscador.value = ''; pintarChips(); pintarLista(); cerrarPanel(); mostrarVista('canciones'); }
          }, e);
        })),
      h('h2', { class: 'pcan-det-titulo', text: c.titulo }),
      h('p', { class: 'pcan-det-meta' },
        c.tonalidad ? pastillaTono(c.tonalidad, { class: 'is-lg', title: __('Tonalidad') }) : null,
        c.tempo ? h('span', { class: 'pcan-tempo', title: sprintf(/* translators: %s: tempo en pulsaciones por minuto */ __('%s pulsaciones por minuto'), c.tempo), text: '♩ = ' + c.tempo }) : null,
        c.autor ? h('span', { text: c.autor }) : null,
        c.subidaPor ? h('span', { class: 'pcan-muted', text: sprintf(/* translators: %s: nombre de quien subió la canción */ __('Subida por %s'), c.subidaPor) }) : null));

    var avisoPap = c.enPapelera ? bannerPapelera(c) : null;
    var acciones = c.enPapelera ? h('div', { class: 'pcan-det-actions' },
      c.partituras.length ? h('button', { type: 'button', class: 'pcan-btn pcan-btn-primary pcan-btn-lg', onclick: function () { lectorDeCancion(c); } }, icono('play'), __('Tocar')) : null) : h('div', { class: 'pcan-det-actions' },
      c.partituras.length ? h('button', { type: 'button', class: 'pcan-btn pcan-btn-primary pcan-btn-lg', onclick: function () { lectorDeCancion(c); } }, icono('play'), __('Tocar')) : null,
      h('a', { class: 'pcan-btn', href: '#/editar/' + c.id }, icono('editar'), h('span', { class: 'pcan-btn-label', text: __('Editar') })),
      accionesSecundarias([
        { texto: __('Copiar enlace'), icono: 'enlace', fn: function () { copiar(enlaceCancion(c.id), __('Enlace copiado')); } },
        c.partituras[0] ? { texto: __('Descargar partitura'), icono: 'descargar', href: c.partituras[0].url, descargar: c.partituras[0].archivo || true } : null,
        c.partituras[0] ? { texto: __('Abrir el PDF original'), icono: 'abrir', href: c.partituras[0].url, nueva: true } : null,
        c.letra ? { texto: __('Copiar letra'), icono: 'copiar', fn: function () { copiar(c.letra, __('Letra copiada')); } } : null,
        c.puedeBorrar ? { texto: __('Borrar canción'), icono: 'borrar', peligro: true, fn: function () { borrarCancion(c); } } : null
      ]));

    var principal = h('div', { class: 'pcan-det-main' },
      seccion(__('Partitura'), 'partitura', vistaPartituras(c, function (v) { visor = v; })));

    // En pantallas anchas la partitura ocupa la columna izquierda desde arriba y todo lo demás va a la derecha;
    // en móvil la columna lateral se «disuelve» y se mantiene el orden cabecera, acciones, uso, partitura, resto.
    var lateral = h('div', { class: 'pcan-det-side' },
      avisoPap, cabecera, acciones, extra,
      faltan.length && !c.enPapelera ? h('div', { class: 'pcan-faltan' },
        h('span', { text: __('Completa la ficha:') }),
        faltan.map(function (f) { return h('a', { class: 'pcan-chip is-dashed', href: '#/editar/' + c.id }, icono('mas'), f.texto); })) : null,
      c.audios.length ? seccion(__('Audios'), 'audio', vistaAudios(c)) : null,
      c.editables && c.editables.length ? seccion(__('Partituras editables'), 'editable', vistaEditables(c)) : null,
      c.letra ? seccion(__('Letra'), 'letra', vistaLetra(c),
        h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-ghost', onclick: function () { copiar(c.letra, __('Letra copiada')); } }, icono('copiar'), __('Copiar'))) : null,
      c.youtube.length ? seccion(__('Versiones en YouTube'), 'youtube', vistaYoutube(c)) : null,
      c.notas ? seccion(__('Notas para el equipo'), 'editar', h('div', { class: 'pcan-notas', text: c.notas })) : null);

    abrirPanel([
      cabeceraPanel(h('span', { class: 'pcan-panel-crumb', text: __('Canción') })),
      h('div', { class: 'pcan-panel-body' }, h('div', { class: 'pcan-det-grid' }, principal, lateral))
    ], c.titulo, { vista: 'canciones', id: c.id });

    alCerrarPanel.push(function () { if (visor) { visor.destruir(); visor = null; } });
    ganchos.fichaCancion.forEach(function (fn) { fn(c, extra); });
  }

  function vistaPartituras(c, alVisor) {
    if (!c.partituras.length) { return h('p', { class: 'pcan-muted', text: __('Esta canción no tiene partitura.') }); }
    var zona = h('div', { class: 'pcan-partitura-zona' });
    var selector = h('div', { class: 'pcan-segment' });
    var visorActual = null;

    function ver(i) {
      var p = c.partituras[i];
      Array.prototype.forEach.call(selector.children, function (b, j) { b.classList.toggle('is-active', i === j); });
      if (visorActual) { visorActual.destruir(); visorActual = null; }
      zona.innerHTML = '';
      if (P.Visor) {
        visorActual = P.Visor.visorCompacto(c, p, function () { lectorDeCancion(c, p); });
        alVisor(visorActual);
        append(zona, visorActual.el);
      } else {
        append(zona, p.tipo === 'pdf'
          ? h('iframe', { class: 'pcan-pdf', src: p.url + '#view=FitH', title: sprintf(/* translators: %s: título de la canción */ __('Partitura de %s'), c.titulo), loading: 'lazy' })
          : h('img', { class: 'pcan-img', src: p.url, alt: sprintf(/* translators: %s: título de la canción */ __('Partitura de %s'), c.titulo) }));
      }
    }

    if (c.partituras.length > 1) {
      c.partituras.forEach(function (p, i) {
        append(selector, h('button', { type: 'button', class: 'pcan-seg', onclick: function () { ver(i); } }, p.label || sprintf(/* translators: %d: número de orden de la partitura */ __('Partitura %d'), i + 1)));
      });
    }
    var wrap = h('div', null, c.partituras.length > 1 ? selector : null, zona);
    ver(0);
    return wrap;
  }

  function vistaLetra(c) {
    return h('div', { class: 'pcan-letra', text: c.letra });
  }

  /** Partituras editables: para descargar y abrir con su programa; la partitura que se ve sigue siendo el PDF o la imagen. */
  function vistaEditables(c) {
    return h('div', { class: 'pcan-editables' }, c.editables.map(function (e) {
      return h('a', { class: 'pcan-editable', href: e.url, download: e.archivo || true, title: sprintf(/* translators: %s: nombre del archivo */ __('Descargar %s'), e.archivo) },
        h('span', { class: 'pcan-audio-ico', 'aria-hidden': 'true' }, icono('editable')),
        h('span', { class: 'pcan-audio-text' },
          h('strong', { text: e.descripcion || e.archivo }),
          h('span', { class: 'pcan-audio-desc', text: [programaEditable(e.archivo), e.descripcion ? e.archivo : '', e.tamano ? tamano(e.tamano) : ''].filter(Boolean).join(' · ') })),
        icono('descargar'));
    }));
  }

  function vistaAudios(c) {
    return h('div', { class: 'pcan-audios' }, c.audios.map(function (a) {
      return h('div', { class: 'pcan-audio' },
        h('div', { class: 'pcan-audio-head' },
          h('span', { class: 'pcan-audio-ico', 'aria-hidden': 'true' }, icono('audio')),
          h('div', { class: 'pcan-audio-text' },
            h('strong', { text: a.nombre || a.archivo }),
            a.descripcion ? h('span', { class: 'pcan-audio-desc', text: a.descripcion }) : null),
          a.duracion ? h('span', { class: 'pcan-audio-dur', text: a.duracion }) : null,
          h('a', { class: 'pcan-icon-btn', href: a.url, download: a.archivo || true, 'aria-label': sprintf(/* translators: %s: nombre del audio */ __('Descargar %s'), a.nombre || a.archivo) }, icono('descargar'))),
        h('audio', { controls: true, preload: 'none', src: a.url }));
    }));
  }

  function vistaYoutube(c) {
    return h('div', { class: 'pcan-videos' }, c.youtube.map(function (y) {
      var caja = h('div', { class: 'pcan-video' });
      // Miniatura con botón: el reproductor solo se carga al pulsar.
      var lanzar = h('button', {
        type: 'button', class: 'pcan-video-thumb', 'aria-label': sprintf(/* translators: %s: descripción del vídeo */ __('Reproducir %s'), y.label || __('vídeo')),
        onclick: function () {
          lanzar.replaceWith(h('iframe', {
            src: 'https://www.youtube-nocookie.com/embed/' + y.videoId + '?autoplay=1&rel=0',
            title: y.label || c.titulo, allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true
          }));
        }
      }, h('img', { src: 'https://i.ytimg.com/vi/' + y.videoId + '/mqdefault.jpg', alt: '', loading: 'lazy' }), h('span', { class: 'pcan-play' }, icono('play')));
      append(caja, [y.videoId ? lanzar : null,
        h('div', { class: 'pcan-video-cap' },
          h('span', { text: y.label || __('Versión de referencia') }),
          h('a', { href: y.url, target: '_blank', rel: 'noopener', text: 'YouTube' }))]);
      return caja;
    }));
  }

  function borrarCancion(c) {
    if (!window.confirm(sprintf(/* translators: %s: título de la canción */ __('¿Borrar «%s»? Se mueve a la papelera del cancionero y un administrador podrá recuperarla.'), c.titulo))) { return; }
    api('canciones/' + c.id, { method: 'DELETE' }).then(function () {
      aviso(__('Canción borrada'));
      cerrarPanel();
      cargar().then(function () { pintarChips(); pintarLista(); });
    }).catch(function (e) { aviso(e.message, 'error'); });
  }

  // ---------------------------------------------------------------- vista: formulario de canción

  function abrirFormulario(id) {
    if (!id) { pintarFormulario(null); return; }
    abrirPanel(h('div', { class: 'pcan-panel-loading', text: __('Cargando canción…') }), __('Editar canción'), { vista: 'canciones', id: id });
    api('canciones/' + id).then(pintarFormulario).catch(function (e) { aviso(e.message, 'error'); cerrarPanel(); });
  }

  function campo(label, input, ayuda, requerido) {
    return h('label', { class: 'pcan-field' },
      h('span', { class: 'pcan-label' }, label, requerido ? h('abbr', { title: __('obligatorio'), text: ' *' }) : null),
      input,
      ayuda ? h('span', { class: 'pcan-help', text: ayuda }) : null);
  }

  /** Zona de «elegir o arrastrar archivos». */
  function zonaArchivos(accept, texto, ayuda, alElegir) {
    var input = h('input', { type: 'file', class: 'pcan-file-hidden', multiple: true, accept: accept });
    var zona = h('label', { class: 'pcan-drop' }, input, icono('subir'),
      h('span', null, conNodo(/* translators: %s: acción en negrita («Elegir partituras», «Elegir audios»…) */ __('%s o arrastrar aquí'), h('strong', { text: texto }))),
      h('span', { class: 'pcan-help', text: ayuda }));
    input.addEventListener('change', function () { alElegir(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove('is-over'); }); });
    zona.addEventListener('drop', function (e) { alElegir(e.dataTransfer.files); });
    return zona;
  }

  function pintarFormulario(c) {
    var editando = !!c;
    c = c || { titulo: '', numero: '', autor: '', tonalidad: '', tempo: '', etiquetas: [], letra: '', notas: '', partituras: [], audios: [], editables: [], youtube: [] };

    var existentes = c.partituras.map(function (p) { return { id: p.id, label: p.label, archivo: p.archivo, url: p.url }; });
    var nuevas = [];
    var audiosExistentes = c.audios.map(function (a) { return { id: a.id, nombre: a.nombre, descripcion: a.descripcion, archivo: a.archivo, url: a.url }; });
    var audiosNuevos = [];
    var editablesExistentes = (c.editables || []).map(function (e) { return { id: e.id, descripcion: e.descripcion, archivo: e.archivo, url: e.url }; });
    var editablesNuevos = [];
    var etiquetas = c.etiquetas.slice();
    var videos = c.youtube.map(function (y) { return { url: y.url, label: y.label }; });

    var fTitulo = h('input', { type: 'text', class: 'pcan-input', value: c.titulo, required: true, maxlength: '200' });
    var duplicados = h('div', { class: 'pcan-dupes', hidden: true });
    fTitulo.addEventListener('input', function () {
      var q = norm(fTitulo.value);
      duplicados.innerHTML = '';
      if (q.length < 4) { duplicados.hidden = true; return; }
      var parecidas = state.indice.filter(function (it) { return it.c.id !== c.id && (it.titulo.indexOf(q) !== -1 || q.indexOf(it.titulo) !== -1); }).slice(0, 3);
      duplicados.hidden = !parecidas.length;
      if (parecidas.length) {
        append(duplicados, [__('¿Ya existe?') + ' ', parecidas.map(function (it, i) {
          return [i ? ', ' : '', h('a', { href: '#/cancion/' + it.c.id, text: it.c.titulo })];
        })]);
      }
    });

    var fNumero = h('input', { type: 'text', class: 'pcan-input', value: c.numero, inputmode: 'numeric', maxlength: '20' });
    var fTempo = h('input', { type: 'number', class: 'pcan-input', value: c.tempo || '', min: '20', max: '400', step: '1', inputmode: 'numeric', placeholder: __('p. ej. 72') });
    var fAutor = h('input', { type: 'text', class: 'pcan-input', value: c.autor, maxlength: '200' });
    var listaTonos = h('datalist', { id: 'pcan-tonos' }, TONALIDADES.map(function (t) { return h('option', { value: tonoVer(t) }); }));
    var fTono = h('input', { type: 'text', class: 'pcan-input', value: tonoVer(c.tonalidad), list: 'pcan-tonos', maxlength: '20' });
    var fLetra = h('textarea', { class: 'pcan-input pcan-textarea', rows: '10' });
    fLetra.value = c.letra;
    var fNotas = h('textarea', { class: 'pcan-input pcan-textarea', rows: '3' });
    fNotas.value = c.notas || '';

    // Etiquetas tipo «chip».
    var tagBox = h('div', { class: 'pcan-taginput' });
    var listaEtiquetas = h('datalist', { id: 'pcan-etiquetas' }, etiquetasTodas().map(function (e) { return h('option', { value: e.nombre }); }));
    var tagInput = h('input', { type: 'text', class: 'pcan-taginput-field', list: 'pcan-etiquetas', placeholder: __('Navidad, Santa Cena, alabanza…'), 'aria-label': __('Añadir etiqueta') });
    function addTag(v) {
      v = String(v || '').replace(/,/g, ' ').trim();
      if (v && etiquetas.map(norm).indexOf(norm(v)) === -1) { etiquetas.push(v); }
      tagInput.value = '';
      pintarTags();
    }
    function pintarTags() {
      tagBox.innerHTML = '';
      etiquetas.forEach(function (e, i) {
        append(tagBox, h('span', { class: 'pcan-tag', style: estiloEtiqueta(e) }, e,
          h('button', { type: 'button', class: 'pcan-tag-x', 'aria-label': sprintf(/* translators: %s: nombre de la etiqueta */ __('Quitar %s'), e), onclick: function () { etiquetas.splice(i, 1); pintarTags(); } }, '×')));
      });
      append(tagBox, tagInput);
    }
    tagInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput.value); }
      else if (e.key === 'Backspace' && !tagInput.value && etiquetas.length) { etiquetas.pop(); pintarTags(); }
    });
    tagInput.addEventListener('change', function () { if (tagInput.value) { addTag(tagInput.value); } });
    tagInput.addEventListener('blur', function () { if (tagInput.value) { addTag(tagInput.value); } });
    pintarTags();

    function archivoValido(f, extensiones, mensajeNoEs, max) {
      if (!extensiones.test(f.name)) { aviso(sprintf(mensajeNoEs, f.name), 'error'); return false; }
      if (max && f.size > max) { aviso(sprintf(/* translators: 1: nombre del archivo, 2: tamaño del archivo, 3: tamaño máximo permitido */ __('«%1$s» pesa %2$s; el máximo es %3$s'), f.name, tamano(f.size), tamano(max)), 'error'); return false; }
      return true;
    }

    function campoTexto(item, clave, placeholder, etiqueta) {
      return h('input', {
        type: 'text', class: 'pcan-input pcan-input-sm', value: item[clave], placeholder: placeholder, 'aria-label': etiqueta,
        oninput: function (e) { item[clave] = e.target.value; }
      });
    }

    function filaArchivo(icon, nombre, extra, campos, quitar) {
      return h('div', { class: 'pcan-file' },
        icono(icon),
        h('div', { class: 'pcan-file-main' }, h('span', { class: 'pcan-file-name' }, nombre, extra), campos),
        h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': sprintf(/* translators: %s: nombre del archivo */ __('Quitar %s'), nombre), onclick: quitar }, icono('cerrar')));
    }

    // Partituras.
    var listaPartituras = h('div', { class: 'pcan-files' });
    var zonaPartituras = zonaArchivos('.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png', __('Elegir partituras'),
      sprintf(/* translators: %s: tamaño máximo por archivo */ __('PDF, JPG o PNG · máx. %s por archivo'), tamano(CFG.maxPartitura)), function (files) {
        Array.prototype.forEach.call(files, function (f) {
          if (archivoValido(f, /\.(pdf|jpe?g|png)$/i, /* translators: %s: nombre del archivo */ __('«%s» no es PDF, JPG ni PNG'), CFG.maxPartitura)) { nuevas.push({ file: f, label: '' }); }
        });
        pintarPartituras();
      });

    function pintarPartituras() {
      listaPartituras.innerHTML = '';
      // La principal es la primera de la lista: es la que se usa por defecto (miniatura, setlists, modo culto, PDF).
      var total = existentes.length + nuevas.length;
      function marca(esPrincipal, puedeSerlo, hacer) {
        if (total < 2) { return null; }
        if (esPrincipal) { return h('span', { class: 'pcan-file-principal', text: __('Principal') }); }
        return puedeSerlo ? h('button', { type: 'button', class: 'pcan-btn pcan-btn-sec pcan-btn-sm', onclick: hacer }, __('Hacer principal')) : null;
      }
      existentes.forEach(function (p, i) {
        var extra = h('span', { class: 'pcan-file-extra' },
          h('a', { href: p.url, target: '_blank', rel: 'noopener', class: 'pcan-file-ver', text: __('ver') }),
          marca(i === 0, true, function () { existentes.unshift(existentes.splice(i, 1)[0]); pintarPartituras(); }));
        append(listaPartituras, filaArchivo('partitura', p.archivo || __('Partitura'), extra,
          campoTexto(p, 'label', __('Descripción (p. ej. «Original», «En Sol», «Acordes»)'), sprintf(/* translators: %s: nombre del archivo */ __('Descripción de %s'), p.archivo)),
          function () { existentes.splice(i, 1); pintarPartituras(); }));
      });
      nuevas.forEach(function (n, i) {
        // Una partitura nueva solo puede ser la principal si no hay otras ya guardadas.
        var extra = h('span', { class: 'pcan-file-extra' },
          h('span', { class: 'pcan-file-new', text: sprintf(/* translators: %s: tamaño del archivo */ __('nueva · %s'), tamano(n.file.size)) }),
          marca(!existentes.length && i === 0, !existentes.length, function () { nuevas.unshift(nuevas.splice(i, 1)[0]); pintarPartituras(); }));
        append(listaPartituras, filaArchivo('partitura', n.file.name, extra,
          campoTexto(n, 'label', __('Descripción (p. ej. «Original», «En Sol», «Acordes»)'), sprintf(/* translators: %s: nombre del archivo */ __('Descripción de %s'), n.file.name)),
          function () { nuevas.splice(i, 1); pintarPartituras(); }));
      });
    }
    pintarPartituras();

    // Audios: nombre y descripción personalizables.
    var listaAudios = h('div', { class: 'pcan-files' });
    var zonaAudios = zonaArchivos('.mp3,.m4a,.ogg,.oga,.wav,.aac,audio/*', __('Elegir audios'),
      sprintf(/* translators: %s: tamaño máximo por archivo */ __('MP3, M4A, OGG, WAV o AAC · máx. %s por archivo'), tamano(CFG.maxAudio)), function (files) {
        Array.prototype.forEach.call(files, function (f) {
          if (archivoValido(f, /\.(mp3|m4a|m4b|ogg|oga|wav|aac)$/i, /* translators: %s: nombre del archivo */ __('«%s» no es un audio MP3, M4A, OGG, WAV o AAC'), CFG.maxAudio)) {
            audiosNuevos.push({ file: f, nombre: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), descripcion: '' });
          }
        });
        pintarAudios();
      });

    function camposAudio(a) {
      return h('div', { class: 'pcan-audio-campos' },
        campoTexto(a, 'nombre', __('Nombre (p. ej. «Ensayo voces»)'), __('Nombre del audio')),
        campoTexto(a, 'descripcion', __('Descripción (opcional)'), __('Descripción del audio')));
    }

    function pintarAudios() {
      listaAudios.innerHTML = '';
      audiosExistentes.forEach(function (a, i) {
        append(listaAudios, filaArchivo('audio', a.archivo || __('Audio'), h('a', { href: a.url, target: '_blank', rel: 'noopener', class: 'pcan-file-ver', text: __('escuchar') }),
          camposAudio(a), function () { audiosExistentes.splice(i, 1); pintarAudios(); }));
      });
      audiosNuevos.forEach(function (a, i) {
        append(listaAudios, filaArchivo('audio', a.file.name, h('span', { class: 'pcan-file-new', text: sprintf(/* translators: %s: tamaño del archivo */ __('nuevo · %s'), tamano(a.file.size)) }),
          camposAudio(a), function () { audiosNuevos.splice(i, 1); pintarAudios(); }));
      });
    }
    pintarAudios();

    // Partituras editables (MuseScore, MusicXML…): adjuntos para descargar, con una descripción opcional.
    var listaEditables = h('div', { class: 'pcan-files' });
    var extensionesEditables = Object.keys(PROGRAMAS_EDITABLES);
    var zonaEditables = zonaArchivos(extensionesEditables.map(function (e) { return '.' + e; }).join(','), __('Elegir archivos editables'),
      sprintf(/* translators: %s: tamaño máximo por archivo */ __('MuseScore, MusicXML, Sibelius, Finale, Dorico, Guitar Pro, MIDI… · máx. %s por archivo'), tamano(CFG.maxEditable)), function (files) {
        Array.prototype.forEach.call(files, function (f) {
          if (archivoValido(f, new RegExp('\\.(' + extensionesEditables.join('|') + ')$', 'i'), /* translators: %s: nombre del archivo */ __('«%s» no es una partitura editable (MuseScore, MusicXML, Sibelius, Finale…)'), CFG.maxEditable)) {
            editablesNuevos.push({ file: f, descripcion: '' });
          }
        });
        pintarEditables();
      });

    function pintarEditables() {
      listaEditables.innerHTML = '';
      editablesExistentes.forEach(function (e, i) {
        append(listaEditables, filaArchivo('editable', e.archivo || __('Archivo'), h('a', { href: e.url, download: e.archivo || true, class: 'pcan-file-ver', text: __('descargar') }),
          campoTexto(e, 'descripcion', __('Descripción (p. ej. «Arreglo coro», «En Sol»)'), sprintf(/* translators: %s: nombre del archivo */ __('Descripción de %s'), e.archivo)),
          function () { editablesExistentes.splice(i, 1); pintarEditables(); }));
      });
      editablesNuevos.forEach(function (e, i) {
        append(listaEditables, filaArchivo('editable', e.file.name, h('span', { class: 'pcan-file-new', text: sprintf(/* translators: %s: tamaño del archivo */ __('nuevo · %s'), tamano(e.file.size)) }),
          campoTexto(e, 'descripcion', __('Descripción (p. ej. «Arreglo coro», «En Sol»)'), sprintf(/* translators: %s: nombre del archivo */ __('Descripción de %s'), e.file.name)),
          function () { editablesNuevos.splice(i, 1); pintarEditables(); }));
      });
    }
    pintarEditables();

    // Enlaces de YouTube.
    var listaVideos = h('div', { class: 'pcan-yt-list' });
    function pintarVideos() {
      listaVideos.innerHTML = '';
      videos.forEach(function (v, i) {
        var url = h('input', {
          type: 'url', class: 'pcan-input', value: v.url, placeholder: 'https://www.youtube.com/watch?v=…', 'aria-label': __('Enlace de YouTube'),
          oninput: function (e) { v.url = e.target.value; url.classList.toggle('is-invalid', !!v.url && !youtubeId(v.url)); }
        });
        append(listaVideos, h('div', { class: 'pcan-yt-row' },
          url,
          h('input', { type: 'text', class: 'pcan-input', value: v.label, placeholder: __('Descripción (coro, piano…)'), 'aria-label': __('Descripción del vídeo'), oninput: function (e) { v.label = e.target.value; } }),
          h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': __('Quitar enlace'), onclick: function () { videos.splice(i, 1); pintarVideos(); } }, icono('cerrar'))));
      });
      append(listaVideos, h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () { videos.push({ url: '', label: '' }); pintarVideos(); listaVideos.querySelector('.pcan-yt-row:last-of-type input').focus(); } }, icono('mas'), __('Añadir enlace')));
    }
    pintarVideos();

    var errorBox = h('div', { class: 'pcan-form-error', role: 'alert', hidden: true });
    var progreso = h('div', { class: 'pcan-progress', hidden: true }, h('span'));
    var guardar = h('button', { type: 'submit', class: 'pcan-btn pcan-btn-primary' }, editando ? __('Guardar cambios') : __('Guardar canción'));

    // Dos columnas en pantallas anchas (datos y letra | archivos y enlaces); en móvil, una sola en el orden de siempre.
    var form = h('form', { class: 'pcan-form pcan-form-cancion', novalidate: true },
      h('div', { class: 'pcan-form-col pcan-form-col-main' },
        h('div', { class: 'pcan-grid-2 pcan-form-datos' },
          h('div', { class: 'pcan-span-2' }, campo(__('Título'), fTitulo, null, true), duplicados),
          campo(__('Número de himnario'), fNumero),
          campo(__('Tonalidad'), h('span', null, fTono, listaTonos)),
          campo(__('Tempo (BPM)'), fTempo),
          campo(__('Autor / compositor'), fAutor)),
        h('fieldset', { class: 'pcan-fieldset pcan-form-letra' },
          h('legend', { text: __('Letra') }),
          fLetra,
          h('p', { class: 'pcan-help', text: __('Opcional. Separa las estrofas con una línea en blanco. La letra también se usa en la búsqueda.') })),
        h('fieldset', { class: 'pcan-fieldset pcan-form-notas' },
          h('legend', { text: __('Notas para el equipo') }),
          fNotas)),
      h('div', { class: 'pcan-form-col pcan-form-col-side' },
        h('fieldset', { class: 'pcan-fieldset pcan-form-partituras' },
          h('legend', null, __('Partitura'), h('abbr', { title: __('obligatorio'), text: ' *' })),
          h('p', { class: 'pcan-help', text: __('Puedes subir varias: la original, en otra tonalidad, con acordes…') }),
          listaPartituras, zonaPartituras,
          !editando ? h('p', { class: 'pcan-help' }, conNodo(/* translators: %s: enlace «Súbelas de golpe» */ __('¿Son varias canciones distintas? %s.'), h('a', { href: '#/subir', text: __('Súbelas de golpe') }))) : null),
        h('fieldset', { class: 'pcan-fieldset pcan-form-audios' },
          h('legend', { text: __('Audios') }),
          h('p', { class: 'pcan-help', text: __('Ensayos, voces por separado, pistas… Ponle a cada uno un nombre y, si quieres, una descripción.') }),
          listaAudios, zonaAudios),
        h('fieldset', { class: 'pcan-fieldset pcan-form-editables' },
          h('legend', { text: __('Partituras editables') }),
          h('p', { class: 'pcan-help', text: __('Opcional: el archivo original para quien quiera modificar o transportar la partitura (MuseScore, Sibelius, Finale…). Se descargan; la partitura que se ve sigue siendo el PDF o la imagen.') }),
          listaEditables, zonaEditables),
        h('fieldset', { class: 'pcan-fieldset pcan-form-etiquetas' },
          h('legend', { text: __('Etiquetas') }),
          tagBox, listaEtiquetas,
          h('p', { class: 'pcan-help', text: __('Pulsa Intro o coma para añadir cada etiqueta.') })),
        h('fieldset', { class: 'pcan-fieldset pcan-form-videos' },
          h('legend', { text: __('Vídeos de YouTube') }),
          listaVideos)),
      errorBox,
      progreso,
      h('div', { class: 'pcan-form-actions' },
        guardar,
        h('button', { type: 'button', class: 'pcan-btn', onclick: function () { if (editando) { location.hash = '#/cancion/' + c.id; } else { cerrarPanel(); } } }, __('Cancelar'))));

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (tagInput.value) { addTag(tagInput.value); }
      var errores = [];
      if (!fTitulo.value.trim()) { errores.push(__('Escribe el título.')); }
      if (!existentes.length && !nuevas.length) { errores.push(__('Añade al menos una partitura.')); }
      if (videos.some(function (v) { return v.url && !youtubeId(v.url); })) { errores.push(__('Hay enlaces que no son de YouTube.')); }
      if (errores.length) {
        errorBox.textContent = errores.join(' ');
        errorBox.hidden = false;
        return;
      }
      errorBox.hidden = true;

      // Primero se suben los archivos nuevos, uno a uno y por trozos; después se guarda la canción.
      var pendientes = nuevas.map(function (n) { return { item: n, tipo: 'partitura' }; })
        .concat(audiosNuevos.map(function (a) { return { item: a, tipo: 'audio' }; }))
        .concat(editablesNuevos.map(function (e) { return { item: e, tipo: 'editable' }; }));
      var bytes = pendientes.reduce(function (s, p) { return s + p.item.file.size; }, 0) || 1;
      var hechos = 0;
      guardar.disabled = true;
      progreso.hidden = !pendientes.length;
      progreso.firstChild.style.width = '0%';
      pendientes.reduce(function (cadena, p) {
        return cadena.then(function () {
          guardar.textContent = sprintf(/* translators: %s: nombre del archivo que se sube */ __('Subiendo %s…'), p.item.file.name);
          return subirPorTrozos(p.item.file, p.tipo, function (f) {
            progreso.firstChild.style.width = Math.round((hechos + f * p.item.file.size) / bytes * 100) + '%';
          }).then(function (id) { p.item.subida = id; hechos += p.item.file.size; });
        });
      }, Promise.resolve()).then(function () {
        guardar.textContent = __('Guardando…');
        return apiSubir(editando ? 'canciones/' + c.id : 'canciones', datosCancion());
      }).then(function (guardada) {
        panelSucio = false;
        aviso(editando ? __('Cambios guardados') : __('Canción añadida'));
        return cargar().then(function () {
          pintarChips(); pintarLista();
          location.hash = '#/cancion/' + guardada.id;
        });
      }).catch(function (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
        guardar.disabled = false;
        guardar.textContent = editando ? __('Guardar cambios') : __('Guardar canción');
        progreso.hidden = true;
      });
    });

    function datosCancion() {
      var fd = new FormData();
      fd.append('titulo', fTitulo.value.trim());
      fd.append('numero', fNumero.value.trim());
      fd.append('autor', fAutor.value.trim());
      fd.append('tonalidad', tonoGuardar(fTono.value));
      fd.append('tempo', fTempo.value.trim());
      fd.append('etiquetas', etiquetas.join(','));
      fd.append('letra', fLetra.value);
      fd.append('notas', fNotas.value);
      fd.append('youtube', JSON.stringify(videos.filter(function (v) { return v.url; })));
      fd.append('partituras', JSON.stringify(existentes.map(function (p) { return { id: p.id, label: p.label }; })));
      fd.append('nuevasSubidas', JSON.stringify(nuevas.map(function (n) { return { id: n.subida, nombre: n.file.name, label: n.label }; })));
      fd.append('audios', JSON.stringify(audiosExistentes.map(function (a) { return { id: a.id, nombre: a.nombre, descripcion: a.descripcion }; })));
      fd.append('audiosSubidos', JSON.stringify(audiosNuevos.map(function (a) { return { id: a.subida, archivo: a.file.name, nombre: a.nombre, descripcion: a.descripcion }; })));
      fd.append('editables', JSON.stringify(editablesExistentes.map(function (e) { return { id: e.id, descripcion: e.descripcion }; })));
      fd.append('editablesSubidos', JSON.stringify(editablesNuevos.map(function (e) { return { id: e.subida, archivo: e.file.name, descripcion: e.descripcion }; })));
      return fd;
    }

    abrirPanel([
      cabeceraPanel(h('h2', { text: editando ? __('Editar canción') : __('Nueva canción') })),
      h('div', { class: 'pcan-panel-body' }, form)
    ], editando ? __('Editar canción') : __('Nueva canción'), { vista: 'canciones', id: editando ? c.id : 0 });
    if (!editando) { fTitulo.focus(); }
  }

  function youtubeId(url) {
    var m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  // ---------------------------------------------------------------- subir varias canciones de golpe

  // Tonalidades: se aceptan en notación americana (C, F#m, Bb) y española (Do, Fa#m, Sib); se guardan en española.
  var NOTAS_ES = { c: 'Do', d: 'Re', e: 'Mi', f: 'Fa', g: 'Sol', a: 'La', b: 'Si' };
  var TONO_AMERICANO = /^([A-G])([#♯b♭]?)(m|min)?$/;
  var TONO_ESPANOL = /^(do|re|mi|fa|sol|la|si)([#♯b♭]?)(m)?$/i;

  /**
   * Tonalidad en notación española, o '' si el texto no lo es.
   * «estricto»: una palabra española sin alteración («mi», «sol», «la») no cuenta, porque puede ser parte del título.
   */
  function tonoEspanol(texto, estricto) {
    var t = String(texto || '').trim(), m;
    var alteracion = function (a) { return a === '♯' ? '#' : a === '♭' ? 'b' : a; };
    if ((m = t.match(TONO_AMERICANO))) { return NOTAS_ES[m[1].toLowerCase()] + alteracion(m[2]) + (m[3] ? 'm' : ''); }
    if ((m = t.match(TONO_ESPANOL)) && (!estricto || m[2] || m[3])) {
      return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + alteracion(m[2]) + (m[3] ? 'm' : '');
    }
    return '';
  }

  function limpiarTitulo(t) {
    return String(t || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Título, número de himnario y tonalidad a partir del nombre del archivo:
   * «051 - Cristo coronad.pdf» → 51 · Cristo coronad
   * «adoracion_culto_A-Cristo-coronad-51.pdf» → 51 · A Cristo coronad
   * «Todas las promesas 13 A.pdf» → 13 · Todas las promesas · La
   * «Cuán grande es Él - Sib.pdf» → Cuán grande es Él · Sib
   * Un número suelto cuenta como número de himnario si es menor de 300. La tonalidad se busca justo después
   * de ese número o, si no lo hay, en la última palabra del nombre.
   */
  function datosDesdeArchivo(nombre) {
    var base = limpiarTitulo(String(nombre).replace(/\.[^.]+$/, '').replace(/^adoracion[_-]culto[_-]/i, '').replace(/_/g, ' '));
    var numero = '', tonalidad = '', corte = -1, m;
    if ((m = base.match(/^(\d{1,3})\s*[-.)]+\s*(.+)$/))) {
      numero = m[1];
      base = m[2];
    } else {
      var reNumero = /(^|[\s\-–(\[])(\d{1,3})(?=$|[\s\-–)\],])/g;
      while ((m = reNumero.exec(base))) {
        if (+m[2] > 0 && +m[2] < 300) {
          numero = m[2];
          corte = m.index + m[1].length;
          base = base.slice(0, corte) + base.slice(corte + m[2].length);
          break;
        }
      }
    }

    var palabras = [], rePalabra = /[^\s\-–()\[\],]+/g;
    while ((m = rePalabra.exec(base))) { palabras.push({ t: m[0], i: m.index }); }
    var candidatas = corte >= 0 ? palabras.filter(function (p) { return p.i >= corte; }) : palabras.slice(-1);
    for (var k = 0; k < candidatas.length; k++) {
      var p = candidatas[k];
      if (p === palabras[0]) { continue; }
      var antes = base.slice(0, p.i).replace(/\s+$/, '').slice(-1);
      var clara = corte >= 0 || /[-–(\[]/.test(antes);
      var tono = tonoEspanol(p.t, !clara);
      if (tono) {
        tonalidad = tono;
        base = base.slice(0, p.i) + base.slice(p.i + p.t.length);
        break;
      }
    }

    var titulo = limpiarTitulo(base.replace(/\(\s*\)|\[\s*\]/g, ' ').replace(/[-–]+/g, ' ').replace(/\s+([,.;:])/g, '$1'))
      .replace(/^[\s,.;:]+|[\s,.;:]+$/g, '');
    titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
    return { titulo: titulo, numero: numero.replace(/^0+(?=\d)/, ''), tonalidad: tonalidad };
  }

  function abrirSubidaMultiple() {
    var items = [];
    var enCurso = false;
    var lista = h('div', { class: 'pcan-lote' });
    var resumen = h('p', { class: 'pcan-help' });
    var progreso = h('div', { class: 'pcan-progress', hidden: true }, h('span'));
    var subir = h('button', { type: 'button', class: 'pcan-btn pcan-btn-primary', onclick: function () { empezar(); } }, icono('subir'), h('span', { text: __('Subir') }));
    // Botón flotante: quita de la lista de una vez las que ya están en el cancionero (o ya se subieron).
    var quitarYa = h('button', { type: 'button', class: 'pcan-btn pcan-lote-flotante', hidden: true, onclick: function () {
      var antes = items.length;
      items = items.filter(function (it) { return !yaEsta(it); });
      var quitadas = antes - items.length;
      aviso(sprintf(_n('%d canción quitada de la lista', '%d canciones quitadas de la lista', quitadas), quitadas));
      pintar();
    } });

    var zona = zonaArchivos('.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png', __('Elegir partituras'),
      sprintf(/* translators: %s: tamaño máximo por archivo */ __('PDF, JPG o PNG · una canción por archivo · máx. %s cada uno'), tamano(CFG.maxPartitura)), function (files) {
        Array.prototype.forEach.call(files, function (f) {
          if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) { aviso(sprintf(/* translators: %s: nombre del archivo */ __('«%s» no es PDF, JPG ni PNG'), f.name), 'error'); return; }
          if (items.some(function (it) { return it.file.name === f.name && it.file.size === f.size; })) { return; }
          var d = datosDesdeArchivo(f.name);
          items.push({ file: f, titulo: d.titulo, numero: d.numero, tonalidad: d.tonalidad, estado: CFG.maxPartitura && f.size > CFG.maxPartitura ? 'grande' : 'pendiente' });
        });
        pintar();
      });

    function existe(titulo) {
      var n = norm(titulo);
      return !!n && state.indice.some(function (it) { return it.titulo === n; });
    }

    function yaEsta(it) {
      return it.estado === 'ok' || (it.estado !== 'subiendo' && existe(it.titulo));
    }

    function pintar() {
      lista.innerHTML = '';
      items.forEach(function (it, i) {
        var bloqueado = enCurso || it.estado === 'ok' || it.estado === 'subiendo';
        var dup = h('span', { class: 'pcan-picker-warn' });
        var marcarDup = function () {
          dup.textContent = it.estado !== 'ok' && existe(it.titulo) ? __('Ya hay una canción con este título') : '';
          dup.hidden = !dup.textContent;
        };
        var estado = it.estado === 'subiendo' ? h('span', { class: 'pcan-lote-estado', text: __('Subiendo…') })
          : it.estado === 'ok' ? h('a', { class: 'pcan-lote-estado is-ok', href: '#/cancion/' + it.id }, icono('check'), __('Subida · ver'))
          : it.estado === 'error' ? h('span', { class: 'pcan-lote-estado is-error', text: it.error })
          : it.estado === 'grande' ? h('span', { class: 'pcan-lote-estado is-error', text: sprintf(/* translators: 1: tamaño del archivo, 2: tamaño máximo permitido */ __('Pesa %1$s; el máximo es %2$s'), tamano(it.file.size), tamano(CFG.maxPartitura)) })
          : null;
        append(lista, h('div', { class: 'pcan-lote-item is-' + it.estado },
          icono('partitura'),
          h('div', { class: 'pcan-lote-main' },
            h('div', { class: 'pcan-lote-campos' },
              h('input', {
                type: 'text', class: 'pcan-input pcan-input-sm', value: it.numero, placeholder: __('Nº'), inputmode: 'numeric', maxlength: '20',
                'aria-label': sprintf(/* translators: %s: nombre del archivo */ __('Número de himnario de %s'), it.file.name), disabled: bloqueado, oninput: function (e) { it.numero = e.target.value; }
              }),
              h('input', {
                type: 'text', class: 'pcan-input pcan-input-sm', value: it.titulo, maxlength: '200',
                'aria-label': sprintf(/* translators: %s: nombre del archivo */ __('Título de %s'), it.file.name), disabled: bloqueado,
                oninput: function (e) { it.titulo = e.target.value; marcarDup(); pintarResumen(); },
                onchange: function (e) { it.titulo = limpiarTitulo(e.target.value); e.target.value = it.titulo; marcarDup(); pintarResumen(); }
              }),
              h('input', {
                type: 'text', class: 'pcan-input pcan-input-sm', value: tonoVer(it.tonalidad), placeholder: _x('Tono', 'tonalidad de la canción'), maxlength: '12',
                'aria-label': sprintf(/* translators: %s: nombre del archivo */ __('Tonalidad de %s'), it.file.name), disabled: bloqueado,
                oninput: function (e) { it.tonalidad = e.target.value; },
                // «C» y «Do» son lo mismo: se guarda en notación española.
                onchange: function (e) { var t = tonoEspanol(e.target.value); it.tonalidad = t || limpiarTitulo(e.target.value); e.target.value = tonoVer(it.tonalidad); }
              })),
            h('span', { class: 'pcan-lote-archivo', text: it.file.name + ' · ' + tamano(it.file.size) }),
            dup, estado),
          !bloqueado ? h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': sprintf(/* translators: %s: nombre del archivo */ __('Quitar %s'), it.file.name), onclick: function () { items.splice(i, 1); pintar(); } }, icono('cerrar')) : null));
        marcarDup();
      });
      pintarResumen();
    }

    function porSubir() {
      return items.filter(function (it) { return (it.estado === 'pendiente' || it.estado === 'error') && limpiarTitulo(it.titulo); });
    }

    function pintarResumen() {
      var pendientes = porSubir().length;
      var hechas = items.filter(function (it) { return it.estado === 'ok'; }).length;
      resumen.textContent = items.length
        ? [hechas ? sprintf(_n('%d subida', '%d subidas', hechas), hechas) : '', pendientes ? sprintf(__('%d por subir'), pendientes) : ''].filter(Boolean).join(' · ') || __('Nada que subir')
        : __('Elige o arrastra varias partituras: se creará una canción por archivo, con el nombre del archivo como título. Si el nombre lleva el número de himnario (menor de 300) o la tonalidad (C o Do, Bb o Sib…), se separan solos. Antes de subirlas puedes corregirlos.');
      var ya = items.filter(yaEsta).length;
      quitarYa.hidden = enCurso || !ya;
      quitarYa.innerHTML = '';
      append(quitarYa, [icono('borrar'), sprintf(_n('Quitar la que ya está en el cancionero', 'Quitar las %d que ya están en el cancionero', ya), ya)]);
      subir.disabled = enCurso || !pendientes;
      subir.lastChild.textContent = enCurso ? __('Subiendo…') : pendientes ? sprintf(_n('Subir %d canción', 'Subir %d canciones', pendientes), pendientes) : __('Subir');
    }

    function empezar() {
      var cola = porSubir();
      if (!cola.length) { return; }
      enCurso = true;
      panelSucio = true;
      progreso.hidden = false;
      progreso.firstChild.style.width = '0%';
      var total = cola.length, hechas = 0;
      pintar();

      (function siguiente() {
        var it = cola.shift();
        if (!it) {
          enCurso = false;
          panelSucio = false;
          var fallos = items.filter(function (x) { return x.estado === 'error'; }).length;
          aviso(fallos ? sprintf(_n('%d canción no se pudo subir', '%d canciones no se pudieron subir', fallos), fallos) : __('Canciones subidas'), fallos ? 'error' : undefined);
          cargar().then(function () { pintarChips(); pintarLista(); pintar(); });
          return;
        }
        it.estado = 'subiendo';
        pintar();
        subirPorTrozos(it.file, 'partitura', function (p) {
          progreso.firstChild.style.width = Math.round((hechas + p) / total * 100) + '%';
        }).then(function (idSubida) {
          var fd = new FormData();
          fd.append('titulo', limpiarTitulo(it.titulo));
          fd.append('numero', String(it.numero || '').trim());
          fd.append('tonalidad', tonoEspanol(it.tonalidad) || limpiarTitulo(it.tonalidad));
          ['autor', 'etiquetas', 'letra', 'notas'].forEach(function (k) { fd.append(k, ''); });
          fd.append('youtube', '[]');
          fd.append('nuevasSubidas', JSON.stringify([{ id: idSubida, nombre: it.file.name, label: '' }]));
          return apiSubir('canciones', fd);
        }).then(function (c) { it.estado = 'ok'; it.id = c.id; })
          .catch(function (e) { it.estado = 'error'; it.error = e.message; })
          .then(function () {
            hechas++;
            progreso.firstChild.style.width = Math.round(hechas / total * 100) + '%';
            siguiente();
          });
      })();
    }

    abrirPanel([
      cabeceraPanel(h('h2', { text: __('Subir varias canciones') })),
      h('div', { class: 'pcan-panel-body' },
        h('div', { class: 'pcan-form' },
          resumen, zona, lista, quitarYa,
          h('div', { class: 'pcan-form-actions' }, progreso, subir,
            h('button', { type: 'button', class: 'pcan-btn', onclick: function () { cerrarPanel(); } }, __('Cerrar')))))
    ], __('Subir varias canciones'), { vista: 'canciones', id: 0 });
    pintar();
  }

  // ---------------------------------------------------------------- ajustes (responsables)

  // Panel «Ajustes y equipo» abierto (null si no lo está) y turno de la última carga, para ignorar respuestas viejas.
  var ajustesAbierto = null;
  var turnoAjustes = 0;
  var SECCIONES_AJUSTES = ['general', 'equipo', 'accesos', 'escaleta', 'google', 'archivos', 'papelera', 'copias'];
  var RUTA_AJUSTES = /^#\/(ajustes|papelera|copias)(\/|$)/;

  /** Abre «Ajustes y equipo» en una sección (general, equipo, accesos, escaleta, google, archivos, papelera o copias).
   *  Si el panel ya está abierto solo cambia de sección: no se vuelven a pedir los datos. */
  function abrirAjustes(seccion) {
    if (!CFG.gestionar) { location.hash = '#/'; return; }
    if (SECCIONES_AJUSTES.indexOf(seccion) === -1) { seccion = 'general'; }
    if (ajustesAbierto && ajustesAbierto.raiz.isConnected) { ajustesAbierto.ir(seccion); return; }
    var turno = ++turnoAjustes;
    ajustesAbierto = null;
    abrirPanel([cabeceraPanel(h('h2', { text: __('Ajustes y equipo') })), h('div', { class: 'pcan-panel-loading', text: __('Cargando ajustes…') })], __('Ajustes'), { modal: true, ancho: true });
    api('ajustes').then(function (a) {
      // Si mientras tanto se fue a otra pantalla, no se abre encima.
      if (turno !== turnoAjustes || !RUTA_AJUSTES.test(location.hash)) { return; }
      pintarAjustes(a, seccion);
    }).catch(function (e) { aviso(e.message, 'error'); cerrarPanel(); });
  }

  // ---------------------------------------------------------------- bienvenida al equipo

  /** Dirección de esta página: el correo de bienvenida lleva el botón que la abre. Va con la consulta porque con los
   *  enlaces permanentes simples la página es «?page_id=12»; el servidor solo conserva eso. */
  function paginaActual() { return location.origin + location.pathname + location.search; }

  /**
   * Envía la bienvenida por tandas de 5 correos (así cada petición es corta aunque el servidor de correo tarde).
   * alProgreso(hechos, total) se llama antes de cada tanda y al terminar. Nunca rechaza: si una tanda falla
   * (red o servidor) se detiene y deja el motivo en `error` y los correos que no llegaron a intentarse en `sinEnviar`.
   */
  function enviarBienvenida(emails, alProgreso) {
    var res = { enviados: [], fallidos: [], omitidos: [], momento: 0, error: null, sinEnviar: [] };
    var total = emails.length, hechos = 0;
    function tanda() {
      alProgreso(hechos, total);
      if (hechos >= total) { return res; }
      var lote = emails.slice(hechos, hechos + 5);
      return api('bienvenida', { json: { emails: lote, pagina: paginaActual() } }).then(function (r) {
        res.enviados = res.enviados.concat(r.enviados || []);
        res.fallidos = res.fallidos.concat(r.fallidos || []);
        res.omitidos = res.omitidos.concat(r.omitidos || []);
        res.momento = r.momento || res.momento;
        hechos += lote.length;
        return tanda();
      }, function (err) {
        res.error = err;
        res.sinEnviar = emails.slice(hechos);
        return res;
      });
    }
    return Promise.resolve().then(tanda);
  }

  function bienvenidaConFallos(res) {
    return !!(res.fallidos.length || res.omitidos.length || res.error);
  }

  /** Frase resumen de un envío: a cuántas personas llegó y, si no, a quién no y por qué. */
  function resumenBienvenida(res) {
    var partes = [], fallos = res.fallidos.concat(res.omitidos);
    if (res.enviados.length) {
      partes.push(sprintf(_n('Bienvenida enviada a %d persona', 'Bienvenida enviada a %d personas', res.enviados.length), res.enviados.length));
    }
    if (fallos.length) {
      partes.push(sprintf(/* translators: 1: número de personas, 2: lista de correos, cada uno con su motivo */ _n('No se envió a %1$d persona: %2$s', 'No se envió a %1$d personas: %2$s', fallos.length), fallos.length,
        fallos.map(function (f) { return f.email + (f.motivo ? ' (' + f.motivo + ')' : ''); }).join('; ')));
    }
    if (res.error) {
      partes.push(sprintf(/* translators: %s: motivo del error */ __('Se interrumpió el envío (%s). Puedes enviarla a quien falte desde la lista del equipo.'), res.error.message));
    }
    return partes.join(' · ');
  }

  // ---------------------------------------------------------------- escaleta (imágenes de la cabecera y editor de secciones)
  //
  // La escaleta de cada culto se prepara en el propio culto (cultos.js). Desde aquí, en Ajustes, solo se eligen las dos
  // imágenes de la cabecera (identidad de la iglesia). El editor de secciones vive aquí para reutilizarlo en el culto
  // (P.crearEditorEscaleta).

  var ESC_TIPOS = ['texto', 'textoLargo', 'cancion', 'canciones'];
  var ESC_MAX_IMAGEN = 2 * 1048576;
  var escContador = 0;

  function escEsCancion(tipo) { return tipo === 'cancion' || tipo === 'canciones'; }

  function escTextoTipo(tipo) {
    return tipo === 'textoLargo' ? __('Texto largo')
      : tipo === 'cancion' ? __('Una canción del culto')
        : tipo === 'canciones' ? __('Varias canciones del culto') : __('Texto corto');
  }

  function escAyudaTipo(tipo) {
    return tipo === 'textoLargo' ? __('Varias líneas: cada línea se imprime en su línea.')
      : tipo === 'cancion' ? __('Se elige una de las canciones del culto o se escribe un nombre.')
        : tipo === 'canciones' ? __('Se eligen varias de las canciones del culto o se escriben nombres.') : __('Una línea de texto.');
  }

  /** Valores iniciales que se pueden elegir para las canciones (null en los campos de texto, que llevan un texto libre). */
  function escOpcionesDefecto(tipo) {
    return tipo === 'cancion'
      ? [['primera', __('La primera del culto')], ['siguiente', __('La siguiente a la última asignada antes')], ['ninguna', __('Ninguna')]]
      : tipo === 'canciones' ? [['ninguna', __('Ninguna')], ['restantes', __('Las que no estén en otras secciones')]] : null;
  }

  function escDefectoDeTipo(tipo) { return escEsCancion(tipo) ? 'ninguna' : ''; }

  function escNombreCampo(c) { return String(c.etiqueta || '').trim() || escTextoTipo(c.tipo); }

  function escCopiarCampo(c) {
    c = c && typeof c === 'object' ? c : {};
    var tipo = ESC_TIPOS.indexOf(c.tipo) === -1 ? 'texto' : c.tipo;
    var opciones = escOpcionesDefecto(tipo);
    var defecto = c.defecto === undefined || c.defecto === null ? '' : String(c.defecto);
    if (opciones && !opciones.some(function (x) { return x[0] === defecto; })) { defecto = 'ninguna'; }
    // _evitar: identificadores que este campo ya tuvo (al cambiar de tipo no debe volver a recibirlos).
    return { id: String(c.id || ''), tipo: tipo, etiqueta: String(c.etiqueta || ''), defecto: defecto, pequeno: !!c.pequeno, _evitar: [] };
  }

  /** Copia de trabajo de una lista de secciones: se edita ésta, nunca el objeto que llegó de fuera. */
  function escCopiarSecciones(lista) {
    return (Array.isArray(lista) ? lista : []).map(function (s) {
      s = s && typeof s === 'object' ? s : {};
      return { id: String(s.id || ''), titulo: String(s.titulo || ''), nota: String(s.nota || ''), campos: (Array.isArray(s.campos) ? s.campos : []).map(escCopiarCampo), _abierta: false };
    });
  }


  function escIdLimpio(texto, respaldo) {
    var id = norm(texto).replace(/ /g, '-').slice(0, 40).replace(/^-+|-+$/g, '');
    return id || respaldo;
  }

  function escIdUnico(base, usados) {
    var id = base, n = 2;
    while (usados[id]) { id = base + '-' + n++; }
    usados[id] = true;
    return id;
  }

  /**
   * Las secciones tal como las devuelve el editor. Los identificadores de las secciones y campos nuevos (vacíos hasta ahora) se
   * generan aquí, a partir del título o la etiqueta, sin repetirse; los que ya existían no cambian.
   */
  function escSeccionesValor(secciones) {
    var usadasSec = {};
    secciones.forEach(function (s) { if (s.id) { usadasSec[s.id] = true; } });
    return secciones.map(function (s) {
      var usadas = {};
      s.campos.forEach(function (c) {
        if (c.id) { usadas[c.id] = true; }
        c._evitar.forEach(function (x) { usadas[x] = true; });
      });
      return {
        id: s.id || escIdUnico(escIdLimpio(s.titulo, 'seccion'), usadasSec),
        titulo: s.titulo.trim(),
        nota: s.nota.trim(),
        campos: s.campos.map(function (c) {
          return {
            id: c.id || escIdUnico(escIdLimpio(c.etiqueta, c.tipo === 'textoLargo' ? 'texto-largo' : c.tipo), usadas),
            tipo: c.tipo, etiqueta: c.etiqueta.trim(), defecto: c.defecto, pequeno: !!c.pequeno
          };
        })
      };
    });
  }

  /**
   * Imágenes de la cabecera de la hoja impresa (sección «Escaleta» de los ajustes): la imagen de cabecera y el logo, comunes a
   * toda la instalación. o: { inicial: { logo, cabecera }, alCambiar(), alSubir() }.
   * Devuelve { nodo, valor(paraGuardar), subiendo() }; con `paraGuardar` cada imagen va solo con su id.
   */
  function crearImagenesEscaleta(o) {
    var ini = o.inicial || {};
    var imagen = function (v) { return v && v.id ? { id: +v.id, url: String(v.url || '') } : null; };
    var im = { logo: imagen(ini.logo), cabecera: imagen(ini.cabecera) };
    var subidas = 0;
    function cambio() { o.alCambiar(); }

    function slotImagen(cfg) {
      var ticket = 0, activa = false;
      var idTitulo = 'pcan-esc-i' + (++escContador);
      var img = h('img', { class: 'pcan-esc-img', alt: cfg.alt });
      var vacio = h('span', { class: 'pcan-esc-img-vacio', text: cfg.vacio });
      var error = h('p', { class: 'pcan-form-error', role: 'alert', hidden: true });
      var textoSubida = h('span');
      var relleno = h('span');
      var barra = h('div', { class: 'pcan-esc-subida', role: 'status', hidden: true }, textoSubida, h('div', { class: 'pcan-progress' }, relleno));
      var entrada = h('input', { type: 'file', class: 'pcan-file-hidden', accept: 'image/jpeg,image/png', tabindex: '-1', 'aria-hidden': 'true' });
      var bElegir = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () { entrada.click(); } }, icono('subir'), __('Elegir imagen'));
      var bQuitar = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-sec is-danger', onclick: function () {
        im[cfg.clave] = null;
        mostrarError('');
        pintar();
        bElegir.focus();
        cambio();
      } }, icono('borrar'), __('Quitar'));

      function mostrarError(texto) { error.textContent = texto || ''; error.hidden = !texto; }
      function progreso(p) {
        var pct = Math.round(p * 100);
        textoSubida.textContent = __('Subiendo…') + ' ' + pct + ' %';
        relleno.style.width = pct + '%';
      }
      function pintar() {
        var v = im[cfg.clave], hay = !!(v && v.url);
        if (hay) { img.src = v.url; } else { img.removeAttribute('src'); }
        img.hidden = !hay;
        vacio.hidden = hay;
        bQuitar.hidden = !v;
      }
      function terminar() {
        if (!activa) { return; }
        activa = false;
        subidas--;
        bElegir.disabled = false;
        bQuitar.disabled = false;
        barra.hidden = true;
        o.alSubir();
      }
      img.addEventListener('error', function () { img.hidden = true; vacio.hidden = false; });
      entrada.addEventListener('change', function (e) {
        e.stopPropagation();
        var f = entrada.files && entrada.files[0];
        entrada.value = '';
        if (!f || activa) { return; }
        var valida = /^image\/(jpeg|png)$/.test(f.type) || (!f.type && /\.(jpe?g|png)$/i.test(f.name));
        if (!valida) { mostrarError(__('Solo se admiten imágenes JPG o PNG.')); return; }
        if (f.size > ESC_MAX_IMAGEN) { mostrarError(sprintf(/* translators: %s: tamaño de la imagen elegida (p. ej. 3,4 MB) */ __('La imagen pesa %s y el máximo son 2 MB.'), tamano(f.size))); return; }
        mostrarError('');
        var mio = ++ticket;
        activa = true;
        subidas++;
        bElegir.disabled = true;
        bQuitar.disabled = true;
        progreso(0);
        barra.hidden = false;
        o.alSubir();
        var fd = new FormData();
        fd.append('archivo', f);
        apiSubir('escaleta/imagen', fd, function (p) { if (mio === ticket) { progreso(p); } }).then(function (r) {
          if (mio !== ticket) { return; }
          im[cfg.clave] = { id: +r.id, url: String(r.url || '') };
          pintar();
          cambio();
        }).catch(function (err) {
          if (mio === ticket) { mostrarError(err.message); }
        }).then(function () { if (mio === ticket) { terminar(); } });
      });

      var slot = {};
      pintar();
      slot.nodo = h('div', { class: 'pcan-esc-slot', role: 'group', 'aria-labelledby': idTitulo },
        h('strong', { class: 'pcan-label', id: idTitulo, text: cfg.titulo }),
        h('div', { class: 'pcan-esc-img-vista' }, img, vacio),
        h('div', { class: 'pcan-esc-slot-botones' }, bElegir, bQuitar, entrada),
        barra, error,
        h('p', { class: 'pcan-help', text: cfg.ayuda }));
      return slot;
    }

    var slotCabecera = slotImagen({
      clave: 'cabecera', titulo: __('Imagen de cabecera (arriba a la izquierda)'), alt: __('Vista previa de la imagen de cabecera'),
      vacio: __('Sin imagen'), ayuda: __('JPG o PNG, de hasta 2 MB. Si no eliges ninguna, se imprime el nombre del cancionero.')
    });
    var slotLogo = slotImagen({
      clave: 'logo', titulo: __('Logo de la iglesia (arriba a la derecha)'), alt: __('Vista previa del logo'),
      vacio: __('Sin logo'), ayuda: __('JPG o PNG, de hasta 2 MB. Si no eliges ninguno, se imprime el logo del Cancionero.')
    });

    var nodo = h('div', { class: 'pcan-esc' },
      h('p', { class: 'pcan-help', text: __('Aquí solo se eligen las dos imágenes de la cabecera de la hoja impresa. Las secciones, los títulos y el resto de la escaleta se preparan en cada culto, en su pestaña Escaleta.') }),
      h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: __('Cabecera de la hoja impresa') }),
        h('div', { class: 'pcan-esc-cabeceras' }, slotCabecera.nodo, slotLogo.nodo)));

    return {
      nodo: nodo,
      valor: function (paraGuardar) {
        var img = function (v) { return v ? (paraGuardar ? { id: v.id } : { id: v.id, url: v.url }) : null; };
        return { logo: img(im.logo), cabecera: img(im.cabecera) };
      },
      subiendo: function () { return subidas; }
    };
  }


  /**
   * Editor de las secciones de una escaleta: títulos, notas, campos (tipo, etiqueta, texto o canción inicial, letra pequeña),
   * orden, añadir y quitar. Se usa en la pestaña Escaleta de cada culto (cultos.js, con P.crearEditorEscaleta).
   * plantilla: { secciones: [...] } (solo cuenta la estructura; los identificadores que ya existen se conservan);
   * o: { alCambiar() }. Devuelve { nodo, valor(), validar() }: valor() es la lista de secciones con los identificadores de las
   * nuevas ya generados; validar() devuelve null o { mensaje, enfocar() } si falta algo (una sección sin título).
   */
  function crearEditorEscaleta(plantilla, o) {
    o = o || {};
    var pl = { secciones: escCopiarSecciones(plantilla && plantilla.secciones) };
    var anuncio = h('p', { class: 'pcan-esc-anuncio', role: 'status' });

    function anunciar(texto) {
      anuncio.textContent = '';
      setTimeout(function () { anuncio.textContent = texto; }, 30);
    }
    function cambio() { if (o.alCambiar) { o.alCambiar(); } }

    function mover(lista, de, a) { lista.splice(a, 0, lista.splice(de, 1)[0]); }
    function posicion(nombre, i, total) {
      return sprintf(/* translators: 1: nombre de la sección o del campo, 2: posición nueva, 3: total */ __('%1$s: ahora en la posición %2$d de %3$d'), nombre, i + 1, total);
    }

    /** Devuelve el foco a un botón (o campo) de la fila `foco.i` tras volver a pintar la lista. */
    function enfocar(ol, foco) {
      var fila = foco && ol.children[foco.i];
      if (!fila) { return; }
      var el = fila.querySelector('[data-accion="' + foco.accion + '"]');
      if (el && el.disabled && (foco.accion === 'subir' || foco.accion === 'bajar')) {
        el = fila.querySelector('[data-accion="' + (foco.accion === 'subir' ? 'bajar' : 'subir') + '"]');
      }
      if (el && !el.disabled) { el.focus(); }
    }

    /** Reordenar arrastrando el asa (ratón y dedo): la fila se mueve en el DOM y al soltar se reordena la lista de datos. */
    function arrastrable(asa, li, ol, lista, terminar) {
      asa.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) { return; }
        e.preventDefault();
        var puntero = e.pointerId, y = e.clientY, raf = 0;
        var zona = ol.closest('.pcan-ajustes-scroll, .pcan-panel');
        li.classList.add('is-dragging');
        ol.classList.add('is-sorting');

        function colocar() {
          var otras = Array.prototype.slice.call(ol.children).filter(function (n) { return n !== li; });
          var antes = null;
          for (var k = 0; k < otras.length; k++) {
            var r = otras[k].getBoundingClientRect();
            if (y < r.top + r.height / 2) { antes = otras[k]; break; }
          }
          if (antes) { if (li.nextSibling !== antes) { ol.insertBefore(li, antes); } }
          else if (ol.lastChild !== li) { ol.appendChild(li); }
        }
        // Cerca del borde de la zona con desplazamiento, ésta se mueve sola para poder llegar a las filas lejanas.
        function desplazar() {
          if (zona) {
            var r = zona.getBoundingClientRect(), borde = 56, v = 0;
            if (y < r.top + borde) { v = -Math.ceil((r.top + borde - y) / 4); }
            else if (y > r.bottom - borde) { v = Math.ceil((y - (r.bottom - borde)) / 4); }
            v = Math.max(-24, Math.min(24, v));
            if (v) { zona.scrollTop += v; colocar(); }
          }
          raf = requestAnimationFrame(desplazar);
        }
        function mueve(ev) {
          if (ev.pointerId !== puntero) { return; }
          ev.preventDefault();
          y = ev.clientY;
          colocar();
        }
        function suelta(ev) {
          if (ev.pointerId !== puntero) { return; }
          cancelAnimationFrame(raf);
          window.removeEventListener('pointermove', mueve);
          window.removeEventListener('pointerup', suelta);
          window.removeEventListener('pointercancel', suelta);
          li.classList.remove('is-dragging');
          ol.classList.remove('is-sorting');
          var orden = Array.prototype.map.call(ol.children, function (n) { return +n.getAttribute('data-i'); });
          var movido = lista[+li.getAttribute('data-i')];
          var hubo = orden.some(function (k, p) { return k !== p; });
          var nuevos = orden.map(function (k) { return lista[k]; });
          lista.length = 0;
          Array.prototype.push.apply(lista, nuevos);
          terminar(hubo, lista.indexOf(movido));
        }
        window.addEventListener('pointermove', mueve, { passive: false });
        window.addEventListener('pointerup', suelta);
        window.addEventListener('pointercancel', suelta);
        raf = requestAnimationFrame(desplazar);
      });
    }

    function asaDeArrastre() {
      return h('button', { type: 'button', class: 'pcan-drag', tabindex: '-1', 'aria-hidden': 'true', title: __('Arrastrar') }, icono('arrastrar'));
    }


    // ---- secciones
    var lista = h('ol', { class: 'pcan-esc-lista' });
    var vacia = h('p', { class: 'pcan-set-placeholder', text: __('No hay ninguna sección. Pulsa «Añadir sección» para crear la primera.') });
    var bAnadirSeccion = h('button', { type: 'button', class: 'pcan-btn pcan-btn-primary', onclick: function () {
      pl.secciones.push({ id: '', titulo: '', nota: '', campos: [escCopiarCampo({ tipo: 'texto' })], _abierta: true });
      pintarSecciones({ i: pl.secciones.length - 1, accion: 'titulo' });
      cambio();
    } }, icono('mas'), __('Añadir sección'));

    function moverSeccion(de, a) {
      var s = pl.secciones[de];
      mover(pl.secciones, de, a);
      pintarSecciones({ i: a, accion: de > a ? 'subir' : 'bajar' });
      cambio();
      anunciar(posicion(s.titulo.trim() || __('(sin título)'), a, pl.secciones.length));
    }

    function pintarSecciones(foco) {
      lista.innerHTML = '';
      vacia.hidden = pl.secciones.length > 0;
      pl.secciones.forEach(function (s, i) { append(lista, filaSeccion(s, i)); });
      enfocar(lista, foco);
    }

    function filaSeccion(s, i) {
      var total = pl.secciones.length;
      var idCuerpo = 'pcan-esc-c' + (++escContador);
      var nombre = h('span', { class: 'pcan-esc-nombre' });
      var resumen = h('span', { class: 'pcan-esc-resumen' });
      var accion = h('span', { class: 'pcan-esc-accion' });
      var nombreS = function () { return s.titulo.trim() || __('(sin título)'); };

      function cabecera() {
        nombre.textContent = s.titulo.trim() ? s.titulo.trim().toLocaleUpperCase(LOCALE) : __('(sin título)');
        nombre.classList.toggle('is-vacio', !s.titulo.trim());
        resumen.textContent = s.campos.length ? s.campos.map(escNombreCampo).join(' · ') : __('Sin campos');
        bSubir.setAttribute('aria-label', sprintf(/* translators: %s: título de la sección */ __('Subir la sección «%s»'), nombreS()));
        bBajar.setAttribute('aria-label', sprintf(/* translators: %s: título de la sección */ __('Bajar la sección «%s»'), nombreS()));
      }

      var toggle = h('button', { type: 'button', class: 'pcan-esc-toggle', 'aria-expanded': 'false', 'aria-controls': idCuerpo, onclick: function () { abrir(!s._abierta); } },
        h('span', { class: 'pcan-set-n', text: String(i + 1) }),
        h('span', { class: 'pcan-esc-textos' }, nombre, resumen),
        accion);
      var asa = asaDeArrastre();
      var bSubir = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-sec', 'data-accion': 'subir', disabled: i === 0,
        'aria-label': sprintf(/* translators: %s: título de la sección */ __('Subir la sección «%s»'), nombreS()), onclick: function () { moverSeccion(i, i - 1); } }, icono('arriba'), _x('Subir', 'mover una sección o un campo de la escaleta hacia arriba'));
      var bBajar = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-sec', 'data-accion': 'bajar', disabled: i === total - 1,
        'aria-label': sprintf(/* translators: %s: título de la sección */ __('Bajar la sección «%s»'), nombreS()), onclick: function () { moverSeccion(i, i + 1); } }, icono('abajo'), _x('Bajar', 'mover una sección o un campo de la escaleta hacia abajo'));

      // Cuerpo: lo que se edita al desplegar la sección.
      var fTit = h('input', { type: 'text', class: 'pcan-input', 'data-accion': 'titulo', maxlength: '60', placeholder: __('p. ej. Anuncios'), oninput: function (e) { s.titulo = e.target.value; errorTitulo.hidden = true; cabecera(); } });
      var errorTitulo = h('p', { class: 'pcan-form-error', role: 'alert', 'data-accion': 'error-titulo', hidden: true });
      var fNota = h('input', { type: 'text', class: 'pcan-input', maxlength: '120', placeholder: __('p. ej. (Indicación breve para este momento)'), oninput: function (e) { s.nota = e.target.value; } });
      fTit.value = s.titulo;
      fNota.value = s.nota;

      var listaCampos = h('ol', { class: 'pcan-esc-campos' });
      var sinCampos = h('p', { class: 'pcan-set-placeholder', text: __('Esta sección no tiene campos y saldrá vacía en la hoja. Pulsa «Añadir campo».') });
      var bAnadirCampo = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () {
        s.campos.push(escCopiarCampo({ tipo: 'texto' }));
        pintarCampos({ i: s.campos.length - 1, accion: 'tipo' });
        cambio();
      } }, icono('mas'), __('Añadir campo'));

      function moverCampo(de, a) {
        var c = s.campos[de];
        mover(s.campos, de, a);
        pintarCampos({ i: a, accion: de > a ? 'subir' : 'bajar' });
        cambio();
        anunciar(posicion(escNombreCampo(c), a, s.campos.length));
      }

      /** Cambiar el tipo cambia lo que se guarda en cada culto: salvo entre texto corto y largo, el campo recibe otro id y su valor inicial. */
      function cambiarTipo(c, nuevo) {
        var viejo = c.tipo;
        if (nuevo === viejo) { return; }
        c.tipo = nuevo;
        if (escEsCancion(viejo) || escEsCancion(nuevo)) {
          c.defecto = escDefectoDeTipo(nuevo);
          if (c.id) { c._evitar.push(c.id); c.id = ''; }
        }
      }

      function controlDefecto(c) {
        var opciones = escOpcionesDefecto(c.tipo);
        if (opciones) {
          var sel = h('select', { class: 'pcan-input', onchange: function (e) { c.defecto = e.target.value; } },
            opciones.map(function (x) { return h('option', { value: x[0], text: x[1] }); }));
          sel.value = c.defecto;
          return campo(c.tipo === 'cancion' ? __('Canción propuesta') : __('Canciones propuestas'), sel, __('Aparece ya elegida al rellenar la escaleta; se puede cambiar.'));
        }
        var texto = c.tipo === 'textoLargo'
          ? h('textarea', { class: 'pcan-input pcan-textarea', rows: '3', maxlength: '1000' })
          : h('input', { type: 'text', class: 'pcan-input', maxlength: '200' });
        texto.value = c.defecto;
        texto.addEventListener('input', function () { c.defecto = texto.value; });
        return campo(__('Texto inicial (opcional)'), texto, __('Aparece ya escrito al rellenar la escaleta; se puede cambiar.'));
      }

      function tarjetaCampo(c, k) {
        var n = s.campos.length;
        var nombreC = escNombreCampo(c);
        var selTipo = h('select', { class: 'pcan-input', 'data-accion': 'tipo', onchange: function (e) {
          cambiarTipo(c, e.target.value);
          pintarCampos({ i: s.campos.indexOf(c), accion: 'tipo' });
          cambio();
        } }, ESC_TIPOS.map(function (t) { return h('option', { value: t, text: escTextoTipo(t) }); }));
        selTipo.value = c.tipo;
        var fEtiqueta = h('input', { type: 'text', class: 'pcan-input', maxlength: '40', placeholder: __('p. ej. Presidencia'), oninput: function (e) { c.etiqueta = e.target.value; cabecera(); rotular(); } });
        fEtiqueta.value = c.etiqueta;
        var chk = h('input', { type: 'checkbox', checked: !!c.pequeno, onchange: function (e) { c.pequeno = e.target.checked; } });
        var bSubirC = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-sec', 'data-accion': 'subir', disabled: k === 0,
          'aria-label': sprintf(/* translators: %s: nombre del campo */ __('Subir el campo «%s»'), nombreC), onclick: function () { moverCampo(k, k - 1); } }, icono('arriba'), _x('Subir', 'mover una sección o un campo de la escaleta hacia arriba'));
        var bBajarC = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-sec', 'data-accion': 'bajar', disabled: k === n - 1,
          'aria-label': sprintf(/* translators: %s: nombre del campo */ __('Bajar el campo «%s»'), nombreC), onclick: function () { moverCampo(k, k + 1); } }, icono('abajo'), _x('Bajar', 'mover una sección o un campo de la escaleta hacia abajo'));
        var bQuitarC = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-sec is-danger', 'data-accion': 'quitar',
          'aria-label': sprintf(/* translators: %s: nombre del campo */ __('Quitar el campo «%s»'), nombreC), onclick: function () {
            s.campos.splice(k, 1);
            pintarCampos({ i: Math.min(k, s.campos.length - 1), accion: 'quitar' });
            if (!s.campos.length) { bAnadirCampo.focus(); }
            cambio();
            anunciar(sprintf(/* translators: %s: nombre del campo */ __('Campo «%s» quitado'), nombreC));
          } }, icono('borrar'), __('Quitar'));
        // Los botones llevan el nombre del campo, que cambia mientras se escribe la etiqueta.
        function rotular() {
          nombreC = escNombreCampo(c);
          bSubirC.setAttribute('aria-label', sprintf(/* translators: %s: nombre del campo */ __('Subir el campo «%s»'), nombreC));
          bBajarC.setAttribute('aria-label', sprintf(/* translators: %s: nombre del campo */ __('Bajar el campo «%s»'), nombreC));
          bQuitarC.setAttribute('aria-label', sprintf(/* translators: %s: nombre del campo */ __('Quitar el campo «%s»'), nombreC));
        }
        var asaC = asaDeArrastre();
        var li = h('li', { class: 'pcan-esc-campo', 'data-i': String(k) },
          asaC,
          h('div', { class: 'pcan-esc-campo-main' },
            h('div', { class: 'pcan-esc-campo-grid' },
              campo(__('Tipo de campo'), selTipo, escAyudaTipo(c.tipo)),
              campo(__('Etiqueta (opcional)'), fEtiqueta, __('Si la pones, sale impresa delante del valor, como «Presidencia: …».'))),
            controlDefecto(c),
            h('div', { class: 'pcan-esc-campo-pie' },
              h('label', { class: 'pcan-copia-opcion' }, chk,
                h('span', null, h('strong', { text: __('Letra pequeña') }), h('small', { text: __('Imprime este campo con letra más pequeña, por ejemplo para una nota.') }))),
              h('div', { class: 'pcan-esc-campo-herr' }, bSubirC, bBajarC, bQuitarC))));
        arrastrable(asaC, li, listaCampos, s.campos, function (hubo, nueva) {
          pintarCampos();
          if (hubo) { cambio(); anunciar(posicion(nombreC, nueva, s.campos.length)); }
        });
        return li;
      }

      function pintarCampos(foco) {
        listaCampos.innerHTML = '';
        sinCampos.hidden = s.campos.length > 0;
        s.campos.forEach(function (c, k) { append(listaCampos, tarjetaCampo(c, k)); });
        enfocar(listaCampos, foco);
        cabecera();
      }

      var confirmar = h('div', { class: 'pcan-confirmar pcan-esc-confirmar', role: 'alert', hidden: true });
      var textoConfirmar = h('span');
      var bQuitarSeccion = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-sec is-danger', 'aria-expanded': 'false', onclick: function () {
        confirmar.hidden = !confirmar.hidden;
        bQuitarSeccion.setAttribute('aria-expanded', confirmar.hidden ? 'false' : 'true');
        textoConfirmar.textContent = sprintf(/* translators: %s: título de la sección */ __('Se quitará la sección «%s» y todos sus campos de la escaleta.'), nombreS());
        if (!confirmar.hidden) { confirmar.querySelector('[data-accion="cancelar"]').focus(); }
      } }, icono('borrar'), __('Quitar sección'));
      append(confirmar, [
        textoConfirmar,
        h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-danger', onclick: function () {
          var nom = nombreS();
          pl.secciones.splice(pl.secciones.indexOf(s), 1);
          pintarSecciones();
          bAnadirSeccion.focus();
          cambio();
          anunciar(sprintf(/* translators: %s: título de la sección */ __('Sección «%s» quitada'), nom));
        } }, __('Sí, quitar la sección')),
        h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', 'data-accion': 'cancelar', onclick: function () { confirmar.hidden = true; bQuitarSeccion.setAttribute('aria-expanded', 'false'); bQuitarSeccion.focus(); } }, __('Cancelar'))]);

      var cuerpo = h('div', { class: 'pcan-esc-cuerpo', id: idCuerpo, hidden: true },
        campo(__('Título de la sección'), fTit, __('Se imprime siempre en MAYÚSCULAS.')),
        errorTitulo,
        campo(__('Nota bajo el título (opcional)'), fNota, __('Sale debajo del título, en rojo y con letra más pequeña.')),
        h('div', { class: 'pcan-esc-campos-bloque' },
          h('h3', { class: 'pcan-esc-subtitulo', text: __('Campos de la sección') }),
          h('p', { class: 'pcan-help', text: __('Cada campo es una línea que se rellena al preparar la escaleta: un texto, o una o varias canciones del culto.') }),
          sinCampos, listaCampos,
          h('div', { class: 'pcan-actions' }, bAnadirCampo)),
        h('div', { class: 'pcan-esc-pie' }, bQuitarSeccion, confirmar));

      var fila = h('li', { class: 'pcan-esc-sec', 'data-i': String(i) },
        h('div', { class: 'pcan-esc-cab' }, asa, toggle, h('div', { class: 'pcan-esc-herr' }, bSubir, bBajar)),
        cuerpo);

      function abrir(si) {
        s._abierta = si;
        fila.classList.toggle('is-open', si);
        cuerpo.hidden = !si;
        toggle.setAttribute('aria-expanded', si ? 'true' : 'false');
        accion.textContent = si ? __('Cerrar') : __('Editar');
      }

      arrastrable(asa, fila, lista, pl.secciones, function (hubo, nueva) {
        pintarSecciones();
        if (hubo) { cambio(); anunciar(posicion(nombreS(), nueva, pl.secciones.length)); }
      });
      pintarCampos();
      abrir(!!s._abierta);
      return fila;
    }

    /** Si falta algo para poder guardar: { mensaje, enfocar() }; si no, null. */
    function validar() {
      for (var i = 0; i < pl.secciones.length; i++) {
        if (pl.secciones[i].titulo.trim()) { continue; }
        var s = pl.secciones[i], pos = i;
        var mensaje = sprintf(/* translators: %d: número de la sección dentro de la escaleta */ __('La sección %d no tiene título: escríbelo para continuar.'), pos + 1);
        return {
          mensaje: mensaje,
          enfocar: function () {
            s._abierta = true;
            pintarSecciones();
            var titulo = lista.children[pos].querySelector('[data-accion="titulo"]');
            titulo.classList.add('is-invalid');
            titulo.setAttribute('aria-invalid', 'true');
            var aviso_ = lista.children[pos].querySelector('[data-accion="error-titulo"]');
            aviso_.textContent = mensaje;
            aviso_.hidden = false;
            titulo.focus();
          }
        };
      }
      return null;
    }

    pintarSecciones();

    var nodo = h('div', { class: 'pcan-esc' },
      h('p', { class: 'pcan-help', text: __('Cada sección es una fila de la hoja: su título a la izquierda y lo que se rellena a la derecha. Pulsa «Editar» para cambiarla. Para cambiar el orden, arrastra el asa de la izquierda o usa «Subir» y «Bajar».') }),
      vacia, lista,
      h('div', { class: 'pcan-actions' }, bAnadirSeccion),
      anuncio);
    // Pulsar Intro en un campo de texto no debe enviar el formulario que lo contiene (el del culto o el de los ajustes).
    nodo.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); }
    });

    return {
      nodo: nodo,
      valor: function () { return escSeccionesValor(pl.secciones); },
      validar: validar
    };
  }


  function pintarAjustes(a, seccionInicial) {
    var fNombre =h('input', { type: 'text', class: 'pcan-input', value: a.nombre || '', maxlength: '40', placeholder: 'Cancionero', spellcheck: 'false' });
    var fSubtitulo = h('input', { type: 'text', class: 'pcan-input', value: a.subtitulo || '', maxlength: '60', placeholder: __('p. ej. Nombre de tu iglesia o grupo'), spellcheck: 'false' });
    var fPapelera = h('input', { type: 'number', class: 'pcan-input', min: '0', max: '3650', value: String(a.papeleraDias === undefined ? 30 : a.papeleraDias) });
    var fAvisoBorrado = h('input', { type: 'checkbox', checked: !!a.avisoBorrado });
    var fTema = h('select', { class: 'pcan-input' }, Object.keys(CFG.temas).map(function (k) { return h('option', { value: k, text: CFG.temas[k] }); }));
    fTema.value = a.temaDefecto;
    var fClient = h('input', { type: 'text', class: 'pcan-input', value: a.googleClientId, placeholder: '1234567890-abc….apps.googleusercontent.com', spellcheck: 'false' });
    var fDominio = h('input', { type: 'text', class: 'pcan-input', value: a.dominio, placeholder: __('p. ej. tuiglesia.org (opcional)'), spellcheck: 'false' });
    var fBienvAuto = h('input', { type: 'checkbox', checked: !!a.bienvenidaAuto });
    var fBienvTexto = h('textarea', { class: 'pcan-input pcan-textarea', rows: '3', maxlength: '1000' });
    fBienvTexto.value = a.bienvenidaTexto || '';
    // Escaleta: aquí solo van las dos imágenes de la cabecera de la hoja impresa (logo e imagen de cabecera), que se guardan con
    // «Guardar ajustes». Subir una imagen sí es inmediato (va a la biblioteca de medios); su id se guarda con el resto.
    // La estructura de la escaleta (secciones, títulos…) se prepara en cada culto.
    var imagenesEscaleta = crearImagenesEscaleta({
      inicial: a.escaleta,
      alCambiar: function () { recalcularSucio(); },
      alSubir: function () { bloquear(); }
    });
    var escInicial = JSON.stringify(imagenesEscaleta.valor(true));

    var errorBox = h('div', { class: 'pcan-form-error', role: 'alert', hidden: true });
    var guardar = h('button', { type: 'submit', class: 'pcan-btn pcan-btn-primary' }, __('Guardar ajustes'));
    var cancelar = h('button', { type: 'button', class: 'pcan-btn', onclick: function () { cerrarPanel(); } }, __('Cancelar'));

    // Guardando, cambiando la lista del equipo o enviando la bienvenida: no se puede guardar, cancelar ni lanzar otra acción a la vez.
    var enCurso = false;
    function bloquear() {
      guardar.disabled = enCurso || imagenesEscaleta.subiendo() > 0;
      cancelar.disabled = enCurso;
      bAnadir.disabled = enCurso;
      bConfirmarAnadir.disabled = enCurso;
      filas.forEach(function (f) { f.opciones.boton.disabled = enCurso; });
      sincronizarBienvenida();
    }

    // Progreso del envío de la bienvenida, en la barra fija de abajo (visible en toda la sección Equipo).
    var textoProgreso = h('span', { class: 'pcan-ajustes-progreso-texto' });
    var rellenoProgreso = h('span');
    var cajaProgreso = h('div', { class: 'pcan-ajustes-progreso', role: 'status', hidden: true }, textoProgreso, h('div', { class: 'pcan-progress' }, rellenoProgreso));

    /** Envía la bienvenida a esos correos mostrando el progreso; bloquea los botones hasta terminar. */
    function enviarConProgreso(emails) {
      enCurso = true;
      bloquear();
      return enviarBienvenida(emails, function (hechos, total) {
        textoProgreso.textContent = sprintf(/* translators: 1: personas a las que ya se ha enviado, 2: total de personas */ __('Enviando la bienvenida… %1$d de %2$d'), hechos, total);
        rellenoProgreso.style.width = (total ? Math.round(hechos / total * 100) : 0) + '%';
        cajaProgreso.hidden = false;
      }).then(function (res) {
        enCurso = false;
        cajaProgreso.hidden = true;
        bloquear();
        return res;
      });
    }

    // ---- Equipo. La lista se gestiona aquí y se guarda al momento, sin pasar por «Guardar ajustes»: a.emails,
    // a.administradores y a.miembros se mantienen al día con cada respuesta del servidor.
    var CORREO_VALIDO = /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
    var miCorreo = String(CFG.userEmail || '').toLowerCase();
    function claveDe(m) { return String(m.email).toLowerCase(); }
    function nombreDe(m) { return m.nombre || m.email; }
    function conCorreo(lista, clave) { return lista.indexOf(clave) === -1 ? lista.concat(clave) : lista; }
    function sinCorreo(lista, clave) { return lista.filter(function (e) { return e !== clave; }); }

    // Quién ha sido elegido para recibir la bienvenida (por correo en minúsculas). Solo las cuentas con `puedeBienvenida`.
    var elegidos = {};
    // Filas que se ven ahora (la búsqueda puede ocultar a otras).
    var filas = [];
    function pintarEnviada(fila) {
      var m = fila.m;
      fila.enviada.textContent = m.bienvenida ? sprintf(/* translators: %s: fecha */ __('Bienvenida enviada el %s'), fechaMarca(m.bienvenida)) : '';
      fila.enviada.hidden = !m.bienvenida;
    }

    // Resultado de la última acción sobre la lista (añadir, quitar, enviar la bienvenida…).
    var resultadoEnvio = h('p', { class: 'pcan-help pcan-bienv-resultado', role: 'status', hidden: true });
    function mostrarResultado(texto, error) {
      resultadoEnvio.textContent = texto || '';
      resultadoEnvio.classList.toggle('is-error', !!error);
      resultadoEnvio.hidden = !texto;
    }

    // Menú «Opciones» de cada persona: uno abierto como máximo; se cierra con Escape, al hacer clic fuera y al elegir.
    var menuAbierto = null;
    function fueraDelMenu(e) {
      if (menuAbierto && !menuAbierto.envoltorio.contains(e.target)) { cerrarOpciones(); }
    }
    function itemsDelMenu() {
      return menuAbierto ? Array.prototype.slice.call(menuAbierto.menu.querySelectorAll('[role="menuitem"]')) : [];
    }
    function teclaMenu(e) {
      if (!menuAbierto) { return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarOpciones(true); return; }
      if (e.key === 'Tab') { cerrarOpciones(true); return; }
      var items = itemsDelMenu(), i = items.indexOf(document.activeElement), n = items.length;
      if (!n || !menuAbierto.envoltorio.contains(document.activeElement)) { return; }
      var nuevo = e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowUp' ? (i + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
      if (nuevo < 0) { return; }
      e.preventDefault();
      items[nuevo].focus();
    }
    function cerrarOpciones(devolverFoco) {
      if (!menuAbierto) { return; }
      var o = menuAbierto;
      menuAbierto = null;
      o.menu.hidden = true;
      o.menu.classList.remove('is-arriba');
      o.menu.style.right = '';
      o.boton.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', fueraDelMenu, true);
      document.removeEventListener('keydown', teclaMenu, true);
      if (devolverFoco) { o.boton.focus(); }
    }
    function abrirOpciones(o) {
      cerrarOpciones();
      menuAbierto = o;
      o.menu.hidden = false;
      o.boton.setAttribute('aria-expanded', 'true');
      // Por defecto se abre hacia abajo; si no cabe en la zona visible y arriba hay más sitio, se abre hacia arriba.
      // En el móvil, si se saldría por la izquierda se desplaza lo justo.
      var rb = o.boton.getBoundingClientRect(), rz = zona.getBoundingClientRect(), rm = o.menu.getBoundingClientRect();
      if (rm.height + 8 > rz.bottom - rb.bottom && rb.top - rz.top > rz.bottom - rb.bottom) { o.menu.classList.add('is-arriba'); }
      rm = o.menu.getBoundingClientRect();
      if (rm.left < rz.left + 6) { o.menu.style.right = (rm.left - rz.left - 6) + 'px'; }
      document.addEventListener('pointerdown', fueraDelMenu, true);
      document.addEventListener('keydown', teclaMenu, true);
      var primero = itemsDelMenu()[0];
      if (primero) { primero.focus({ preventScroll: true }); }
      if (o.menu.scrollIntoView) { o.menu.scrollIntoView({ block: 'nearest' }); }
    }

    /** Opciones de una persona. Quien es administrador de la web (esAdmin) ya lo es siempre: no se le ofrece nombrarlo.
     *  Uno mismo no puede quitarse del equipo ni de administrador (se quedaría sin acceso a los ajustes). */
    function opcionesDe(m) {
      var clave = claveDe(m), nombre = nombreDe(m);
      var propia = !m.esAdmin && !!miCorreo && clave === miCorreo;
      var razon = __('Para no quedarte sin acceso a los ajustes, que lo haga otro administrador.');
      var items = [];
      if (!m.esAdmin && a.administradores.indexOf(clave) !== -1) {
        items.push({ texto: __('Quitar de administrador'), bloqueada: propia, razon: razon, fn: function () {
          cambiarEquipo(a.emails, sinCorreo(a.administradores, clave), sprintf(/* translators: %s: nombre o correo de la persona */ __('%s ya no es administrador del cancionero'), nombre), clave);
        } });
      } else if (!m.esAdmin && !m.esGestor) {
        items.push({ texto: __('Hacer administrador'), fn: function () {
          cambiarEquipo(conCorreo(a.emails, clave), conCorreo(a.administradores, clave), sprintf(/* translators: %s: nombre o correo de la persona */ __('%s es administrador del cancionero'), nombre), clave);
        } });
      }
      if (m.enLista) {
        items.push({ texto: __('Quitar del equipo'), peligro: true, bloqueada: propia, razon: razon, fn: function () {
          if (!window.confirm(sprintf(/* translators: %s: nombre o correo de la persona */ __('¿Quitar a %s del equipo? Perderá el acceso al cancionero.'), nombre))) { return; }
          cambiarEquipo(sinCorreo(a.emails, clave), sinCorreo(a.administradores, clave), sprintf(/* translators: %s: nombre o correo de la persona */ __('%s ya no está en el equipo'), nombre), clave);
        } });
      } else {
        items.push({ texto: __('Añadir a la lista'), fn: function () {
          cambiarEquipo(conCorreo(a.emails, clave), a.administradores, sprintf(/* translators: %s: nombre o correo de la persona */ __('%s se ha añadido a la lista'), nombre), clave);
        } });
      }
      return items;
    }

    /** Botón «Opciones» con su menú, para una persona. */
    function crearOpciones(m) {
      var nombre = nombreDe(m);
      var boton = h('button', {
        type: 'button', class: 'pcan-btn pcan-btn-sm pcan-opciones-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
        'aria-label': sprintf(/* translators: %s: nombre o correo de la persona */ __('Opciones de %s'), nombre)
      }, icono('puntos'), __('Opciones'));
      boton.disabled = enCurso;
      var menu = h('div', { class: 'pcan-opciones-menu', role: 'menu', hidden: true, 'aria-label': sprintf(/* translators: %s: nombre o correo de la persona */ __('Opciones de %s'), nombre) },
        opcionesDe(m).map(function (it) {
          return h('button', {
            type: 'button', role: 'menuitem', tabindex: '-1', 'aria-disabled': it.bloqueada ? 'true' : null,
            class: 'pcan-opciones-item' + (it.peligro ? ' is-danger' : '') + (it.bloqueada ? ' is-bloqueada' : ''),
            onclick: function () {
              if (it.bloqueada) { return; }
              cerrarOpciones();
              it.fn();
            }
          }, h('span', { text: it.texto }), it.bloqueada ? h('small', { text: it.razon }) : null);
        }));
      var envoltorio = h('span', { class: 'pcan-opciones' }, boton, menu);
      var o = { envoltorio: envoltorio, boton: boton, menu: menu };
      boton.addEventListener('click', function () {
        if (menuAbierto === o) { cerrarOpciones(); } else { abrirOpciones(o); }
      });
      boton.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' && menuAbierto !== o) { e.preventDefault(); abrirOpciones(o); }
      });
      return o;
    }

    function filaMiembro(m) {
      var clave = claveDe(m), nombre = nombreDe(m);
      var cb = m.puedeBienvenida ? h('input', { type: 'checkbox', 'aria-label': sprintf(/* translators: %s: nombre o correo de la persona */ __('Enviar la bienvenida a %s'), nombre), onchange: function () {
        elegidos[clave] = cb.checked;
        sincronizarBienvenida();
      } }) : null;
      var fila = { m: m, clave: clave, cb: cb, enviada: h('small', { class: 'pcan-miembro-bienv' }), opciones: crearOpciones(m) };
      pintarEnviada(fila);
      filas.push(fila);
      return h('li', null,
        // Quien no puede recibirla no lleva casilla, pero deja el hueco para que todo quede alineado.
        cb ? h('label', { class: 'pcan-miembro-sel' }, cb) : h('span', { class: 'pcan-miembro-sel', 'aria-hidden': 'true' }),
        h('span', { class: 'pcan-avatar is-sm', 'aria-hidden': 'true' }, iniciales(nombre)),
        h('span', { class: 'pcan-miembro-main' }, h('strong', { text: nombre }), m.nombre ? h('span', { text: m.email }) : null, fila.enviada),
        // En el móvil el estado y las opciones bajan bajo el nombre; en pantallas anchas van en la misma línea.
        h('span', { class: 'pcan-miembro-pie' },
          m.esGestor && !m.esAdmin ? h('span', { class: 'pcan-estado is-ok', title: __('Puede cambiar los ajustes, gestionar el equipo y borrar canciones'), text: __('Administrador') }) : null,
          m.esAdmin
            ? h('span', { class: 'pcan-estado is-warn', title: __('Las cuentas de administración no reciben enlaces por correo'), text: __('Administración · entra con contraseña') })
            : h('span', { class: 'pcan-estado' + (m.haEntrado ? ' is-ok' : ''), text: m.haEntrado ? __('Ha entrado') : m.enLista ? __('Pendiente') : __('Fuera de la lista') }),
          fila.opciones.envoltorio));
    }

    var miembros = h('ul', { class: 'pcan-miembros' });
    var avisoAdmin = h('p', { class: 'pcan-aviso-admin', hidden: true }, icono('aviso'), __('Los correos marcados son de cuentas de administración: no reciben enlaces por seguridad y entran con usuario y contraseña. Para probar el enlace, usa otro correo.'));
    var fBuscar = h('input', {
      type: 'search', class: 'pcan-input', placeholder: __('Buscar en el equipo'), 'aria-label': __('Buscar en el equipo'),
      autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search',
      oninput: function () { pintarLista(); },
      // Intro aquí no debe enviar el formulario de los ajustes.
      onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); } }
    });

    function conCasilla() { return a.miembros.filter(function (m) { return m.puedeBienvenida; }); }
    function marcados() { return conCasilla().filter(function (m) { return elegidos[claveDe(m)]; }); }
    function filasConCasilla() { return filas.filter(function (f) { return f.cb; }); }

    /** Pasa el foco al botón «Opciones» de esa persona (correo en minúsculas) o, si ya no está en la lista, a «Añadir personas». */
    function enfocarPersona(clave) {
      var f = filas.filter(function (x) { return x.clave === clave; })[0];
      (f ? f.opciones.boton : bAnadir).focus({ preventScroll: true });
    }

    /** Vuelve a pintar la lista con los miembros actuales y la búsqueda; con `foco` (un correo, o '') además mueve el foco. */
    function pintarLista(foco) {
      cerrarOpciones();
      var q = norm(fBuscar.value);
      var visibles = !q ? a.miembros : a.miembros.filter(function (m) { return norm((m.nombre || '') + ' ' + m.email).indexOf(q) !== -1; });
      // La selección para la bienvenida solo vale para lo que se ve: lo que la búsqueda oculta deja de estar elegido.
      var vistos = {};
      visibles.forEach(function (m) { vistos[claveDe(m)] = true; });
      Object.keys(elegidos).forEach(function (k) { if (!vistos[k]) { delete elegidos[k]; } });
      filas = [];
      miembros.innerHTML = '';
      if (!a.miembros.length) { append(miembros, h('li', { class: 'pcan-muted', text: __('Aún no hay nadie en la lista.') })); }
      else if (!visibles.length) { append(miembros, h('li', { class: 'pcan-muted', text: __('Nadie coincide con la búsqueda.') })); }
      else { visibles.forEach(function (m) { append(miembros, filaMiembro(m)); }); }
      barraBienv.hidden = !conCasilla().length;
      avisoAdmin.hidden = !a.miembros.some(function (m) { return m.esAdmin; });
      sincronizarBienvenida();
      if (foco !== undefined) { enfocarPersona(foco); }
    }

    // Barra sobre la lista: elegir a quién enviar (o reenviar) la bienvenida.
    var bTodos = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () {
      elegidos = {};
      filasConCasilla().forEach(function (f) { elegidos[f.clave] = true; });
      sincronizarBienvenida();
    } }, __('Seleccionar todos'));
    var bSinEntrar = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () {
      elegidos = {};
      filasConCasilla().forEach(function (f) { if (!f.m.haEntrado) { elegidos[f.clave] = true; } });
      sincronizarBienvenida();
    } }, __('Seleccionar quien no ha entrado'));
    var bQuitar = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () {
      elegidos = {};
      sincronizarBienvenida();
    } }, __('Quitar la selección'));
    var bEnviar = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-primary', onclick: function () { enviarElegidos(); } });
    var barraBienv = h('div', { class: 'pcan-bienv-barra', hidden: true }, bTodos, bQuitar, bSinEntrar, bEnviar);

    /** Pone al día casillas y botones según la selección y si hay algo en curso. */
    function sincronizarBienvenida() {
      var vis = filasConCasilla(), n = marcados().length;
      vis.forEach(function (f) { f.cb.checked = !!elegidos[f.clave]; f.cb.disabled = enCurso; });
      bTodos.disabled = enCurso || !vis.length || vis.every(function (f) { return elegidos[f.clave]; });
      bSinEntrar.disabled = enCurso || !vis.some(function (f) { return !f.m.haEntrado; });
      bQuitar.disabled = enCurso || !n;
      bEnviar.disabled = enCurso || !n;
      bEnviar.textContent = sprintf(_n('Enviar la bienvenida a %d persona', 'Enviar la bienvenida a %d personas', n), n);
    }

    /** Anota la fecha de la bienvenida en quienes la recibieron (sin volver a pintar toda la lista). */
    function marcarEnviadas(res) {
      var ahora = res.momento || Math.floor(Date.now() / 1000), recibida = {};
      res.enviados.forEach(function (e) { recibida[String(e).toLowerCase()] = true; });
      a.miembros.forEach(function (m) { if (recibida[claveDe(m)]) { m.bienvenida = ahora; } });
      filas.forEach(function (f) { if (recibida[f.clave]) { pintarEnviada(f); } });
    }

    function enviarElegidos() {
      var emails = marcados().map(function (m) { return m.email; });
      if (enCurso || !emails.length) { return; }
      if (!window.confirm(sprintf(_n('¿Enviar la bienvenida a %d persona?', '¿Enviar la bienvenida a %d personas?', emails.length), emails.length))) { return; }
      mostrarResultado('');
      enviarConProgreso(emails).then(function (res) {
        marcarEnviadas(res);
        // La selección se quita; si el envío se interrumpió, quedan marcadas las que no llegaron a intentarse para poder repetir.
        elegidos = {};
        res.sinEnviar.forEach(function (e) { elegidos[String(e).toLowerCase()] = true; });
        sincronizarBienvenida();
        var texto = resumenBienvenida(res), fallos = bienvenidaConFallos(res);
        mostrarResultado(texto, fallos);
        aviso(texto, fallos ? 'error' : undefined, fallos ? 9000 : undefined);
      });
    }

    /** Guarda al momento las listas del equipo (solo ellas; el resto de ajustes sigue en «Guardar ajustes»). La respuesta
     *  trae los miembros ya recalculados. Devuelve la respuesta, o null si falló (ya avisado). */
    function guardarEquipo(emails, administradores, enError) {
      if (enCurso) { return Promise.resolve(null); }
      enCurso = true;
      bloquear();
      return api('ajustes', { json: { emails: emails, administradores: administradores, pagina: paginaActual() } }).then(function (r) {
        a.emails = r.emails || emails;
        a.administradores = r.administradores || administradores;
        a.miembros = r.miembros || a.miembros;
        return r;
      }).catch(function (err) {
        aviso(err.message, 'error', 9000);
        mostrarResultado(err.message, true);
        if (enError) { enError(err); }
        return null;
      }).then(function (r) {
        enCurso = false;
        bloquear();
        return r;
      });
    }

    /** Tras guardar: repinta la lista, envía (con progreso) la bienvenida a quien entra ahora y avisa del resultado. */
    function terminarCambio(r, texto, foco) {
      if (!r) { return; }
      var pendientes = r.bienvenidaPendiente || [];
      // Con la bienvenida en marcha los botones están bloqueados (no pueden tener el foco): se enfoca al terminar.
      pintarLista(pendientes.length ? undefined : foco);
      if (!pendientes.length) {
        mostrarResultado(texto);
        aviso(texto);
        return;
      }
      return enviarConProgreso(pendientes).then(function (res) {
        marcarEnviadas(res);
        enfocarPersona(foco);
        var fallos = bienvenidaConFallos(res), completo = texto + ' · ' + resumenBienvenida(res);
        mostrarResultado(completo, fallos);
        aviso(completo, fallos ? 'error' : undefined, fallos ? 9000 : undefined);
      });
    }

    function cambiarEquipo(emails, administradores, texto, foco) {
      mostrarResultado('');
      return guardarEquipo(emails, administradores).then(function (r) { return terminarCambio(r, texto, foco); });
    }

    // Añadir personas: formulario en línea.
    var fNuevos = h('textarea', { class: 'pcan-input pcan-textarea', rows: '4', placeholder: __('Un correo por línea'), spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off',
      oninput: function () { errorNuevos(''); } });
    var errorAnadir = h('p', { class: 'pcan-form-error', role: 'alert', hidden: true });
    var notaAnadir = h('p', { class: 'pcan-help pcan-anadir-nota' });
    var bConfirmarAnadir = h('button', { type: 'button', class: 'pcan-btn pcan-btn-primary', onclick: function () { anadirPersonas(); } }, __('Añadir'));
    var bCancelarAnadir = h('button', { type: 'button', class: 'pcan-btn', onclick: function () {
      fNuevos.value = '';
      alternarAnadir(false);
      bAnadir.focus();
    } }, __('Cancelar'));
    var cajaAnadir = h('div', { class: 'pcan-anadir', id: 'pcan-aj-anadir', hidden: true },
      campo(__('Correos'), fNuevos, __('Uno o varios: uno por línea, o pega una lista (se separan por espacios, comas, puntos y comas o saltos de línea).')),
      errorAnadir,
      h('div', { class: 'pcan-actions' }, bConfirmarAnadir, bCancelarAnadir),
      notaAnadir);
    var bAnadir = h('button', { type: 'button', class: 'pcan-btn pcan-btn-primary', 'aria-expanded': 'false', 'aria-controls': 'pcan-aj-anadir', onclick: function () { alternarAnadir(); } },
      icono('mas'), __('Añadir personas'));

    // Aviso de «correos escritos sin añadir» que sale en la barra de guardar al pulsar «Guardar ajustes»: se quita en cuanto se resuelve.
    var avisoSinAnadir = false;
    function errorNuevos(texto) {
      if (!texto && avisoSinAnadir) { avisoSinAnadir = false; errorBox.hidden = true; }
      errorAnadir.textContent = texto;
      errorAnadir.hidden = !texto;
      fNuevos.classList.toggle('is-invalid', !!texto);
      if (texto) { fNuevos.setAttribute('aria-invalid', 'true'); } else { fNuevos.removeAttribute('aria-invalid'); }
    }

    // Lo que pasará con la bienvenida: la decide el servidor con el ajuste ya guardado, no con la casilla sin guardar.
    function actualizarNotaAnadir() {
      var guardada = !!a.bienvenidaAuto;
      notaAnadir.textContent = (guardada ? __('Les llegará el correo de bienvenida.') : __('La bienvenida automática está desactivada (puedes enviarla después desde la lista).')) +
        (fBienvAuto.checked !== guardada ? ' ' + __('La casilla de bienvenida de más abajo tiene un cambio sin guardar: hasta que guardes los ajustes se aplica lo anterior.') : '');
    }

    function alternarAnadir(abrir) {
      var mostrar = abrir === undefined ? cajaAnadir.hidden : abrir;
      cajaAnadir.hidden = !mostrar;
      bAnadir.setAttribute('aria-expanded', mostrar ? 'true' : 'false');
      if (!mostrar) { errorNuevos(''); return; }
      actualizarNotaAnadir();
      fNuevos.focus();
    }

    function anadirPersonas() {
      if (enCurso) { return; }
      var escritos = [];
      fNuevos.value.split(/[\s,;]+/).filter(Boolean).forEach(function (e) {
        e = e.toLowerCase();
        if (escritos.indexOf(e) === -1) { escritos.push(e); }
      });
      if (!escritos.length) { errorNuevos(__('Escribe al menos un correo.')); fNuevos.focus(); return; }
      var malos = escritos.filter(function (e) { return !CORREO_VALIDO.test(e); });
      if (malos.length) {
        errorNuevos(sprintf(/* translators: 1: número de correos, 2: lista de correos */ _n('Este correo no es válido: %2$s. No se ha añadido a nadie.', 'Estos correos no son válidos: %2$s. No se ha añadido a nadie.', malos.length), malos.length, malos.join(', ')));
        fNuevos.focus();
        return;
      }
      var nuevos = escritos.filter(function (e) { return a.emails.indexOf(e) === -1; });
      var repetidos = escritos.filter(function (e) { return a.emails.indexOf(e) !== -1; });
      var notaRepetidos = repetidos.length ? sprintf(/* translators: 1: número de correos, 2: lista de correos */ _n('Ya estaba en el equipo: %2$s', 'Ya estaban en el equipo: %2$s', repetidos.length), repetidos.length, repetidos.join(', ')) : '';
      if (!nuevos.length) { errorNuevos(notaRepetidos); fNuevos.focus(); return; }
      errorNuevos('');
      mostrarResultado('');
      guardarEquipo(a.emails.concat(nuevos), a.administradores, function (err) { errorNuevos(err.message); }).then(function (r) {
        if (!r) { return; }
        var anadidos = nuevos.filter(function (e) { return r.emails.indexOf(e) !== -1; });
        fNuevos.value = '';
        alternarAnadir(false);
        return terminarCambio(r, sprintf(_n('%d persona añadida', '%d personas añadidas', anadidos.length), anadidos.length) + (notaRepetidos ? ' · ' + notaRepetidos : ''), '');
      });
    }
    fBienvAuto.addEventListener('change', actualizarNotaAnadir);

    var bloqueMiembros = h('div', { class: 'pcan-miembros-bloque' },
      h('div', { class: 'pcan-equipo-herramientas' }, bAnadir, fBuscar),
      cajaAnadir, barraBienv, resultadoEnvio, miembros);
    // Lo que se hace aquí (casillas, búsqueda, añadir personas) no son cambios de los ajustes: no deben contar como «cambios sin guardar».
    bloqueMiembros.addEventListener('input', function (e) { e.stopPropagation(); });
    bloqueMiembros.addEventListener('change', function (e) { e.stopPropagation(); });
    pintarLista();

    // Protección de los archivos: comprueba que el servidor no los entrega sin sesión y mueve los antiguos a la carpeta privada.
    var cajaProteccion = h('div', { class: 'pcan-huerfanos' }, h('p', { class: 'pcan-help', text: __('Comprobando la protección de los archivos…') }));
    cajaProteccion.addEventListener('input', function (e) { e.stopPropagation(); });
    cajaProteccion.addEventListener('change', function (e) { e.stopPropagation(); });
    function pintarProteccion(r) {
      cajaProteccion.innerHTML = '';
      var regla = 'location ^~ /wp-content/uploads/cancionero-privado/ { deny all; }';
      var estado = r.proteccion === 'protegido'
        ? h('p', { class: 'pcan-help', text: __('La carpeta de archivos privados está protegida: solo se entregan a quien ha iniciado sesión.') })
        : r.proteccion === 'expuesto'
          ? h('div', { class: 'pcan-form-error', role: 'alert' },
            h('strong', { text: __('Tu servidor entrega los archivos privados sin pedir sesión.') + ' ' }),
            conNodo(/* translators: %s: regla de configuración de Nginx */ __('Si usas Nginx, añade esta regla a la configuración del sitio y recarga el servidor: %s. En Apache, comprueba que se permiten los archivos .htaccess (AllowOverride).'), h('code', { text: regla })))
          : h('p', { class: 'pcan-help', text: __('No se pudo comprobar la protección desde el servidor. Prueba a abrir una partitura en una ventana privada sin sesión: debe dar error.') });
      var pendientes = r.pendientes || 0;
      var progreso = h('p', { class: 'pcan-help', hidden: true });
      var boton = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-primary' },
        icono('subir'), pendientes ? sprintf(_n('Proteger %d archivo existente', 'Proteger %d archivos existentes', pendientes), pendientes) : __('Proteger archivos existentes'));
      boton.disabled = !pendientes;
      boton.addEventListener('click', function () {
        boton.disabled = true;
        var total = pendientes, movidos = 0, fallos = [];
        progreso.hidden = false;
        (function tanda() {
          progreso.textContent = sprintf(/* translators: 1: archivos movidos, 2: total de archivos */ __('Moviendo archivos… %1$d de %2$d'), movidos, total);
          api('archivos/proteger', { json: {} }).then(function (res) {
            movidos += res.movidos;
            fallos = fallos.concat(res.fallos || []);
            if (res.restantes > 0 && res.movidos > 0) { tanda(); return; }
            progreso.textContent = sprintf(_n('%d archivo protegido', '%d archivos protegidos', movidos), movidos) +
              (fallos.length ? ' · ' + sprintf(/* translators: 1: número de archivos, 2: lista de archivos con su motivo */ __('%1$d no se pudieron mover: %2$s'), fallos.length, fallos.slice(0, 5).map(function (f) { return f.archivo + ' (' + f.motivo + ')'; }).join('; ')) : '.');
            aviso(sprintf(_n('%d archivo protegido', '%d archivos protegidos', movidos), movidos), fallos.length ? 'error' : undefined);
            api('archivos/estado').then(pintarProteccion);
          }).catch(function (err) {
            progreso.textContent = sprintf(/* translators: %s: motivo del error */ __('Se interrumpió: %s Vuelve a pulsar el botón para continuar.'), err.message);
            boton.disabled = false;
          });
        })();
      });
      append(cajaProteccion, [estado,
        h('p', { class: 'pcan-help', text: pendientes
          ? sprintf(_n('Hay %d archivo subido antes de esta versión que todavía se puede abrir con su dirección directa. Muévelo a la carpeta privada (se hace por tandas; los enlaces directos antiguos dejarán de funcionar).', 'Hay %d archivos subidos antes de esta versión que todavía se pueden abrir con su dirección directa. Muévelos a la carpeta privada (se hace por tandas; los enlaces directos antiguos dejarán de funcionar).', pendientes), pendientes)
          : __('Todos los archivos del cancionero están en la carpeta privada.') }),
        h('div', { class: 'pcan-actions' }, boton), progreso]);
    }
    function cargarProteccion() {
      api('archivos/estado').then(pintarProteccion).catch(function (e) {
        cajaProteccion.innerHTML = '';
        append(cajaProteccion, h('p', { class: 'pcan-form-error', text: e.message }));
      });
    }

    // Archivos sin usar: partituras y audios que ya no tiene ninguna canción.
    var cajaHuerfanos = h('div', { class: 'pcan-huerfanos' }, h('p', { class: 'pcan-help', text: __('Buscando archivos sin usar…') }));
    // Marcar casillas aquí no son cambios de los ajustes: no deben pedir confirmación al cerrar.
    cajaHuerfanos.addEventListener('input', function (e) { e.stopPropagation(); });
    cajaHuerfanos.addEventListener('change', function (e) { e.stopPropagation(); });
    function pintarHuerfanos(r) {
      var archivos = r.archivos || [];
      var marcados = {};
      archivos.forEach(function (f) { marcados[f.id] = true; });
      cajaHuerfanos.innerHTML = '';
      var papelera = r.enPapelera ? h('p', { class: 'pcan-help', text: sprintf(_n('%d archivo es de una canción que está en la papelera: se conserva por si se recupera y aparecerá aquí cuando la papelera se vacíe.', '%d archivos son de canciones que están en la papelera: se conservan por si se recuperan y aparecerán aquí cuando la papelera se vacíe.', r.enPapelera), r.enPapelera) }) : null;
      if (!archivos.length) {
        append(cajaHuerfanos, [h('p', { class: 'pcan-help', text: __('No hay archivos sin usar: todas las partituras, audios y editables pertenecen a alguna canción.') }), papelera]);
        return;
      }
      var boton = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-danger' });
      var confirmar = h('div', { class: 'pcan-confirmar', role: 'alert', hidden: true });
      function seleccion() { return archivos.filter(function (f) { return marcados[f.id]; }); }
      function actualizar() {
        var sel = seleccion(), bytes = sel.reduce(function (s, f) { return s + f.tamano; }, 0);
        boton.innerHTML = '';
        append(boton, [icono('borrar'), sel.length ? sprintf(/* translators: 1: número de archivos, 2: tamaño total */ _n('Borrar %1$d archivo (%2$s)', 'Borrar %1$d archivos (%2$s)', sel.length), sel.length, tamano(bytes)) : __('Marca los archivos que quieras borrar')]);
        boton.disabled = !sel.length;
        confirmar.hidden = true;
      }
      boton.addEventListener('click', function () {
        var sel = seleccion();
        confirmar.innerHTML = '';
        append(confirmar, [
          h('span', { text: sprintf(_n('Se borrará %d archivo del servidor. No se puede deshacer.', 'Se borrarán %d archivos del servidor. No se puede deshacer.', sel.length), sel.length) }),
          h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-primary', onclick: function (e) {
            e.currentTarget.disabled = true;
            api('huerfanos', { json: { ids: sel.map(function (f) { return f.id; }) } }).then(function (res) {
              aviso(sprintf(_n('%d archivo borrado', '%d archivos borrados', res.borrados), res.borrados) + ' · ' + sprintf(/* translators: %s: espacio liberado (p. ej. 3 MB) */ __('%s liberados'), tamano(res.liberado)));
              pintarHuerfanos(res);
            }).catch(function (err) { aviso(err.message, 'error'); actualizar(); });
          } }, __('Sí, borrar')),
          h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () { confirmar.hidden = true; } }, __('Cancelar'))]);
        confirmar.hidden = false;
      });
      var total = archivos.reduce(function (s, f) { return s + f.tamano; }, 0);
      append(cajaHuerfanos, [
        h('p', { class: 'pcan-help', text: sprintf(/* translators: 1: número de archivos, 2: tamaño total */ _n('Ninguna canción usa este archivo · %2$s en total.', 'Ninguna canción usa estos %1$d archivos · %2$s en total.', archivos.length), archivos.length, tamano(total)) }),
        h('ul', { class: 'pcan-huerfanos-lista' }, archivos.map(function (f) {
          return h('li', { class: 'pcan-huerfano' },
            h('input', { type: 'checkbox', checked: true, 'aria-label': sprintf(/* translators: %s: nombre del archivo */ __('Borrar %s'), f.archivo), onchange: function (e) { marcados[f.id] = e.target.checked; actualizar(); } }),
            icono(f.tipo === 'audio' || f.tipo === 'editable' ? f.tipo : 'partitura'),
            h('span', null, h('a', { href: f.url, target: '_blank', rel: 'noopener', text: f.archivo }),
              h('small', { text: [tamano(f.tamano), fechaCorta(f.fecha), f.cancion ? sprintf(/* translators: %s: título de la canción a la que pertenecía el archivo */ __('era de «%s»'), f.cancion) : ''].filter(Boolean).join(' · ') })));
        })),
        h('div', { class: 'pcan-actions' }, boton), confirmar, papelera]);
      actualizar();
    }
    function cargarHuerfanos() {
      api('huerfanos').then(pintarHuerfanos).catch(function (e) {
        cajaHuerfanos.innerHTML = '';
        append(cajaHuerfanos, h('p', { class: 'pcan-form-error', text: e.message }));
      });
    }

    // Secciones: General, Equipo, Escaleta y Google son un solo formulario con un único «Guardar ajustes»;
    // Accesos, Archivos, Papelera y Copias de seguridad tienen sus propias acciones y no muestran «Guardar».
    var SEC_FORMULARIO = { general: true, equipo: true, escaleta: true, google: true };
    var etiquetas = {
      general: [__('General'), 'ajustes'], equipo: [__('Equipo'), 'equipo'], accesos: [__('Accesos'), 'grafica'], escaleta: [__('Escaleta'), 'lista'], google: [__('Acceso con Google'), 'acceso'],
      archivos: [__('Archivos'), 'partitura'], papelera: [__('Papelera'), 'borrar'], copias: [__('Copias de seguridad'), 'descargar']
    };
    var cuerpoPapelera = h('div', { class: 'pcan-form' });
    var cuerpoAccesos = h('div', { class: 'pcan-accesos' });
    // Pulsar aquí no son cambios de los ajustes: no deben pedir confirmación al cerrar.
    cuerpoAccesos.addEventListener('input', function (e) { e.stopPropagation(); });
    cuerpoAccesos.addEventListener('change', function (e) { e.stopPropagation(); });
    var cuerpoCopias = h('div', { class: 'pcan-ajustes-copias' });
    // Lo que cada sección pide al servidor, solo la primera vez que se abre.
    var cargadores = {
      accesos: function () { pintarAccesos(cuerpoAccesos); },
      archivos: function () { cargarProteccion(); cargarHuerfanos(); },
      papelera: function () { pintarPapelera(cuerpoPapelera); },
      copias: function () { pintarCopias(cuerpoCopias); }
    };
    var cargadas = {};

    var contenido = {
      general: [
        h('fieldset', { class: 'pcan-fieldset' },
          h('legend', { text: __('General') }),
          campo(__('Nombre del cancionero'), fNombre, __('Se muestra arriba a la izquierda y en la pantalla de acceso. Por ejemplo: «Cancionero de la iglesia».')),
          campo(__('Línea bajo el nombre'), fSubtitulo, __('Texto pequeño debajo del nombre. Por defecto es el nombre de la web; déjalo vacío para no mostrar nada.'))),
        h('fieldset', { class: 'pcan-fieldset' },
          h('legend', { text: __('Apariencia') }),
          campo(__('Tema por defecto'), fTema, __('Para quien aún no ha elegido tema. Cada persona puede cambiarlo en su menú.'))),
        h('fieldset', { class: 'pcan-fieldset' },
          h('legend', { text: __('Papelera') }),
          campo(__('Días que se conservan las canciones borradas'), fPapelera, __('Pasado este plazo se eliminan solas, con sus partituras y audios. Pon 0 para no eliminarlas nunca automáticamente.')),
          h('label', { class: 'pcan-copia-opcion' }, fAvisoBorrado,
            h('span', null,
              h('strong', { text: __('Avisar por correo cuando alguien borre una canción') }),
              h('small', { text: sprintf(/* translators: %s: correo de administración de la web */ __('Les llega a los administradores del cancionero y al correo de administración de la web (%s), con la canción, sus archivos, quién la borró y cuándo. Los borrados seguidos llegan juntos en un solo correo, un minuto después.'), a.correoAdmin || '') }))))],
      equipo: [
        h('fieldset', { class: 'pcan-fieldset' },
          h('legend', { text: __('Equipo') }),
          h('p', { class: 'pcan-help', text: __('Cada persona entra con un enlace que recibe en su correo (o con Google, si lo configuras) y quien sale de la lista pierde el acceso. Los administradores pueden cambiar los ajustes, gestionar el equipo y borrar canciones.') }),
          bloqueMiembros,
          avisoAdmin,
          h('div', { class: 'pcan-actions' },
            h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function (e) {
              var b = e.currentTarget;
              b.disabled = true;
              api('correo-prueba', { json: {} })
                .then(function (r) { aviso(sprintf(/* translators: %s: dirección de correo */ __('Correo de prueba enviado a %s'), r.destino)); })
                .catch(function (err) { aviso(err.message, 'error'); })
                .then(function () { b.disabled = false; });
            } }, icono('enlace'), __('Enviarme un correo de prueba')),
            h('span', { class: 'pcan-help', text: __('Comprueba que el servidor puede enviar los enlaces de acceso.') }))),
        h('fieldset', { class: 'pcan-fieldset' },
          h('legend', { text: __('Correo de bienvenida') }),
          h('label', { class: 'pcan-copia-opcion' }, fBienvAuto,
            h('span', null,
              h('strong', { text: __('Enviar un correo de bienvenida a quien se añada a la lista') }),
              h('small', { text: __('Le llega el logo del cancionero, un botón para abrirlo y cómo entrar.') }))),
          campo(__('Texto añadido a la bienvenida (opcional)'), fBienvTexto, __('Aparece en el correo debajo de las instrucciones. Por ejemplo, dónde encontrar el cancionero en vuestra web.')),
          h('div', { class: 'pcan-actions' },
            h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function (e) {
              var b = e.currentTarget;
              b.disabled = true;
              api('bienvenida', { json: { prueba: true, pagina: paginaActual(), bienvenidaTexto: fBienvTexto.value } })
                .then(function (r) {
                  if ((r.enviados || []).length) {
                    // A una cuenta de administración el botón no le deja dentro (entra con contraseña): se avisa para no confundir.
                    aviso(sprintf(/* translators: %s: dirección de correo */ __('Bienvenida de prueba enviada a %s'), r.enviados[0]) +
                      (r.conEnlace === false ? ' · ' + __('Como tu cuenta es de administración, en tu correo el botón abre el cancionero sin iniciar sesión; al resto del equipo le deja dentro.') : ''),
                      undefined, r.conEnlace === false ? 9000 : undefined);
                  }
                  else { aviso(resumenBienvenida({ enviados: [], fallidos: r.fallidos || [], omitidos: r.omitidos || [], error: null }), 'error', 9000); }
                })
                .catch(function (err) { aviso(err.message, 'error'); })
                .then(function () { b.disabled = false; });
            } }, icono('enlace'), __('Enviarme una bienvenida de prueba')),
            h('span', { class: 'pcan-help', text: __('Te llega a ti, con el texto de arriba aunque aún no esté guardado.') }))),
        h('fieldset', { class: 'pcan-fieldset' },
          h('legend', { text: __('Acceso por dominio') }),
          campo(__('Dominio permitido'), fDominio, __('Opcional: cualquier cuenta de este dominio de Google Workspace podrá entrar.')))],
      google: [
        h('fieldset', { class: 'pcan-fieldset' },
          h('legend', { text: __('Acceso con Google (opcional)') }),
          campo(__('Client ID de Google'), fClient),
          h('details', { class: 'pcan-ayuda' },
            h('summary', { text: __('Cómo obtenerlo (5 minutos)') }),
            h('ol', null,
              h('li', null, conNodo(/* translators: %s: enlace «Google Cloud Console → Credenciales» */ __('Entra en %s con una cuenta de la iglesia.'), h('a', { href: 'https://console.cloud.google.com/apis/credentials', target: '_blank', rel: 'noopener', text: __('Google Cloud Console → Credenciales') }))),
              h('li', { text: __('Configura la «Pantalla de consentimiento de OAuth» (tipo Externo, nombre «Cancionero»).') }),
              h('li', { text: __('Crear credenciales → ID de cliente de OAuth → Aplicación web.') }),
              h('li', null, conNodo(/* translators: %s: dirección web de este sitio */ __('En «Orígenes de JavaScript autorizados» añade: %s'), h('code', { text: a.origen }))),
              h('li', { text: __('Copia el ID de cliente y pégalo aquí.') }))))],
      accesos: [cuerpoAccesos],
      escaleta: [imagenesEscaleta.nodo],
      archivos: [
        h('fieldset', { class: 'pcan-fieldset' },
          h('legend', { text: __('Protección de los archivos') }),
          cajaProteccion),
        h('fieldset', { class: 'pcan-fieldset' },
          h('legend', { text: __('Archivos sin usar') }),
          cajaHuerfanos)],
      papelera: [h('fieldset', { class: 'pcan-fieldset' }, h('legend', { text: __('Papelera') }), cuerpoPapelera)],
      copias: [cuerpoCopias]
    };

    var tabs = {}, secciones = {};
    var actual = null;
    function hashSeccion(id) { return '#/ajustes/' + id; }

    var lista = h('div', { class: 'pcan-ajustes-tabs', role: 'tablist', 'aria-label': __('Secciones de los ajustes') }, SECCIONES_AJUSTES.map(function (id) {
      tabs[id] = h('a', {
        class: 'pcan-ajustes-tab', role: 'tab', id: 'pcan-aj-t-' + id, href: hashSeccion(id), 'aria-controls': 'pcan-aj-p-' + id,
        onclick: function (e) { e.preventDefault(); ir(id); }
      }, icono(etiquetas[id][1]), h('span', { text: etiquetas[id][0] }));
      return tabs[id];
    }));
    // Flechas, Inicio y Fin recorren las secciones (se activan al enfocarlas).
    lista.addEventListener('keydown', function (e) {
      var n = SECCIONES_AJUSTES.length, i = SECCIONES_AJUSTES.indexOf(actual), nuevo = -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { nuevo = (i + 1) % n; }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { nuevo = (i + n - 1) % n; }
      else if (e.key === 'Home') { nuevo = 0; }
      else if (e.key === 'End') { nuevo = n - 1; }
      if (nuevo < 0) { return; }
      e.preventDefault();
      ir(SECCIONES_AJUSTES[nuevo]);
      tabs[SECCIONES_AJUSTES[nuevo]].focus();
    });

    // Barra fija de abajo: solo en las secciones del formulario. Avisa si hay cambios sin guardar.
    var estado = h('span', { class: 'pcan-ajustes-estado', role: 'status' });
    var barra = h('div', { class: 'pcan-ajustes-barra' },
      cajaProgreso, errorBox, estado,
      h('div', { class: 'pcan-ajustes-botones' }, cancelar, guardar));

    var zona = h('div', { class: 'pcan-ajustes-scroll' }, SECCIONES_AJUSTES.map(function (id) {
      secciones[id] = h('section', { class: 'pcan-ajustes-sec', id: 'pcan-aj-p-' + id, role: 'tabpanel', 'aria-labelledby': 'pcan-aj-t-' + id, hidden: true }, contenido[id]);
      return secciones[id];
    }));
    var form = h('form', { class: 'pcan-ajustes-main', novalidate: true }, zona, barra);

    function valores() {
      // La lista del equipo (correos y administradores) no está aquí: se guarda al momento desde la propia lista.
      return JSON.stringify([fNombre.value, fSubtitulo.value, fPapelera.value, fTema.value, fClient.value, fDominio.value, fBienvAuto.checked, fBienvTexto.value, fAvisoBorrado.checked, imagenesEscaleta.valor(true)]);
    }
    var inicial = valores();
    // El aviso de «cambios sin guardar» al cerrar lo da panelSucio; aquí se calcula comparando con lo cargado.
    function recalcularSucio() {
      var sucio = valores() !== inicial;
      panelSucio = sucio;
      estado.textContent = sucio ? __('Hay cambios sin guardar') : '';
      barra.classList.toggle('is-sucio', sucio);
    }
    function alCambiar(e) {
      e.stopPropagation();
      if (e.target.classList) { e.target.classList.remove('is-invalid'); }
      errorBox.hidden = true;
      recalcularSucio();
    }
    form.addEventListener('input', alCambiar);
    form.addEventListener('change', alCambiar);

    /** Lo que se envía de la escaleta: nada si no se han tocado las imágenes; si no, solo el logo y la cabecera ({id} o null).
     *  El servidor conserva el resto (secciones y títulos, que ya no se tocan desde aquí). */
    function escaletaParaGuardar() {
      var actual = imagenesEscaleta.valor(true);
      return JSON.stringify(actual) === escInicial ? undefined : actual;
    }

    /** Cambia de sección. La dirección cambia (para poder enlazarla) sin añadir entradas al historial:
     *  así «Atrás» cierra el panel en vez de recorrer cada sección. */
    function ir(id) {
      if (!tabs[id]) { id = 'general'; }
      actual = id;
      SECCIONES_AJUSTES.forEach(function (s) {
        var activa = s === id;
        tabs[s].setAttribute('aria-selected', activa ? 'true' : 'false');
        tabs[s].tabIndex = activa ? 0 : -1;
        tabs[s].classList.toggle('is-active', activa);
        secciones[s].hidden = !activa;
      });
      barra.hidden = !SEC_FORMULARIO[id];
      zona.scrollTop = 0;
      // En el móvil las pestañas se desplazan: la activa debe quedar a la vista.
      if (tabs[id].scrollIntoView) { tabs[id].scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      var destino = id === 'general' && location.hash === '#/ajustes' ? '#/ajustes' : hashSeccion(id);
      if (location.hash !== destino) {
        history.replaceState(history.state, '', location.pathname + location.search + destino);
        hashes[posicion] = destino;
      }
      if (cargadores[id] && !cargadas[id]) { cargadas[id] = true; cargadores[id](); }
    }

    // Un error del servidor sobre un campo lleva a su sección y lo enfoca.
    var CAMPOS_ERROR = { pieb_client: ['google', fClient] };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!SEC_FORMULARIO[actual]) { return; }
      if (enCurso) { return; }
      // Correos escritos en «Añadir personas» que aún no se han añadido: no se pierden en silencio al guardar.
      if (!cajaAnadir.hidden && fNuevos.value.trim()) {
        ir('equipo');
        errorBox.textContent = __('Hay correos escritos sin añadir. Pulsa «Añadir» o «Cancelar» en el formulario de añadir personas.');
        errorBox.hidden = false;
        avisoSinAnadir = true;
        fNuevos.focus();
        return;
      }
      if (imagenesEscaleta.subiendo()) {
        ir('escaleta');
        errorBox.textContent = __('Espera a que termine de subirse la imagen para guardar.');
        errorBox.hidden = false;
        return;
      }
      enCurso = true;
      bloquear();
      errorBox.hidden = true;
      // No envía `emails` ni `administradores`: esas listas se guardan al momento desde la lista del equipo y,
      // si fueran con lo que se cargó al abrir, pisarían esos cambios.
      var cuerpo = {
        nombre: fNombre.value.trim(),
        subtitulo: fSubtitulo.value.trim(),
        papeleraDias: parseInt(fPapelera.value, 10) || 0,
        temaDefecto: fTema.value,
        googleClientId: fClient.value.trim(),
        dominio: fDominio.value.trim(),
        bienvenidaAuto: fBienvAuto.checked,
        bienvenidaTexto: fBienvTexto.value.trim(),
        avisoBorrado: fAvisoBorrado.checked,
        pagina: paginaActual()
      };
      var escaleta = escaletaParaGuardar();
      if (escaleta !== undefined) { cuerpo.escaleta = escaleta; }
      api('ajustes', { json: cuerpo }).then(function () {
        panelSucio = false;
        aviso(__('Ajustes guardados'));
        cerrarPanel();
      }).catch(function (err) {
        enCurso = false;
        bloquear();
        errorBox.textContent = err.message;
        errorBox.hidden = false;
        var destino = CAMPOS_ERROR[err.codigo];
        if (destino) {
          ir(destino[0]);
          destino[1].classList.add('is-invalid');
          destino[1].focus();
        }
      });
    });

    var raiz = h('div', { class: 'pcan-panel-body pcan-ajustes' },
      h('div', { class: 'pcan-ajustes-nav' }, lista,
        h('p', { class: 'pcan-help pcan-ajustes-version', text: sprintf(/* translators: %s: número de versión del plugin */ __('Cancionero · versión %s'), a.version || CFG.version) })),
      form);
    abrirPanel([cabeceraPanel(h('h2', { text: __('Ajustes y equipo') })), raiz], __('Ajustes'), { modal: true, ancho: true });
    ajustesAbierto = {
      raiz: raiz,
      ir: ir,
      recargar: function (id) { if (cargadores[id]) { cargadas[id] = true; cargadores[id](); } }
    };
    alCerrarPanel.push(function () {
      cerrarOpciones();
      if (ajustesAbierto && ajustesAbierto.raiz === raiz) { ajustesAbierto = null; }
    });
    ir(seccionInicial);
  }

  // ---------------------------------------------------------------- accesos (responsables)

  // Los días son texto «AAAA-MM-DD»: se comparan como texto y se suman a mediodía para que el cambio de hora no los descuadre.
  function fechaDeTexto(iso) {
    var p = String(iso).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], 12);
  }

  function textoDeFecha(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function sumarDias(iso, n) {
    var d = fechaDeTexto(iso);
    d.setDate(d.getDate() + n);
    return textoDeFecha(d);
  }

  /** Día (en este navegador) de una marca de tiempo Unix. */
  function diaDeMarca(segundos) { return textoDeFecha(new Date(segundos * 1000)); }

  function mayuscula(texto) { return texto.charAt(0).toUpperCase() + texto.slice(1); }

  /** «hoy», «ayer», «hace 3 días»… (los mismos textos que las estadísticas de cultos), desde un día y el «hoy» del servidor. */
  function haceTanto(iso, hoy) {
    var d = Math.round((fechaDeTexto(hoy) - fechaDeTexto(iso)) / 86400000);
    if (d <= 0) { return _x('hoy', 'fecha relativa'); }
    if (d === 1) { return _x('ayer', 'fecha relativa'); }
    if (d < 14) { return sprintf(_n('hace %d día', 'hace %d días', d), d); }
    if (d < 60) { return sprintf(_n('hace %d semana', 'hace %d semanas', Math.round(d / 7)), Math.round(d / 7)); }
    return sprintf(_n('hace %d mes', 'hace %d meses', Math.round(d / 30)), Math.round(d / 30));
  }

  function nPersonas(n) { return sprintf(_n('%d persona', '%d personas', n), n); }
  function nInicios(n) { return sprintf(_n('%d inicio', '%d inicios', n), n); }
  function nDiasDeUso(n) { return sprintf(_n('%d día de uso', '%d días de uso', n), n); }

  function metodoAcceso(m) {
    return m === 'enlace' ? __('Enlace por correo') : m === 'google' ? 'Google' : m === 'contrasena' ? __('Usuario y contraseña') : '—';
  }

  function dispositivoAcceso(d) {
    return d === 'movil' ? __('Móvil') : d === 'tableta' ? __('Tableta') : d === 'ordenador' ? __('Ordenador') : '—';
  }

  /**
   * Completa a cada persona con lo que hace falta para las estadísticas: el día de cada inicio y su último acceso.
   * `nunca`: no ha entrado jamás. `sinRegistro`: entró antes de que existiera el registro (haEntrado, pero sin accesos ni días anotados).
   */
  function prepararAcceso(p) {
    var accesos = (p.accesos || []).slice().sort(function (a, b) { return b.t - a.t; });
    var dias = (p.dias || []).slice().sort().reverse();
    var ultT = Math.max(p.ultimoAcceso || 0, accesos.length ? accesos[0].t : 0);
    var ultimo = ultT ? diaDeMarca(ultT) : '';
    if (dias.length && dias[0] > ultimo) { ultimo = dias[0]; }
    var entro = !!p.haEntrado || !!ultimo;
    return {
      p: p, accesos: accesos, dias: dias, diasInicio: accesos.map(function (e) { return diaDeMarca(e.t); }),
      ultT: ultT, ultimo: ultimo, entro: entro, nunca: !entro, sinRegistro: entro && !ultimo,
      // Tiene acceso quien está en la lista o es administrador (de la web o del cancionero).
      acceso: !!(p.enLista || p.esAdmin || p.esGestor)
    };
  }

  /** Inicios de sesión y días de uso de una persona entre dos días (ambos incluidos). */
  function resumenAcceso(x, desde, hasta) {
    var enRango = function (d) { return d >= desde && d <= hasta; };
    return { inicios: x.diasInicio.filter(enRango).length, dias: x.dias.filter(enRango).length };
  }

  /** Tramos de la gráfica: por día (7 días), por semana de lunes a domingo (30 y 90 días) o por mes (12 meses), recortados al periodo. */
  function tramosAcceso(nDias, primero, hoy) {
    var tramos = [], c, fin, previo = '';
    var fmt = function (iso, opciones) { return sinPunto(fechaDeTexto(iso).toLocaleDateString(LOCALE, opciones)); };
    if (nDias <= 7) {
      for (c = primero; c <= hoy; c = sumarDias(c, 1)) {
        tramos.push({
          desde: c, hasta: c, principal: fmt(c, { weekday: 'short' }), secundaria: fmt(c, { day: 'numeric' }),
          largo: mayuscula(fmt(c, { weekday: 'long', day: 'numeric', month: 'long' }))
        });
      }
    } else if (nDias <= 90) {
      c = sumarDias(primero, -((fechaDeTexto(primero).getDay() + 6) % 7));
      while (c <= hoy) {
        fin = sumarDias(c, 6);
        tramos.push({
          desde: c < primero ? primero : c, hasta: fin > hoy ? hoy : fin, principal: fmt(c, { day: 'numeric' }),
          secundaria: c.slice(0, 7) !== previo ? fmt(c, { month: 'short' }) : '',
          largo: sprintf(/* translators: %s: fecha corta del lunes de esa semana («12 oct») */ __('Semana del %s'), fechaCorta(c))
        });
        previo = c.slice(0, 7);
        c = sumarDias(c, 7);
      }
    } else {
      c = primero.slice(0, 7) + '-01';
      while (c <= hoy) {
        var d = fechaDeTexto(c);
        fin = textoDeFecha(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
        tramos.push({
          desde: c < primero ? primero : c, hasta: fin > hoy ? hoy : fin, principal: fmt(c, { month: 'short' }),
          secundaria: !tramos.length || d.getMonth() === 0 ? String(d.getFullYear()) : '',
          largo: mayuscula(fmt(c, { month: 'long', year: 'numeric' }))
        });
        c = sumarDias(fin, 1);
      }
    }
    return tramos;
  }

  function kpiAcceso(etiqueta, valor, detalle) {
    return h('div', { class: 'pcan-kpi' },
      h('span', { class: 'pcan-kpi-label', text: etiqueta }),
      h('strong', { class: 'pcan-kpi-valor', text: valor }),
      detalle ? h('span', { class: 'pcan-kpi-detalle', text: detalle }) : null);
  }

  function tarjetaAcceso(titulo, subtitulo, contenido, clase) {
    return h('section', { class: 'pcan-stat-card' + (clase ? ' ' + clase : '') },
      h('header', { class: 'pcan-stat-head' }, h('h3', { text: titulo }), subtitulo ? h('p', { text: subtitulo }) : null),
      contenido);
  }

  /** Barras horizontales sin número de posición. filas: { titulo, valor, texto (lo que se lee a la derecha), detalle? }; `escala` es el valor que llena la barra. */
  function barrasAcceso(filas, escala) {
    return h('ol', { class: 'pcan-barras' }, filas.map(function (f) {
      var pct = f.valor && escala ? Math.max(3, Math.round(f.valor / escala * 100)) : 0;
      return h('li', null, h('div', { class: 'pcan-barra' },
        h('span', { class: 'pcan-barra-main' },
          h('span', { class: 'pcan-barra-texto' },
            h('span', { class: 'pcan-barra-titulo', text: f.titulo }),
            f.detalle ? h('span', { class: 'pcan-barra-detalle', text: f.detalle }) : null),
          h('span', { class: 'pcan-barra-pista', 'aria-hidden': 'true' }, h('span', { class: 'pcan-barra-relleno', style: 'width:' + pct + '%' }))),
        h('span', { class: 'pcan-barra-valor', text: f.texto })));
    }));
  }

  /** Columnas de personas activas por tramo, con su tabla equivalente. */
  function columnasAcceso(tramos, titulo, primeraColumna) {
    var max = tramos.reduce(function (m, t) { return Math.max(m, t.personas); }, 0);
    var grafica = h('div', { class: 'pcan-columnas is-doble', role: 'img', 'aria-label': titulo }, tramos.map(function (t) {
      var texto = sprintf(/* translators: 1: tramo («Semana del 12 oct»), 2: número de personas («3 personas»), 3: número de inicios de sesión («5 inicios») */ __('%1$s: %2$s · %3$s'), t.largo, nPersonas(t.personas), nInicios(t.inicios));
      return h('div', { class: 'pcan-columna', title: texto, tabindex: '0', 'aria-label': texto },
        h('span', { class: 'pcan-columna-valor', text: t.personas ? String(t.personas) : '' }),
        h('span', { class: 'pcan-columna-pista' }, h('span', { class: 'pcan-columna-barra' + (t.personas ? '' : ' is-cero'), style: 'height:' + (max ? Math.round(t.personas / max * 100) : 0) + '%' })),
        h('span', { class: 'pcan-columna-mes' }, t.principal, h('small', { text: t.secundaria })));
    }));
    var tabla = h('details', { class: 'pcan-tabla-ver' },
      h('summary', { text: __('Ver como tabla') }),
      h('table', { class: 'pcan-tabla' },
        h('thead', null, h('tr', null, h('th', { text: primeraColumna }), h('th', { text: __('Personas') }), h('th', { text: __('Inicios') }), h('th', { text: __('Días de uso') }))),
        h('tbody', null, tramos.map(function (t) {
          return h('tr', null, h('td', { text: t.largo }), h('td', { text: String(t.personas) }), h('td', { text: String(t.inicios) }), h('td', { text: String(t.dias) }));
        }))));
    return h('div', null, grafica, tabla);
  }

  /** Selector segmentado como el de las estadísticas. opciones: { id, texto, n? }; al elegir una llama a alElegir(id). */
  function selectorSegmentado(opciones, activo, etiqueta, alElegir) {
    var botones = opciones.map(function (o) {
      return h('button', { type: 'button', role: 'radio', class: 'pcan-seg', onclick: function () { marcar(o.id); alElegir(o.id); } },
        o.texto, o.n !== undefined ? h('span', { class: 'pcan-chip-n', text: String(o.n) }) : null);
    });
    function marcar(id) {
      opciones.forEach(function (o, i) {
        botones[i].classList.toggle('is-active', o.id === id);
        botones[i].setAttribute('aria-checked', o.id === id ? 'true' : 'false');
      });
    }
    marcar(activo);
    return h('div', { class: 'pcan-segment pcan-periodo', role: 'radiogroup', 'aria-label': etiqueta }, botones);
  }

  /** Pide los accesos y los pinta en `cuerpo`; si falla, enseña el error con un botón para reintentar. */
  function pintarAccesos(cuerpo) {
    cuerpo.innerHTML = '';
    append(cuerpo, h('p', { class: 'pcan-help', role: 'status', text: __('Cargando accesos…') }));
    api('accesos').then(function (a) { mostrarAccesos(cuerpo, a); }).catch(function (e) {
      cuerpo.innerHTML = '';
      append(cuerpo, [
        h('div', { class: 'pcan-form-error', role: 'alert', text: sprintf(/* translators: %s: motivo del error */ __('No se pudieron cargar los accesos: %s'), e.message) }),
        h('div', { class: 'pcan-actions' }, h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () { pintarAccesos(cuerpo); } }, __('Reintentar')))]);
    });
  }

  function mostrarAccesos(cuerpo, a) {
    cuerpo.innerHTML = '';
    var hoy = a.hoy;
    var notaIp = __('Se guardan los últimos 12 meses y no se anotan direcciones IP.');

    // Aún no se ha registrado nada: se explica en vez de enseñar ceros.
    if (!a.desde) {
      append(cuerpo, [
        h('div', { class: 'pcan-empty' },
          h('p', null, h('strong', { text: __('Todavía no hay accesos registrados') })),
          h('p', { text: __('Los inicios de sesión se empiezan a registrar a partir de ahora. Cuando alguien entre en el cancionero, aquí verás quién lo usa, cada cuánto y desde qué dispositivos.') })),
        h('p', { class: 'pcan-help pcan-accesos-nota', text: notaIp })]);
      return;
    }

    var personas = (a.personas || []).map(prepararAcceso);
    var registro = diaDeMarca(a.desde);
    var periodo = 30, filtro = 'todas';
    var abiertas = {};
    var zona = h('div', { class: 'pcan-accesos-zona' });

    var selector = selectorSegmentado([
      { id: 7, texto: __('7 días') }, { id: 30, texto: __('30 días') }, { id: 90, texto: __('90 días') }, { id: 365, texto: __('12 meses') }
    ], periodo, __('Periodo'), function (id) { periodo = id; pintarZona(); });
    append(cuerpo, [
      h('div', { class: 'pcan-accesos-cab' }, selector,
        h('p', { class: 'pcan-help pcan-accesos-nota', text: sprintf(/* translators: %s: fecha (p. ej. 30 oct 2026) */ __('Se registra desde el %s.'), fechaMarca(a.desde)) + ' ' + notaIp })),
      zona]);

    function pintarZona() {
      zona.innerHTML = '';
      var inicio = sumarDias(hoy, 1 - periodo);
      // Si el registro empezó dentro del periodo, no se dibujan los días anteriores.
      var primero = registro > inicio ? registro : inicio;
      var ps = personas.map(function (x) {
        var r = resumenAcceso(x, inicio, hoy);
        return { x: x, inicios: r.inicios, dias: r.dias, activa: r.inicios + r.dias > 0 };
      });
      var activas = ps.filter(function (r) { return r.activa; }).length;
      var inicios = ps.reduce(function (s, r) { return s + r.inicios; }, 0);
      var diasUso = ps.reduce(function (s, r) { return s + r.dias; }, 0);

      append(zona, h('div', { class: 'pcan-kpis' },
        kpiAcceso(__('Personas activas'), String(activas), sprintf(/* translators: %d: personas que tienen acceso al cancionero */ __('de %d con acceso'), personas.filter(function (x) { return x.acceso; }).length)),
        kpiAcceso(__('Inicios de sesión'), String(inicios), activas ? sprintf(/* translators: %s: número medio de inicios por persona, con un decimal («2,5») */ __('%s de media por persona activa'), (inicios / activas).toLocaleString(LOCALE, { maximumFractionDigits: 1 })) : null),
        kpiAcceso(__('Días de uso'), String(diasUso), __('Suma de días en que se abrió, por persona')),
        kpiAcceso(__('Nunca han entrado'), String(personas.filter(function (x) { return x.nunca && x.acceso; }).length), __('Personas con acceso que no han entrado jamás'))));

      // Gráfica de personas activas por tramo.
      var tramos = tramosAcceso(periodo, primero, hoy).map(function (t) {
        var activasT = 0, iniciosT = 0, diasT = 0;
        personas.forEach(function (x) {
          var r = resumenAcceso(x, t.desde, t.hasta);
          iniciosT += r.inicios;
          diasT += r.dias;
          if (r.inicios + r.dias) { activasT++; }
        });
        t.personas = activasT; t.inicios = iniciosT; t.dias = diasT;
        return t;
      });
      var titGrafica = periodo <= 7 ? __('Personas activas por día') : periodo <= 90 ? __('Personas activas por semana') : __('Personas activas por mes');
      var primeraColumna = periodo <= 7 ? __('Día') : periodo <= 90 ? __('Semana') : __('Mes');
      append(zona, tarjetaAcceso(titGrafica, __('Personas distintas que abrieron el cancionero'), columnasAcceso(tramos, titGrafica, primeraColumna)));

      // Cómo entran, desde dónde y qué días se usa.
      var metodos = { enlace: 0, google: 0, contrasena: 0 }, dispositivos = { movil: 0, tableta: 0, ordenador: 0 };
      var semana = [0, 0, 0, 0, 0, 0, 0];
      personas.forEach(function (x) {
        x.accesos.forEach(function (e, i) {
          var d = x.diasInicio[i];
          if (d < inicio || d > hoy) { return; }
          if (metodos[e.metodo] !== undefined) { metodos[e.metodo]++; }
          if (dispositivos[e.dispositivo] !== undefined) { dispositivos[e.dispositivo]++; }
        });
        x.dias.forEach(function (d) {
          if (d >= inicio && d <= hoy) { semana[(fechaDeTexto(d).getDay() + 6) % 7]++; }
        });
      });
      var sinDatos = function () { return h('p', { class: 'pcan-muted', text: __('Sin datos en este periodo.') }); };
      var reparto = function (claves, nombre, cuentas) {
        var total = claves.reduce(function (s, k) { return s + cuentas[k]; }, 0);
        return total ? barrasAcceso(claves.map(function (k) {
          return { titulo: nombre(k), valor: cuentas[k], texto: (cuentas[k] / total).toLocaleString(LOCALE, { style: 'percent', maximumFractionDigits: 0 }), detalle: nInicios(cuentas[k]) };
        }), total) : sinDatos();
      };
      var nombresSemana = [];
      for (var i = 0; i < 7; i++) { nombresSemana.push(mayuscula(new Date(2024, 0, 1 + i).toLocaleDateString(LOCALE, { weekday: 'long' }))); }
      append(zona, h('div', { class: 'pcan-accesos-grid' },
        tarjetaAcceso(__('Cómo entran'), __('Porcentaje de los inicios de sesión'), reparto(['enlace', 'google', 'contrasena'], metodoAcceso, metodos)),
        tarjetaAcceso(__('Desde dónde'), __('Dispositivo de cada inicio de sesión'), reparto(['movil', 'tableta', 'ordenador'], dispositivoAcceso, dispositivos)),
        tarjetaAcceso(__('Qué días se usa'), __('Días de uso de cada día de la semana'),
          Math.max.apply(null, semana) ? barrasAcceso(semana.map(function (n, k) { return { titulo: nombresSemana[k], valor: n, texto: String(n) }; }), Math.max.apply(null, semana)) : sinDatos(), 'is-ancha')));

      // Personas: por último acceso, la más reciente arriba; quien no tiene ninguno anotado, al final.
      var orden = ps.slice().sort(function (r1, r2) {
        return r2.x.ultimo.localeCompare(r1.x.ultimo) || r2.x.ultT - r1.x.ultT || (r2.x.entro ? 1 : 0) - (r1.x.entro ? 1 : 0) ||
          (r1.x.p.nombre || r1.x.p.email).localeCompare(r2.x.p.nombre || r2.x.p.email, LOCALE);
      });
      var grupos = {
        todas: function () { return true; },
        activas: function (r) { return r.activa; },
        inactivas: function (r) { return !r.activa && !r.x.nunca; },
        nunca: function (r) { return r.x.nunca; }
      };
      var lista = h('ul', { class: 'pcan-acc-lista' });
      function pintarLista() {
        lista.innerHTML = '';
        var visibles = orden.filter(grupos[filtro]);
        if (!visibles.length) { append(lista, h('li', { class: 'pcan-muted', text: __('No hay nadie en este grupo.') })); return; }
        visibles.forEach(function (r) { append(lista, filaAcceso(r)); });
      }
      function filaAcceso(r) {
        var x = r.x, p = x.p, clave = String(p.email).toLowerCase();
        var id = 'pcan-acc-d-' + clave.replace(/[^a-z0-9]/g, '-');
        var abierta = !!abiertas[clave];
        var detalle = h('div', { class: 'pcan-acc-detalle', id: id, hidden: !abierta });
        var pintado = false;
        function pintarDetalle() {
          if (pintado) { return; }
          pintado = true;
          append(detalle, [
            h('p', { class: 'pcan-help', text: sprintf(_n('%d día de uso en este periodo', '%d días de uso en este periodo', r.dias), r.dias) }),
            x.sinRegistro ? h('p', { class: 'pcan-help', text: sprintf(/* translators: %s: fecha desde la que se registran los accesos */ __('Ya había entrado antes de que empezara el registro (%s).'), fechaMarca(a.desde)) }) : null,
            h('strong', { text: __('Últimos inicios de sesión') }),
            x.accesos.length ? h('ul', { class: 'pcan-acc-inicios' }, x.accesos.slice(0, 20).map(function (e) {
              return h('li', null,
                h('span', { text: sinPunto(new Date(e.t * 1000).toLocaleString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })) }),
                h('span', { text: metodoAcceso(e.metodo) + ' · ' + dispositivoAcceso(e.dispositivo) }));
            })) : h('p', { class: 'pcan-help', text: __('Sin inicios de sesión registrados.') }),
            x.accesos.length > 20 ? h('p', { class: 'pcan-help', text: __('Se muestran los 20 más recientes.') }) : null]);
        }
        if (abierta) { pintarDetalle(); }
        var li = h('li', { class: 'pcan-acc-persona' + (abierta ? ' is-open' : '') });
        var boton = h('button', {
          type: 'button', class: 'pcan-acc-fila', 'aria-expanded': abierta ? 'true' : 'false', 'aria-controls': id,
          onclick: function () {
            var abrir = detalle.hidden;
            abiertas[clave] = abrir;
            detalle.hidden = !abrir;
            li.classList.toggle('is-open', abrir);
            boton.setAttribute('aria-expanded', abrir ? 'true' : 'false');
            if (abrir) { pintarDetalle(); }
          }
        },
          h('span', { class: 'pcan-avatar is-sm', 'aria-hidden': 'true' }, iniciales(p.nombre || p.email)),
          h('span', { class: 'pcan-miembro-main' },
            h('strong', { text: p.nombre || p.email }),
            p.nombre ? h('span', { text: p.email }) : null,
            h('small', { text: x.nunca ? __('Nunca ha entrado') : x.sinRegistro ? __('Sin accesos registrados') : sprintf(/* translators: %s: cuándo fue («hace 3 días») */ __('Último acceso: %s'), haceTanto(x.ultimo, hoy)) })),
          p.esAdmin
            ? h('span', { class: 'pcan-estado is-warn', title: __('Las cuentas de administración no reciben enlaces por correo'), text: __('Administración · entra con contraseña') })
            : p.esGestor ? h('span', { class: 'pcan-estado is-ok', title: __('Puede cambiar los ajustes, gestionar el equipo y borrar canciones'), text: __('Administrador') })
              : !p.enLista ? h('span', { class: 'pcan-estado', text: __('Fuera de la lista') }) : null,
          h('span', { class: 'pcan-acc-cifras' }, h('span', { text: nInicios(r.inicios) }), h('span', { text: nDiasDeUso(r.dias) })),
          icono('siguiente'));
        append(li, [boton, detalle]);
        return li;
      }
      var filtros = selectorSegmentado([
        { id: 'todas', texto: _x('Todas', 'filtro de las personas en Accesos'), n: orden.length },
        { id: 'activas', texto: __('Activas'), n: orden.filter(grupos.activas).length },
        { id: 'inactivas', texto: __('Sin actividad'), n: orden.filter(grupos.inactivas).length },
        { id: 'nunca', texto: __('Nunca han entrado'), n: orden.filter(grupos.nunca).length }
      ], filtro, __('Mostrar'), function (id) { filtro = id; pintarLista(); });
      pintarLista();
      append(zona, tarjetaAcceso(__('Personas'), __('Inicios de sesión y días de uso del periodo elegido. Toca una persona para ver su detalle.'),
        h('div', { class: 'pcan-acc-bloque' }, filtros, lista)));
    }
    pintarZona();
  }

  // ---------------------------------------------------------------- papelera (administradores)

  function textoCaducidad(it) {
    if (it.diasRestantes === null || it.diasRestantes === undefined) { return __('Se conserva hasta que un administrador la elimine'); }
    if (it.diasRestantes === 0) { return __('Se eliminará hoy'); }
    return sprintf(_n('Se eliminará en %d día', 'Se eliminará en %d días', it.diasRestantes), it.diasRestantes);
  }

  function textoBorrada(it) {
    return it.borradaPor
      ? sprintf(/* translators: 1: fecha, 2: nombre de quien la borró */ __('Borrada el %1$s por %2$s'), fechaCompleta(it.borradaEl), it.borradaPor)
      : sprintf(/* translators: %s: fecha */ __('Borrada el %s'), fechaCompleta(it.borradaEl));
  }

  // Aviso y acciones en la ficha de una canción que está en la papelera.
  function bannerPapelera(c) {
    var p = c.papelera || {};
    return h('div', { class: 'pcan-papelera-aviso', role: 'status' },
      h('strong', { text: __('Esta canción está en la papelera') }),
      h('span', { text: [textoBorrada(p), textoCaducidad(p)].join(' · ') }),
      h('div', { class: 'pcan-actions' },
        h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-primary', onclick: function (e) { restaurarDePapelera(c.id, c.titulo, true, e.currentTarget); } }, icono('subir'), __('Restaurar')),
        h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-danger', onclick: function (e) { eliminarDefinitivo(c.id, c.titulo, true, e.currentTarget); } }, icono('borrar'), __('Eliminar para siempre'))));
  }

  // Deja un botón desactivado con un texto de «en curso» mientras dura la petición.
  function ocupado(btn, texto) {
    if (!btn) { return; }
    btn.disabled = true;
    if (btn.lastChild) { btn.lastChild.textContent = texto; }
  }

  function restaurarDePapelera(id, titulo, desdeFicha, btn) {
    ocupado(btn, __('Restaurando…'));
    return api('papelera/' + id + '/restaurar', { json: {} }).then(function () {
      aviso(sprintf(/* translators: %s: título de la canción */ __('«%s» restaurada'), titulo));
      return cargar().then(function () {
        pintarChips(); pintarLista();
        if (desdeFicha) { verCancion(id); } else { refrescarPapelera(); }
      });
    }).catch(function (e) { aviso(e.message, 'error'); if (btn) { refrescarPapelera(); } });
  }

  function eliminarDefinitivo(id, titulo, desdeFicha, btn) {
    if (!window.confirm(sprintf(/* translators: %s: título de la canción */ __('¿Eliminar «%s» para siempre? Se borran también sus partituras y audios y no se puede deshacer.'), titulo))) { return Promise.resolve(); }
    ocupado(btn, __('Eliminando…'));
    return api('papelera/' + id, { method: 'DELETE' }).then(function () {
      aviso(sprintf(/* translators: %s: título de la canción */ __('«%s» eliminada para siempre'), titulo));
      if (desdeFicha) { location.hash = '#/ajustes/papelera'; } else { refrescarPapelera(); }
    }).catch(function (e) { aviso(e.message, 'error'); });
  }

  /** La papelera es una sección de «Ajustes y equipo». */
  function abrirPapelera() { abrirAjustes('papelera'); }

  /** Vuelve a pedir la papelera (tras restaurar o eliminar). Si el panel ya no está abierto, lo abre. */
  function refrescarPapelera() {
    if (ajustesAbierto && ajustesAbierto.raiz.isConnected) { ajustesAbierto.recargar('papelera'); }
    else { abrirPapelera(); }
  }

  /** Pinta la papelera dentro de `cuerpo` (la sección «Papelera» de los ajustes). */
  function pintarPapelera(cuerpo) {
    cuerpo.innerHTML = '';
    append(cuerpo, h('p', { class: 'pcan-help', text: __('Cargando la papelera…') }));
    api('papelera').then(function (r) {
      cuerpo.innerHTML = '';
      var ayuda = r.dias
        ? sprintf(_n('Las canciones borradas se conservan %d día y después se eliminan solas, con sus partituras y audios.', 'Las canciones borradas se conservan %d días y después se eliminan solas, con sus partituras y audios.', r.dias), r.dias)
        : __('Las canciones borradas se conservan hasta que un administrador las elimine (el borrado automático está desactivado).');
      append(cuerpo, h('p', { class: 'pcan-help' }, ayuda + ' ',
        h('a', { href: '#/ajustes/general', onclick: function (e) { e.preventDefault(); if (ajustesAbierto) { ajustesAbierto.ir('general'); } }, text: __('Cambiar el plazo') })));
      if (!r.canciones.length) {
        append(cuerpo, h('p', { class: 'pcan-help', text: __('La papelera está vacía.') }));
      } else {
        append(cuerpo, h('ul', { class: 'pcan-papelera-lista' }, r.canciones.map(function (it) {
          return h('li', { class: 'pcan-papelera-item' },
            h('div', { class: 'pcan-papelera-main' },
              h('strong', { text: (it.numero ? it.numero + ' · ' : '') + it.titulo }),
              h('small', { text: [textoBorrada(it), textoCaducidad(it), it.archivos ? sprintf(_n('%d archivo', '%d archivos', it.archivos), it.archivos) : ''].filter(Boolean).join(' · ') })),
            h('div', { class: 'pcan-papelera-acciones' },
              h('a', { class: 'pcan-btn pcan-btn-sm', href: '#/cancion/' + it.id }, icono('abrir'), __('Ver')),
              h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-primary', onclick: function (e) { restaurarDePapelera(it.id, it.titulo, false, e.currentTarget); } }, icono('subir'), __('Restaurar')),
              h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-danger', onclick: function (e) { eliminarDefinitivo(it.id, it.titulo, false, e.currentTarget); } }, icono('borrar'), __('Eliminar'))));
        })));
        append(cuerpo, h('div', { class: 'pcan-actions' },
          h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-danger', onclick: function () {
            if (!window.confirm(sprintf(_n('¿Vaciar la papelera? Se elimina para siempre %d canción con sus archivos. No se puede deshacer.', '¿Vaciar la papelera? Se eliminan para siempre %d canciones con sus archivos. No se puede deshacer.', r.canciones.length), r.canciones.length))) { return; }
            // Se elimina de una en una para poder enseñar el avance (cada canción borra también sus archivos).
            var ids = r.canciones.map(function (c) { return c.id; });
            var hechas = 0, fallos = 0;
            var texto = h('p', { class: 'pcan-help', role: 'status', text: sprintf(/* translators: 1: número de la canción que se elimina, 2: total */ __('Eliminando %1$d de %2$d…'), 1, ids.length) });
            var relleno = h('span');
            cuerpo.innerHTML = '';
            append(cuerpo, [h('strong', { text: __('Vaciando la papelera') }), texto, h('div', { class: 'pcan-progress' }, relleno),
              h('p', { class: 'pcan-help', text: __('No cierres esta ventana hasta que termine.') })]);
            relleno.style.width = '0%';
            ids.reduce(function (cadena, id) {
              return cadena.then(function () {
                texto.textContent = sprintf(/* translators: 1: número de la canción que se elimina, 2: total */ __('Eliminando %1$d de %2$d…'), hechas + 1, ids.length);
                return api('papelera/' + id, { method: 'DELETE' }).then(null, function () { fallos++; }).then(function () {
                  hechas++;
                  relleno.style.width = Math.round(hechas / ids.length * 100) + '%';
                });
              });
            }, Promise.resolve()).then(function () {
              var ok = ids.length - fallos;
              aviso(sprintf(_n('%d canción eliminada para siempre', '%d canciones eliminadas para siempre', ok), ok) + (fallos ? ' · ' + sprintf(_n('%d no se pudo eliminar', '%d no se pudieron eliminar', fallos), fallos) : ''), fallos ? 'error' : undefined);
              pintarPapelera(cuerpo);
            });
          } }, icono('borrar'), __('Vaciar la papelera'))));
      }
    }).catch(function (e) {
      cuerpo.innerHTML = '';
      append(cuerpo, h('p', { class: 'pcan-form-error', text: e.message }));
    });
  }

  // ---------------------------------------------------------------- copias de seguridad (administradores)

  var JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  var jszipPromesa = null;
  function cargarJSZip() {
    if (window.JSZip) { return Promise.resolve(window.JSZip); }
    if (jszipPromesa) { return jszipPromesa; }
    jszipPromesa = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = JSZIP;
      s.onload = function () { resolve(window.JSZip); };
      s.onerror = function () {
        jszipPromesa = null;
        var err = new Error(__('No se pudo cargar el compresor de copias. Revisa la conexión.'));
        err.compresor = true;
        reject(err);
      };
      document.head.appendChild(s);
    });
    return jszipPromesa;
  }

  function descargarBlob(blob, nombre) {
    var a = h('a', { href: URL.createObjectURL(blob), download: nombre, hidden: true });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  }

  function hoyISO() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function leeme() {
    return __('Copia de seguridad del Cancionero (plugin Cancionero).\n\ncopia.json  canciones, cultos y ajustes\narchivos/   partituras, audios y partituras editables de cada canción\n\nPara restaurarla: instala el plugin en WordPress, entra como administrador en el cancionero\ny abre Ajustes y equipo → Copias de seguridad → Restaurar desde una copia.\n');
  }

  /** Monta la copia en el navegador: datos del servidor + cada archivo descargado, en un ZIP. */
  function crearCopia(opc, estado, avance) {
    return Promise.all([cargarJSZip(), api('copia')]).then(function (r) {
      var zip = new r[0](), d = r[1];
      var copia = {
        formato: d.formato, version: d.version, plugin: d.plugin, sitio: d.sitio, fecha: d.fecha,
        conArchivos: !!(opc.canciones && opc.archivos), canciones: [], cultos: [], ajustes: null
      };
      var descargas = [];
      if (opc.canciones) {
        copia.canciones = d.canciones.map(function (c) {
          var nueva = Object.assign({}, c);
          ['partituras', 'audios', 'editables'].forEach(function (k) {
            nueva[k] = (c[k] || []).map(function (f, i) {
              var g = Object.assign({}, f);
              delete g.url;
              if (opc.archivos) {
                g.ruta = 'archivos/' + c.uid + '/' + k + '-' + (i + 1) + '-' + f.archivo;
                descargas.push({ url: f.url, ruta: g.ruta, tamano: f.tamano || 0, nombre: f.archivo });
              }
              return g;
            });
          });
          return nueva;
        });
      }
      if (opc.cultos) { copia.cultos = d.cultos; }
      if (opc.ajustes) { copia.ajustes = d.ajustes; }

      var total = descargas.reduce(function (s, f) { return s + f.tamano; }, 0) || 1, hecho = 0;
      return descargas.reduce(function (cadena, f, i) {
        return cadena.then(function () {
          estado(sprintf(/* translators: 1: número de archivo, 2: total de archivos, 3: nombre del archivo */ __('Descargando archivo %1$d de %2$d: %3$s'), i + 1, descargas.length, f.nombre));
          return fetch(f.url, { credentials: 'same-origin' }).then(function (res) {
            if (!res.ok) { throw new Error(sprintf(/* translators: 1: nombre del archivo, 2: código de error HTTP */ __('No se pudo descargar «%1$s» (error %2$d).'), f.nombre, res.status)); }
            return res.blob();
          }).then(function (b) {
            zip.file(f.ruta, b);
            hecho += f.tamano;
            avance(hecho / total * 0.92);
          });
        });
      }, Promise.resolve()).then(function () {
        zip.file('copia.json', JSON.stringify(copia, null, 1));
        zip.file('LEEME.txt', leeme());
        estado(__('Preparando el archivo…'));
        // Sin comprimir: PDF y MP3 ya lo están, y así es mucho más rápido.
        return zip.generateAsync({ type: 'blob', compression: 'STORE' }, function (m) { avance(0.92 + m.percent / 100 * 0.08); });
      }).then(function (blob) {
        descargarBlob(blob, 'cancionero-copia-' + hoyISO() + '.zip');
        return { canciones: copia.canciones.length, cultos: copia.cultos.length, archivos: descargas.length, bytes: blob.size };
      });
    });
  }

  /** Lee un ZIP de copia y comprueba que lo es. */
  function leerCopia(file) {
    return cargarJSZip().then(function (JSZip) { return JSZip.loadAsync(file); }).then(function (zip) {
      var f = zip.file('copia.json');
      if (!f) { throw new Error(__('Este archivo no es una copia del cancionero (falta copia.json).')); }
      return f.async('string').then(function (texto) {
        var copia = JSON.parse(texto);
        if (copia.formato !== 'pieb-cancionero') { throw new Error(__('Este archivo no es una copia del cancionero.')); }
        copia.canciones = copia.canciones || [];
        copia.cultos = copia.cultos || [];
        return { zip: zip, copia: copia };
      });
    }, function (e) {
      throw e && e.compresor ? e : new Error(__('No se pudo abrir el archivo: ¿es un .zip de copia del cancionero?'));
    });
  }

  /** Sube los archivos de una canción de la copia (por trozos) y la crea o actualiza en el servidor. */
  function restaurarCancion(zip, c, modo, conArchivos) {
    function subir(lista, tipo) {
      return (lista || []).reduce(function (cadena, f) {
        return cadena.then(function (acc) {
          var entrada = f.ruta && zip.file(f.ruta);
          if (!entrada) { return acc; }
          return entrada.async('blob').then(function (b) {
            return subirPorTrozos(new File([b], f.archivo, { type: b.type }), tipo);
          }).then(function (id) { acc.push(Object.assign({}, f, { subida: id })); return acc; });
        });
      }, Promise.resolve([]));
    }
    var datos = Object.assign({}, c);
    return subir(c.partituras, 'partitura').then(function (p) {
      datos.partituras = p;
      return subir(c.audios, 'audio');
    }).then(function (a) {
      datos.audios = a;
      return subir(c.editables, 'editable');
    }).then(function (e) {
      datos.editables = e;
      return api('copia/cancion', { json: { cancion: datos, modo: modo, conArchivos: conArchivos } });
    });
  }

  function abrirCopias() {
    abrirAjustes('copias');
  }

  function pintarCopias(cuerpo) {
    var ocupado = false;
    // Marcar opciones no son cambios por guardar; durante una copia o restauración sí se avisa al cerrar.
    cuerpo.addEventListener('input', function (e) { e.stopPropagation(); });
    cuerpo.addEventListener('change', function (e) { e.stopPropagation(); });
    function casilla(texto, marcada, ayuda) {
      var input = h('input', { type: 'checkbox', checked: marcada });
      return { input: input, el: h('label', { class: 'pcan-copia-opcion' }, input, h('span', null, h('strong', { text: texto }), ayuda ? h('small', { text: ayuda }) : null)) };
    }
    function progresoNuevo() { return h('div', { class: 'pcan-progress', hidden: true }, h('span')); }

    // --- crear
    var oCanciones = casilla(__('Canciones'), true, sprintf(_n('%d canción con sus datos, letra, etiquetas y enlaces de YouTube.', '%d canciones con sus datos, letras, etiquetas y enlaces de YouTube.', state.canciones.length), state.canciones.length));
    var oArchivos = casilla(__('Partituras, audios y editables'), true, __('Los archivos de cada canción. Sin ellos la copia ocupa muy poco, pero no sirve para empezar en otra web.'));
    var oCultos = casilla(__('Cultos y setlists'), true, __('Todos los cultos con el orden de sus canciones (de ahí salen las estadísticas).'));
    var oAjustes = casilla(__('Ajustes y lista del equipo'), true, __('Tema por defecto, correos con acceso y acceso con Google.'));
    oCanciones.input.addEventListener('change', function () { oArchivos.input.disabled = !oCanciones.input.checked; });
    var estadoCrear = h('p', { class: 'pcan-help', role: 'status' });
    var barraCrear = progresoNuevo();
    var bCrear = h('button', { type: 'button', class: 'pcan-btn pcan-btn-primary' }, icono('descargar'), __('Descargar copia'));
    bCrear.addEventListener('click', function () {
      var opc = { canciones: oCanciones.input.checked, archivos: oCanciones.input.checked && oArchivos.input.checked, cultos: oCultos.input.checked, ajustes: oAjustes.input.checked };
      if (!opc.canciones && !opc.cultos && !opc.ajustes) { estadoCrear.textContent = __('Marca al menos una cosa para copiar.'); return; }
      if (opc.cultos && !opc.canciones) { estadoCrear.textContent = __('Los cultos se restauran enlazando sus canciones: incluye también las canciones, o asegúrate de que ya estén donde vayas a restaurar.'); }
      ocupado = true; panelSucio = true;
      bCrear.disabled = true;
      barraCrear.hidden = false;
      barraCrear.firstChild.style.width = '0%';
      crearCopia(opc, function (t) { estadoCrear.textContent = t; }, function (p) { barraCrear.firstChild.style.width = Math.round(p * 100) + '%'; })
        .then(function (r) {
          estadoCrear.textContent = sprintf(/* translators: 1: lo que contiene la copia (p. ej. «12 canciones, 3 cultos»), 2: tamaño del archivo */ __('Copia descargada: %1$s · %2$s. Guárdala fuera de este servidor.'),
            [r.canciones ? sprintf(_n('%d canción', '%d canciones', r.canciones), r.canciones) : '', r.cultos ? sprintf(_n('%d culto', '%d cultos', r.cultos), r.cultos) : '', r.archivos ? sprintf(_n('%d archivo', '%d archivos', r.archivos), r.archivos) : ''].filter(Boolean).join(', '), tamano(r.bytes));
          aviso(__('Copia descargada'));
        })
        .catch(function (e) { estadoCrear.textContent = e.message; aviso(__('No se pudo crear la copia'), 'error'); })
        .then(function () { ocupado = false; panelSucio = false; bCrear.disabled = false; barraCrear.hidden = true; });
    });

    // --- restaurar
    var zonaRestaurar = h('div', { class: 'pcan-copia-restaurar' });
    var leyendo = false;
    var elegir = zonaArchivos('.zip,application/zip', __('Elegir copia (.zip)'), __('El archivo que descargaste con «Descargar copia»'), function (files) {
      var archivo = files[0];
      if (!archivo || ocupado || leyendo) { return; }
      leyendo = true;
      zonaRestaurar.innerHTML = '';
      append(zonaRestaurar, h('p', { class: 'pcan-help pcan-copia-leyendo', role: 'status' }, h('span', { class: 'pcan-copia-leyendo-ico', 'aria-hidden': 'true' }), __('Leyendo la copia…')));
      leerCopia(archivo).then(function (r) {
        return api('copia/estado', { json: {
          canciones: r.copia.canciones.map(function (c) { return { uid: c.uid, titulo: c.titulo, numero: c.numero }; }),
          cultos: r.copia.cultos.map(function (c) { return { uid: c.uid, titulo: c.titulo, fecha: c.fecha }; })
        } }).then(function (existen) {
          zonaRestaurar.innerHTML = '';
          leyendo = false;
          pintarRestaurar(r.zip, r.copia, existen, archivo);
        });
      }).catch(function (e) {
        leyendo = false;
        zonaRestaurar.innerHTML = '';
        append(zonaRestaurar, h('p', { class: 'pcan-form-error', text: e.message }));
      });
    });

    /** Ventana emergente encima del panel de ajustes. Devuelve { cuerpo, pie, cerrar, bloquear }.
     *  Se cierra con Esc, la X, «Cancelar» o un clic fuera, salvo mientras se restaura (bloquear(true)). */
    function abrirVentana(titulo, cabecera) {
      var bloqueada = false;
      var previo = document.activeElement;
      var cuerpo = h('div', { class: 'pcan-modal-cuerpo' });
      var pie = h('div', { class: 'pcan-modal-pie' });
      var bX = h('button', { type: 'button', class: 'pcan-icon-btn pcan-modal-x', 'aria-label': __('Cerrar'), onclick: function () { cerrar(); } }, icono('cerrar'));
      var idTitulo = 'pcan-modal-t-' + Date.now();
      var ventana = h('div', { class: 'pcan-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': idTitulo, tabindex: '-1' },
        h('div', { class: 'pcan-modal-cab' }, h('div', { class: 'pcan-modal-titulo' }, h('h2', { id: idTitulo, text: titulo }), cabecera), bX),
        cuerpo, pie);
      var capa = h('div', { class: 'pcan-modal-capa', onclick: function (e) { if (e.target === capa) { if (bloqueada) { ventana.focus({ preventScroll: true }); } else { cerrar(); } } } }, ventana);
      // Lo que se marca aquí no son cambios por guardar del panel de ajustes.
      ['input', 'change'].forEach(function (ev) { capa.addEventListener(ev, function (e) { e.stopPropagation(); }); });
      capa.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); return; }
        if (e.key === 'Tab') {
          var f = Array.prototype.filter.call(ventana.querySelectorAll('a[href], button, input, select, textarea, [tabindex="0"]'), function (el) { return !el.disabled && el.offsetParent !== null; });
          if (!f.length) { e.preventDefault(); ventana.focus(); return; }
          var dentro = ventana.contains(document.activeElement) && document.activeElement !== ventana;
          if (e.shiftKey && (!dentro || document.activeElement === f[0])) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && (!dentro || document.activeElement === f[f.length - 1])) { e.preventDefault(); f[0].focus(); }
        }
      });
      function cerrar() {
        if (bloqueada) { return; }
        if (capa.parentNode) { capa.parentNode.removeChild(capa); }
        var input = elegir.querySelector('input');
        try { (input || previo).focus(); } catch (err) { /* nada */ }
      }
      function bloquear(si) { bloqueada = si; bX.disabled = si; bX.hidden = si; }
      append(ui.panel, capa);
      ventana.focus({ preventScroll: true });
      return { cuerpo: cuerpo, pie: pie, cerrar: cerrar, bloquear: bloquear, ventana: ventana };
    }

    function pintarRestaurar(zip, copia, existen, file) {
      var elegidas = copia.canciones.map(function () { return true; });
      var elegidos = copia.cultos.map(function () { return true; });
      var modo = 'saltar';
      var nExisten = existen.canciones.filter(Boolean).length + existen.cultos.filter(Boolean).length;
      var soloNuevas = false;
      var filtros = [];

      function lista(items, marcas, existe, texto) {
        if (!items.length) { return null; }
        var todas = h('input', { type: 'checkbox', checked: true, 'aria-label': __('Marcar todas') });
        var casillas = [];
        var filas = [];
        var ul = h('ul', { class: 'pcan-copia-lista' }, items.map(function (it, i) {
          var c = h('input', { type: 'checkbox', checked: true, onchange: function (e) { marcas[i] = e.target.checked; resumen(); } });
          casillas.push(c);
          var li = h('li', null, h('label', null, c, h('span', { text: texto(it) }),
            h('span', { class: 'pcan-estado' + (existe[i] ? ' is-warn' : ' is-ok'), text: existe[i] ? __('Ya existe') : _x('Nueva', 'estado de una canción o culto de la copia que aún no existe en esta web') })));
          filas.push(li);
          return li;
        }));
        filtros.push(function () { filas.forEach(function (li, i) { li.style.display = soloNuevas && existe[i] ? 'none' : ''; }); });
        todas.addEventListener('change', function () {
          // «Todas» solo afecta a las filas que se están viendo.
          casillas.forEach(function (c, i) {
            if (filas[i].style.display === 'none') { return; }
            c.checked = todas.checked; marcas[i] = todas.checked;
          });
          resumen();
        });
        return [h('label', { class: 'pcan-copia-todas' }, todas, h('span', { text: _x('Todas', 'casilla para marcar todas las filas de la lista') })), ul];
      }

      var oAjustesR = casilla(__('Ajustes y lista del equipo'), !!copia.ajustes,
        copia.ajustes ? sprintf(_n('%d correo: se añade a la lista actual, nadie pierde el acceso.', '%d correos: se añaden a la lista actual, nadie pierde el acceso.', (copia.ajustes.emails || []).length), (copia.ajustes.emails || []).length) : __('Esta copia no los incluye.'));
      oAjustesR.input.disabled = !copia.ajustes;

      var modos = h('div', { class: 'pcan-copia-modos', role: 'radiogroup', 'aria-label': __('Si ya existe') },
        [['saltar', __('Dejar la que ya hay (recomendado)')], ['sobrescribir', __('Sustituirla por la de la copia')]].map(function (m) {
          return h('label', null, h('input', { type: 'radio', name: 'pcan-modo-copia', value: m[0], checked: m[0] === modo, onchange: function () { modo = m[0]; resumen(); } }), h('span', { text: m[1] }));
        }));

      var ctrlFiltro = h('div', { class: 'pcan-copia-modos', role: 'radiogroup', 'aria-label': __('Qué mostrar') },
        [[false, sprintf(/* translators: %d: número de elementos de la copia */ __('Mostrar todas (%d)'), copia.canciones.length + copia.cultos.length)], [true, sprintf(/* translators: %d: número de elementos de la copia que aún no existen */ __('Mostrar solo las que no existen (%d)'), copia.canciones.length + copia.cultos.length - nExisten)]].map(function (m) {
          return h('label', null, h('input', { type: 'radio', name: 'pcan-filtro-copia', checked: m[0] === soloNuevas, onchange: function () { soloNuevas = m[0]; filtros.forEach(function (f) { f(); }); } }), h('span', { text: m[1] }));
        }));

      var aviso2 = h('p', { class: 'pcan-help' });
      var barra = progresoNuevo();
      var estadoRestaurar = h('p', { class: 'pcan-help', role: 'status', hidden: true });
      var registro = h('ul', { class: 'pcan-copia-registro', hidden: true });
      var bRestaurar = h('button', { type: 'button', class: 'pcan-btn pcan-btn-primary' }, icono('subir'), h('span'));
      var confirmar = h('div', { class: 'pcan-confirmar', role: 'alert', hidden: true });
      var resultado = h('div', { class: 'pcan-copia-resultado', role: 'status', hidden: true });
      var opciones = h('div', { class: 'pcan-copia-opciones' });
      var cuenta = { creados: 0, sustituidos: 0, iguales: 0 };
      var errores = [];

      var origen = h('div', { class: 'pcan-copia-origen' }, icono('descargar'),
        h('span', null, h('strong', { text: file.name }),
          h('small', { text: sprintf(copia.conArchivos
            ? /* translators: 1: fecha de la copia, 2: dirección de la web de origen, 3: tamaño del archivo */ __('Copia del %1$s · %2$s · %3$s · con archivos')
            : /* translators: 1: fecha de la copia, 2: dirección de la web de origen, 3: tamaño del archivo */ __('Copia del %1$s · %2$s · %3$s · solo datos'),
          fechaCompleta(copia.fecha), String(copia.sitio || '').replace(/^https?:\/\//, '').replace(/\/$/, ''), tamano(file.size)) })));
      var ventana = abrirVentana(__('Restaurar una copia'), origen);
      var bCancelar = h('button', { type: 'button', class: 'pcan-btn', onclick: function () { ventana.cerrar(); } }, __('Cancelar'));
      var acciones = h('div', { class: 'pcan-modal-acciones' }, bCancelar, bRestaurar);

      function resumen() {
        var nc = elegidas.filter(Boolean).length, nu = elegidos.filter(Boolean).length;
        var partes = [nc ? sprintf(_n('%d canción', '%d canciones', nc), nc) : '', nu ? sprintf(_n('%d culto', '%d cultos', nu), nu) : '', oAjustesR.input.checked ? __('los ajustes') : ''].filter(Boolean);
        bRestaurar.lastChild.textContent = partes.length ? sprintf(/* translators: %s: lo que se va a restaurar (p. ej. «12 canciones, 3 cultos») */ __('Restaurar %s'), partes.join(', ')) : __('Marca qué restaurar');
        bRestaurar.disabled = !partes.length || ocupado;
        aviso2.textContent = nExisten
          ? (modo === 'saltar' ? __('Lo que ya existe se deja como está; solo se añade lo nuevo.') : copia.conArchivos ? __('Lo que ya existe se sustituirá por la versión de la copia, incluidas sus partituras y audios.') : __('Lo que ya existe se sustituirá por la versión de la copia (sus archivos actuales se conservan).'))
          : __('Nada de la copia existe todavía en esta web: se añadirá todo lo que marques.');
        confirmar.hidden = true;
        acciones.hidden = false;
      }
      oAjustesR.input.addEventListener('change', resumen);

      function anotar(texto, error) {
        registro.hidden = false;
        append(registro, h('li', { class: error ? 'is-error' : '', text: texto }));
        if (error) { errores.push(texto); }
        ventana.cuerpo.scrollTop = ventana.cuerpo.scrollHeight;
      }

      function terminar() {
        ocupado = false; panelSucio = false;
        ventana.bloquear(false);
        var titulo = errores.length ? sprintf(_n('Restauración terminada con %d aviso', 'Restauración terminada con %d avisos', errores.length), errores.length) : __('Copia restaurada');
        barra.hidden = true;
        estadoRestaurar.hidden = true;
        resultado.innerHTML = '';
        append(resultado, [
          h('strong', { text: titulo }),
          h('span', { text: sprintf(/* translators: 1: elementos añadidos, 2: elementos sustituidos, 3: elementos que ya estaban y no se han tocado */ __('Añadido: %1$d · sustituido: %2$d · sin cambios: %3$d'), cuenta.creados, cuenta.sustituidos, cuenta.iguales) }),
          errores.length ? h('ul', null, errores.map(function (t) { return h('li', { text: t }); })) : null]);
        resultado.classList.toggle('is-error', !!errores.length);
        resultado.hidden = false;
        ventana.cuerpo.scrollTop = 0;
        var bVer = h('button', { type: 'button', class: 'pcan-btn pcan-btn-primary', onclick: function () { location.hash = '#/'; location.reload(); } }, __('Ver el cancionero restaurado'));
        append(ventana.pie, h('div', { class: 'pcan-modal-acciones' }, h('button', { type: 'button', class: 'pcan-btn', onclick: function () { ventana.cerrar(); } }, __('Cerrar')), bVer));
        bVer.focus();
      }

      function ejecutar() {
        ocupado = true; panelSucio = true;
        ventana.bloquear(true);
        acciones.hidden = true; aviso2.hidden = true; confirmar.hidden = true;
        opciones.hidden = true;
        barra.hidden = false;
        barra.firstChild.style.width = '0%';
        estadoRestaurar.hidden = false;
        registro.innerHTML = '';
        ventana.ventana.focus({ preventScroll: true });
        var tareas = [];
        copia.canciones.forEach(function (c, i) {
          if (!elegidas[i]) { return; }
          if (existen.canciones[i] && modo === 'saltar') { tareas.push(function () { cuenta.iguales++; anotar(sprintf(/* translators: %s: título de la canción */ __('«%s»: ya estaba, sin cambios'), c.titulo)); return Promise.resolve(); }); return; }
          tareas.push(function () {
            return restaurarCancion(zip, c, modo, !!copia.conArchivos).then(function (r) {
              if (r.estado === 'creada') { cuenta.creados++; } else if (r.estado === 'actualizada') { cuenta.sustituidos++; } else { cuenta.iguales++; }
              anotar(r.estado === 'creada' ? sprintf(/* translators: %s: título de la canción */ __('«%s»: añadida'), c.titulo)
                : r.estado === 'actualizada' ? sprintf(/* translators: %s: título de la canción */ __('«%s»: sustituida'), c.titulo)
                : sprintf(/* translators: %s: título de la canción */ __('«%s»: ya estaba, sin cambios'), c.titulo));
            }, function (e) { anotar(sprintf(/* translators: 1: título de la canción, 2: motivo del error */ __('«%1$s»: %2$s'), c.titulo, e.message), true); });
          });
        });
        copia.cultos.forEach(function (c, i) {
          if (!elegidos[i]) { return; }
          tareas.push(function () {
            return api('copia/culto', { json: { culto: c, modo: modo } }).then(function (r) {
              if (r.estado === 'creado') { cuenta.creados++; } else if (r.estado === 'actualizado') { cuenta.sustituidos++; } else { cuenta.iguales++; }
              var fCulto = fechaCorta(c.fecha);
              anotar((r.estado === 'creado' ? sprintf(/* translators: 1: título del culto, 2: fecha */ __('Culto «%1$s» (%2$s): añadido'), c.titulo, fCulto)
                : r.estado === 'actualizado' ? sprintf(/* translators: 1: título del culto, 2: fecha */ __('Culto «%1$s» (%2$s): sustituido'), c.titulo, fCulto)
                : sprintf(/* translators: 1: título del culto, 2: fecha */ __('Culto «%1$s» (%2$s): ya estaba, sin cambios'), c.titulo, fCulto)) +
                (r.faltan ? ' · ' + sprintf(_n('%d canción no está en esta web', '%d canciones no están en esta web', r.faltan), r.faltan) : ''), !!r.faltan);
            }, function (e) { anotar(sprintf(/* translators: 1: título del culto, 2: motivo del error */ __('Culto «%1$s»: %2$s'), c.titulo, e.message), true); });
          });
        });
        if (oAjustesR.input.checked && copia.ajustes) {
          tareas.push(function () {
            return api('copia/ajustes', { json: { ajustes: copia.ajustes } }).then(function (r) {
              cuenta.sustituidos++;
              anotar(sprintf(_n('Ajustes restaurados · %d correo en la lista del equipo', 'Ajustes restaurados · %d correos en la lista del equipo', r.emails), r.emails));
            }, function (e) { anotar(sprintf(/* translators: %s: motivo del error */ __('Ajustes: %s'), e.message), true); });
          });
        }
        var hechas = 0;
        function marcador() { estadoRestaurar.textContent = sprintf(/* translators: 1: paso actual, 2: total de pasos */ __('Restaurando %1$d de %2$d…'), Math.min(hechas + 1, tareas.length), tareas.length); }
        marcador();
        tareas.reduce(function (cadena, t) {
          return cadena.then(t).then(function () { hechas++; barra.firstChild.style.width = Math.round(hechas / tareas.length * 100) + '%'; marcador(); });
        }, Promise.resolve()).then(terminar);
      }

      bRestaurar.addEventListener('click', function () {
        var sustituye = modo === 'sobrescribir' && nExisten;
        var bSi = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-primary', onclick: function () { confirmar.hidden = true; ejecutar(); } }, __('Sí, restaurar'));
        confirmar.innerHTML = '';
        append(confirmar, [
          h('span', { text: sustituye ? __('Lo que ya existe se sustituirá por la versión de la copia. ¿Seguimos?') : __('¿Restaurar lo marcado?') }), bSi,
          h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () { confirmar.hidden = true; acciones.hidden = false; bRestaurar.focus(); } }, __('Cancelar'))]);
        acciones.hidden = true;
        confirmar.hidden = false;
        bSi.focus();
      });

      append(opciones, [
        nExisten ? h('fieldset', { class: 'pcan-fieldset' }, h('legend', { text: __('Qué ver') }), ctrlFiltro) : null,
        copia.canciones.length ? h('fieldset', { class: 'pcan-fieldset' }, h('legend', { text: sprintf(/* translators: %d: número de canciones de la copia */ __('Canciones (%d)'), copia.canciones.length) }),
          lista(copia.canciones, elegidas, existen.canciones, function (c) {
            var nArchivos = (c.partituras || []).length + (c.audios || []).length;
            return (c.numero ? c.numero + ' · ' : '') + c.titulo + (nArchivos && copia.conArchivos ? ' · ' + sprintf(_n('%d archivo', '%d archivos', nArchivos), nArchivos) : '');
          })) : null,
        copia.cultos.length ? h('fieldset', { class: 'pcan-fieldset' }, h('legend', { text: sprintf(/* translators: %d: número de cultos de la copia */ __('Cultos (%d)'), copia.cultos.length) }),
          lista(copia.cultos, elegidos, existen.cultos, function (c) { return fechaCompleta(c.fecha) + ' · ' + c.titulo + ' · ' + sprintf(_n('%d canción', '%d canciones', (c.items || []).length), (c.items || []).length); })) : null,
        h('fieldset', { class: 'pcan-fieldset' }, h('legend', { text: __('Ajustes') }), oAjustesR.el),
        nExisten ? h('fieldset', { class: 'pcan-fieldset' }, h('legend', { text: __('Si una canción o un culto ya existe') }), modos) : null]);
      append(ventana.cuerpo, [resultado, opciones, registro]);
      append(ventana.pie, [aviso2, confirmar, h('div', { class: 'pcan-modal-progreso' }, barra, estadoRestaurar), acciones]);
      resumen();
    }

    append(cuerpo, h('div', { class: 'pcan-form' },
      h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: __('Crear una copia') }),
        h('p', { class: 'pcan-help', text: __('Se descarga un .zip con todo lo que marques. Con él puedes recuperar el cancionero aquí o continuar en otra web con WordPress y este plugin.') }),
        oCanciones.el, oArchivos.el, oCultos.el, oAjustes.el,
        barraCrear, estadoCrear,
        h('div', { class: 'pcan-actions' }, bCrear)),
      h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: __('Restaurar desde una copia') }),
        h('p', { class: 'pcan-help', text: __('Abre una copia y elige qué recuperar: todo, o solo algunas canciones o cultos. Antes de cambiar nada verás qué ya existe en esta web.') }),
        elegir, zonaRestaurar)));
  }

  // ---------------------------------------------------------------- rutas

  function ruta() {
    var hash = location.hash.replace(/^#\/?/, '');
    var m;
    alternarMenu(false);
    for (var i = 0; i < rutasExtra.length; i++) {
      if ((m = hash.match(rutasExtra[i].re))) { rutasExtra[i].fn(m); return; }
    }
    if ((m = hash.match(/^cancion\/(\d+)$/))) { verCancion(m[1]); }
    else if (hash === 'nueva') { pintarFormulario(null); }
    else if ((m = hash.match(/^editar\/(\d+)$/))) { abrirFormulario(m[1]); }
    else if ((m = hash.match(/^ajustes(?:\/([a-z]*))?$/))) { abrirAjustes(m[1] || 'general'); }
    else if (hash === 'copias') { abrirCopias(); }
    else if (hash === 'papelera') { abrirPapelera(); }
    else if (hash === 'subir') { abrirSubidaMultiple(); }
    else if (hash === 'canciones') { if (panelModo) { ocultarPanel(); } mostrarVista('canciones'); }
    else {
      if (panelModo) { ocultarPanel(); }
      if (hash === '') { mostrarVista('inicio'); }
    }
  }

  // Cada entrada del historial lleva su posición; así «Volver» sabe qué pantalla del cancionero hay detrás.
  var posicion = 0;
  var hashes = {};
  function sellarHistorial() {
    var st = history.state;
    if (st && typeof st.pcan === 'number') { posicion = st.pcan; }
    else {
      if (hashes[posicion] !== undefined) { posicion++; }
      history.replaceState({ pcan: posicion }, '', location.href);
    }
    hashes[posicion] = location.hash;
  }
  sellarHistorial();
  window.addEventListener('hashchange', sellarHistorial);
  window.addEventListener('popstate', sellarHistorial);
  window.addEventListener('hashchange', ruta);
  window.addEventListener('popstate', ruta);

  document.addEventListener('keydown', function (e) {
    if (document.querySelector('.pcan-lector')) { return; }
    var enCampo = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); abrirPaleta(); return; }
    if (paleta) { return; }
    if (e.key === 'Escape' && ui.menu && !ui.menu.hidden) { cerrarMenu(true); return; }
    if (e.key === 'Escape' && panelModo) {
      // Dentro de un campo, Escape solo sale del campo; así no se cierra un formulario por accidente.
      if (enCampo) { document.activeElement.blur(); return; }
      volverPanel();
    }
    else if (e.key === '/' && !enCampo) {
      e.preventDefault();
      abrirPaleta();
    }
  });

  // API para los demás módulos.
  var P = window.PCAN = {
    cfg: CFG,
    state: state,
    ui: ui,
    h: h,
    append: append,
    icono: icono,
    api: api,
    aviso: aviso,
    copiar: copiar,
    norm: norm,
    temaEn: temaEn,
    accionesSecundarias: accionesSecundarias,
    esAncho: esAncho,
    buscar: function (q) { return buscar(q, '').map(function (r) { return r.c; }); },
    cancion: function (id) {
      for (var i = 0; i < state.canciones.length; i++) { if (state.canciones[i].id === id) { return state.canciones[i]; } }
      return null;
    },
    abrirPanel: abrirPanel,
    cerrarPanel: cerrarPanel,
    ocultarPanel: ocultarPanel,
    cabeceraPanel: cabeceraPanel,
    marcarSeleccion: marcarSeleccion,
    alCerrarPanel: function (fn) { alCerrarPanel.push(fn); },
    marcarGuardado: function () { panelSucio = false; },
    campo: campo,
    crearEditorEscaleta: crearEditorEscaleta,
    mostrarVista: mostrarVista,
    abrirPaleta: abrirPaleta,
    tonalidades: TONALIDADES,
    tono: tonoVer,
    tonoGuardar: tonoGuardar,
    locale: LOCALE,
    __: __,
    _n: _n,
    _x: _x,
    _nx: _nx,
    sprintf: sprintf,
    sinPunto: sinPunto,
    conNodo: conNodo,
    pastillaTono: pastillaTono,
    ruta: function (re, fn) { rutasExtra.push({ re: re, fn: fn }); },
    vista: function (nombre, fn) { ganchos.vistas[nombre] = fn; },
    enFichaCancion: function (fn) { ganchos.fichaCancion.push(fn); },
    enInicio: function (fn) { ganchos.inicio.push(fn); },
    enPaleta: function (fn) { ganchos.paleta.push(fn); },
    enDetalleVacio: function (vista, fn) { ganchos.detalleVacio[vista] = fn; },
    actualizarUso: function (mapa) { state.uso = mapa || {}; state.usoCargado = true; if (ui.lista) { pintarLista(); } pintarCifras(); },
    repintarInicio: function () { if (state.vista === 'inicio') { pintarInicio(); } },
    listo: cargar().then(function () { return state.canciones; })
  };

  montar();
  aplicarTema(state.tema, false);
  pintarLista();

  // Se espera al final del documento para que los demás módulos registren sus rutas antes de la primera.
  function iniciar() {
    P.listo.then(function () {
      pintarChips();
      pintarLista();
      ruta();
      if (state.vista === 'inicio') { pintarInicio(); }
    });
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', iniciar); }
  else { setTimeout(iniciar, 0); }
})();
