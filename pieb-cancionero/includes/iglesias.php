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
 * la última elegida, la primera suya o la de por defecto. El administrador central (capacidad pieb_cancionero_central)
 * puede estar en cualquier iglesia existente, aunque no sea miembro.
 */
function pieb_can_iglesia_activa($user_id = 0) {
    $user_id = $user_id ? (int) $user_id : get_current_user_id();
    $mias = pieb_can_iglesias_de($user_id);
    // El administrador central (capacidad real) puede trabajar en cualquier iglesia que exista.
    $validas = $mias;
    if ($user_id && user_can($user_id, PIEB_CAN_CAP_CENTRAL)) {
        foreach (pieb_can_iglesias() as $i) {
            if (!isset($validas[$i['id']])) {
                $validas[$i['id']] = 'admin';
            }
        }
    }

    if ($user_id === get_current_user_id() && isset($_SERVER['HTTP_X_PCAN_IGLESIA'])) {
        $cabecera = (int) $_SERVER['HTTP_X_PCAN_IGLESIA'];
        if ($cabecera && isset($validas[$cabecera])) {
            return $cabecera;
        }
    }
    $guardada = (int) get_user_meta($user_id, '_pieb_iglesia_activa', true);
    if ($guardada && isset($validas[$guardada])) {
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

/**
 * ¿Administra esa iglesia el usuario? $iglesia_id = 0: la iglesia activa; $user_id = 0: el usuario actual. Es verdadero
 * para el administrador central (ver pieb_can_es_central) y para quien tiene rol 'admin' en esa iglesia.
 */
function pieb_can_es_admin_iglesia($iglesia_id = 0, $user_id = 0) {
    $user_id = $user_id ? (int) $user_id : get_current_user_id();
    if (!$user_id) {
        return false;
    }
    if (pieb_can_es_central($user_id)) {
        return true;
    }
    $iglesia_id = $iglesia_id ? (int) $iglesia_id : (int) pieb_can_iglesia_activa($user_id);
    return pieb_can_rol_en($user_id, $iglesia_id) === 'admin';
}

/**
 * ¿Está activa la protección de lo que añade cada persona a una canción? Solo cuando hay más de una iglesia (ver fase 3
 * del plan). Con una sola, todo el equipo edita cualquier cosa, como siempre. El resultado se recuerda durante la
 * petición; $reiniciar = true lo vuelve a calcular (al crear una iglesia).
 */
function pieb_can_proteccion_activa($reiniciar = false) {
    static $activa = null;
    if ($reiniciar || $activa === null) {
        $activa = count(pieb_can_iglesias()) > 1;
    }
    return $activa;
}

/**
 * Iglesias del usuario como lista para la interfaz: array( array('id', 'nombre', 'rol', 'ajena'), … ). Al administrador
 * central (capacidad pieb_cancionero_central) le salen todas: en las que no es miembro, rol 'admin' y ajena true.
 */
function pieb_can_iglesias_lista_usuario($user_id = 0) {
    $user_id = $user_id ? (int) $user_id : get_current_user_id();
    $mias = pieb_can_iglesias_de($user_id);
    $todas = $user_id && user_can($user_id, PIEB_CAN_CAP_CENTRAL);
    $lista = array();
    foreach (pieb_can_iglesias() as $i) {
        if (isset($mias[$i['id']])) {
            $lista[] = array('id' => $i['id'], 'nombre' => $i['nombre'], 'rol' => $mias[$i['id']], 'ajena' => false);
        } elseif ($todas) {
            $lista[] = array('id' => $i['id'], 'nombre' => $i['nombre'], 'rol' => 'admin', 'ajena' => true);
        }
    }
    return $lista;
}

/** ¿Puede el usuario trabajar en esa iglesia? Si es miembro, o es administrador central y la iglesia existe. */
function pieb_can_puede_entrar_en($user_id, $iglesia_id) {
    $iglesia_id = (int) $iglesia_id;
    if (!$iglesia_id) {
        return false;
    }
    if (pieb_can_rol_en($user_id, $iglesia_id) !== '') {
        return true;
    }
    return user_can((int) $user_id, PIEB_CAN_CAP_CENTRAL) && pieb_can_iglesia_nombre($iglesia_id) !== '';
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
        array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'pieb_can_rest_iglesias',
            'permission_callback' => 'pieb_can_rest_acceso',
        ),
        array(
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'pieb_can_rest_iglesia_crear',
            'permission_callback' => 'pieb_can_rest_acceso',
        ),
    ));
    register_rest_route('pieb/v1', '/iglesias/activa', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_iglesia_activa',
        'permission_callback' => 'pieb_can_rest_acceso',
    ));
    // Renombrar: solo el administrador central (crear es POST /iglesias).
    register_rest_route('pieb/v1', '/iglesias/(?P<id>\d+)', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_iglesia_renombrar',
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
    if (!pieb_can_puede_entrar_en(get_current_user_id(), $iglesia)) {
        return new WP_Error('pieb_permiso', __('No perteneces a esa iglesia.', 'pieb-cancionero'), array('status' => 403));
    }
    update_user_meta(get_current_user_id(), '_pieb_iglesia_activa', $iglesia);
    // La elegida pasa a ser la activa también dentro de esta petición (por si la cabecera apuntaba a otra).
    unset($_SERVER['HTTP_X_PCAN_IGLESIA']);
    return rest_ensure_response(pieb_can_iglesias_estado());
}

/** Nombre de iglesia saneado y recortado a 80 caracteres ('' si no viene). */
function pieb_can_iglesia_nombre_limpio($params) {
    $nombre = isset($params['nombre']) && is_scalar($params['nombre']) ? trim(sanitize_text_field((string) $params['nombre'])) : '';
    return mb_substr($nombre, 0, 80);
}

/** Crea una iglesia (solo el administrador central) y añade a quien la crea como administrador de ella. */
function pieb_can_rest_iglesia_crear(WP_REST_Request $request) {
    if (!current_user_can(PIEB_CAN_CAP_CENTRAL)) {
        return new WP_Error('pieb_permiso', __('Solo el administrador central puede crear iglesias.', 'pieb-cancionero'), array('status' => 403));
    }
    $params = $request->get_json_params();
    $params = is_array($params) ? $params : array();
    $nombre = pieb_can_iglesia_nombre_limpio($params);
    if ($nombre === '') {
        return new WP_Error('pieb_nombre', __('El nombre de la iglesia es obligatorio.', 'pieb-cancionero'), array('status' => 400));
    }

    $usuario = get_current_user_id();
    // Antes de escribir la meta _pieb_iglesias hay que partir de lo que ya se deduce (iglesia por defecto), para no perderlo.
    $pertenencia = pieb_can_iglesias_de($usuario);
    $id = wp_insert_post(array(
        'post_type'   => PIEB_CAN_IGLESIA,
        'post_status' => 'publish',
        'post_title'  => $nombre,
    ), true);
    if (is_wp_error($id)) {
        return $id;
    }
    $pertenencia[(int) $id] = 'admin';
    update_user_meta($usuario, '_pieb_iglesias', $pertenencia);
    pieb_can_proteccion_activa(true); // con la segunda iglesia empieza la protección de lo ajeno

    $estado = pieb_can_iglesias_estado();
    $estado['creada'] = (int) $id;
    return rest_ensure_response($estado);
}

/** Cambia el nombre de una iglesia (solo el administrador central). */
function pieb_can_rest_iglesia_renombrar(WP_REST_Request $request) {
    if (!current_user_can(PIEB_CAN_CAP_CENTRAL)) {
        return new WP_Error('pieb_permiso', __('Solo el administrador central puede renombrar iglesias.', 'pieb-cancionero'), array('status' => 403));
    }
    $id = (int) $request['id'];
    if (pieb_can_iglesia_nombre($id) === '') {
        return new WP_Error('pieb_no_existe', __('La iglesia no existe.', 'pieb-cancionero'), array('status' => 404));
    }
    $params = $request->get_json_params();
    $params = is_array($params) ? $params : array();
    $nombre = pieb_can_iglesia_nombre_limpio($params);
    if ($nombre === '') {
        return new WP_Error('pieb_nombre', __('El nombre de la iglesia es obligatorio.', 'pieb-cancionero'), array('status' => 400));
    }
    $r = wp_update_post(array('ID' => $id, 'post_title' => $nombre), true);
    if (is_wp_error($r)) {
        return $r;
    }
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
