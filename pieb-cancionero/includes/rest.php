<?php
/**
 * API REST del cancionero: /wp-json/pieb/v1/...
 * Todas las rutas exigen sesión iniciada con la capacidad de acceso al cancionero.
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', 'pieb_can_rest_rutas');

function pieb_can_rest_rutas() {
    $ns = 'pieb/v1';
    $acceso = 'pieb_can_rest_acceso';

    register_rest_route($ns, '/canciones', array(
        array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'pieb_can_rest_listar',
            'permission_callback' => $acceso,
        ),
        array(
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'pieb_can_rest_crear',
            'permission_callback' => $acceso,
        ),
    ));

    register_rest_route($ns, '/subidas', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_trozo',
        'permission_callback' => $acceso,
    ));

    register_rest_route($ns, '/canciones/(?P<id>\d+)', array(
        array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'pieb_can_rest_ver',
            'permission_callback' => $acceso,
        ),
        array(
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'pieb_can_rest_actualizar',
            'permission_callback' => $acceso,
        ),
        array(
            'methods'             => WP_REST_Server::DELETABLE,
            'callback'            => 'pieb_can_rest_borrar',
            'permission_callback' => $acceso,
        ),
    ));
}

function pieb_can_rest_acceso() {
    return current_user_can(PIEB_CAN_CAP_ACCESO);
}

/**
 * Recibe un trozo de un archivo. Los trozos llegan en orden y se añaden al final del archivo temporal;
 * así se suben audios de 10 MB aunque PHP solo acepte 2 MB por petición.
 */
function pieb_can_rest_trozo(WP_REST_Request $request) {
    $id = (string) $request->get_param('id');
    $tipo = $request->get_param('tipo') === 'audio' ? 'audio' : 'partitura';
    $nombre = sanitize_file_name((string) $request->get_param('nombre'));
    $total = (int) $request->get_param('total');
    $desde = (int) $request->get_param('desde');
    $max = $tipo === 'audio' ? PIEB_CAN_MAX_AUDIO : PIEB_CAN_MAX_PARTITURA;

    if (!preg_match('/^[a-f0-9]{32}$/', $id) || $nombre === '' || $total <= 0 || $desde < 0) {
        return new WP_Error('pieb_subida', 'Petición de subida no válida.', array('status' => 400));
    }
    if ($total > $max) {
        return new WP_Error('pieb_tamano', sprintf('«%s» pesa %s; el máximo es %s.', $nombre, size_format($total, 1), size_format($max)), array('status' => 400));
    }
    $extension = wp_check_filetype($nombre, $tipo === 'audio' ? PIEB_CAN_TIPOS_AUDIO : PIEB_CAN_TIPOS_PARTITURA);
    if (empty($extension['ext'])) {
        $msg = $tipo === 'audio' ? '«%s» no es un audio MP3, M4A, OGG, WAV o AAC.' : '«%s» no es un PDF ni una imagen JPG/PNG.';
        return new WP_Error('pieb_tipo', sprintf($msg, $nombre), array('status' => 400));
    }

    $files = $request->get_file_params();
    if (empty($files['trozo']['tmp_name']) || $files['trozo']['error'] !== UPLOAD_ERR_OK) {
        return new WP_Error('pieb_subida', 'No llegó el trozo del archivo.', array('status' => 400));
    }

    $ruta = pieb_can_ruta_trozo($id);
    if ($desde === 0) {
        pieb_can_limpiar_trozos();
        @unlink($ruta);
    }
    clearstatcache(true, $ruta);
    $actual = is_file($ruta) ? filesize($ruta) : 0;
    if ($actual !== $desde) {
        return new WP_Error('pieb_orden', 'La subida se interrumpió; vuelve a intentarlo.', array('status' => 409, 'recibido' => $actual));
    }
    $trozo = file_get_contents($files['trozo']['tmp_name']);
    if ($trozo === false || $actual + strlen($trozo) > $total) {
        return new WP_Error('pieb_subida', 'El trozo recibido no cuadra con el tamaño del archivo.', array('status' => 400));
    }
    if (file_put_contents($ruta, $trozo, FILE_APPEND | LOCK_EX) === false) {
        return new WP_Error('pieb_subida', 'El servidor no pudo guardar el archivo.', array('status' => 500));
    }

    $recibido = $actual + strlen($trozo);
    return rest_ensure_response(array('recibido' => $recibido, 'completo' => $recibido === $total));
}

function pieb_can_rest_cancion($id) {
    $post = get_post((int) $id);
    if (!$post || $post->post_type !== PIEB_CAN_CPT || $post->post_status !== 'publish') {
        return new WP_Error('pieb_no_existe', 'La canción no existe.', array('status' => 404));
    }
    return $post;
}

function pieb_can_rest_listar() {
    $posts = get_posts(array(
        'post_type'      => PIEB_CAN_CPT,
        'post_status'    => 'publish',
        'posts_per_page' => -1,
        'orderby'        => 'title',
        'order'          => 'ASC',
    ));

    update_meta_cache('post', wp_list_pluck($posts, 'ID'));

    return rest_ensure_response(array_map('pieb_can_resumen', $posts));
}

function pieb_can_rest_ver(WP_REST_Request $request) {
    $post = pieb_can_rest_cancion($request['id']);
    if (is_wp_error($post)) {
        return $post;
    }
    return rest_ensure_response(pieb_can_detalle($post));
}

function pieb_can_rest_crear(WP_REST_Request $request) {
    $titulo = sanitize_text_field((string) $request->get_param('titulo'));
    if ($titulo === '') {
        return new WP_Error('pieb_titulo', 'El título es obligatorio.', array('status' => 400));
    }

    $files = $request->get_file_params();
    $subidas = json_decode((string) $request->get_param('nuevasSubidas'), true);
    if (empty($files['nuevas']['name'][0]) && empty($subidas)) {
        return new WP_Error('pieb_partitura', 'Toda canción necesita al menos una partitura.', array('status' => 400));
    }

    $post_id = wp_insert_post(array(
        'post_type'   => PIEB_CAN_CPT,
        'post_status' => 'publish',
        'post_title'  => $titulo,
        'post_author' => get_current_user_id(),
    ), true);

    if (is_wp_error($post_id)) {
        return $post_id;
    }

    $resultado = pieb_can_guardar($post_id, $request, true);
    if (is_wp_error($resultado)) {
        // Sin partitura no hay canción: se deshace la creación.
        wp_delete_post($post_id, true);
        return $resultado;
    }

    return rest_ensure_response(pieb_can_detalle(get_post($post_id)));
}

function pieb_can_rest_actualizar(WP_REST_Request $request) {
    $post = pieb_can_rest_cancion($request['id']);
    if (is_wp_error($post)) {
        return $post;
    }

    $titulo = sanitize_text_field((string) $request->get_param('titulo'));
    if ($titulo === '') {
        return new WP_Error('pieb_titulo', 'El título es obligatorio.', array('status' => 400));
    }

    $resultado = pieb_can_guardar($post->ID, $request, false);
    if (is_wp_error($resultado)) {
        return $resultado;
    }

    wp_update_post(array('ID' => $post->ID, 'post_title' => $titulo));

    return rest_ensure_response(pieb_can_detalle(get_post($post->ID)));
}

function pieb_can_rest_borrar(WP_REST_Request $request) {
    $post = pieb_can_rest_cancion($request['id']);
    if (is_wp_error($post)) {
        return $post;
    }
    if (!pieb_can_usuario_puede_borrar($post)) {
        return new WP_Error('pieb_permiso', 'Solo quien subió la canción o un administrador puede borrarla.', array('status' => 403));
    }

    // A la papelera: un administrador puede recuperarla desde el escritorio.
    wp_trash_post($post->ID);

    return rest_ensure_response(array('borrada' => true, 'id' => $post->ID));
}

/**
 * Guarda campos, etiquetas, YouTube y partituras de una canción.
 * Valida antes de escribir para no dejar la canción sin partitura.
 */
function pieb_can_guardar($post_id, WP_REST_Request $request, $es_nueva) {
    $titulo = sanitize_text_field((string) $request->get_param('titulo'));

    // Partituras existentes que se conservan (solo se aceptan las que ya pertenecen a esta canción).
    $actuales = array();
    foreach (pieb_can_get_partituras($post_id) as $p) {
        $actuales[(int) $p['id']] = $p;
    }

    $conservar = array();
    if (!$es_nueva) {
        $enviadas = json_decode((string) $request->get_param('partituras'), true);
        foreach ((array) $enviadas as $p) {
            $id = isset($p['id']) ? (int) $p['id'] : 0;
            if (isset($actuales[$id])) {
                $conservar[] = array(
                    'id'    => $id,
                    'label' => isset($p['label']) ? sanitize_text_field($p['label']) : '',
                );
            }
        }
    }

    $files = $request->get_file_params();
    // Partituras nuevas subidas por trozos (o, como antes, dentro de esta misma petición).
    $subidas = json_decode((string) $request->get_param('nuevasSubidas'), true);
    $subidas = is_array($subidas) ? $subidas : array();
    $hay_nuevas = !empty($files['nuevas']['name'][0]) || $subidas;

    if (!$conservar && !$hay_nuevas) {
        return new WP_Error('pieb_partitura', 'Toda canción necesita al menos una partitura.', array('status' => 400));
    }

    $nuevas = array();
    if ($hay_nuevas) {
        $labels = json_decode((string) $request->get_param('nuevasLabels'), true);
        $labels = is_array($labels) ? $labels : array();

        foreach ($subidas as $s) {
            $file = pieb_can_archivo_subido(isset($s['id']) ? $s['id'] : '', isset($s['nombre']) ? $s['nombre'] : '');
            $attachment_id = is_wp_error($file) ? $file : pieb_can_adjuntar($file, $post_id, $titulo, 'partitura');
            if (is_wp_error($attachment_id)) {
                $attachment_id->add_data(array('status' => 400));
                return $attachment_id;
            }
            $nuevas[] = array(
                'id'    => (int) $attachment_id,
                'label' => isset($s['label']) ? sanitize_text_field($s['label']) : '',
            );
        }

        foreach (empty($files['nuevas']['name'][0]) ? array() : array_keys($files['nuevas']['name']) as $i) {
            $attachment_id = pieb_can_subir_archivo($files['nuevas'], $i, $post_id, $titulo, 'partitura');
            if (is_wp_error($attachment_id)) {
                $attachment_id->add_data(array('status' => 400));
                return $attachment_id;
            }
            $nuevas[] = array(
                'id'    => (int) $attachment_id,
                'label' => isset($labels[$i]) ? sanitize_text_field($labels[$i]) : '',
            );
        }
    }

    update_post_meta($post_id, '_pieb_partituras', array_merge($conservar, $nuevas));

    // Audios: se conservan los que ya eran de la canción (con nombre y descripción editables) y se suben los nuevos.
    $audios_actuales = array();
    foreach (pieb_can_get_audios($post_id) as $a) {
        $audios_actuales[(int) $a['id']] = $a;
    }
    $audios = array();
    foreach ((array) json_decode((string) $request->get_param('audios'), true) as $a) {
        $id = isset($a['id']) ? (int) $a['id'] : 0;
        if (isset($audios_actuales[$id])) {
            $audios[] = pieb_can_limpiar_audio($id, $a);
        }
    }
    if (!empty($files['audiosNuevos']['name'][0])) {
        $metas = json_decode((string) $request->get_param('audiosNuevosMeta'), true);
        $metas = is_array($metas) ? $metas : array();
        foreach (array_keys($files['audiosNuevos']['name']) as $i) {
            $attachment_id = pieb_can_subir_archivo($files['audiosNuevos'], $i, $post_id, $titulo, 'audio');
            if (is_wp_error($attachment_id)) {
                $attachment_id->add_data(array('status' => 400));
                return $attachment_id;
            }
            $meta = isset($metas[$i]) ? $metas[$i] : array();
            if (empty($meta['nombre'])) {
                $meta['nombre'] = preg_replace('/\.[^.]+$/', '', $files['audiosNuevos']['name'][$i]);
            }
            $audios[] = pieb_can_limpiar_audio($attachment_id, $meta);
        }
    }
    foreach ((array) json_decode((string) $request->get_param('audiosSubidos'), true) as $s) {
        $archivo = isset($s['archivo']) ? (string) $s['archivo'] : '';
        $file = pieb_can_archivo_subido(isset($s['id']) ? $s['id'] : '', $archivo);
        $attachment_id = is_wp_error($file) ? $file : pieb_can_adjuntar($file, $post_id, $titulo, 'audio');
        if (is_wp_error($attachment_id)) {
            $attachment_id->add_data(array('status' => 400));
            return $attachment_id;
        }
        if (empty($s['nombre'])) {
            $s['nombre'] = preg_replace('/\.[^.]+$/', '', $archivo);
        }
        $audios[] = pieb_can_limpiar_audio($attachment_id, $s);
    }
    update_post_meta($post_id, '_pieb_audios', $audios);

    foreach (pieb_can_campos_texto() as $campo => $meta_key) {
        update_post_meta($post_id, $meta_key, pieb_can_valor_campo($campo, $request->get_param($campo)));
    }
    update_post_meta($post_id, '_pieb_letra', sanitize_textarea_field((string) $request->get_param('letra')));
    update_post_meta($post_id, '_pieb_notas', sanitize_textarea_field((string) $request->get_param('notas')));

    $youtube = json_decode((string) $request->get_param('youtube'), true);
    update_post_meta($post_id, '_pieb_youtube', pieb_can_limpiar_youtube($youtube));

    $etiquetas = array_filter(array_map(function ($e) {
        return sanitize_text_field(trim($e));
    }, explode(',', (string) $request->get_param('etiquetas'))));
    wp_set_object_terms($post_id, array_values(array_unique($etiquetas)), PIEB_CAN_TAX);

    return true;
}
