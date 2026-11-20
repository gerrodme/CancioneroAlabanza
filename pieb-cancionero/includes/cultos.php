<?php
/**
 * Cultos y setlists.
 *
 * Metadatos de cada culto:
 *  _pieb_fecha  Fecha (Y-m-d)
 *  _pieb_tipo   Tipo de culto (texto libre: «Culto dominical», «Oración»…)
 *  _pieb_notas  Notas generales
 *  _pieb_iglesia  ID de la iglesia del culto (se guarda al crearlo; ver includes/iglesias.php). Los anteriores se sellan en la migración.
 *  _pieb_privado  '1' = culto privado: solo lo ve su autor (post_author). Ausente = visible para el equipo de la iglesia.
 *  Quién ve cada culto lo decide SOLO pieb_can_culto_visible() (iglesia activa + privacidad).
 *  _pieb_items  array( array('cancion' => id, 'tonalidad' => 'Sol', 'nota' => 'Solo estrofas 1 y 3'), ... ) en orden
 *  _pieb_escaleta  Escaleta del culto: copia de la plantilla con los valores de este culto (opcional; ver includes/escaleta.php).
 *                  Solo se entrega en el detalle del culto (GET /cultos/{id}), no en el listado.
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('init', function () {
    $gestionar = PIEB_CAN_CAP_GESTIONAR;

    register_post_type(PIEB_CAN_CULTO, array(
        'labels' => array(
            'name'          => __('Cultos', 'pieb-cancionero'),
            'singular_name' => __('Culto', 'pieb-cancionero'),
            'all_items'     => __('Cultos y setlists', 'pieb-cancionero'),
            'edit_item'     => __('Editar culto', 'pieb-cancionero'),
            'not_found'     => __('No hay cultos', 'pieb-cancionero'),
        ),
        'public'              => false,
        'show_ui'             => true,
        'show_in_menu'        => 'edit.php?post_type=' . PIEB_CAN_CPT,
        'show_in_rest'        => false,
        'exclude_from_search' => true,
        'publicly_queryable'  => false,
        'supports'            => array('title', 'author'),
        'map_meta_cap'        => false,
        'capabilities'        => array(
            'edit_post'              => $gestionar,
            'read_post'              => $gestionar,
            'delete_post'            => $gestionar,
            'edit_posts'             => $gestionar,
            'edit_others_posts'      => $gestionar,
            'publish_posts'          => $gestionar,
            'read_private_posts'     => $gestionar,
            'delete_posts'           => $gestionar,
            'delete_others_posts'    => $gestionar,
            'delete_published_posts' => $gestionar,
            'edit_published_posts'   => $gestionar,
            'create_posts'           => $gestionar,
        ),
    ));
});

add_action('rest_api_init', function () {
    $ns = 'pieb/v1';
    $acceso = 'pieb_can_rest_acceso';

    register_rest_route($ns, '/cultos', array(
        array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'pieb_can_rest_cultos_listar',
            'permission_callback' => $acceso,
        ),
        array(
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'pieb_can_rest_culto_guardar',
            'permission_callback' => $acceso,
        ),
    ));

    register_rest_route($ns, '/cultos/(?P<id>\d+)', array(
        array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'pieb_can_rest_culto_ver',
            'permission_callback' => $acceso,
        ),
        array(
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'pieb_can_rest_culto_guardar',
            'permission_callback' => $acceso,
        ),
        array(
            'methods'             => WP_REST_Server::DELETABLE,
            'callback'            => 'pieb_can_rest_culto_borrar',
            'permission_callback' => $acceso,
        ),
    ));

    // Hacer privado un culto (o devolverlo al equipo): solo su autor.
    register_rest_route($ns, '/cultos/(?P<id>\d+)/privacidad', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_culto_privacidad',
        'permission_callback' => $acceso,
    ));
});

function pieb_can_culto_items($post_id) {
    $items = get_post_meta($post_id, '_pieb_items', true);
    return is_array($items) ? array_values($items) : array();
}

/** Iglesia de un culto: la guardada o, si no la tiene, la de por defecto. */
function pieb_can_culto_iglesia($post_id) {
    $id = (int) get_post_meta($post_id, '_pieb_iglesia', true);
    return $id ? $id : (int) pieb_can_iglesia_defecto();
}

/** ¿Es privado el culto? (solo lo ve su autor). */
function pieb_can_culto_privado($post_id) {
    return (string) get_post_meta($post_id, '_pieb_privado', true) === '1';
}

/**
 * ÚNICO FILTRO de visibilidad de los cultos: un culto se ve solo si es de la iglesia activa del usuario Y, si es privado,
 * lo ha creado él. Toda vía que lea o cambie cultos debe pasar por aquí (o por pieb_can_rest_culto_get).
 */
function pieb_can_culto_visible($post, $user_id = 0) {
    $user_id = $user_id ? (int) $user_id : get_current_user_id();
    if (!$post || $post->post_type !== PIEB_CAN_CULTO) {
        return false;
    }
    if (pieb_can_culto_iglesia($post->ID) !== (int) pieb_can_iglesia_activa($user_id)) {
        return false;
    }
    return !pieb_can_culto_privado($post->ID) || (int) $post->post_author === $user_id;
}

/**
 * Condición de meta_query para los cultos de una iglesia. Los cultos sin _pieb_iglesia cuentan como de la iglesia por
 * defecto (igual que pieb_can_culto_iglesia). La privacidad no va aquí: se filtra después con pieb_can_culto_visible.
 */
function pieb_can_cultos_meta_iglesia($iglesia_id) {
    $iglesia_id = (int) $iglesia_id;
    $condicion = array(array('key' => '_pieb_iglesia', 'value' => $iglesia_id, 'compare' => '='));
    if ($iglesia_id === (int) pieb_can_iglesia_defecto()) {
        $condicion[] = array('key' => '_pieb_iglesia', 'compare' => 'NOT EXISTS');
        $condicion['relation'] = 'OR';
    }
    return $condicion;
}

/**
 * Escritorio de WordPress: la lista de cultos (Cancionero → Cultos y setlists) también respeta la iglesia y la privacidad.
 * Quien no es administrador central solo ve los cultos de su iglesia activa que no son privados.
 */
add_action('pre_get_posts', function ($query) {
    if (!is_admin() || !$query->is_main_query() || $query->get('post_type') !== PIEB_CAN_CULTO) {
        return;
    }
    if (current_user_can(PIEB_CAN_CAP_CENTRAL)) {
        return;
    }
    $meta = (array) $query->get('meta_query');
    $meta[] = pieb_can_cultos_meta_iglesia(pieb_can_iglesia_activa());
    $meta[] = array('key' => '_pieb_privado', 'compare' => 'NOT EXISTS');
    $query->set('meta_query', $meta);
});

function pieb_can_culto_resumen($post) {
    $author = get_userdata($post->post_author);
    return array(
        'id'          => $post->ID,
        'titulo'      => html_entity_decode(get_the_title($post), ENT_QUOTES, 'UTF-8'),
        'fecha'       => (string) get_post_meta($post->ID, '_pieb_fecha', true),
        'tipo'        => (string) get_post_meta($post->ID, '_pieb_tipo', true),
        'notas'       => (string) get_post_meta($post->ID, '_pieb_notas', true),
        'items'       => pieb_can_culto_items($post->ID),
        'creadoPor'   => $author ? $author->display_name : '',
        'iglesia'     => pieb_can_culto_iglesia($post->ID),
        'privado'     => pieb_can_culto_privado($post->ID),
        'mio'         => (int) $post->post_author === get_current_user_id(),
        'puedeBorrar' => pieb_can_usuario_puede_borrar($post),
    );
}

/** Ficha del culto con los datos de cada canción resueltos (para la vista, el modo culto y el PDF). */
function pieb_can_culto_detalle($post) {
    $datos = pieb_can_culto_resumen($post);

    foreach ($datos['items'] as &$item) {
        $cancion = get_post((int) $item['cancion']);
        if (!$cancion || $cancion->post_type !== PIEB_CAN_CPT || $cancion->post_status !== 'publish') {
            $item['eliminada'] = true;
            continue;
        }
        $detalle = pieb_can_detalle($cancion);
        // La partitura elegida para este culto va la primera: el modo culto y el PDF usan siempre la primera.
        $elegida = isset($item['partitura']) ? (int) $item['partitura'] : 0;
        // Solo las partituras en la tonalidad del item (la suya o, si no tiene, la HABITUAL de la iglesia del culto, que es la
        // activa). Cada partitura se compara con su tonalidad efectiva, que si no tiene es la ORIGINAL de la canción.
        // Si ninguna coincide (tonalidad antigua escrita a mano) o la elegida es de otra tonalidad, se dejan todas.
        $tono_item = pieb_can_tono_efectivo(array('tonalidad' => isset($item['tonalidad']) ? $item['tonalidad'] : ''), $detalle['tonalidad']);
        $clave_item = pieb_can_tono_clave($tono_item);
        $coinciden = array();
        foreach ($detalle['partituras'] as $p) {
            if (pieb_can_tono_clave(pieb_can_tono_efectivo($p, $detalle['tonalidadOriginal'])) === $clave_item) {
                $coinciden[] = $p;
            }
        }
        if ($coinciden && (!$elegida || in_array($elegida, array_map('intval', wp_list_pluck($coinciden, 'id')), true))) {
            $detalle['partituras'] = $coinciden;
        }
        if ($elegida) {
            usort($detalle['partituras'], function ($a, $b) use ($elegida) {
                return (int) ((int) $b['id'] === $elegida) - (int) ((int) $a['id'] === $elegida);
            });
        }
        $item['datos'] = array(
            'titulo'     => $detalle['titulo'],
            'numero'     => $detalle['numero'],
            'tonalidad'  => $detalle['tonalidad'],
            'tonalidadOriginal' => $detalle['tonalidadOriginal'],
            'tempo'      => $detalle['tempo'],
            'autor'      => $detalle['autor'],
            'letra'      => $detalle['letra'],
            'letraHtml'  => $detalle['letraHtml'],
            'partituras' => $detalle['partituras'],
            'tonalidades' => $detalle['tonalidades'],
            'youtube'    => array_values(array_filter(array_map(function ($y) {
                return array('videoId' => $y['videoId'], 'label' => $y['label']);
            }, $detalle['youtube']), function ($y) { return $y['videoId']; })),
        );
    }
    unset($item);

    // La escaleta (objeto, o null si este culto aún no tiene) va solo en el detalle, para no engordar el listado de cultos.
    $datos['escaleta'] = pieb_can_culto_escaleta($post->ID);

    return $datos;
}

function pieb_can_rest_culto_get($id) {
    $post = get_post((int) $id);
    // Un culto de otra iglesia o privado de otra persona responde igual que si no existiera (nunca 403: no se revela).
    if (!$post || $post->post_type !== PIEB_CAN_CULTO || $post->post_status !== 'publish' || !pieb_can_culto_visible($post)) {
        return new WP_Error('pieb_no_existe', __('El culto no existe.', 'pieb-cancionero'), array('status' => 404));
    }
    return $post;
}

function pieb_can_rest_cultos_listar() {
    $posts = get_posts(array(
        'post_type'      => PIEB_CAN_CULTO,
        'post_status'    => 'publish',
        'posts_per_page' => -1,
        'meta_key'       => '_pieb_fecha',
        'orderby'        => 'meta_value',
        'order'          => 'DESC',
        'meta_query'     => array(pieb_can_cultos_meta_iglesia(pieb_can_iglesia_activa())),
    ));
    // La iglesia ya está filtrada en la consulta; aquí se aplica el filtro completo (también la privacidad).
    $posts = array_values(array_filter($posts, 'pieb_can_culto_visible'));

    return rest_ensure_response(array_map('pieb_can_culto_resumen', $posts));
}

function pieb_can_rest_culto_ver(WP_REST_Request $request) {
    $post = pieb_can_rest_culto_get($request['id']);
    if (is_wp_error($post)) {
        return $post;
    }
    return rest_ensure_response(pieb_can_culto_detalle($post));
}

function pieb_can_rest_culto_guardar(WP_REST_Request $request) {
    $params = $request->get_json_params();
    $params = is_array($params) ? $params : array();

    // Editar: primero se comprueba que el culto es visible para quien pregunta (si no, 404 como si no existiera).
    $es_nuevo = empty($request['id']);
    $post = null;
    if (!$es_nuevo) {
        $post = pieb_can_rest_culto_get($request['id']);
        if (is_wp_error($post)) {
            return $post;
        }
    }

    $titulo = isset($params['titulo']) ? sanitize_text_field($params['titulo']) : '';
    $fecha  = isset($params['fecha']) ? sanitize_text_field($params['fecha']) : '';

    if ($titulo === '') {
        return new WP_Error('pieb_titulo', __('El título es obligatorio.', 'pieb-cancionero'), array('status' => 400));
    }
    $d = DateTime::createFromFormat('Y-m-d', $fecha);
    if (!$d || $d->format('Y-m-d') !== $fecha) {
        return new WP_Error('pieb_fecha', __('La fecha no es válida.', 'pieb-cancionero'), array('status' => 400));
    }

    $items = array();
    foreach ((array) (isset($params['items']) ? $params['items'] : array()) as $item) {
        $cancion_id = isset($item['cancion']) ? (int) $item['cancion'] : 0;
        $cancion = get_post($cancion_id);
        if (!$cancion || $cancion->post_type !== PIEB_CAN_CPT) {
            continue;
        }
        // Partitura elegida para este culto: debe ser una de las de la canción; 0 = la primera (por defecto).
        $partitura = isset($item['partitura']) ? (int) $item['partitura'] : 0;
        if ($partitura && !in_array($partitura, array_map('intval', wp_list_pluck(pieb_can_get_partituras($cancion_id), 'id')), true)) {
            $partitura = 0;
        }
        $items[] = array(
            'cancion'   => $cancion_id,
            'tonalidad' => isset($item['tonalidad']) ? sanitize_text_field($item['tonalidad']) : '',
            'nota'      => isset($item['nota']) ? sanitize_text_field($item['nota']) : '',
            'partitura' => $partitura,
        );
    }

    // Escaleta: solo se toca si llega (null la borra); se valida antes de guardar nada. Solo la preparan los responsables
    // de escaleta y los administradores: si llega de quien no puede, se ignora (sin error, para que pueda seguir
    // cambiando el resto del culto) y la que hubiera se conserva.
    $con_escaleta = array_key_exists('escaleta', $params) && pieb_can_puede_escaleta();
    $escaleta = null;
    if ($con_escaleta) {
        $escaleta = pieb_can_escaleta_limpiar_culto($params['escaleta']);
        if (is_wp_error($escaleta)) {
            return $escaleta;
        }
    }

    if (!$es_nuevo) {
        $post_id = wp_update_post(array('ID' => $post->ID, 'post_title' => $titulo), true);
    } else {
        $post_id = wp_insert_post(array(
            'post_type'   => PIEB_CAN_CULTO,
            'post_status' => 'publish',
            'post_title'  => $titulo,
            'post_author' => get_current_user_id(),
        ), true);
    }

    if (is_wp_error($post_id)) {
        return $post_id;
    }

    if ($es_nuevo) {
        update_post_meta($post_id, '_pieb_iglesia', pieb_can_iglesia_activa());
    }
    // Privacidad: al crear la puede poner cualquiera; al editar solo la cambia el autor (de otra persona se ignora).
    if (array_key_exists('privado', $params) && ($es_nuevo || (int) $post->post_author === get_current_user_id())) {
        pieb_can_culto_fijar_privado($post_id, !empty($params['privado']));
    }
    update_post_meta($post_id, '_pieb_fecha', $fecha);
    update_post_meta($post_id, '_pieb_tipo', isset($params['tipo']) ? sanitize_text_field($params['tipo']) : '');
    update_post_meta($post_id, '_pieb_notas', isset($params['notas']) ? sanitize_textarea_field($params['notas']) : '');
    update_post_meta($post_id, '_pieb_items', $items);
    if ($con_escaleta) {
        pieb_can_escaleta_guardar_culto($post_id, $escaleta);
    }

    return rest_ensure_response(pieb_can_culto_detalle(get_post($post_id)));
}

function pieb_can_rest_culto_borrar(WP_REST_Request $request) {
    $post = pieb_can_rest_culto_get($request['id']);
    if (is_wp_error($post)) {
        return $post;
    }
    if (!pieb_can_usuario_puede_borrar($post)) {
        return new WP_Error('pieb_permiso', __('Solo quien creó el culto o un administrador puede borrarlo.', 'pieb-cancionero'), array('status' => 403));
    }
    wp_trash_post($post->ID);
    return rest_ensure_response(array('borrado' => true, 'id' => $post->ID));
}

/** Marca o desmarca un culto como privado (meta _pieb_privado = '1'; sin privacidad, la meta no existe). */
function pieb_can_culto_fijar_privado($post_id, $privado) {
    if ($privado) {
        update_post_meta($post_id, '_pieb_privado', '1');
    } else {
        delete_post_meta($post_id, '_pieb_privado');
    }
}

/** Cambia la privacidad de un culto: solo su autor. Responde el resumen del culto. */
function pieb_can_rest_culto_privacidad(WP_REST_Request $request) {
    $post = pieb_can_rest_culto_get($request['id']);
    if (is_wp_error($post)) {
        return $post;
    }
    if ((int) $post->post_author !== get_current_user_id()) {
        return new WP_Error('pieb_permiso', __('Solo quien creó el culto puede cambiar su privacidad.', 'pieb-cancionero'), array('status' => 403));
    }
    $params = $request->get_json_params();
    $params = is_array($params) ? $params : array();
    pieb_can_culto_fijar_privado($post->ID, !empty($params['privado']));
    return rest_ensure_response(pieb_can_culto_resumen(get_post($post->ID)));
}
