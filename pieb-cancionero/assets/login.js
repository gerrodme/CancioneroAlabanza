/* PIEB Cancionero · pantalla de entrada: enlace por correo y, si está configurado, Google */
(function () {
  'use strict';

  var CFG = window.PIEB_LOGIN || {};
  var error = document.getElementById('pcan-login-error');
  var ok = document.getElementById('pcan-enlace-ok');

  function mostrarError(texto) {
    if (ok) { ok.hidden = true; }
    error.textContent = texto;
    error.hidden = false;
  }

  function enviar(url, datos) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { throw new Error(d.message || 'No se ha podido completar.'); }
        return d;
      });
    });
  }

  // Enlace mágico por correo.
  var form = document.getElementById('pcan-enlace-form');
  if (form) {
    var campo = document.getElementById('pcan-enlace-email');
    var boton = form.querySelector('button');
    var texto = boton.textContent;
    try { campo.value = localStorage.getItem('pcan-email') || ''; } catch (e) { /* almacenamiento no disponible */ }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = campo.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { mostrarError('Escribe un correo válido.'); campo.focus(); return; }
      error.hidden = true;
      boton.disabled = true;
      boton.textContent = 'Enviando…';
      enviar(CFG.apiEnlace, { email: email, volver: CFG.volver }).then(function (d) {
        try { localStorage.setItem('pcan-email', email); } catch (e2) { /* almacenamiento no disponible */ }
        ok.textContent = d.mensaje;
        ok.hidden = false;
        boton.textContent = 'Enviar otro enlace';
      }).catch(function (err) {
        mostrarError(err.message);
        boton.textContent = texto;
      }).then(function () { boton.disabled = false; });
    });
  }

  // Google (solo si hay Client ID configurado).
  var botonGoogle = document.getElementById('pcan-google-btn');
  if (!botonGoogle || !CFG.clientId) { return; }

  function alEntrar(respuesta) {
    error.hidden = true;
    botonGoogle.classList.add('is-loading');
    enviar(CFG.apiGoogle, { credential: respuesta.credential }).then(function () {
      location.reload();
    }).catch(function (e) {
      botonGoogle.classList.remove('is-loading');
      mostrarError(e.message);
    });
  }

  function iniciar() {
    if (!window.google || !google.accounts || !google.accounts.id) {
      botonGoogle.hidden = true;
      return;
    }
    google.accounts.id.initialize({ client_id: CFG.clientId, callback: alEntrar, ux_mode: 'popup', auto_select: false });
    google.accounts.id.renderButton(botonGoogle, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'es', width: 300 });
  }

  if (document.readyState === 'complete') { iniciar(); }
  else { window.addEventListener('load', iniciar); }
})();
