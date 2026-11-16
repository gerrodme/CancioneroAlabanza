<?php
/**
 * Escaleta del culto: la hoja impresa con el orden del culto (cabecera con dos imágenes, una fila de títulos y una tabla
 * con el nombre de cada sección a la izquierda y su contenido a la derecha). El PDF lo genera el navegador
 * (assets/cultos.js); aquí solo se guardan, sanean y sirven los datos.
 *
 * Hay dos piezas:
 *  - La escaleta de CADA CULTO (meta «_pieb_escaleta»): su fila de títulos, sus secciones con sus campos (y sus textos
 *    por defecto) y los valores de ese culto. La estructura se edita en el propio culto y solo le afecta a él. Viaja con
 *    el culto en GET/POST /cultos/{id}.
 *  - La BASE para un culto nuevo (GET /escaleta, para todo el equipo): la estructura de la última escaleta guardada, con
 *    los valores vacíos; si aún no hay ninguna, la plantilla de la iglesia activa (iglesia por defecto: opción
 *    «pieb_can_escaleta», sin autoload; las demás, la meta «_pieb_dato_escaleta» de la iglesia) o la genérica del plugin
 *    (pieb_can_escaleta_generica, con textos traducibles; una iglesia sin plantilla propia usa la genérica, no la de otra).
 *    El logo y la imagen de cabecera son de la iglesia: los guarda quien la gestiona desde Ajustes (POST /ajustes, clave
 *    «escaleta») y valen para todos sus cultos.
 *
 * Cada escaleta lleva un número de versión («version»): la 2 trajo las secciones opcionales «Respuesta» y «Santa Cena», la
 * pregunta «¿cantado o instrumental?» del Preludio y las notas por canción. La interfaz pone al día las anteriores al abrirlas.
 *
 * Los campos son de cuatro tipos: «texto» (una línea), «textoLargo» (varias líneas), «cancion» (una canción del culto o un
 * nombre escrito a mano) y «canciones» (varias). Un valor null significa «aún sin tocar»: la interfaz aplica entonces el
 * defecto del campo al mostrar y al imprimir.
 *
 * Los logos no son partituras: se suben con POST /escaleta/imagen a la biblioteca de medios normal (públicos), NUNCA a la
 * carpeta privada del cancionero (esa subida no pasa por pieb_can_adjuntar, que es quien activa el filtro upload_dir).
 */

if (!defined('ABSPATH')) {
    exit;
}

// Límites: secciones por escaleta, campos por sección, canciones por campo, peso de la imagen y tipos de imagen admitidos.
const PIEB_CAN_ESCALETA_MAX_SECCIONES = 30;
const PIEB_CAN_ESCALETA_MAX_CAMPOS    = 10;
const PIEB_CAN_ESCALETA_MAX_CANCIONES = 100;
const PIEB_CAN_ESCALETA_MAX_IMAGEN    = 2 * 1048576;
const PIEB_CAN_ESCALETA_VERSION       = 2;
const PIEB_CAN_ESCALETA_TIPOS_IMAGEN  = array(
    'jpg|jpeg' => 'image/jpeg',
    'png'      => 'image/png',
);

add_action('rest_api_init', function () {
    // Plantilla de la escaleta: la lee cualquiera del equipo (los cultos las usan); se guarda con POST /ajustes.
    register_rest_route('pieb/v1', '/escaleta', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'pieb_can_rest_escaleta_ver',
        'permission_callback' => 'pieb_can_rest_acceso',
    ));
    register_rest_route('pieb/v1', '/escaleta/imagen', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_escaleta_imagen',
        'permission_callback' => function () { return pieb_can_puede_gestionar(); },
    ));
});

// ---------------------------------------------------------------- plantilla genérica

/**
 * Un campo de la plantilla genérica. Sin defecto indicado: '' en los textos y 'ninguna' en las canciones. $modo: el campo
 * de canciones pregunta si cada una es cantada o instrumental.
 */
function pieb_can_escaleta_campo($id, $tipo, $etiqueta = '', $defecto = null, $pequeno = false, $modo = false) {
    if ($defecto === null) {
        $defecto = in_array($tipo, array('cancion', 'canciones'), true) ? 'ninguna' : '';
    }
    return array('id' => $id, 'tipo' => $tipo, 'etiqueta' => $etiqueta, 'defecto' => $defecto, 'pequeno' => $pequeno, 'modo' => $modo);
}

/** Una sección de la plantilla genérica (sin nota). $opcional: empieza sin incluir en los cultos nuevos. */
function pieb_can_escaleta_seccion($id, $titulo, $campos, $opcional = false) {
    return array('id' => $id, 'titulo' => $titulo, 'nota' => '', 'opcional' => $opcional, 'campos' => $campos);
}

/**
 * Plantilla genérica, sin nada de ninguna iglesia concreta. Está en la forma en que se guarda (logo y cabecera son ids; 0 =
 * sin imagen). Los textos se traducen al llamar a la función, nunca antes de «init».
 */
function pieb_can_escaleta_generica() {
    return array(
        'titulo'    => _x('ORDEN DE CULTO', 'título de la escaleta impresa del culto (se imprime en mayúsculas)', 'pieb-cancionero'),
        'central'   => '',
        'logo'      => 0,
        'cabecera'  => 0,
        'version'   => PIEB_CAN_ESCALETA_VERSION,
        'secciones' => array(
            pieb_can_escaleta_seccion('preludio', _x('PRELUDIO', 'sección de la escaleta del culto (en mayúsculas)', 'pieb-cancionero'), array(
                pieb_can_escaleta_campo('cancion', 'cancion', '', 'primera', false, true),
            )),
            pieb_can_escaleta_seccion('lectura-oracion', _x('LECTURA Y ORACIÓN', 'sección de la escaleta del culto (en mayúsculas)', 'pieb-cancionero'), array(
                pieb_can_escaleta_campo('presidencia', 'texto', _x('Presidencia', 'etiqueta de un campo de la escaleta del culto', 'pieb-cancionero')),
                pieb_can_escaleta_campo('lectura', 'texto', _x('Lectura', 'etiqueta de un campo de la escaleta del culto', 'pieb-cancionero')),
            )),
            pieb_can_escaleta_seccion('bienvenida', _x('BIENVENIDA', 'sección de la escaleta del culto (en mayúsculas)', 'pieb-cancionero'), array(
                pieb_can_escaleta_campo('bienvenida', 'texto', '', __('Bienvenida a todos y a quienes nos visitan', 'pieb-cancionero')),
            )),
            pieb_can_escaleta_seccion('comunidad', _x('VIDA DE COMUNIDAD', 'sección de la escaleta del culto (en mayúsculas)', 'pieb-cancionero'), array(
                pieb_can_escaleta_campo('comunidad', 'textoLargo'),
            )),
            pieb_can_escaleta_seccion('alabanza', _x('CANTOS DE ALABANZA', 'sección de la escaleta del culto (en mayúsculas)', 'pieb-cancionero'), array(
                pieb_can_escaleta_campo('canciones', 'canciones', '', 'ninguna'),
            )),
            pieb_can_escaleta_seccion('ofrenda', _x('OFRENDA', 'sección de la escaleta del culto (en mayúsculas)', 'pieb-cancionero'), array(
                pieb_can_escaleta_campo('musica', 'canciones', _x('Música instrumental', 'etiqueta de un campo de la escaleta del culto', 'pieb-cancionero'), 'siguiente'),
                pieb_can_escaleta_campo('responsables', 'texto', _x('Responsables', 'etiqueta de un campo de la escaleta del culto', 'pieb-cancionero')),
                pieb_can_escaleta_campo('nota', 'texto', '', '', true),
            )),
            pieb_can_escaleta_seccion('ninos', _x('NIÑOS', 'sección de la escaleta del culto (en mayúsculas)', 'pieb-cancionero'), array(
                pieb_can_escaleta_campo('ninos', 'texto', '', __('Los niños pasan a sus clases', 'pieb-cancionero')),
            )),
            pieb_can_escaleta_seccion('predicacion', _x('PREDICACIÓN', 'sección de la escaleta del culto (en mayúsculas)', 'pieb-cancionero'), array(
                pieb_can_escaleta_campo('lectura-biblica', 'texto', _x('Lectura', 'etiqueta de un campo de la escaleta del culto', 'pieb-cancionero')),
                pieb_can_escaleta_campo('titulo', 'texto', _x('Título', 'etiqueta de un campo de la escaleta del culto', 'pieb-cancionero')),
                pieb_can_escaleta_campo('predicacion', 'texto', _x('Predicación', 'etiqueta de un campo de la escaleta del culto', 'pieb-cancionero')),
            )),
            pieb_can_escaleta_seccion('respuesta', _x('POST-SERMÓN', 'sección de la escaleta del culto (en mayúsculas)', 'pieb-cancionero'), array(
                pieb_can_escaleta_campo('cancion', 'cancion', '', 'ninguna', false, true),
                pieb_can_escaleta_campo('respuesta', 'textoLargo'),
            ), true),
            pieb_can_escaleta_seccion('santa-cena', _x('SANTA CENA', 'sección de la escaleta del culto (en mayúsculas)', 'pieb-cancionero'), array(
                pieb_can_escaleta_campo('responsables', 'texto', _x('Responsables', 'etiqueta de un campo de la escaleta del culto', 'pieb-cancionero')),
                pieb_can_escaleta_campo('musica', 'canciones', _x('Música', 'etiqueta de un campo de la escaleta del culto', 'pieb-cancionero'), 'ninguna', false, true),
            ), true),
            pieb_can_escaleta_seccion('despedida', _x('DESPEDIDA', 'sección de la escaleta del culto (en mayúsculas)', 'pieb-cancionero'), array(
                pieb_can_escaleta_campo('despedida', 'textoLargo'),
            )),
            pieb_can_escaleta_seccion('doxologia', _x('DOXOLOGÍA', 'sección de la escaleta del culto (en mayúsculas)', 'pieb-cancionero'), array(
                pieb_can_escaleta_campo('doxologia', 'texto'),
            )),
            pieb_can_escaleta_seccion('postludio', _x('POSTLUDIO', 'sección de la escaleta del culto (en mayúsculas)', 'pieb-cancionero'), array(
                pieb_can_escaleta_campo('postludio', 'canciones', '', 'restantes'),
            )),
        ),
    );
}

// ---------------------------------------------------------------- plantilla guardada

/**
 * Plantilla guardada de la iglesia activa, en la forma en que se guarda (logo y cabecera son ids; «secciones» null = las de
 * la genérica), o null si esa iglesia no tiene nada guardado (la iglesia por defecto la guarda en la opción
 * «pieb_can_escaleta»; las demás, en su meta: ver pieb_can_dato_iglesia).
 */
function pieb_can_escaleta_guardada() {
    $guardada = pieb_can_dato_iglesia('escaleta', 0, null);
    if (!is_array($guardada)) {
        return null;
    }
    $guardada = wp_parse_args($guardada, array('titulo' => '', 'central' => '', 'logo' => 0, 'cabecera' => 0, 'secciones' => null));
    if (!is_array($guardada['secciones'])) {
        $guardada['secciones'] = null;
    }
    return $guardada;
}

/** Guarda la plantilla ya saneada de la iglesia activa; null borra la propia y la iglesia vuelve a la genérica. */
function pieb_can_escaleta_guardar($plantilla) {
    pieb_can_dato_iglesia_guardar('escaleta', 0, $plantilla);
}

/** {id, url} de una imagen de la biblioteca de medios, o null si no hay (o se borró de la biblioteca). */
function pieb_can_escaleta_imagen($id) {
    $id = (int) $id;
    if (!$id) {
        return null;
    }
    $url = wp_get_attachment_image_url($id, 'full');
    return $url ? array('id' => $id, 'url' => $url) : null;
}

/** La plantilla tal como se entrega a la interfaz: la guardada o, si no hay, la genérica, con logo y cabecera como {id, url} o null. */
function pieb_can_escaleta_plantilla() {
    $generica = pieb_can_escaleta_generica();
    $plantilla = pieb_can_escaleta_guardada();
    if ($plantilla === null) {
        $plantilla = $generica;
    }
    return array(
        'titulo'    => (string) ($plantilla['titulo'] !== '' ? $plantilla['titulo'] : $generica['titulo']),
        'central'   => (string) $plantilla['central'],
        'logo'      => pieb_can_escaleta_imagen($plantilla['logo']),
        'cabecera'  => pieb_can_escaleta_imagen($plantilla['cabecera']),
        // Una plantilla guardada antes de la versión 2 no la lleva (0): la interfaz la pone al día.
        'version'   => is_array($plantilla['secciones']) ? (isset($plantilla['version']) ? absint($plantilla['version']) : 0) : $generica['version'],
        'secciones' => array_values(is_array($plantilla['secciones']) ? $plantilla['secciones'] : $generica['secciones']),
    );
}

/**
 * Última escaleta guardada en un culto (el culto modificado más recientemente que tiene una), o null. Solo cuentan los
 * cultos visibles para quien pregunta (su iglesia activa y, si son privados, los suyos: pieb_can_culto_visible).
 */
function pieb_can_escaleta_ultima() {
    $ids = get_posts(array(
        'post_type'      => PIEB_CAN_CULTO,
        'post_status'    => 'publish',
        'posts_per_page' => -1,
        'orderby'        => 'modified',
        'order'          => 'DESC',
        'meta_key'       => '_pieb_escaleta',
        'meta_query'     => array(pieb_can_cultos_meta_iglesia(pieb_can_iglesia_activa())),
        'fields'         => 'ids',
        'no_found_rows'  => true,
    ));
    foreach ($ids as $id) {
        // La privacidad (y la iglesia, por si acaso) se comprueba con la función única de visibilidad.
        if (!pieb_can_culto_visible(get_post((int) $id))) {
            continue;
        }
        $escaleta = pieb_can_culto_escaleta($id);
        if ($escaleta) {
            return array('culto' => (int) $id, 'escaleta' => $escaleta);
        }
    }
    return null;
}

/**
 * Base para la escaleta de un culto nuevo: la estructura de la última escaleta guardada (secciones, campos y textos por
 * defecto, «opcional» y «modo», incluidas las secciones que se añadieron allí, sin «oculta» y sin valores) con su fila de títulos; si aún no
 * hay ninguna, la plantilla. El logo y la cabecera son siempre los de la iglesia activa. «desde» dice de qué culto sale.
 */
function pieb_can_rest_escaleta_ver() {
    $plantilla = pieb_can_escaleta_plantilla();
    $plantilla['desde'] = null;
    $ultima = pieb_can_escaleta_ultima();
    if ($ultima) {
        $e = $ultima['escaleta'];
        $secciones = array();
        foreach ($e['secciones'] as $seccion) {
            $campos = array();
            foreach ((array) $seccion['campos'] as $campo) {
                $campos[] = array(
                    'id'       => $campo['id'],
                    'tipo'     => $campo['tipo'],
                    'etiqueta' => isset($campo['etiqueta']) ? $campo['etiqueta'] : '',
                    'defecto'  => isset($campo['defecto']) ? $campo['defecto'] : '',
                    'pequeno'  => !empty($campo['pequeno']),
                    'modo'     => !empty($campo['modo']),
                );
            }
            $secciones[] = array(
                'id'       => $seccion['id'],
                'titulo'   => $seccion['titulo'],
                'nota'     => isset($seccion['nota']) ? $seccion['nota'] : '',
                'opcional' => !empty($seccion['opcional']),
                'campos'   => $campos,
            );
        }
        if ($secciones) {
            $plantilla['secciones'] = $secciones;
            // La versión es la de la escaleta de la que sale la estructura (sin ella, la interfaz la pone al día).
            $plantilla['version'] = isset($e['version']) ? absint($e['version']) : 0;
        }
        if (isset($e['titulo']) && $e['titulo'] !== '') {
            $plantilla['titulo'] = $e['titulo'];
        }
        if (isset($e['central'])) {
            $plantilla['central'] = $e['central'];
        }
        $plantilla['desde'] = array('id' => $ultima['culto'], 'titulo' => get_the_title($ultima['culto']));
    }
    return rest_ensure_response($plantilla);
}

// ---------------------------------------------------------------- saneado

/** Texto limpio y recortado a $max caracteres; lo que no sea un texto o un número queda vacío. */
function pieb_can_escaleta_texto($valor, $max, $multilinea = false) {
    if (!is_scalar($valor)) {
        return '';
    }
    $valor = $multilinea ? sanitize_textarea_field((string) $valor) : sanitize_text_field((string) $valor);
    return mb_substr(trim($valor), 0, $max);
}

/**
 * Identificador corto ([a-z0-9-]) sacado de $valor; si queda vacío se inventa «<prefijo>-<n>». Si ya está en $usados se le
 * añade «-2», «-3»… y se anota, así que son únicos dentro de su lista.
 */
function pieb_can_escaleta_id($valor, $prefijo, $n, &$usados) {
    $id = is_scalar($valor) ? strtolower(remove_accents((string) $valor)) : '';
    $id = trim(substr(trim(preg_replace('/[^a-z0-9]+/', '-', $id), '-'), 0, 40), '-');
    if ($id === '') {
        $id = $prefijo . '-' . $n;
    }
    $base = $id;
    $sufijo = 2;
    while (isset($usados[$id])) {
        $id = $base . '-' . $sufijo;
        $sufijo++;
    }
    $usados[$id] = true;
    return $id;
}

/** Id de una imagen de la biblioteca para el logo o la cabecera ($valor: id, {id, url} o null); 0 si no es una imagen válida. */
function pieb_can_escaleta_id_imagen($valor) {
    if (is_array($valor)) {
        $valor = isset($valor['id']) ? $valor['id'] : 0;
    }
    $id = is_scalar($valor) ? absint($valor) : 0;
    // Nunca una partitura u otro archivo privado del cancionero: su dirección no se entrega sin sesión.
    if (!$id || get_post_type($id) !== 'attachment' || !wp_attachment_is_image($id) || pieb_can_es_archivo_cancionero($id)) {
        return 0;
    }
    return $id;
}

/** Valores que puede tomar el defecto de un campo de canciones: 'cancion' → primera|siguiente|ninguna; 'canciones' → ninguna|siguiente|restantes. */
function pieb_can_escaleta_limpiar_defecto($tipo, $defecto) {
    if ($tipo === 'cancion') {
        return in_array($defecto, array('primera', 'siguiente', 'ninguna'), true) ? $defecto : 'ninguna';
    }
    if ($tipo === 'canciones') {
        return in_array($defecto, array('ninguna', 'siguiente', 'restantes'), true) ? $defecto : 'ninguna';
    }
    return pieb_can_escaleta_texto($defecto, 500, $tipo === 'textoLargo');
}

/**
 * Una canción del valor de un campo: {cancion: id de canción existente o 0, nombre, nota, instrumental}. Sin nombre se usa el
 * título de la canción. «nota» es un texto de una línea (máx. 200); «instrumental» false = cantada.
 */
function pieb_can_escaleta_limpiar_cancion($entrada) {
    $id = isset($entrada['cancion']) && is_numeric($entrada['cancion']) ? absint($entrada['cancion']) : 0;
    if ($id && get_post_type($id) !== PIEB_CAN_CPT) {
        $id = 0;
    }
    $nombre = pieb_can_escaleta_texto(isset($entrada['nombre']) ? $entrada['nombre'] : '', 200);
    if ($id && $nombre === '') {
        $nombre = mb_substr(html_entity_decode(get_the_title($id), ENT_QUOTES, 'UTF-8'), 0, 200);
    }
    return array(
        'cancion'      => $id,
        'nombre'       => $nombre,
        'nota'         => pieb_can_escaleta_texto(isset($entrada['nota']) ? $entrada['nota'] : '', 200),
        'instrumental' => rest_sanitize_boolean(isset($entrada['instrumental']) ? $entrada['instrumental'] : false),
    );
}

/** Valor de un campo según su tipo (ver arriba); null = aún sin tocar. */
function pieb_can_escaleta_limpiar_valor($tipo, $valor) {
    if ($valor === null) {
        return null;
    }
    if ($tipo === 'texto' || $tipo === 'textoLargo') {
        return is_scalar($valor) ? pieb_can_escaleta_texto($valor, $tipo === 'texto' ? 500 : 2000, $tipo === 'textoLargo') : null;
    }
    if ($tipo === 'cancion') {
        return is_array($valor) ? pieb_can_escaleta_limpiar_cancion($valor) : null;
    }
    if (!is_array($valor)) {
        return null;
    }
    // 'canciones': una lista; las entradas vacías (sin canción ni nombre) no aportan nada.
    $lista = array();
    foreach ($valor as $entrada) {
        if (!is_array($entrada) || count($lista) >= PIEB_CAN_ESCALETA_MAX_CANCIONES) {
            continue;
        }
        $cancion = pieb_can_escaleta_limpiar_cancion($entrada);
        if ($cancion['cancion'] || $cancion['nombre'] !== '') {
            $lista[] = $cancion;
        }
    }
    return $lista;
}

/** Un campo (de la plantilla o, con $de_culto, de la copia de un culto con su valor); null si no es válido (p. ej. un tipo desconocido). */
function pieb_can_escaleta_limpiar_campo($campo, $n, &$ids, $de_culto) {
    if (!is_array($campo)) {
        return null;
    }
    $tipo = isset($campo['tipo']) && is_string($campo['tipo']) ? $campo['tipo'] : '';
    if (!in_array($tipo, array('texto', 'textoLargo', 'cancion', 'canciones'), true)) {
        return null;
    }
    $limpio = array(
        'id'       => pieb_can_escaleta_id(isset($campo['id']) ? $campo['id'] : '', 'campo', $n, $ids),
        'tipo'     => $tipo,
        'etiqueta' => pieb_can_escaleta_texto(isset($campo['etiqueta']) ? $campo['etiqueta'] : '', 60),
        'pequeno'  => rest_sanitize_boolean(isset($campo['pequeno']) ? $campo['pequeno'] : false),
        'defecto'  => pieb_can_escaleta_limpiar_defecto($tipo, isset($campo['defecto']) ? $campo['defecto'] : null),
        // Solo los campos de canciones preguntan si cada una es cantada o instrumental.
        'modo'     => in_array($tipo, array('cancion', 'canciones'), true) && rest_sanitize_boolean(isset($campo['modo']) ? $campo['modo'] : false),
    );
    if ($de_culto) {
        $limpio['valor'] = pieb_can_escaleta_limpiar_valor($tipo, isset($campo['valor']) ? $campo['valor'] : null);
    }
    return $limpio;
}

/**
 * Lista de secciones saneada: como mucho 30 secciones de 10 campos, ids únicos (de las secciones en la lista y de los campos
 * dentro de su sección), textos recortados (título 60, nota 120). Cada sección lleva «opcional»; con $de_culto añade además «oculta» y «extra».
 */
function pieb_can_escaleta_limpiar_secciones($secciones, $de_culto) {
    $limpias = array();
    $ids = array();
    foreach ($secciones as $seccion) {
        if (!is_array($seccion)) {
            continue;
        }
        if (count($limpias) >= PIEB_CAN_ESCALETA_MAX_SECCIONES) {
            break;
        }
        $limpia = array(
            'id'     => pieb_can_escaleta_id(isset($seccion['id']) ? $seccion['id'] : '', 'seccion', count($limpias) + 1, $ids),
            'titulo' => pieb_can_escaleta_texto(isset($seccion['titulo']) ? $seccion['titulo'] : '', 60),
            'nota'   => pieb_can_escaleta_texto(isset($seccion['nota']) ? $seccion['nota'] : '', 120),
            'opcional' => rest_sanitize_boolean(isset($seccion['opcional']) ? $seccion['opcional'] : false),
        );
        if ($de_culto) {
            $limpia['oculta'] = rest_sanitize_boolean(isset($seccion['oculta']) ? $seccion['oculta'] : false);
            $limpia['extra'] = rest_sanitize_boolean(isset($seccion['extra']) ? $seccion['extra'] : false);
        }
        $campos = array();
        $ids_campos = array();
        $lista = isset($seccion['campos']) && is_array($seccion['campos']) ? $seccion['campos'] : array();
        foreach ($lista as $campo) {
            if (count($campos) >= PIEB_CAN_ESCALETA_MAX_CAMPOS) {
                break;
            }
            $limpio = pieb_can_escaleta_limpiar_campo($campo, count($campos) + 1, $ids_campos, $de_culto);
            if ($limpio !== null) {
                $campos[] = $limpio;
            }
        }
        $limpia['campos'] = $campos;
        $limpias[] = $limpia;
    }
    return $limpias;
}

function pieb_can_escaleta_error() {
    return new WP_Error('pieb_escaleta', __('La escaleta no es válida.', 'pieb-cancionero'), array('status' => 400));
}

/**
 * Sanea la plantilla que llega de la interfaz (o de una copia de seguridad). Devuelve la plantilla en la forma en que se
 * guarda, null si $datos es null (= volver a la genérica) o un WP_Error si no tiene la estructura esperada.
 * Logo y cabecera llegan como {id} o null; si la clave no viene se conserva la imagen de $actual (la plantilla guardada).
 */
function pieb_can_escaleta_limpiar_plantilla($datos, $actual = null) {
    if ($datos === null) {
        return null;
    }
    // Desde Ajustes solo llegan el logo y la cabecera: sin «secciones» se conservan las guardadas (o la genérica).
    if (!is_array($datos) || (isset($datos['secciones']) && !is_array($datos['secciones']))) {
        return pieb_can_escaleta_error();
    }
    $imagen = function ($clave) use ($datos, $actual) {
        if (array_key_exists($clave, $datos)) {
            return pieb_can_escaleta_id_imagen($datos[$clave]);
        }
        return $actual && !empty($actual[$clave]) ? (int) $actual[$clave] : 0;
    };
    return array(
        'titulo'    => array_key_exists('titulo', $datos) ? pieb_can_escaleta_texto($datos['titulo'], 60) : ($actual ? (string) $actual['titulo'] : ''),
        'central'   => array_key_exists('central', $datos) ? pieb_can_escaleta_texto($datos['central'], 60) : ($actual ? (string) $actual['central'] : ''),
        'logo'      => $imagen('logo'),
        'cabecera'  => $imagen('cabecera'),
        'version'   => array_key_exists('version', $datos) ? (is_scalar($datos['version']) ? absint($datos['version']) : 0) : ($actual && isset($actual['version']) ? absint($actual['version']) : 0),
        'secciones' => isset($datos['secciones']) ? pieb_can_escaleta_limpiar_secciones($datos['secciones'], false) : ($actual ? $actual['secciones'] : null),
    );
}

/** Sanea la escaleta de un culto: {titulo, central, version, secciones: […]} (null = sin escaleta; WP_Error si no tiene la estructura esperada). */
function pieb_can_escaleta_limpiar_culto($datos) {
    if ($datos === null) {
        return null;
    }
    if (!is_array($datos) || !isset($datos['secciones']) || !is_array($datos['secciones'])) {
        return pieb_can_escaleta_error();
    }
    return array(
        'titulo'    => pieb_can_escaleta_texto(isset($datos['titulo']) ? $datos['titulo'] : '', 60),
        'central'   => pieb_can_escaleta_texto(isset($datos['central']) ? $datos['central'] : '', 60),
        'version'   => isset($datos['version']) && is_scalar($datos['version']) ? absint($datos['version']) : 0,
        'secciones' => pieb_can_escaleta_limpiar_secciones($datos['secciones'], true),
    );
}

// ---------------------------------------------------------------- escaleta de cada culto

/** Escaleta guardada de un culto ({secciones: […]}) o null si ese culto aún no tiene. */
function pieb_can_culto_escaleta($post_id) {
    $escaleta = get_post_meta($post_id, '_pieb_escaleta', true);
    return is_array($escaleta) && isset($escaleta['secciones']) && is_array($escaleta['secciones']) ? $escaleta : null;
}

/** Guarda la escaleta ya saneada de un culto; null la borra. wp_slash porque update_post_meta quita las barras invertidas. */
function pieb_can_escaleta_guardar_culto($post_id, $escaleta) {
    if ($escaleta === null) {
        delete_post_meta($post_id, '_pieb_escaleta');
    } else {
        update_post_meta($post_id, '_pieb_escaleta', wp_slash($escaleta));
    }
}

// ---------------------------------------------------------------- copias de seguridad

/**
 * Aplica $funcion a cada canción ({cancion, nombre, nota, instrumental, …}) de los valores de una escaleta de culto y devuelve la escaleta
 * resultante. Tolera estructuras incompletas: se usa también con datos de una copia de seguridad.
 */
function pieb_can_escaleta_mapear_canciones($escaleta, $funcion) {
    if (!is_array($escaleta) || !isset($escaleta['secciones']) || !is_array($escaleta['secciones'])) {
        return $escaleta;
    }
    foreach ($escaleta['secciones'] as $i => $seccion) {
        if (!is_array($seccion) || !isset($seccion['campos']) || !is_array($seccion['campos'])) {
            continue;
        }
        foreach ($seccion['campos'] as $j => $campo) {
            if (!is_array($campo) || !isset($campo['tipo']) || !isset($campo['valor']) || !is_array($campo['valor'])) {
                continue;
            }
            if ($campo['tipo'] === 'cancion') {
                $escaleta['secciones'][$i]['campos'][$j]['valor'] = call_user_func($funcion, $campo['valor']);
            } elseif ($campo['tipo'] === 'canciones') {
                $lista = array();
                foreach ($campo['valor'] as $entrada) {
                    $lista[] = call_user_func($funcion, is_array($entrada) ? $entrada : array());
                }
                $escaleta['secciones'][$i]['campos'][$j]['valor'] = $lista;
            }
        }
    }
    return $escaleta;
}

/**
 * Plantilla para la copia de seguridad: solo si la instalación tiene una propia (la genérica no se exporta: en otra web
 * quedaría fija en el idioma de quien exportó). Sin las imágenes: sus ids no valen en otra web (van a null).
 */
function pieb_can_escaleta_para_copia() {
    $plantilla = pieb_can_escaleta_guardada();
    if ($plantilla === null) {
        return null;
    }
    return array(
        'titulo'    => (string) $plantilla['titulo'],
        'central'   => (string) $plantilla['central'],
        'logo'      => null,
        'cabecera'  => null,
        'version'   => isset($plantilla['version']) ? absint($plantilla['version']) : 0,
        'secciones' => is_array($plantilla['secciones']) ? array_values($plantilla['secciones']) : null,
    );
}

/**
 * Escaleta de un culto para la copia de seguridad, o null si no tiene. Las canciones del culto se identifican por su
 * identificador estable (uid) y no por su id, que no vale en otra web; $uids es id de canción => uid de las publicadas
 * (las mismas que se exportan). Una canción que no esté ahí se exporta solo con su nombre.
 */
function pieb_can_escaleta_exportar_culto($post_id, $uids) {
    $escaleta = pieb_can_culto_escaleta($post_id);
    if ($escaleta === null) {
        return null;
    }
    return pieb_can_escaleta_mapear_canciones($escaleta, function ($entrada) use ($uids) {
        $id = isset($entrada['cancion']) ? (int) $entrada['cancion'] : 0;
        $nombre = isset($entrada['nombre']) ? (string) $entrada['nombre'] : '';
        $nota = isset($entrada['nota']) && is_scalar($entrada['nota']) ? (string) $entrada['nota'] : '';
        $instrumental = !empty($entrada['instrumental']);
        if ($id && isset($uids[$id])) {
            return array(
                'cancion'      => $uids[$id],
                'nombre'       => $nombre,
                'titulo'       => html_entity_decode(get_the_title($id), ENT_QUOTES, 'UTF-8'),
                'numero'       => (string) get_post_meta($id, '_pieb_numero', true),
                'nota'         => $nota,
                'instrumental' => $instrumental,
            );
        }
        return array('cancion' => '', 'nombre' => $nombre, 'nota' => $nota, 'instrumental' => $instrumental);
    });
}

/**
 * Hace lo contrario al restaurar: cada canción de la copia (uid) se busca en esta web como se hace con las del setlist
 * (por uid o, si no, por título y número). Si no está se queda solo con el nombre escrito a mano. Devuelve la escaleta
 * con ids de esta web, aún sin sanear (pasarla por pieb_can_escaleta_limpiar_culto).
 */
function pieb_can_escaleta_importar_culto($escaleta) {
    return pieb_can_escaleta_mapear_canciones($escaleta, function ($entrada) {
        $texto = function ($clave) use ($entrada) {
            return isset($entrada[$clave]) && is_scalar($entrada[$clave]) ? (string) $entrada[$clave] : '';
        };
        $id = 0;
        if ($texto('cancion') !== '') {
            $id = pieb_can_copia_buscar('cancion', array(
                'uid'    => $texto('cancion'),
                'titulo' => $texto('titulo') !== '' ? $texto('titulo') : $texto('nombre'),
                'numero' => $texto('numero'),
            ));
        }
        return array(
            'cancion'      => $id,
            'nombre'       => $texto('nombre'),
            'nota'         => $texto('nota'),
            'instrumental' => !empty($entrada['instrumental']),
        );
    });
}

// ---------------------------------------------------------------- imágenes de la cabecera

/**
 * Sube el logo o la imagen de cabecera de la escaleta (multipart, campo «archivo»; JPG o PNG, máx. 2 MB) a la biblioteca de
 * medios normal. Responde {id, url}; la interfaz guarda luego el id en la plantilla con «Guardar ajustes».
 */
function pieb_can_rest_escaleta_imagen(WP_REST_Request $request) {
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';

    $files = $request->get_file_params();
    $f = isset($files['archivo']) && is_array($files['archivo']) ? $files['archivo'] : array();
    $error = isset($f['error']) ? (int) $f['error'] : UPLOAD_ERR_NO_FILE;
    $nombre = isset($f['name']) && is_string($f['name']) ? sanitize_file_name($f['name']) : '';

    if (!$f || $error === UPLOAD_ERR_NO_FILE) {
        return new WP_Error('pieb_subida', __('No llegó la imagen.', 'pieb-cancionero'), array('status' => 400));
    }
    if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
        return new WP_Error('pieb_tamano', __('La imagen supera el límite de subida del servidor.', 'pieb-cancionero'), array('status' => 400));
    }
    if ($error !== UPLOAD_ERR_OK || empty($f['tmp_name']) || !is_string($f['tmp_name'])) {
        return new WP_Error('pieb_subida', sprintf(
            /* translators: 1: nombre del archivo, 2: código de error de PHP */
            __('No se pudo subir «%1$s» (error %2$d).', 'pieb-cancionero'),
            $nombre,
            $error
        ), array('status' => 400));
    }
    $tamano = isset($f['size']) ? (int) $f['size'] : 0;
    if ($tamano > PIEB_CAN_ESCALETA_MAX_IMAGEN) {
        return new WP_Error('pieb_tamano', sprintf(
            /* translators: 1: nombre del archivo, 2: tamaño del archivo, 3: tamaño máximo permitido */
            __('«%1$s» pesa %2$s; el máximo es %3$s.', 'pieb-cancionero'),
            $nombre,
            size_format($tamano, 1),
            size_format(PIEB_CAN_ESCALETA_MAX_IMAGEN)
        ), array('status' => 400));
    }

    // Se comprueba el contenido real de la imagen, no solo la extensión.
    $tipo = wp_check_filetype_and_ext($f['tmp_name'], $nombre, PIEB_CAN_ESCALETA_TIPOS_IMAGEN);
    if (empty($tipo['ext']) || empty($tipo['type'])) {
        return new WP_Error('pieb_tipo', sprintf(
            /* translators: %s: nombre del archivo */
            __('«%s» no es una imagen JPG o PNG.', 'pieb-cancionero'),
            $nombre
        ), array('status' => 400));
    }

    $archivo = array(
        'name'     => !empty($tipo['proper_filename']) ? $tipo['proper_filename'] : $nombre,
        'type'     => $tipo['type'],
        'tmp_name' => $f['tmp_name'],
        'error'    => UPLOAD_ERR_OK,
        'size'     => $tamano,
    );
    $titulo = sanitize_text_field(pathinfo($nombre, PATHINFO_FILENAME));
    // A la biblioteca normal (uploads/AAAA/MM): aquí NO está activo el filtro upload_dir de la carpeta privada.
    $id = media_handle_sideload($archivo, 0, null, $titulo !== '' ? array('post_title' => $titulo) : array());
    if (is_wp_error($id)) {
        $id->add_data(array('status' => 400));
        return $id;
    }

    return rest_ensure_response(array('id' => (int) $id, 'url' => (string) wp_get_attachment_image_url($id, 'full')));
}
