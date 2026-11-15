<?php
/**
 * Iglesias: varias iglesias en una misma instalación (ver docs/plan-multi-iglesia.md).
 *
 * Tipo de contenido «pieb_iglesia»: sin interfaz propia; el nombre de la iglesia es el título. Siempre hay al menos una
 * (la «por defecto», guardada en la opción pieb_can_iglesia_defecto), que se crea sola la primera vez que se necesita.
 *
 * Datos:
 *  _pieb_iglesias         Meta de usuario: array( idIglesia => 'equipo' | 'escaleta' | 'admin' ). Si no existe, se deduce de los
 *                         roles de WordPress (ver pieb_can_iglesias_de): en esta fase los roles siguen siendo la fuente de verdad.
 *  _pieb_iglesia_activa   Meta de usuario: la última iglesia elegida.
 *  pieb_can_multi         Opción: versión de la migración a varias iglesias (1 = hecha).
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('init', 'pieb_can_iglesias_registrar_tipo');
// Después del registro de todos los tipos (prioridad 10): sella los cultos existentes con la iglesia por defecto.
add_action('init', 'pieb_can_migrar_iglesias', 20);

function pieb_can_iglesias_registrar_tipo() {
    register_post_type(PIEB_CAN_IGLESIA, array(
        'labels' => array(
            'name'          => 'Iglesias',
            'singular_name' => 'Iglesia',
        ),
        'public'              => false,
        'show_ui'             => false,
        'show_in_menu'        => false,
        'show_in_rest'        => false,
        'exclude_from_search' => true,
        'publicly_queryable'  => false,
        'supports'            => array('title'),
        'map_meta_cap'        => false,
        'capabilities'        => array(
            'edit_post'              => PIEB_CAN_CAP_CENTRAL,
            'read_post'              => PIEB_CAN_CAP_CENTRAL,
            'delete_post'            => PIEB_CAN_CAP_CENTRAL,
            'edit_posts'             => PIEB_CAN_CAP_CENTRAL,
            'edit_others_posts'      => PIEB_CAN_CAP_CENTRAL,
            'publish_posts'          => PIEB_CAN_CAP_CENTRAL,
            'read_private_posts'     => PIEB_CAN_CAP_CENTRAL,
            'delete_posts'           => PIEB_CAN_CAP_CENTRAL,
            'delete_others_posts'    => PIEB_CAN_CAP_CENTRAL,
            'delete_published_posts' => PIEB_CAN_CAP_CENTRAL,
            'edit_published_posts'   => PIEB_CAN_CAP_CENTRAL,
            'create_posts'           => PIEB_CAN_CAP_CENTRAL,
        ),
    ));
}

/**
 * ID de la iglesia por defecto. Si no existe todavía (o ya no está publicada), se crea con el nombre que tenía el
 * cancionero (la línea bajo el nombre o, si está vacía, el nombre del sitio). Solo se puede crear con el tipo ya
 * registrado (a partir de «init»); antes de eso devuelve lo que haya guardado. Nunca crea dos.
 */
function pieb_can_iglesia_defecto() {
    static $id = 0;
    if ($id) {
        return $id;
    }

    $guardado = (int) get_option('pieb_can_iglesia_defecto', 0);
    if ($guardado) {
        $p = get_post($guardado);
        if ($p && $p->post_type === PIEB_CAN_IGLESIA && $p->post_status === 'publish') {
            $id = $guardado;
            return $id;
        }
    }
    if (!post_type_exists(PIEB_CAN_IGLESIA)) {
        return $guardado;
    }

    // Si ya hay alguna iglesia publicada (p. ej. se perdió la opción), se adopta la más antigua en vez de crear otra.
    $existentes = get_posts(array(
        'post_type'      => PIEB_CAN_IGLESIA,
        'post_status'    => 'publish',
        'posts_per_page' => 1,
        'orderby'        => 'ID',
        'order'          => 'ASC',
        'fields'         => 'ids',
    ));
    if ($existentes) {
        $id = (int) $existentes[0];
        update_option('pieb_can_iglesia_defecto', $id);
        return $id;
    }

    $nombre = trim((string) pieb_can_subtitulo());
    if ($nombre === '') {
        $nombre = trim((string) get_bloginfo('name'));
    }
    if ($nombre === '') {
        $nombre = 'Iglesia';
    }
    $nuevo = wp_insert_post(array(
        'post_type'   => PIEB_CAN_IGLESIA,
        'post_status' => 'publish',
        'post_title'  => $nombre,
    ));
    if (!$nuevo || is_wp_error($nuevo)) {
        return 0;
    }
    // La opción apuntaba a una iglesia que ya no existe: se sustituye sin más.
    if ($guardado) {
        update_option('pieb_can_iglesia_defecto', (int) $nuevo);
        $id = (int) $nuevo;
        return $id;
    }
    // add_option no pisa: si otra petición simultánea ya guardó la suya, se queda esa y se descarta la recién creada.
    if (!add_option('pieb_can_iglesia_defecto', (int) $nuevo)) {
        wp_delete_post($nuevo, true);
        $id = (int) get_option('pieb_can_iglesia_defecto', 0);
        return $id;
    }
    $id = (int) $nuevo;
    return $id;
}

/** Todas las iglesias publicadas por orden de título: array( array('id' => int, 'nombre' => string), … ). */
function pieb_can_iglesias() {
    pieb_can_iglesia_defecto(); // garantiza que existe la de por defecto
    $posts = get_posts(array(
        'post_type'      => PIEB_CAN_IGLESIA,
        'post_status'    => 'publish',
        'posts_per_page' => -1,
        'orderby'        => 'title',
        'order'          => 'ASC',
    ));
    $salida = array();
    foreach ($posts as $p) {
        $salida[] = array(
            'id'     => (int) $p->ID,
            'nombre' => html_entity_decode(get_the_title($p), ENT_QUOTES, 'UTF-8'),
        );
    }
    return $salida;
}

/** Nombre de una iglesia ('' si no existe). */
function pieb_can_iglesia_nombre($id) {
    foreach (pieb_can_iglesias() as $i) {
        if ($i['id'] === (int) $id) {
            return $i['nombre'];
        }
    }
    return '';
}

/**
 * Iglesias a las que pertenece un usuario: array( idIglesia => rol ), solo de iglesias que existen. Sin la meta
 * _pieb_iglesias, quien tiene acceso al cancionero pertenece a la iglesia por defecto con el rol que dicen sus
 * capacidades de WordPress (no se escribe nada).
 */
function pieb_can_iglesias_de($user_id) {
    $user_id = (int) $user_id;
    if (!$user_id) {
        return array();
    }
    $existentes = array();
    foreach (pieb_can_iglesias() as $i) {
        $existentes[$i['id']] = true;
    }

    $meta = get_user_meta($user_id, '_pieb_iglesias', true);
    $salida = array();
    if (is_array($meta)) {
        foreach ($meta as $id => $rol) {
            $id = (int) $id;
            if (isset($existentes[$id]) && in_array($rol, array('equipo', 'escaleta', 'admin'), true)) {
                $salida[$id] = $rol;
            }
        }
    }
    if ($salida) {
        return $salida;
    }

    // Compatibilidad: los roles de WordPress siguen siendo la fuente de verdad.
    if (user_can($user_id, PIEB_CAN_CAP_ACCESO)) {
        $rol = user_can($user_id, PIEB_CAN_CAP_GESTIONAR) ? 'admin' : (user_can($user_id, PIEB_CAN_CAP_ESCALETA) ? 'escaleta' : 'equipo');
        return array(pieb_can_iglesia_defecto() => $rol);
    }
    return array();
}

/** Rol del usuario en una iglesia ('equipo', 'escaleta', 'admin') o '' si no pertenece a ella. */
function pieb_can_rol_en($user_id, $iglesia_id) {
    $mias = pieb_can_iglesias_de($user_id);
    $iglesia_id = (int) $iglesia_id;
    return isset($mias[$iglesia_id]) ? $mias[$iglesia_id] : '';
}

/**
 * Iglesia en la que trabaja el usuario (0 = el actual): la de la cabecera X-PCAN-Iglesia si pertenece a ella, si no
 * la última elegida, la primera suya o la de por defecto.
 */
function pieb_can_iglesia_activa($user_id = 0) {
    $user_id = $user_id ? (int) $user_id : get_current_user_id();
    $mias = pieb_can_iglesias_de($user_id);

    if ($user_id === get_current_user_id() && isset($_SERVER['HTTP_X_PCAN_IGLESIA'])) {
        $cabecera = (int) $_SERVER['HTTP_X_PCAN_IGLESIA'];
        if ($cabecera && isset($mias[$cabecera])) {
            return $cabecera;
        }
    }
    $guardada = (int) get_user_meta($user_id, '_pieb_iglesia_activa', true);
    if ($guardada && isset($mias[$guardada])) {
        return $guardada;
    }
    if ($mias) {
        $ids = array_keys($mias);
        return (int) $ids[0];
    }
    return (int) pieb_can_iglesia_defecto();
}

/**
 * ¿Es administrador central? Quien tiene la capacidad pieb_cancionero_central o, mientras solo exista una iglesia,
 * quien gestiona el cancionero (así una instalación de una sola iglesia no cambia nada).
 */
function pieb_can_es_central($user_id = 0) {
    $user_id = $user_id ? (int) $user_id : get_current_user_id();
    if (!$user_id) {
        return false;
    }
    if (user_can($user_id, PIEB_CAN_CAP_CENTRAL)) {
        return true;
    }
    return user_can($user_id, PIEB_CAN_CAP_GESTIONAR) && count(pieb_can_iglesias()) === 1;
}

/** Iglesias del usuario como lista para la interfaz: array( array('id', 'nombre', 'rol'), … ). */
function pieb_can_iglesias_lista_usuario($user_id = 0) {
    $user_id = $user_id ? (int) $user_id : get_current_user_id();
    $mias = pieb_can_iglesias_de($user_id);
    $lista = array();
    foreach (pieb_can_iglesias() as $i) {
        if (isset($mias[$i['id']])) {
            $lista[] = array('id' => $i['id'], 'nombre' => $i['nombre'], 'rol' => $mias[$i['id']]);
        }
    }
    return $lista;
}

/** Migración a varias iglesias: sella los cultos existentes con la iglesia por defecto. Se puede repetir sin duplicar nada. */
function pieb_can_migrar_iglesias() {
    if ((int) get_option('pieb_can_multi', 0) >= 1) {
        return;
    }
    $defecto = pieb_can_iglesia_defecto();
    if (!$defecto) {
        return;
    }
    $ids = get_posts(array(
        'post_type'      => PIEB_CAN_CULTO,
        'post_status'    => array_values(get_post_stati()), // cualquier estado, también la papelera
        'posts_per_page' => -1,
        'fields'         => 'ids',
        'meta_query'     => array(array('key' => '_pieb_iglesia', 'compare' => 'NOT EXISTS')),
    ));
    foreach ($ids as $id) {
        update_post_meta($id, '_pieb_iglesia', $defecto);
    }
    update_option('pieb_can_multi', 1);
}

// ---------------------------------------------------------------- API

add_action('rest_api_init', function () {
    register_rest_route('pieb/v1', '/iglesias', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'pieb_can_rest_iglesias',
        'permission_callback' => 'pieb_can_rest_acceso',
    ));
    register_rest_route('pieb/v1', '/iglesias/activa', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_iglesia_activa',
        'permission_callback' => 'pieb_can_rest_acceso',
    ));
});

function pieb_can_iglesias_estado() {
    return array(
        'activa'    => pieb_can_iglesia_activa(),
        'central'   => pieb_can_es_central(),
        'iglesias'  => pieb_can_iglesias_lista_usuario(),
    );
}

function pieb_can_rest_iglesias() {
    return rest_ensure_response(pieb_can_iglesias_estado());
}

function pieb_can_rest_iglesia_activa(WP_REST_Request $request) {
    $params = $request->get_json_params();
    $params = is_array($params) ? $params : array();
    $iglesia = isset($params['iglesia']) ? (int) $params['iglesia'] : (int) $request->get_param('iglesia');
    if (!$iglesia || pieb_can_rol_en(get_current_user_id(), $iglesia) === '') {
        return new WP_Error('pieb_permiso', __('No perteneces a esa iglesia.', 'pieb-cancionero'), array('status' => 403));
    }
    update_user_meta(get_current_user_id(), '_pieb_iglesia_activa', $iglesia);
    // La elegida pasa a ser la activa también dentro de esta petición (por si la cabecera apuntaba a otra).
    unset($_SERVER['HTTP_X_PCAN_IGLESIA']);
    return rest_ensure_response(pieb_can_iglesias_estado());
}

// ---------------------------------------------------------------- autor e iglesia de cada elemento de una canción

/**
 * Completa 'autor' e 'iglesia' de los elementos de una lista (partituras, audios, editables, YouTube) que aún no los
 * tienen: la persona que subió la canción y la iglesia por defecto. Solo al leer; no escribe nada.
 */
function pieb_can_con_origen($items, $post_id) {
    $autor = (int) get_post_field('post_author', $post_id);
    $iglesia = (int) pieb_can_iglesia_defecto();
    $salida = array();
    foreach ((array) $items as $it) {
        $it = is_array($it) ? $it : array();
        $it['autor'] = !empty($it['autor']) ? (int) $it['autor'] : $autor;
        $it['iglesia'] = !empty($it['iglesia']) ? (int) $it['iglesia'] : $iglesia;
        $salida[] = $it;
    }
    return $salida;
}

/** Origen de un elemento nuevo: el usuario actual y su iglesia activa. */
function pieb_can_origen_nuevo() {
    return array('autor' => get_current_user_id(), 'iglesia' => pieb_can_iglesia_activa());
}

/** Origen de un elemento que se conserva: el que tenía ('autor' e 'iglesia' ya completados al leer). */
function pieb_can_origen_de($existente) {
    return array('autor' => (int) $existente['autor'], 'iglesia' => (int) $existente['iglesia']);
}
