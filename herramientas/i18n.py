"""Herramienta de traducciones del Cancionero (sin PHP ni WP-CLI): extrae los textos, compila y muestra el estado.

Uso (desde la raíz del repositorio; requiere `pip install -r herramientas/requirements.txt`):

    python herramientas/i18n.py extraer    # languages/pieb-cancionero.pot, y actualiza los .po existentes
    python herramientas/i18n.py compilar   # por cada .po: .mo, JSON de JS (formato Jed) y banco-pruebas/i18n/<locale>.js
    python herramientas/i18n.py estado     # porcentaje traducido de cada idioma

Convenciones
------------
* Dominio de texto: «pieb-cancionero». Idioma base de los textos del código: español.
* PHP: __(), _e(), _x(), _n(), _nx(), esc_html__(), esc_attr__(), esc_html_e(), esc_attr_e(), esc_html_x(), esc_attr_x().
  El dominio es obligatorio como último argumento.
* JS: __(), _x(), _n(), _nx() son atajos de cancionero.js (se comparten con los demás archivos como P.__, P._n…) que ya
  llevan el dominio fijado, así que en JS el dominio se puede omitir: __('Texto'), _x('Texto', 'contexto'),
  _n('uno', 'varios', n), _nx('uno', 'varios', n, 'contexto'). Si se indica y no es el nuestro, la llamada se ignora.
* Solo se extraen cadenas literales entre comillas simples o dobles. Para frases con partes variables, usar marcadores
  (sprintf('%1$s de %2$s', …)) en lugar de concatenar.
* Un comentario `/* translators: … */` o `// translators: …` inmediatamente anterior a la llamada pasa al .pot como
  comentario para el traductor.
* Las referencias son `ruta:línea` relativas a `pieb-cancionero/` (las de assets/*.js determinan en qué JSON entra cada texto).

Los .po son lo que edita el traductor (Poedit, Loco Translate…). `compilar` genera lo que carga WordPress:
`pieb-cancionero-<locale>.mo` y, por cada archivo JS, `pieb-cancionero-<locale>-<md5 de "assets/archivo.js">.json`.
"""
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

try:
    import polib
except ImportError:  # pragma: no cover
    sys.exit('Falta polib: pip install -r herramientas/requirements.txt')

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(RAIZ, 'pieb-cancionero')
IDIOMAS = os.path.join(PLUGIN, 'languages')
BANCO_I18N = os.path.join(RAIZ, 'banco-pruebas', 'i18n')
DOMINIO = 'pieb-cancionero'
POT = os.path.join(IDIOMAS, DOMINIO + '.pot')

# Función -> posiciones de los argumentos: (singular/texto, plural, contexto, dominio); None si no lleva ese argumento.
# Para JS, el dominio (siempre el último) puede omitirse.
FUNCIONES = {
    '__': dict(texto=0, plural=None, contexto=None, n=None, dominio=1),
    '_e': dict(texto=0, plural=None, contexto=None, n=None, dominio=1),
    'esc_html__': dict(texto=0, plural=None, contexto=None, n=None, dominio=1),
    'esc_attr__': dict(texto=0, plural=None, contexto=None, n=None, dominio=1),
    'esc_html_e': dict(texto=0, plural=None, contexto=None, n=None, dominio=1),
    'esc_attr_e': dict(texto=0, plural=None, contexto=None, n=None, dominio=1),
    '_x': dict(texto=0, plural=None, contexto=1, n=None, dominio=2),
    'esc_html_x': dict(texto=0, plural=None, contexto=1, n=None, dominio=2),
    'esc_attr_x': dict(texto=0, plural=None, contexto=1, n=None, dominio=2),
    '_n': dict(texto=0, plural=1, contexto=None, n=2, dominio=3),
    '_nx': dict(texto=0, plural=1, contexto=3, n=2, dominio=4),
}
RE_LLAMADA = re.compile(r'(?<![\w$.>:\\])(' + '|'.join(sorted(FUNCIONES, key=len, reverse=True)) + r')\s*\(')
RE_CADENA = re.compile(r"""^(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")$""", re.S)
RE_TRANSLATORS = re.compile(r'(?:/\*+\s*translators:\s*((?s:(?:(?!\*/).)*?))\s*\*/|//\s*translators:\s*([^\n]*?))\s*$', re.I)


# ---------------------------------------------------------------- extracción

def desescapar(crudo, comilla, es_js):
    """Quita los escapes de una cadena literal."""
    if not es_js and comilla == "'":  # PHP entre comillas simples: solo \\ y \'
        return crudo.replace("\\'", "'").replace('\\\\', '\\')
    mapa = {'n': '\n', 't': '\t', 'r': '\r', '\\': '\\', "'": "'", '"': '"', '$': '$', '0': '\0'}

    def sustituir(m):
        e = m.group(1)
        if e[0] == 'u' and len(e) >= 5:
            return chr(int(e[1:5], 16))
        if e[0] == 'x':
            return chr(int(e[1:3], 16))
        return mapa.get(e, '\\' + e)
    return re.sub(r'\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)', sustituir, crudo, flags=re.S)


def separar_argumentos(src, abre):
    """Argumentos (texto crudo) de la llamada cuyo paréntesis abre en src[abre]; respeta cadenas y anidamiento."""
    args, actual, nivel, i, n = [], [], 0, abre + 1, len(src)
    while i < n:
        c = src[i]
        if c in '\'"`':
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == '\\' else 1
            actual.append(src[i:j + 1])
            i = j + 1
            continue
        if c in '([{':
            nivel += 1
        elif c in ')]}':
            if nivel == 0:
                break
            nivel -= 1
        elif c == ',' and nivel == 0:
            args.append(''.join(actual).strip())
            actual = []
            i += 1
            continue
        actual.append(c)
        i += 1
    ultimo = ''.join(actual).strip()
    if ultimo or args:
        args.append(ultimo)
    return [a for k, a in enumerate(args) if a or k < len(args) - 1]


def literal(arg, es_js):
    """Valor de una cadena literal, o None si es una expresión."""
    if arg is None:
        return None
    m = RE_CADENA.match(arg)
    if not m:
        return None
    if m.group(1) is not None:
        return desescapar(m.group(1), "'", es_js)
    return desescapar(m.group(2), '"', es_js)


def comentario_previo(src, inicio):
    """Comentario `translators:` anterior a la llamada: en la misma línea (antes de ella) o justo en las líneas de encima."""
    ini_linea = src.rfind('\n', 0, inicio) + 1
    # En la misma línea, el comentario debe estar justo delante de la llamada (así no se contagia a otras de la línea).
    misma = re.search(r'/\*+\s*translators:\s*((?:(?!\*/).)*?)\s*\*/\s*$', src[ini_linea:inicio], re.S | re.I)
    if misma:
        texto = misma.group(1)
    else:
        m = RE_TRANSLATORS.search(src[max(0, ini_linea - 600):ini_linea])
        if not m:
            return ''
        texto = m.group(1) if m.group(1) is not None else m.group(2)
    return re.sub(r'\s*\n\s*\*?\s*', ' ', texto).strip()


def extraer_de_archivo(ruta, avisos):
    es_js = ruta.endswith('.js')
    rel = os.path.relpath(ruta, PLUGIN).replace(os.sep, '/')
    with open(ruta, encoding='utf-8', newline='') as f:
        src = f.read()
    encontrados = []
    for m in RE_LLAMADA.finditer(src):
        nombre = m.group(1)
        antes = src[max(0, m.start() - 12):m.start()]
        if re.search(r'function\s*&?\s*$', antes):  # definición, no llamada
            continue
        linea = src.count('\n', 0, m.start()) + 1
        args = separar_argumentos(src, m.end() - 1)
        pos = FUNCIONES[nombre]
        if len(args) > pos['dominio']:
            dominio = literal(args[pos['dominio']], es_js)
        elif len(args) == pos['dominio'] and es_js:
            dominio = DOMINIO  # en JS los atajos ya llevan el dominio fijado
        else:
            if not es_js:
                avisos.append('%s:%d: %s() sin dominio de texto' % (rel, linea, nombre))
            continue
        if dominio != DOMINIO:
            continue
        texto = literal(args[pos['texto']], es_js) if pos['texto'] < len(args) else None
        if texto is None:
            avisos.append('%s:%d: %s() con un texto que no es una cadena literal (no se extrae)' % (rel, linea, nombre))
            continue
        plural = literal(args[pos['plural']], es_js) if pos['plural'] is not None and pos['plural'] < len(args) else None
        if pos['plural'] is not None and plural is None:
            avisos.append('%s:%d: %s() con un plural que no es una cadena literal (no se extrae)' % (rel, linea, nombre))
            continue
        contexto = literal(args[pos['contexto']], es_js) if pos['contexto'] is not None and pos['contexto'] < len(args) else None
        if texto == '':
            continue
        encontrados.append(dict(texto=texto, plural=plural, contexto=contexto, ref=(rel, linea),
                                comentario=comentario_previo(src, m.start()), js=es_js))
    return encontrados


def archivos_fuente():
    php, js = [], []
    for carpeta, subs, nombres in os.walk(PLUGIN):
        subs[:] = [d for d in subs if d != 'languages']
        for nombre in sorted(nombres):
            ruta = os.path.join(carpeta, nombre)
            if nombre.endswith('.php'):
                php.append(ruta)
            elif nombre.endswith('.js') and os.path.basename(carpeta) == 'assets':
                js.append(ruta)
    return sorted(php) + sorted(js)


def version():
    with open(os.path.join(PLUGIN, 'pieb-cancionero.php'), encoding='utf-8') as f:
        m = re.search(r"define\('PIEB_CAN_VERSION', '([^']+)'\)", f.read())
    return m.group(1) if m else '?'


def construir_pot(avisos):
    entradas = {}
    for ruta in archivos_fuente():
        for e in extraer_de_archivo(ruta, avisos):
            clave = (e['contexto'] or '', e['texto'])
            if clave not in entradas:
                entradas[clave] = polib.POEntry(msgid=e['texto'], msgctxt=e['contexto'] or None,
                                                msgid_plural=e['plural'] or '', comment='')
                entradas[clave].msgstr_plural = {0: '', 1: ''} if e['plural'] else {}
            ent = entradas[clave]
            if e['ref'] not in ent.occurrences:
                ent.occurrences.append(e['ref'])
            if e['comentario'] and e['comentario'] not in ent.comment:
                ent.comment = (ent.comment + ' ' + e['comentario']).strip()
            if re.search(r'%(\d+\$)?[sd]', e['texto']) and 'php-format' not in ent.flags and 'javascript-format' not in ent.flags:
                ent.flags.append('javascript-format' if e['js'] else 'php-format')
    pot = polib.POFile(wrapwidth=0)
    pot.metadata = {
        'Project-Id-Version': 'Cancionero ' + version(),
        'Report-Msgid-Bugs-To': '',
        'POT-Creation-Date': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M+0000'),
        'MIME-Version': '1.0',
        'Content-Type': 'text/plain; charset=UTF-8',
        'Content-Transfer-Encoding': '8bit',
        'X-Domain': DOMINIO,
    }
    pot.metadata_is_fuzzy = False
    for _, ent in sorted(entradas.items(), key=lambda kv: (kv[1].occurrences[0][0], kv[1].occurrences[0][1])):
        pot.append(ent)
    return pot


def cuerpo_sin_fecha(texto):
    return re.sub(r'"POT-Creation-Date:[^\n]*\n', '', texto)


def extraer():
    os.makedirs(IDIOMAS, exist_ok=True)
    avisos = []
    pot = construir_pot(avisos)
    for a in avisos:
        print('aviso:', a)
    # Si nada ha cambiado (salvo la fecha), no se reescribe para no ensuciar el control de versiones.
    if os.path.exists(POT):
        with open(POT, encoding='utf-8') as f:
            previo = f.read()
        if cuerpo_sin_fecha(previo) == cuerpo_sin_fecha(str(pot)):
            pot = polib.pofile(POT, wrapwidth=0)
            print('%s sin cambios (%d textos)' % (os.path.relpath(POT, RAIZ), len(pot)))
        else:
            pot.save(POT)
            print('%s actualizado (%d textos)' % (os.path.relpath(POT, RAIZ), len(pot)))
    else:
        pot.save(POT)
        print('%s creado (%d textos)' % (os.path.relpath(POT, RAIZ), len(pot)))
    for po_ruta in lista_po():
        po = polib.pofile(po_ruta, wrapwidth=0)
        po.merge(pot)
        po.save(po_ruta)
        print('%s fusionado con la plantilla' % os.path.relpath(po_ruta, RAIZ))


# ---------------------------------------------------------------- compilación

def lista_po():
    if not os.path.isdir(IDIOMAS):
        return []
    return [os.path.join(IDIOMAS, n) for n in sorted(os.listdir(IDIOMAS))
            if n.startswith(DOMINIO + '-') and n.endswith('.po')]


def locale_de(ruta):
    return os.path.basename(ruta)[len(DOMINIO) + 1:-3]


def traducidas(po):
    """Entradas vivas con traducción, no dudosas."""
    return [e for e in po if not e.obsolete and 'fuzzy' not in e.flags and e.translated()]


def entrada_jed(e):
    clave = (e.msgctxt + '\x04' if e.msgctxt else '') + e.msgid
    if e.msgid_plural:
        return clave, [e.msgstr_plural[k] for k in sorted(e.msgstr_plural)]
    return clave, [e.msgstr]


def datos_jed(entradas, locale, po):
    forms = po.metadata.get('Plural-Forms') or 'nplurals=2; plural=(n != 1);'
    mensajes = {'': {'domain': 'messages', 'lang': locale, 'plural-forms': forms}}
    for e in entradas:
        clave, valor = entrada_jed(e)
        mensajes[clave] = valor
    return mensajes


def archivos_js_de(entrada):
    return sorted({ref for ref, _ in entrada.occurrences if ref.startswith('assets/') and ref.endswith('.js')})


def fecha_revision(po, ruta):
    """Fecha de la traducción para los JSON: la cabecera PO-Revision-Date del .po (normalizada) o, si no la tiene,
    la fecha de modificación del .po. Nunca depende de la hora actual, para que compilar sea reproducible."""
    bruta = (po.metadata.get('PO-Revision-Date') or '').strip()
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?\s*([+-]\d{4})?', bruta)
    if m:
        h, mi = m.group(4) or '00', m.group(5) or '00'
        return '%s-%s-%s %s:%s%s' % (m.group(1), m.group(2), m.group(3), h, mi, m.group(6) or '+0000')
    return datetime.fromtimestamp(os.path.getmtime(ruta), timezone.utc).strftime('%Y-%m-%d %H:%M+0000')


def escribir_si_cambia(ruta, contenido):
    """Escribe el archivo (bytes) solo si su contenido cambia, para no tocar su fecha de modificación sin necesidad."""
    if os.path.exists(ruta):
        with open(ruta, 'rb') as f:
            if f.read() == contenido:
                return
    with open(ruta, 'wb') as f:
        f.write(contenido)


def compilar():
    pos = lista_po()
    if not pos:
        print('No hay archivos .po en languages/: nada que compilar.')
        return
    for ruta in pos:
        locale = locale_de(ruta)
        po = polib.pofile(ruta, wrapwidth=0)
        vivas = traducidas(po)
        fecha = fecha_revision(po, ruta)
        escribir_si_cambia(ruta[:-3] + '.mo', po.to_binary())

        por_js = {}
        for e in vivas:
            for js in archivos_js_de(e):
                por_js.setdefault(js, []).append(e)
        prefijo = '%s-%s-' % (DOMINIO, locale)
        nombres = set()
        for js, entradas in sorted(por_js.items()):
            nombre = '%s%s.json' % (prefijo, hashlib.md5(js.encode('utf-8')).hexdigest())
            nombres.add(nombre)
            datos = {
                'translation-revision-date': fecha,
                'generator': 'cancionero-i18n',
                'domain': 'messages',
                'locale_data': {'messages': datos_jed(entradas, locale, po)},
            }
            escribir_si_cambia(os.path.join(IDIOMAS, nombre),
                               json.dumps(datos, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
        # Se borran los JSON anteriores de este idioma que ya no correspondan (archivos JS sin textos).
        for n in os.listdir(IDIOMAS):
            if n.startswith(prefijo) and n.endswith('.json') and n not in nombres:
                os.remove(os.path.join(IDIOMAS, n))

        # Banco de pruebas: todas las cadenas de JS de este idioma en un solo archivo.
        todas_js = [e for e in vivas if archivos_js_de(e)]
        os.makedirs(BANCO_I18N, exist_ok=True)
        cuerpo = ('/* Generado por herramientas/i18n.py compilar: no editar. */\n'
                  'window.PIEB_I18N = %s;\n' % json.dumps({'locale': locale, 'data': datos_jed(todas_js, locale, po)},
                                                         ensure_ascii=False, indent=1))
        escribir_si_cambia(os.path.join(BANCO_I18N, locale + '.js'), cuerpo.encode('utf-8'))
        print('%s: %d textos (%d en JS, %d archivos JSON) -> .mo, .json y banco-pruebas/i18n/%s.js'
              % (locale, len(vivas), len(todas_js), len(por_js), locale))


# ---------------------------------------------------------------- estado

def estado():
    if os.path.exists(POT):
        total_pot = len(polib.pofile(POT, wrapwidth=0))
    else:
        total_pot = 0
    print('Plantilla: %d textos' % total_pot)
    pos = lista_po()
    if not pos:
        print('No hay idiomas todavía (languages/%s-<locale>.po).' % DOMINIO)
        return
    for ruta in pos:
        po = polib.pofile(ruta, wrapwidth=0)
        vivas = [e for e in po if not e.obsolete]
        ok = len(traducidas(po))
        dudosas = len([e for e in vivas if 'fuzzy' in e.flags])
        pct = 100.0 * ok / len(vivas) if vivas else 100.0
        print('%-8s %5.1f %%  (%d de %d traducidos, %d dudosos, %d sin traducir)'
              % (locale_de(ruta), pct, ok, len(vivas), dudosas, len(vivas) - ok - dudosas))


def main():
    acciones = {'extraer': extraer, 'compilar': compilar, 'estado': estado}
    if len(sys.argv) != 2 or sys.argv[1] not in acciones:
        sys.exit('Uso: python herramientas/i18n.py {extraer|compilar|estado}')
    acciones[sys.argv[1]]()


if __name__ == '__main__':
    main()
