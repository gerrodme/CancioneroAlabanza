"""
Prueba de carga del Cancionero: simula a muchas personas usando el cancionero a la vez (el «domingo por la mañana»)
y genera un informe HTML con tiempos de respuesta y errores por nivel de carga.

Cada usuario virtual repite una visita típica:
  1. abre la página del cancionero (HTML con sesión);
  2. carga la lista de canciones (GET /canciones) y unas miniaturas;
  3. mira los cultos (GET /cultos);
  4. abre varias canciones (ficha) y descarga su partitura, con pausas de lectura entre una y otra;
  5. vuelve a pedir una partitura ya vista (revalidación con ETag: debería responder 304).

Las cuentas son cuentas de prueba con contraseña de WordPress, en un JSON { "usuario": "contraseña", … } que NO va en el
repositorio. Varios usuarios virtuales comparten cada cuenta (no hace falta una cuenta por persona simulada).
Solo lee: no crea ni cambia canciones ni cultos (cada inicio de sesión sí queda en el registro de accesos).

Uso:
  python herramientas/prueba_carga.py --web http://mi-servidor:8086 --credenciales dist/credenciales.json
  python herramientas/prueba_carga.py --web … --credenciales … --etapas 10,25,50,100,200 --duracion 90

Úsala solo contra un servidor propio o de pruebas: a 200 usuarios es, a todos los efectos, mucha carga.
Requiere: pip install aiohttp
"""
import argparse
import asyncio
import json
import random
import re
import statistics
import sys
import time
from datetime import datetime
from html import escape
from pathlib import Path
from urllib.parse import urljoin

try:
    import aiohttp
except ImportError:
    sys.exit('Falta aiohttp: pip install aiohttp')

TIPOS = {
    'pagina': 'Abrir el cancionero',
    'canciones': 'Lista de canciones',
    'miniatura': 'Miniatura',
    'cultos': 'Lista de cultos',
    'ficha': 'Ficha de canción',
    'partitura': 'Descargar partitura',
    'revalidar': 'Partitura ya vista (304)',
}


class Medidas:
    """Guarda cada petición: (etapa, tipo, segundos, estado, bytes, error)."""

    def __init__(self):
        self.filas = []
        self.etapa = 0

    def anotar(self, tipo, seg, estado, nbytes=0, error=''):
        self.filas.append((self.etapa, tipo, seg, estado, nbytes, error))


def pct(valores, p):
    if not valores:
        return None
    v = sorted(valores)
    k = max(0, min(len(v) - 1, int(round(p / 100 * (len(v) - 1)))))
    return v[k]


async def peticion(sesion, med, tipo, url, cabeceras=None, ok=(200,), leer=True):
    """Hace un GET, mide el tiempo hasta leer el cuerpo entero y lo anota. Devuelve (estado, cuerpo|None)."""
    t0 = time.perf_counter()
    try:
        async with sesion.get(url, headers=cabeceras or {}, allow_redirects=False) as r:
            n = 0
            cuerpo = None
            if leer == 'json':
                cuerpo = await r.json(content_type=None)
            elif leer == 'texto':
                cuerpo = await r.text()
                n = len(cuerpo)
            else:
                async for trozo in r.content.iter_chunked(65536):
                    n += len(trozo)
            seg = time.perf_counter() - t0
            err = '' if r.status in ok else f'HTTP {r.status}'
            med.anotar(tipo, seg, r.status, n, err)
            return r.status, cuerpo, r.headers
    except Exception as e:  # tiempo agotado, conexión cerrada…
        med.anotar(tipo, time.perf_counter() - t0, 0, 0, type(e).__name__)
        return 0, None, {}


async def iniciar_sesion(web, pagina, usuario, clave):
    """Entra con usuario y contraseña en wp-login.php y devuelve (cookies, nonce, api)."""
    jar = aiohttp.CookieJar(unsafe=True)  # unsafe=True: admite cookies de direcciones IP
    async with aiohttp.ClientSession(cookie_jar=jar) as s:
        url_login = urljoin(web, '/wp-login.php')
        await s.get(url_login)  # cookie de prueba de WordPress
        datos = {'log': usuario, 'pwd': clave, 'wp-submit': 'Entrar', 'testcookie': '1',
                 'redirect_to': urljoin(web, pagina)}
        async with s.post(url_login, data=datos, allow_redirects=True) as r:
            html = await r.text()
        m = re.search(r'window\.PIEB_CANCIONERO\s*=\s*(\{.*?\});', html, re.S)
        if not m:
            async with s.get(urljoin(web, pagina)) as r:
                html = await r.text()
            m = re.search(r'window\.PIEB_CANCIONERO\s*=\s*(\{.*?\});', html, re.S)
        if not m:
            raise RuntimeError(f'{usuario}: no se pudo entrar (¿contraseña o página incorrectas?)')
        conf = json.loads(m.group(1))
        cookies = {c.key: c.value for c in jar}
        return cookies, conf['nonce'], conf['api']


async def usuario_virtual(n, cuenta, web, pagina, med, comun, fin, pausa):
    cookies, nonce, api = cuenta
    api_h = {'X-WP-Nonce': nonce}
    timeout = aiohttp.ClientTimeout(total=60)
    conector = aiohttp.TCPConnector(limit=6)  # como un navegador: pocas conexiones por persona
    async with aiohttp.ClientSession(cookies=cookies, timeout=timeout, connector=conector,
                                     cookie_jar=aiohttp.CookieJar(unsafe=True)) as s:
        await asyncio.sleep(random.uniform(0, 3))  # que no arranquen todos en el mismo milisegundo
        while time.monotonic() < fin[0]:
            await peticion(s, med, 'pagina', urljoin(web, pagina), leer='texto')
            est, lista, _ = await peticion(s, med, 'canciones', api + 'canciones', api_h, leer='json')
            if est == 200 and isinstance(lista, list) and lista:
                comun['canciones'] = lista
            lista = comun.get('canciones') or []
            con_mini = [c for c in lista if c.get('miniatura')]
            await asyncio.gather(*[peticion(s, med, 'miniatura', urljoin(web, c['miniatura']))
                                   for c in random.sample(con_mini, min(12, len(con_mini)))])
            await peticion(s, med, 'cultos', api + 'cultos', api_h, leer='json')

            vistas = []
            con_part = [c for c in lista if c.get('partituras')]
            for c in random.sample(con_part, min(5, len(con_part))):
                if time.monotonic() >= fin[0]:
                    break
                est, ficha, _ = await peticion(s, med, 'ficha', f"{api}canciones/{c['id']}", api_h, leer='json')
                if est == 200 and ficha and ficha.get('partituras'):
                    url = urljoin(web, ficha['partituras'][0]['url'])
                    _, _, h = await peticion(s, med, 'partitura', url)
                    if h.get('ETag'):
                        vistas.append((url, h['ETag']))
                await asyncio.sleep(random.uniform(*pausa))  # leyendo / tocando
            if vistas:
                url, etag = random.choice(vistas)
                await peticion(s, med, 'revalidar', url, {'If-None-Match': etag}, ok=(200, 304))
            await asyncio.sleep(random.uniform(*pausa))


async def principal(a):
    cred = json.loads(Path(a.credenciales).read_text(encoding='utf-8'))
    print(f'Iniciando sesión con {len(cred)} cuentas…')
    cuentas = []
    for u, p in cred.items():
        try:
            cuentas.append(await iniciar_sesion(a.web, a.pagina, u, p))
            print(f'  ✓ {u}')
        except Exception as e:
            print(f'  ✗ {u}: {e}')
    if not cuentas:
        sys.exit('Ninguna cuenta pudo entrar.')

    med = Medidas()
    comun = {}
    pausa = tuple(float(x) for x in a.pausa.split('-'))
    etapas = [int(x) for x in a.etapas.split(',')]
    resumen = []
    try:
        for i, vus in enumerate(etapas, 1):
            med.etapa = i
            inicio = len(med.filas)
            fin = [time.monotonic() + a.duracion]
            print(f'\nEtapa {i}: {vus} usuarios durante {a.duracion} s…', flush=True)
            t0 = time.monotonic()
            await asyncio.gather(*[usuario_virtual(n, cuentas[n % len(cuentas)], a.web, a.pagina, med, comun, fin, pausa)
                                   for n in range(vus)])
            dur = time.monotonic() - t0
            filas = med.filas[inicio:]
            errores = sum(1 for f in filas if f[5])
            tasa = errores / len(filas) if filas else 1
            resumen.append((i, vus, dur))
            p95 = pct([f[2] for f in filas if f[1] == 'partitura' and not f[5]], 95)
            print(f'  {len(filas)} peticiones · {len(filas) / dur:.1f}/s · errores {tasa:.1%}'
                  + (f' · partitura p95 {p95:.2f} s' if p95 else ''))
            if tasa > a.parar:
                print(f'  Más de un {a.parar:.0%} de errores: se para aquí para no seguir castigando el servidor.')
                break
    except (KeyboardInterrupt, asyncio.CancelledError):
        print('\nInterrumpida: se genera el informe con lo medido.')
    informe(a, med, resumen, len(cuentas))


# ---------------------------------------------------------------- informe HTML

def color(seg):
    if seg is None:
        return '#e2e8f0', '—'
    t = f'{seg * 1000:.0f} ms' if seg < 1 else f'{seg:.1f} s'
    if seg < 0.5:
        return '#dcfce7', t
    if seg < 2:
        return '#fef3c7', t
    return '#fee2e2', t


def informe(a, med, resumen, ncuentas):
    filas_etapa = []
    puntos = []
    mejor = None
    for i, vus, dur in resumen:
        filas = [f for f in med.filas if f[0] == i]
        if not filas:
            continue
        err = [f for f in filas if f[5]]
        tasa = len(err) / len(filas)
        rps = len(filas) / dur
        mb = sum(f[4] for f in filas) / dur / 1e6 * 8
        celdas = []
        p95s = {}
        for t in TIPOS:
            v = [f[2] for f in filas if f[1] == t and not f[5]]
            p95s[t] = pct(v, 95)
            fondo, txt = color(p95s[t])
            p50 = pct(v, 50)
            celdas.append(f'<td style="background:{fondo}"><b>{txt}</b><small>mediana {color(p50)[1]}</small></td>')
        ok = tasa < 0.01 and (p95s['partitura'] or 0) < 2 and (p95s['canciones'] or 0) < 2
        if ok:
            mejor = vus
        puntos.append((vus, p95s['partitura'], p95s['canciones'], tasa))
        tipos_err = {}
        for f in err:
            tipos_err[f[5]] = tipos_err.get(f[5], 0) + 1
        detalle_err = ', '.join(f'{k} ×{v}' for k, v in sorted(tipos_err.items(), key=lambda x: -x[1])[:3])
        filas_etapa.append(
            f'<tr><th>{"✅" if ok else "⚠️"} <span class="vus">{vus}</span><small>usuarios</small></th>'
            f'<td><b>{rps:.1f}</b><small>pet./s</small></td><td><b>{mb:.1f}</b><small>Mbit/s</small></td>'
            f'<td style="background:{"#dcfce7" if tasa < .01 else "#fef3c7" if tasa < .05 else "#fee2e2"}">'
            f'<b>{tasa:.1%}</b><small>{escape(detalle_err) or "sin errores"}</small></td>{"".join(celdas)}</tr>')

    # gráfica SVG: p95 de partitura y de lista frente a usuarios
    svg = ''
    if puntos:
        W, H, M = 640, 240, 40
        maxv = max(max(p[0] for p in puntos), 1)
        maxy = max([p[1] or 0 for p in puntos] + [p[2] or 0 for p in puntos] + [2.5])
        X = lambda v: M + (W - 2 * M) * v / maxv
        Y = lambda s: H - M - (H - 2 * M) * min(s, maxy) / maxy
        def linea(idx, col):
            pts = [(X(p[0]), Y(p[idx])) for p in puntos if p[idx] is not None]
            return (f'<polyline fill="none" stroke="{col}" stroke-width="3" points="{" ".join(f"{x:.0f},{y:.0f}" for x, y in pts)}"/>'
                    + ''.join(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="4" fill="{col}"/>' for x, y in pts))
        svg = (f'<svg viewBox="0 0 {W} {H}" class="graf">'
               f'<rect x="{M}" y="{Y(maxy):.0f}" width="{W - 2 * M}" height="{Y(2) - Y(maxy):.0f}" fill="#fee2e2"/>'
               f'<rect x="{M}" y="{Y(2):.0f}" width="{W - 2 * M}" height="{Y(0.5) - Y(2):.0f}" fill="#fef9c3"/>'
               f'<rect x="{M}" y="{Y(0.5):.0f}" width="{W - 2 * M}" height="{Y(0) - Y(0.5):.0f}" fill="#dcfce7"/>'
               + ''.join(f'<text x="{X(p[0]):.0f}" y="{H - 18}" text-anchor="middle">{p[0]}</text>' for p in puntos)
               + f'<text x="{M - 6}" y="{Y(2) + 4:.0f}" text-anchor="end">2 s</text>'
               f'<text x="{M - 6}" y="{Y(0.5) + 4:.0f}" text-anchor="end">0,5</text>'
               f'<text x="{W / 2:.0f}" y="{H - 2}" text-anchor="middle">usuarios a la vez</text>'
               + linea(1, '#2563eb') + linea(2, '#d97706') + '</svg>')

    cab = ''.join(f'<th>{escape(v)}<small>p95</small></th>' for v in TIPOS.values())
    if mejor:
        veredicto = f'<div class="big ok"><b>{mejor}</b><span>usuarios a la vez sin problemas</span></div>'
    else:
        veredicto = '<div class="big ko"><b>✗</b><span>ni la primera etapa fue fluida</span></div>'
    html = f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cancionero · Prueba de carga</title>
<style>
body{{margin:0;font-family:system-ui,Segoe UI,sans-serif;background:#f1f5f9;color:#0f172a}}
.wrap{{max-width:1200px;margin:0 auto;padding:24px}}
header{{display:flex;align-items:center;gap:20px;background:#0f172a;color:#fff;border-radius:18px;padding:22px 26px}}
header h1{{margin:0;font-size:26px}} header p{{margin:4px 0 0;opacity:.7}}
.big{{margin-left:auto;text-align:center;border-radius:14px;padding:12px 22px}} .big.ok{{background:#16a34a}} .big.ko{{background:#dc2626}}
.big b{{display:block;font-size:40px;line-height:1}} .big span{{font-size:13px}}
h2{{margin:28px 0 10px}}
.tabla{{overflow-x:auto;background:#fff;border-radius:16px;box-shadow:0 1px 3px #0001}}
table{{border-collapse:collapse;width:100%;font-size:13px}}
th,td{{padding:8px;text-align:center;border-bottom:1px solid #f1f5f9}} td b{{font-size:15px}}
small{{display:block;font-size:11px;color:#475569;font-weight:400}} .vus{{font-size:22px}}
.graf{{width:100%;max-width:700px;background:#fff;border-radius:16px;font-size:12px;fill:#475569}}
.ley span{{margin-right:16px}} .ley i{{display:inline-block;width:14px;height:4px;vertical-align:middle;margin-right:4px}}
.nota{{background:#fff;border-left:5px solid #2563eb;border-radius:10px;padding:12px 16px;font-size:14px}}
</style></head><body><div class="wrap">
<header><div><h1>⚡ Prueba de carga</h1><p>{escape(a.web)} · {datetime.now():%d-%m-%Y %H:%M} · {ncuentas} cuentas ·
{a.duracion} s por etapa · pausas de {escape(a.pausa)} s</p></div>{veredicto}</header>
<h2>📈 Tiempo de respuesta (p95) según la carga</h2>
<p class="ley"><span><i style="background:#2563eb"></i>Descargar partitura</span><span><i style="background:#d97706"></i>Lista de canciones</span>
🟩 rápido (&lt;0,5 s) · 🟨 aceptable (&lt;2 s) · 🟥 lento</p>
{svg}
<h2>📊 Detalle por etapa</h2>
<div class="tabla"><table><tr><th>Carga</th><th>Ritmo</th><th>Salida</th><th>Errores</th>{cab}</tr>{"".join(filas_etapa)}</table></div>
<h2>ℹ️ Cómo leerlo</h2>
<div class="nota">✅ = menos de un 1 % de errores y el 95 % de las listas y partituras en menos de 2 s.
«p95» es el tiempo que no supera el 95 % de las peticiones. Cada usuario simulado deja pausas de lectura, como en un culto real.
Si los tiempos suben mucho antes que el uso de CPU del servidor, el límite suele ser el número de procesos PHP.</div>
</div></body></html>'''
    Path(a.salida).parent.mkdir(parents=True, exist_ok=True)
    Path(a.salida).write_text(html, encoding='utf-8')
    print(f'\nInforme: {a.salida}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Prueba de carga del Cancionero (solo lectura).')
    ap.add_argument('--web', required=True, help='Dirección de la web, p. ej. http://servidor:8086')
    ap.add_argument('--pagina', default='/cancionero/', help='Ruta de la página del cancionero')
    ap.add_argument('--credenciales', required=True, help='JSON {usuario: contraseña} de cuentas de prueba')
    ap.add_argument('--etapas', default='10,25,50,100,200', help='Usuarios a la vez en cada etapa')
    ap.add_argument('--duracion', type=int, default=60, help='Segundos de cada etapa')
    ap.add_argument('--pausa', default='3-10', help='Pausa de lectura entre canciones, en segundos (mín-máx)')
    ap.add_argument('--parar', type=float, default=0.2, help='Deja de subir si los errores pasan de esta fracción')
    ap.add_argument('--salida', default='dist/prueba-carga.html', help='Archivo del informe')
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # la consola de Windows no siempre es UTF-8
    args.web = args.web.rstrip('/') + '/'
    try:
        asyncio.run(principal(args))
    except KeyboardInterrupt:
        pass
