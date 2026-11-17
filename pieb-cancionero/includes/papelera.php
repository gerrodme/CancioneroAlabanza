<?php
/**
 * Papelera del cancionero.
 *
 * Borrar una canción la manda a la papelera de WordPress (ver pieb_can_rest_borrar). Aquí los administradores del
 * cancionero pueden ver lo borrado, abrirlo, restaurarlo o eliminarlo para siempre. Las canciones borradas se limpian
 * solas pasados N días (ajuste «papelera_dias», 30 por defecto; 0 = no limpiar nunca).
 *
 * Al eliminar una canción para siempre (desde aquí, por la limpieza automática o desde el escritorio de WordPress)
 * se borran también sus archivos (partituras, audios y editables).
 *
 * Papelera de cultos (fase 5c): los cultos borrados también van a la papelera de WordPress y cada iglesia ve y restaura los
 * suyos (ver pieb_can_culto_papelera_visible); misma limpieza automática y mismo plazo que las canciones. La papelera de
 * canciones sigue siendo solo del administrador central.
 */

if (!defined('ABSPATH')) {
    exit;
}

/** Días que se conservan las canciones borradas (0 = nunca se limpian solas). */
function pieb_can_papelera_dias() {
    return max(0, (int) pieb_can_ajustes()['papelera_dias']);
}

/** Momento (timestamp) en que se mandó a la papelera una canción. */
function pieb_can_borrada_el($post_id) {
    $t = (int) get_post_meta($post_id, '_wp_trash_meta_time', true);
    return $t ? $t : (int) get_post_modified_time('U', true, $post_id);
}

// ---------------------------------------------------------------- ganchos

// Quién borró la canción o el culto.
add_action('wp_trash_post', function ($post_id) {
    if (in_array(get_post_type($post_id), array(PIEB_CAN_CPT, PIEB_CAN_CULTO), true)) {
        update_post_meta($post_id, '_pieb_borrada_por', get_current_user_id());
    }
});

// Al restaurar, WordPress deja la entrada como borrador: la canción o el culto vuelve publicado.
add_filter('wp_untrash_post_status', function ($nuevo, $post_id) {
    return in_array(get_post_type($post_id), array(PIEB_CAN_CPT, PIEB_CAN_CULTO), true) ? 'publish' : $nuevo;
}, 10, 2);

// La limpieza automática de WordPress (a los 30 días) respeta el plazo de los ajustes del cancionero.
add_filter('pre_delete_post', function ($previo, $post) {
    if (!in_array($post->post_type, array(PIEB_CAN_CPT, PIEB_CAN_CULTO), true) || !doing_action('wp_scheduled_delete')) {
        return $previo;
    }
    $dias = pieb_can_papelera_dias();
    if ($dias === 0 || pieb_can_borrada_el($post->ID) > time() - $dias * DAY_IN_SECONDS) {
        return false;
    }
    return $previo;
}, 10, 2);

// Al eliminar una canción para siempre, sus archivos también.
add_action('before_delete_post', function ($post_id) {
    if (get_post_type($post_id) !== PIEB_CAN_CPT) {
        return;
    }
    foreach (array_merge(pieb_can_get_partituras($post_id), pieb_can_get_audios($post_id), pieb_can_get_editables($post_id)) as $item) {
        if (!empty($item['id']) && pieb_can_es_archivo_cancionero($item['id'])) {
            wp_delete_attachment((int) $item['id'], true);
        }
    }
});

// Limpieza diaria de lo que lleva en la papelera más que el plazo.
add_action('init', function () {
    if (!wp_next_scheduled('pieb_can_limpiar_papelera')) {
        wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', 'pieb_can_limpiar_papelera');
    }
});
add_action('pieb_can_limpiar_papelera', 'pieb_can_limpiar_papelera');

function pieb_can_limpiar_papelera() {
    $dias = pieb_can_papelera_dias();
    if ($dias === 0) {
        return 0;
    }
    $borradas = 0;
    foreach (pieb_can_canciones_en_papelera() as $post) {
        if (pieb_can_borrada_el($post->ID) <= time() - $dias * DAY_IN_SECONDS) {
            wp_delete_post($post->ID, true);
            $borradas++;
        }
    }
    // Los cultos borrados caducan con el mismo plazo, de todas las iglesias.
    foreach (pieb_can_cultos_en_papelera() as $post) {
        if (pieb_can_borrada_el($post->ID) <= time() - $dias * DAY_IN_SECONDS) {
            wp_delete_post($post->ID, true);
            $borradas++;
        }
    }
    return $borradas;
}

function pieb_can_canciones_en_papelera() {
    return get_posts(array(
        'post_type'      => PIEB_CAN_CPT,
        'post_status'    => 'trash',
        'posts_per_page' => -1,
        'orderby'        => 'modified',
        'order'          => 'DESC',
    ));
}

// ---------------------------------------------------------------- API

add_action('rest_api_init', function () {
    $gestionar = function () { return pieb_can_es_central(); };
    register_rest_route('pieb/v1', '/papelera', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'pieb_can_rest_papelera_listar',
        'permission_callback' => $gestionar,
    ));
    register_rest_route('pieb/v1', '/papelera/vaciar', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_papelera_vaciar',
        'permission_callback' => $gestionar,
    ));
    register_rest_route('pieb/v1', '/papelera/(?P<id>\d+)/restaurar', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_papelera_restaurar',
        'permission_callback' => $gestionar,
    ));
    register_rest_route('pieb/v1', '/papelera/(?P<id>\d+)', array(
        'methods'             => WP_REST_Server::DELETABLE,
        'callback'            => 'pieb_can_rest_papelera_eliminar',
        'permission_callback' => $gestionar,
    ));
});

function pieb_can_cancion_en_papelera($id) {
    $post = get_post((int) $id);
    if (!$post || $post->post_type !== PIEB_CAN_CPT || $post->post_status !== 'trash') {
        return new WP_Error('pieb_no_papelera', __('Esa canción no está en la papelera.', 'pieb-cancionero'), array('status' => 404));
    }
    return $post;
}

/** Datos de una canción borrada para la lista de la papelera. */
function pieb_can_papelera_item($post) {
    $dias = pieb_can_papelera_dias();
    $cuando = pieb_can_borrada_el($post->ID);
    $quien = get_userdata((int) get_post_meta($post->ID, '_pieb_borrada_por', true));
    $caduca = $dias ? $cuando + $dias * DAY_IN_SECONDS : 0;
    return array(
        'id'             => $post->ID,
        'titulo'         => html_entity_decode(get_the_title($post), ENT_QUOTES, 'UTF-8'),
        'numero'         => (string) get_post_meta($post->ID, '_pieb_numero', true),
        'tonalidad'      => (string) get_post_meta($post->ID, '_pieb_tonalidad', true),
        'archivos'       => count(pieb_can_get_partituras($post->ID)) + count(pieb_can_get_audios($post->ID)) + count(pieb_can_get_editables($post->ID)),
        'borradaEl'      => gmdate('c', $cuando),
        'borradaPor'     => $quien ? $quien->display_name : '',
        'caduca'         => $caduca ? gmdate('c', $caduca) : '',
        'diasRestantes'  => $caduca ? max(0, (int) ceil(($caduca - time()) / DAY_IN_SECONDS)) : null,
    );
}

function pieb_can_rest_papelera_listar() {
    return rest_ensure_response(array(
        'canciones' => array_map('pieb_can_papelera_item', pieb_can_canciones_en_papelera()),
        'dias'      => pieb_can_papelera_dias(),
    ));
}

function pieb_can_rest_papelera_restaurar(WP_REST_Request $request) {
    $post = pieb_can_cancion_en_papelera($request['id']);
    if (is_wp_error($post)) {
        return $post;
    }
    wp_untrash_post($post->ID);
    delete_post_meta($post->ID, '_pieb_borrada_por');
    return rest_ensure_response(array('restaurada' => true, 'id' => $post->ID));
}

function pieb_can_rest_papelera_eliminar(WP_REST_Request $request) {
    $post = pieb_can_cancion_en_papelera($request['id']);
    if (is_wp_error($post)) {
        return $post;
    }
    wp_delete_post($post->ID, true);
    return rest_ensure_response(array('eliminada' => true, 'id' => $post->ID));
}

function pieb_can_rest_papelera_vaciar() {
    @set_time_limit(120);
    $n = 0;
    foreach (pieb_can_canciones_en_papelera() as $post) {
        wp_delete_post($post->ID, true);
        $n++;
    }
    return rest_ensure_response(array('eliminadas' => $n));
}

// ---------------------------------------------------------------- papelera de cultos (fase 5c)

/** Cultos en la papelera de WordPress, de todas las iglesias (sin filtrar por visibilidad). */
function pieb_can_cultos_en_papelera() {
    return get_posts(array(
        'post_type'      => PIEB_CAN_CULTO,
        'post_status'    => 'trash',
        'posts_per_page' => -1,
        'orderby'        => 'modified',
        'order'          => 'DESC',
    ));
}

/**
 * ÚNICA regla de qué cultos borrados ve el usuario (0 = el actual): los de su iglesia activa y, si el culto es privado, solo
 * su autor; si no, quien gestiona la iglesia o su autor. El administrador central no ve los privados ajenos.
 */
function pieb_can_culto_papelera_visible($post, $user_id = 0) {
    $user_id = $user_id ? (int) $user_id : get_current_user_id();
    if (!$post || $post->post_type !== PIEB_CAN_CULTO || $post->post_status !== 'trash' || !$user_id) {
        return false;
    }
    if (pieb_can_culto_iglesia($post->ID) !== (int) pieb_can_iglesia_activa($user_id)) {
        return false;
    }
    $autor = (int) $post->post_author === $user_id;
    if (pieb_can_culto_privado($post->ID)) {
        return $autor;
    }
    return $autor || pieb_can_puede_gestionar($user_id);
}

/** Cultos borrados que ve quien pregunta, el más recientemente borrado primero. */
function pieb_can_cultos_papelera_visibles() {
    $posts = array_values(array_filter(pieb_can_cultos_en_papelera(), 'pieb_can_culto_papelera_visible'));
    usort($posts, function ($a, $b) {
        return pieb_can_borrada_el($b->ID) <=> pieb_can_borrada_el($a->ID);
    });
    return $posts;
}

add_action('rest_api_init', function () {
    $acceso = 'pieb_can_rest_acceso';
    register_rest_route('pieb/v1', '/cultos/papelera', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'pieb_can_rest_cultos_papelera_listar',
        'permission_callback' => $acceso,
    ));
    register_rest_route('pieb/v1', '/cultos/papelera/vaciar', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_cultos_papelera_vaciar',
        'permission_callback' => $acceso,
    ));
    register_rest_route('pieb/v1', '/cultos/papelera/(?P<id>\d+)/restaurar', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_cultos_papelera_restaurar',
        'permission_callback' => $acceso,
    ));
    register_rest_route('pieb/v1', '/cultos/papelera/(?P<id>\d+)', array(
        'methods'             => WP_REST_Server::DELETABLE,
        'callback'            => 'pieb_can_rest_cultos_papelera_eliminar',
        'permission_callback' => $acceso,
    ));
});

/** Un culto de la papelera que el usuario puede ver; si no, 404 como si no estuviera (no se revela lo de otras iglesias). */
function pieb_can_culto_en_papelera($id) {
    $post = get_post((int) $id);
    if (!$post || !pieb_can_culto_papelera_visible($post)) {
        return new WP_Error('pieb_no_papelera', __('Ese culto no está en la papelera.', 'pieb-cancionero'), array('status' => 404));
    }
    return $post;
}

/** Datos de un culto borrado para la lista de la papelera. */
function pieb_can_papelera_culto_item($post) {
    $dias = pieb_can_papelera_dias();
    $cuando = pieb_can_borrada_el($post->ID);
    $quien = get_userdata((int) get_post_meta($post->ID, '_pieb_borrada_por', true));
    $caduca = $dias ? $cuando + $dias * DAY_IN_SECONDS : 0;
    return array(
        'id'            => (int) $post->ID,
        'titulo'        => html_entity_decode(get_the_title($post), ENT_QUOTES, 'UTF-8'),
        'fecha'         => (string) get_post_meta($post->ID, '_pieb_fecha', true),
        'tipo'          => (string) get_post_meta($post->ID, '_pieb_tipo', true),
        'canciones'     => count(pieb_can_culto_items($post->ID)),
        'privado'       => pieb_can_culto_privado($post->ID),
        'mio'           => (int) $post->post_author === get_current_user_id(),
        'borradoEl'     => gmdate('c', $cuando),
        'borradoPor'    => $quien ? $quien->display_name : '',
        'caduca'        => $caduca ? gmdate('c', $caduca) : '',
        'diasRestantes' => $caduca ? max(0, (int) ceil(($caduca - time()) / DAY_IN_SECONDS)) : null,
    );
}

function pieb_can_rest_cultos_papelera_listar() {
    return rest_ensure_response(array(
        'cultos' => array_map('pieb_can_papelera_culto_item', pieb_can_cultos_papelera_visibles()),
        'dias'   => pieb_can_papelera_dias(),
    ));
}

function pieb_can_rest_cultos_papelera_restaurar(WP_REST_Request $request) {
    $post = pieb_can_culto_en_papelera($request['id']);
    if (is_wp_error($post)) {
        return $post;
    }
    wp_untrash_post($post->ID);
    delete_post_meta($post->ID, '_pieb_borrada_por');
    return rest_ensure_response(array('restaurado' => true, 'id' => (int) $post->ID));
}

function pieb_can_rest_cultos_papelera_eliminar(WP_REST_Request $request) {
    $post = pieb_can_culto_en_papelera($request['id']);
    if (is_wp_error($post)) {
        return $post;
    }
    wp_delete_post($post->ID, true);
    return rest_ensure_response(array('eliminado' => true, 'id' => (int) $post->ID));
}

/** Elimina para siempre los cultos de la papelera que ve quien pide (no los de otras iglesias ni los privados ajenos). */
function pieb_can_rest_cultos_papelera_vaciar() {
    @set_time_limit(120);
    $n = 0;
    foreach (pieb_can_cultos_papelera_visibles() as $post) {
        wp_delete_post($post->ID, true);
        $n++;
    }
    return rest_ensure_response(array('eliminados' => $n));
}
