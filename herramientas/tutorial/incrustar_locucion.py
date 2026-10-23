"""Mete los MP3 de herramientas/tutorial/locucion/ (en base64) dentro de tutorial/tutorial-cancionero.html.

El guion del HTML y la grabación deben coincidir frase a frase; si has cambiado el guion,
vuelve a ejecutar antes grabar_locucion.py.

Uso:  python herramientas/tutorial/incrustar_locucion.py
"""
import base64
import json
import os
import re

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
HTML = os.path.join(RAIZ, 'tutorial', 'tutorial-cancionero.html')
LOCUCION = os.path.join(AQUI, 'locucion')


def main():
    with open(HTML, encoding='utf-8') as f:
        html = f.read()
    with open(os.path.join(LOCUCION, 'locucion.json'), encoding='utf-8') as f:
        datos = json.load(f)

    textos = re.findall(r"\{ t: '([^']+)'", html)
    if [d['t'] for d in datos] != textos:
        raise SystemExit('El guion del HTML no coincide con la grabación: ejecuta antes grabar_locucion.py.')

    bloque = []
    for d in datos:
        with open(os.path.join(LOCUCION, d['f']), 'rb') as f:
            bloque.append({'t': d['t'], 'd': d['d'], 'a': base64.b64encode(f.read()).decode()})
    contenido = json.dumps(bloque, ensure_ascii=False).replace('</', '<\\/')

    patron = re.compile(r'<script id="locucion" type="application/json">.*?</script>', re.S)
    if not patron.search(html):
        raise SystemExit('No encuentro el bloque <script id="locucion"> en el HTML.')
    html = patron.sub(lambda _: '<script id="locucion" type="application/json">' + contenido + '</script>', html, count=1)

    with open(HTML, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print('Locución incrustada: %d frases · %d KB de HTML' % (len(bloque), os.path.getsize(HTML) // 1024))


if __name__ == '__main__':
    main()
