"""Graba el tutorial a 1920×1080 con Microsoft Edge sin ventana, capturando cada fotograma que pinta la página,
y anota cuándo empieza cada frase de la locución para montar luego el audio sincronizado.

Requisitos: el banco de pruebas sirviendo la raíz del repositorio en http://127.0.0.1:8765
(configuración «banco-cancionero» de .claude/launch.json) y Edge instalado.

Uso:  python herramientas/tutorial/grabar_video.py      Después: montar_video.py
"""
import asyncio
import base64
import json
import os
import shutil

from playwright.async_api import async_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
CAPTURA = os.path.join(AQUI, 'captura')
URL = 'http://127.0.0.1:8765/tutorial/tutorial-cancionero.html?grabar'
PORTADA = 2.0   # segundos de portada antes de empezar
COLA = 3.5      # segundos del cartel final


async def main():
    shutil.rmtree(CAPTURA, ignore_errors=True)
    os.makedirs(CAPTURA)
    async with async_playwright() as p:
        navegador = await p.chromium.launch(channel='msedge', headless=True,
                                            args=['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'])
        contexto = await navegador.new_context(viewport={'width': 1920, 'height': 1080}, device_scale_factor=1)
        pagina = await contexto.new_page()
        await pagina.goto(URL, wait_until='networkidle')
        await pagina.evaluate('document.fonts.ready')
        await pagina.wait_for_timeout(1500)
        cdp = await contexto.new_cdp_session(pagina)
        fotos = []

        async def foto(ev):
            ruta = os.path.join(CAPTURA, 'f%05d.jpg' % len(fotos))
            fotos.append((ev['metadata']['timestamp'], os.path.basename(ruta)))
            with open(ruta, 'wb') as f:
                f.write(base64.b64decode(ev['data']))
            try:
                await cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})
            except Exception:
                pass

        cdp.on('Page.screencastFrame', lambda ev: asyncio.ensure_future(foto(ev)))
        await cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 95, 'maxWidth': 1920, 'maxHeight': 1080})
        # Un pequeño cambio fuerza el primer fotograma de la portada.
        await pagina.evaluate("document.body.style.outline='0px solid transparent'")
        t_ini = await pagina.evaluate('Date.now()')
        await pagina.wait_for_timeout(int(PORTADA * 1000))
        await pagina.evaluate('window.__tutorial.iniciar()')
        await pagina.wait_for_function('window.__fin', timeout=400000, polling=250)
        await pagina.wait_for_timeout(int(COLA * 1000))
        t_fin = await pagina.evaluate('Date.now()')
        await cdp.send('Page.stopScreencast')
        await asyncio.sleep(0.5)
        pistas = await pagina.evaluate('window.__pistas')
        await navegador.close()

    with open(os.path.join(CAPTURA, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump({'fotos': fotos, 't_ini': t_ini, 't_fin': t_fin, 'pistas': pistas}, f, ensure_ascii=False)
    duracion = (t_fin - t_ini) / 1000
    print('%d fotogramas · %.1f s · %.1f fps · %d frases' % (len(fotos), duracion, len(fotos) / duracion, len(pistas)))


asyncio.run(main())
