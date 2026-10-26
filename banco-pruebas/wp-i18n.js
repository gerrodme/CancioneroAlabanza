/* Banco de pruebas: imitación mínima de wp.i18n (la de WordPress). Usa el diccionario que carga banco-pruebas/i18n/<locale>.js
 * (generado por herramientas/i18n.py compilar) cuando la URL lleva ?idioma=en_US; sin diccionario devuelve los textos tal cual. */
(function () {
  'use strict';

  var datos = (window.PIEB_I18N && window.PIEB_I18N.data) || {};

  /** Índice de plural según la regla del idioma («nplurals=2; plural=(n != 1);»); por defecto, n != 1. */
  var regla = null;
  (function () {
    var cabecera = (datos[''] && datos['']['plural-forms']) || '';
    var m = cabecera.match(/plural\s*=\s*([^;]+)/);
    if (!m) { return; }
    try { regla = new Function('n', 'return +(' + m[1] + ');'); } catch (e) { regla = null; }
  })();

  function indicePlural(n) { return regla ? regla(+n) : (+n !== 1 ? 1 : 0); }

  function traducir(clave, defecto) {
    var v = datos[clave];
    return v && v[0] ? v[0] : defecto;
  }

  function __(texto) { return traducir(texto, texto); }
  function _x(texto, contexto) { return traducir(contexto + '\u0004' + texto, texto); }

  function plural(clave, singular, plural_, n) {
    var v = datos[clave], i = indicePlural(n);
    if (v && v[i]) { return v[i]; }
    return +n === 1 ? singular : plural_;
  }
  function _n(singular, plural_, n) { return plural(singular, singular, plural_, n); }
  function _nx(singular, plural_, n, contexto) { return plural(contexto + '\u0004' + singular, singular, plural_, n); }

  /** %s, %d y %1$s, como el sprintf de WordPress. */
  function sprintf(formato) {
    var args = arguments, sig = 1;
    return String(formato).replace(/%(?:(\d+)\$)?([sd%])/g, function (m, pos, tipo) {
      if (tipo === '%') { return '%'; }
      var v = pos ? args[+pos] : args[sig++];
      return tipo === 'd' ? String(parseInt(v, 10) || 0) : String(v);
    });
  }

  // El segundo argumento (dominio) se acepta y se ignora, igual que en la API real.
  window.wp = window.wp || {};
  window.wp.i18n = {
    __: function (t) { return __(t); },
    _x: function (t, c) { return _x(t, c); },
    _n: function (s, p, n) { return _n(s, p, n); },
    _nx: function (s, p, n, c) { return _nx(s, p, n, c); },
    sprintf: sprintf
  };
})();
