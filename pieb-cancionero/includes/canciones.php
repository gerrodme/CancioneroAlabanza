<?php
/**
 * Lectura y escritura de canciones.
 *
 * Metadatos de cada canción:
 *  _pieb_numero     Número en el himnario (texto, opcional)
 *  _pieb_autor      Autor / compositor
 *  _pieb_tonalidad  Tonalidad ORIGINAL de la canción (común a todas las iglesias). La habitual de cada iglesia es otra cosa
 *                   (ver _pieb_ig_{id} y pieb_can_tono_habitual)
 *  _pieb_ig_{id}    Datos de la canción propios de la iglesia {id}: array('tonalidad' => habitual cruda ('' = la original),
 *                   'principal' => id de la partitura principal (0 = el orden guardado), 'notas' => string). Las notas de la
 *                   iglesia por defecto NO van aquí sino en _pieb_notas (ver pieb_can_notas)
 *  _pieb_letra      Letra completa (texto plano; si hay _pieb_letra_html, se deriva de él)
 *  _pieb_letra_html Letra con formato (HTML saneado: solo p, h4, blockquote y, dentro, br, strong, em, u), opcional
 *  _pieb_notas      Notas internas
 *  _pieb_partituras array( array('id' => attachment_id, 'label' => 'Original', 'tonalidad' => 'Sol'), ... )  (mínimo 1, salvo que la canción tenga letra)
 *                   'tonalidad' vacía = la ORIGINAL de la canción (_pieb_tonalidad), no la habitual de una iglesia; las
 *                   entradas antiguas no traen la clave
 *  _pieb_youtube    array( array('url' => '...', 'label' => 'Versión coral'), ... )
 *  _pieb_audios     array( array('id' => attachment_id, 'nombre' => 'Ensayo voces', 'descripcion' => '...'), ... )
 *                   Cada audio es de la iglesia que lo subió ('iglesia'); con 'universal' => 1 (solo lo pone el administrador
 *                   central) lo ven todas (ver pieb_can_audio_visible)
 *  _pieb_editables  array( array('id' => attachment_id, 'descripcion' => 'Arreglo coro'), ... )  (MuseScore, MusicXML…)
 *  Cada elemento de partituras, audios, editables y youtube puede llevar además 'autor' (ID de usuario que lo añadió) e
 *  'iglesia' (ID de la iglesia desde la que se añadió). Si faltan, se completan al leer con quien subió la canción y la
 *  iglesia por defecto (ver pieb_can_con_origen en includes/iglesias.php); lo nuevo ya se guarda con ellos.
 */

if (!defined('ABSPATH')) {
    exit;
}

const PIEB_CAN_TIPOS_PARTITURA = array(
    'pdf'  => 'application/pdf',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png'  => 'image/png',
);

const PIEB_CAN_TIPOS_AUDIO = array(
    'mp3|m4a|m4b' => 'audio/mpeg',
    'ogg|oga'     => 'audio/ogg',
    'wav'         => 'audio/wav',
    'aac'         => 'audio/aac',
);

// Partituras editables de los programas habituales. WordPress no conoce estos formatos: solo se admiten estos
// y se guardan en una carpeta que obliga a descargarlos (ver pieb_can_permitir_editables).
const PIEB_CAN_TIPOS_EDITABLE = array(
    'mscz|mscx'            => 'application/x-musescore',
    'musicxml|mxl|xml'     => 'application/vnd.recordare.musicxml',
    'sib'                  => 'application/x-sibelius-score',
    'mus|musx'             => 'application/x-finale',
    'dorico'               => 'application/x-dorico',
    'gp|gp3|gp4|gp5|gpx'   => 'application/x-guitar-pro',
    'enc'                  => 'application/x-encore',
    'cap|capx'             => 'application/x-capella',
    'ly'                   => 'text/x-lilypond',
    'mid|midi'             => 'audio/midi',
);

// Tamaño máximo por tipo. Los archivos se suben por trozos, así que no dependen del límite de PHP del servidor.
const PIEB_CAN_MAX_PARTITURA = 4 * 1048576;
const PIEB_CAN_MAX_AUDIO = 10 * 1048576;
const PIEB_CAN_MAX_EDITABLE = 10 * 1048576;

/** Tamaño máximo, tipos admitidos, mensaje de error y marca del adjunto de cada clase de archivo. */
function pieb_can_clase_archivo($tipo) {
    if ($tipo === 'audio') {
        return array('max' => PIEB_CAN_MAX_AUDIO, 'tipos' => PIEB_CAN_TIPOS_AUDIO, 'meta' => '_pieb_audio',
            /* translators: %s: nombre del archivo */
            'error' => __('«%s» no es un audio MP3, M4A, OGG, WAV o AAC.', 'pieb-cancionero'));
    }
    if ($tipo === 'editable') {
        return array('max' => PIEB_CAN_MAX_EDITABLE, 'tipos' => PIEB_CAN_TIPOS_EDITABLE, 'meta' => '_pieb_editable',
            /* translators: %s: nombre del archivo */
            'error' => __('«%s» no es una partitura editable (MuseScore, MusicXML, Sibelius, Finale, Dorico, Guitar Pro, Encore, Capella, LilyPond o MIDI).', 'pieb-cancionero'));
    }
    return array('max' => PIEB_CAN_MAX_PARTITURA, 'tipos' => PIEB_CAN_TIPOS_PARTITURA, 'meta' => '_pieb_partitura',
        /* translators: %s: nombre del archivo */
        'error' => __('«%s» no es un PDF ni una imagen JPG/PNG.', 'pieb-cancionero'));
}

function pieb_can_campos_texto() {
    return array(
        'numero'    => '_pieb_numero',
        'autor'     => '_pieb_autor',
        'tonalidad' => '_pieb_tonalidad',
        'tempo'     => '_pieb_tempo',
    );
}

/** Valor limpio de un campo de texto de la canción; el tempo es un número entero de pulsaciones por minuto. */
function pieb_can_valor_campo($campo, $valor) {
    $valor = sanitize_text_field((string) $valor);
    if ($campo === 'tempo') {
        $n = (int) round((float) str_replace(',', '.', $valor));
        return $n >= 20 && $n <= 400 ? (string) $n : '';
    }
    return $valor;
}

function pieb_can_get_partituras($post_id) {
    $items = get_post_meta($post_id, '_pieb_partituras', true);
    if (!is_array($items)) {
        return array();
    }
    // Las entradas antiguas no traen 'label' ni 'tonalidad': se completan siempre.
    $salida = array();
    foreach (array_values($items) as $p) {
        $p = is_array($p) ? $p : array();
        $p['id'] = isset($p['id']) ? (int) $p['id'] : 0;
        $p['label'] = isset($p['label']) ? (string) $p['label'] : '';
        $p['tonalidad'] = isset($p['tonalidad']) ? (string) $p['tonalidad'] : '';
        $salida[] = $p;
    }
    return pieb_can_con_origen($salida, $post_id);
}

/** Clave para comparar tonalidades: sin espacios en los extremos y en minúsculas (sin enarmonías). */
function pieb_can_tono_clave($tono) {
    $tono = trim((string) $tono);
    return function_exists('mb_strtolower') ? mb_strtolower($tono, 'UTF-8') : strtolower($tono);
}

/**
 * Tonalidad efectiva de una partitura: la suya o, si no tiene, la que se pasa como $tono_cancion. Para una partitura
 * ese segundo valor es siempre la ORIGINAL de la canción (_pieb_tonalidad); para un item de culto, la habitual de la iglesia.
 */
function pieb_can_tono_efectivo($partitura, $tono_cancion) {
    $propia = isset($partitura['tonalidad']) ? trim((string) $partitura['tonalidad']) : '';
    return $propia !== '' ? $propia : trim((string) $tono_cancion);
}

// ---------------------------------------------------------------- datos de la canción por iglesia (fase 4a)

/**
 * Datos de la canción propios de una iglesia (0 = la activa): array('tonalidad' => string, 'principal' => int,
 * 'notas' => string). Valores por defecto: '', 0 y ''. Las notas de la iglesia por defecto no se leen de aquí (ver pieb_can_notas).
 */
function pieb_can_cancion_iglesia($post_id, $iglesia_id = 0) {
    $iglesia_id = $iglesia_id ? (int) $iglesia_id : (int) pieb_can_iglesia_activa();
    $m = get_post_meta($post_id, '_pieb_ig_' . $iglesia_id, true);
    $m = is_array($m) ? $m : array();
    return array(
        'tonalidad' => isset($m['tonalidad']) ? (string) $m['tonalidad'] : '',
        'principal' => isset($m['principal']) ? (int) $m['principal'] : 0,
        'notas'     => isset($m['notas']) ? (string) $m['notas'] : '',
    );
}

/**
 * Guarda datos de la canción de una iglesia (0 = la activa): fusiona $cambios (claves tonalidad, principal, notas) con lo
 * que hubiera; si todo queda vacío, borra la meta.
 */
function pieb_can_cancion_iglesia_guardar($post_id, $iglesia_id, $cambios) {
    $iglesia_id = $iglesia_id ? (int) $iglesia_id : (int) pieb_can_iglesia_activa();
    $datos = pieb_can_cancion_iglesia($post_id, $iglesia_id);
    foreach (array('tonalidad', 'principal', 'notas') as $clave) {
        if (array_key_exists($clave, $cambios)) {
            $datos[$clave] = $clave === 'principal' ? (int) $cambios[$clave] : (string) $cambios[$clave];
        }
    }
    if ($datos['tonalidad'] === '' && !$datos['principal'] && $datos['notas'] === '') {
        delete_post_meta($post_id, '_pieb_ig_' . $iglesia_id);
    } else {
        update_post_meta($post_id, '_pieb_ig_' . $iglesia_id, $datos);
    }
}

/**
 * Notas de la canción para una iglesia (0 = la activa). La iglesia por defecto sigue usando la meta de siempre,
 * _pieb_notas (sin migración; con una sola iglesia nada cambia); las demás, 'notas' de _pieb_ig_{id}.
 */
function pieb_can_notas($post_id, $iglesia_id = 0) {
    $iglesia_id = $iglesia_id ? (int) $iglesia_id : (int) pieb_can_iglesia_activa();
    if ($iglesia_id === (int) pieb_can_iglesia_defecto()) {
        return (string) get_post_meta($post_id, '_pieb_notas', true);
    }
    return pieb_can_cancion_iglesia($post_id, $iglesia_id)['notas'];
}

/** Guarda las notas de la canción de una iglesia (0 = la activa), ya saneadas aquí; ver pieb_can_notas. */
function pieb_can_notas_guardar($post_id, $iglesia_id, $texto) {
    $iglesia_id = $iglesia_id ? (int) $iglesia_id : (int) pieb_can_iglesia_activa();
    $texto = sanitize_textarea_field((string) $texto);
    if ($iglesia_id === (int) pieb_can_iglesia_defecto()) {
        update_post_meta($post_id, '_pieb_notas', $texto);
        return;
    }
    pieb_can_cancion_iglesia_guardar($post_id, $iglesia_id, array('notas' => $texto));
}

/**
 * Tonalidad habitual de la canción en una iglesia (0 = la activa): la de _pieb_ig_{id} si no está vacía y coincide con alguna
 * de las tonalidades en que hay partitura; si no, la ORIGINAL (_pieb_tonalidad, tal cual está guardada).
 */
function pieb_can_tono_habitual($post_id, $iglesia_id = 0, $partituras = null) {
    $original = (string) get_post_meta($post_id, '_pieb_tonalidad', true);
    $propia = trim(pieb_can_cancion_iglesia($post_id, $iglesia_id)['tonalidad']);
    if ($propia === '') {
        return $original;
    }
    $k = pieb_can_tono_clave($propia);
    foreach ($partituras === null ? pieb_can_get_partituras($post_id) : $partituras as $p) {
        $t = pieb_can_tono_efectivo($p, $original);
        if (pieb_can_tono_clave($t) === $k) {
            return $t;
        }
    }
    return $original;
}

/**
 * Partituras de la canción para la iglesia activa: con la partitura principal de esa iglesia (si es una que la canción aún
 * tiene) la primera y el resto en su orden; si no, el orden guardado. El guardado de la canción usa pieb_can_get_partituras,
 * no esta función, para no alterar el orden que fijó quien creó la canción.
 */
function pieb_can_partituras_iglesia($post_id, $iglesia_id = 0, $lista = null) {
    $lista = $lista === null ? pieb_can_get_partituras($post_id) : $lista;
    $principal = pieb_can_cancion_iglesia($post_id, $iglesia_id)['principal'];
    if ($principal) {
        foreach ($lista as $i => $p) {
            if ((int) $p['id'] === $principal) {
                if ($i > 0) {
                    array_splice($lista, $i, 1);
                    array_unshift($lista, $p);
                }
                break;
            }
        }
    }
    return $lista;
}

/**
 * Tonalidades distintas (efectivas, con la original como base de las partituras sin tonalidad) de las partituras de una
 * canción, sin vacías: primero la habitual de la iglesia activa (si hay partitura en ella), luego las demás por orden de
 * aparición. Cada una con el texto de su primera aparición.
 */
function pieb_can_tonalidades($post_id, $iglesia_id = 0, $partituras = null) {
    $original = trim((string) get_post_meta($post_id, '_pieb_tonalidad', true));
    $partituras = $partituras === null ? pieb_can_get_partituras($post_id) : $partituras;
    $vistas = array();
    foreach ($partituras as $p) {
        $t = pieb_can_tono_efectivo($p, $original);
        $k = pieb_can_tono_clave($t);
        if ($k !== '' && !isset($vistas[$k])) {
            $vistas[$k] = $t;
        }
    }
    $hk = pieb_can_tono_clave(pieb_can_tono_habitual($post_id, $iglesia_id, $partituras));
    $salida = array();
    if ($hk !== '' && isset($vistas[$hk])) {
        $salida[] = $vistas[$hk];
        unset($vistas[$hk]);
    }
    return array_merge($salida, array_values($vistas));
}

function pieb_can_get_audios($post_id) {
    $items = get_post_meta($post_id, '_pieb_audios', true);
    return pieb_can_con_origen(is_array($items) ? array_values($items) : array(), $post_id);
}

/**
 * ¿Ve el usuario (0 = el actual) este audio? Sin protección activa (una sola iglesia), siempre. Con ella, si el audio es
 * universal o es de la iglesia activa del usuario. ÚNICO sitio que decide la visibilidad de un audio por iglesia.
 */
function pieb_can_audio_visible($audio, $user_id = 0, $activa = 0) {
    if (!pieb_can_proteccion_activa()) {
        return true;
    }
    if (!empty($audio['universal'])) {
        return true;
    }
    $iglesia = !empty($audio['iglesia']) ? (int) $audio['iglesia'] : (int) pieb_can_iglesia_defecto();
    return $iglesia === ($activa ? (int) $activa : (int) pieb_can_iglesia_activa($user_id));
}

/** Audios de la canción que ve el usuario actual (ver pieb_can_audio_visible). */
function pieb_can_get_audios_visibles($post_id, $activa = 0) {
    $salida = array();
    foreach (pieb_can_get_audios($post_id) as $a) {
        if (pieb_can_audio_visible($a, 0, $activa)) {
            $salida[] = $a;
        }
    }
    return $salida;
}

function pieb_can_get_editables($post_id) {
    $items = get_post_meta($post_id, '_pieb_editables', true);
    return pieb_can_con_origen(is_array($items) ? array_values($items) : array(), $post_id);
}

function pieb_can_get_youtube($post_id) {
    $items = get_post_meta($post_id, '_pieb_youtube', true);
    return pieb_can_con_origen(is_array($items) ? array_values($items) : array(), $post_id);
}

function pieb_can_youtube_id($url) {
    if (preg_match('~(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})~', $url, $m)) {
        return $m[1];
    }
    return '';
}

// Paleta de las etiquetas (la misma que COLORES_ETIQUETA en cancionero.js).
const PIEB_CAN_COLORES_ETIQUETA = array('#2f6fd6', '#d4553f', '#2e9e6b', '#8a4fd0', '#d4890f', '#1f8fa3', '#c2407a', '#5c6bc0', '#7a8f1f', '#a0522d', '#0f766e', '#b45309');

// Cada etiqueta recibe un color al crearse: el menos usado de la paleta, para que las etiquetas se distingan.
add_action('created_' . PIEB_CAN_TAX, 'pieb_can_asignar_color_etiqueta');

function pieb_can_asignar_color_etiqueta($term_id) {
    $ids = get_terms(array('taxonomy' => PIEB_CAN_TAX, 'hide_empty' => false, 'fields' => 'ids'));
    $usados = array();
    foreach (is_array($ids) ? $ids : array() as $id) {
        $color = get_term_meta($id, 'pieb_color', true);
        if ($color) {
            $usados[$color] = isset($usados[$color]) ? $usados[$color] + 1 : 1;
        }
    }
    $elegido = PIEB_CAN_COLORES_ETIQUETA[0];
    $minimo = PHP_INT_MAX;
    foreach (PIEB_CAN_COLORES_ETIQUETA as $color) {
        $n = isset($usados[$color]) ? $usados[$color] : 0;
        if ($n < $minimo) {
            $minimo = $n;
            $elegido = $color;
        }
    }
    update_term_meta($term_id, 'pieb_color', $elegido);
    return $elegido;
}

// Lectura de etiquetas (visibles por iglesia, colores) y su escritura: includes/etiquetas.php.

/** Regla de borrado de cultos (y la de canciones mientras haya una sola iglesia): su autor o quien gestiona. */
function pieb_can_usuario_puede_borrar($post) {
    return pieb_can_puede_gestionar() || (int) $post->post_author === get_current_user_id();
}

// ---------------------------------------------------------------- permisos sobre lo ajeno en una canción
// Con varias iglesias cualquiera puede AÑADIR a una canción, pero no cambiar ni quitar lo que añadió otra persona.
// Con una sola iglesia (pieb_can_proteccion_activa() falso) estas funciones permiten todo, salvo borrar, que mantiene
// su regla de siempre. Es el único sitio donde se decide cada permiso: el guardado y la API usan estas funciones.

/** ¿Es el usuario (0 = el actual) quien subió la canción? */
function pieb_can_es_creador($post, $user_id = 0) {
    $user_id = $user_id ? (int) $user_id : get_current_user_id();
    return $user_id && (int) $post->post_author === $user_id;
}

/** Quién rellenó cada campo: array( campo => user_id ) (meta _pieb_campos_autor). Lo que no figura lo rellenó el creador. */
function pieb_can_campos_autor($post_id) {
    $mapa = get_post_meta($post_id, '_pieb_campos_autor', true);
    return is_array($mapa) ? $mapa : array();
}

/** Anota al usuario actual como autor de los campos que acaban de cambiar de valor. */
function pieb_can_registrar_campos_autor($post_id, $campos) {
    if (!$campos) {
        return;
    }
    $mapa = pieb_can_campos_autor($post_id);
    foreach ($campos as $campo) {
        $mapa[$campo] = get_current_user_id();
    }
    update_post_meta($post_id, '_pieb_campos_autor', $mapa);
}

/** Valor actual guardado de un campo: 'titulo' o uno de pieb_can_campos_texto(). */
function pieb_can_valor_actual_campo($campo, $post) {
    if ($campo === 'titulo') {
        return (string) $post->post_title;
    }
    $campos = pieb_can_campos_texto();
    return isset($campos[$campo]) ? (string) get_post_meta($post->ID, $campos[$campo], true) : '';
}

/** ¿Puede el usuario cambiar o quitar este partitura, audio, editable o enlace? Su autor o el central. */
function pieb_can_puede_elemento($elemento, $post) {
    if (!pieb_can_proteccion_activa() || pieb_can_es_central()) {
        return true;
    }
    $autor = !empty($elemento['autor']) ? (int) $elemento['autor'] : (int) $post->post_author;
    return $autor === get_current_user_id();
}

/**
 * ¿Puede el usuario (0 = el actual) cambiar o quitar este audio? Un audio universal, solo el central. Uno de iglesia, su autor
 * (el de la canción si falta), quien administra la iglesia del audio o el central. Sin protección activa, siempre.
 */
function pieb_can_puede_audio($audio, $post, $user_id = 0) {
    if (!pieb_can_proteccion_activa()) {
        return true;
    }
    $user_id = $user_id ? (int) $user_id : get_current_user_id();
    if (pieb_can_es_central($user_id)) {
        return true;
    }
    if (!empty($audio['universal'])) {
        return false;
    }
    $autor = !empty($audio['autor']) ? (int) $audio['autor'] : (int) $post->post_author;
    if ($autor === $user_id) {
        return true;
    }
    $iglesia = !empty($audio['iglesia']) ? (int) $audio['iglesia'] : (int) pieb_can_iglesia_defecto();
    return pieb_can_es_admin_iglesia($iglesia, $user_id);
}

/** ¿Puede el usuario cambiar el valor de un campo (titulo, numero, autor, tonalidad, tempo)? Uno vacío lo rellena cualquiera. */
function pieb_can_puede_campo($campo, $post) {
    if (!pieb_can_proteccion_activa() || pieb_can_es_central() || pieb_can_es_creador($post)) {
        return true;
    }
    if (trim(pieb_can_valor_actual_campo($campo, $post)) === '') {
        return true;
    }
    $mapa = pieb_can_campos_autor($post->ID);
    return isset($mapa[$campo]) && (int) $mapa[$campo] === get_current_user_id();
}

/** ¿Tiene la canción alguna letra (plana o con formato)? */
function pieb_can_tiene_letra($post) {
    return trim((string) get_post_meta($post->ID, '_pieb_letra', true)) !== ''
        || trim((string) get_post_meta($post->ID, '_pieb_letra_html', true)) !== '';
}

/** ¿Puede el usuario cambiar la letra? Si no hay, cualquiera la añade; si ya hay, el creador o el central. */
function pieb_can_puede_letra($post) {
    if (!pieb_can_proteccion_activa() || pieb_can_es_central() || pieb_can_es_creador($post)) {
        return true;
    }
    return !pieb_can_tiene_letra($post);
}

/** ¿Puede el usuario cambiar el orden de las partituras (la primera es la principal)? El creador o el central. */
function pieb_can_puede_ordenar($post) {
    return !pieb_can_proteccion_activa() || pieb_can_es_central() || pieb_can_es_creador($post);
}

/** ¿Puede el usuario borrar la canción? Con varias iglesias, su creador o el central; con una, la regla de siempre. */
function pieb_can_puede_borrar_cancion($post) {
    if (!pieb_can_proteccion_activa()) {
        return pieb_can_usuario_puede_borrar($post);
    }
    return pieb_can_es_central() || pieb_can_es_creador($post);
}

/** Permisos del usuario sobre una canción, para la interfaz (campo vacío = siempre permitido). */
function pieb_can_permisos_cancion($post) {
    $campos = array();
    foreach (array('titulo', 'numero', 'autor', 'tonalidad', 'tempo') as $campo) {
        $campos[$campo] = pieb_can_puede_campo($campo, $post);
    }
    $campos['letra'] = pieb_can_puede_letra($post);
    return array(
        'campos'  => $campos,
        'ordenar' => pieb_can_puede_ordenar($post),
        'borrar'  => pieb_can_puede_borrar_cancion($post),
    );
}

/** Valores finales de los campos de texto al guardar: el recibido si puede cambiarlo; si no, el que ya tiene. */
function pieb_can_valores_campos($post, WP_REST_Request $request) {
    $valores = array();
    foreach (array_keys(pieb_can_campos_texto()) as $campo) {
        $valores[$campo] = pieb_can_puede_campo($campo, $post)
            ? pieb_can_valor_campo($campo, $request->get_param($campo))
            : pieb_can_valor_actual_campo($campo, $post);
    }
    return $valores;
}

/**
 * Fusiona los elementos que propone quien guarda con los que ya hay, conservando los que no puede cambiar.
 * $actuales: lo guardado; $propuestos: lo que llega ya limpio (puede traer elementos nuevos); $clave: función que da la
 * identidad de un elemento (id del adjunto o URL). Un elemento ajeno se conserva tal cual esté o no en lo recibido y
 * venga como venga. $orden_libre = false: los que ya existían mantienen su orden y los nuevos van al final.
 * Sin la protección activa devuelve $propuestos sin tocar. $puede (opcional): función que dice si quien guarda puede cambiar
 * un elemento existente; por defecto pieb_can_puede_elemento. Para los audios, ver pieb_can_puede_cambiar_audio.
 */
function pieb_can_fusionar_elementos($actuales, $propuestos, $clave, $post, $orden_libre = true, $puede = null) {
    if (!pieb_can_proteccion_activa()) {
        return $propuestos;
    }
    if ($puede === null) {
        $puede = function ($e) use ($post) {
            return pieb_can_puede_elemento($e, $post);
        };
    }
    $existentes = array();
    foreach ($actuales as $a) {
        $k = $clave($a);
        if (!isset($existentes[$k])) {
            $existentes[$k] = $a;
        }
    }

    $resultado = array();
    $vistos = array();
    foreach ($propuestos as $p) {
        $k = $clave($p);
        if (!isset($existentes[$k])) {
            $resultado[] = $p; // nuevo
        } elseif (!isset($vistos[$k])) {
            $vistos[$k] = true;
            $resultado[] = $puede($existentes[$k]) ? $p : $existentes[$k];
        }
    }

    // Los ajenos que no venían en lo recibido se conservan, en su posición de origen en la medida de lo posible.
    foreach ($actuales as $i => $a) {
        $k = $clave($a);
        if (!isset($vistos[$k]) && $existentes[$k] === $a && !$puede($a)) {
            $vistos[$k] = true;
            array_splice($resultado, min($i, count($resultado)), 0, array($a));
        }
    }

    if (!$orden_libre) {
        $por_clave = array();
        $nuevos = array();
        foreach ($resultado as $r) {
            $k = $clave($r);
            if (isset($existentes[$k])) {
                $por_clave[$k] = $r;
            } else {
                $nuevos[] = $r;
            }
        }
        $resultado = array();
        foreach ($actuales as $a) {
            $k = $clave($a);
            if (isset($por_clave[$k])) {
                $resultado[] = $por_clave[$k];
                unset($por_clave[$k]);
            }
        }
        $resultado = array_merge($resultado, $nuevos);
    }
    return $resultado;
}

/** Nombre para mostrar de un usuario ('' si ya no existe). */
function pieb_can_nombre_usuario($user_id) {
    $u = $user_id ? get_userdata((int) $user_id) : false;
    return $u ? (string) $u->display_name : '';
}

/**
 * ¿Puede quien guarda cambiar o quitar este audio al guardar la canción? Solo si lo ve (los de otras iglesias se tratan como
 * ajenos y se conservan tal cual) y puede cambiarlo (pieb_can_puede_audio).
 */
function pieb_can_puede_cambiar_audio($audio, $post) {
    return pieb_can_audio_visible($audio) && pieb_can_puede_audio($audio, $post);
}

/** Añade 'mio' y 'autorNombre' a un elemento que se devuelve por la API. */
function pieb_can_marcar_elemento($salida, $elemento, $post) {
    $salida['mio'] = pieb_can_puede_elemento($elemento, $post);
    $salida['autorNombre'] = pieb_can_nombre_usuario(isset($elemento['autor']) ? $elemento['autor'] : 0);
    return $salida;
}

/**
 * Sanea el HTML de una letra con formato. Forma resultante: hijos de primer nivel p, h4 o blockquote; dentro,
 * solo texto, br, strong, em y u; sin atributos. b pasa a strong e i a em.
 */
function pieb_can_letra_html_limpiar($html) {
    $html = (string) $html;
    $html = preg_replace('#<(/?)b(\s[^>]*)?>#i', '<$1strong>', $html);
    $html = preg_replace('#<(/?)i(\s[^>]*)?>#i', '<$1em>', $html);
    $html = wp_kses($html, array(
        'p'          => array(),
        'br'         => array(),
        'strong'     => array(),
        'em'         => array(),
        'u'          => array(),
        'h4'         => array(),
        'blockquote' => array(),
    ));
    // Fuera los espacios y saltos de línea que quedan entre bloques.
    $html = preg_replace('#(</(?:p|h4|blockquote)>|<blockquote>)\s+(?=<)#i', '$1', $html);
    $html = trim($html);
    return pieb_can_letra_html_a_texto($html) === '' ? '' : $html;
}

/**
 * Texto plano de una letra con formato: cada p/h4 es una línea (br = salto), <p></p> una línea vacía, y las líneas
 * de un blockquote son líneas normales. Sin etiquetas y con las entidades decodificadas.
 */
function pieb_can_letra_html_a_texto($html) {
    $html = (string) $html;
    $html = preg_replace('#(</(?:p|h4|blockquote)>|<blockquote>)\s+(?=<)#i', '$1', $html);
    $html = preg_replace('#<br\s*/?>#i', "\n", $html);
    $html = preg_replace('#</blockquote>|<blockquote>#i', '', $html);
    $html = preg_replace('#</(?:p|h4)>#i', "\x01", $html);
    $texto = html_entity_decode(wp_strip_all_tags($html), ENT_QUOTES, 'UTF-8');
    $lineas = explode("\x01", $texto);
    // Lo que queda tras el último cierre de bloque no es una línea.
    if (count($lineas) > 1 && trim(end($lineas)) === '') {
        array_pop($lineas);
    }
    $lineas = array_map(function ($l) {
        return rtrim(str_replace("\r", '', $l));
    }, $lineas);
    return trim(implode("\n", $lineas), "\n ");
}

/**
 * Guarda la letra de una canción según lo recibido. $letra_html es null si el cliente no mandó el campo.
 * Con HTML válido, la letra plana se deriva de él; con '' se borra el HTML; sin campo, se conserva el HTML solo si
 * sigue coincidiendo con el texto recibido.
 */
function pieb_can_guardar_letra($post_id, $letra, $letra_html) {
    $norm = function ($t) {
        $t = str_replace(array("\r\n", "\r"), "\n", (string) $t);
        return rtrim(preg_replace('/[ \t]+(?=\n|$)/', '', $t));
    };
    $html = $letra_html === null ? null : pieb_can_letra_html_limpiar($letra_html);
    if ($html !== null && $html !== '') {
        update_post_meta($post_id, '_pieb_letra_html', $html);
        update_post_meta($post_id, '_pieb_letra', sanitize_textarea_field(pieb_can_letra_html_a_texto($html)));
        return;
    }
    $plano = sanitize_textarea_field((string) $letra);
    if ($html === null) {
        $actual = (string) get_post_meta($post_id, '_pieb_letra_html', true);
        if ($actual !== '' && $norm(pieb_can_letra_html_a_texto($actual)) === $norm($plano)) {
            return; // el HTML sigue siendo la fuente y no hay nada que cambiar
        }
    }
    delete_post_meta($post_id, '_pieb_letra_html');
    update_post_meta($post_id, '_pieb_letra', $plano);
}

/** Datos ligeros para el listado y la búsqueda. $activa: iglesia activa ya calculada (0 = se calcula aquí). */
function pieb_can_resumen($post, $activa = 0) {
    // La partitura principal de la iglesia activa va la primera; el resto, en su orden.
    $activa = $activa ? (int) $activa : (int) pieb_can_iglesia_activa();
    $todas = pieb_can_get_partituras($post->ID);
    $partituras = pieb_can_partituras_iglesia($post->ID, $activa, $todas);
    $thumb = '';
    if ($partituras) {
        $thumb = pieb_can_url_miniatura($partituras[0]['id'], 'medium');
    }

    $etiquetas = pieb_can_etiquetas_visibles($post->ID, $activa);
    $universales = array();
    if (pieb_can_proteccion_activa()) {
        foreach ($etiquetas as $t) {
            if (pieb_can_etiqueta_es_universal($t)) {
                $universales[] = $t->name;
            }
        }
    }

    return array(
        'id'          => $post->ID,
        'titulo'      => html_entity_decode(get_the_title($post), ENT_QUOTES, 'UTF-8'),
        'numero'      => (string) get_post_meta($post->ID, '_pieb_numero', true),
        'autor'       => (string) get_post_meta($post->ID, '_pieb_autor', true),
        // La habitual de la iglesia activa (con una sola iglesia, igual que la original) y la original de la canción.
        'tonalidad'   => pieb_can_tono_habitual($post->ID, $activa, $todas),
        'tonalidadOriginal' => (string) get_post_meta($post->ID, '_pieb_tonalidad', true),
        'tempo'       => (string) get_post_meta($post->ID, '_pieb_tempo', true),
        'etiquetas'   => array_values(wp_list_pluck($etiquetas, 'name')),
        // Las etiquetas universales (de todas las iglesias) entre las anteriores; vacío con una sola iglesia.
        'etiquetasUniversales' => $universales,
        'letra'       => (string) get_post_meta($post->ID, '_pieb_letra', true),
        'partituras'  => count($partituras),
        'youtube'     => count(pieb_can_get_youtube($post->ID)),
        'audios'      => count(pieb_can_get_audios_visibles($post->ID, $activa)),
        'editables'   => count(pieb_can_get_editables($post->ID)),
        'miniatura'   => $thumb ? $thumb : '',
        // Versiones (partituras) de la canción, solo si hay más de una: el setlist deja elegir cuál usar.
        'variantes'   => count($partituras) > 1 ? array_map(function ($p) {
            return array('id' => (int) $p['id'], 'label' => (string) $p['label'], 'tonalidad' => (string) $p['tonalidad']);
        }, $partituras) : array(),
        // Tonalidades en las que hay partitura (ver pieb_can_tonalidades): el setlist deja elegir una.
        'tonalidades' => pieb_can_tonalidades($post->ID, $activa, $todas),
        'creada'      => get_post_time('c', true, $post),
        'modificada'  => get_post_modified_time('c', true, $post),
    );
}

/** Ficha completa de una canción. */
function pieb_can_detalle($post) {
    $datos = pieb_can_resumen($post);

    $datos['notas'] = pieb_can_notas($post->ID);
    $datos['letraHtml'] = (string) get_post_meta($post->ID, '_pieb_letra_html', true);

    // «orden» es la posición de cada partitura en el orden guardado (el que fijó quien creó la canción): la lista se entrega
    // con la principal de la iglesia la primera, y el formulario necesita el orden real para no alterarlo al guardar.
    $orden_guardado = array();
    foreach (pieb_can_get_partituras($post->ID) as $i => $p) {
        $orden_guardado[(int) $p['id']] = $i;
    }
    $datos['partituras'] = array();
    foreach (pieb_can_partituras_iglesia($post->ID) as $p) {
        $file = get_attached_file($p['id']);
        if (!$file) {
            continue;
        }
        $url = pieb_can_url_archivo($p['id']);
        $datos['partituras'][] = pieb_can_marcar_elemento(array(
            'id'        => (int) $p['id'],
            'label'     => (string) $p['label'],
            'tonalidad' => (string) $p['tonalidad'],
            'url'       => $url,
            'tipo'      => get_post_mime_type($p['id']) === 'application/pdf' ? 'pdf' : 'imagen',
            'archivo'   => $file ? wp_basename($file) : '',
            'miniatura' => pieb_can_url_miniatura($p['id'], 'large'),
            'autor'     => (int) $p['autor'],
            'iglesia'   => (int) $p['iglesia'],
            'orden'     => isset($orden_guardado[(int) $p['id']]) ? $orden_guardado[(int) $p['id']] : 0,
        ), $p, $post);
    }

    $datos['audios'] = array();
    $nombres_iglesia = array();
    foreach (pieb_can_get_audios_visibles($post->ID) as $a) {
        $file = get_attached_file($a['id']);
        if (!$file) {
            continue;
        }
        $url = pieb_can_url_archivo($a['id']);
        $meta = wp_get_attachment_metadata($a['id']);
        if (!isset($nombres_iglesia[(int) $a['iglesia']])) {
            $nombres_iglesia[(int) $a['iglesia']] = pieb_can_iglesia_nombre((int) $a['iglesia']);
        }
        $audio = pieb_can_marcar_elemento(array(
            'id'          => (int) $a['id'],
            'nombre'      => (string) $a['nombre'],
            'descripcion' => (string) $a['descripcion'],
            'url'         => $url,
            'archivo'     => $file ? wp_basename($file) : '',
            'duracion'    => is_array($meta) && !empty($meta['length_formatted']) ? $meta['length_formatted'] : '',
            'autor'       => (int) $a['autor'],
            'iglesia'     => (int) $a['iglesia'],
            'universal'   => !empty($a['universal']),
            'iglesiaNombre' => $nombres_iglesia[(int) $a['iglesia']],
        ), $a, $post);
        // Quien puede cambiar un audio lo decide pieb_can_puede_audio (no la regla general de los elementos).
        $audio['mio'] = pieb_can_puede_audio($a, $post);
        $datos['audios'][] = $audio;
    }

    $datos['editables'] = array();
    foreach (pieb_can_get_editables($post->ID) as $e) {
        $file = get_attached_file($e['id']);
        if (!$file) {
            continue;
        }
        $url = pieb_can_url_archivo($e['id']);
        $datos['editables'][] = pieb_can_marcar_elemento(array(
            'id'          => (int) $e['id'],
            'descripcion' => (string) $e['descripcion'],
            'url'         => $url,
            'archivo'     => wp_basename($file),
            'tamano'      => file_exists($file) ? (int) filesize($file) : 0,
            'autor'       => (int) $e['autor'],
            'iglesia'     => (int) $e['iglesia'],
        ), $e, $post);
    }

    $datos['youtube'] = array();
    foreach (pieb_can_get_youtube($post->ID) as $y) {
        $datos['youtube'][] = pieb_can_marcar_elemento(array(
            'url'     => $y['url'],
            'label'   => (string) $y['label'],
            'videoId' => pieb_can_youtube_id($y['url']),
            'autor'   => (int) $y['autor'],
            'iglesia' => (int) $y['iglesia'],
        ), $y, $post);
    }

    $author = get_userdata($post->post_author);
    $datos['subidaPor']   = $author ? $author->display_name : '';
    $datos['protegida']   = pieb_can_proteccion_activa();
    $datos['permisos']    = pieb_can_permisos_cancion($post);
    // Lo que cada iglesia elige de esta canción: la tonalidad cruda ('' = la original) y la partitura principal.
    $propios = pieb_can_cancion_iglesia($post->ID);
    $datos['iglesiaDatos'] = array(
        'tonalidad'  => $propios['tonalidad'],
        'principal'  => $propios['principal'],
        'puedeEditar' => pieb_can_es_admin_iglesia(),
    );
    $datos['puedeUniversal'] = pieb_can_proteccion_activa() && pieb_can_es_central();
    $datos['puedeBorrar'] = $datos['permisos']['borrar'];
    $datos['enPapelera']  = $post->post_status === 'trash';
    if ($datos['enPapelera']) {
        $datos['papelera'] = pieb_can_papelera_item($post);
    }

    return $datos;
}

/**
 * Sube un archivo desde $_FILES[$key][$index] y lo asocia a la canción.
 * $tipo: 'partitura' (PDF/JPG/PNG), 'audio' (MP3/M4A/OGG/WAV/AAC) o 'editable' (MuseScore, MusicXML…).
 *
 * @return int|WP_Error ID del adjunto.
 */
function pieb_can_subir_archivo($files, $index, $post_id, $titulo, $tipo) {
    $file = array(
        'name'     => $files['name'][$index],
        'type'     => $files['type'][$index],
        'tmp_name' => $files['tmp_name'][$index],
        'error'    => $files['error'][$index],
        'size'     => $files['size'][$index],
    );

    if ($file['error'] !== UPLOAD_ERR_OK) {
        return new WP_Error('pieb_subida', sprintf(
            /* translators: 1: nombre del archivo, 2: código de error de PHP */
            __('No se pudo subir «%1$s» (error %2$d).', 'pieb-cancionero'),
            $file['name'],
            $file['error']
        ));
    }

    return pieb_can_adjuntar($file, $post_id, $titulo, $tipo);
}

/**
 * Comprueba tipo y tamaño de un archivo que ya está en el servidor y lo añade a la biblioteca de medios.
 *
 * @return int|WP_Error ID del adjunto.
 */
function pieb_can_adjuntar($file, $post_id, $titulo, $tipo) {
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';

    $clase = pieb_can_clase_archivo($tipo);
    if ((int) $file['size'] > $clase['max']) {
        return new WP_Error('pieb_tamano', sprintf(
            /* translators: 1: nombre del archivo, 2: tamaño del archivo, 3: tamaño máximo permitido */
            __('«%1$s» pesa %2$s; el máximo es %3$s.', 'pieb-cancionero'),
            $file['name'],
            size_format($file['size'], 1),
            size_format($clase['max'])
        ));
    }

    // Los editables se aceptan por su extensión: su contenido (ZIP, XML, binario propio…) no lo reconoce WordPress.
    $check = $tipo === 'editable'
        ? wp_check_filetype($file['name'], $clase['tipos'])
        : wp_check_filetype_and_ext($file['tmp_name'], $file['name'], $clase['tipos']);
    if (empty($check['ext']) || empty($check['type'])) {
        return new WP_Error('pieb_tipo', sprintf($clase['error'], $file['name']));
    }

    // Todo lo que sube el cancionero va a la carpeta privada (uploads/cancionero-privado), sin acceso directo desde la web.
    add_filter('upload_dir', 'pieb_can_dir_subidas');
    if ($tipo === 'editable') {
        pieb_can_permitir_editables(true);
    }
    $attachment_id = media_handle_sideload($file, $post_id, $titulo, array(
        'post_title' => $titulo,
    ));
    if ($tipo === 'editable') {
        pieb_can_permitir_editables(false);
    }
    remove_filter('upload_dir', 'pieb_can_dir_subidas');

    if (!is_wp_error($attachment_id)) {
        update_post_meta($attachment_id, $clase['meta'], 1);
    }

    return $attachment_id;
}

/**
 * Mientras se guarda un editable, WordPress admite sus extensiones (MuseScore, MusicXML…). Se entregan siempre como
 * descarga (ver pieb_can_servir_archivo): un MusicXML no debe abrirse como página.
 */
function pieb_can_permitir_editables($activar) {
    if ($activar) {
        add_filter('upload_mimes', 'pieb_can_mimes_editables');
        add_filter('wp_check_filetype_and_ext', 'pieb_can_tipo_editable', 10, 3);
    } else {
        remove_filter('upload_mimes', 'pieb_can_mimes_editables');
        remove_filter('wp_check_filetype_and_ext', 'pieb_can_tipo_editable', 10);
    }
}

function pieb_can_mimes_editables($mimes) {
    return array_merge($mimes, PIEB_CAN_TIPOS_EDITABLE);
}

function pieb_can_tipo_editable($datos, $ruta, $nombre) {
    $tipo = wp_check_filetype($nombre, PIEB_CAN_TIPOS_EDITABLE);
    return $tipo['ext'] ? array('ext' => $tipo['ext'], 'type' => $tipo['type'], 'proper_filename' => false) : $datos;
}

/** Carpeta temporal de las subidas por trozos; la web no puede servir su contenido. */
function pieb_can_dir_trozos() {
    $dir = trailingslashit(wp_upload_dir()['basedir']) . 'pieb-trozos';
    if (!is_dir($dir)) {
        wp_mkdir_p($dir);
        @file_put_contents($dir . '/index.php', "<?php\n// Silencio.\n");
        @file_put_contents($dir . '/.htaccess', "Require all denied\n");
    }
    return $dir;
}

function pieb_can_ruta_trozo($id) {
    return pieb_can_dir_trozos() . '/' . get_current_user_id() . '-' . $id . '.part';
}

/** Borra subidas a medias de hace más de un día. */
function pieb_can_limpiar_trozos() {
    foreach ((array) glob(pieb_can_dir_trozos() . '/*.part') as $f) {
        if ($f && filemtime($f) < time() - DAY_IN_SECONDS) {
            @unlink($f);
        }
    }
}

/**
 * Archivo ya subido por trozos, con la forma de $_FILES para pasarlo a pieb_can_adjuntar().
 *
 * @return array|WP_Error
 */
function pieb_can_archivo_subido($id, $nombre) {
    $id = (string) $id;
    $nombre = sanitize_file_name((string) $nombre);
    $ruta = preg_match('/^[a-f0-9]{32}$/', $id) ? pieb_can_ruta_trozo($id) : '';
    if (!$ruta || !is_file($ruta)) {
        return new WP_Error('pieb_subida', sprintf(
            /* translators: %s: nombre del archivo */
            __('No se encontró «%s» en el servidor: vuelve a elegir el archivo.', 'pieb-cancionero'),
            $nombre
        ));
    }
    return array('name' => $nombre, 'type' => '', 'tmp_name' => $ruta, 'error' => UPLOAD_ERR_OK, 'size' => filesize($ruta));
}

/**
 * Normaliza la lista de enlaces de YouTube recibida del formulario. $actuales son los enlaces que ya tiene la canción:
 * un enlace con la misma URL conserva su autor e iglesia; los demás son nuevos (usuario actual e iglesia activa, o el
 * $origen_nuevo que se pase: ver pieb_can_origen_nuevo).
 */
function pieb_can_limpiar_youtube($items, $actuales = array(), $origen_nuevo = null) {
    $limpio = array();
    foreach ((array) $items as $item) {
        $url = isset($item['url']) ? esc_url_raw(trim($item['url'])) : '';
        if (!$url || !pieb_can_youtube_id($url)) {
            continue;
        }
        $origen = null;
        foreach ((array) $actuales as $a) {
            if (isset($a['url']) && $a['url'] === $url) {
                $origen = pieb_can_origen_de($a);
                break;
            }
        }
        $limpio[] = array(
            'url'   => $url,
            'label' => isset($item['label']) ? sanitize_text_field($item['label']) : '',
        ) + ($origen ? $origen : ($origen_nuevo ? $origen_nuevo : pieb_can_origen_nuevo()));
    }
    return $limpio;
}

/** $origen: autor e iglesia que se conservan (ver pieb_can_origen_de); null = elemento nuevo (usuario actual e iglesia activa). */
function pieb_can_limpiar_editable($attachment_id, $datos, $origen = null) {
    return array(
        'id'          => (int) $attachment_id,
        'descripcion' => isset($datos['descripcion']) ? sanitize_text_field($datos['descripcion']) : '',
    ) + ($origen ? $origen : pieb_can_origen_nuevo());
}

function pieb_can_limpiar_audio($attachment_id, $datos, $origen = null) {
    return array(
        'id'          => (int) $attachment_id,
        'nombre'      => isset($datos['nombre']) ? sanitize_text_field($datos['nombre']) : '',
        'descripcion' => isset($datos['descripcion']) ? sanitize_textarea_field($datos['descripcion']) : '',
    ) + ($origen ? $origen : pieb_can_origen_nuevo());
}
