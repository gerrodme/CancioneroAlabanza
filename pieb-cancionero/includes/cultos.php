<?php
/**
 * Cultos y setlists.
 *
 * Metadatos de cada culto:
 *  _pieb_fecha  Fecha (Y-m-d)
 *  _pieb_tipo   Tipo de culto (texto libre: «Culto dominical», «Oración»…)
 *  _pieb_notas  Notas generales
 *  _pieb_items  array( array('cancion' => id, 'tonalidad' => 'Sol', 'nota' => 'Solo estrofas 1 y 3'), ... ) en orden
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('init', function () {
    $gestionar = PIEB_CAN_CAP_GESTIONAR;

    register_post_type(PIEB_CAN_CULTO, array(
        'labels' => array(
            'name'          => 'Cultos',
            'singular_name' => 'Culto',
            'all_items'     => 'Cultos y setlists',
            'edit_item'     => 'Editar culto',
            'not_found'     => 'No hay cultos',
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
});

function pieb_can_culto_items($post_id) {
    $items = get_post_meta($post_id, '_pieb_items', true);
    return is_array($items) ? array_values($items) : array();
}

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
        $item['datos'] = array(
            'titulo'     => $detalle['titulo'],
            'numero'     => $detalle['numero'],
            'tonalidad'  => $detalle['tonalidad'],
            'tempo'      => $detalle['tempo'],
            'letra'      => $detalle['letra'],
            'partituras' => $detalle['partituras'],
        );
    }
    unset($item);

    return $datos;
}

function pieb_can_rest_culto_get($id) {
    $post = get_post((int) $id);
    if (!$post || $post->post_type !== PIEB_CAN_CULTO || $post->post_status !== 'publish') {
        return new WP_Error('pieb_no_existe', 'El culto no existe.', array('status' => 404));
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
    ));

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

    $titulo = isset($params['titulo']) ? sanitize_text_field($params['titulo']) : '';
    $fecha  = isset($params['fecha']) ? sanitize_text_field($params['fecha']) : '';

    if ($titulo === '') {
        return new WP_Error('pieb_titulo', 'El título es obligatorio.', array('status' => 400));
    }
    $d = DateTime::createFromFormat('Y-m-d', $fecha);
    if (!$d || $d->format('Y-m-d') !== $fecha) {
        return new WP_Error('pieb_fecha', 'La fecha no es válida.', array('status' => 400));
    }

    $items = array();
    foreach ((array) (isset($params['items']) ? $params['items'] : array()) as $item) {
        $cancion_id = isset($item['cancion']) ? (int) $item['cancion'] : 0;
        $cancion = get_post($cancion_id);
        if (!$cancion || $cancion->post_type !== PIEB_CAN_CPT) {
            continue;
        }
        $items[] = array(
            'cancion'   => $cancion_id,
            'tonalidad' => isset($item['tonalidad']) ? sanitize_text_field($item['tonalidad']) : '',
            'nota'      => isset($item['nota']) ? sanitize_text_field($item['nota']) : '',
        );
    }

    if (!empty($request['id'])) {
        $post = pieb_can_rest_culto_get($request['id']);
        if (is_wp_error($post)) {
            return $post;
        }
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

    update_post_meta($post_id, '_pieb_fecha', $fecha);
    update_post_meta($post_id, '_pieb_tipo', isset($params['tipo']) ? sanitize_text_field($params['tipo']) : '');
    update_post_meta($post_id, '_pieb_notas', isset($params['notas']) ? sanitize_textarea_field($params['notas']) : '');
    update_post_meta($post_id, '_pieb_items', $items);

    return rest_ensure_response(pieb_can_culto_detalle(get_post($post_id)));
}

function pieb_can_rest_culto_borrar(WP_REST_Request $request) {
    $post = pieb_can_rest_culto_get($request['id']);
    if (is_wp_error($post)) {
        return $post;
    }
    if (!pieb_can_usuario_puede_borrar($post)) {
        return new WP_Error('pieb_permiso', 'Solo quien creó el culto o un administrador puede borrarlo.', array('status' => 403));
    }
    wp_trash_post($post->ID);
    return rest_ensure_response(array('borrado' => true, 'id' => $post->ID));
}
