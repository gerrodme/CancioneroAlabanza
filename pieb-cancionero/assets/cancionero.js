/* Cancionero · aplicación principal */
(function () {
  'use strict';

  var CFG = window.PIEB_CANCIONERO || {};
  var root = document.getElementById('pieb-cancionero');
  if (!root || !CFG.api) { return; }

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
  function pastillaTono(tono, attrs) {
    var q = quintaDe(tono);
    var a = { class: 'pcan-key', text: tono, style: q < 0 ? null : '--tono-h: ' + (q * 30) };
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
    editable: 'M6 2h8l6 6v5h-2V9h-5V4H6v16h6v2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm12.6 12 2.4 2.4-5.6 5.6H13v-2.4l5.6-5.6z'
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
        if (!r.ok) { throw new Error(data && data.message ? data.message : 'Error ' + r.status); }
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
        else if (xhr.status === 413) { reject(new Error('Los archivos son demasiado grandes para el servidor.')); }
        else { reject(new Error(data.message || 'Error ' + xhr.status + ' al guardar.')); }
      };
      xhr.onerror = function () { reject(new Error('No se pudo conectar con el servidor.')); };
      xhr.send(formData);
    });
  }

  function aviso(texto, tipo) {
    var t = h('div', { class: 'pcan-toast' + (tipo === 'error' ? ' is-error' : ''), role: 'status', text: texto });
    temaEn(t);
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('is-out'); }, 2600);
    setTimeout(function () { t.remove(); }, 3100);
  }

  function copiar(texto, mensaje) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(function () { aviso(mensaje); }, function () { aviso('No se pudo copiar', 'error'); });
    } else {
      aviso('Este navegador no permite copiar', 'error');
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
          if (reintentos > 0 && !/máximo|no es/.test(err.message)) { return enviar(/interrump/.test(err.message) ? 0 : desde, reintentos - 1); }
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
      api('preferencias', { json: { tema: nombre } }).catch(function () { aviso('No se pudo guardar el tema', 'error'); });
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
          numero: String(c.numero || '').replace(/^0+/, '')
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
    return Object.keys(cuenta).sort(function (a, b) { return a.localeCompare(b, 'es'); })
      .map(function (e) { return { nombre: e, n: cuenta[e] }; });
  }

  function buscar(query, etiqueta) {
    var q = norm(query);
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
    titulo: { texto: 'A–Z', asc: true }, numero: { texto: 'Nº himnario', asc: true }, tono: { texto: 'Tono', asc: true },
    tempo: { texto: 'Tempo', asc: true }, etiquetas: { texto: 'Etiquetas', asc: true }, recientes: { texto: 'Recientes', asc: false },
    uso: { texto: 'Más tocadas', asc: false }, partituras: { texto: 'Partituras', asc: false }, letra: { texto: 'Con letra', asc: false },
    audios: { texto: 'Audios', asc: false }, editables: { texto: 'Editables', asc: false }, youtube: { texto: 'YouTube', asc: false }
  };

  /** Valor por el que se ordena cada columna; null si la canción no tiene ese dato (va siempre al final). */
  function valorOrden(c, orden) {
    var n;
    switch (orden) {
      case 'numero': n = parseInt(c.numero, 10); return isNaN(n) ? null : n;
      case 'tono': return c.tonalidad || null;
      case 'tempo': n = parseInt(c.tempo, 10); return isNaN(n) ? null : n;
      case 'etiquetas': return c.etiquetas.length ? c.etiquetas.slice().sort(function (x, y) { return x.localeCompare(y, 'es'); })[0] : null;
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
      r = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' });
      // Sentido: el natural de la columna, o el contrario si se ha vuelto a pulsar su cabecera.
      if (ORDENES[orden].asc === state.ordenInverso) { r = -r; }
    }
    return r || a.titulo.localeCompare(b.titulo, 'es', { sensitivity: 'base' });
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
    { vista: 'inicio', href: '#/', icono: 'casa', texto: 'Inicio' },
    { vista: 'canciones', href: '#/canciones', icono: 'nota', texto: 'Canciones' },
    { vista: 'cultos', href: '#/cultos', icono: 'calendario', texto: 'Cultos' },
    { vista: 'estadisticas', href: '#/estadisticas', icono: 'grafica', texto: 'Estadísticas' }
  ];
  var VISTAS_DIVIDIDAS = { cultos: 'Elige un culto para ver su setlist' };

  /** Con espacio suficiente, la lista y la ficha se ven a la vez (como en las apps de atril para tableta). */
  function esAncho() { return root.clientWidth >= 1000; }

  function montar() {
    root.innerHTML = '';

    ui.buscador = h('input', {
      type: 'search', class: 'pcan-search-input', placeholder: 'Filtrar por título, número, letra o etiqueta',
      autocomplete: 'off', 'aria-label': 'Filtrar canciones', enterkeyhint: 'search',
      oninput: function (e) { state.query = e.target.value; pintarLista(); }
    });
    ui.contador = h('span', { class: 'pcan-count' });
    ui.orden = h('select', {
      class: 'pcan-select', 'aria-label': 'Ordenar',
      onchange: function (e) { state.orden = e.target.value; state.ordenInverso = false; pintarLista(); }
    }, Object.keys(ORDENES).map(function (k) { return h('option', { value: k, text: ORDENES[k].texto }); }));
    ui.chips = h('div', { class: 'pcan-chips', role: 'toolbar', 'aria-label': 'Filtrar por etiqueta' });
    ui.lista = h('div', { class: 'pcan-list', role: 'list' });
    ui.panel = h('div', { class: 'pcan-panel-wrap', hidden: true });

    // Barra lateral (pantallas anchas).
    ui.sideCultos = h('div', { class: 'pcan-side-cultos' });
    ui.sideUser = h('button', {
      type: 'button', class: 'pcan-side-user', 'aria-haspopup': 'true', 'aria-expanded': 'false',
      onclick: function (e) { e.stopPropagation(); alternarMenu(undefined, ui.sideUser); }
    }, h('span', { class: 'pcan-avatar', 'aria-hidden': 'true' }, iniciales(CFG.userName)),
      h('span', { class: 'pcan-side-user-text' }, h('strong', { text: CFG.userName }), h('small', { text: 'Tema y ajustes' })));
    var lateral = h('aside', { class: 'pcan-side', 'aria-label': 'Navegación del cancionero' },
      h('a', { class: 'pcan-brand', href: '#/' },
        h('span', { class: 'pcan-brand-logo', 'aria-hidden': 'true' }, icono('nota')),
        h('span', { class: 'pcan-brand-text' }, h('strong', { text: CFG.nombre || 'Cancionero' }), h('small', { text: CFG.sitio }))),
      h('button', { type: 'button', class: 'pcan-side-search', onclick: function () { abrirPaleta(); } },
        icono('buscar'), h('span', { text: 'Buscar' }), h('kbd', { text: atajo() })),
      ui.sideNav = h('nav', { class: 'pcan-side-nav', 'aria-label': 'Secciones' }, VISTAS.map(function (v) {
        return h('a', { href: v.href, class: 'pcan-side-link', 'data-vista': v.vista }, icono(v.icono), h('span', { text: v.texto }));
      })),
      h('div', { class: 'pcan-side-section' }, h('p', { class: 'pcan-side-label', text: 'Próximos cultos' }), ui.sideCultos),
      h('div', { class: 'pcan-side-foot' }, ui.sideUser));

    // Barra superior.
    ui.titulo = h('h1', { class: 'pcan-top-title' });
    ui.btnNuevo = h('a', { class: 'pcan-btn pcan-btn-primary pcan-top-nuevo', href: '#/nueva' }, icono('mas'), h('span', { text: 'Nueva canción' }));
    ui.topUser = h('button', {
      type: 'button', class: 'pcan-avatar pcan-top-avatar', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': 'Menú de ' + CFG.userName,
      onclick: function (e) { e.stopPropagation(); alternarMenu(undefined, ui.topUser); }
    }, iniciales(CFG.userName));
    var superior = h('header', { class: 'pcan-top' },
      h('a', { class: 'pcan-brand pcan-top-brand', href: '#/' },
        h('span', { class: 'pcan-brand-logo', 'aria-hidden': 'true' }, icono('nota'))),
      ui.titulo,
      h('button', { type: 'button', class: 'pcan-top-search', onclick: function () { abrirPaleta(); }, 'aria-label': 'Buscar' },
        icono('buscar'), h('span', { class: 'pcan-top-search-text', text: 'Buscar canciones, cultos o acciones' }), h('kbd', { text: atajo() })),
      ui.btnNuevo,
      ui.topUser);

    // Navegación inferior y botón flotante (móvil).
    ui.tabbar = h('nav', { class: 'pcan-tabbar', 'aria-label': 'Secciones' }, VISTAS.map(function (v) {
      return h('a', { href: v.href, class: 'pcan-tab-link', 'data-vista': v.vista }, icono(v.icono), h('span', { text: v.texto }));
    }));
    ui.fab = h('a', { class: 'pcan-fab', href: '#/nueva', 'aria-label': 'Nueva canción' }, icono('mas'));

    // Menú de usuario (temas y enlaces), compartido por la barra lateral y la superior.
    ui.menuTemas = h('div', { class: 'pcan-menu-temas', role: 'radiogroup', 'aria-label': 'Tema' });
    ui.menu = h('div', { class: 'pcan-menu', hidden: true },
      h('div', { class: 'pcan-menu-user' }, h('strong', { text: CFG.userName }), h('span', { text: CFG.sitio })),
      h('p', { class: 'pcan-menu-label', text: 'Tema' }),
      ui.menuTemas,
      h('div', { class: 'pcan-menu-sep' }),
      CFG.gestionar ? h('a', { class: 'pcan-menu-item', href: '#/ajustes' }, icono('ajustes'), 'Ajustes y equipo') : null,
      CFG.admin ? h('a', { class: 'pcan-menu-item', href: '#/copias' }, icono('descargar'), 'Copias de seguridad') : null,
      h('a', { class: 'pcan-menu-item', href: CFG.homeUrl }, icono('salir-web'), 'Volver a la web'),
      h('a', { class: 'pcan-menu-item', href: CFG.logoutUrl }, icono('salir'), 'Cerrar sesión'),
      CFG.version ? h('p', { class: 'pcan-menu-version', text: 'Cancionero ' + CFG.version }) : null);
    pintarMenuTemas();

    // Vistas.
    ui.vistaInicio = h('section', { class: 'pcan-vista', 'data-vista': 'inicio' });
    ui.vistaCanciones = h('section', { class: 'pcan-vista', 'data-vista': 'canciones', hidden: true });
    ui.vistaCultos = h('section', { class: 'pcan-vista', 'data-vista': 'cultos', hidden: true });
    ui.vistaEstadisticas = h('section', { class: 'pcan-vista', 'data-vista': 'estadisticas', hidden: true });

    ui.detalle.canciones = h('div', { class: 'pcan-split-detail', 'aria-live': 'polite' });
    ui.detalle.cultos = h('div', { class: 'pcan-split-detail', 'aria-live': 'polite' });
    ui.listaCultos = h('div', { class: 'pcan-split-list' });

    ui.resumen = h('div', { class: 'pcan-resumen', role: 'toolbar', 'aria-label': 'Filtrar por recursos' });
    ui.thead = h('div', { class: 'pcan-thead' });
    append(ui.vistaCanciones, h('div', { class: 'pcan-split' },
      h('div', { class: 'pcan-split-list' },
        ui.resumen,
        h('div', { class: 'pcan-toolbar' },
          h('label', { class: 'pcan-search' }, icono('filtro'), ui.buscador, ui.contador),
          ui.orden,
          h('a', { class: 'pcan-btn pcan-btn-sec pcan-lote-btn', href: '#/subir', title: 'Subir varias canciones de golpe', 'aria-label': 'Subida múltiple' }, icono('subir'), h('span', { class: 'pcan-lote-btn-txt', text: 'Subida múltiple' })),
          CFG.gestionar ? (ui.btnMarcar = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sec pcan-lote-btn pcan-lote-btn-borrar', title: 'Elegir canciones para borrarlas', 'aria-label': 'Borrar', 'aria-pressed': 'false', onclick: function () { alternarMarcado(); } }, icono('borrar'), h('span', { class: 'pcan-lote-btn-txt', text: 'Borrar' }))) : null),
        ui.chips,
        ui.thead,
        ui.lista,
        ui.barraMarcado = h('div', { class: 'pcan-barra-marcado', role: 'toolbar', 'aria-label': 'Canciones seleccionadas', hidden: true })),
      ui.detalle.canciones));
    append(ui.vistaCultos, h('div', { class: 'pcan-split' }, ui.listaCultos, ui.detalle.cultos));
    Object.keys(ui.detalle).forEach(vaciarDetalle);

    append(root, h('div', { class: 'pcan-shell' },
      lateral,
      h('div', { class: 'pcan-body' },
        superior,
        h('main', { class: 'pcan-main' }, ui.vistaInicio, ui.vistaCanciones, ui.vistaCultos, ui.vistaEstadisticas))));
    append(root, [ui.tabbar, ui.fab, ui.panel, ui.menu]);

    document.addEventListener('click', function (e) {
      if (!ui.menu.hidden && !ui.menu.contains(e.target)) { alternarMenu(false); }
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
        h('p', { class: 'pcan-muted' }, 'o pulsa ', h('kbd', { text: '/' }), ' para buscar')));
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
      }, h('span', { class: 'pcan-tema-muestra', 'data-muestra': clave, 'aria-hidden': 'true' }), h('span', { text: CFG.temas[clave] }), activo ? icono('check') : null));
    });
  }

  var menuOrigen = null;

  function alternarMenu(abrir, origen) {
    if (!ui.menu) { return; }
    var mostrar = abrir === undefined ? ui.menu.hidden || (origen && origen !== menuOrigen) : abrir;
    ui.menu.hidden = !mostrar;
    [ui.sideUser, ui.topUser].forEach(function (b) { if (b) { b.setAttribute('aria-expanded', mostrar && b === origen ? 'true' : 'false'); } });
    if (!mostrar) { menuOrigen = null; return; }
    menuOrigen = origen;
    // Se coloca junto al botón que lo abre: hacia arriba en la barra lateral, hacia abajo en la superior.
    var r = origen.getBoundingClientRect();
    if (origen === ui.sideUser) {
      ui.menu.style.top = '';
      ui.menu.style.bottom = (window.innerHeight - r.top + 8) + 'px';
      ui.menu.style.left = Math.max(8, r.left) + 'px';
    } else {
      ui.menu.style.bottom = '';
      ui.menu.style.top = (r.bottom + 8) + 'px';
      ui.menu.style.left = Math.max(8, r.right - 268) + 'px';
    }
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
    var nuevo = vista === 'cultos' ? { href: '#/culto/nuevo', texto: 'Nuevo culto' } : { href: '#/nueva', texto: 'Nueva canción' };
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
    var input = h('input', { type: 'search', class: 'pcan-paleta-input', placeholder: 'Busca una canción por título, número o letra… o un culto, o una acción', autocomplete: 'off', 'aria-label': 'Buscar', enterkeyhint: 'go' });
    var lista = h('div', { class: 'pcan-paleta-lista', role: 'listbox' });
    var activo = 0;
    var items = [];

    var acciones = [
      { titulo: 'Nueva canción', sub: 'Subir partitura, letra y audios', icono: 'mas', href: '#/nueva' },
      { titulo: 'Subir varias canciones', sub: 'Una canción por archivo, con su nombre como título', icono: 'subir', href: '#/subir' },
      { titulo: 'Nuevo culto', sub: 'Preparar un setlist', icono: 'calendario', href: '#/culto/nuevo' },
      { titulo: 'Estadísticas', sub: 'Qué tocamos y qué no', icono: 'grafica', href: '#/estadisticas' }
    ].concat(CFG.gestionar ? [{ titulo: 'Ajustes y equipo', sub: 'Acceso con Google, tema por defecto', icono: 'ajustes', href: '#/ajustes' }] : [])
      .concat(Object.keys(CFG.temas || {}).map(function (k) {
        return { titulo: 'Tema: ' + CFG.temas[k], sub: 'Cambiar la apariencia', icono: 'tema', fn: function () { aplicarTema(k, true); } };
      }));

    function pintar() {
      var q = input.value.trim();
      var nq = norm(q);
      items = [];
      lista.innerHTML = '';
      var grupos = [];
      var canciones = q ? buscar(q, '').slice(0, 7) : state.canciones.slice().sort(function (a, b) { return b.creada.localeCompare(a.creada); }).slice(0, 5).map(function (c) { return { c: c }; });
      if (canciones.length) {
        grupos.push({ titulo: q ? 'Canciones' : 'Añadidas recientemente', items: canciones.map(function (r) {
          return { titulo: r.c.titulo, sub: [r.c.numero ? 'Nº ' + r.c.numero : '', r.c.tonalidad, r.enLetra ? '«' + fragmentoLetra(r.c.letra, q) + '»' : ''].filter(Boolean).join(' · '), icono: 'nota', href: '#/cancion/' + r.c.id, num: r.c.numero };
        }) });
      }
      ganchos.paleta.forEach(function (fn) { var g = fn(q); if (g && g.items.length) { grupos.push(g); } });
      var acc = acciones.filter(function (a) { return !nq || norm(a.titulo + ' ' + a.sub).indexOf(nq) !== -1; });
      if (acc.length) { grupos.push({ titulo: 'Acciones', items: acc }); }

      if (!grupos.length) {
        append(lista, h('div', { class: 'pcan-paleta-vacio' }, 'Nada coincide con «' + q + '». ', h('a', { href: '#/nueva', onclick: cerrar, text: 'Añadir esta canción' })));
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
      h('div', { class: 'pcan-paleta', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Buscar' },
        h('div', { class: 'pcan-paleta-campo' }, icono('buscar'), input, h('kbd', { text: 'Esc' })),
        lista,
        h('div', { class: 'pcan-paleta-pie' }, h('span', null, h('kbd', { text: '↑' }), h('kbd', { text: '↓' }), ' moverse'), h('span', null, h('kbd', { text: '↵' }), ' abrir'))));
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
    var parte = hora < 6 ? 'Buenas noches' : hora < 13 ? 'Buenos días' : hora < 21 ? 'Buenas tardes' : 'Buenas noches';
    return parte + ', ' + String(CFG.userName || '').split(' ')[0];
  }

  /** Cifras del repertorio en inicio; cada una abre Canciones con el filtro correspondiente. */
  function pintarCifras() {
    if (!ui.cifras) { return; }
    var cs = state.canciones;
    var cuenta = function (fn) { return cs.filter(fn).length; };
    var datos = cs.length ? [
      ['Canciones', cs.length, ''],
      ['Con audio', cuenta(function (c) { return c.audios; }), 'audio'],
      ['Con letra', cuenta(function (c) { return c.letra; }), 'letra'],
      state.usoCargado ? ['Nunca tocadas', cuenta(function (c) { return !state.uso[c.id]; }), 'nunca'] : ['Con YouTube', cuenta(function (c) { return c.youtube; }), 'youtube']
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
    var hoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    var heroe = h('div', { class: 'pcan-home-hero' });
    var tarjetas = h('div', { class: 'pcan-home-grid' });
    ui.cifras = h('div', { class: 'pcan-home-cifras', 'aria-label': 'El repertorio en cifras' });
    pintarCifras();

    var recientes = state.canciones.slice().sort(function (a, b) { return b.creada.localeCompare(a.creada); }).slice(0, 5);
    append(tarjetas, h('section', { class: 'pcan-home-card' },
      h('header', { class: 'pcan-home-card-head' }, h('h2', { text: 'Añadidas recientemente' }), h('a', { href: '#/canciones', text: 'Ver todas' })),
      recientes.length ? h('ul', { class: 'pcan-mini-lista' }, recientes.map(function (c) {
        return h('li', null, h('a', { href: '#/cancion/' + c.id },
          h('span', { class: 'pcan-num is-sm' + (c.numero ? '' : ' is-empty') }, c.numero ? c.numero : icono('nota')),
          h('span', { class: 'pcan-mini-texto' }, h('strong', { text: c.titulo }), h('span', { text: [c.autor, c.tonalidad].filter(Boolean).join(' · ') || 'Sin datos adicionales' }))));
      })) : h('p', { class: 'pcan-muted', text: 'Aún no hay canciones.' })));

    append(cont, h('div', { class: 'pcan-home' },
      h('div', { class: 'pcan-home-saludo' }, h('p', { class: 'pcan-home-fecha', text: hoy.charAt(0).toUpperCase() + hoy.slice(1) }), h('h1', { text: saludo() })),
      h('button', { type: 'button', class: 'pcan-home-buscar', onclick: function () { abrirPaleta(); } },
        icono('buscar'), h('span', { text: '¿Qué canción buscas?' }), h('kbd', { text: atajo() })),
      heroe,
      h('div', { class: 'pcan-home-atajos' },
        h('a', { class: 'pcan-atajo', href: '#/nueva' }, h('span', { class: 'pcan-atajo-ico' }, icono('mas')), h('span', null, h('strong', { text: 'Nueva canción' }), h('small', { text: 'Partitura, letra y audios' }))),
        h('a', { class: 'pcan-atajo', href: '#/culto/nuevo' }, h('span', { class: 'pcan-atajo-ico' }, icono('calendario')), h('span', null, h('strong', { text: 'Nuevo culto' }), h('small', { text: 'Preparar el setlist' }))),
        h('a', { class: 'pcan-atajo', href: '#/estadisticas' }, h('span', { class: 'pcan-atajo-ico' }, icono('grafica')), h('span', null, h('strong', { text: 'Estadísticas' }), h('small', { text: 'Qué tocamos y qué no' })))),
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
    append(ui.chips, chip('Todas', '', state.canciones.length));
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

  function fechaCorta(iso) {
    var p = String(iso || '').slice(0, 10).split('-');
    if (p.length < 3) { return ''; }
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
  }

  /** Resumen de la biblioteca: cada cifra es también un filtro. */
  function pintarResumen() {
    ui.resumen.innerHTML = '';
    var total = state.canciones.length;
    var cuenta = function (fn) { return state.canciones.filter(fn).length; };
    var tarjetas = [
      { id: '', texto: 'Canciones', n: total, icono: 'nota' },
      { id: 'letra', texto: 'Con letra', n: cuenta(function (c) { return c.letra; }), icono: 'letra' },
      { id: 'audio', texto: 'Con audio', n: cuenta(function (c) { return c.audios; }), icono: 'audio' },
      { id: 'editable', texto: 'Con editable', n: cuenta(function (c) { return c.editables; }), icono: 'editable' },
      { id: 'youtube', texto: 'Con YouTube', n: cuenta(function (c) { return c.youtube; }), icono: 'youtube' }
    ];
    if (state.usoCargado) {
      tarjetas.push({ id: 'nunca', texto: 'Nunca tocadas', n: cuenta(function (c) { return !state.uso[c.id]; }), icono: 'calendario' });
    }
    tarjetas.forEach(function (t) {
      var activo = state.filtro === t.id;
      append(ui.resumen, h('button', {
        type: 'button', class: 'pcan-resumen-item' + (activo ? ' is-active' : ''), 'aria-pressed': activo ? 'true' : 'false',
        title: t.id ? 'Mostrar solo: ' + t.texto.toLowerCase() : 'Mostrar todas',
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
        title: 'Ordenar por ' + titulo + (activo ? ' (pulsa otra vez para invertir)' : ''),
        onclick: function () { ordenarPor(orden); }
      }, contenido, flecha(orden));
    }
    var col = function (clase, texto, orden) { return boton(clase, orden, texto.toLowerCase(), texto); };
    var rec = function (orden, nombre, ico) { return boton('pcan-th-rec', orden, nombre, icono(ico)); };
    append(ui.thead, [
      col('pcan-c-num', 'Nº', 'numero'),
      col('pcan-c-titulo', 'Título', 'titulo'),
      col('pcan-c-tono', 'Tono', 'tono'),
      col('pcan-c-tempo', 'Tempo', 'tempo'),
      col('pcan-c-tags', 'Etiquetas', 'etiquetas'),
      h('span', { class: 'pcan-c-rec' },
        rec('partituras', 'partituras', 'partitura'), rec('letra', 'letra', 'letra'), rec('audios', 'audios', 'audio'),
        rec('editables', 'partituras editables', 'editable'), rec('youtube', 'vídeos de YouTube', 'youtube')),
      col('pcan-c-uso', 'Tocada', 'uso'),
      col('pcan-c-fecha', 'Añadida', 'recientes')
    ]);
  }

  function puntoRecurso(n, nombre, singular, plural, extra) {
    return h('span', { class: 'pcan-dot' + (n ? ' is-on' : '') + (extra || ''), title: n ? n + ' ' + (n === 1 ? singular : plural) : 'Sin ' + singular },
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
      h('span', { class: 'pcan-barra-n', text: ids.length ? ids.length + (ids.length === 1 ? ' seleccionada' : ' seleccionadas') : 'Toca las canciones que quieras borrar' }),
      visibles.length ? h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () {
        visibles.forEach(function (id) { marcadas[id] = !todas; });
        pintarLista();
      } }, todas ? 'Quitar la selección' : 'Seleccionar las ' + visibles.length + ' de la lista') : null,
      h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-danger', disabled: !ids.length, onclick: function () { confirmar.hidden = false; } }, icono('borrar'), 'Borrar'),
      h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () { alternarMarcado(false); } }, 'Cancelar'),
      confirmar]);
    append(confirmar, [
      h('span', { text: 'Se moverán ' + ids.length + (ids.length === 1 ? ' canción' : ' canciones') + ' a la papelera de WordPress: dejan de verse en el cancionero y en los setlists aparecerán como eliminadas. Se pueden recuperar desde la papelera durante 30 días.' }),
      h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-primary', onclick: function (e) { e.currentTarget.disabled = true; borrarMarcadas(ids, confirmar); } }, 'Sí, borrar'),
      h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () { confirmar.hidden = true; } }, 'No')]);
  }

  function borrarMarcadas(ids, caja) {
    var hechas = 0, fallos = 0;
    ids.reduce(function (cadena, id) {
      return cadena.then(function () {
        caja.firstChild.textContent = 'Borrando ' + (hechas + 1) + ' de ' + ids.length + '…';
        return api('canciones/' + id, { method: 'DELETE' }).then(null, function () { fallos++; }).then(function () { hechas++; });
      });
    }, Promise.resolve()).then(function () {
      var ok = ids.length - fallos;
      aviso(ok + (ok === 1 ? ' canción movida' : ' canciones movidas') + ' a la papelera' + (fallos ? ' · ' + fallos + ' no se pudieron borrar' : ''), fallos ? 'error' : undefined);
      alternarMarcado(false);
      return cargar().then(function () { pintarChips(); pintarLista(); });
    });
  }

  function pintarLista() {
    ui.lista.innerHTML = '';
    pintarBarraMarcado([]);
    pintarResumen();
    pintarCabecera();

    if (!state.cargado) { append(ui.lista, h('div', { class: 'pcan-empty', text: 'Cargando canciones…' })); return; }
    if (state.error) { append(ui.lista, h('div', { class: 'pcan-empty is-error', text: 'No se pudieron cargar las canciones: ' + state.error })); return; }

    var res = buscar(state.query, state.etiqueta).filter(function (r) { return pasaFiltro(r.c); });
    ui.contador.textContent = String(res.length);
    ui.contador.title = res.length + (res.length === 1 ? ' canción' : ' canciones');
    ui.thead.hidden = !res.length;

    if (!state.canciones.length) {
      append(ui.lista, h('div', { class: 'pcan-empty' },
        h('p', { text: 'Todavía no hay canciones.' }),
        h('a', { class: 'pcan-btn pcan-btn-primary', href: '#/nueva' }, icono('mas'), 'Subir la primera')));
      return;
    }
    if (!res.length) {
      append(ui.lista, h('div', { class: 'pcan-empty' },
        h('p', { text: state.query ? 'Ninguna canción coincide con «' + state.query + '».' : 'Ninguna canción cumple este filtro.' }),
        state.filtro || state.etiqueta
          ? h('button', { type: 'button', class: 'pcan-btn', onclick: function () { state.filtro = ''; state.etiqueta = ''; pintarChips(); pintarLista(); } }, 'Quitar filtros')
          : h('a', { class: 'pcan-btn', href: '#/nueva' }, icono('mas'), 'Añadirla al cancionero')));
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
          : h('span', { class: 'pcan-num' + (c.numero ? '' : ' is-empty'), 'aria-label': c.numero ? 'Número ' + c.numero : null },
            c.numero ? c.numero : icono('nota')),
        h('span', { class: 'pcan-row-main' },
          h('span', { class: 'pcan-row-title' }, resaltar(c.titulo, state.query)),
          c.autor ? h('span', { class: 'pcan-row-autor', text: c.autor }) : null,
          snippet ? h('span', { class: 'pcan-row-snippet' }, '«', resaltar(snippet, state.query), '»') : null),
        h('span', { class: 'pcan-row-meta' },
          h('span', { class: 'pcan-c-tono' }, c.tonalidad ? pastillaTono(c.tonalidad) : null),
          h('span', { class: 'pcan-c-tempo', title: c.tempo ? c.tempo + ' pulsaciones por minuto' : null, text: c.tempo ? '♩ ' + c.tempo : '' }),
          h('span', { class: 'pcan-c-tags' }, c.etiquetas.map(function (e) { return h('span', { class: 'pcan-tag', style: estiloEtiqueta(e), text: e }); }))),
        h('span', { class: 'pcan-c-rec' },
          puntoRecurso(c.partituras, 'partitura', 'partitura', 'partituras'),
          puntoRecurso(c.letra ? 1 : 0, 'letra', 'letra', 'letras'),
          puntoRecurso(c.audios, 'audio', 'audio', 'audios'),
          puntoRecurso(c.editables, 'editable', 'partitura editable', 'partituras editables'),
          puntoRecurso(c.youtube, 'youtube', 'vídeo', 'vídeos', c.youtube ? ' is-yt' : '')),
        h('span', { class: 'pcan-c-uso' + (uso ? '' : ' is-nunca') },
          !state.usoCargado ? '' : uso ? [h('strong', { text: uso.n + (uso.n === 1 ? ' vez' : ' veces') }), ' · ' + fechaCorta(uso.ultima)] : 'Nunca'),
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
   * opciones: { vista: 'canciones'|'cultos', id: n, modal: bool }
   * En pantallas anchas la ficha aparece junto a la lista; en móvil, como una página encima.
   */
  function abrirPanel(contenido, etiqueta, opciones) {
    opciones = opciones && typeof opciones === 'object' ? opciones : {};
    if (!panelModo || panelModo === 'split') { ultimoFoco = document.activeElement; }
    limpiarPanel();

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
    } else {
      if ((panelModo === 'split' || panelModo === 'pagina') && panelVista) { vaciarDetalle(panelVista); }
      ui.panel.className = 'pcan-panel-wrap' + (opciones.modal ? ' is-modal' : '');
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

  function limpiarPanel() {
    alCerrarPanel.forEach(function (fn) { fn(); });
    alCerrarPanel = [];
    ui.panel.innerHTML = '';
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
      if (panelSucio && !window.confirm('¿Cerrar sin guardar los cambios?')) { return; }
      panelSucio = false;
      history.back();
      return;
    }
    cerrarPanel();
  }

  function cerrarPanel() {
    if (panelSucio && !window.confirm('¿Cerrar sin guardar los cambios?')) { return; }
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
      h('button', { type: 'button', class: 'pcan-icon-btn pcan-panel-back', 'aria-label': 'Volver', onclick: function () { volverPanel(); } }, icono('anterior')),
      h('div', { class: 'pcan-panel-title' }, titulo),
      extra || null,
      h('button', { type: 'button', class: 'pcan-icon-btn pcan-panel-x', 'aria-label': 'Cerrar', onclick: function () { volverPanel(); } }, icono('cerrar')));
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
    abrirPanel(h('div', { class: 'pcan-panel-loading', text: 'Cargando canción…' }), 'Canción', { vista: 'canciones', id: id });
    api('canciones/' + id).then(function (c) { pintarFicha(c); })
      .catch(function (e) {
        abrirPanel([cabeceraPanel(h('h2', { text: 'Canción no disponible' })), h('div', { class: 'pcan-panel-body' }, h('p', { text: e.message }))], 'Error', { vista: 'canciones' });
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
      !c.letra ? { texto: 'Letra', icono: 'letra' } : null,
      !c.audios.length ? { texto: 'Audio', icono: 'audio' } : null,
      !c.youtube.length ? { texto: 'Vídeo', icono: 'youtube' } : null
    ].filter(Boolean);

    var cabecera = h('div', { class: 'pcan-det-hero' },
      h('div', { class: 'pcan-det-kicker' },
        c.numero ? h('span', { class: 'pcan-det-num', text: 'Nº ' + c.numero }) : null,
        c.etiquetas.map(function (e) {
          return h('button', {
            type: 'button', class: 'pcan-tag is-link', style: estiloEtiqueta(e), title: 'Ver canciones con esta etiqueta',
            onclick: function () { state.etiqueta = e; state.query = ''; ui.buscador.value = ''; pintarChips(); pintarLista(); cerrarPanel(); mostrarVista('canciones'); }
          }, e);
        })),
      h('h2', { class: 'pcan-det-titulo', text: c.titulo }),
      h('p', { class: 'pcan-det-meta' },
        c.tonalidad ? pastillaTono(c.tonalidad, { class: 'is-lg', title: 'Tonalidad' }) : null,
        c.tempo ? h('span', { class: 'pcan-tempo', title: c.tempo + ' pulsaciones por minuto', text: '♩ = ' + c.tempo }) : null,
        c.autor ? h('span', { text: c.autor }) : null,
        c.subidaPor ? h('span', { class: 'pcan-muted', text: 'Subida por ' + c.subidaPor }) : null));

    var acciones = h('div', { class: 'pcan-det-actions' },
      c.partituras.length ? h('button', { type: 'button', class: 'pcan-btn pcan-btn-primary pcan-btn-lg', onclick: function () { lectorDeCancion(c); } }, icono('play'), 'Tocar') : null,
      h('a', { class: 'pcan-btn', href: '#/editar/' + c.id }, icono('editar'), h('span', { class: 'pcan-btn-label', text: 'Editar' })),
      accionesSecundarias([
        { texto: 'Copiar enlace', icono: 'enlace', fn: function () { copiar(enlaceCancion(c.id), 'Enlace copiado'); } },
        c.partituras[0] ? { texto: 'Descargar partitura', icono: 'descargar', href: c.partituras[0].url, descargar: c.partituras[0].archivo || true } : null,
        c.partituras[0] ? { texto: 'Abrir el PDF original', icono: 'abrir', href: c.partituras[0].url, nueva: true } : null,
        c.letra ? { texto: 'Copiar letra', icono: 'copiar', fn: function () { copiar(c.letra, 'Letra copiada'); } } : null,
        c.puedeBorrar ? { texto: 'Borrar canción', icono: 'borrar', peligro: true, fn: function () { borrarCancion(c); } } : null
      ]));

    var principal = h('div', { class: 'pcan-det-main' },
      seccion('Partitura', 'partitura', vistaPartituras(c, function (v) { visor = v; })));

    // En pantallas anchas la partitura ocupa la columna izquierda desde arriba y todo lo demás va a la derecha;
    // en móvil la columna lateral se «disuelve» y se mantiene el orden cabecera, acciones, uso, partitura, resto.
    var lateral = h('div', { class: 'pcan-det-side' },
      cabecera, acciones, extra,
      faltan.length ? h('div', { class: 'pcan-faltan' },
        h('span', { text: 'Completa la ficha:' }),
        faltan.map(function (f) { return h('a', { class: 'pcan-chip is-dashed', href: '#/editar/' + c.id }, icono('mas'), f.texto); })) : null,
      c.audios.length ? seccion('Audios', 'audio', vistaAudios(c)) : null,
      c.editables && c.editables.length ? seccion('Partituras editables', 'editable', vistaEditables(c)) : null,
      c.letra ? seccion('Letra', 'letra', vistaLetra(c),
        h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-ghost', onclick: function () { copiar(c.letra, 'Letra copiada'); } }, icono('copiar'), 'Copiar')) : null,
      c.youtube.length ? seccion('Versiones en YouTube', 'youtube', vistaYoutube(c)) : null,
      c.notas ? seccion('Notas para el equipo', 'editar', h('div', { class: 'pcan-notas', text: c.notas })) : null);

    abrirPanel([
      cabeceraPanel(h('span', { class: 'pcan-panel-crumb', text: 'Canción' })),
      h('div', { class: 'pcan-panel-body' }, h('div', { class: 'pcan-det-grid' }, principal, lateral))
    ], c.titulo, { vista: 'canciones', id: c.id });

    alCerrarPanel.push(function () { if (visor) { visor.destruir(); visor = null; } });
    ganchos.fichaCancion.forEach(function (fn) { fn(c, extra); });
  }

  function vistaPartituras(c, alVisor) {
    if (!c.partituras.length) { return h('p', { class: 'pcan-muted', text: 'Esta canción no tiene partitura.' }); }
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
          ? h('iframe', { class: 'pcan-pdf', src: p.url + '#view=FitH', title: 'Partitura de ' + c.titulo, loading: 'lazy' })
          : h('img', { class: 'pcan-img', src: p.url, alt: 'Partitura de ' + c.titulo }));
      }
    }

    if (c.partituras.length > 1) {
      c.partituras.forEach(function (p, i) {
        append(selector, h('button', { type: 'button', class: 'pcan-seg', onclick: function () { ver(i); } }, p.label || 'Partitura ' + (i + 1)));
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
      return h('a', { class: 'pcan-editable', href: e.url, download: e.archivo || true, title: 'Descargar ' + e.archivo },
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
          h('a', { class: 'pcan-icon-btn', href: a.url, download: a.archivo || true, 'aria-label': 'Descargar ' + (a.nombre || a.archivo) }, icono('descargar'))),
        h('audio', { controls: true, preload: 'none', src: a.url }));
    }));
  }

  function vistaYoutube(c) {
    return h('div', { class: 'pcan-videos' }, c.youtube.map(function (y) {
      var caja = h('div', { class: 'pcan-video' });
      // Miniatura con botón: el reproductor solo se carga al pulsar.
      var lanzar = h('button', {
        type: 'button', class: 'pcan-video-thumb', 'aria-label': 'Reproducir ' + (y.label || 'vídeo'),
        onclick: function () {
          lanzar.replaceWith(h('iframe', {
            src: 'https://www.youtube-nocookie.com/embed/' + y.videoId + '?autoplay=1&rel=0',
            title: y.label || c.titulo, allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true
          }));
        }
      }, h('img', { src: 'https://i.ytimg.com/vi/' + y.videoId + '/mqdefault.jpg', alt: '', loading: 'lazy' }), h('span', { class: 'pcan-play' }, icono('play')));
      append(caja, [y.videoId ? lanzar : null,
        h('div', { class: 'pcan-video-cap' },
          h('span', { text: y.label || 'Versión de referencia' }),
          h('a', { href: y.url, target: '_blank', rel: 'noopener', text: 'YouTube' }))]);
      return caja;
    }));
  }

  function borrarCancion(c) {
    if (!window.confirm('¿Borrar «' + c.titulo + '»? Un administrador podrá recuperarla desde la papelera.')) { return; }
    api('canciones/' + c.id, { method: 'DELETE' }).then(function () {
      aviso('Canción borrada');
      cerrarPanel();
      cargar().then(function () { pintarChips(); pintarLista(); });
    }).catch(function (e) { aviso(e.message, 'error'); });
  }

  // ---------------------------------------------------------------- vista: formulario de canción

  function abrirFormulario(id) {
    if (!id) { pintarFormulario(null); return; }
    abrirPanel(h('div', { class: 'pcan-panel-loading', text: 'Cargando canción…' }), 'Editar canción', { vista: 'canciones', id: id });
    api('canciones/' + id).then(pintarFormulario).catch(function (e) { aviso(e.message, 'error'); cerrarPanel(); });
  }

  function campo(label, input, ayuda, requerido) {
    return h('label', { class: 'pcan-field' },
      h('span', { class: 'pcan-label' }, label, requerido ? h('abbr', { title: 'obligatorio', text: ' *' }) : null),
      input,
      ayuda ? h('span', { class: 'pcan-help', text: ayuda }) : null);
  }

  /** Zona de «elegir o arrastrar archivos». */
  function zonaArchivos(accept, texto, ayuda, alElegir) {
    var input = h('input', { type: 'file', class: 'pcan-file-hidden', multiple: true, accept: accept });
    var zona = h('label', { class: 'pcan-drop' }, input, icono('subir'),
      h('span', null, h('strong', { text: texto }), ' o arrastrar aquí'),
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
        append(duplicados, ['¿Ya existe? ', parecidas.map(function (it, i) {
          return [i ? ', ' : '', h('a', { href: '#/cancion/' + it.c.id, text: it.c.titulo })];
        })]);
      }
    });

    var fNumero = h('input', { type: 'text', class: 'pcan-input', value: c.numero, inputmode: 'numeric', maxlength: '20' });
    var fTempo = h('input', { type: 'number', class: 'pcan-input', value: c.tempo || '', min: '20', max: '400', step: '1', inputmode: 'numeric', placeholder: 'p. ej. 72' });
    var fAutor = h('input', { type: 'text', class: 'pcan-input', value: c.autor, maxlength: '200' });
    var listaTonos = h('datalist', { id: 'pcan-tonos' }, TONALIDADES.map(function (t) { return h('option', { value: t }); }));
    var fTono = h('input', { type: 'text', class: 'pcan-input', value: c.tonalidad, list: 'pcan-tonos', maxlength: '20' });
    var fLetra = h('textarea', { class: 'pcan-input pcan-textarea', rows: '10' });
    fLetra.value = c.letra;
    var fNotas = h('textarea', { class: 'pcan-input pcan-textarea', rows: '3' });
    fNotas.value = c.notas || '';

    // Etiquetas tipo «chip».
    var tagBox = h('div', { class: 'pcan-taginput' });
    var listaEtiquetas = h('datalist', { id: 'pcan-etiquetas' }, etiquetasTodas().map(function (e) { return h('option', { value: e.nombre }); }));
    var tagInput = h('input', { type: 'text', class: 'pcan-taginput-field', list: 'pcan-etiquetas', placeholder: 'Navidad, Santa Cena, alabanza…', 'aria-label': 'Añadir etiqueta' });
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
          h('button', { type: 'button', class: 'pcan-tag-x', 'aria-label': 'Quitar ' + e, onclick: function () { etiquetas.splice(i, 1); pintarTags(); } }, '×')));
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

    function archivoValido(f, extensiones, nombreTipo, max) {
      if (!extensiones.test(f.name)) { aviso('«' + f.name + '» no es ' + nombreTipo, 'error'); return false; }
      if (max && f.size > max) { aviso('«' + f.name + '» pesa ' + tamano(f.size) + '; el máximo es ' + tamano(max), 'error'); return false; }
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
        h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': 'Quitar ' + nombre, onclick: quitar }, icono('cerrar')));
    }

    // Partituras.
    var listaPartituras = h('div', { class: 'pcan-files' });
    var zonaPartituras = zonaArchivos('.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png', 'Elegir partituras',
      'PDF, JPG o PNG · máx. ' + tamano(CFG.maxPartitura) + ' por archivo', function (files) {
        Array.prototype.forEach.call(files, function (f) {
          if (archivoValido(f, /\.(pdf|jpe?g|png)$/i, 'PDF, JPG ni PNG', CFG.maxPartitura)) { nuevas.push({ file: f, label: '' }); }
        });
        pintarPartituras();
      });

    function pintarPartituras() {
      listaPartituras.innerHTML = '';
      existentes.forEach(function (p, i) {
        append(listaPartituras, filaArchivo('partitura', p.archivo || 'Partitura', h('a', { href: p.url, target: '_blank', rel: 'noopener', class: 'pcan-file-ver', text: 'ver' }),
          campoTexto(p, 'label', 'Descripción (p. ej. «Original», «En Sol», «Acordes»)', 'Descripción de ' + p.archivo),
          function () { existentes.splice(i, 1); pintarPartituras(); }));
      });
      nuevas.forEach(function (n, i) {
        append(listaPartituras, filaArchivo('partitura', n.file.name, h('span', { class: 'pcan-file-new', text: 'nueva · ' + tamano(n.file.size) }),
          campoTexto(n, 'label', 'Descripción (p. ej. «Original», «En Sol», «Acordes»)', 'Descripción de ' + n.file.name),
          function () { nuevas.splice(i, 1); pintarPartituras(); }));
      });
    }
    pintarPartituras();

    // Audios: nombre y descripción personalizables.
    var listaAudios = h('div', { class: 'pcan-files' });
    var zonaAudios = zonaArchivos('.mp3,.m4a,.ogg,.oga,.wav,.aac,audio/*', 'Elegir audios',
      'MP3, M4A, OGG, WAV o AAC · máx. ' + tamano(CFG.maxAudio) + ' por archivo', function (files) {
        Array.prototype.forEach.call(files, function (f) {
          if (archivoValido(f, /\.(mp3|m4a|m4b|ogg|oga|wav|aac)$/i, 'un audio MP3, M4A, OGG, WAV o AAC', CFG.maxAudio)) {
            audiosNuevos.push({ file: f, nombre: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), descripcion: '' });
          }
        });
        pintarAudios();
      });

    function camposAudio(a) {
      return h('div', { class: 'pcan-audio-campos' },
        campoTexto(a, 'nombre', 'Nombre (p. ej. «Ensayo voces»)', 'Nombre del audio'),
        campoTexto(a, 'descripcion', 'Descripción (opcional)', 'Descripción del audio'));
    }

    function pintarAudios() {
      listaAudios.innerHTML = '';
      audiosExistentes.forEach(function (a, i) {
        append(listaAudios, filaArchivo('audio', a.archivo || 'Audio', h('a', { href: a.url, target: '_blank', rel: 'noopener', class: 'pcan-file-ver', text: 'escuchar' }),
          camposAudio(a), function () { audiosExistentes.splice(i, 1); pintarAudios(); }));
      });
      audiosNuevos.forEach(function (a, i) {
        append(listaAudios, filaArchivo('audio', a.file.name, h('span', { class: 'pcan-file-new', text: 'nuevo · ' + tamano(a.file.size) }),
          camposAudio(a), function () { audiosNuevos.splice(i, 1); pintarAudios(); }));
      });
    }
    pintarAudios();

    // Partituras editables (MuseScore, MusicXML…): adjuntos para descargar, con una descripción opcional.
    var listaEditables = h('div', { class: 'pcan-files' });
    var extensionesEditables = Object.keys(PROGRAMAS_EDITABLES);
    var zonaEditables = zonaArchivos(extensionesEditables.map(function (e) { return '.' + e; }).join(','), 'Elegir archivos editables',
      'MuseScore, MusicXML, Sibelius, Finale, Dorico, Guitar Pro, MIDI… · máx. ' + tamano(CFG.maxEditable) + ' por archivo', function (files) {
        Array.prototype.forEach.call(files, function (f) {
          if (archivoValido(f, new RegExp('\\.(' + extensionesEditables.join('|') + ')$', 'i'), 'una partitura editable (MuseScore, MusicXML, Sibelius, Finale…)', CFG.maxEditable)) {
            editablesNuevos.push({ file: f, descripcion: '' });
          }
        });
        pintarEditables();
      });

    function pintarEditables() {
      listaEditables.innerHTML = '';
      editablesExistentes.forEach(function (e, i) {
        append(listaEditables, filaArchivo('editable', e.archivo || 'Archivo', h('a', { href: e.url, download: e.archivo || true, class: 'pcan-file-ver', text: 'descargar' }),
          campoTexto(e, 'descripcion', 'Descripción (p. ej. «Arreglo coro», «En Sol»)', 'Descripción de ' + e.archivo),
          function () { editablesExistentes.splice(i, 1); pintarEditables(); }));
      });
      editablesNuevos.forEach(function (e, i) {
        append(listaEditables, filaArchivo('editable', e.file.name, h('span', { class: 'pcan-file-new', text: 'nuevo · ' + tamano(e.file.size) }),
          campoTexto(e, 'descripcion', 'Descripción (p. ej. «Arreglo coro», «En Sol»)', 'Descripción de ' + e.file.name),
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
          type: 'url', class: 'pcan-input', value: v.url, placeholder: 'https://www.youtube.com/watch?v=…', 'aria-label': 'Enlace de YouTube',
          oninput: function (e) { v.url = e.target.value; url.classList.toggle('is-invalid', !!v.url && !youtubeId(v.url)); }
        });
        append(listaVideos, h('div', { class: 'pcan-yt-row' },
          url,
          h('input', { type: 'text', class: 'pcan-input', value: v.label, placeholder: 'Descripción (coro, piano…)', 'aria-label': 'Descripción del vídeo', oninput: function (e) { v.label = e.target.value; } }),
          h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': 'Quitar enlace', onclick: function () { videos.splice(i, 1); pintarVideos(); } }, icono('cerrar'))));
      });
      append(listaVideos, h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () { videos.push({ url: '', label: '' }); pintarVideos(); listaVideos.querySelector('.pcan-yt-row:last-of-type input').focus(); } }, icono('mas'), 'Añadir enlace'));
    }
    pintarVideos();

    var errorBox = h('div', { class: 'pcan-form-error', role: 'alert', hidden: true });
    var progreso = h('div', { class: 'pcan-progress', hidden: true }, h('span'));
    var guardar = h('button', { type: 'submit', class: 'pcan-btn pcan-btn-primary' }, editando ? 'Guardar cambios' : 'Guardar canción');

    // Dos columnas en pantallas anchas (datos y letra | archivos y enlaces); en móvil, una sola en el orden de siempre.
    var form = h('form', { class: 'pcan-form pcan-form-cancion', novalidate: true },
      h('div', { class: 'pcan-form-col pcan-form-col-main' },
        h('div', { class: 'pcan-grid-2 pcan-form-datos' },
          h('div', { class: 'pcan-span-2' }, campo('Título', fTitulo, null, true), duplicados),
          campo('Número de himnario', fNumero),
          campo('Tonalidad', h('span', null, fTono, listaTonos)),
          campo('Tempo (BPM)', fTempo),
          campo('Autor / compositor', fAutor)),
        h('fieldset', { class: 'pcan-fieldset pcan-form-letra' },
          h('legend', { text: 'Letra' }),
          fLetra,
          h('p', { class: 'pcan-help', text: 'Opcional. Separa las estrofas con una línea en blanco. La letra también se usa en la búsqueda.' })),
        h('fieldset', { class: 'pcan-fieldset pcan-form-notas' },
          h('legend', { text: 'Notas para el equipo' }),
          fNotas)),
      h('div', { class: 'pcan-form-col pcan-form-col-side' },
        h('fieldset', { class: 'pcan-fieldset pcan-form-partituras' },
          h('legend', null, 'Partitura', h('abbr', { title: 'obligatorio', text: ' *' })),
          h('p', { class: 'pcan-help', text: 'Puedes subir varias: la original, en otra tonalidad, con acordes…' }),
          listaPartituras, zonaPartituras,
          !editando ? h('p', { class: 'pcan-help' }, '¿Son varias canciones distintas? ', h('a', { href: '#/subir', text: 'Súbelas de golpe' }), '.') : null),
        h('fieldset', { class: 'pcan-fieldset pcan-form-audios' },
          h('legend', { text: 'Audios' }),
          h('p', { class: 'pcan-help', text: 'Ensayos, voces por separado, pistas… Ponle a cada uno un nombre y, si quieres, una descripción.' }),
          listaAudios, zonaAudios),
        h('fieldset', { class: 'pcan-fieldset pcan-form-editables' },
          h('legend', { text: 'Partituras editables' }),
          h('p', { class: 'pcan-help', text: 'Opcional: el archivo original para quien quiera modificar o transportar la partitura (MuseScore, Sibelius, Finale…). Se descargan; la partitura que se ve sigue siendo el PDF o la imagen.' }),
          listaEditables, zonaEditables),
        h('fieldset', { class: 'pcan-fieldset pcan-form-etiquetas' },
          h('legend', { text: 'Etiquetas' }),
          tagBox, listaEtiquetas,
          h('p', { class: 'pcan-help', text: 'Pulsa Intro o coma para añadir cada etiqueta.' })),
        h('fieldset', { class: 'pcan-fieldset pcan-form-videos' },
          h('legend', { text: 'Vídeos de YouTube' }),
          listaVideos)),
      errorBox,
      progreso,
      h('div', { class: 'pcan-form-actions' },
        guardar,
        h('button', { type: 'button', class: 'pcan-btn', onclick: function () { if (editando) { location.hash = '#/cancion/' + c.id; } else { cerrarPanel(); } } }, 'Cancelar')));

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (tagInput.value) { addTag(tagInput.value); }
      var errores = [];
      if (!fTitulo.value.trim()) { errores.push('Escribe el título.'); }
      if (!existentes.length && !nuevas.length) { errores.push('Añade al menos una partitura.'); }
      if (videos.some(function (v) { return v.url && !youtubeId(v.url); })) { errores.push('Hay enlaces que no son de YouTube.'); }
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
          guardar.textContent = 'Subiendo ' + p.item.file.name + '…';
          return subirPorTrozos(p.item.file, p.tipo, function (f) {
            progreso.firstChild.style.width = Math.round((hechos + f * p.item.file.size) / bytes * 100) + '%';
          }).then(function (id) { p.item.subida = id; hechos += p.item.file.size; });
        });
      }, Promise.resolve()).then(function () {
        guardar.textContent = 'Guardando…';
        return apiSubir(editando ? 'canciones/' + c.id : 'canciones', datosCancion());
      }).then(function (guardada) {
        panelSucio = false;
        aviso(editando ? 'Cambios guardados' : 'Canción añadida');
        return cargar().then(function () {
          pintarChips(); pintarLista();
          location.hash = '#/cancion/' + guardada.id;
        });
      }).catch(function (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
        guardar.disabled = false;
        guardar.textContent = editando ? 'Guardar cambios' : 'Guardar canción';
        progreso.hidden = true;
      });
    });

    function datosCancion() {
      var fd = new FormData();
      fd.append('titulo', fTitulo.value.trim());
      fd.append('numero', fNumero.value.trim());
      fd.append('autor', fAutor.value.trim());
      fd.append('tonalidad', fTono.value.trim());
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
      cabeceraPanel(h('h2', { text: editando ? 'Editar canción' : 'Nueva canción' })),
      h('div', { class: 'pcan-panel-body' }, form)
    ], editando ? 'Editar canción' : 'Nueva canción', { vista: 'canciones', id: editando ? c.id : 0 });
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
    var subir = h('button', { type: 'button', class: 'pcan-btn pcan-btn-primary', onclick: function () { empezar(); } }, icono('subir'), h('span', { text: 'Subir' }));
    // Botón flotante: quita de la lista de una vez las que ya están en el cancionero (o ya se subieron).
    var quitarYa = h('button', { type: 'button', class: 'pcan-btn pcan-lote-flotante', hidden: true, onclick: function () {
      var antes = items.length;
      items = items.filter(function (it) { return !yaEsta(it); });
      var quitadas = antes - items.length;
      aviso(quitadas + (quitadas === 1 ? ' canción quitada de la lista' : ' canciones quitadas de la lista'));
      pintar();
    } });

    var zona = zonaArchivos('.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png', 'Elegir partituras',
      'PDF, JPG o PNG · una canción por archivo · máx. ' + tamano(CFG.maxPartitura) + ' cada uno', function (files) {
        Array.prototype.forEach.call(files, function (f) {
          if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) { aviso('«' + f.name + '» no es PDF, JPG ni PNG', 'error'); return; }
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
          dup.textContent = it.estado !== 'ok' && existe(it.titulo) ? 'Ya hay una canción con este título' : '';
          dup.hidden = !dup.textContent;
        };
        var estado = it.estado === 'subiendo' ? h('span', { class: 'pcan-lote-estado', text: 'Subiendo…' })
          : it.estado === 'ok' ? h('a', { class: 'pcan-lote-estado is-ok', href: '#/cancion/' + it.id }, icono('check'), 'Subida · ver')
          : it.estado === 'error' ? h('span', { class: 'pcan-lote-estado is-error', text: it.error })
          : it.estado === 'grande' ? h('span', { class: 'pcan-lote-estado is-error', text: 'Pesa ' + tamano(it.file.size) + '; el máximo es ' + tamano(CFG.maxPartitura) })
          : null;
        append(lista, h('div', { class: 'pcan-lote-item is-' + it.estado },
          icono('partitura'),
          h('div', { class: 'pcan-lote-main' },
            h('div', { class: 'pcan-lote-campos' },
              h('input', {
                type: 'text', class: 'pcan-input pcan-input-sm', value: it.numero, placeholder: 'Nº', inputmode: 'numeric', maxlength: '20',
                'aria-label': 'Número de himnario de ' + it.file.name, disabled: bloqueado, oninput: function (e) { it.numero = e.target.value; }
              }),
              h('input', {
                type: 'text', class: 'pcan-input pcan-input-sm', value: it.titulo, maxlength: '200',
                'aria-label': 'Título de ' + it.file.name, disabled: bloqueado,
                oninput: function (e) { it.titulo = e.target.value; marcarDup(); pintarResumen(); },
                onchange: function (e) { it.titulo = limpiarTitulo(e.target.value); e.target.value = it.titulo; marcarDup(); pintarResumen(); }
              }),
              h('input', {
                type: 'text', class: 'pcan-input pcan-input-sm', value: it.tonalidad, placeholder: 'Tono', maxlength: '12',
                'aria-label': 'Tonalidad de ' + it.file.name, disabled: bloqueado,
                oninput: function (e) { it.tonalidad = e.target.value; },
                // «C» y «Do» son lo mismo: se guarda en notación española.
                onchange: function (e) { var t = tonoEspanol(e.target.value); it.tonalidad = t || limpiarTitulo(e.target.value); e.target.value = it.tonalidad; }
              })),
            h('span', { class: 'pcan-lote-archivo', text: it.file.name + ' · ' + tamano(it.file.size) }),
            dup, estado),
          !bloqueado ? h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': 'Quitar ' + it.file.name, onclick: function () { items.splice(i, 1); pintar(); } }, icono('cerrar')) : null));
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
        ? [hechas ? hechas + (hechas === 1 ? ' subida' : ' subidas') : '', pendientes ? pendientes + ' por subir' : ''].filter(Boolean).join(' · ') || 'Nada que subir'
        : 'Elige o arrastra varias partituras: se creará una canción por archivo, con el nombre del archivo como título. Si el nombre lleva el número de himnario (menor de 300) o la tonalidad (C o Do, Bb o Sib…), se separan solos. Antes de subirlas puedes corregirlos.';
      var ya = items.filter(yaEsta).length;
      quitarYa.hidden = enCurso || !ya;
      quitarYa.innerHTML = '';
      append(quitarYa, [icono('borrar'), 'Quitar ' + (ya === 1 ? 'la que ya está' : 'las ' + ya + ' que ya están') + ' en el cancionero']);
      subir.disabled = enCurso || !pendientes;
      subir.lastChild.textContent = enCurso ? 'Subiendo…' : pendientes ? 'Subir ' + pendientes + (pendientes === 1 ? ' canción' : ' canciones') : 'Subir';
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
          aviso(fallos ? fallos + (fallos === 1 ? ' canción no se pudo subir' : ' canciones no se pudieron subir') : 'Canciones subidas', fallos ? 'error' : undefined);
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
      cabeceraPanel(h('h2', { text: 'Subir varias canciones' })),
      h('div', { class: 'pcan-panel-body' },
        h('div', { class: 'pcan-form' },
          resumen, zona, lista, quitarYa,
          h('div', { class: 'pcan-form-actions' }, progreso, subir,
            h('button', { type: 'button', class: 'pcan-btn', onclick: function () { cerrarPanel(); } }, 'Cerrar'))))
    ], 'Subir varias canciones', { vista: 'canciones', id: 0 });
    pintar();
  }

  // ---------------------------------------------------------------- ajustes (responsables)

  function abrirAjustes() {
    if (!CFG.gestionar) { location.hash = '#/'; return; }
    abrirPanel(h('div', { class: 'pcan-panel-loading', text: 'Cargando ajustes…' }), 'Ajustes', { modal: true });
    api('ajustes').then(pintarAjustes).catch(function (e) { aviso(e.message, 'error'); cerrarPanel(); });
  }

  function pintarAjustes(a) {
    var fNombre = h('input', { type: 'text', class: 'pcan-input', value: a.nombre || '', maxlength: '40', placeholder: 'Cancionero', spellcheck: 'false' });
    var fAdmins = h('textarea', { class: 'pcan-input pcan-textarea', rows: '3', placeholder: 'Un correo por línea', spellcheck: 'false' });
    fAdmins.value = (a.administradores || []).join('\n');
    var fTema = h('select', { class: 'pcan-input' }, Object.keys(CFG.temas).map(function (k) { return h('option', { value: k, text: CFG.temas[k] }); }));
    fTema.value = a.temaDefecto;
    var fClient = h('input', { type: 'text', class: 'pcan-input', value: a.googleClientId, placeholder: '1234567890-abc….apps.googleusercontent.com', spellcheck: 'false' });
    var fDominio = h('input', { type: 'text', class: 'pcan-input', value: a.dominio, placeholder: 'p. ej. tuiglesia.org (opcional)', spellcheck: 'false' });
    var fEmails = h('textarea', { class: 'pcan-input pcan-textarea', rows: '6', placeholder: 'Un correo por línea', spellcheck: 'false' });
    fEmails.value = a.emails.join('\n');

    var errorBox = h('div', { class: 'pcan-form-error', role: 'alert', hidden: true });
    var guardar = h('button', { type: 'submit', class: 'pcan-btn pcan-btn-primary' }, 'Guardar ajustes');

    var miembros = h('ul', { class: 'pcan-miembros' }, a.miembros.length ? a.miembros.map(function (m) {
      return h('li', null,
        h('span', { class: 'pcan-avatar is-sm', 'aria-hidden': 'true' }, iniciales(m.nombre || m.email)),
        h('span', { class: 'pcan-miembro-main' }, h('strong', { text: m.nombre || m.email }), m.nombre ? h('span', { text: m.email }) : null),
        m.esGestor && !m.esAdmin ? h('span', { class: 'pcan-estado is-ok', title: 'Puede cambiar los ajustes, gestionar el equipo y borrar canciones', text: 'Administrador' }) : null,
        m.esAdmin
          ? h('span', { class: 'pcan-estado is-warn', title: 'Las cuentas de administración no reciben enlaces por correo', text: 'Administración · entra con contraseña' })
          : h('span', { class: 'pcan-estado' + (m.haEntrado ? ' is-ok' : ''), text: m.haEntrado ? 'Ha entrado' : m.enLista ? 'Pendiente' : 'Fuera de la lista' }));
    }) : h('li', { class: 'pcan-muted', text: 'Aún no hay nadie en la lista.' }));
    var hayAdmin = a.miembros.some(function (m) { return m.esAdmin; });

    // Protección de los archivos: comprueba que el servidor no los entrega sin sesión y mueve los antiguos a la carpeta privada.
    var cajaProteccion = h('div', { class: 'pcan-huerfanos' }, h('p', { class: 'pcan-help', text: 'Comprobando la protección de los archivos…' }));
    cajaProteccion.addEventListener('input', function (e) { e.stopPropagation(); });
    cajaProteccion.addEventListener('change', function (e) { e.stopPropagation(); });
    function pintarProteccion(r) {
      cajaProteccion.innerHTML = '';
      var regla = 'location ^~ /wp-content/uploads/cancionero-privado/ { deny all; }';
      var estado = r.proteccion === 'protegido'
        ? h('p', { class: 'pcan-help', text: 'La carpeta de archivos privados está protegida: solo se entregan a quien ha iniciado sesión.' })
        : r.proteccion === 'expuesto'
          ? h('div', { class: 'pcan-form-error', role: 'alert' },
            h('strong', { text: 'Tu servidor entrega los archivos privados sin pedir sesión. ' }),
            'Si usas Nginx, añade esta regla a la configuración del sitio y recarga el servidor: ', h('code', { text: regla }),
            '. En Apache, comprueba que se permiten los archivos .htaccess (AllowOverride).')
          : h('p', { class: 'pcan-help', text: 'No se pudo comprobar la protección desde el servidor. Prueba a abrir una partitura en una ventana privada sin sesión: debe dar error.' });
      var pendientes = r.pendientes || 0;
      var progreso = h('p', { class: 'pcan-help', hidden: true });
      var boton = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-primary' },
        icono('subir'), pendientes ? 'Proteger ' + pendientes + (pendientes === 1 ? ' archivo existente' : ' archivos existentes') : 'Proteger archivos existentes');
      boton.disabled = !pendientes;
      boton.addEventListener('click', function () {
        boton.disabled = true;
        var total = pendientes, movidos = 0, fallos = [];
        progreso.hidden = false;
        (function tanda() {
          progreso.textContent = 'Moviendo archivos… ' + movidos + ' de ' + total;
          api('archivos/proteger', { json: {} }).then(function (res) {
            movidos += res.movidos;
            fallos = fallos.concat(res.fallos || []);
            if (res.restantes > 0 && res.movidos > 0) { tanda(); return; }
            progreso.textContent = movidos + (movidos === 1 ? ' archivo protegido' : ' archivos protegidos') +
              (fallos.length ? ' · ' + fallos.length + ' no se pudieron mover: ' + fallos.slice(0, 5).map(function (f) { return f.archivo + ' (' + f.motivo + ')'; }).join('; ') : '.');
            aviso(movidos + (movidos === 1 ? ' archivo protegido' : ' archivos protegidos'), fallos.length ? 'error' : undefined);
            api('archivos/estado').then(pintarProteccion);
          }).catch(function (err) {
            progreso.textContent = 'Se interrumpió: ' + err.message + ' Vuelve a pulsar el botón para continuar.';
            boton.disabled = false;
          });
        })();
      });
      append(cajaProteccion, [estado,
        h('p', { class: 'pcan-help', text: pendientes
          ? 'Hay ' + pendientes + (pendientes === 1 ? ' archivo subido' : ' archivos subidos') + ' antes de esta versión que todavía se ' + (pendientes === 1 ? 'puede abrir' : 'pueden abrir') + ' con su dirección directa. Muévelos a la carpeta privada (se hace por tandas; los enlaces directos antiguos dejarán de funcionar).'
          : 'Todos los archivos del cancionero están en la carpeta privada.' }),
        h('div', { class: 'pcan-actions' }, boton), progreso]);
    }
    api('archivos/estado').then(pintarProteccion).catch(function (e) {
      cajaProteccion.innerHTML = '';
      append(cajaProteccion, h('p', { class: 'pcan-form-error', text: e.message }));
    });

    // Archivos sin usar: partituras y audios que ya no tiene ninguna canción.
    var cajaHuerfanos = h('div', { class: 'pcan-huerfanos' }, h('p', { class: 'pcan-help', text: 'Buscando archivos sin usar…' }));
    // Marcar casillas aquí no son cambios de los ajustes: no deben pedir confirmación al cerrar.
    cajaHuerfanos.addEventListener('input', function (e) { e.stopPropagation(); });
    cajaHuerfanos.addEventListener('change', function (e) { e.stopPropagation(); });
    function pintarHuerfanos(r) {
      var archivos = r.archivos || [];
      var marcados = {};
      archivos.forEach(function (f) { marcados[f.id] = true; });
      cajaHuerfanos.innerHTML = '';
      var papelera = r.enPapelera ? h('p', { class: 'pcan-help', text: r.enPapelera + (r.enPapelera === 1 ? ' archivo es' : ' archivos son') +
        ' de canciones que están en la papelera: se conservan por si se recuperan y aparecerán aquí cuando la papelera se vacíe.' }) : null;
      if (!archivos.length) {
        append(cajaHuerfanos, [h('p', { class: 'pcan-help', text: 'No hay archivos sin usar: todas las partituras, audios y editables pertenecen a alguna canción.' }), papelera]);
        return;
      }
      var boton = h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-danger' });
      var confirmar = h('div', { class: 'pcan-confirmar', role: 'alert', hidden: true });
      function seleccion() { return archivos.filter(function (f) { return marcados[f.id]; }); }
      function actualizar() {
        var sel = seleccion(), bytes = sel.reduce(function (s, f) { return s + f.tamano; }, 0);
        boton.innerHTML = '';
        append(boton, [icono('borrar'), sel.length ? 'Borrar ' + sel.length + (sel.length === 1 ? ' archivo' : ' archivos') + ' (' + tamano(bytes) + ')' : 'Marca los archivos que quieras borrar']);
        boton.disabled = !sel.length;
        confirmar.hidden = true;
      }
      boton.addEventListener('click', function () {
        var sel = seleccion();
        confirmar.innerHTML = '';
        append(confirmar, [
          h('span', { text: 'Se borrarán ' + sel.length + (sel.length === 1 ? ' archivo' : ' archivos') + ' del servidor. No se puede deshacer.' }),
          h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-primary', onclick: function (e) {
            e.currentTarget.disabled = true;
            api('huerfanos', { json: { ids: sel.map(function (f) { return f.id; }) } }).then(function (res) {
              aviso(res.borrados + (res.borrados === 1 ? ' archivo borrado' : ' archivos borrados') + ' · ' + tamano(res.liberado) + ' liberados');
              pintarHuerfanos(res);
            }).catch(function (err) { aviso(err.message, 'error'); actualizar(); });
          } }, 'Sí, borrar'),
          h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () { confirmar.hidden = true; } }, 'Cancelar')]);
        confirmar.hidden = false;
      });
      var total = archivos.reduce(function (s, f) { return s + f.tamano; }, 0);
      append(cajaHuerfanos, [
        h('p', { class: 'pcan-help', text: (archivos.length === 1 ? 'Ninguna canción usa este archivo' : 'Ninguna canción usa estos ' + archivos.length + ' archivos') + ' · ' + tamano(total) + ' en total.' }),
        h('ul', { class: 'pcan-huerfanos-lista' }, archivos.map(function (f) {
          return h('li', { class: 'pcan-huerfano' },
            h('input', { type: 'checkbox', checked: true, 'aria-label': 'Borrar ' + f.archivo, onchange: function (e) { marcados[f.id] = e.target.checked; actualizar(); } }),
            icono(f.tipo === 'audio' || f.tipo === 'editable' ? f.tipo : 'partitura'),
            h('span', null, h('a', { href: f.url, target: '_blank', rel: 'noopener', text: f.archivo }),
              h('small', { text: [tamano(f.tamano), fechaCorta(f.fecha), f.cancion ? 'era de «' + f.cancion + '»' : ''].filter(Boolean).join(' · ') })));
        })),
        h('div', { class: 'pcan-actions' }, boton), confirmar, papelera]);
      actualizar();
    }
    api('huerfanos').then(pintarHuerfanos).catch(function (e) {
      cajaHuerfanos.innerHTML = '';
      append(cajaHuerfanos, h('p', { class: 'pcan-form-error', text: e.message }));
    });

    var form = h('form', { class: 'pcan-form', novalidate: true },
      h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: 'General' }),
        campo('Nombre del cancionero', fNombre, 'Se muestra arriba a la izquierda y en la pantalla de acceso. Por ejemplo: «Cancionero de la iglesia».')),
      h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: 'Equipo' }),
        campo('Correos con acceso', fEmails, 'Cada persona entra con un enlace que recibe en ese correo (o con Google, si lo configuras). Quien sale de la lista pierde el acceso.'),
        campo('Administradores del cancionero', fAdmins, 'Pueden cambiar los ajustes, gestionar el equipo y borrar canciones, sin ser administradores de la web. Entran como el resto del equipo (enlace por correo o Google).'),
        campo('Dominio permitido', fDominio, 'Opcional: cualquier cuenta de este dominio de Google Workspace podrá entrar.'),
        miembros,
        hayAdmin ? h('p', { class: 'pcan-aviso-admin' }, icono('aviso'), 'Los correos marcados son de cuentas de administración: no reciben enlaces por seguridad y entran con usuario y contraseña. Para probar el enlace, usa otro correo.') : null,
        h('div', { class: 'pcan-actions' },
          h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function (e) {
            var b = e.currentTarget;
            b.disabled = true;
            api('correo-prueba', { json: {} })
              .then(function (r) { aviso('Correo de prueba enviado a ' + r.destino); })
              .catch(function (err) { aviso(err.message, 'error'); })
              .then(function () { b.disabled = false; });
          } }, icono('enlace'), 'Enviarme un correo de prueba'),
          h('span', { class: 'pcan-help', text: 'Comprueba que el servidor puede enviar los enlaces de acceso.' }))),
      h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: 'Acceso con Google (opcional)' }),
        campo('Client ID de Google', fClient),
        h('details', { class: 'pcan-ayuda' },
          h('summary', { text: 'Cómo obtenerlo (5 minutos)' }),
          h('ol', null,
            h('li', null, 'Entra en ', h('a', { href: 'https://console.cloud.google.com/apis/credentials', target: '_blank', rel: 'noopener', text: 'Google Cloud Console → Credenciales' }), ' con una cuenta de la iglesia.'),
            h('li', { text: 'Configura la «Pantalla de consentimiento de OAuth» (tipo Externo, nombre «Cancionero»).' }),
            h('li', { text: 'Crear credenciales → ID de cliente de OAuth → Aplicación web.' }),
            h('li', null, 'En «Orígenes de JavaScript autorizados» añade: ', h('code', { text: a.origen })),
            h('li', { text: 'Copia el ID de cliente y pégalo aquí.' })))),
      h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: 'Protección de los archivos' }),
        cajaProteccion),
      h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: 'Archivos sin usar' }),
        cajaHuerfanos),
      h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: 'Apariencia' }),
        campo('Tema por defecto', fTema, 'Para quien aún no ha elegido tema. Cada persona puede cambiarlo en su menú.')),
      errorBox,
      h('div', { class: 'pcan-form-actions' }, guardar,
        h('button', { type: 'button', class: 'pcan-btn', onclick: function () { cerrarPanel(); } }, 'Cancelar')));

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      guardar.disabled = true;
      api('ajustes', { json: {
        nombre: fNombre.value.trim(),
        administradores: fAdmins.value.split(/[\s,;]+/).filter(Boolean),
        temaDefecto: fTema.value,
        googleClientId: fClient.value.trim(),
        dominio: fDominio.value.trim(),
        emails: fEmails.value.split(/[\s,;]+/).filter(Boolean)
      } }).then(function () {
        panelSucio = false;
        aviso('Ajustes guardados');
        cerrarPanel();
      }).catch(function (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
        guardar.disabled = false;
      });
    });

    abrirPanel([cabeceraPanel(h('h2', { text: 'Ajustes y equipo' })), h('div', { class: 'pcan-panel-body' }, form)], 'Ajustes', { modal: true });
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
      s.onerror = function () { jszipPromesa = null; reject(new Error('No se pudo cargar el compresor de copias. Revisa la conexión.')); };
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

  var LEEME = 'Copia de seguridad del Cancionero (plugin Cancionero).\n\n' +
    'copia.json  canciones, cultos y ajustes\n' +
    'archivos/   partituras, audios y partituras editables de cada canción\n\n' +
    'Para restaurarla: instala el plugin en WordPress, entra como administrador en el cancionero\n' +
    'y abre el menú de tu cuenta → Copias de seguridad → Restaurar desde una copia.\n';

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
          estado('Descargando archivo ' + (i + 1) + ' de ' + descargas.length + ': ' + f.nombre);
          return fetch(f.url, { credentials: 'same-origin' }).then(function (res) {
            if (!res.ok) { throw new Error('No se pudo descargar «' + f.nombre + '» (error ' + res.status + ').'); }
            return res.blob();
          }).then(function (b) {
            zip.file(f.ruta, b);
            hecho += f.tamano;
            avance(hecho / total * 0.92);
          });
        });
      }, Promise.resolve()).then(function () {
        zip.file('copia.json', JSON.stringify(copia, null, 1));
        zip.file('LEEME.txt', LEEME);
        estado('Preparando el archivo…');
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
      if (!f) { throw new Error('Este archivo no es una copia del cancionero (falta copia.json).'); }
      return f.async('string').then(function (texto) {
        var copia = JSON.parse(texto);
        if (copia.formato !== 'pieb-cancionero') { throw new Error('Este archivo no es una copia del cancionero.'); }
        copia.canciones = copia.canciones || [];
        copia.cultos = copia.cultos || [];
        return { zip: zip, copia: copia };
      });
    }, function (e) {
      throw new Error(/compresor/.test(e.message) ? e.message : 'No se pudo abrir el archivo: ¿es un .zip de copia del cancionero?');
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
    if (!CFG.admin) { location.hash = '#/'; return; }
    var cuerpo = h('div', { class: 'pcan-panel-body' });
    abrirPanel([cabeceraPanel(h('h2', { text: 'Copias de seguridad' })), cuerpo], 'Copias de seguridad', { modal: true });
    pintarCopias(cuerpo);
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
    var oCanciones = casilla('Canciones', true, state.canciones.length + ' canciones con sus datos, letras, etiquetas y enlaces de YouTube.');
    var oArchivos = casilla('Partituras, audios y editables', true, 'Los archivos de cada canción. Sin ellos la copia ocupa muy poco, pero no sirve para empezar en otra web.');
    var oCultos = casilla('Cultos y setlists', true, 'Todos los cultos con el orden de sus canciones (de ahí salen las estadísticas).');
    var oAjustes = casilla('Ajustes y lista del equipo', true, 'Tema por defecto, correos con acceso y acceso con Google.');
    oCanciones.input.addEventListener('change', function () { oArchivos.input.disabled = !oCanciones.input.checked; });
    var estadoCrear = h('p', { class: 'pcan-help', role: 'status' });
    var barraCrear = progresoNuevo();
    var bCrear = h('button', { type: 'button', class: 'pcan-btn pcan-btn-primary' }, icono('descargar'), 'Descargar copia');
    bCrear.addEventListener('click', function () {
      var opc = { canciones: oCanciones.input.checked, archivos: oCanciones.input.checked && oArchivos.input.checked, cultos: oCultos.input.checked, ajustes: oAjustes.input.checked };
      if (!opc.canciones && !opc.cultos && !opc.ajustes) { estadoCrear.textContent = 'Marca al menos una cosa para copiar.'; return; }
      if (opc.cultos && !opc.canciones) { estadoCrear.textContent = 'Los cultos se restauran enlazando sus canciones: incluye también las canciones, o asegúrate de que ya estén donde vayas a restaurar.'; }
      ocupado = true; panelSucio = true;
      bCrear.disabled = true;
      barraCrear.hidden = false;
      barraCrear.firstChild.style.width = '0%';
      crearCopia(opc, function (t) { estadoCrear.textContent = t; }, function (p) { barraCrear.firstChild.style.width = Math.round(p * 100) + '%'; })
        .then(function (r) {
          estadoCrear.textContent = 'Copia descargada: ' + [r.canciones ? r.canciones + ' canciones' : '', r.cultos ? r.cultos + ' cultos' : '', r.archivos ? r.archivos + ' archivos' : ''].filter(Boolean).join(', ') + ' · ' + tamano(r.bytes) + '. Guárdala fuera de este servidor.';
          aviso('Copia descargada');
        })
        .catch(function (e) { estadoCrear.textContent = e.message; aviso('No se pudo crear la copia', 'error'); })
        .then(function () { ocupado = false; panelSucio = false; bCrear.disabled = false; barraCrear.hidden = true; });
    });

    // --- restaurar
    var zonaRestaurar = h('div', { class: 'pcan-copia-restaurar' });
    var elegir = zonaArchivos('.zip,application/zip', 'Elegir copia (.zip)', 'El archivo que descargaste con «Descargar copia»', function (files) {
      var archivo = files[0];
      if (!archivo || ocupado) { return; }
      zonaRestaurar.innerHTML = '';
      append(zonaRestaurar, h('p', { class: 'pcan-help', text: 'Abriendo la copia…' }));
      leerCopia(archivo).then(function (r) {
        return api('copia/estado', { json: {
          canciones: r.copia.canciones.map(function (c) { return { uid: c.uid, titulo: c.titulo, numero: c.numero }; }),
          cultos: r.copia.cultos.map(function (c) { return { uid: c.uid, titulo: c.titulo, fecha: c.fecha }; })
        } }).then(function (existen) { pintarRestaurar(r.zip, r.copia, existen, archivo); });
      }).catch(function (e) {
        zonaRestaurar.innerHTML = '';
        append(zonaRestaurar, h('p', { class: 'pcan-form-error', text: e.message }));
      });
    });

    function pintarRestaurar(zip, copia, existen, file) {
      zonaRestaurar.innerHTML = '';
      var elegidas = copia.canciones.map(function () { return true; });
      var elegidos = copia.cultos.map(function () { return true; });
      var modo = 'saltar';
      var nExisten = existen.canciones.filter(Boolean).length + existen.cultos.filter(Boolean).length;

      function lista(items, marcas, existe, texto) {
        if (!items.length) { return null; }
        var todas = h('input', { type: 'checkbox', checked: true, 'aria-label': 'Marcar todas' });
        var casillas = [];
        var ul = h('ul', { class: 'pcan-copia-lista' }, items.map(function (it, i) {
          var c = h('input', { type: 'checkbox', checked: true, onchange: function (e) { marcas[i] = e.target.checked; resumen(); } });
          casillas.push(c);
          return h('li', null, h('label', null, c, h('span', { text: texto(it) }),
            h('span', { class: 'pcan-estado' + (existe[i] ? ' is-warn' : ' is-ok'), text: existe[i] ? 'Ya existe' : 'Nueva' })));
        }));
        todas.addEventListener('change', function () {
          casillas.forEach(function (c, i) { c.checked = todas.checked; marcas[i] = todas.checked; });
          resumen();
        });
        return [h('label', { class: 'pcan-copia-todas' }, todas, h('span', { text: 'Todas' })), ul];
      }

      var oAjustesR = casilla('Ajustes y lista del equipo', !!copia.ajustes,
        copia.ajustes ? (copia.ajustes.emails || []).length + ' correos: se añaden a la lista actual, nadie pierde el acceso.' : 'Esta copia no los incluye.');
      oAjustesR.input.disabled = !copia.ajustes;

      var modos = h('div', { class: 'pcan-copia-modos', role: 'radiogroup', 'aria-label': 'Si ya existe' },
        [['saltar', 'Dejar la que ya hay (recomendado)'], ['sobrescribir', 'Sustituirla por la de la copia']].map(function (m) {
          return h('label', null, h('input', { type: 'radio', name: 'pcan-modo-copia', value: m[0], checked: m[0] === modo, onchange: function () { modo = m[0]; resumen(); } }), h('span', { text: m[1] }));
        }));

      var aviso2 = h('p', { class: 'pcan-help' });
      var barra = progresoNuevo();
      var registro = h('ul', { class: 'pcan-copia-registro', hidden: true });
      var bRestaurar = h('button', { type: 'button', class: 'pcan-btn pcan-btn-primary' }, icono('subir'), h('span'));
      var confirmar = h('div', { class: 'pcan-confirmar', role: 'alert', hidden: true });

      function resumen() {
        var nc = elegidas.filter(Boolean).length, nu = elegidos.filter(Boolean).length;
        var partes = [nc ? nc + (nc === 1 ? ' canción' : ' canciones') : '', nu ? nu + (nu === 1 ? ' culto' : ' cultos') : '', oAjustesR.input.checked ? 'los ajustes' : ''].filter(Boolean);
        bRestaurar.lastChild.textContent = partes.length ? 'Restaurar ' + partes.join(', ') : 'Marca qué restaurar';
        bRestaurar.disabled = !partes.length || ocupado;
        aviso2.textContent = nExisten
          ? (modo === 'saltar' ? 'Lo que ya existe se deja como está; solo se añade lo nuevo.' : 'Lo que ya existe se sustituirá por la versión de la copia' + (copia.conArchivos ? ', incluidas sus partituras y audios.' : ' (sus archivos actuales se conservan).'))
          : 'Nada de la copia existe todavía en esta web: se añadirá todo lo que marques.';
        confirmar.hidden = true;
      }
      oAjustesR.input.addEventListener('change', resumen);

      function anotar(texto, error) {
        registro.hidden = false;
        append(registro, h('li', { class: error ? 'is-error' : '', text: texto }));
        registro.scrollTop = registro.scrollHeight;
      }

      function ejecutar() {
        ocupado = true; panelSucio = true;
        bRestaurar.disabled = true;
        barra.hidden = false;
        registro.innerHTML = '';
        var tareas = [];
        copia.canciones.forEach(function (c, i) {
          if (!elegidas[i]) { return; }
          if (existen.canciones[i] && modo === 'saltar') { tareas.push(function () { anotar('«' + c.titulo + '»: ya estaba, sin cambios'); return Promise.resolve(); }); return; }
          tareas.push(function () {
            return restaurarCancion(zip, c, modo, !!copia.conArchivos).then(function (r) {
              anotar('«' + c.titulo + '»: ' + (r.estado === 'creada' ? 'añadida' : r.estado === 'actualizada' ? 'sustituida' : 'ya estaba, sin cambios'));
            }, function (e) { anotar('«' + c.titulo + '»: ' + e.message, true); });
          });
        });
        copia.cultos.forEach(function (c, i) {
          if (!elegidos[i]) { return; }
          tareas.push(function () {
            return api('copia/culto', { json: { culto: c, modo: modo } }).then(function (r) {
              anotar('Culto «' + c.titulo + '» (' + fechaCorta(c.fecha) + '): ' + (r.estado === 'creado' ? 'añadido' : r.estado === 'actualizado' ? 'sustituido' : 'ya estaba, sin cambios') +
                (r.faltan ? ' · ' + r.faltan + (r.faltan === 1 ? ' canción no está' : ' canciones no están') + ' en esta web' : ''), !!r.faltan);
            }, function (e) { anotar('Culto «' + c.titulo + '»: ' + e.message, true); });
          });
        });
        if (oAjustesR.input.checked && copia.ajustes) {
          tareas.push(function () {
            return api('copia/ajustes', { json: { ajustes: copia.ajustes } }).then(function (r) {
              anotar('Ajustes restaurados · ' + r.emails + ' correos en la lista del equipo');
            }, function (e) { anotar('Ajustes: ' + e.message, true); });
          });
        }
        var hechas = 0;
        tareas.reduce(function (cadena, t) {
          return cadena.then(t).then(function () { hechas++; barra.firstChild.style.width = Math.round(hechas / tareas.length * 100) + '%'; });
        }, Promise.resolve()).then(function () {
          ocupado = false; panelSucio = false;
          var errores = registro.querySelectorAll('.is-error').length;
          aviso(errores ? 'Restauración terminada con ' + errores + (errores === 1 ? ' aviso' : ' avisos') : 'Copia restaurada', errores ? 'error' : undefined);
          barra.hidden = true;
          append(zonaRestaurar, h('div', { class: 'pcan-actions' },
            h('button', { type: 'button', class: 'pcan-btn pcan-btn-primary', onclick: function () { location.hash = '#/'; location.reload(); } }, 'Ver el cancionero restaurado')));
        });
      }

      bRestaurar.addEventListener('click', function () {
        confirmar.innerHTML = '';
        append(confirmar, [
          h('span', { text: modo === 'sobrescribir' && nExisten ? 'Lo que ya existe se sustituirá por la versión de la copia. ¿Seguimos?' : '¿Restaurar lo marcado?' }),
          h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-primary', onclick: function () { confirmar.hidden = true; ejecutar(); } }, 'Sí, restaurar'),
          h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () { confirmar.hidden = true; } }, 'Cancelar')]);
        confirmar.hidden = false;
      });

      append(zonaRestaurar, [
        h('div', { class: 'pcan-copia-origen' }, icono('descargar'),
          h('span', null, h('strong', { text: file.name }),
            h('small', { text: 'Copia del ' + fechaCorta(copia.fecha) + ' ' + String(copia.fecha || '').slice(0, 4) + ' · ' + String(copia.sitio || '').replace(/^https?:\/\//, '').replace(/\/$/, '') + ' · ' + tamano(file.size) + (copia.conArchivos ? ' · con archivos' : ' · solo datos') }))),
        copia.canciones.length ? h('fieldset', { class: 'pcan-fieldset' }, h('legend', { text: 'Canciones (' + copia.canciones.length + ')' }),
          lista(copia.canciones, elegidas, existen.canciones, function (c) { return (c.numero ? c.numero + ' · ' : '') + c.titulo + ((c.partituras || []).length + (c.audios || []).length && copia.conArchivos ? ' · ' + ((c.partituras || []).length + (c.audios || []).length) + (((c.partituras || []).length + (c.audios || []).length) === 1 ? ' archivo' : ' archivos') : ''); })) : null,
        copia.cultos.length ? h('fieldset', { class: 'pcan-fieldset' }, h('legend', { text: 'Cultos (' + copia.cultos.length + ')' }),
          lista(copia.cultos, elegidos, existen.cultos, function (c) { return fechaCorta(c.fecha) + ' ' + String(c.fecha).slice(0, 4) + ' · ' + c.titulo + ' · ' + (c.items || []).length + ' canciones'; })) : null,
        h('fieldset', { class: 'pcan-fieldset' }, h('legend', { text: 'Ajustes' }), oAjustesR.el),
        nExisten ? h('fieldset', { class: 'pcan-fieldset' }, h('legend', { text: 'Si una canción o un culto ya existe' }), modos) : null,
        aviso2, confirmar, barra,
        h('div', { class: 'pcan-actions' }, bRestaurar),
        registro]);
      resumen();
    }

    append(cuerpo, h('div', { class: 'pcan-form' },
      h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: 'Crear una copia' }),
        h('p', { class: 'pcan-help', text: 'Se descarga un .zip con todo lo que marques. Con él puedes recuperar el cancionero aquí o continuar en otra web con WordPress y este plugin.' }),
        oCanciones.el, oArchivos.el, oCultos.el, oAjustes.el,
        barraCrear, estadoCrear,
        h('div', { class: 'pcan-actions' }, bCrear)),
      h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: 'Restaurar desde una copia' }),
        h('p', { class: 'pcan-help', text: 'Abre una copia y elige qué recuperar: todo, o solo algunas canciones o cultos. Antes de cambiar nada verás qué ya existe en esta web.' }),
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
    else if (hash === 'ajustes') { abrirAjustes(); }
    else if (hash === 'copias') { abrirCopias(); }
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
    if (e.key === 'Escape' && ui.menu && !ui.menu.hidden) { alternarMenu(false); return; }
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
    mostrarVista: mostrarVista,
    abrirPaleta: abrirPaleta,
    tonalidades: TONALIDADES,
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
