/* Cancionero · cultos y setlists */
(function () {
  'use strict';

  var P = window.PCAN;
  if (!P) { return; }
  var h = P.h, append = P.append, icono = P.icono, api = P.api, aviso = P.aviso;
  // Atajos de traducción compartidos por cancionero.js y el idioma del usuario para fechas.
  var __ = P.__, _n = P._n, _x = P._x, sprintf = P.sprintf, conNodo = P.conNodo, sinPunto = P.sinPunto;
  var LOCALE = P.locale || 'es-ES';

  // Sugerencias de tipo de culto (el campo es libre: lo ya guardado en cada culto no se traduce, son datos del equipo).
  var TIPOS = [
    _x('Culto dominical', 'tipo de culto sugerido'), _x('Culto de oración', 'tipo de culto sugerido'), _x('Santa Cena', 'tipo de culto sugerido'),
    _x('Culto especial', 'tipo de culto sugerido'), _x('Ensayo', 'tipo de culto sugerido'), _x('Boda', 'tipo de culto sugerido'), _x('Funeral', 'tipo de culto sugerido')
  ];
  var DIAS_REPETICION = 28;
  var PDF_LIB = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';

  var cultos = [];
  var cargados = null;
  var contenedor = P.ui.listaCultos;

  // ---------------------------------------------------------------- fechas

  function fechaLocal(iso) {
    var p = String(iso || '').split('-');
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  }

  function hoyISO() {
    var d = new Date();
    return isoDe(d);
  }

  function isoDe(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function proximoDomingo() {
    var d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return isoDe(d);
  }

  function diasEntre(a, b) {
    return Math.round((fechaLocal(b) - fechaLocal(a)) / 86400000);
  }

  function fmt(iso, opts) {
    return fechaLocal(iso).toLocaleDateString(LOCALE, opts);
  }

  function fechaLarga(iso) {
    var s = fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function fechaCorta(iso) {
    return sinPunto(fmt(iso, { day: 'numeric', month: 'short' }));
  }

  function nCanciones(n) { return sprintf(_n('%d canción', '%d canciones', n), n); }
  function nCultos(n) { return sprintf(_n('%d culto', '%d cultos', n), n); }

  function haceTanto(iso) {
    var d = diasEntre(iso, hoyISO());
    if (d === 0) { return _x('hoy', 'fecha relativa'); }
    if (d === 1) { return _x('ayer', 'fecha relativa'); }
    if (d === -1) { return _x('mañana', 'fecha relativa: el día siguiente'); }
    if (d < 0) { return sprintf(_n('dentro de %d día', 'dentro de %d días', -d), -d); }
    if (d < 14) { return sprintf(_n('hace %d día', 'hace %d días', d), d); }
    if (d < 60) { return sprintf(_n('hace %d semana', 'hace %d semanas', Math.round(d / 7)), Math.round(d / 7)); }
    return sprintf(_n('hace %d mes', 'hace %d meses', Math.round(d / 30)), Math.round(d / 30));
  }

  // ---------------------------------------------------------------- datos

  /** Veces tocada y última fecha de cada canción (solo cultos ya celebrados), para la biblioteca. */
  function usoDeCanciones() {
    var hoy = hoyISO();
    var mapa = {};
    cultos.forEach(function (c) {
      if (c.fecha > hoy) { return; }
      c.items.forEach(function (it) {
        var u = mapa[+it.cancion] || (mapa[+it.cancion] = { n: 0, ultima: '' });
        u.n++;
        if (c.fecha > u.ultima) { u.ultima = c.fecha; }
      });
    });
    return mapa;
  }

  function cargar(forzar) {
    if (cargados && !forzar) { return cargados; }
    cargados = api('cultos').then(function (lista) { cultos = lista; P.actualizarUso(usoDeCanciones()); return lista; })
      .catch(function (e) { cargados = null; throw e; });
    return cargados;
  }

  /** Veces que se ha tocado una canción: [{culto, fecha}] de más reciente a más antiguo. */
  function historial(cancionId, excluirCulto) {
    var res = [];
    cultos.forEach(function (c) {
      if (c.id === excluirCulto) { return; }
      if (c.items.some(function (it) { return +it.cancion === +cancionId; })) { res.push(c); }
    });
    return res.sort(function (a, b) { return b.fecha.localeCompare(a.fecha); });
  }

  /** Aviso si la canción se tocó cerca de la fecha indicada. */
  function avisoRepeticion(cancionId, fecha, excluirCulto) {
    var cerca = historial(cancionId, excluirCulto).filter(function (c) {
      return Math.abs(diasEntre(c.fecha, fecha)) <= DIAS_REPETICION;
    });
    if (!cerca.length) { return ''; }
    var c = cerca[0];
    var d = diasEntre(c.fecha, fecha);
    var cuando = d === 0 ? __('el mismo día') : d > 0 ? sprintf(_n('%d día antes', '%d días antes', d), d) : sprintf(_n('%d día después', '%d días después', -d), -d);
    return sprintf(/* translators: 1: título del culto, 2: fecha corta del culto, 3: cuándo fue respecto a este («el mismo día», «3 días antes») */ __('También en «%1$s» (%2$s, %3$s)'), c.titulo, fechaCorta(c.fecha), cuando);
  }

  // ---------------------------------------------------------------- vista: listado

  function pintarListado() {
    contenedor.innerHTML = '';
    var hoy = hoyISO();
    var proximos = cultos.filter(function (c) { return c.fecha >= hoy; }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); });
    var pasados = cultos.filter(function (c) { return c.fecha < hoy; });

    append(contenedor, h('div', { class: 'pcan-list-head' },
      h('div', null, h('h2', { text: __('Cultos') }), h('p', { class: 'pcan-muted', text: sprintf(/* translators: 1: cuántos cultos hay programados («3 programados»), 2: cuántos son anteriores («5 anteriores») */ __('%1$s · %2$s'), sprintf(_n('%d programado', '%d programados', proximos.length), proximos.length), sprintf(_n('%d anterior', '%d anteriores', pasados.length), pasados.length)) })),
      h('a', { class: 'pcan-btn pcan-btn-sm', href: '#/culto/nuevo' }, icono('mas'), __('Nuevo'))));

    if (!cultos.length) {
      append(contenedor, h('div', { class: 'pcan-empty' },
        h('p', { text: __('Todavía no hay cultos. Prepara el setlist del próximo domingo.') }),
        h('a', { class: 'pcan-btn pcan-btn-primary', href: '#/culto/nuevo' }, icono('mas'), __('Crear el primer culto'))));
      return;
    }

    append(contenedor, [
      h('p', { class: 'pcan-list-label', text: __('Próximos') }),
      proximos.length
        ? h('div', { class: 'pcan-cultos' }, proximos.map(tarjeta))
        : h('p', { class: 'pcan-muted pcan-section-empty', text: __('No hay cultos programados.') }),
      pasados.length ? h('p', { class: 'pcan-list-label', text: __('Anteriores') }) : null,
      pasados.length ? h('div', { class: 'pcan-cultos is-past' }, pasados.map(tarjeta)) : null
    ]);
    P.marcarSeleccion('cultos');
    refrescarPortada();
  }

  function bloqueFecha(iso) {
    var d = fechaLocal(iso);
    return h('span', { class: 'pcan-culto-date', 'aria-hidden': 'true' },
      h('span', { class: 'pcan-culto-dow', text: sinPunto(d.toLocaleDateString(LOCALE, { weekday: 'short' })) }),
      h('span', { class: 'pcan-culto-day', text: String(d.getDate()) }),
      h('span', { class: 'pcan-culto-mon', text: sinPunto(d.toLocaleDateString(LOCALE, { month: 'short' })) }));
  }

  function titulosDe(c) {
    return c.items.map(function (it) { var s = P.cancion(+it.cancion); return s ? s.titulo : null; }).filter(Boolean);
  }

  function tarjeta(c) {
    var titulos = titulosDe(c);
    var faltan = diasEntre(hoyISO(), c.fecha);
    return h('a', { class: 'pcan-culto', href: '#/culto/' + c.id, 'data-id': String(c.id) },
      bloqueFecha(c.fecha),
      h('span', { class: 'pcan-culto-main' },
        h('span', { class: 'pcan-culto-titulo' },
          h('span', { class: 'pcan-row-title', text: c.titulo }),
          faltan >= 0 && faltan <= 30 ? h('span', { class: 'pcan-cuenta' + (faltan <= 1 ? ' is-ya' : ''), text: faltan === 0 ? _x('hoy', 'fecha relativa') : faltan === 1 ? _x('mañana', 'fecha relativa: el día siguiente') : sprintf(_n('en %d día', 'en %d días', faltan), faltan) }) : null),
        h('span', { class: 'pcan-culto-songs' + (titulos.length ? '' : ' is-empty'), text: titulos.length ? titulos.join(' · ') : __('Sin canciones todavía') })),
      h('span', { class: 'pcan-culto-count', title: nCanciones(c.items.length) }, String(c.items.length)));
  }

  function mostrarListado() {
    if (!cultos.length && !cargados) { contenedor.innerHTML = ''; append(contenedor, h('div', { class: 'pcan-empty', text: __('Cargando cultos…') })); }
    // Siempre se recarga al entrar: otra persona puede haber creado o cambiado cultos.
    cargar(true).then(function () { pintarListado(); pintarLateral(); }).catch(function (e) {
      contenedor.innerHTML = '';
      append(contenedor, h('div', { class: 'pcan-empty is-error', text: sprintf(/* translators: %s: motivo del error */ __('No se pudieron cargar los cultos: %s'), e.message) }));
    });
  }

  /** Barra lateral: los próximos cultos siempre a mano. */
  function pintarLateral() {
    var cont = P.ui.sideCultos;
    if (!cont) { return; }
    cont.innerHTML = '';
    var hoy = hoyISO();
    var proximos = cultos.filter(function (c) { return c.fecha >= hoy; }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); }).slice(0, 4);
    if (!proximos.length) {
      append(cont, h('a', { class: 'pcan-side-culto is-vacio', href: '#/culto/nuevo' }, icono('mas'), h('span', { text: __('Preparar un culto') })));
      return;
    }
    proximos.forEach(function (c) {
      var d = fechaLocal(c.fecha);
      append(cont, h('a', { class: 'pcan-side-culto', href: '#/culto/' + c.id },
        h('span', { class: 'pcan-side-culto-fecha' }, h('b', { text: String(d.getDate()) }), sinPunto(d.toLocaleDateString(LOCALE, { month: 'short' }))),
        h('span', { class: 'pcan-side-culto-texto' }, h('strong', { text: c.titulo }), h('small', { text: sprintf(/* translators: 1: número de canciones («3 canciones»), 2: cuándo es el culto («dentro de 4 días») */ __('%1$s · %2$s'), nCanciones(c.items.length), haceTanto(c.fecha)) }))));
    });
  }

  function refrescar() {
    pintarListado();
    pintarLateral();
    P.repintarInicio();
  }

  /** Tarjeta grande del próximo culto (en inicio y en la portada de cultos); sin culto, invita a preparar uno. */
  function tarjetaProximo(proximo) {
    if (!proximo) {
      return h('a', { class: 'pcan-hero is-vacio', href: '#/culto/nuevo' },
        h('span', { class: 'pcan-hero-ico', 'aria-hidden': 'true' }, icono('calendario')),
        h('span', { class: 'pcan-hero-texto' }, h('strong', { text: __('Prepara el próximo culto') }), h('span', { text: __('Crea el setlist y ten las partituras listas para tocar en la tableta.') })),
        h('span', { class: 'pcan-btn pcan-btn-primary' }, icono('mas'), __('Nuevo culto')));
    }
    var canciones = proximo.items.map(function (it) { return { s: P.cancion(+it.cancion), tono: it.tonalidad }; }).filter(function (x) { return x.s; });
    return h('section', { class: 'pcan-hero', 'aria-label': __('Próximo culto') },
      h('div', { class: 'pcan-hero-cab' },
        bloqueFecha(proximo.fecha),
        h('div', { class: 'pcan-hero-texto' },
          h('span', { class: 'pcan-hero-kicker', text: sprintf(/* translators: %s: cuándo es el culto («mañana», «dentro de 4 días») */ __('Próximo culto · %s'), haceTanto(proximo.fecha)) }),
          h('a', { href: '#/culto/' + proximo.id }, h('strong', { text: proximo.titulo })),
          h('span', { text: [proximo.tipo, nCanciones(canciones.length)].filter(Boolean).join(' · ') }))),
      canciones.length ? h('ol', { class: 'pcan-hero-set' }, canciones.map(function (x, i) {
        return h('li', null, h('a', { href: '#/culto/' + proximo.id + '/tocar/' + (i + 1), title: __('Tocar desde aquí') },
          h('span', { class: 'pcan-hero-n', text: String(i + 1) }),
          h('span', { class: 'pcan-hero-t', text: x.s.titulo }),
          (x.tono || x.s.tonalidad) ? P.pastillaTono(x.tono || x.s.tonalidad) : null));
      })) : h('p', { class: 'pcan-hero-vacio', text: __('Aún no tiene canciones.') }),
      h('div', { class: 'pcan-hero-acciones' },
        canciones.length ? h('a', { class: 'pcan-btn pcan-btn-primary pcan-btn-lg', href: '#/culto/' + proximo.id + '/tocar/1' }, icono('play'), __('Tocar')) : null,
        h('a', { class: 'pcan-btn', href: '#/culto/editar/' + proximo.id }, icono('editar'), canciones.length ? __('Editar setlist') : __('Añadir canciones'))));
  }

  // ---------------------------------------------------------------- vista: portada (vista dividida sin culto elegido)

  /** Llena el hueco de la derecha: el próximo culto, lo que falta por preparar y lo que viene después. */
  function pintarPortada(host) {
    host.innerHTML = '';
    var portada = h('div', { class: 'pcan-cultos-portada' });
    append(host, portada);
    if (!cultos.length && !cargados) { append(portada, h('p', { class: 'pcan-muted', text: __('Cargando cultos…') })); return true; }
    var hoy = hoyISO();
    var proximos = cultos.filter(function (c) { return c.fecha >= hoy; }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); });
    var celebrados = cultos.filter(function (c) { return c.fecha < hoy; });
    var domingo = proximoDomingo();

    append(portada, tarjetaProximo(proximos[0]));

    // Por preparar: el próximo domingo sin culto y los cultos programados sin canciones.
    var pendientes = proximos.filter(function (c) { return !c.items.length; }).map(function (c) {
      return h('a', { class: 'pcan-pendiente', href: '#/culto/editar/' + c.id }, icono('aviso'),
        h('span', { class: 'pcan-pendiente-texto' }, h('strong', { text: c.titulo }), h('small', { text: sprintf(/* translators: %s: cuándo es el culto («dentro de 4 días») */ __('Aún no tiene canciones · %s'), haceTanto(c.fecha)) })),
        h('span', { class: 'pcan-pendiente-accion', text: __('Añadir canciones') }));
    });
    if (proximos.length && !proximos.some(function (c) { return c.fecha === domingo; })) {
      pendientes.unshift(h('a', { class: 'pcan-pendiente', href: '#/culto/nuevo' }, icono('calendario'),
        h('span', { class: 'pcan-pendiente-texto' }, h('strong', { text: sprintf(/* translators: %s: fecha corta del domingo («26 oct») */ __('Domingo %s'), fechaCorta(domingo)) }), h('small', { text: __('Todavía no hay culto preparado') })),
        h('span', { class: 'pcan-pendiente-accion', text: __('Preparar') })));
    }
    if (pendientes.length) {
      append(portada, h('section', { class: 'pcan-portada-sec' }, h('h3', { text: __('Por preparar') }), h('div', { class: 'pcan-pendientes' }, pendientes)));
    }

    // Lo que viene después del próximo.
    var despues = proximos.slice(1, 7);
    if (despues.length) {
      append(portada, h('section', { class: 'pcan-portada-sec' }, h('h3', { text: __('Después') }),
        h('div', { class: 'pcan-portada-cultos' }, despues.map(function (c) {
          return h('a', { class: 'pcan-portada-culto', href: '#/culto/' + c.id }, bloqueFecha(c.fecha),
            h('span', { class: 'pcan-portada-culto-texto' }, h('strong', { text: c.titulo }), h('small', { text: sprintf(/* translators: 1: número de canciones («3 canciones»), 2: cuándo es el culto («dentro de 4 días») */ __('%1$s · %2$s'), nCanciones(c.items.length), haceTanto(c.fecha)) })));
        }))));
    }

    append(portada, h('p', { class: 'pcan-portada-pie pcan-muted' },
      sprintf(/* translators: 1: cuántos cultos hay programados («3 cultos programados»), 2: cuántos se han celebrado («5 celebrados») */ __('%1$s · %2$s'), sprintf(_n('%d culto programado', '%d cultos programados', proximos.length), proximos.length), sprintf(_n('%d celebrado', '%d celebrados', celebrados.length), celebrados.length)) + ' · ',
      h('a', { href: '#/culto/nuevo', text: __('Nuevo culto') })));
    return true;
  }

  /** Vuelve a pintar la portada si es lo que se está viendo (tras cargar o cambiar cultos). */
  function refrescarPortada() {
    var host = P.ui.detalle.cultos;
    if (host && host.querySelector('.pcan-cultos-portada, .pcan-detail-empty')) { pintarPortada(host); }
  }

  // ---------------------------------------------------------------- vista: ficha del culto

  function verCulto(id) {
    P.abrirPanel(h('div', { class: 'pcan-panel-loading', text: __('Cargando culto…') }), __('Culto'), { vista: 'cultos', id: id });
    Promise.all([api('cultos/' + id), cargar()]).then(function (r) {
      pintarFicha(r[0]);
      if (!cultos.some(function (x) { return x.id === r[0].id; })) { cargar(true).then(refrescar); }
    })
      .catch(function (e) {
        P.abrirPanel([P.cabeceraPanel(h('h2', { text: __('Culto no disponible') })), h('div', { class: 'pcan-panel-body' }, h('p', { text: e.message }))], __('Error'), { vista: 'cultos' });
      });
  }

  function pintarFicha(c) {
    var validos = c.items.filter(function (it) { return !it.eliminada; });
    var pdfItem = { texto: __('Descargar PDF del setlist'), icono: 'descargar', fn: function () { descargarPdf(c); } };

    var lista = h('ol', { class: 'pcan-setlist' }, c.items.map(function (it, i) {
      if (it.eliminada) {
        return h('li', { class: 'pcan-set-item is-missing' },
          h('span', { class: 'pcan-set-n', text: String(i + 1) }),
          h('span', { class: 'pcan-set-main' }, h('span', { class: 'pcan-muted', text: __('Canción eliminada del cancionero') })));
      }
      var s = it.datos;
      var tono = it.tonalidad || s.tonalidad;
      return h('li', { class: 'pcan-set-item' },
        h('span', { class: 'pcan-set-n', text: String(i + 1) }),
        h('span', { class: 'pcan-set-main' },
          h('a', { class: 'pcan-set-title', href: '#/cancion/' + it.cancion }, s.titulo),
          h('span', { class: 'pcan-set-sub' },
            s.numero ? h('span', { text: sprintf(/* translators: %s: número de himnario */ __('Nº %s'), s.numero) }) : null,
            s.tempo ? h('span', { title: sprintf(/* translators: %s: tempo en pulsaciones por minuto */ __('%s pulsaciones por minuto'), s.tempo), text: '♩ ' + s.tempo }) : null,
            it.nota ? h('span', { class: 'pcan-set-note', text: it.nota }) : null)),
        h('span', { class: 'pcan-set-recursos', 'aria-hidden': 'true' },
          s.partituras && s.partituras.length ? h('span', { title: s.partituras.length === 1 ? __('Partitura') : sprintf(_n('%d partitura', '%d partituras', s.partituras.length), s.partituras.length) }, icono('partitura')) : null,
          s.letra ? h('span', { title: __('Letra') }, icono('letra')) : null),
        tono ? P.pastillaTono(tono, { title: __('Tonalidad') }) : null,
        h('a', { class: 'pcan-icon-btn', href: '#/culto/' + c.id + '/tocar/' + (i + 1), 'aria-label': sprintf(/* translators: %s: título de la canción */ __('Tocar desde %s'), s.titulo), title: __('Tocar desde aquí') }, icono('play')));
    }));

    P.abrirPanel([
      P.cabeceraPanel(h('span', { class: 'pcan-panel-crumb', text: __('Culto') })),
      h('div', { class: 'pcan-panel-body' },
        h('div', { class: 'pcan-det-hero pcan-culto-hero' },
          bloqueFecha(c.fecha),
          h('div', null,
            h('p', { class: 'pcan-det-kicker', text: fechaLarga(c.fecha) + ' · ' + haceTanto(c.fecha) }),
            h('h2', { class: 'pcan-det-titulo', text: c.titulo }),
            h('p', { class: 'pcan-det-meta' }, c.tipo ? h('span', { text: c.tipo }) : null, h('span', { text: nCanciones(validos.length) }), c.creadoPor ? h('span', { class: 'pcan-muted', text: sprintf(/* translators: %s: nombre de quien preparó el culto */ __('Preparado por %s'), c.creadoPor) }) : null))),
        h('div', { class: 'pcan-det-actions' },
          validos.length ? h('a', { class: 'pcan-btn pcan-btn-primary pcan-btn-lg', href: '#/culto/' + c.id + '/tocar/1' }, icono('play'), __('Tocar el culto')) : null,
          h('a', { class: 'pcan-btn', href: '#/culto/editar/' + c.id }, icono('editar'), h('span', { class: 'pcan-btn-label', text: validos.length ? __('Editar') : __('Añadir canciones') })),
          P.accionesSecundarias([
            { texto: __('Copiar como texto'), icono: 'copiar', fn: function () { P.copiar(textoSetlist(c), __('Setlist copiado (para WhatsApp)')); } },
            validos.length ? pdfItem : null,
            { texto: __('Exportar escaleta'), icono: 'descargar', fn: function (e) { exportarEscaleta(c, e.currentTarget); } },
            { texto: __('Duplicar para otro día'), icono: 'mas', href: '#/culto/duplicar/' + c.id },
            c.puedeBorrar ? { texto: __('Borrar culto'), icono: 'borrar', peligro: true, fn: function () { borrar(c); } } : null
          ])),
        c.notas ? h('div', { class: 'pcan-notas pcan-culto-notas', text: c.notas }) : null,
        c.items.length ? lista : h('div', { class: 'pcan-empty-tab' },
          h('p', { text: __('Este culto aún no tiene canciones.') }),
          h('a', { class: 'pcan-btn pcan-btn-primary', href: '#/culto/editar/' + c.id }, icono('mas'), __('Añadir canciones'))))
    ], c.titulo, { vista: 'cultos', id: c.id });
  }

  function textoSetlist(c) {
    var lineas = [sprintf(/* translators: 1: título del culto, 2: fecha completa («Domingo, 26 de octubre de 2026») */ __('%1$s — %2$s'), c.titulo, fechaLarga(c.fecha)), ''];
    var n = 0;
    c.items.forEach(function (it) {
      if (it.eliminada) { return; }
      n++;
      var s = it.datos;
      var tono = it.tonalidad || s.tonalidad;
      lineas.push(n + '. ' + s.titulo + (s.numero ? ' ' + sprintf(/* translators: %s: número de himnario */ __('(nº %s)'), s.numero) : '') + (tono ? ' — ' + P.tono(tono) : ''));
      if (it.nota) { lineas.push('   ' + it.nota); }
    });
    if (c.notas) { lineas.push('', c.notas); }
    lineas.push('', location.href.split('#')[0] + '#/culto/' + c.id);
    return lineas.join('\n');
  }

  function borrar(c) {
    if (!window.confirm(sprintf(/* translators: %s: título del culto */ __('¿Borrar el culto «%s»? Un administrador podrá recuperarlo desde la papelera.'), c.titulo))) { return; }
    api('cultos/' + c.id, { method: 'DELETE' }).then(function () {
      aviso(__('Culto borrado'));
      return cargar(true);
    }).then(function () {
      location.hash = '#/cultos';
      refrescar();
    }).catch(function (e) { aviso(e.message, 'error'); });
  }

  // ---------------------------------------------------------------- editor

  /**
   * Arrastrar con puntero (ratón y pantalla táctil) para reordenar los hijos de `lista`: se mueve el elemento en el DOM
   * y al soltar se avisa con el orden nuevo, como los data-i que llevaban los hijos antes de moverlos.
   */
  function arrastrarFila(asa, li, lista, alSoltar) {
    asa.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) { return; }
      e.preventDefault();
      // Se escucha en la ventana: al mover la fila en el DOM el navegador suelta la captura del puntero.
      var puntero = e.pointerId;
      li.classList.add('is-dragging');
      lista.classList.add('is-sorting');

      function mueve(ev) {
        if (ev.pointerId !== puntero) { return; }
        ev.preventDefault();
        var hermanos = Array.prototype.slice.call(lista.children).filter(function (n) { return n !== li; });
        var antes = null;
        for (var k = 0; k < hermanos.length; k++) {
          var r = hermanos[k].getBoundingClientRect();
          if (ev.clientY < r.top + r.height / 2) { antes = hermanos[k]; break; }
        }
        if (antes) { if (li.nextSibling !== antes) { lista.insertBefore(li, antes); } }
        else if (lista.lastChild !== li) { lista.appendChild(li); }
      }

      function suelta(ev) {
        if (ev.pointerId !== puntero) { return; }
        window.removeEventListener('pointermove', mueve);
        window.removeEventListener('pointerup', suelta);
        window.removeEventListener('pointercancel', suelta);
        li.classList.remove('is-dragging');
        lista.classList.remove('is-sorting');
        alSoltar(Array.prototype.map.call(lista.children, function (n) { return +n.getAttribute('data-i'); }));
      }

      window.addEventListener('pointermove', mueve, { passive: false });
      window.addEventListener('pointerup', suelta);
      window.addEventListener('pointercancel', suelta);
    });
  }

  function abrirEditor(id, opciones) {
    opciones = opciones || {};
    P.mostrarVista('cultos');
    if (!id) {
      cargar().then(function () { pintarEditor(null, opciones); });
      return;
    }
    P.abrirPanel(h('div', { class: 'pcan-panel-loading', text: __('Cargando culto…') }), __('Editar culto'), { vista: 'cultos', id: id });
    Promise.all([api('cultos/' + id), cargar()]).then(function (r) {
      if (opciones.duplicar) {
        var copia = r[0];
        pintarEditor(null, {
          tipo: copia.tipo, notas: copia.notas,
          items: copia.items.filter(function (it) { return !it.eliminada; }).map(function (it) { return { cancion: +it.cancion, tonalidad: it.tonalidad, nota: it.nota, partitura: it.partitura || 0 }; })
        });
      } else {
        pintarEditor(r[0], opciones);
      }
    }).catch(function (e) { aviso(e.message, 'error'); P.cerrarPanel(); });
  }

  function pintarEditor(c, opciones) {
    var editando = !!c;
    var items = editando
      ? c.items.filter(function (it) { return !it.eliminada; }).map(function (it) { return { cancion: +it.cancion, tonalidad: it.tonalidad, nota: it.nota, partitura: it.partitura || 0 }; })
      : (opciones.items || []);
    if (opciones.cancion && !items.some(function (it) { return it.cancion === opciones.cancion; })) {
      items.push({ cancion: opciones.cancion, tonalidad: '', nota: '', partitura: 0 });
    }

    var fFecha = h('input', { type: 'date', class: 'pcan-input', required: true, value: editando ? c.fecha : proximoDomingo() });
    var listaTipos = h('datalist', { id: 'pcan-tipos' }, TIPOS.map(function (t) { return h('option', { value: t }); }));
    var fTipo = h('input', { type: 'text', class: 'pcan-input', list: 'pcan-tipos', maxlength: '80', value: editando ? c.tipo : (opciones.tipo || TIPOS[0]) });
    var fTitulo = h('input', { type: 'text', class: 'pcan-input', required: true, maxlength: '200', value: editando ? c.titulo : '' });
    var fNotas = h('textarea', { class: 'pcan-input pcan-textarea', rows: '2', placeholder: __('Tema del culto, quién predica, indicaciones para el equipo…') });
    fNotas.value = editando ? c.notas : (opciones.notas || '');

    // El título se rellena solo («Culto dominical · 26 oct») hasta que alguien lo cambie a mano.
    var tituloManual = editando;
    function tituloAuto() {
      if (tituloManual) { return; }
      var tipo = fTipo.value.trim() || __('Culto');
      fTitulo.value = fFecha.value ? sprintf(/* translators: 1: tipo de culto («Culto dominical»), 2: fecha corta («26 oct») */ __('%1$s · %2$s'), tipo, fechaCorta(fFecha.value)) : tipo;
    }
    fTitulo.addEventListener('input', function () { tituloManual = fTitulo.value.trim() !== ''; });
    fFecha.addEventListener('change', function () { tituloAuto(); pintarItems(); });
    fTipo.addEventListener('input', tituloAuto);
    tituloAuto();

    // Buscador para añadir canciones.
    var resultados = h('div', { class: 'pcan-picker-results', role: 'listbox', hidden: true });
    var buscador = h('input', {
      type: 'search', class: 'pcan-input', placeholder: __('Buscar canción por título, número o letra…'), autocomplete: 'off',
      'aria-label': __('Añadir canción al setlist'), role: 'combobox', 'aria-expanded': 'false'
    });
    var activo = 0;
    var encontrados = [];

    function pintarResultados() {
      var q = buscador.value.trim();
      resultados.innerHTML = '';
      encontrados = q ? P.buscar(q).slice(0, 8) : [];
      resultados.hidden = !q;
      buscador.setAttribute('aria-expanded', q ? 'true' : 'false');
      if (!q) { return; }
      if (!encontrados.length) {
        append(resultados, h('div', { class: 'pcan-picker-empty' }, __('Sin resultados.') + ' ', h('a', { href: '#/nueva', target: '_blank', text: __('Subir una canción nueva') })));
        return;
      }
      activo = Math.min(activo, encontrados.length - 1);
      encontrados.forEach(function (s, i) {
        var rep = avisoRepeticion(s.id, fFecha.value, editando ? c.id : 0);
        var ya = items.some(function (it) { return it.cancion === s.id; });
        append(resultados, h('button', {
          type: 'button', role: 'option', class: 'pcan-picker-item' + (i === activo ? ' is-active' : ''), 'aria-selected': i === activo ? 'true' : 'false',
          onmousedown: function (e) { e.preventDefault(); },
          onclick: function () { anadir(s); }
        },
          h('span', { class: 'pcan-set-num', text: s.numero || '♪' }),
          h('span', { class: 'pcan-picker-main' },
            h('span', { class: 'pcan-picker-title', text: s.titulo }),
            ya ? h('span', { class: 'pcan-picker-warn', text: __('Ya está en este setlist') })
              : rep ? h('span', { class: 'pcan-picker-warn', text: rep }) : null)));
      });
    }

    function anadir(s) {
      items.push({ cancion: s.id, tonalidad: '', nota: '', partitura: 0 });
      buscador.value = '';
      activo = 0;
      pintarResultados();
      pintarItems();
      buscador.focus();
    }

    buscador.addEventListener('input', function () { activo = 0; pintarResultados(); });
    buscador.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); activo = Math.min(activo + 1, encontrados.length - 1); pintarResultados(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activo = Math.max(activo - 1, 0); pintarResultados(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (encontrados[activo]) { anadir(encontrados[activo]); } }
      else if (e.key === 'Escape' && buscador.value) { e.stopPropagation(); buscador.value = ''; pintarResultados(); }
    });
    buscador.addEventListener('blur', function () { setTimeout(function () { resultados.hidden = true; }, 150); });
    buscador.addEventListener('focus', function () { if (buscador.value.trim()) { pintarResultados(); } });

    // Lista ordenable.
    var lista = h('ol', { class: 'pcan-setlist is-edit' });
    var escEd = null;

    function mover(desde, hasta) {
      if (hasta < 0 || hasta >= items.length || desde === hasta) { return; }
      var it = items.splice(desde, 1)[0];
      items.splice(hasta, 0, it);
      pintarItems();
    }

    function pintarItems() {
      lista.innerHTML = '';
      // Las listas de canciones de la escaleta siguen al setlist.
      if (escEd) { escEd.setlistCambio(); }
      if (!items.length) {
        append(lista, h('li', { class: 'pcan-set-placeholder', text: __('Busca canciones arriba para añadirlas. Después puedes arrastrarlas para cambiar el orden.') }));
        return;
      }
      items.forEach(function (it, i) {
        var s = P.cancion(it.cancion);
        var titulo = s ? s.titulo : __('Canción no disponible');
        var repetida = items.filter(function (o) { return o.cancion === it.cancion; }).length > 1;
        var rep = avisoRepeticion(it.cancion, fFecha.value, editando ? c.id : 0);

        var asa = h('button', { type: 'button', class: 'pcan-drag', 'aria-label': sprintf(/* translators: %s: título de la canción */ __('Arrastrar para reordenar %s'), titulo), title: __('Arrastrar') }, icono('arrastrar'));
        var li = h('li', { class: 'pcan-set-item', 'data-i': String(i) },
          asa,
          h('span', { class: 'pcan-set-n', text: String(i + 1) }),
          h('span', { class: 'pcan-set-main' },
            h('span', { class: 'pcan-set-title' }, s && s.numero ? h('span', { class: 'pcan-set-num', text: s.numero }) : null, titulo),
            h('span', { class: 'pcan-set-fields' },
              h('input', {
                type: 'text', class: 'pcan-input pcan-input-sm pcan-set-tono', list: 'pcan-tonos-set', value: P.tono(it.tonalidad),
                placeholder: s && s.tonalidad ? P.tono(s.tonalidad) : _x('Tono', 'tonalidad de la canción'), 'aria-label': sprintf(/* translators: %s: título de la canción */ __('Tonalidad de %s'), titulo),
                oninput: function (e) { it.tonalidad = P.tonoGuardar(e.target.value); }
              }),
              h('input', {
                type: 'text', class: 'pcan-input pcan-input-sm', value: it.nota, placeholder: __('Nota (p. ej. «solo estrofas 1 y 3»)'),
                'aria-label': sprintf(/* translators: %s: título de la canción */ __('Nota para %s'), titulo), oninput: function (e) { it.nota = e.target.value; }
              }),
              s && s.variantes && s.variantes.length > 1 ? (function () {
                var sel = h('select', {
                  class: 'pcan-input pcan-input-sm pcan-set-partitura', 'aria-label': sprintf(/* translators: %s: título de la canción */ __('Partitura de %s'), titulo), title: __('Partitura que se usa en este culto (modo culto y PDF)'),
                  onchange: function (e) { it.partitura = +e.target.value; }
                }, [h('option', { value: '0', text: __('Partitura: la principal') })].concat(s.variantes.map(function (v, k) {
                  return h('option', { value: String(v.id), text: sprintf(/* translators: %s: nombre de la partitura (el que le puso el equipo, o «n.º 2») */ __('Partitura: %s'), v.label || sprintf(/* translators: %d: posición de la partitura en la lista */ __('n.º %d'), k + 1)) });
                })));
                sel.value = String(it.partitura || 0);
                return sel;
              })() : null),
            repetida ? h('span', { class: 'pcan-picker-warn' }, icono('aviso'), __('Está repetida en este setlist')) : null,
            rep ? h('span', { class: 'pcan-picker-warn' }, icono('aviso'), rep) : null),
          h('span', { class: 'pcan-set-tools' },
            h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': _x('Subir', 'mover una canción hacia arriba en el setlist'), disabled: i === 0, onclick: function () { mover(i, i - 1); } }, icono('arriba')),
            h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': _x('Bajar', 'mover una canción hacia abajo en el setlist'), disabled: i === items.length - 1, onclick: function () { mover(i, i + 1); } }, icono('abajo')),
            h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': sprintf(/* translators: %s: título de la canción */ __('Quitar %s'), titulo), onclick: function () { items.splice(i, 1); pintarItems(); } }, icono('cerrar'))));

        arrastrable(asa, li);
        append(lista, li);
      });
    }

    function arrastrable(asa, li) {
      arrastrarFila(asa, li, lista, function (orden) {
        var nuevos = orden.map(function (k) { return items[k]; });
        items.length = 0;
        Array.prototype.push.apply(items, nuevos);
        pintarItems();
      });
    }

    // Pestaña «Escaleta»: se crea antes del primer pintarItems() para que este la avise de los cambios del setlist.
    escEd = crearEscaletaEditor({
      inicial: editando && c.escaleta ? c.escaleta : null,
      culto: function () {
        return {
          titulo: fTitulo.value.trim(), fecha: fFecha.value, tipo: fTipo.value.trim(),
          items: items.map(function (it) { var s = P.cancion(it.cancion); return s ? { cancion: it.cancion, datos: { titulo: s.titulo, numero: s.numero } } : null; }).filter(Boolean)
        };
      }
    });

    pintarItems();

    var errorBox = h('div', { class: 'pcan-form-error', role: 'alert', hidden: true });
    var guardar = h('button', { type: 'submit', class: 'pcan-btn pcan-btn-primary' }, editando ? __('Guardar cambios') : __('Crear culto'));
    var tonos = h('datalist', { id: 'pcan-tonos-set' }, P.tonalidades.map(function (t) { return h('option', { value: P.tono(t) }); }));

    // Dos pestañas bajo los datos del culto: «Canciones» (el setlist y las notas) y «Escaleta» (la hoja impresa del orden del culto).
    var idPestanas = 'pcan-pest-' + (++contadorEsc);
    var panelCanciones = h('div', { class: 'pcan-ec-panel', role: 'tabpanel', id: idPestanas + '-canciones', 'aria-labelledby': idPestanas + '-tab-canciones' },
      h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: __('Setlist') }),
        h('div', { class: 'pcan-picker' }, buscador, resultados),
        lista, tonos),
      h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: __('Notas') }),
        fNotas));
    var panelEscaleta = h('div', { class: 'pcan-ec-panel', role: 'tabpanel', id: idPestanas + '-escaleta', 'aria-labelledby': idPestanas + '-tab-escaleta', hidden: true }, escEd.el);
    var pestanas = [
      { clave: 'canciones', texto: __('Canciones'), panel: panelCanciones },
      { clave: 'escaleta', texto: _x('Escaleta', 'pestaña del editor del culto: la hoja impresa con el orden del culto'), panel: panelEscaleta }
    ];
    pestanas.forEach(function (p) {
      p.boton = h('button', {
        type: 'button', role: 'tab', class: 'pcan-seg', id: idPestanas + '-tab-' + p.clave, 'aria-controls': idPestanas + '-' + p.clave,
        onclick: function () { elegirPestana(p.clave); },
        onkeydown: function (e) {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') { return; }
          e.preventDefault();
          var otra = pestanas[(pestanas.indexOf(p) + 1) % pestanas.length];
          elegirPestana(otra.clave);
          otra.boton.focus();
        }
      }, p.texto);
    });
    function elegirPestana(clave) {
      pestanas.forEach(function (p) {
        var activa = p.clave === clave;
        p.boton.classList.toggle('is-active', activa);
        p.boton.setAttribute('aria-selected', activa ? 'true' : 'false');
        p.boton.tabIndex = activa ? 0 : -1;
        p.panel.hidden = !activa;
      });
      if (clave === 'escaleta') { escEd.mostrar(); }
    }
    var barraPestanas = h('div', { class: 'pcan-segment pcan-ec-tabs', role: 'tablist', 'aria-label': __('Partes del culto') }, pestanas.map(function (p) { return p.boton; }));
    elegirPestana('canciones');

    // En pantallas anchas los datos van en una fila y cada canción del setlist en una línea (ver «editor del culto» en el CSS).
    var form = h('form', { class: 'pcan-form pcan-form-culto', novalidate: true },
      h('div', { class: 'pcan-grid-2 pcan-culto-datos' },
        P.campo(__('Fecha'), fFecha, null, true),
        P.campo(__('Tipo de culto'), h('span', null, fTipo, listaTipos)),
        h('div', { class: 'pcan-span-2' }, P.campo(__('Título'), fTitulo, __('Se rellena solo con el tipo y la fecha; puedes cambiarlo.'), true))),
      barraPestanas,
      panelCanciones,
      panelEscaleta,
      errorBox,
      h('div', { class: 'pcan-form-actions' },
        guardar,
        h('button', { type: 'button', class: 'pcan-btn', onclick: function () { if (editando) { location.hash = '#/culto/' + c.id; } else { P.cerrarPanel(); } } }, __('Cancelar'))));

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errores = [];
      if (!fFecha.value) { errores.push(__('Indica la fecha.')); }
      if (!fTitulo.value.trim()) { errores.push(__('Escribe el título.')); }
      if (errores.length) { errorBox.textContent = errores.join(' '); errorBox.hidden = false; return; }
      // Una sección sin título en el editor de secciones de la escaleta: se vuelve a esa pestaña para completarla.
      var fallo = escEd.validar();
      if (fallo) {
        elegirPestana('escaleta');
        fallo.enfocar();
        errorBox.textContent = fallo.mensaje;
        errorBox.hidden = false;
        return;
      }
      errorBox.hidden = true;
      guardar.disabled = true;
      guardar.textContent = __('Guardando…');

      // La escaleta solo viaja si el culto ya tenía una o si se abrió la pestaña (los valores por defecto pasan a explícitos).
      var cuerpo = { titulo: fTitulo.value.trim(), fecha: fFecha.value, tipo: fTipo.value.trim(), notas: fNotas.value, items: items };
      var escaleta = escEd.valor();
      if (escaleta) { cuerpo.escaleta = escaleta; }

      fetch(P.cfg.api + (editando ? 'cultos/' + c.id : 'cultos'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-WP-Nonce': P.cfg.nonce, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo)
      }).then(function (r) {
        return r.json().then(function (d) { if (!r.ok) { throw new Error(d.message || sprintf(/* translators: %d: código de error HTTP */ __('Error %d'), r.status)); } return d; });
      }).then(function (guardado) {
        P.marcarGuardado();
        aviso(editando ? __('Culto guardado') : __('Culto creado'));
        return cargar(true).then(function () {
          refrescar();
          location.hash = '#/culto/' + guardado.id;
        });
      }).catch(function (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
        guardar.disabled = false;
        guardar.textContent = editando ? __('Guardar cambios') : __('Crear culto');
      });
    });

    P.abrirPanel([
      P.cabeceraPanel(h('h2', { text: editando ? __('Editar culto') : __('Nuevo culto') })),
      h('div', { class: 'pcan-panel-body' }, form)
    ], editando ? __('Editar culto') : __('Nuevo culto'), { vista: 'cultos', id: editando ? c.id : 0 });
    buscador.focus();
  }

  // ---------------------------------------------------------------- modo culto (lector a pantalla completa)

  var lector = null;

  function abrirModo(id, n) {
    var indice = Math.max(0, (parseInt(n, 10) || 1) - 1);
    // Un mismo cambio de dirección puede llegar dos veces (popstate y hashchange): mientras el culto se carga queda
    // anotado, para no abrir un segundo lector encima del primero. Si ya está abierto, solo se cambia de canción.
    if (lector && lector.culto === +id) {
      if (lector.cargando) { lector.indice = indice; } else { lector.irACancion(indice); }
      return;
    }
    var pendiente = { culto: +id, cargando: true, indice: indice };
    lector = pendiente;
    P.ocultarPanel();
    api('cultos/' + id).then(function (c) {
      // Se salió del modo culto (o se pidió otro) mientras cargaba.
      if (lector !== pendiente) { return; }
      indice = pendiente.indice;
      var items = c.items.filter(function (it) { return !it.eliminada && it.datos.partituras.length; });
      if (!items.length) { lector = null; aviso(__('Este culto no tiene partituras'), 'error'); location.hash = '#/culto/' + c.id; return; }
      var l = P.Visor.abrirLector({
        titulo: c.titulo,
        inicio: indice,
        canciones: items.map(function (it) {
          return {
            id: +it.cancion, titulo: it.datos.titulo, numero: it.datos.numero,
            tono: it.tonalidad || it.datos.tonalidad, tempo: it.datos.tempo, nota: it.nota, letra: it.datos.letra, partituras: it.datos.partituras
          };
        }),
        alCambiar: function (i) {
          history.replaceState('', document.title, location.pathname + location.search + '#/culto/' + c.id + '/tocar/' + (i + 1));
        },
        alCerrar: function () {
          var desdeRuta = lector && lector.desdeRuta;
          lector = null;
          if (!desdeRuta) { history.pushState('', document.title, location.pathname + location.search + '#/culto/' + c.id); }
          verCulto(c.id);
        }
      });
      lector = { culto: +c.id, irACancion: l.irACancion, cerrar: l.cerrar, desdeRuta: false };
    }).catch(function (e) { if (lector === pendiente) { lector = null; } aviso(e.message, 'error'); });
  }

  // ---------------------------------------------------------------- inicio: próximo culto y canciones para recuperar

  P.enInicio(function (heroe, tarjetas) {
    cargar().then(function () {
      var hoy = hoyISO();
      var proximo = cultos.filter(function (c) { return c.fecha >= hoy; }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); })[0];
      heroe.innerHTML = '';
      append(heroe, tarjetaProximo(proximo));

      // Para recuperar: lo que lleva tiempo sin sonar (o nunca ha sonado).
      var ultima = {};
      cultos.forEach(function (c) {
        if (c.fecha > hoy) { return; }
        c.items.forEach(function (it) { var id = +it.cancion; if (!ultima[id] || c.fecha > ultima[id]) { ultima[id] = c.fecha; } });
      });
      var limite = (function () { var d = fechaLocal(hoy); d.setDate(d.getDate() - 90); return isoDe(d); })();
      var candidatas = P.state.canciones.map(function (s) { return { s: s, u: ultima[s.id] || '' }; })
        .filter(function (x) { return !x.u || x.u < limite; })
        .sort(function (a, b) { return a.u.localeCompare(b.u); }).slice(0, 5);
      var previa = tarjetas.querySelector('.pcan-home-card.is-recuperar');
      if (previa) { previa.remove(); }
      append(tarjetas, h('section', { class: 'pcan-home-card is-recuperar' },
        h('header', { class: 'pcan-home-card-head' }, h('h2', { text: __('Para recuperar') }), h('a', { href: '#/estadisticas', text: __('Estadísticas') })),
        candidatas.length ? h('ul', { class: 'pcan-mini-lista' }, candidatas.map(function (x) {
          return h('li', null, h('a', { href: '#/cancion/' + x.s.id },
            h('span', { class: 'pcan-num is-sm' + (x.s.numero ? '' : ' is-empty') }, x.s.numero ? x.s.numero : icono('nota')),
            h('span', { class: 'pcan-mini-texto' }, h('strong', { text: x.s.titulo }), h('span', { text: x.u ? sprintf(/* translators: %s: cuándo fue («hace 4 meses») */ __('Última vez %s'), haceTanto(x.u)) : __('Nunca se ha tocado') }))));
        })) : h('p', { class: 'pcan-muted', text: __('Todo el repertorio ha sonado en los últimos 3 meses.') })));
    });
  });

  // ---------------------------------------------------------------- paleta de búsqueda: cultos

  P.enPaleta(function (q) {
    var nq = P.norm(q);
    var hoy = hoyISO();
    var lista = cultos.slice().sort(function (a, b) {
      var fa = a.fecha >= hoy, fb = b.fecha >= hoy;
      if (fa !== fb) { return fa ? -1 : 1; }
      return fa ? a.fecha.localeCompare(b.fecha) : b.fecha.localeCompare(a.fecha);
    }).filter(function (c) {
      return !nq || P.norm(c.titulo + ' ' + c.tipo + ' ' + fechaLarga(c.fecha)).indexOf(nq) !== -1;
    }).slice(0, nq ? 4 : 2);
    return { titulo: nq ? __('Cultos') : __('Próximos cultos'), items: lista.map(function (c) {
      return { titulo: c.titulo, sub: sprintf(/* translators: 1: fecha completa del culto, 2: número de canciones («3 canciones») */ __('%1$s · %2$s'), fechaLarga(c.fecha), nCanciones(c.items.length)), icono: 'calendario', href: '#/culto/' + c.id };
    }) };
  });

  // ---------------------------------------------------------------- PDF combinado

  function cargarPdfLib() {
    if (window.PDFLib) { return Promise.resolve(window.PDFLib); }
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PDF_LIB;
      s.onload = function () { resolve(window.PDFLib); };
      s.onerror = function () { reject(new Error(__('No se pudo cargar el generador de PDF.'))); };
      document.head.appendChild(s);
    });
  }

  // Las fuentes estándar del PDF solo admiten Latin-1: se sustituyen los caracteres que no caben.
  function latin1(t) {
    return String(t || '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
  }

  // Las partituras del PDF del setlist van sin el margen en blanco que traen muchas (el mismo recorte que al tocar):
  // la parte con contenido se amplía en una hoja A4, vertical o apaisada según convenga.
  var MARGEN_HOJA = 20;
  var AMPLIACION_MAX = 2;

  function cajaDe(p, n) {
    var entera = { x: 0, y: 0, w: 1, h: 1 };
    return P.Visor && P.Visor.cajaContenido ? P.Visor.cajaContenido(p, n).catch(function () { return entera; }) : Promise.resolve(entera);
  }

  function casiEntera(bb) {
    return bb.w > 0.96 && bb.h > 0.96;
  }

  /** Añade una hoja A4 y devuelve dónde dibujar un contenido de w×alto para que ocupe lo más posible. */
  function hojaPara(doc, A4, w, alto, maxEscala) {
    var tam = w > alto ? [A4[1], A4[0]] : A4;
    var hoja = doc.addPage(tam);
    var escala = Math.min((tam[0] - 2 * MARGEN_HOJA) / w, (tam[1] - 2 * MARGEN_HOJA) / alto, maxEscala || Infinity);
    return { hoja: hoja, x: (tam[0] - w * escala) / 2, y: (tam[1] - alto * escala) / 2, width: w * escala, height: alto * escala };
  }

  /** Página de un PDF: se incrusta solo el rectángulo con contenido, sin rasterizar (sigue siendo vectorial). */
  function paginaSinMargenes(doc, A4, origen, pagina, i, p) {
    function copiar() { return doc.copyPages(origen, [i]).then(function (c) { doc.addPage(c[0]); }); }
    // Las páginas giradas se dejan como están: su contenido no va en el mismo sentido que la caja medida.
    if (pagina.getRotation().angle % 360) { return copiar(); }
    return cajaDe(p, i + 1).then(function (bb) {
      if (casiEntera(bb)) { return copiar(); }
      var caja = pagina.getCropBox();
      var izq = caja.x + bb.x * caja.width, arriba = caja.y + (1 - bb.y) * caja.height;
      var w = bb.w * caja.width, alto = bb.h * caja.height;
      return doc.embedPage(pagina, { left: izq, bottom: arriba - alto, right: izq + w, top: arriba }).then(function (incrustada) {
        var r = hojaPara(doc, A4, w, alto, AMPLIACION_MAX);
        r.hoja.drawPage(incrustada, { x: r.x, y: r.y, width: r.width, height: r.height });
      });
    }).catch(copiar);
  }

  /** Imagen (JPG o PNG): se recorta en un lienzo a su resolución original y se coloca en la hoja. */
  function imagenSinMargenes(doc, A4, buf, p) {
    var esPng = /\.png$/i.test(p.url);
    function incrustar(datos) { return esPng ? doc.embedPng(datos) : doc.embedJpg(datos); }
    return cajaDe(p, 1).then(function (bb) {
      if (casiEntera(bb) || !window.createImageBitmap) { return incrustar(buf); }
      return createImageBitmap(new Blob([buf])).then(function (img) {
        var sx = Math.round(bb.x * img.width), sy = Math.round(bb.y * img.height);
        var lienzo = document.createElement('canvas');
        lienzo.width = Math.max(1, Math.round(bb.w * img.width));
        lienzo.height = Math.max(1, Math.round(bb.h * img.height));
        var ctx = lienzo.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, lienzo.width, lienzo.height);
        ctx.drawImage(img, sx, sy, lienzo.width, lienzo.height, 0, 0, lienzo.width, lienzo.height);
        return new Promise(function (resolve) { lienzo.toBlob(resolve, esPng ? 'image/png' : 'image/jpeg', 0.92); });
      }).then(function (blob) { return blob ? blob.arrayBuffer().then(incrustar) : incrustar(buf); });
    }).then(function (img) {
      var r = hojaPara(doc, A4, img.width, img.height);
      r.hoja.drawImage(img, { x: r.x, y: r.y, width: r.width, height: r.height });
    });
  }

  function descargarPdf(c) {
    aviso(__('Preparando el PDF del setlist…'));

    cargarPdfLib().then(function (L) {
      return L.PDFDocument.create().then(function (doc) {
        return Promise.all([doc.embedFont(L.StandardFonts.Helvetica), doc.embedFont(L.StandardFonts.HelveticaBold)]).then(function (fuentes) {
          var normal = fuentes[0], negrita = fuentes[1];
          var A4 = [595.28, 841.89];

          // Portada con el orden del culto.
          var pag = doc.addPage(A4);
          var y = 770;
          pag.drawText(latin1(c.titulo), { x: 56, y: y, size: 24, font: negrita, color: L.rgb(0.12, 0.23, 0.45) });
          y -= 26;
          pag.drawText(latin1(fechaLarga(c.fecha) + (c.tipo ? ' · ' + c.tipo : '')), { x: 56, y: y, size: 12, font: normal, color: L.rgb(0.37, 0.43, 0.5) });
          y -= 40;
          var n = 0;
          c.items.forEach(function (it) {
            if (it.eliminada || y < 70) { return; }
            n++;
            var s = it.datos;
            var tono = it.tonalidad || s.tonalidad;
            pag.drawText(latin1(n + '.  ' + s.titulo + (s.numero ? '  ' + sprintf(/* translators: %s: número de himnario */ __('(n.º %s)'), s.numero) : '') + (tono ? '  -  ' + P.tono(tono) : '')), { x: 56, y: y, size: 14, font: negrita });
            y -= 18;
            if (it.nota) { pag.drawText(latin1(it.nota), { x: 76, y: y, size: 11, font: normal, color: L.rgb(0.37, 0.43, 0.5) }); y -= 16; }
            y -= 8;
          });

          var fallos = [];
          var cadena = Promise.resolve();
          c.items.forEach(function (it) {
            if (it.eliminada || !it.datos.partituras.length) { return; }
            var p = it.datos.partituras[0];
            cadena = cadena.then(function () {
              return fetch(p.url, { credentials: 'same-origin' }).then(function (r) {
                if (!r.ok) { throw new Error(r.status); }
                return r.arrayBuffer();
              }).then(function (buf) {
                if (p.tipo === 'pdf') {
                  return L.PDFDocument.load(buf, { ignoreEncryption: true }).then(function (origen) {
                    return origen.getPages().reduce(function (sig, pagina, i) {
                      return sig.then(function () { return paginaSinMargenes(doc, A4, origen, pagina, i, p); });
                    }, Promise.resolve());
                  });
                }
                return imagenSinMargenes(doc, A4, buf, p);
              }).catch(function () { fallos.push(it.datos.titulo); });
            });
          });

          return cadena.then(function () { return doc.save(); }).then(function (bytes) {
            var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
            var a = h('a', { href: url, download: 'setlist-' + c.fecha + '.pdf' });
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
            if (fallos.length) { aviso(sprintf(/* translators: %s: títulos de las canciones cuya partitura no se pudo añadir, separados por comas */ __('No se pudo incluir: %s'), fallos.join(', ')), 'error'); }
            else { aviso(__('PDF descargado')); }
          });
        });
      });
    }).catch(function (e) { aviso(e.message || __('No se pudo generar el PDF'), 'error'); });
  }

  // ---------------------------------------------------------------- escaleta: datos y lógica común
  //
  // La escaleta es la hoja impresa del orden del culto: una tabla con una fila por sección. Cada culto tiene la suya: su fila
  // de títulos, sus secciones con sus campos (y los textos por defecto) y los valores. Se prepara en la pestaña Escaleta del
  // editor del culto y solo afecta a ese culto; un culto nuevo parte de la última escaleta guardada (GET escaleta). Un valor
  // null significa «sin tocar»: se aplica el defecto del campo al mostrarlo y al imprimirlo, de modo que sigue al setlist
  // mientras nadie lo cambie a mano. Solo el logo y la imagen de cabecera son de la instalación (Ajustes y equipo → Escaleta).

  var TIPOS_CAMPO = ['texto', 'textoLargo', 'cancion', 'canciones'];
  var TAM_TEXTO = 12;
  var TAM_PEQUENO = 8;
  var contadorEsc = 0;

  // Carpeta assets/ del plugin, a partir de la dirección de este mismo script (la config no la trae).
  var BASE_ASSETS = (function () {
    var s = document.currentScript || document.querySelector('script[src*="cultos.js"]');
    return s && s.src ? s.src.replace(/[^\/?#]*([?#].*)?$/, '') : '';
  })();

  /** Plantilla estándar, sin textos de ninguna iglesia: la misma que da el servidor mientras nadie guarde la suya. */
  function plantillaGenerica() {
    function campo(id, tipo, etiqueta, defecto, pequeno) {
      return { id: id, tipo: tipo, etiqueta: etiqueta || '', defecto: defecto === undefined ? '' : defecto, pequeno: !!pequeno };
    }
    function sec(id, titulo, campos) { return { id: id, titulo: titulo, nota: '', campos: campos }; }
    // Mismos textos y contextos que la plantilla del servidor (includes/escaleta.php), para que compartan traducción.
    return {
      titulo: _x('ORDEN DE CULTO', 'título de la escaleta impresa del culto (se imprime en mayúsculas)'), central: '', logo: null, cabecera: null,
      secciones: [
        sec('preludio', _x('PRELUDIO', 'sección de la escaleta del culto (en mayúsculas)'), [campo('cancion', 'cancion', '', 'primera')]),
        sec('lectura-oracion', _x('LECTURA Y ORACIÓN', 'sección de la escaleta del culto (en mayúsculas)'), [campo('presidencia', 'texto', _x('Presidencia', 'etiqueta de un campo de la escaleta del culto')), campo('lectura', 'texto', _x('Lectura', 'etiqueta de un campo de la escaleta del culto'))]),
        sec('bienvenida', _x('BIENVENIDA', 'sección de la escaleta del culto (en mayúsculas)'), [campo('bienvenida', 'texto', '', __('Bienvenida a todos y a quienes nos visitan'))]),
        sec('comunidad', _x('VIDA DE COMUNIDAD', 'sección de la escaleta del culto (en mayúsculas)'), [campo('comunidad', 'textoLargo')]),
        sec('alabanza', _x('CANTOS DE ALABANZA', 'sección de la escaleta del culto (en mayúsculas)'), [campo('canciones', 'canciones', '', 'ninguna')]),
        sec('ofrenda', _x('OFRENDA', 'sección de la escaleta del culto (en mayúsculas)'), [campo('musica', 'cancion', _x('Música instrumental', 'etiqueta de un campo de la escaleta del culto'), 'siguiente'), campo('responsables', 'texto', _x('Responsables', 'etiqueta de un campo de la escaleta del culto')), campo('nota', 'texto', '', '', true)]),
        sec('ninos', _x('NIÑOS', 'sección de la escaleta del culto (en mayúsculas)'), [campo('ninos', 'texto', '', __('Los niños pasan a sus clases'))]),
        sec('predicacion', _x('PREDICACIÓN', 'sección de la escaleta del culto (en mayúsculas)'), [campo('lectura-biblica', 'texto', _x('Lectura', 'etiqueta de un campo de la escaleta del culto')), campo('titulo', 'texto', _x('Título', 'etiqueta de un campo de la escaleta del culto')), campo('predicacion', 'texto', _x('Predicación', 'etiqueta de un campo de la escaleta del culto'))]),
        sec('despedida', _x('DESPEDIDA', 'sección de la escaleta del culto (en mayúsculas)'), [campo('despedida', 'textoLargo')]),
        sec('doxologia', _x('DOXOLOGÍA', 'sección de la escaleta del culto (en mayúsculas)'), [campo('doxologia', 'texto')]),
        sec('postludio', _x('POSTLUDIO', 'sección de la escaleta del culto (en mayúsculas)'), [campo('postludio', 'canciones', '', 'restantes')])
      ]
    };
  }

  /**
   * Copia limpia de una escaleta (o de una base): solo lo conocido y con el tipo correcto, por si el servidor trae algo raro.
   * `titulo` y `central` son null si la escaleta no los trae (las guardadas antes de que cada culto tuviera los suyos).
   * Ninguna sección es «extra»: todas se pueden editar en el culto.
   */
  function sanearEscaleta(e) {
    return {
      titulo: e && typeof e.titulo === 'string' ? e.titulo : null,
      central: e && typeof e.central === 'string' ? e.central : null,
      secciones: (e && Array.isArray(e.secciones) ? e.secciones : []).map(function (s) {
        return {
          id: String(s.id || ''), titulo: String(s.titulo || ''), nota: String(s.nota || ''), oculta: !!s.oculta, extra: false,
          campos: (Array.isArray(s.campos) ? s.campos : []).map(function (c) {
            return {
              id: String(c.id || ''), tipo: TIPOS_CAMPO.indexOf(c.tipo) !== -1 ? c.tipo : 'texto', etiqueta: String(c.etiqueta || ''), pequeno: !!c.pequeno,
              defecto: c.defecto === undefined || c.defecto === null ? '' : c.defecto, valor: c.valor === undefined ? null : c.valor
            };
          })
        };
      })
    };
  }

  /** Escaleta de un culto sin valores propios: copia de la base (título, texto central y secciones) con todo «sin tocar». */
  function nuevaEscaleta(plantilla) {
    var e = sanearEscaleta(plantilla);
    e.titulo = String(plantilla.titulo || '');
    e.central = String(plantilla.central || '');
    e.secciones.forEach(function (s) {
      s.oculta = false;
      s.extra = false;
      s.campos.forEach(function (c) { c.valor = null; });
    });
    return e;
  }

  /**
   * Base de una escaleta nueva tal como la trae GET escaleta, completada: la estructura y la fila de títulos de la última
   * escaleta guardada (`desde`: {id, titulo} de ese culto, o null si sale de la plantilla estándar) y el logo y la cabecera de
   * la instalación. `generica: true` si hubo que usar la estándar porque no se pudo leer.
   */
  function plantillaDe(t) {
    var base = plantillaGenerica();
    base.desde = null;
    if (!t || !Array.isArray(t.secciones)) { base.generica = true; return base; }
    return {
      titulo: typeof t.titulo === 'string' ? t.titulo : base.titulo,
      central: typeof t.central === 'string' ? t.central : '',
      logo: t.logo && t.logo.url ? t.logo : null,
      cabecera: t.cabecera && t.cabecera.url ? t.cabecera : null,
      desde: t.desde && t.desde.id ? { id: +t.desde.id, titulo: String(t.desde.titulo || '') } : null,
      secciones: sanearEscaleta(t).secciones.map(function (s) { return { id: s.id, titulo: s.titulo, nota: s.nota, campos: s.campos }; })
    };
  }

  /**
   * Pide la base de la escaleta (GET escaleta, al alcance de todo el equipo; los ajustes solo los lee quien administra).
   * Si la petición falla o no trae base se sigue con la estándar. Nunca rechaza.
   */
  function cargarPlantilla() {
    return api('escaleta').then(function (t) { return plantillaDe(t); }, function () { return plantillaDe(null); });
  }

  function tituloMay(t) { return String(t || '').toLocaleUpperCase(LOCALE); }

  /** Canciones del culto, en orden y sin repetir: [{id, titulo, numero}]. Se ignoran las eliminadas. */
  function cancionesDeCulto(culto) {
    var vistas = {}, lista = [];
    (culto.items || []).forEach(function (it) {
      var id = +it.cancion;
      if (it.eliminada || !it.datos || vistas[id]) { return; }
      vistas[id] = true;
      lista.push({ id: id, titulo: String(it.datos.titulo || ''), numero: it.datos.numero || '' });
    });
    return lista;
  }

  /** Una canción guardada ({cancion, nombre}) con el título actual si sigue en el culto; si ya no está, queda escrita a mano con su nombre. */
  function valorCancion(v, porId) {
    if (!v || typeof v !== 'object') { return null; }
    var id = +v.cancion || 0;
    if (id && porId[id]) { return { cancion: id, nombre: porId[id].titulo }; }
    return { cancion: 0, nombre: String(v.nombre || '') };
  }

  /** Lista de canciones: las del culto primero, en el orden del culto; después las escritas a mano. */
  function listaCanciones(valor, porId, orden) {
    var marcadas = {}, escritas = [];
    (Array.isArray(valor) ? valor : []).forEach(function (x) {
      var r = valorCancion(x, porId);
      if (!r) { return; }
      if (r.cancion) { marcadas[r.cancion] = true; } else { escritas.push(r); }
    });
    return orden.filter(function (id) { return marcadas[id]; }).map(function (id) { return { cancion: id, nombre: porId[id].titulo }; }).concat(escritas);
  }

  /**
   * Valor de cada campo de la escaleta aplicando los defectos donde no se ha tocado nada.
   * Devuelve { valores: Map campo → valor, usadasFuera(campo) → {id: true} con lo asignado en los demás campos }.
   * Texto: string. Una canción: {cancion, nombre} ({0, ''} = ninguna). Varias: [{cancion, nombre}] (las escritas a mano con cancion 0).
   * Las secciones ocultas no se resuelven ni cuentan como asignadas.
   */
  function resolverEscaleta(esc, canciones) {
    var porId = {}, orden = [];
    canciones.forEach(function (s) { porId[s.id] = s; orden.push(s.id); });
    var valores = new Map();
    var ultima = -1;      // posición, en el culto, de la última canción asignada hasta ahora («siguiente» es la que viene detrás)
    var diferidos = [];   // «restantes» sin tocar: se calculan al final, con lo que no haya cogido nadie

    esc.secciones.forEach(function (sec) {
      if (sec.oculta) { return; }
      sec.campos.forEach(function (c) {
        var v = c.valor;
        var sinTocar = v === null || v === undefined;
        if (c.tipo === 'texto' || c.tipo === 'textoLargo') {
          valores.set(c, sinTocar ? String(c.defecto || '') : String(v));
        } else if (c.tipo === 'cancion') {
          var r;
          if (sinTocar) {
            var k = c.defecto === 'primera' ? 0 : c.defecto === 'siguiente' ? ultima + 1 : -1;
            r = k >= 0 && k < orden.length ? { cancion: orden[k], nombre: porId[orden[k]].titulo } : { cancion: 0, nombre: '' };
          } else {
            r = valorCancion(v, porId) || { cancion: 0, nombre: '' };
          }
          if (r.cancion) { ultima = orden.indexOf(r.cancion); }
          valores.set(c, r);
        } else if (c.tipo === 'canciones') {
          if (sinTocar && c.defecto === 'restantes') { diferidos.push(c); valores.set(c, []); return; }
          var lista = sinTocar ? [] : listaCanciones(v, porId, orden);
          lista.forEach(function (x) { if (x.cancion) { ultima = Math.max(ultima, orden.indexOf(x.cancion)); } });
          valores.set(c, lista);
        }
      });
    });

    var usadas = {};
    valores.forEach(function (val, c) {
      if (c.tipo === 'cancion' && val.cancion) { usadas[val.cancion] = true; }
      else if (c.tipo === 'canciones') { val.forEach(function (x) { if (x.cancion) { usadas[x.cancion] = true; } }); }
    });
    diferidos.forEach(function (c) {
      var resto = orden.filter(function (id) { return !usadas[id]; });
      valores.set(c, resto.map(function (id) { return { cancion: id, nombre: porId[id].titulo }; }));
      resto.forEach(function (id) { usadas[id] = true; });
    });

    return {
      valores: valores,
      usadasFuera: function (campo) {
        var fuera = {};
        valores.forEach(function (val, c) {
          if (c === campo) { return; }
          if (c.tipo === 'cancion' && val.cancion) { fuera[val.cancion] = true; }
          else if (c.tipo === 'canciones') { val.forEach(function (x) { if (x.cancion) { fuera[x.cancion] = true; } }); }
        });
        return fuera;
      }
    };
  }

  /** Copia de la escaleta con los defectos ya aplicados como valores explícitos (lo que se guarda con el culto). */
  function explicitar(esc, canciones) {
    var copia = JSON.parse(JSON.stringify(esc));
    var res = resolverEscaleta(esc, canciones);
    esc.secciones.forEach(function (sec, i) {
      if (sec.oculta) { return; }
      sec.campos.forEach(function (c, j) {
        var v = res.valores.get(c);
        copia.secciones[i].campos[j].valor = c.tipo === 'canciones'
          ? v.filter(function (x) { return x.cancion || x.nombre.trim() !== ''; })
          : v;
      });
    });
    return copia;
  }

  /**
   * Lo que se imprime: una entrada por sección no oculta, { titulo, nota, lineas }, donde cada línea es
   * { runs: [{t, f}], size } (f: 'n' normal, 'b' negrita, 'i' cursiva; una línea sin runs es una línea en blanco).
   */
  function filasImpresion(esc, canciones) {
    var res = resolverEscaleta(esc, canciones);
    return esc.secciones.filter(function (s) { return !s.oculta; }).map(function (sec) {
      var lineas = [];
      sec.campos.forEach(function (c) {
        var v = res.valores.get(c);
        var size = c.pequeno ? TAM_PEQUENO : TAM_TEXTO;
        var et = c.etiqueta.trim();
        var prefijo = et ? [{ t: et + ': ', f: 'n' }] : [];
        function linea(runs) { lineas.push({ runs: runs, size: size }); }
        if (c.tipo === 'texto') {
          if (v.trim()) { linea(prefijo.concat([{ t: v.trim(), f: 'n' }])); }
        } else if (c.tipo === 'textoLargo') {
          var ls = v.replace(/\r/g, '').split('\n').map(function (l) { return l.replace(/\s+$/, ''); });
          while (ls.length && !ls[0].trim()) { ls.shift(); }
          while (ls.length && !ls[ls.length - 1].trim()) { ls.pop(); }
          ls.forEach(function (l, k) { linea(!l.trim() ? [] : (k === 0 ? prefijo : []).concat([{ t: l, f: 'n' }])); });
        } else if (c.tipo === 'cancion') {
          if (v.nombre.trim()) { linea(prefijo.concat([{ t: v.nombre.trim(), f: 'i' }])); }
        } else {
          var nombres = v.map(function (x) { return x.nombre.trim(); }).filter(Boolean);
          if (nombres.length && et) { linea([{ t: et + ':', f: 'n' }]); }
          nombres.forEach(function (n) { linea([{ t: n, f: 'i' }]); });
        }
      });
      return { titulo: tituloMay(sec.titulo), nota: sec.nota, lineas: lineas };
    });
  }

  // ---------------------------------------------------------------- escaleta: pestaña del editor del culto

  /**
   * Pestaña «Escaleta» del editor. opc: { inicial: escaleta del culto o null, culto: () → {titulo, fecha, tipo, items} con el
   * estado actual del formulario }. Devuelve { el, mostrar(), setlistCambio(), validar(), valor() }: valor() es la escaleta
   * ({titulo, central, secciones}) con los defectos ya explícitos, o undefined si el culto no tenía y no se abrió la pestaña
   * (entonces no se guarda nada); validar() es null o { mensaje, enfocar() } si el editor de secciones tiene algo sin acabar.
   *
   * Tiene dos modos: «Rellenar» (el valor de cada campo) y «Editar secciones» (la estructura: títulos, notas, campos, tipos,
   * textos por defecto, orden, añadir y quitar, con el editor de P.crearEditorEscaleta). Todo afecta solo a este culto.
   * Al volver a «Rellenar» se conservan los valores de los campos que siguen existiendo (por sección y campo) con el mismo tipo.
   */
  function crearEscaletaEditor(opc) {
    var esc = opc.inicial ? sanearEscaleta(opc.inicial) : null;
    var plantillaP = null;
    var generica = false;
    var desde = null;       // {id, titulo} del culto de cuya escaleta parte esta, si salió de la base
    var deBase = false;     // la escaleta sale de la base y el culto aún no tiene una guardada
    var modo = 'rellenar';  // 'rellenar' | 'editar'
    var editor = null;      // el editor de secciones, mientras el modo es 'editar'
    var pintado = false;
    var res = null;
    var widgets = [];   // los campos de canciones, que se repintan cuando cambia el setlist o lo asignado en otras secciones
    var cont = h('div', { class: 'pcan-ec' });

    function plantilla() { return plantillaP || (plantillaP = cargarPlantilla()); }
    function canciones() { return cancionesDeCulto(opc.culto()); }
    function recalcular() { res = resolverEscaleta(esc, canciones()); }
    // Los botones no disparan input/change: se avisa a mano para que el panel sepa que hay cambios sin guardar.
    function marcarCambio() { cont.dispatchEvent(new Event('change', { bubbles: true })); }
    function repintarCanciones(origen) { widgets.forEach(function (w) { if (w !== origen) { w.pintar(); } }); }
    // Un campo de canciones cambió: los demás se ajustan (él ya está como lo dejó quien lo tocó).
    function cambio(origen) { recalcular(); repintarCanciones(origen); }

    // Intro dentro de un campo de texto no guarda el culto: se pulsa «Guardar».
    cont.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') { e.preventDefault(); }
    });

    // Una escaleta guardada antes de que cada culto tuviera su fila de títulos toma la de la base.
    if (esc && (esc.titulo === null || esc.central === null)) {
      plantilla().then(function (pl) {
        if (esc.titulo === null) { esc.titulo = pl.titulo; }
        if (esc.central === null) { esc.central = pl.central; }
        if (pintado) { pintarTodo(); }
      });
    }

    function nombreSeccion(sec) { return tituloMay(sec.titulo) || __('Sección nueva'); }

    function textoCancion(s, i) {
      return [
        h('span', { class: 'pcan-ec-op-n', 'aria-hidden': 'true', text: String(i + 1) }),
        h('span', { class: 'pcan-ec-op-t', text: s.titulo }),
        s.numero ? h('small', { class: 'pcan-ec-op-num', text: sprintf(/* translators: %s: número de himnario */ __('Nº %s'), s.numero) }) : null
      ];
    }

    function ayuda(texto) { return h('p', { class: 'pcan-help', text: texto }); }

    function campoTexto(sec, c) {
      var largo = c.tipo === 'textoLargo';
      var el = largo ? h('textarea', { class: 'pcan-input pcan-textarea', rows: '3' }) : h('input', { type: 'text', class: 'pcan-input', maxlength: '300' });
      el.value = c.valor === null || c.valor === undefined ? String(c.defecto || '') : String(c.valor);
      if (c.pequeno) { el.classList.add('is-pequeno'); }
      if (!c.etiqueta) { el.setAttribute('aria-label', nombreSeccion(sec)); }
      el.addEventListener('input', function () { c.valor = el.value; });
      return h('label', { class: 'pcan-field' },
        c.etiqueta ? h('span', { class: 'pcan-label', text: c.etiqueta }) : null,
        el,
        c.pequeno ? h('span', { class: 'pcan-help', text: __('Se imprime en letra pequeña') }) : null);
    }

    /** Una canción del culto: botones de radio con las canciones, «Otra» con su nombre escrito y «Ninguna». */
    function campoCancion(sec, c) {
      var grupo = 'pcan-ec-' + (++contadorEsc);
      var caja = h('div', { class: 'pcan-ec-campo', role: 'group', 'aria-labelledby': grupo + '-et' });
      var modoOtra = false;
      var w = { pintar: pintar };
      widgets.push(w);

      function opcion(marcada, contenido, alElegir, clase) {
        var input = h('input', { type: 'radio', name: grupo, checked: marcada, onchange: function () { if (input.checked) { alElegir(); } } });
        return { input: input, el: h('label', { class: 'pcan-ec-op' + (clase ? ' ' + clase : '') }, input, contenido) };
      }

      function pintar() {
        var v = res.valores.get(c);
        caja.innerHTML = '';
        if (!v) { return; }   // sección oculta: no se resuelve
        modoOtra = v.cancion === 0 && (modoOtra || v.nombre.trim() !== '');
        var lista = canciones();

        var ops = h('div', { class: 'pcan-ec-ops' });
        append(ops, opcion(!v.cancion && !modoOtra, h('span', { class: 'pcan-ec-op-t pcan-muted', text: __('Ninguna') }),
          function () { modoOtra = false; c.valor = { cancion: 0, nombre: '' }; cambio(w); }).el);
        lista.forEach(function (s, i) {
          append(ops, opcion(v.cancion === s.id, textoCancion(s, i), function () { modoOtra = false; c.valor = { cancion: s.id, nombre: s.titulo }; cambio(w); }).el);
        });
        var txt = h('input', {
          type: 'text', class: 'pcan-input pcan-input-sm pcan-ec-otra-txt', maxlength: '120', value: modoOtra ? v.nombre : '',
          placeholder: __('Otra (escribe el nombre)'), 'aria-label': __('Otra (escribe el nombre)')
        });
        var otra = opcion(modoOtra, txt, function () { modoOtra = true; c.valor = { cancion: 0, nombre: txt.value }; cambio(w); txt.focus(); }, 'is-otra');
        txt.addEventListener('input', function () { modoOtra = true; otra.input.checked = true; c.valor = { cancion: 0, nombre: txt.value }; cambio(w); });
        append(ops, otra.el);

        append(caja, [
          h('span', { class: 'pcan-label', id: grupo + '-et', text: c.etiqueta || __('Canción') }),
          lista.length ? null : ayuda(__('Este culto aún no tiene canciones: añádelas en la pestaña Canciones o escribe el nombre.')),
          ops
        ]);
      }

      pintar();
      return caja;
    }

    /** Varias canciones: casillas con las del culto (con «restantes», solo las que no están en otras secciones) y nombres escritos a mano. */
    function campoCanciones(sec, c) {
      var grupo = 'pcan-ec-' + (++contadorEsc);
      var caja = h('div', { class: 'pcan-ec-campo', role: 'group', 'aria-labelledby': grupo + '-et' });
      var w = { pintar: pintar };
      widgets.push(w);

      function pintar() {
        var v = res.valores.get(c);
        caja.innerHTML = '';
        if (!v) { return; }
        var lista = canciones();
        var marcadas = {};
        v.forEach(function (x) { if (x.cancion) { marcadas[x.cancion] = true; } });
        var fuera = c.defecto === 'restantes' ? res.usadasFuera(c) : {};
        var visibles = lista.filter(function (s) { return !fuera[s.id] || marcadas[s.id]; });
        var casillas = [];
        var escritas = [];   // los campos de texto de los nombres escritos a mano
        var cajaEscritas = h('div', { class: 'pcan-ec-escritas' });

        // El valor sale de lo que hay en pantalla: así lo primero que se toca ya fija lo que se veía por defecto.
        function guardar() {
          var elegidas = {};
          casillas.forEach(function (k) { if (k.input.checked) { elegidas[k.s.id] = true; } });
          c.valor = lista.filter(function (s) { return elegidas[s.id]; }).map(function (s) { return { cancion: s.id, nombre: s.titulo }; })
            .concat(escritas.map(function (t) { return { cancion: 0, nombre: t.value }; }));
          cambio(w);
        }

        function filaEscrita(nombre, enfocar) {
          var txt = h('input', { type: 'text', class: 'pcan-input pcan-input-sm', maxlength: '120', value: nombre, placeholder: __('Nombre escrito a mano'), 'aria-label': __('Nombre escrito a mano'), oninput: guardar });
          var fila = h('div', { class: 'pcan-ec-escrita' }, txt,
            h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-btn-danger', onclick: function () { fila.remove(); escritas.splice(escritas.indexOf(txt), 1); guardar(); } }, icono('cerrar'), __('Quitar')));
          escritas.push(txt);
          append(cajaEscritas, fila);
          if (enfocar) { txt.focus(); }
        }

        var ops = h('div', { class: 'pcan-ec-ops' });
        visibles.forEach(function (s) {
          var input = h('input', { type: 'checkbox', checked: !!marcadas[s.id], onchange: guardar });
          casillas.push({ s: s, input: input });
          append(ops, h('label', { class: 'pcan-ec-op' }, input, textoCancion(s, lista.indexOf(s))));
        });
        v.filter(function (x) { return !x.cancion; }).forEach(function (x) { filaEscrita(x.nombre, false); });

        append(caja, [
          h('span', { class: 'pcan-label', id: grupo + '-et', text: c.etiqueta || __('Canciones') }),
          !lista.length ? ayuda(__('Este culto aún no tiene canciones: añádelas en la pestaña Canciones o escribe los nombres.'))
            : !visibles.length ? ayuda(__('Todas las canciones del culto están ya en otras secciones.')) : null,
          ops,
          cajaEscritas,
          h('button', { type: 'button', class: 'pcan-btn pcan-btn-sm pcan-ec-anadir', onclick: function () { filaEscrita('', true); guardar(); } }, icono('mas'), __('Añadir otra (escribe el nombre)'))
        ]);
      }

      pintar();
      return caja;
    }

    function campoDe(sec, c) {
      return c.tipo === 'cancion' ? campoCancion(sec, c) : c.tipo === 'canciones' ? campoCanciones(sec, c) : campoTexto(sec, c);
    }

    function mover(desde, hasta, accion) {
      if (hasta < 0 || hasta >= esc.secciones.length) { return; }
      var s = esc.secciones.splice(desde, 1)[0];
      esc.secciones.splice(hasta, 0, s);
      pintarTodo({ i: hasta, accion: accion });
      marcarCambio();
    }

    function tarjeta(sec, i, lista) {
      var nombre = nombreSeccion(sec);
      var li = h('li', { class: 'pcan-ec-sec' + (sec.oculta ? ' is-oculta' : ''), 'data-i': String(i) });
      var asa = h('button', { type: 'button', class: 'pcan-drag', 'aria-label': sprintf(/* translators: %s: título de la sección de la escaleta */ __('Arrastrar para reordenar la sección %s'), nombre), title: __('Arrastrar') }, icono('arrastrar'));
      var oculta = h('input', {
        type: 'checkbox', checked: !!sec.oculta,
        onchange: function (e) { sec.oculta = e.target.checked; li.classList.toggle('is-oculta', sec.oculta); cambio(null); }
      });

      append(li, [
        h('div', { class: 'pcan-ec-cab' }, asa, h('h4', { class: 'pcan-ec-titulo', text: tituloMay(sec.titulo) }),
          h('div', { class: 'pcan-ec-tools' },
            h('button', {
              type: 'button', class: 'pcan-btn pcan-btn-sm', 'data-accion': 'subir', disabled: i === 0,
              'aria-label': sprintf(/* translators: %s: título de la sección de la escaleta */ __('Subir la sección %s'), nombre), onclick: function () { mover(i, i - 1, 'subir'); }
            }, icono('arriba'), _x('Subir', 'mover una sección de la escaleta hacia arriba')),
            h('button', {
              type: 'button', class: 'pcan-btn pcan-btn-sm', 'data-accion': 'bajar', disabled: i === esc.secciones.length - 1,
              'aria-label': sprintf(/* translators: %s: título de la sección de la escaleta */ __('Bajar la sección %s'), nombre), onclick: function () { mover(i, i + 1, 'bajar'); }
            }, icono('abajo'), _x('Bajar', 'mover una sección de la escaleta hacia abajo')))),
        sec.nota ? h('p', { class: 'pcan-ec-nota', text: sec.nota }) : null,
        h('label', { class: 'pcan-ec-oculta' }, oculta, h('span', { text: __('No incluir en este culto') })),
        h('div', { class: 'pcan-ec-campos' }, sec.campos.map(function (c) { return campoDe(sec, c); }))
      ]);
      arrastrarFila(asa, li, lista, function (orden) {
        esc.secciones = orden.map(function (k) { return esc.secciones[k]; });
        pintarTodo();
        marcarCambio();
      });
      return li;
    }

    // ---- modo «Editar secciones»

    function esTexto(c) { return c.tipo === 'texto' || c.tipo === 'textoLargo'; }

    /** La escaleta con la estructura que sale del editor de secciones (sin tocar `esc`): cada campo conserva su valor si sigue
     *  existiendo (misma sección y mismo id) y tiene el mismo tipo; los nuevos empiezan «sin tocar». También se conserva lo
     *  de «No incluir en este culto». */
    function conEstructura(secciones) {
      var antes = {};
      esc.secciones.forEach(function (s) { antes[s.id] = s; });
      return {
        titulo: esc.titulo, central: esc.central,
        secciones: secciones.map(function (n) {
          var vieja = antes[n.id], viejos = {};
          if (vieja) { vieja.campos.forEach(function (c) { viejos[c.id] = c; }); }
          return {
            id: n.id, titulo: n.titulo, nota: n.nota, oculta: vieja ? !!vieja.oculta : false, extra: false,
            campos: n.campos.map(function (c) {
              var v = viejos[c.id], valor = null;
              if (v && v.valor !== null && v.valor !== undefined) {
                if (v.tipo === c.tipo) { valor = v.valor; }
                else if (esTexto(v) && esTexto(c)) { valor = c.tipo === 'texto' ? String(v.valor).replace(/\s*\n\s*/g, ' ') : v.valor; }
              }
              return { id: c.id, tipo: c.tipo, etiqueta: c.etiqueta, pequeno: !!c.pequeno, defecto: c.defecto, valor: valor };
            })
          };
        })
      };
    }

    /** La escaleta tal como está ahora: en modo «editar», con lo que lleve el editor de secciones. */
    function actual() { return modo === 'editar' && editor ? conEstructura(editor.valor()) : esc; }

    function irEditar() {
      var estructura = { secciones: esc.secciones.map(function (s) {
        return { id: s.id, titulo: s.titulo, nota: s.nota, campos: s.campos.map(function (c) {
          return { id: c.id, tipo: c.tipo, etiqueta: c.etiqueta, defecto: c.defecto, pequeno: c.pequeno };
        }) };
      }) };
      editor = P.crearEditorEscaleta(estructura, { alCambiar: marcarCambio });
      modo = 'editar';
      pintarTodo();
    }

    function irRellenar() {
      var fallo = editor.validar();
      if (fallo) { fallo.enfocar(); return; }   // el editor marca la sección sin título y avisa bajo su campo
      esc = conEstructura(editor.valor());
      editor = null;
      modo = 'rellenar';
      pintarTodo();
    }

    // ---- fila de títulos, selector de modo y nota de origen

    function filaTitulos() {
      var fTitulo = h('input', { type: 'text', class: 'pcan-input', maxlength: '60', placeholder: _x('ORDEN DE CULTO', 'título de la escaleta impresa del culto (se imprime en mayúsculas)'), spellcheck: 'false', oninput: function (e) { esc.titulo = e.target.value; } });
      var fCentral = h('input', { type: 'text', class: 'pcan-input', maxlength: '60', placeholder: __('p. ej. LECTURAS EN RVR1960'), spellcheck: 'false', oninput: function (e) { esc.central = e.target.value; } });
      fTitulo.value = esc.titulo || '';
      fCentral.value = esc.central || '';
      return h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: __('Fila de títulos') }),
        ayuda(__('Va bajo la cabecera. A la derecha se pone sola la fecha del culto.')),
        h('div', { class: 'pcan-ec-titulos' },
          P.campo(__('Título'), fTitulo, __('Si lo dejas vacío se usa «ORDEN DE CULTO».')),
          P.campo(__('Texto central (opcional)'), fCentral, __('Por ejemplo, la versión de la Biblia de las lecturas.'))));
    }

    function selectorModo() {
      var editando = modo === 'editar';
      function boton(clave, texto) {
        var activo = modo === clave;
        return h('button', {
          type: 'button', class: 'pcan-seg' + (activo ? ' is-active' : ''), 'aria-pressed': activo ? 'true' : 'false',
          onclick: function () { if (!activo) { if (clave === 'editar') { irEditar(); } else { irRellenar(); } } }
        }, texto);
      }
      return h('div', { class: 'pcan-ec-modo' },
        h('div', { class: 'pcan-segment', role: 'group', 'aria-label': __('Qué quieres hacer con la escaleta') },
          boton('rellenar', __('Rellenar')), boton('editar', __('Editar secciones'))),
        ayuda(editando
          ? __('Cambia las secciones y sus campos solo para este culto. Al volver a «Rellenar» se conserva lo que ya habías escrito en los campos que sigan existiendo.')
          : __('Escribe lo que corresponde a cada sección. Con «Editar secciones» cambias la estructura de la hoja, solo en este culto.')));
    }

    function notaOrigen() {
      if (!deBase) { return null; }
      var t = desde && desde.titulo.trim();
      return h('p', { class: 'pcan-ec-origen', role: 'status', text: t
        ? sprintf(/* translators: %s: título del culto de cuya escaleta parte esta */ __('Parte de la escaleta de «%s». Lo que cambies aquí solo afecta a este culto.'), t)
        : __('Parte de la escaleta estándar. Lo que cambies aquí solo afecta a este culto.') });
    }

    function exportar(boton) {
      boton.disabled = true;
      return plantilla().then(function (pl) { return P.escaletaPdf(opc.culto(), actual(), pl); }).then(function () { boton.disabled = false; });
    }

    // foco: { i, accion } deja el foco en el botón «Subir» o «Bajar» de la sección que acaba de moverse.
    function pintarTodo(foco) {
      cont.innerHTML = '';
      widgets = [];
      if (!esc) { append(cont, h('p', { class: 'pcan-muted', role: 'status', text: __('Cargando la escaleta…') })); return; }
      var bExportar = h('button', { type: 'button', class: 'pcan-btn', onclick: function () { exportar(bExportar); } }, icono('descargar'), __('Exportar escaleta'));
      append(cont, [
        h('div', { class: 'pcan-ec-barra' }, bExportar, h('p', { class: 'pcan-help', text: __('Se rellena con las canciones del culto; cambia lo que quieras. Se guarda junto con el culto.') })),
        generica ? ayuda(__('No se pudo leer la plantilla de tu grupo: se usa la estándar.')) : null,
        notaOrigen(),
        filaTitulos(),
        selectorModo()
      ]);
      if (modo === 'editar') { append(cont, editor.nodo); return; }
      recalcular();
      var lista = h('ol', { class: 'pcan-ec-lista' });
      esc.secciones.forEach(function (sec, i) { append(lista, tarjeta(sec, i, lista)); });
      append(cont, esc.secciones.length ? lista : ayuda(__('Esta escaleta no tiene secciones. Pulsa «Editar secciones» para añadirlas.')));
      if (foco && lista.children[foco.i]) {
        var b = lista.children[foco.i].querySelector('[data-accion="' + foco.accion + '"]');
        if (!b || b.disabled) { b = lista.children[foco.i].querySelector('[data-accion]:not(:disabled)'); }
        if (b) { b.focus(); }
      }
    }

    return {
      el: cont,
      // Al abrir la pestaña por primera vez; si el culto no tenía escaleta, se parte de la base (la última escaleta guardada).
      mostrar: function () {
        if (pintado) { return; }
        pintado = true;
        pintarTodo();
        if (!esc) {
          plantilla().then(function (pl) {
            generica = !!pl.generica;
            desde = pl.desde;
            deBase = true;
            esc = nuevaEscaleta(pl);
            pintarTodo();
          });
        }
      },
      setlistCambio: function () { if (pintado && esc && modo === 'rellenar') { recalcular(); repintarCanciones(null); } },
      validar: function () { return modo === 'editar' && editor ? editor.validar() : null; },
      valor: function () { return esc ? explicitar(actual(), canciones()) : undefined; }
    };
  }

  /** Botón «Exportar escaleta» de la ficha del culto: la plantilla se pide aparte (imágenes, título y texto central). */
  function exportarEscaleta(c, boton) {
    if (boton) { boton.disabled = true; }
    return cargarPlantilla().then(function (pl) { return P.escaletaPdf(c, c.escaleta || null, pl); }).then(function () { if (boton) { boton.disabled = false; } });
  }

  // ---------------------------------------------------------------- escaleta: PDF

  /** Descarga unos bytes como PDF. */
  function guardarPdf(bytes, nombre) {
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    var a = h('a', { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  /** Fecha corta numérica en el orden del idioma del usuario, con guiones: 18-10-26 (es), 10-18-26 (en-US). */
  function fechaNumerica(iso) {
    try {
      return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: '2-digit' }).formatToParts(fechaLocal(iso))
        .filter(function (p) { return p.type === 'day' || p.type === 'month' || p.type === 'year'; })
        .map(function (p) { return p.value; }).join('-');
    } catch (e) {
      return iso;
    }
  }

  /** Imagen (PNG o JPG; otros formatos pasan por un lienzo) lista para el PDF, o null si no hay dirección o no se puede cargar. */
  function imagenParaPdf(doc, url) {
    if (!url) { return Promise.resolve(null); }
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) { throw new Error(r.status); }
      return r.arrayBuffer();
    }).then(function (buf) {
      var b = new Uint8Array(buf);
      if (b[0] === 0x89 && b[1] === 0x50) { return doc.embedPng(buf); }
      if (b[0] === 0xFF && b[1] === 0xD8) { return doc.embedJpg(buf); }
      return createImageBitmap(new Blob([buf])).then(function (img) {
        var lienzo = document.createElement('canvas');
        lienzo.width = img.width;
        lienzo.height = img.height;
        lienzo.getContext('2d').drawImage(img, 0, 0);
        return new Promise(function (resolve) { lienzo.toBlob(resolve, 'image/png'); });
      }).then(function (blob) { return blob.arrayBuffer(); }).then(function (png) { return doc.embedPng(png); });
    }).catch(function () { return null; });
  }

  /** Reduce el tamaño de letra (hasta un mínimo) hasta que el texto quepa en el ancho. */
  function tamanoQueCabe(fuente, texto, size, ancho, minimo) {
    while (size > minimo && fuente.widthOfTextAtSize(texto, size) > ancho) { size -= 0.5; }
    return size;
  }

  /**
   * Parte unos trozos de texto con distinta letra en líneas de como mucho `ancho` puntos, midiendo con las fuentes del PDF.
   * runs: [{t, f}] (f: 'n', 'b' o 'i', que son claves de `fuentes`). Devuelve [{segs: [{t, f, w, esp}], w}]; una línea vacía por runs vacíos.
   */
  function envolverTexto(runs, ancho, size, fuentes) {
    var palabras = [];
    runs.forEach(function (r) {
      latin1(r.t).split(/(\s+)/).forEach(function (p) {
        if (p === '') { return; }
        var esp = /^\s+$/.test(p);
        palabras.push({ t: esp ? ' ' : p, f: r.f, esp: esp });
      });
    });
    function medir(t, f) { return fuentes[f].widthOfTextAtSize(t, size); }
    var lineas = [], seg = [], w = 0;
    function cerrar() {
      while (seg.length && seg[seg.length - 1].esp) { w -= seg.pop().w; }
      lineas.push({ segs: seg, w: w });
      seg = [];
      w = 0;
    }
    palabras.forEach(function (p) {
      p.w = medir(p.t, p.f);
      if (p.esp) { if (seg.length) { seg.push(p); w += p.w; } return; }   // sin espacios al principio de la línea
      if (w + p.w > ancho && seg.length) { cerrar(); }
      if (p.w > ancho) {
        // Una palabra más larga que la línea se parte por letras.
        var resto = p.t;
        while (resto) {
          var n = resto.length;
          while (n > 1 && medir(resto.slice(0, n), p.f) > ancho) { n--; }
          var trozo = resto.slice(0, n);
          seg.push({ t: trozo, f: p.f, w: medir(trozo, p.f) });
          w += seg[seg.length - 1].w;
          resto = resto.slice(n);
          if (resto) { cerrar(); }
        }
        return;
      }
      seg.push(p);
      w += p.w;
    });
    if (seg.length || !lineas.length) { cerrar(); }
    return lineas;
  }

  /** Letra espaciada (para el nombre del cancionero cuando no hay imagen de cabecera). */
  function anchoEspaciado(fuente, texto, size, sep) {
    return texto.split('').reduce(function (s, ch) { return s + fuente.widthOfTextAtSize(ch, size); }, 0) + sep * Math.max(0, texto.length - 1);
  }

  function dibujarEspaciado(pagina, fuente, texto, centroX, y, size, sep, color) {
    var x = centroX - anchoEspaciado(fuente, texto, size, sep) / 2;
    texto.split('').forEach(function (ch) {
      pagina.drawText(ch, { x: x, y: y, size: size, font: fuente, color: color });
      x += fuente.widthOfTextAtSize(ch, size) + sep;
    });
  }

  /** Dibuja la escaleta en un documento nuevo (A4 vertical): cabecera con dos imágenes y la tabla de secciones. */
  function dibujarEscaletaPdf(L, doc, fuentes, imagenes, culto, plantilla, filas) {
    var A4 = [595.28, 841.89];
    var M = 30;                  // margen lateral
    var W = A4[0] - 2 * M;
    var TOP = 28, TOP_SIG = 36, BOT = 36;
    var ALTO_CAB = 66, ALTO_TIT = 26;
    var PX = 8, PY = 7;          // relleno de las celdas
    var INTERLINEA = 1.3;
    var GROSOR = 0.75, MARCO = 1.8;
    var colIzq = W * 0.28, colDer = W - colIzq;
    var negro = L.rgb(0, 0, 0), gris = L.rgb(0.83, 0.83, 0.83), rojo = L.rgb(0.8, 0, 0), tinta = L.rgb(0.3, 0.3, 0.3);
    var normal = fuentes.n, negrita = fuentes.b;
    var fecha = culto.fecha ? fechaNumerica(culto.fecha) : '';
    var pag, y, inicio;

    function encajar(img, maxW, maxH) {
      var e = Math.min(maxW / img.width, maxH / img.height);
      return { w: img.width * e, h: img.height * e };
    }

    // Arriba a la izquierda, la imagen de cabecera o el nombre del cancionero; a la derecha, el logo.
    function cabecera() {
      var arriba = A4[1] - TOP;
      if (imagenes.cabecera) {
        var d = encajar(imagenes.cabecera, 180, 55);
        pag.drawImage(imagenes.cabecera, { x: M, y: arriba - d.h, width: d.w, height: d.h });
      } else {
        var cx = M + 90;
        var nombre = latin1(tituloMay(P.cfg.nombre || 'Cancionero')).trim();
        var sitio = latin1(tituloMay(P.cfg.sitio || '')).trim();
        pag.drawRectangle({ x: M, y: arriba - 55, width: 180, height: 55, borderColor: tinta, borderWidth: GROSOR });
        var s1 = 15;
        while (s1 > 8 && anchoEspaciado(normal, nombre, s1, 2) > 160) { s1 -= 0.5; }
        dibujarEspaciado(pag, normal, nombre, cx, arriba - (sitio ? 27 : 33), s1, 2, tinta);
        if (sitio) {
          var s2 = 7.5;
          while (s2 > 5 && anchoEspaciado(normal, sitio, s2, 1.4) > 160) { s2 -= 0.5; }
          dibujarEspaciado(pag, normal, sitio, cx, arriba - 42, s2, 1.4, tinta);
        }
      }
      if (imagenes.logo) {
        var e = encajar(imagenes.logo, 105, 65);
        pag.drawImage(imagenes.logo, { x: M + W - e.w, y: arriba - e.h, width: e.w, height: e.h });
      }
    }

    // Fila de títulos: título, texto central y fecha del culto, sobre gris claro.
    function titulos() {
      var a1 = W * 0.36, a2 = W * 0.34;
      [{ x: M, w: a1, t: plantilla.titulo, s: 14 }, { x: M + a1, w: a2, t: plantilla.central, s: 11 }, { x: M + a1 + a2, w: W - a1 - a2, t: fecha, s: 14 }].forEach(function (c) {
        pag.drawRectangle({ x: c.x, y: y - ALTO_TIT, width: c.w, height: ALTO_TIT, color: gris, borderColor: negro, borderWidth: GROSOR });
        var t = latin1(c.t || '').trim();
        if (!t) { return; }
        var s = tamanoQueCabe(negrita, t, c.s, c.w - 2 * PX, 6);
        pag.drawText(t, { x: c.x + (c.w - negrita.widthOfTextAtSize(t, s)) / 2, y: y - ALTO_TIT / 2 - s * 0.35, size: s, font: negrita, color: negro });
      });
      y -= ALTO_TIT;
    }

    // Abajo a la derecha de cada hoja, discreto: «Powered by» y el logo del Cancionero, pequeños y atenuados.
    function firma() {
      if (!imagenes.firma) { return; }
      var f = encajar(imagenes.firma, 62, 12);
      var x = M + W - f.w, base = 12;
      pag.drawImage(imagenes.firma, { x: x, y: base, width: f.w, height: f.h, opacity: 0.55 });
      var texto = 'Powered by', s = 5.5;
      pag.drawText(texto, { x: M + W - normal.widthOfTextAtSize(texto, s), y: base + f.h + 2, size: s, font: normal, color: L.rgb(0.6, 0.6, 0.6) });
    }

    function nuevaPagina(primera) {
      pag = doc.addPage(A4);
      firma();
      y = A4[1] - (primera ? TOP : TOP_SIG);
      if (primera) { cabecera(); y -= ALTO_CAB + 14; }
      inicio = y;
      titulos();
    }

    // Marco exterior, algo más grueso que las líneas de las celdas.
    function cerrarPagina() {
      pag.drawRectangle({ x: M, y: y, width: W, height: inicio - y, borderColor: negro, borderWidth: MARCO });
    }

    function lineasDe(runs, ancho, size, color) {
      return envolverTexto(runs, ancho, size, fuentes).map(function (l) { return { segs: l.segs, w: l.w, size: size, h: size * INTERLINEA, color: color }; });
    }

    function alto(lineas) { return lineas.reduce(function (s, l) { return s + l.h; }, 0); }

    // Todo arriba y centrado en su celda, como en la hoja de referencia.
    function pintarLineas(lineas, x0, ancho) {
      var yy = y - PY;
      lineas.forEach(function (l) {
        var xx = x0 + (ancho - l.w) / 2;
        l.segs.forEach(function (s) {
          if (!s.esp) { pag.drawText(s.t, { x: xx, y: yy - (l.h - l.size * 0.925) / 2 - l.size * 0.718, size: l.size, font: fuentes[s.f], color: l.color || negro }); }
          xx += s.w;
        });
        yy -= l.h;
      });
    }

    function dibujarTrozo(izq, der, altoTrozo) {
      pag.drawRectangle({ x: M, y: y - altoTrozo, width: colIzq, height: altoTrozo, borderColor: negro, borderWidth: GROSOR });
      pag.drawRectangle({ x: M + colIzq, y: y - altoTrozo, width: colDer, height: altoTrozo, borderColor: negro, borderWidth: GROSOR });
      pintarLineas(izq, M, colIzq);
      pintarLineas(der, M + colIzq, colDer);
      y -= altoTrozo;
    }

    var ALTO_MIN = 30;
    var paginaLlena = A4[1] - TOP_SIG - ALTO_TIT - BOT;

    nuevaPagina(true);
    filas.forEach(function (fila) {
      var izq = lineasDe([{ t: fila.titulo, f: 'b' }], colIzq - 2 * PX, 11);
      String(fila.nota || '').split(/\r?\n/).forEach(function (n) { if (n.trim()) { izq = izq.concat(lineasDe([{ t: n, f: 'n' }], colIzq - 2 * PX, 9, rojo)); } });
      var der = [];
      fila.lineas.forEach(function (l) { der = der.concat(lineasDe(l.runs, colDer - 2 * PX, l.size)); });
      var total = Math.max(alto(izq), alto(der)) + 2 * PY;
      total = Math.max(total, ALTO_MIN);

      if (total <= y - BOT) { dibujarTrozo(izq, der, total); return; }
      if (total <= paginaLlena) { cerrarPagina(); nuevaPagina(false); dibujarTrozo(izq, der, total); return; }

      // Una sección más alta que una hoja entera: se parte por líneas, con el título solo en la primera hoja.
      var resto = der.slice(), primera = true;
      while (resto.length || primera) {
        var izqAqui = primera ? izq : [];
        if (y - BOT < alto(izqAqui) + 2 * PY + (resto.length ? resto[0].h : 0)) { cerrarPagina(); nuevaPagina(false); }
        var libre = y - BOT - 2 * PY, aqui = [], usado = 0;
        while (resto.length && (usado + resto[0].h <= libre || !aqui.length)) { usado += resto[0].h; aqui.push(resto.shift()); }
        dibujarTrozo(izqAqui, aqui, Math.max(Math.max(alto(izqAqui), usado) + 2 * PY, ALTO_MIN));
        primera = false;
        if (resto.length) { cerrarPagina(); nuevaPagina(false); }
      }
    });
    cerrarPagina();
  }

  /**
   * Genera y descarga `escaleta-AAAA-MM-DD.pdf`. culto: el de GET cultos/{id} (o algo con fecha e items); escaleta: la del culto,
   * o null para sacarla de la base con sus defectos; plantilla: la base de GET escaleta (logo y cabecera de la instalación y, si la
   * escaleta no trae los suyos, el título y el texto central).
   * Avisa del progreso y de los errores por sí misma; la promesa nunca rechaza y devuelve true si se descargó.
   */
  P.escaletaPdf = function (culto, escaleta, plantilla) {
    aviso(__('Preparando la escaleta…'));
    plantilla = plantilla || plantillaGenerica();
    var esc = escaleta ? sanearEscaleta(escaleta) : nuevaEscaleta(plantilla);
    // La fila de títulos es la de la escaleta del culto; si no la trae (guardada antes), la de la base. Logo y cabecera, los de la instalación.
    plantilla = Object.assign({}, plantilla, {
      titulo: (esc.titulo || '').trim() || plantilla.titulo || '',
      central: esc.central !== null ? esc.central : (plantilla.central || '')
    });
    var sinImagenes = false;
    return cargarPdfLib().then(function (L) {
      var filas = filasImpresion(esc, cancionesDeCulto(culto));
      return L.PDFDocument.create().then(function (doc) {
        return Promise.all([
          doc.embedFont(L.StandardFonts.Helvetica), doc.embedFont(L.StandardFonts.HelveticaBold), doc.embedFont(L.StandardFonts.HelveticaOblique),
          imagenParaPdf(doc, plantilla.cabecera && plantilla.cabecera.url),
          imagenParaPdf(doc, plantilla.logo && plantilla.logo.url)
        ]).then(function (r) {
          sinImagenes = !!((plantilla.cabecera && plantilla.cabecera.url && !r[3]) || (plantilla.logo && plantilla.logo.url && !r[4]));
          // Sin logo de la iglesia (o si no se pudo cargar), va el icono del Cancionero.
          return Promise.all([
            r[4] ? Promise.resolve(r[4]) : imagenParaPdf(doc, BASE_ASSETS ? BASE_ASSETS + 'icono.png' : ''),
            imagenParaPdf(doc, BASE_ASSETS ? BASE_ASSETS + 'logo-cancionero.png' : '')
          ]).then(function (im) {
            dibujarEscaletaPdf(L, doc, { n: r[0], b: r[1], i: r[2] }, { cabecera: r[3], logo: im[0], firma: im[1] }, culto, plantilla, filas);
            return doc.save();
          });
        });
      });
    }).then(function (bytes) {
      guardarPdf(bytes, 'escaleta-' + (culto.fecha || hoyISO()) + '.pdf');
      if (sinImagenes) { aviso(__('Escaleta descargada, pero no se pudieron cargar las imágenes de la cabecera.'), 'error', 5000); }
      else { aviso(__('Escaleta descargada')); }
      return true;
    }).catch(function (e) {
      aviso(e && e.message ? e.message : __('No se pudo generar la escaleta'), 'error');
      return false;
    });
  };

  // ---------------------------------------------------------------- ficha de canción: historial y «añadir a un culto»

  P.enFichaCancion(function (cancion, caja) {
    cargar().then(function () {
      var hist = historial(cancion.id);
      var hoy = hoyISO();
      var tocadas = hist.filter(function (c) { return c.fecha <= hoy; });
      var programada = hist.filter(function (c) { return c.fecha > hoy; }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); })[0];
      var proximos = cultos.filter(function (c) { return c.fecha >= hoy && !c.items.some(function (it) { return +it.cancion === cancion.id; }); })
        .sort(function (a, b) { return a.fecha.localeCompare(b.fecha); });

      var select = h('select', { class: 'pcan-select pcan-select-sm', 'aria-label': __('Elegir culto') },
        proximos.map(function (c) { return h('option', { value: String(c.id), text: fechaCorta(c.fecha) + ' · ' + c.titulo }); }),
        h('option', { value: 'nuevo', text: __('+ Nuevo culto…') }));

      var boton = h('button', {
        type: 'button', class: 'pcan-btn pcan-btn-sm', onclick: function () {
          if (select.value === 'nuevo') { location.hash = '#/culto/nuevo/' + cancion.id; return; }
          var c = cultos.filter(function (x) { return x.id === +select.value; })[0];
          if (!c) { return; }
          boton.disabled = true;
          var items = c.items.map(function (it) { return { cancion: +it.cancion, tonalidad: it.tonalidad, nota: it.nota, partitura: it.partitura || 0 }; });
          items.push({ cancion: cancion.id, tonalidad: '', nota: '', partitura: 0 });
          api('cultos/' + c.id, { json: { titulo: c.titulo, fecha: c.fecha, tipo: c.tipo, notas: c.notas, items: items } })
            .then(function () { return cargar(true); })
            .then(function () { aviso(sprintf(/* translators: %s: título del culto */ __('Añadida a «%s»'), c.titulo)); refrescar(); select.querySelector('option[value="' + c.id + '"]').remove(); boton.disabled = false; })
            .catch(function (e) { aviso(e.message, 'error'); boton.disabled = false; });
        }
      }, icono('mas'), __('Añadir'));

      append(caja, h('div', { class: 'pcan-uso' },
        h('div', { class: 'pcan-uso-stats' },
          h('span', { class: 'pcan-uso-cifra', text: String(tocadas.length) }),
          h('span', null,
            h('strong', { text: _n('vez tocada', 'veces tocada', tocadas.length) }),
            h('small', null, tocadas.length
              ? conNodo(/* translators: %s: fecha corta del último culto en que se tocó (enlace al culto) */ __('Última: %s'), h('a', { href: '#/culto/' + tocadas[0].id, text: fechaCorta(tocadas[0].fecha) })).concat([' (' + haceTanto(tocadas[0].fecha) + ')'])
              : __('Aún no ha sonado en un culto')),
            programada ? h('small', null, conNodo(/* translators: %s: fecha corta del culto en que está programada (enlace al culto) */ __('Programada: %s'), h('a', { href: '#/culto/' + programada.id, text: fechaCorta(programada.fecha) }))) : null)),
        h('div', { class: 'pcan-uso-add' }, h('label', { class: 'pcan-help', text: __('Añadir a un culto') }), h('div', { class: 'pcan-uso-fila' }, select, boton))));
    });
  });

  // ---------------------------------------------------------------- estadísticas

  var PERIODOS = [
    { dias: 90, texto: __('3 meses') },
    { dias: 182, texto: __('6 meses') },
    { dias: 365, texto: __('12 meses') },
    { dias: 0, texto: _x('Todo', 'periodo de las estadísticas: todo el tiempo') }
  ];
  var DIAS_OLVIDO = 90;
  var periodoStats = 365;
  var contStats = P.ui.vistaEstadisticas;

  function restarDias(iso, dias) {
    var d = fechaLocal(iso);
    d.setDate(d.getDate() - dias);
    return isoDe(d);
  }

  // Nombre del grupo para las canciones sin etiqueta (aparece en la tarjeta «Por etiqueta»).
  var SIN_ETIQUETA = __('Sin etiqueta');

  function calcularStats() {
    var hoy = hoyISO();
    var desde = periodoStats ? restarDias(hoy, periodoStats) : '0000-00-00';
    var pasados = cultos.filter(function (c) { return c.fecha <= hoy; });
    var enPeriodo = pasados.filter(function (c) { return c.fecha >= desde; });

    var uso = {};      // en el periodo: id -> { n, ultima }
    var ultimaVez = {}; // de siempre: id -> fecha
    var veces = 0;
    pasados.forEach(function (c) {
      c.items.forEach(function (it) {
        var id = +it.cancion;
        if (!ultimaVez[id] || c.fecha > ultimaVez[id]) { ultimaVez[id] = c.fecha; }
        if (c.fecha < desde) { return; }
        veces++;
        var u = uso[id] || (uso[id] = { n: 0, ultima: '' });
        u.n++;
        if (c.fecha > u.ultima) { u.ultima = c.fecha; }
      });
    });

    var repertorio = P.state.canciones;
    var top = Object.keys(uso).map(function (id) { return { c: P.cancion(+id), n: uso[id].n, ultima: uso[id].ultima }; })
      .filter(function (x) { return x.c; })
      .sort(function (a, b) { return b.n - a.n || b.ultima.localeCompare(a.ultima) || a.c.titulo.localeCompare(b.c.titulo, LOCALE); });

    // Cuántas canciones suman la mitad de todo lo que se toca: mide si rotamos o repetimos siempre las mismas.
    var mitad = 0, acumulado = 0;
    for (var i = 0; i < top.length && acumulado < veces / 2; i++) { acumulado += top[i].n; mitad = i + 1; }

    var limiteOlvido = restarDias(hoy, DIAS_OLVIDO);
    var olvidadas = repertorio.filter(function (c) { return ultimaVez[c.id] && ultimaVez[c.id] < limiteOlvido; })
      .map(function (c) { return { c: c, ultima: ultimaVez[c.id] }; })
      .sort(function (a, b) { return a.ultima.localeCompare(b.ultima); });
    var nunca = repertorio.filter(function (c) { return !ultimaVez[c.id]; })
      .sort(function (a, b) { return b.creada.localeCompare(a.creada); });

    // Canciones tocadas por mes dentro del periodo.
    var meses = [];
    if (enPeriodo.length) {
      var primero = periodoStats ? desde : enPeriodo.reduce(function (m, c) { return c.fecha < m ? c.fecha : m; }, hoy);
      var cursor = fechaLocal(primero.slice(0, 7) + '-01');
      var fin = fechaLocal(hoy.slice(0, 7) + '-01');
      while (cursor <= fin) {
        meses.push({ clave: isoDe(cursor).slice(0, 7), fecha: new Date(cursor), canciones: 0, cultos: 0 });
        cursor.setMonth(cursor.getMonth() + 1);
      }
      var porClave = {};
      meses.forEach(function (m) { porClave[m.clave] = m; });
      enPeriodo.forEach(function (c) {
        var m = porClave[c.fecha.slice(0, 7)];
        if (m) { m.cultos++; m.canciones += c.items.length; }
      });
    }

    var etiquetas = {};
    enPeriodo.forEach(function (c) {
      c.items.forEach(function (it) {
        var s = P.cancion(+it.cancion);
        if (!s) { return; }
        (s.etiquetas.length ? s.etiquetas : [SIN_ETIQUETA]).forEach(function (e) { etiquetas[e] = (etiquetas[e] || 0) + 1; });
      });
    });
    var porEtiqueta = Object.keys(etiquetas).map(function (e) { return { nombre: e, n: etiquetas[e] }; })
      .sort(function (a, b) { return b.n - a.n; });

    var nuevas = repertorio.filter(function (c) { return c.creada.slice(0, 10) >= desde; });

    return {
      cultos: enPeriodo.length, veces: veces, distintas: top.length, repertorio: repertorio.length,
      media: enPeriodo.length ? veces / enPeriodo.length : 0, mitad: mitad,
      top: top, olvidadas: olvidadas, nunca: nunca, meses: meses, porEtiqueta: porEtiqueta,
      nuevas: nuevas.length, nuevasTocadas: nuevas.filter(function (c) { return uso[c.id]; }).length
    };
  }

  function kpi(etiqueta, valor, detalle) {
    return h('div', { class: 'pcan-kpi' },
      h('span', { class: 'pcan-kpi-label', text: etiqueta }),
      h('strong', { class: 'pcan-kpi-valor', text: valor }),
      detalle ? h('span', { class: 'pcan-kpi-detalle', text: detalle }) : null);
  }

  function tarjetaStat(titulo, subtitulo, contenido, clase) {
    return h('section', { class: 'pcan-stat-card' + (clase ? ' ' + clase : '') },
      h('header', { class: 'pcan-stat-head' }, h('h3', { text: titulo }), subtitulo ? h('p', { text: subtitulo }) : null),
      contenido);
  }

  /** Lista de barras horizontales (una sola serie: el color de acento del tema). */
  function barras(filas, max) {
    return h('ol', { class: 'pcan-barras' }, filas.map(function (f, i) {
      var pct = max ? Math.max(3, Math.round(f.valor / max * 100)) : 0;
      var contenido = [
        h('span', { class: 'pcan-barra-pos', text: String(i + 1) }),
        h('span', { class: 'pcan-barra-main' },
          h('span', { class: 'pcan-barra-texto' },
            h('span', { class: 'pcan-barra-titulo', text: f.titulo }),
            f.detalle ? h('span', { class: 'pcan-barra-detalle', text: f.detalle }) : null),
          h('span', { class: 'pcan-barra-pista', 'aria-hidden': 'true' }, h('span', { class: 'pcan-barra-relleno', style: 'width:' + pct + '%' }))),
        h('span', { class: 'pcan-barra-valor', text: String(f.valor) })
      ];
      return h('li', null, f.href
        ? h('a', { class: 'pcan-barra', href: f.href, title: f.tooltip || null }, contenido)
        : h('div', { class: 'pcan-barra', title: f.tooltip || null }, contenido));
    }));
  }

  /** Columnas por mes, con su tabla equivalente. */
  function columnas(meses) {
    var max = meses.reduce(function (m, x) { return Math.max(m, x.canciones); }, 0);
    var etiquetaMes = function (m, larga) {
      return sinPunto(m.fecha.toLocaleDateString(LOCALE, larga ? { month: 'long', year: 'numeric' } : { month: 'short' }));
    };
    var grafica = h('div', { class: 'pcan-columnas', role: 'img', 'aria-label': __('Canciones tocadas por mes') }, meses.map(function (m) {
      var pct = max ? Math.round(m.canciones / max * 100) : 0;
      var texto = sprintf(/* translators: 1: mes y año («octubre de 2026»), 2: número de canciones («12 canciones»), 3: número de cultos («3 cultos») */ __('%1$s: %2$s en %3$s'), etiquetaMes(m, true), nCanciones(m.canciones), nCultos(m.cultos));
      return h('div', { class: 'pcan-columna', title: texto, tabindex: '0', 'aria-label': texto },
        h('span', { class: 'pcan-columna-valor', text: m.canciones ? String(m.canciones) : '' }),
        h('span', { class: 'pcan-columna-pista' }, h('span', { class: 'pcan-columna-barra' + (m.canciones ? '' : ' is-cero'), style: 'height:' + pct + '%' })),
        h('span', { class: 'pcan-columna-mes', text: etiquetaMes(m) }));
    }));
    var tabla = h('details', { class: 'pcan-tabla-ver' },
      h('summary', { text: __('Ver como tabla') }),
      h('table', { class: 'pcan-tabla' },
        h('thead', null, h('tr', null, h('th', { text: __('Mes') }), h('th', { text: __('Cultos') }), h('th', { text: __('Canciones') }))),
        h('tbody', null, meses.map(function (m) {
          return h('tr', null, h('td', { text: etiquetaMes(m, true) }), h('td', { text: String(m.cultos) }), h('td', { text: String(m.canciones) }));
        }))));
    return h('div', null, grafica, tabla);
  }

  function pintarStats() {
    contStats.innerHTML = '';
    var s = calcularStats();

    var selector = h('div', { class: 'pcan-segment pcan-periodo', role: 'radiogroup', 'aria-label': __('Periodo') }, PERIODOS.map(function (p) {
      var activo = p.dias === periodoStats;
      return h('button', {
        type: 'button', role: 'radio', 'aria-checked': activo ? 'true' : 'false', class: 'pcan-seg' + (activo ? ' is-active' : ''),
        onclick: function () { periodoStats = p.dias; pintarStats(); }
      }, p.texto);
    }));

    append(contStats, h('div', { class: 'pcan-section-head' }, h('h2', { text: __('Estadísticas') }), selector));

    if (!s.cultos) {
      append(contStats, h('div', { class: 'pcan-empty' },
        h('p', { text: __('Aún no hay cultos celebrados en este periodo. Las estadísticas salen solas de los setlists: en cuanto pase el primer culto con canciones, aparecerán aquí.') }),
        h('a', { class: 'pcan-btn', href: '#/cultos' }, icono('calendario'), __('Ir a cultos'))));
    }

    append(contStats, h('div', { class: 'pcan-kpis' },
      kpi(__('Cultos celebrados'), String(s.cultos), s.cultos ? sprintf(/* translators: %s: media de canciones por culto, con un decimal («3,5») */ __('%s canciones de media'), s.media.toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })) : null),
      kpi(__('Canciones distintas'), String(s.distintas), sprintf(/* translators: %d: total de canciones del cancionero */ __('de %d en el cancionero'), s.repertorio)),
      kpi(__('La mitad de lo que tocamos'), s.mitad ? nCanciones(s.mitad) : '—', s.mitad ? __('Cuantas menos, más repetimos') : null),
      kpi(__('Canciones nuevas'), String(s.nuevas), s.nuevas ? sprintf(_n('%d ya se ha tocado', '%d ya se han tocado', s.nuevasTocadas), s.nuevasTocadas) : __('Añadidas en el periodo'))));

    var maxTop = s.top.length ? s.top[0].n : 0;
    var grid = h('div', { class: 'pcan-stats-grid' },
      tarjetaStat(__('Las más tocadas'), s.top.length ? __('Veces que ha sonado cada canción') : null,
        s.top.length ? barras(s.top.slice(0, 10).map(function (x) {
          return {
            titulo: (x.c.numero ? x.c.numero + ' · ' : '') + x.c.titulo, valor: x.n, href: '#/cancion/' + x.c.id,
            detalle: sprintf(/* translators: %s: fecha corta de la última vez que se tocó */ __('Última: %s'), fechaCorta(x.ultima)),
            tooltip: sprintf(/* translators: 1: título de la canción, 2: veces que se ha tocado («3 veces»), 3: fecha completa de la última vez */ __('%1$s · %2$s · última %3$s'), x.c.titulo, sprintf(_n('%d vez', '%d veces', x.n), x.n), fechaLarga(x.ultima))
          };
        }), maxTop) : h('p', { class: 'pcan-muted', text: __('Sin datos en este periodo.') }), 'is-top'),
      tarjetaStat(__('Actividad por mes'), __('Canciones tocadas cada mes'),
        s.meses.length ? columnas(s.meses) : h('p', { class: 'pcan-muted', text: __('Sin datos en este periodo.') })),
      tarjetaStat(__('Hace tiempo que no suenan'), __('Tocadas alguna vez, pero no en los últimos 3 meses'),
        s.olvidadas.length ? h('ul', { class: 'pcan-stat-lista' }, s.olvidadas.slice(0, 8).map(function (x) {
          return h('li', null, h('a', { href: '#/cancion/' + x.c.id },
            h('span', { text: (x.c.numero ? x.c.numero + ' · ' : '') + x.c.titulo }),
            h('span', { class: 'pcan-stat-dato', text: haceTanto(x.ultima) })));
        })) : h('p', { class: 'pcan-muted', text: __('Ninguna: todo lo que tocamos ha sonado hace poco.') })),
      tarjetaStat(__('Nunca tocadas'), sprintf(/* translators: 1: canciones que nunca se han tocado, 2: total de canciones del cancionero */ _n('%1$d de %2$d canciones aún no ha sonado en un culto', '%1$d de %2$d canciones aún no han sonado en un culto', s.nunca.length), s.nunca.length, s.repertorio),
        s.nunca.length ? h('ul', { class: 'pcan-stat-lista' }, s.nunca.slice(0, 8).map(function (c) {
          return h('li', null, h('a', { href: '#/cancion/' + c.id },
            h('span', { text: (c.numero ? c.numero + ' · ' : '') + c.titulo }),
            h('span', { class: 'pcan-stat-dato', text: sprintf(/* translators: %s: cuándo se añadió («hace 2 semanas») */ __('Añadida %s'), haceTanto(c.creada.slice(0, 10))) })));
        }).concat(s.nunca.length > 8 ? [h('li', { class: 'pcan-muted', text: sprintf(/* translators: %d: canciones que no caben en la lista */ __('y %d más'), s.nunca.length - 8) })] : [])) : h('p', { class: 'pcan-muted', text: __('Todas se han tocado al menos una vez.') })),
      s.porEtiqueta.some(function (e) { return e.nombre !== SIN_ETIQUETA; }) ? tarjetaStat(__('Por etiqueta'), __('Veces que han sonado canciones de cada etiqueta'),
        barras(s.porEtiqueta.slice(0, 8).map(function (e) {
          return { titulo: e.nombre, valor: e.n, tooltip: sprintf(/* translators: 1: nombre de la etiqueta, 2: veces que han sonado («3 veces») */ __('%1$s · %2$s'), e.nombre, sprintf(_n('%d vez', '%d veces', e.n), e.n)) };
        }), s.porEtiqueta[0].n)) : null);

    append(contStats, grid);
  }

  function mostrarStats() {
    if (!cargados) { contStats.innerHTML = ''; append(contStats, h('div', { class: 'pcan-empty', text: __('Calculando estadísticas…') })); }
    cargar().then(pintarStats).catch(function (e) {
      contStats.innerHTML = '';
      append(contStats, h('div', { class: 'pcan-empty is-error', text: sprintf(/* translators: %s: motivo del error */ __('No se pudieron calcular las estadísticas: %s'), e.message) }));
    });
  }

  P.vista('estadisticas', function () { mostrarStats(); });
  P.ruta(/^estadisticas$/, function () { P.mostrarVista('estadisticas'); P.ocultarPanel(); });

  // ---------------------------------------------------------------- rutas

  P.vista('cultos', function () { mostrarListado(); });
  P.enDetalleVacio('cultos', pintarPortada);
  refrescarPortada();
  cargar().then(pintarLateral).catch(function () {});

  P.ruta(/^cultos$/, function () { P.mostrarVista('cultos'); P.cerrarPanel(); });
  P.ruta(/^culto\/nuevo(?:\/(\d+))?$/, function (m) { abrirEditor(null, { cancion: m[1] ? +m[1] : 0 }); });
  P.ruta(/^culto\/editar\/(\d+)$/, function (m) { abrirEditor(m[1]); });
  P.ruta(/^culto\/duplicar\/(\d+)$/, function (m) { abrirEditor(m[1], { duplicar: true }); });
  P.ruta(/^culto\/(\d+)\/tocar(?:\/(\d+))?$/, function (m) { P.mostrarVista('cultos'); abrirModo(m[1], m[2]); });
  P.ruta(/^culto\/(\d+)$/, function (m) {
    if (lector && !lector.cargando) { lector.desdeRuta = true; lector.cerrar(); return; }
    lector = null; // si aún se estaba cargando, ya no se abre
    P.mostrarVista('cultos');
    verCulto(m[1]);
  });
})();
