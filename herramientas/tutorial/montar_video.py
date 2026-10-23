"""Monta tutorial/tutorial-cancionero-1080p.mp4 (1920×1080, 30 fps, H.264 + AAC) con los fotogramas de
grabar_video.py y la locución de Elvira colocada en el instante exacto en que sonó cada frase.

Requisitos: ffmpeg en el PATH.
Uso:  python herramientas/tutorial/montar_video.py
"""
import json
import os
import subprocess

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
CAPTURA = os.path.join(AQUI, 'captura')
LOCUCION = os.path.join(AQUI, 'locucion')
SALIDA = os.path.join(RAIZ, 'tutorial', 'tutorial-cancionero-1080p.mp4')


def main():
    with open(os.path.join(LOCUCION, 'locucion.json'), encoding='utf-8') as f:
        clip = {x['t']: x for x in json.load(f)}
    with open(os.path.join(CAPTURA, 'meta.json'), encoding='utf-8') as f:
        meta = json.load(f)

    t0, t1 = meta['t_ini'] / 1000, meta['t_fin'] / 1000
    fotos = sorted((ts, os.path.join(CAPTURA, nombre)) for ts, nombre in meta['fotos'] if ts <= t1)
    pistas = meta['pistas']

    # Cada frase tiene que haber durado lo que su audio: si no, sonó la voz de reserva y no cuadraría.
    for a, b in zip(pistas, pistas[1:]):
        hueco = (b['en'] - a['en']) / 1000
        if hueco + 0.05 < clip[a['t']]['d']:
            raise SystemExit('La frase «%s» se cortó (%.2f s): vuelve a grabar el vídeo.' % (a['t'], hueco))

    lista = os.path.join(CAPTURA, 'lista.txt')
    with open(lista, 'w', encoding='utf-8') as f:
        for i, (ts, ruta) in enumerate(fotos):
            desde = max(ts, t0) if i else t0
            hasta = fotos[i + 1][0] if i + 1 < len(fotos) else t1
            if hasta > desde:
                f.write("file '%s'\nduration %.4f\n" % (ruta.replace('\\', '/'), hasta - desde))
        f.write("file '%s'\n" % fotos[-1][1].replace('\\', '/'))

    cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lista]
    filtros = []
    for k, pista in enumerate(pistas):
        cmd += ['-i', os.path.join(LOCUCION, clip[pista['t']]['f'])]
        ms = int(round(pista['en'] - meta['t_ini']))
        filtros.append('[%d:a]aresample=48000,adelay=%d|%d[a%d]' % (k + 1, ms, ms, k))
    filtros.append(''.join('[a%d]' % k for k in range(len(pistas))) + 'amix=inputs=%d:normalize=0:dropout_transition=0,apad[voz]' % len(pistas))
    filtros.append('[0:v]fps=30,scale=1920:1080:flags=lanczos,format=yuv420p[v]')
    cmd += ['-filter_complex', ';'.join(filtros), '-map', '[v]', '-map', '[voz]',
            '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-r', '30',
            '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
            '-t', '%.3f' % (t1 - t0), '-movflags', '+faststart', SALIDA]
    subprocess.run(cmd, check=True)
    print('Vídeo: %s · %.1f s · %d KB' % (SALIDA, t1 - t0, os.path.getsize(SALIDA) // 1024))


if __name__ == '__main__':
    main()
