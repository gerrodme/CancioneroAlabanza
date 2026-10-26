"""Genera dist/pieb-cancionero-<versión>.zip (p. ej. pieb-cancionero-1.7.4.zip), con el texto de la GPL como license.txt, listo para Plugins → Añadir nuevo → Subir plugin en WordPress.

Uso:  python herramientas/empaquetar.py
"""
import os
import re
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import i18n  # noqa: E402  (compila las traducciones antes de empaquetar)

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(RAIZ, 'pieb-cancionero')
def version():
    with open(os.path.join(PLUGIN, 'pieb-cancionero.php'), encoding='utf-8') as f:
        m = re.search(r"define\('PIEB_CAN_VERSION', '([^']+)'\)", f.read())
    return m.group(1) if m else '?'


def main():
    # Genera los .mo y los JSON de las traducciones (si no hay ningún .po, no hace nada).
    i18n.compilar()
    # La versión va al final del nombre del archivo; dentro del zip la carpeta sigue llamándose «pieb-cancionero/».
    SALIDA = os.path.join(RAIZ, 'dist', 'pieb-cancionero-%s.zip' % version())
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    archivos = 0
    with zipfile.ZipFile(SALIDA, 'w', zipfile.ZIP_DEFLATED) as z:
        for carpeta, _, nombres in os.walk(PLUGIN):
            for nombre in sorted(nombres):
                ruta = os.path.join(carpeta, nombre)
                # Dentro del zip todo cuelga de «pieb-cancionero/», como espera WordPress.
                z.write(ruta, os.path.relpath(ruta, RAIZ).replace(os.sep, '/'))
                archivos += 1
        # La GPL pide entregar su texto con cada copia: va en el zip como license.txt, como en los plugins de WordPress.
        z.write(os.path.join(RAIZ, 'LICENSE'), 'pieb-cancionero/license.txt')
        archivos += 1
    print('Cancionero %s -> %s (%d archivos, %d KB)' % (version(), SALIDA, archivos, os.path.getsize(SALIDA) // 1024))


if __name__ == '__main__':
    main()
