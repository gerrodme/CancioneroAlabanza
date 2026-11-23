<?php
/**
 * Etiquetas de canción: por iglesia y universales (ver docs/plan-multi-iglesia.md, fase 4b).
 *
 * Cada etiqueta es un término de la taxonomía PIEB_CAN_TAX. Con VARIAS iglesias cada una es de una iglesia (o «universal»,
 * visible en todas, que solo maneja el administrador central). Con UNA sola iglesia nada de esto se aplica: todo se guarda y
 * se lee exactamente como antes (sin metas, con wp_set_object_terms por nombre).
 *
 * Metas del término:
 *  _pieb_iglesia    ID de la iglesia dueña. Si falta, es de la iglesia por defecto (las etiquetas anteriores no se migran).
 *  _pieb_universal  '1' = etiqueta universal (la ven todas las iglesias).
 *  pieb_color       Color (ver pieb_can_asignar_color_etiqueta en canciones.php).
 *
 * Como dos iglesias pueden tener una etiqueta con el mismo nombre (términos distintos, con slug distinto), todo se resuelve
 * por ID de término dentro de un ámbito: nunca se usan get_term_by('name') ni wp_set_object_terms con nombres cuando hay
 * protección activa.
 */

if (!defined('ABSPATH')) {
    exit;
}

// ---------------------------------------------------------------- lectura

/** Nombre normalizado para comparar (entidades decodificadas, sin espacios sobrantes y sin distinguir mayúsculas). */
function pieb_can_etiqueta_clave($nombre) {
    return mb_strtolower(trim(html_entity_decode((string) $nombre, ENT_QUOTES, 'UTF-8')));
}

/** Todos los términos de la taxonomía (con su caché de metas ya cargada). */
function pieb_can_etiquetas_terminos() {
    $terms = get_terms(array('taxonomy' => PIEB_CAN_TAX, 'hide_empty' => false));
    return is_array($terms) ? $terms : array();
}

/** ¿Es universal la etiqueta? ($term: objeto o ID.) */
function pieb_can_etiqueta_es_universal($term) {
    $id = is_object($term) ? (int) $term->term_id : (int) $term;
    return (string) get_term_meta($id, '_pieb_universal', true) === '1';
}

/** Iglesia dueña de una etiqueta ($term: objeto o ID): la de su meta o, si falta, la iglesia por defecto. */
function pieb_can_etiqueta_iglesia($term) {
    $id = is_object($term) ? (int) $term->term_id : (int) $term;
    $m = (int) get_term_meta($id, '_pieb_iglesia', true);
    return $m ? $m : (int) pieb_can_iglesia_defecto();
}

/**
 * ¿Ve esa etiqueta el usuario? Universal, o de su iglesia activa ($activa = 0: se calcula). Con una sola iglesia, siempre.
 * Es la única función que decide la visibilidad de una etiqueta.
 */
function pieb_can_etiqueta_visible($term, $activa = 0) {
    if (!pieb_can_proteccion_activa()) {
        return true;
    }
    if (pieb_can_etiqueta_es_universal($term)) {
        return true;
    }
    $activa = $activa ? (int) $activa : (int) pieb_can_iglesia_activa();
    return pieb_can_etiqueta_iglesia($term) === $activa;
}

/** Término de ESA iglesia con ese nombre (no universal), o null. */
function pieb_can_etiqueta_buscar($nombre, $iglesia_id) {
    $clave = pieb_can_etiqueta_clave($nombre);
    $iglesia_id = (int) $iglesia_id;
    if ($clave === '') {
        return null;
    }
    foreach (pieb_can_etiquetas_terminos() as $t) {
        if (pieb_can_etiqueta_clave($t->name) === $clave && !pieb_can_etiqueta_es_universal($t) && pieb_can_etiqueta_iglesia($t) === $iglesia_id) {
            return $t;
        }
    }
    return null;
}

/** La etiqueta universal con ese nombre, o null. */
function pieb_can_etiqueta_universal_buscar($nombre) {
    $clave = pieb_can_etiqueta_clave($nombre);
    if ($clave === '') {
        return null;
    }
    foreach (pieb_can_etiquetas_terminos() as $t) {
        if (pieb_can_etiqueta_clave($t->name) === $clave && pieb_can_etiqueta_es_universal($t)) {
            return $t;
        }
    }
    return null;
}

/**
 * ID del término de esa iglesia con ese nombre; si no existe se crea (con _pieb_iglesia salvo en la iglesia por defecto).
 * Dos iglesias pueden tener el mismo nombre: WordPress lo permite en una taxonomía no jerárquica si se da un slug explícito
 * distinto (wp_insert_term solo devuelve «term_exists» cuando no hay slug explícito o este ya está en uso). Devuelve 0 si
 * no se pudo crear.
 */
function pieb_can_etiqueta_obtener($nombre, $iglesia_id) {
    $nombre = trim((string) $nombre);
    $iglesia_id = (int) $iglesia_id;
    if ($nombre === '' || !$iglesia_id) {
        return 0;
    }
    $existente = pieb_can_etiqueta_buscar($nombre, $iglesia_id);
    if ($existente) {
        return (int) $existente->term_id;
    }

    $defecto = (int) pieb_can_iglesia_defecto();
    $r = null;
    // La iglesia por defecto crea el término como siempre (slug automático); solo si ya hay otro igual de otra iglesia
    // (error «term_exists») pasa al slug explícito.
    if ($iglesia_id === $defecto) {
        $r = wp_insert_term($nombre, PIEB_CAN_TAX);
    }
    if ($r === null || (is_wp_error($r) && in_array($r->get_error_code(), array('term_exists', 'duplicate_term_slug'), true))) {
        $base = sanitize_title($nombre);
        if ($base === '') {
            $base = 'e' . substr(md5($nombre), 0, 8);
        }
        $slug = $base . '-ig' . $iglesia_id;
        for ($i = 0; $i < 20; $i++) {
            $r = wp_insert_term($nombre, PIEB_CAN_TAX, array('slug' => $i ? $slug . '-' . ($i + 1) : $slug));
            if (!is_wp_error($r) || !in_array($r->get_error_code(), array('term_exists', 'duplicate_term_slug'), true)) {
                break;
            }
        }
    }
    if (is_wp_error($r) || empty($r['term_id'])) {
        return 0;
    }
    $id = (int) $r['term_id'];
    if ($iglesia_id !== $defecto) {
        update_term_meta($id, '_pieb_iglesia', $iglesia_id);
    }
    return $id;
}

/**
 * ID de la etiqueta universal con ese nombre; si no existe se crea (sin _pieb_iglesia y con _pieb_universal = 1). Para las copias
 * de seguridad: no mira la iglesia activa ni los permisos. Devuelve 0 si no se pudo crear.
 */
function pieb_can_etiqueta_universal_obtener($nombre) {
    $nombre = trim((string) $nombre);
    if ($nombre === '') {
        return 0;
    }
    $existente = pieb_can_etiqueta_universal_buscar($nombre);
    if ($existente) {
        return (int) $existente->term_id;
    }
    $base = sanitize_title($nombre);
    if ($base === '') {
        $base = 'e' . substr(md5($nombre), 0, 8);
    }
    $slug = $base . '-universal';
    $r = null;
    for ($i = 0; $i < 20; $i++) {
        $r = wp_insert_term($nombre, PIEB_CAN_TAX, array('slug' => $i ? $slug . '-' . ($i + 1) : $slug));
        if (!is_wp_error($r) || !in_array($r->get_error_code(), array('term_exists', 'duplicate_term_slug'), true)) {
            break;
        }
    }
    if (is_wp_error($r) || empty($r['term_id'])) {
        return 0;
    }
    update_term_meta((int) $r['term_id'], '_pieb_universal', '1');
    return (int) $r['term_id'];
}

/** Términos de la canción que ve el usuario (objetos), por nombre; si hay dos con el mismo nombre, la universal. */
function pieb_can_etiquetas_visibles($post_id, $activa = 0) {
    // get_the_terms usa la caché de términos (que el listado precarga); wp_get_object_terms iría siempre a la base de datos.
    // wp_set_object_terms limpia esa caché del objeto, así que tras fijar etiquetas se lee lo nuevo. WordPress llena esa caché
    // con orderby => name (en MySQL), el mismo orden que daba wp_get_object_terms: no se reordena aquí.
    $terms = get_the_terms($post_id, PIEB_CAN_TAX);
    if (is_wp_error($terms) || !is_array($terms)) {
        return array();
    }
    if (!pieb_can_proteccion_activa()) {
        return array_values($terms);
    }
    $activa = $activa ? (int) $activa : (int) pieb_can_iglesia_activa();
    $por_nombre = array();
    foreach ($terms as $t) {
        if (!pieb_can_etiqueta_visible($t, $activa)) {
            continue;
        }
        $k = pieb_can_etiqueta_clave($t->name);
        if (!isset($por_nombre[$k]) || pieb_can_etiqueta_es_universal($t)) {
            $por_nombre[$k] = $t;
        }
    }
    return array_values($por_nombre);
}

/** Nombres de las etiquetas visibles de la canción (los de la iglesia activa y las universales). */
function pieb_can_etiquetas($post_id, $activa = 0) {
    return array_values(wp_list_pluck(pieb_can_etiquetas_visibles($post_id, $activa), 'name'));
}

/** Nombres de las etiquetas universales de la canción (subconjunto de pieb_can_etiquetas). */
function pieb_can_etiquetas_universales_de($post_id, $activa = 0) {
    if (!pieb_can_proteccion_activa()) {
        return array();
    }
    $salida = array();
    foreach (pieb_can_etiquetas_visibles($post_id, $activa) as $t) {
        if (pieb_can_etiqueta_es_universal($t)) {
            $salida[] = $t->name;
        }
    }
    return $salida;
}

/** Nombre => color de las etiquetas VISIBLES (las que aún no tienen color lo reciben ahora). Si coinciden, gana la universal. */
function pieb_can_colores_etiquetas() {
    $colores = array();
    $universales = array();
    $activa = pieb_can_proteccion_activa() ? (int) pieb_can_iglesia_activa() : 0;
    foreach (pieb_can_etiquetas_terminos() as $t) {
        if (!pieb_can_etiqueta_visible($t, $activa)) {
            continue;
        }
        $nombre = html_entity_decode($t->name, ENT_QUOTES, 'UTF-8');
        $es_universal = $activa && pieb_can_etiqueta_es_universal($t);
        if (isset($universales[$nombre]) && !$es_universal) {
            continue;
        }
        $color = get_term_meta($t->term_id, 'pieb_color', true);
        $colores[$nombre] = $color ? $color : pieb_can_asignar_color_etiqueta($t->term_id);
        if ($es_universal) {
            $universales[$nombre] = true;
        }
    }
    return $colores;
}

/** Etiquetas universales como lista para la API: array( 'etiquetas' => array( array('nombre', 'color'), … ) ) por nombre. */
function pieb_can_etiquetas_universales_lista() {
    $lista = array();
    foreach (pieb_can_etiquetas_terminos() as $t) {
        if (!pieb_can_etiqueta_es_universal($t)) {
            continue;
        }
        $color = get_term_meta($t->term_id, 'pieb_color', true);
        $lista[] = array(
            'nombre' => html_entity_decode($t->name, ENT_QUOTES, 'UTF-8'),
            'color'  => $color ? $color : pieb_can_asignar_color_etiqueta($t->term_id),
        );
    }
    usort($lista, function ($a, $b) {
        return strcmp(pieb_can_etiqueta_clave($a['nombre']), pieb_can_etiqueta_clave($b['nombre']));
    });
    return array('etiquetas' => $lista);
}

// ---------------------------------------------------------------- escritura

/**
 * Fija las etiquetas de una canción a partir de la lista de nombres que quien guarda quiere que tenga (de entre las que ve).
 * Sin protección activa es exactamente wp_set_object_terms por nombre. Con ella, el resultado es la suma de:
 *  1. los términos que la canción ya tiene y quien guarda NO ve (de otras iglesias): se conservan siempre;
 *  2. las universales: el central pone las de la lista; quien no lo es conserva las que la canción ya tenía y no puede
 *     poner ni quitar ninguna (un nombre de la lista que coincide con una universal que la canción no tiene se ignora);
 *  3. de la iglesia activa, un término por cada nombre restante (se crea si no existe). El central, si el nombre coincide
 *     con una universal, usa esa y no crea una de iglesia.
 */
function pieb_can_etiquetas_fijar($post_id, $nombres) {
    if (!pieb_can_proteccion_activa()) {
        wp_set_object_terms($post_id, $nombres, PIEB_CAN_TAX);
        return;
    }

    $activa = (int) pieb_can_iglesia_activa();
    $central = pieb_can_es_central();
    $ids = array();
    $universales_actuales = array(); // clave de nombre => id (las universales que la canción ya tiene)

    $actuales = wp_get_object_terms($post_id, PIEB_CAN_TAX);
    foreach (is_array($actuales) ? $actuales : array() as $t) {
        if (!pieb_can_etiqueta_visible($t, $activa)) {
            $ids[] = (int) $t->term_id; // 1: de otra iglesia, intocable
        } elseif (pieb_can_etiqueta_es_universal($t)) {
            $universales_actuales[pieb_can_etiqueta_clave($t->name)] = (int) $t->term_id;
        }
    }

    $resto = array();
    $vistos = array();
    foreach ((array) $nombres as $n) {
        $n = trim((string) $n);
        $k = pieb_can_etiqueta_clave($n);
        if ($k === '' || isset($vistos[$k])) {
            continue;
        }
        $vistos[$k] = true;
        $universal = pieb_can_etiqueta_universal_buscar($n);
        if ($universal) {
            if ($central) {
                $ids[] = (int) $universal->term_id; // 2: el central la pone
            }
            continue; // quien no es central no puede ponerla (y la que ya tenía se conserva abajo)
        }
        $resto[] = $n;
    }
    if (!$central) {
        foreach ($universales_actuales as $id) {
            $ids[] = $id; // 2: no puede quitarlas
        }
    }
    foreach ($resto as $n) {
        $id = pieb_can_etiqueta_obtener($n, $activa); // 3
        if ($id) {
            $ids[] = $id;
        }
    }

    // Por ID de término (enteros): wp_set_object_terms no crea ni resuelve nada por nombre.
    wp_set_object_terms($post_id, array_values(array_unique(array_map('intval', $ids))), PIEB_CAN_TAX);
}

/** Reasigna las canciones de la etiqueta de origen a la de destino y borra la de origen. */
function pieb_can_etiqueta_fusionar($origen_id, $destino_id) {
    $origen_id = (int) $origen_id;
    $destino_id = (int) $destino_id;
    if (!$origen_id || !$destino_id || $origen_id === $destino_id) {
        return;
    }
    $objetos = get_objects_in_term($origen_id, PIEB_CAN_TAX);
    foreach (is_array($objetos) ? $objetos : array() as $pid) {
        wp_set_object_terms((int) $pid, array($destino_id), PIEB_CAN_TAX, true);
    }
    wp_delete_term($origen_id, PIEB_CAN_TAX);
}

// ---------------------------------------------------------------- API

add_action('rest_api_init', function () {
    register_rest_route('pieb/v1', '/etiquetas/universales', array(
        array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'pieb_can_rest_etiquetas_universales',
            'permission_callback' => 'pieb_can_rest_acceso',
        ),
        array(
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'pieb_can_rest_etiqueta_universal',
            'permission_callback' => 'pieb_can_rest_acceso',
        ),
    ));
});

function pieb_can_rest_etiquetas_universales() {
    return rest_ensure_response(pieb_can_etiquetas_universales_lista());
}

/**
 * Marca una etiqueta como universal o la devuelve a la iglesia activa. Solo el administrador central y con varias iglesias.
 * Cuerpo JSON: { nombre, universal: bool }. Responde como GET /etiquetas/universales.
 */
function pieb_can_rest_etiqueta_universal(WP_REST_Request $request) {
    if (!pieb_can_proteccion_activa() || !pieb_can_es_central()) {
        return new WP_Error('pieb_permiso', __('Las etiquetas universales solo existen con varias iglesias y las gestiona el administrador central.', 'pieb-cancionero'), array('status' => 403));
    }
    $params = $request->get_json_params();
    $params = is_array($params) ? $params : array();
    $nombre = isset($params['nombre']) && is_scalar($params['nombre']) ? trim(sanitize_text_field((string) $params['nombre'])) : '';
    if ($nombre === '') {
        return new WP_Error('pieb_nombre', __('Escribe el nombre de la etiqueta.', 'pieb-cancionero'), array('status' => 400));
    }
    $universal = isset($params['universal']) && rest_sanitize_boolean($params['universal']);
    $activa = (int) pieb_can_iglesia_activa();
    $clave = pieb_can_etiqueta_clave($nombre);

    if ($universal) {
        if (pieb_can_etiqueta_universal_buscar($nombre)) {
            return rest_ensure_response(pieb_can_etiquetas_universales_lista());
        }
        // Base: la etiqueta de la iglesia activa con ese nombre (o una nueva).
        $base = pieb_can_etiqueta_obtener($nombre, $activa);
        if (!$base) {
            return new WP_Error('pieb_etiqueta', __('No se pudo crear la etiqueta.', 'pieb-cancionero'), array('status' => 500));
        }
        update_term_meta($base, '_pieb_universal', '1');
        delete_term_meta($base, '_pieb_iglesia');
        // Se fusionan en ella las del mismo nombre de las demás iglesias, para que no queden dos iguales a la vista.
        foreach (pieb_can_etiquetas_terminos() as $t) {
            if ((int) $t->term_id !== $base && pieb_can_etiqueta_clave($t->name) === $clave && !pieb_can_etiqueta_es_universal($t)) {
                pieb_can_etiqueta_fusionar($t->term_id, $base);
            }
        }
        return rest_ensure_response(pieb_can_etiquetas_universales_lista());
    }

    $u = pieb_can_etiqueta_universal_buscar($nombre);
    if (!$u) {
        return new WP_Error('pieb_no_existe', __('No hay ninguna etiqueta universal con ese nombre.', 'pieb-cancionero'), array('status' => 404));
    }
    $propia = pieb_can_etiqueta_buscar($nombre, $activa);
    if ($propia) {
        pieb_can_etiqueta_fusionar($u->term_id, $propia->term_id);
    } else {
        delete_term_meta($u->term_id, '_pieb_universal');
        if ($activa === (int) pieb_can_iglesia_defecto()) {
            delete_term_meta($u->term_id, '_pieb_iglesia');
        } else {
            update_term_meta($u->term_id, '_pieb_iglesia', $activa);
        }
    }
    return rest_ensure_response(pieb_can_etiquetas_universales_lista());
}
