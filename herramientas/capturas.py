"""Genera las capturas de pantalla de docs/imagenes/ a partir del banco de pruebas (datos simulados, sin partituras reales).

Requisitos: `pip install playwright pillow` y Microsoft Edge instalado.
Uso:  python herramientas/capturas.py

Las capturas se hacen con el tema «Colores» (el de por defecto) a doble densidad y se reducen a un ancho razonable.
Si cambia la interfaz, basta con volver a ejecutarlo. También genera la imagen para compartir el repositorio en redes.
"""
import asyncio
import http.server
import os
import socketserver
import threading

from PIL import Image
from playwright.async_api import async_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, 'docs', 'imagenes')
PUERTO = 8766
BASE = 'http://127.0.0.1:%d/banco-pruebas/index.html' % PUERTO

# nombre, ruta (hash), ancho, alto, espera extra (ms), ancho máximo de la imagen final
CAPTURAS = [
    ('lista-canciones', '#/canciones', 1400, 860, 600, 1500),
    ('ficha-cancion', '#/cancion/441', 1400, 860, 900, 1500),
    ('setlist-culto', '#/culto/900', 1400, 860, 900, 1500),
    ('modo-culto-tableta', '#/culto/900/tocar/1', 1280, 800, 1500, 1400),
    ('ajustes', '#/ajustes', 1400, 860, 900, 1500),
    ('papelera', '#/papelera', 1400, 860, 900, 1500),
    ('movil-lista', '#/canciones', 390, 844, 700, 780),
]


def servir():
    class Manejador(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=RAIZ, **k)

        def log_message(self, *a):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(('127.0.0.1', PUERTO), Manejador)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def optimizar(ruta, ancho_max):
    img = Image.open(ruta).convert('RGB')
    if img.width > ancho_max:
        img = img.resize((ancho_max, round(img.height * ancho_max / img.width)), Image.LANCZOS)
    img.save(ruta, optimize=True)


def imagen_social():
    """Imagen para compartir el repositorio (Settings → Social preview de GitHub, 1280×640)."""
    from PIL import ImageDraw, ImageFont, ImageFilter
    W, H = 1280, 640
    fondo = Image.new('RGB', (W, H), (238, 240, 252))
    d = ImageDraw.Draw(fondo)
    for y in range(H):  # degradado suave
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(238 + 12 * t), int(240 - 10 * t), int(252 - 14 * t)))
    fuentes = r'C:\Windows\Fonts'
    titulo = ImageFont.truetype(os.path.join(fuentes, 'segoeuib.ttf'), 80)
    texto = ImageFont.truetype(os.path.join(fuentes, 'segoeui.ttf'), 34)
    d.text((70, 190), 'Cancionero', font=titulo, fill=(25, 38, 80))
    d.text((74, 300), 'Partituras, setlists', font=texto, fill=(70, 80, 115))
    d.text((74, 342), 'y modo culto para equipos', font=texto, fill=(70, 80, 115))
    d.text((74, 384), 'de música y alabanza', font=texto, fill=(70, 80, 115))
    d.text((74, 470), 'Plugin de WordPress · Software libre', font=ImageFont.truetype(os.path.join(fuentes, 'segoeui.ttf'), 26), fill=(110, 118, 150))
    lista = Image.open(os.path.join(SALIDA, 'lista-canciones.png')).convert('RGB')
    ancho = 600
    lista = lista.resize((ancho, round(lista.height * ancho / lista.width)), Image.LANCZOS)
    mascara = Image.new('L', lista.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, lista.width, lista.height], radius=22, fill=255)
    sombra = Image.new('RGBA', (lista.width + 240, lista.height + 240), (0, 0, 0, 0))
    ImageDraw.Draw(sombra).rounded_rectangle([120, 134, lista.width + 120, lista.height + 134], radius=22, fill=(30, 40, 90, 90))
    sombra = sombra.filter(ImageFilter.GaussianBlur(22))
    x, y = 640, 150
    fondo.paste(sombra, (x - 120, y - 120), sombra)
    fondo.paste(lista, (x, y), mascara)
    destino = os.path.join(SALIDA, 'social-preview.png')
    fondo.save(destino, optimize=True)
    print('%-22s %4d KB' % ('social-preview.png', os.path.getsize(destino) // 1024))


async def main():
    os.makedirs(SALIDA, exist_ok=True)
    srv = servir()
    try:
        async with async_playwright() as p:
            navegador = await p.chromium.launch(channel='msedge', headless=True, args=['--hide-scrollbars'])
            for nombre, ruta, ancho, alto, espera, max_ancho in CAPTURAS:
                contexto = await navegador.new_context(viewport={'width': ancho, 'height': alto}, device_scale_factor=2,
                                                       locale='es-ES', timezone_id='Europe/Madrid')
                pagina = await contexto.new_page()
                await pagina.goto(BASE + '?tema=colores', wait_until='networkidle')
                await pagina.wait_for_timeout(700)
                await pagina.evaluate("location.hash = %r" % ruta)
                await pagina.evaluate('document.fonts.ready')
                await pagina.wait_for_timeout(espera)
                destino = os.path.join(SALIDA, nombre + '.png')
                await pagina.screenshot(path=destino)
                optimizar(destino, max_ancho)
                print('%-22s %4d KB' % (nombre + '.png', os.path.getsize(destino) // 1024))
                await contexto.close()
            await navegador.close()
        imagen_social()
    finally:
        srv.shutdown()


if __name__ == '__main__':
    asyncio.run(main())
