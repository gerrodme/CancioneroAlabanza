/* Cancionero · cultos y setlists */
(function () {
  'use strict';

  var P = window.PCAN;
  if (!P) { return; }
  var h = P.h, append = P.append, icono = P.icono, api = P.api, aviso = P.aviso;

  var TIPOS = ['Culto dominical', 'Culto de oración', 'Santa Cena', 'Culto especial', 'Ensayo', 'Boda', 'Funeral'];
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
    return fechaLocal(iso).toLocaleDateString('es-ES', opts);
  }

  function fechaLarga(iso) {
    var s = fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function fechaCorta(iso) {
    return fmt(iso, { day: 'numeric', month: 'short' }).replace('.', '');
  }

  function haceTanto(iso) {
    var d = diasEntre(iso, hoyISO());
    if (d === 0) { return 'hoy'; }
    if (d === 1) { return 'ayer'; }
    if (d === -1) { return 'mañana'; }
    if (d < 0) { return 'dentro de ' + (-d) + ' días'; }
    if (d < 14) { return 'hace ' + d + ' días'; }
    if (d < 60) { return 'hace ' + Math.round(d / 7) + ' semanas'; }
    return 'hace ' + Math.round(d / 30) + ' meses';
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
    var cuando = d === 0 ? 'el mismo día' : d > 0 ? d + ' días antes' : (-d) + ' días después';
    return 'También en «' + c.titulo + '» (' + fechaCorta(c.fecha) + ', ' + cuando + ')';
  }

  // ---------------------------------------------------------------- vista: listado

  function pintarListado() {
    contenedor.innerHTML = '';
    var hoy = hoyISO();
    var proximos = cultos.filter(function (c) { return c.fecha >= hoy; }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); });
    var pasados = cultos.filter(function (c) { return c.fecha < hoy; });

    append(contenedor, h('div', { class: 'pcan-list-head' },
      h('div', null, h('h2', { text: 'Cultos' }), h('p', { class: 'pcan-muted', text: proximos.length + (proximos.length === 1 ? ' programado' : ' programados') + ' · ' + pasados.length + ' anteriores' })),
      h('a', { class: 'pcan-btn pcan-btn-sm', href: '#/culto/nuevo' }, icono('mas'), 'Nuevo')));

    if (!cultos.length) {
      append(contenedor, h('div', { class: 'pcan-empty' },
        h('p', { text: 'Todavía no hay cultos. Prepara el setlist del próximo domingo.' }),
        h('a', { class: 'pcan-btn pcan-btn-primary', href: '#/culto/nuevo' }, icono('mas'), 'Crear el primer culto')));
      return;
    }

    append(contenedor, [
      h('p', { class: 'pcan-list-label', text: 'Próximos' }),
      proximos.length
        ? h('div', { class: 'pcan-cultos' }, proximos.map(tarjeta))
        : h('p', { class: 'pcan-muted pcan-section-empty', text: 'No hay cultos programados.' }),
      pasados.length ? h('p', { class: 'pcan-list-label', text: 'Anteriores' }) : null,
      pasados.length ? h('div', { class: 'pcan-cultos is-past' }, pasados.map(tarjeta)) : null
    ]);
    P.marcarSeleccion('cultos');
    refrescarPortada();
  }

  function bloqueFecha(iso) {
    var d = fechaLocal(iso);
    return h('span', { class: 'pcan-culto-date', 'aria-hidden': 'true' },
      h('span', { class: 'pcan-culto-dow', text: d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '') }),
      h('span', { class: 'pcan-culto-day', text: String(d.getDate()) }),
      h('span', { class: 'pcan-culto-mon', text: d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '') }));
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
          faltan >= 0 && faltan <= 30 ? h('span', { class: 'pcan-cuenta' + (faltan <= 1 ? ' is-ya' : ''), text: faltan === 0 ? 'hoy' : faltan === 1 ? 'mañana' : 'en ' + faltan + ' días' }) : null),
        h('span', { class: 'pcan-culto-songs' + (titulos.length ? '' : ' is-empty'), text: titulos.length ? titulos.join(' · ') : 'Sin canciones todavía' })),
      h('span', { class: 'pcan-culto-count', title: c.items.length + ' canciones' }, String(c.items.length)));
  }

  function mostrarListado() {
    if (!cultos.length && !cargados) { contenedor.innerHTML = ''; append(contenedor, h('div', { class: 'pcan-empty', text: 'Cargando cultos…' })); }
    // Siempre se recarga al entrar: otra persona puede haber creado o cambiado cultos.
    cargar(true).then(function () { pintarListado(); pintarLateral(); }).catch(function (e) {
      contenedor.innerHTML = '';
      append(contenedor, h('div', { class: 'pcan-empty is-error', text: 'No se pudieron cargar los cultos: ' + e.message }));
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
      append(cont, h('a', { class: 'pcan-side-culto is-vacio', href: '#/culto/nuevo' }, icono('mas'), h('span', { text: 'Preparar un culto' })));
      return;
    }
    proximos.forEach(function (c) {
      var d = fechaLocal(c.fecha);
      append(cont, h('a', { class: 'pcan-side-culto', href: '#/culto/' + c.id },
        h('span', { class: 'pcan-side-culto-fecha' }, h('b', { text: String(d.getDate()) }), d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')),
        h('span', { class: 'pcan-side-culto-texto' }, h('strong', { text: c.titulo }), h('small', { text: c.items.length + (c.items.length === 1 ? ' canción' : ' canciones') + ' · ' + haceTanto(c.fecha) }))));
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
        h('span', { class: 'pcan-hero-texto' }, h('strong', { text: 'Prepara el próximo culto' }), h('span', { text: 'Crea el setlist y ten las partituras listas para tocar en la tableta.' })),
        h('span', { class: 'pcan-btn pcan-btn-primary' }, icono('mas'), 'Nuevo culto'));
    }
    var canciones = proximo.items.map(function (it) { return { s: P.cancion(+it.cancion), tono: it.tonalidad }; }).filter(function (x) { return x.s; });
    return h('section', { class: 'pcan-hero', 'aria-label': 'Próximo culto' },
      h('div', { class: 'pcan-hero-cab' },
        bloqueFecha(proximo.fecha),
        h('div', { class: 'pcan-hero-texto' },
          h('span', { class: 'pcan-hero-kicker', text: 'Próximo culto · ' + haceTanto(proximo.fecha) }),
          h('a', { href: '#/culto/' + proximo.id }, h('strong', { text: proximo.titulo })),
          h('span', { text: [proximo.tipo, canciones.length + (canciones.length === 1 ? ' canción' : ' canciones')].filter(Boolean).join(' · ') }))),
      canciones.length ? h('ol', { class: 'pcan-hero-set' }, canciones.map(function (x, i) {
        return h('li', null, h('a', { href: '#/culto/' + proximo.id + '/tocar/' + (i + 1), title: 'Tocar desde aquí' },
          h('span', { class: 'pcan-hero-n', text: String(i + 1) }),
          h('span', { class: 'pcan-hero-t', text: x.s.titulo }),
          (x.tono || x.s.tonalidad) ? P.pastillaTono(x.tono || x.s.tonalidad) : null));
      })) : h('p', { class: 'pcan-hero-vacio', text: 'Aún no tiene canciones.' }),
      h('div', { class: 'pcan-hero-acciones' },
        canciones.length ? h('a', { class: 'pcan-btn pcan-btn-primary pcan-btn-lg', href: '#/culto/' + proximo.id + '/tocar/1' }, icono('play'), 'Tocar') : null,
        h('a', { class: 'pcan-btn', href: '#/culto/editar/' + proximo.id }, icono('editar'), canciones.length ? 'Editar setlist' : 'Añadir canciones')));
  }

  // ---------------------------------------------------------------- vista: portada (vista dividida sin culto elegido)

  /** Llena el hueco de la derecha: el próximo culto, lo que falta por preparar y lo que viene después. */
  function pintarPortada(host) {
    host.innerHTML = '';
    var portada = h('div', { class: 'pcan-cultos-portada' });
    append(host, portada);
    if (!cultos.length && !cargados) { append(portada, h('p', { class: 'pcan-muted', text: 'Cargando cultos…' })); return true; }
    var hoy = hoyISO();
    var proximos = cultos.filter(function (c) { return c.fecha >= hoy; }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); });
    var celebrados = cultos.filter(function (c) { return c.fecha < hoy; });
    var domingo = proximoDomingo();

    append(portada, tarjetaProximo(proximos[0]));

    // Por preparar: el próximo domingo sin culto y los cultos programados sin canciones.
    var pendientes = proximos.filter(function (c) { return !c.items.length; }).map(function (c) {
      return h('a', { class: 'pcan-pendiente', href: '#/culto/editar/' + c.id }, icono('aviso'),
        h('span', { class: 'pcan-pendiente-texto' }, h('strong', { text: c.titulo }), h('small', { text: 'Aún no tiene canciones · ' + haceTanto(c.fecha) })),
        h('span', { class: 'pcan-pendiente-accion', text: 'Añadir canciones' }));
    });
    if (proximos.length && !proximos.some(function (c) { return c.fecha === domingo; })) {
      pendientes.unshift(h('a', { class: 'pcan-pendiente', href: '#/culto/nuevo' }, icono('calendario'),
        h('span', { class: 'pcan-pendiente-texto' }, h('strong', { text: 'Domingo ' + fechaCorta(domingo) }), h('small', { text: 'Todavía no hay culto preparado' })),
        h('span', { class: 'pcan-pendiente-accion', text: 'Preparar' })));
    }
    if (pendientes.length) {
      append(portada, h('section', { class: 'pcan-portada-sec' }, h('h3', { text: 'Por preparar' }), h('div', { class: 'pcan-pendientes' }, pendientes)));
    }

    // Lo que viene después del próximo.
    var despues = proximos.slice(1, 7);
    if (despues.length) {
      append(portada, h('section', { class: 'pcan-portada-sec' }, h('h3', { text: 'Después' }),
        h('div', { class: 'pcan-portada-cultos' }, despues.map(function (c) {
          return h('a', { class: 'pcan-portada-culto', href: '#/culto/' + c.id }, bloqueFecha(c.fecha),
            h('span', { class: 'pcan-portada-culto-texto' }, h('strong', { text: c.titulo }), h('small', { text: c.items.length + (c.items.length === 1 ? ' canción' : ' canciones') + ' · ' + haceTanto(c.fecha) })));
        }))));
    }

    append(portada, h('p', { class: 'pcan-portada-pie pcan-muted' },
      proximos.length + (proximos.length === 1 ? ' culto programado' : ' cultos programados') + ' · ' + celebrados.length + (celebrados.length === 1 ? ' celebrado' : ' celebrados') + ' · ',
      h('a', { href: '#/culto/nuevo', text: 'Nuevo culto' })));
    return true;
  }

  /** Vuelve a pintar la portada si es lo que se está viendo (tras cargar o cambiar cultos). */
  function refrescarPortada() {
    var host = P.ui.detalle.cultos;
    if (host && host.querySelector('.pcan-cultos-portada, .pcan-detail-empty')) { pintarPortada(host); }
  }

  // ---------------------------------------------------------------- vista: ficha del culto

  function verCulto(id) {
    P.abrirPanel(h('div', { class: 'pcan-panel-loading', text: 'Cargando culto…' }), 'Culto', { vista: 'cultos', id: id });
    Promise.all([api('cultos/' + id), cargar()]).then(function (r) {
      pintarFicha(r[0]);
      if (!cultos.some(function (x) { return x.id === r[0].id; })) { cargar(true).then(refrescar); }
    })
      .catch(function (e) {
        P.abrirPanel([P.cabeceraPanel(h('h2', { text: 'Culto no disponible' })), h('div', { class: 'pcan-panel-body' }, h('p', { text: e.message }))], 'Error', { vista: 'cultos' });
      });
  }

  function pintarFicha(c) {
    var validos = c.items.filter(function (it) { return !it.eliminada; });
    var pdfItem = { texto: 'Descargar PDF del setlist', icono: 'descargar', fn: function () { descargarPdf(c); } };

    var lista = h('ol', { class: 'pcan-setlist' }, c.items.map(function (it, i) {
      if (it.eliminada) {
        return h('li', { class: 'pcan-set-item is-missing' },
          h('span', { class: 'pcan-set-n', text: String(i + 1) }),
          h('span', { class: 'pcan-set-main' }, h('span', { class: 'pcan-muted', text: 'Canción eliminada del cancionero' })));
      }
      var s = it.datos;
      var tono = it.tonalidad || s.tonalidad;
      return h('li', { class: 'pcan-set-item' },
        h('span', { class: 'pcan-set-n', text: String(i + 1) }),
        h('span', { class: 'pcan-set-main' },
          h('a', { class: 'pcan-set-title', href: '#/cancion/' + it.cancion }, s.titulo),
          h('span', { class: 'pcan-set-sub' },
            s.numero ? h('span', { text: 'Nº ' + s.numero }) : null,
            s.tempo ? h('span', { title: s.tempo + ' pulsaciones por minuto', text: '♩ ' + s.tempo }) : null,
            it.nota ? h('span', { class: 'pcan-set-note', text: it.nota }) : null)),
        h('span', { class: 'pcan-set-recursos', 'aria-hidden': 'true' },
          s.partituras && s.partituras.length ? h('span', { title: s.partituras.length === 1 ? 'Partitura' : s.partituras.length + ' partituras' }, icono('partitura')) : null,
          s.letra ? h('span', { title: 'Letra' }, icono('letra')) : null),
        tono ? P.pastillaTono(tono, { title: 'Tonalidad' }) : null,
        h('a', { class: 'pcan-icon-btn', href: '#/culto/' + c.id + '/tocar/' + (i + 1), 'aria-label': 'Tocar desde ' + s.titulo, title: 'Tocar desde aquí' }, icono('play')));
    }));

    P.abrirPanel([
      P.cabeceraPanel(h('span', { class: 'pcan-panel-crumb', text: 'Culto' })),
      h('div', { class: 'pcan-panel-body' },
        h('div', { class: 'pcan-det-hero pcan-culto-hero' },
          bloqueFecha(c.fecha),
          h('div', null,
            h('p', { class: 'pcan-det-kicker', text: fechaLarga(c.fecha) + ' · ' + haceTanto(c.fecha) }),
            h('h2', { class: 'pcan-det-titulo', text: c.titulo }),
            h('p', { class: 'pcan-det-meta' }, c.tipo ? h('span', { text: c.tipo }) : null, h('span', { text: validos.length + (validos.length === 1 ? ' canción' : ' canciones') }), c.creadoPor ? h('span', { class: 'pcan-muted', text: 'Preparado por ' + c.creadoPor }) : null))),
        h('div', { class: 'pcan-det-actions' },
          validos.length ? h('a', { class: 'pcan-btn pcan-btn-primary pcan-btn-lg', href: '#/culto/' + c.id + '/tocar/1' }, icono('play'), 'Tocar el culto') : null,
          h('a', { class: 'pcan-btn', href: '#/culto/editar/' + c.id }, icono('editar'), h('span', { class: 'pcan-btn-label', text: validos.length ? 'Editar' : 'Añadir canciones' })),
          P.accionesSecundarias([
            { texto: 'Copiar como texto', icono: 'copiar', fn: function () { P.copiar(textoSetlist(c), 'Setlist copiado (para WhatsApp)'); } },
            validos.length ? pdfItem : null,
            { texto: 'Duplicar para otro día', icono: 'mas', href: '#/culto/duplicar/' + c.id },
            c.puedeBorrar ? { texto: 'Borrar culto', icono: 'borrar', peligro: true, fn: function () { borrar(c); } } : null
          ])),
        c.notas ? h('div', { class: 'pcan-notas pcan-culto-notas', text: c.notas }) : null,
        c.items.length ? lista : h('div', { class: 'pcan-empty-tab' },
          h('p', { text: 'Este culto aún no tiene canciones.' }),
          h('a', { class: 'pcan-btn pcan-btn-primary', href: '#/culto/editar/' + c.id }, icono('mas'), 'Añadir canciones')))
    ], c.titulo, { vista: 'cultos', id: c.id });
  }

  function textoSetlist(c) {
    var lineas = [c.titulo + ' — ' + fechaLarga(c.fecha), ''];
    var n = 0;
    c.items.forEach(function (it) {
      if (it.eliminada) { return; }
      n++;
      var s = it.datos;
      var tono = it.tonalidad || s.tonalidad;
      lineas.push(n + '. ' + s.titulo + (s.numero ? ' (nº ' + s.numero + ')' : '') + (tono ? ' — ' + tono : ''));
      if (it.nota) { lineas.push('   ' + it.nota); }
    });
    if (c.notas) { lineas.push('', c.notas); }
    lineas.push('', location.href.split('#')[0] + '#/culto/' + c.id);
    return lineas.join('\n');
  }

  function borrar(c) {
    if (!window.confirm('¿Borrar el culto «' + c.titulo + '»? Un administrador podrá recuperarlo desde la papelera.')) { return; }
    api('cultos/' + c.id, { method: 'DELETE' }).then(function () {
      aviso('Culto borrado');
      return cargar(true);
    }).then(function () {
      location.hash = '#/cultos';
      refrescar();
    }).catch(function (e) { aviso(e.message, 'error'); });
  }

  // ---------------------------------------------------------------- editor

  function abrirEditor(id, opciones) {
    opciones = opciones || {};
    P.mostrarVista('cultos');
    if (!id) {
      cargar().then(function () { pintarEditor(null, opciones); });
      return;
    }
    P.abrirPanel(h('div', { class: 'pcan-panel-loading', text: 'Cargando culto…' }), 'Editar culto', { vista: 'cultos', id: id });
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
    var fTipo = h('input', { type: 'text', class: 'pcan-input', list: 'pcan-tipos', maxlength: '80', value: editando ? c.tipo : (opciones.tipo || 'Culto dominical') });
    var fTitulo = h('input', { type: 'text', class: 'pcan-input', required: true, maxlength: '200', value: editando ? c.titulo : '' });
    var fNotas = h('textarea', { class: 'pcan-input pcan-textarea', rows: '2', placeholder: 'Tema del culto, quién predica, indicaciones para el equipo…' });
    fNotas.value = editando ? c.notas : (opciones.notas || '');

    // El título se rellena solo («Culto dominical · 26 oct») hasta que alguien lo cambie a mano.
    var tituloManual = editando;
    function tituloAuto() {
      if (tituloManual) { return; }
      fTitulo.value = [fTipo.value.trim() || 'Culto', fFecha.value ? fechaCorta(fFecha.value) : ''].filter(Boolean).join(' · ');
    }
    fTitulo.addEventListener('input', function () { tituloManual = fTitulo.value.trim() !== ''; });
    fFecha.addEventListener('change', function () { tituloAuto(); pintarItems(); });
    fTipo.addEventListener('input', tituloAuto);
    tituloAuto();

    // Buscador para añadir canciones.
    var resultados = h('div', { class: 'pcan-picker-results', role: 'listbox', hidden: true });
    var buscador = h('input', {
      type: 'search', class: 'pcan-input', placeholder: 'Buscar canción por título, número o letra…', autocomplete: 'off',
      'aria-label': 'Añadir canción al setlist', role: 'combobox', 'aria-expanded': 'false'
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
        append(resultados, h('div', { class: 'pcan-picker-empty' }, 'Sin resultados. ', h('a', { href: '#/nueva', target: '_blank', text: 'Subir una canción nueva' })));
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
            ya ? h('span', { class: 'pcan-picker-warn', text: 'Ya está en este setlist' })
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

    function mover(desde, hasta) {
      if (hasta < 0 || hasta >= items.length || desde === hasta) { return; }
      var it = items.splice(desde, 1)[0];
      items.splice(hasta, 0, it);
      pintarItems();
    }

    function pintarItems() {
      lista.innerHTML = '';
      if (!items.length) {
        append(lista, h('li', { class: 'pcan-set-placeholder', text: 'Busca canciones arriba para añadirlas. Después puedes arrastrarlas para cambiar el orden.' }));
        return;
      }
      items.forEach(function (it, i) {
        var s = P.cancion(it.cancion);
        var titulo = s ? s.titulo : 'Canción no disponible';
        var repetida = items.filter(function (o) { return o.cancion === it.cancion; }).length > 1;
        var rep = avisoRepeticion(it.cancion, fFecha.value, editando ? c.id : 0);

        var asa = h('button', { type: 'button', class: 'pcan-drag', 'aria-label': 'Arrastrar para reordenar ' + titulo, title: 'Arrastrar' }, icono('arrastrar'));
        var li = h('li', { class: 'pcan-set-item', 'data-i': String(i) },
          asa,
          h('span', { class: 'pcan-set-n', text: String(i + 1) }),
          h('span', { class: 'pcan-set-main' },
            h('span', { class: 'pcan-set-title' }, s && s.numero ? h('span', { class: 'pcan-set-num', text: s.numero }) : null, titulo),
            h('span', { class: 'pcan-set-fields' },
              h('input', {
                type: 'text', class: 'pcan-input pcan-input-sm pcan-set-tono', list: 'pcan-tonos-set', value: it.tonalidad,
                placeholder: s && s.tonalidad ? s.tonalidad : 'Tono', 'aria-label': 'Tonalidad de ' + titulo,
                oninput: function (e) { it.tonalidad = e.target.value; }
              }),
              h('input', {
                type: 'text', class: 'pcan-input pcan-input-sm', value: it.nota, placeholder: 'Nota (p. ej. «solo estrofas 1 y 3»)',
                'aria-label': 'Nota para ' + titulo, oninput: function (e) { it.nota = e.target.value; }
              }),
              s && s.variantes && s.variantes.length > 1 ? (function () {
                var sel = h('select', {
                  class: 'pcan-input pcan-input-sm pcan-set-partitura', 'aria-label': 'Partitura de ' + titulo, title: 'Partitura que se usa en este culto (modo culto y PDF)',
                  onchange: function (e) { it.partitura = +e.target.value; }
                }, [h('option', { value: '0', text: 'Partitura: la principal' })].concat(s.variantes.map(function (v, k) {
                  return h('option', { value: String(v.id), text: 'Partitura: ' + (v.label || 'n.º ' + (k + 1)) });
                })));
                sel.value = String(it.partitura || 0);
                return sel;
              })() : null),
            repetida ? h('span', { class: 'pcan-picker-warn' }, icono('aviso'), 'Está repetida en este setlist') : null,
            rep ? h('span', { class: 'pcan-picker-warn' }, icono('aviso'), rep) : null),
          h('span', { class: 'pcan-set-tools' },
            h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': 'Subir', disabled: i === 0, onclick: function () { mover(i, i - 1); } }, icono('arriba')),
            h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': 'Bajar', disabled: i === items.length - 1, onclick: function () { mover(i, i + 1); } }, icono('abajo')),
            h('button', { type: 'button', class: 'pcan-icon-btn', 'aria-label': 'Quitar ' + titulo, onclick: function () { items.splice(i, 1); pintarItems(); } }, icono('cerrar'))));

        arrastrable(asa, li);
        append(lista, li);
      });
    }

    // Arrastrar con puntero (ratón y pantalla táctil): se mueve el elemento en el DOM y al soltar se reordena el array.
    function arrastrable(asa, li) {
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
          var orden = Array.prototype.map.call(lista.children, function (n) { return +n.getAttribute('data-i'); });
          var nuevos = orden.map(function (k) { return items[k]; });
          items.length = 0;
          Array.prototype.push.apply(items, nuevos);
          pintarItems();
        }

        window.addEventListener('pointermove', mueve, { passive: false });
        window.addEventListener('pointerup', suelta);
        window.addEventListener('pointercancel', suelta);
      });
    }

    pintarItems();

    var errorBox = h('div', { class: 'pcan-form-error', role: 'alert', hidden: true });
    var guardar = h('button', { type: 'submit', class: 'pcan-btn pcan-btn-primary' }, editando ? 'Guardar cambios' : 'Crear culto');
    var tonos = h('datalist', { id: 'pcan-tonos-set' }, P.tonalidades.map(function (t) { return h('option', { value: t }); }));

    // En pantallas anchas los datos van en una fila y cada canción del setlist en una línea (ver «editor del culto» en el CSS).
    var form = h('form', { class: 'pcan-form pcan-form-culto', novalidate: true },
      h('div', { class: 'pcan-grid-2 pcan-culto-datos' },
        P.campo('Fecha', fFecha, null, true),
        P.campo('Tipo de culto', h('span', null, fTipo, listaTipos)),
        h('div', { class: 'pcan-span-2' }, P.campo('Título', fTitulo, 'Se rellena solo con el tipo y la fecha; puedes cambiarlo.', true))),
      h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: 'Setlist' }),
        h('div', { class: 'pcan-picker' }, buscador, resultados),
        lista, tonos),
      h('fieldset', { class: 'pcan-fieldset' },
        h('legend', { text: 'Notas' }),
        fNotas),
      errorBox,
      h('div', { class: 'pcan-form-actions' },
        guardar,
        h('button', { type: 'button', class: 'pcan-btn', onclick: function () { if (editando) { location.hash = '#/culto/' + c.id; } else { P.cerrarPanel(); } } }, 'Cancelar')));

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errores = [];
      if (!fFecha.value) { errores.push('Indica la fecha.'); }
      if (!fTitulo.value.trim()) { errores.push('Escribe el título.'); }
      if (errores.length) { errorBox.textContent = errores.join(' '); errorBox.hidden = false; return; }
      errorBox.hidden = true;
      guardar.disabled = true;
      guardar.textContent = 'Guardando…';

      fetch(P.cfg.api + (editando ? 'cultos/' + c.id : 'cultos'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-WP-Nonce': P.cfg.nonce, 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: fTitulo.value.trim(), fecha: fFecha.value, tipo: fTipo.value.trim(), notas: fNotas.value, items: items })
      }).then(function (r) {
        return r.json().then(function (d) { if (!r.ok) { throw new Error(d.message || 'Error ' + r.status); } return d; });
      }).then(function (guardado) {
        P.marcarGuardado();
        aviso(editando ? 'Culto guardado' : 'Culto creado');
        return cargar(true).then(function () {
          refrescar();
          location.hash = '#/culto/' + guardado.id;
        });
      }).catch(function (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
        guardar.disabled = false;
        guardar.textContent = editando ? 'Guardar cambios' : 'Crear culto';
      });
    });

    P.abrirPanel([
      P.cabeceraPanel(h('h2', { text: editando ? 'Editar culto' : 'Nuevo culto' })),
      h('div', { class: 'pcan-panel-body' }, form)
    ], editando ? 'Editar culto' : 'Nuevo culto', { vista: 'cultos', id: editando ? c.id : 0 });
    buscador.focus();
  }

  // ---------------------------------------------------------------- modo culto (lector a pantalla completa)

  var lector = null;

  function abrirModo(id, n) {
    var indice = Math.max(0, (parseInt(n, 10) || 1) - 1);
    if (lector && lector.culto === +id) { lector.irACancion(indice); return; }
    P.ocultarPanel();
    api('cultos/' + id).then(function (c) {
      var items = c.items.filter(function (it) { return !it.eliminada && it.datos.partituras.length; });
      if (!items.length) { aviso('Este culto no tiene partituras', 'error'); location.hash = '#/culto/' + c.id; return; }
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
      lector = { culto: c.id, irACancion: l.irACancion, cerrar: l.cerrar, desdeRuta: false };
    }).catch(function (e) { aviso(e.message, 'error'); });
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
        h('header', { class: 'pcan-home-card-head' }, h('h2', { text: 'Para recuperar' }), h('a', { href: '#/estadisticas', text: 'Estadísticas' })),
        candidatas.length ? h('ul', { class: 'pcan-mini-lista' }, candidatas.map(function (x) {
          return h('li', null, h('a', { href: '#/cancion/' + x.s.id },
            h('span', { class: 'pcan-num is-sm' + (x.s.numero ? '' : ' is-empty') }, x.s.numero ? x.s.numero : icono('nota')),
            h('span', { class: 'pcan-mini-texto' }, h('strong', { text: x.s.titulo }), h('span', { text: x.u ? 'Última vez ' + haceTanto(x.u) : 'Nunca se ha tocado' }))));
        })) : h('p', { class: 'pcan-muted', text: 'Todo el repertorio ha sonado en los últimos 3 meses.' })));
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
    return { titulo: nq ? 'Cultos' : 'Próximos cultos', items: lista.map(function (c) {
      return { titulo: c.titulo, sub: fechaLarga(c.fecha) + ' · ' + c.items.length + ' canciones', icono: 'calendario', href: '#/culto/' + c.id };
    }) };
  });

  // ---------------------------------------------------------------- PDF combinado

  function cargarPdfLib() {
    if (window.PDFLib) { return Promise.resolve(window.PDFLib); }
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PDF_LIB;
      s.onload = function () { resolve(window.PDFLib); };
      s.onerror = function () { reject(new Error('No se pudo cargar el generador de PDF.')); };
      document.head.appendChild(s);
    });
  }

  // Las fuentes estándar del PDF solo admiten Latin-1: se sustituyen los caracteres que no caben.
  function latin1(t) {
    return String(t || '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
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
    aviso('Preparando el PDF del setlist…');

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
            pag.drawText(latin1(n + '.  ' + s.titulo + (s.numero ? '  (n.º ' + s.numero + ')' : '') + (tono ? '  -  ' + tono : '')), { x: 56, y: y, size: 14, font: negrita });
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
            if (fallos.length) { aviso('No se pudo incluir: ' + fallos.join(', '), 'error'); }
            else { aviso('PDF descargado'); }
          });
        });
      });
    }).catch(function (e) { aviso(e.message || 'No se pudo generar el PDF', 'error'); });
  }

  // ---------------------------------------------------------------- ficha de canción: historial y «añadir a un culto»

  P.enFichaCancion(function (cancion, caja) {
    cargar().then(function () {
      var hist = historial(cancion.id);
      var hoy = hoyISO();
      var tocadas = hist.filter(function (c) { return c.fecha <= hoy; });
      var programada = hist.filter(function (c) { return c.fecha > hoy; }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); })[0];
      var proximos = cultos.filter(function (c) { return c.fecha >= hoy && !c.items.some(function (it) { return +it.cancion === cancion.id; }); })
        .sort(function (a, b) { return a.fecha.localeCompare(b.fecha); });

      var select = h('select', { class: 'pcan-select pcan-select-sm', 'aria-label': 'Elegir culto' },
        proximos.map(function (c) { return h('option', { value: String(c.id), text: fechaCorta(c.fecha) + ' · ' + c.titulo }); }),
        h('option', { value: 'nuevo', text: '+ Nuevo culto…' }));

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
            .then(function () { aviso('Añadida a «' + c.titulo + '»'); refrescar(); select.querySelector('option[value="' + c.id + '"]').remove(); boton.disabled = false; })
            .catch(function (e) { aviso(e.message, 'error'); boton.disabled = false; });
        }
      }, icono('mas'), 'Añadir');

      append(caja, h('div', { class: 'pcan-uso' },
        h('div', { class: 'pcan-uso-stats' },
          h('span', { class: 'pcan-uso-cifra', text: String(tocadas.length) }),
          h('span', null,
            h('strong', { text: tocadas.length === 1 ? 'vez tocada' : 'veces tocada' }),
            h('small', null, tocadas.length
              ? ['Última: ', h('a', { href: '#/culto/' + tocadas[0].id, text: fechaCorta(tocadas[0].fecha) }), ' (' + haceTanto(tocadas[0].fecha) + ')']
              : 'Aún no ha sonado en un culto'),
            programada ? h('small', null, 'Programada: ', h('a', { href: '#/culto/' + programada.id, text: fechaCorta(programada.fecha) })) : null)),
        h('div', { class: 'pcan-uso-add' }, h('label', { class: 'pcan-help', text: 'Añadir a un culto' }), h('div', { class: 'pcan-uso-fila' }, select, boton))));
    });
  });

  // ---------------------------------------------------------------- estadísticas

  var PERIODOS = [
    { dias: 90, texto: '3 meses' },
    { dias: 182, texto: '6 meses' },
    { dias: 365, texto: '12 meses' },
    { dias: 0, texto: 'Todo' }
  ];
  var DIAS_OLVIDO = 90;
  var periodoStats = 365;
  var contStats = P.ui.vistaEstadisticas;

  function restarDias(iso, dias) {
    var d = fechaLocal(iso);
    d.setDate(d.getDate() - dias);
    return isoDe(d);
  }

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
      .sort(function (a, b) { return b.n - a.n || b.ultima.localeCompare(a.ultima) || a.c.titulo.localeCompare(b.c.titulo, 'es'); });

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
        (s.etiquetas.length ? s.etiquetas : ['Sin etiqueta']).forEach(function (e) { etiquetas[e] = (etiquetas[e] || 0) + 1; });
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
      return m.fecha.toLocaleDateString('es-ES', larga ? { month: 'long', year: 'numeric' } : { month: 'short' }).replace('.', '');
    };
    var grafica = h('div', { class: 'pcan-columnas', role: 'img', 'aria-label': 'Canciones tocadas por mes' }, meses.map(function (m) {
      var pct = max ? Math.round(m.canciones / max * 100) : 0;
      var texto = etiquetaMes(m, true) + ': ' + m.canciones + ' canciones en ' + m.cultos + (m.cultos === 1 ? ' culto' : ' cultos');
      return h('div', { class: 'pcan-columna', title: texto, tabindex: '0', 'aria-label': texto },
        h('span', { class: 'pcan-columna-valor', text: m.canciones ? String(m.canciones) : '' }),
        h('span', { class: 'pcan-columna-pista' }, h('span', { class: 'pcan-columna-barra' + (m.canciones ? '' : ' is-cero'), style: 'height:' + pct + '%' })),
        h('span', { class: 'pcan-columna-mes', text: etiquetaMes(m) }));
    }));
    var tabla = h('details', { class: 'pcan-tabla-ver' },
      h('summary', { text: 'Ver como tabla' }),
      h('table', { class: 'pcan-tabla' },
        h('thead', null, h('tr', null, h('th', { text: 'Mes' }), h('th', { text: 'Cultos' }), h('th', { text: 'Canciones' }))),
        h('tbody', null, meses.map(function (m) {
          return h('tr', null, h('td', { text: etiquetaMes(m, true) }), h('td', { text: String(m.cultos) }), h('td', { text: String(m.canciones) }));
        }))));
    return h('div', null, grafica, tabla);
  }

  function pintarStats() {
    contStats.innerHTML = '';
    var s = calcularStats();

    var selector = h('div', { class: 'pcan-segment pcan-periodo', role: 'radiogroup', 'aria-label': 'Periodo' }, PERIODOS.map(function (p) {
      var activo = p.dias === periodoStats;
      return h('button', {
        type: 'button', role: 'radio', 'aria-checked': activo ? 'true' : 'false', class: 'pcan-seg' + (activo ? ' is-active' : ''),
        onclick: function () { periodoStats = p.dias; pintarStats(); }
      }, p.texto);
    }));

    append(contStats, h('div', { class: 'pcan-section-head' }, h('h2', { text: 'Estadísticas' }), selector));

    if (!s.cultos) {
      append(contStats, h('div', { class: 'pcan-empty' },
        h('p', { text: 'Aún no hay cultos celebrados en este periodo. Las estadísticas salen solas de los setlists: en cuanto pase el primer culto con canciones, aparecerán aquí.' }),
        h('a', { class: 'pcan-btn', href: '#/cultos' }, icono('calendario'), 'Ir a cultos')));
    }

    append(contStats, h('div', { class: 'pcan-kpis' },
      kpi('Cultos celebrados', String(s.cultos), s.cultos ? s.media.toFixed(1).replace('.', ',') + ' canciones de media' : null),
      kpi('Canciones distintas', String(s.distintas), 'de ' + s.repertorio + ' en el cancionero'),
      kpi('La mitad de lo que tocamos', s.mitad ? s.mitad + (s.mitad === 1 ? ' canción' : ' canciones') : '—', s.mitad ? 'Cuantas menos, más repetimos' : null),
      kpi('Canciones nuevas', String(s.nuevas), s.nuevas ? s.nuevasTocadas + ' ya se han tocado' : 'Añadidas en el periodo')));

    var maxTop = s.top.length ? s.top[0].n : 0;
    var grid = h('div', { class: 'pcan-stats-grid' },
      tarjetaStat('Las más tocadas', s.top.length ? 'Veces que ha sonado cada canción' : null,
        s.top.length ? barras(s.top.slice(0, 10).map(function (x) {
          return {
            titulo: (x.c.numero ? x.c.numero + ' · ' : '') + x.c.titulo, valor: x.n, href: '#/cancion/' + x.c.id,
            detalle: 'Última: ' + fechaCorta(x.ultima),
            tooltip: x.c.titulo + ' · ' + x.n + (x.n === 1 ? ' vez' : ' veces') + ' · última ' + fechaLarga(x.ultima)
          };
        }), maxTop) : h('p', { class: 'pcan-muted', text: 'Sin datos en este periodo.' }), 'is-top'),
      tarjetaStat('Actividad por mes', 'Canciones tocadas cada mes',
        s.meses.length ? columnas(s.meses) : h('p', { class: 'pcan-muted', text: 'Sin datos en este periodo.' })),
      tarjetaStat('Hace tiempo que no suenan', 'Tocadas alguna vez, pero no en los últimos 3 meses',
        s.olvidadas.length ? h('ul', { class: 'pcan-stat-lista' }, s.olvidadas.slice(0, 8).map(function (x) {
          return h('li', null, h('a', { href: '#/cancion/' + x.c.id },
            h('span', { text: (x.c.numero ? x.c.numero + ' · ' : '') + x.c.titulo }),
            h('span', { class: 'pcan-stat-dato', text: haceTanto(x.ultima) })));
        })) : h('p', { class: 'pcan-muted', text: 'Ninguna: todo lo que tocamos ha sonado hace poco.' })),
      tarjetaStat('Nunca tocadas', s.nunca.length + ' de ' + s.repertorio + ' canciones aún no han sonado en un culto',
        s.nunca.length ? h('ul', { class: 'pcan-stat-lista' }, s.nunca.slice(0, 8).map(function (c) {
          return h('li', null, h('a', { href: '#/cancion/' + c.id },
            h('span', { text: (c.numero ? c.numero + ' · ' : '') + c.titulo }),
            h('span', { class: 'pcan-stat-dato', text: 'Añadida ' + haceTanto(c.creada.slice(0, 10)) })));
        }).concat(s.nunca.length > 8 ? [h('li', { class: 'pcan-muted', text: 'y ' + (s.nunca.length - 8) + ' más' })] : [])) : h('p', { class: 'pcan-muted', text: 'Todas se han tocado al menos una vez.' })),
      s.porEtiqueta.some(function (e) { return e.nombre !== 'Sin etiqueta'; }) ? tarjetaStat('Por etiqueta', 'Veces que han sonado canciones de cada etiqueta',
        barras(s.porEtiqueta.slice(0, 8).map(function (e) {
          return { titulo: e.nombre, valor: e.n, tooltip: e.nombre + ' · ' + e.n + (e.n === 1 ? ' vez' : ' veces') };
        }), s.porEtiqueta[0].n)) : null);

    append(contStats, grid);
  }

  function mostrarStats() {
    if (!cargados) { contStats.innerHTML = ''; append(contStats, h('div', { class: 'pcan-empty', text: 'Calculando estadísticas…' })); }
    cargar().then(pintarStats).catch(function (e) {
      contStats.innerHTML = '';
      append(contStats, h('div', { class: 'pcan-empty is-error', text: 'No se pudieron calcular las estadísticas: ' + e.message }));
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
    if (lector) { lector.desdeRuta = true; lector.cerrar(); return; }
    P.mostrarVista('cultos');
    verCulto(m[1]);
  });
})();
