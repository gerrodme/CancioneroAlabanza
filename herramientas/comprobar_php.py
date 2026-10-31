"""Comprobación mínima del PHP cuando no hay PHP instalado: paréntesis, llaves y corchetes equilibrados.

Quita comentarios y cadenas y avisa del primer cierre sin abrir o de lo que queda sin cerrar. No sustituye a `php -l`
(no detecta un punto y coma olvidado ni una variable mal escrita), pero caza los errores más típicos al editar a mano.

Uso:  python herramientas/comprobar_php.py [archivo.php …]      (sin argumentos, todos los de pieb-cancionero/)
"""
import glob
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARES = {')': '(', '}': '{', ']': '['}


def comprobar(ruta):
    s = open(ruta, encoding='utf-8').read()
    pila, i, linea, n = [], 0, 1, len(s)
    # Se recorre de izquierda a derecha saltando comentarios, cadenas y el HTML fuera de <?php … ?>.
    en_php = False
    while i < n:
        c = s[i]
        if not en_php:
            j = s.find('<?php', i)
            if j < 0:
                break
            linea += s.count('\n', i, j)
            i, en_php = j + 5, True
            continue
        if s.startswith('?>', i):
            en_php = False
            i += 2
            continue
        if c == '\n':
            linea += 1
        elif s.startswith('/*', i) or s.startswith('//', i) or c == '#':
            fin = s.find('*/', i + 2) + 2 if s.startswith('/*', i) else s.find('\n', i)
            fin = n if fin < (2 if s.startswith('/*', i) else 0) else fin
            if not s.startswith('/*', i):
                cierre = s.find('?>', i, fin)
                fin = cierre if cierre >= 0 else fin
            linea += s.count('\n', i, fin)
            i = fin
            continue
        elif c in '\'"':
            j = i + 1
            while j < n and s[j] != c:
                j += 2 if s[j] == '\\' else 1
            linea += s.count('\n', i, j)
            i = j + 1
            continue
        elif c in '({[':
            pila.append((c, linea))
        elif c in PARES:
            if not pila or pila[-1][0] != PARES[c]:
                return 'cierre «%s» sin abrir hacia la línea %d' % (c, linea)
            pila.pop()
        i += 1
    if pila:
        return 'sin cerrar: ' + ', '.join('«%s» de la línea %d' % p for p in pila[-3:])
    return None


archivos = sys.argv[1:] or sorted(glob.glob(os.path.join(RAIZ, 'pieb-cancionero', '**', '*.php'), recursive=True))
errores = 0
def nombre(ruta):
    try:
        return os.path.relpath(ruta, RAIZ)
    except ValueError:  # otra unidad de disco
        return ruta


for ruta in archivos:
    error = comprobar(ruta)
    print(('MAL  ' if error else 'bien ') + nombre(ruta) + ('  ' + error if error else ''))
    errores += bool(error)
sys.exit(1 if errores else 0)
