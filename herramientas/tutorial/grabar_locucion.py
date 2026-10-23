"""Graba cada frase del guion del tutorial con la voz neuronal Elvira (Microsoft, vía edge-tts).

Lee las frases de tutorial/tutorial-cancionero.html (los «t: '…'» de cada paso) y deja en
herramientas/tutorial/locucion/ un MP3 por frase y locucion.json con su duración.
Solo envía al servicio de voz el texto del guion.

Uso:  python herramientas/tutorial/grabar_locucion.py [velocidad]     (por defecto +10%)
Después: incrustar_locucion.py para meter los audios en el HTML.
"""
import asyncio
import json
import os
import re
import sys

import edge_tts
from mutagen.mp3 import MP3

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
HTML = os.path.join(RAIZ, 'tutorial', 'tutorial-cancionero.html')
LOCUCION = os.path.join(AQUI, 'locucion')
VOZ = 'es-ES-ElviraNeural'
VELOCIDAD = sys.argv[1] if len(sys.argv) > 1 else '+10%'


async def main():
    with open(HTML, encoding='utf-8') as f:
        textos = re.findall(r"\{ t: '([^']+)'", f.read())
    os.makedirs(LOCUCION, exist_ok=True)
    datos = []
    for i, texto in enumerate(textos):
        nombre = '%02d.mp3' % i
        ruta = os.path.join(LOCUCION, nombre)
        await edge_tts.Communicate(texto, VOZ, rate=VELOCIDAD).save(ruta)
        duracion = round(MP3(ruta).info.length, 2)
        datos.append({'t': texto, 'f': nombre, 'd': duracion})
        print('%02d %5.2fs %s' % (i, duracion, texto[:60]))
    with open(os.path.join(LOCUCION, 'locucion.json'), 'w', encoding='utf-8') as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    print('%d frases · %.1f s en total' % (len(datos), sum(x['d'] for x in datos)))


asyncio.run(main())
