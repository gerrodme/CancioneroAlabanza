<?php
/**
 * Archivos privados del cancionero.
 *
 * Las partituras, audios, editables y sus miniaturas se guardan en uploads/cancionero-privado/, una carpeta que el
 * servidor web no debe servir (.htaccess en Apache; en Nginx hace falta una regla, ver README). Se entregan a través de
 * WordPress con ?pcan_archivo=ID, solo a quien ha iniciado sesión y tiene acceso al cancionero.
 *
 * Los archivos subidos antes de la versión 1.5.0 se mueven desde Ajustes con «Proteger archivos existentes».
 */

if (!defined('ABSPATH')) {
    exit;
}

const PIEB_CAN_DIR_PRIVADO = 'cancionero-privado';
const PIEB_CAN_TANDA_PROTEGER = 50;

/**
 * Ruta absoluta de la carpeta privada (se crea con sus protecciones si no existe).
 * $base: carpeta uploads; hay que pasarla desde el filtro upload_dir, donde llamar a wp_upload_dir() sería recursivo.
 */
function pieb_can_ruta_privada($base = null) {
    $base = $base ? $base : wp_upload_dir()['basedir'];
    $dir = trailingslashit($base) . PIEB_CAN_DIR_PRIVADO;
    if (!is_dir($dir)) {
        wp_mkdir_p($dir);
    }
    if (!file_exists($dir . '/.htaccess')) {
        @file_put_contents($dir . '/.htaccess', "# Archivos privados del cancionero: solo se sirven a través de WordPress.\n"
            . "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n"
            . "<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n");
    }
    if (!file_exists($dir . '/index.php')) {
        @file_put_contents($dir . '/index.php', "<?php\n// Silencio.\n");
    }
    return $dir;
}

/** Filtro de upload_dir: todo lo que sube el cancionero va a la carpeta privada, sin subcarpetas por fecha. */
function pieb_can_dir_subidas($dir) {
    pieb_can_ruta_privada($dir['basedir']);
    $dir['subdir'] = '/' . PIEB_CAN_DIR_PRIVADO;
    $dir['path'] = $dir['basedir'] . '/' . PIEB_CAN_DIR_PRIVADO;
    $dir['url'] = $dir['baseurl'] . '/' . PIEB_CAN_DIR_PRIVADO;
    return $dir;
}

/** ¿Es un archivo del cancionero (partitura, audio o editable)? */
function pieb_can_es_archivo_cancionero($id) {
    $id = (int) $id;
    if (!$id || get_post_type($id) !== 'attachment') {
        return false;
    }
    foreach (array('_pieb_partitura', '_pieb_audio', '_pieb_editable') as $meta) {
        if (get_post_meta($id, $meta, true)) {
            return true;
        }
    }
    $padre = wp_get_post_parent_id($id);
    return $padre && get_post_type($padre) === PIEB_CAN_CPT;
}

/** Dirección autenticada de un archivo; $tam: '', 'thumbnail', 'medium' o 'large' (miniaturas de imagen/PDF). */
function pieb_can_url_archivo($id, $tam = '') {
    $args = array('pcan_archivo' => (int) $id);
    if ($tam) {
        $args['t'] = $tam;
    }
    return add_query_arg($args, home_url('/'));
}

/**
 * Archivo de la miniatura de un adjunto para el tamaño pedido (o el más parecido que exista), o null si no hay.
 * Los PDF tienen una vista previa en JPG; las imágenes pequeñas pueden no tener miniaturas (se usa el original).
 *
 * @return array|null array('ruta' => ..., 'tipo' => ...)
 */
function pieb_can_miniatura_de($id, $tam) {
    $meta = wp_get_attachment_metadata((int) $id);
    $original = get_attached_file((int) $id);
    if (is_array($meta) && !empty($meta['sizes']) && $original) {
        $orden = array_unique(array($tam, 'large', 'medium_large', 'medium', 'thumbnail', 'full'));
        foreach ($orden as $clave) {
            if (!empty($meta['sizes'][$clave]['file'])) {
                $ruta = trailingslashit(dirname($original)) . $meta['sizes'][$clave]['file'];
                if (is_file($ruta)) {
                    $tipo = !empty($meta['sizes'][$clave]['mime-type']) ? $meta['sizes'][$clave]['mime-type'] : (wp_check_filetype($ruta)['type'] ?: 'image/jpeg');
                    return array('ruta' => $ruta, 'tipo' => $tipo);
                }
            }
        }
    }
    $mime = (string) get_post_mime_type((int) $id);
    if ($original && strpos($mime, 'image/') === 0 && is_file($original)) {
        return array('ruta' => $original, 'tipo' => $mime);
    }
    return null;
}

/** Dirección de la miniatura de una partitura, o '' si no hay (p. ej. un PDF sin vista previa). */
function pieb_can_url_miniatura($id, $tam) {
    return pieb_can_miniatura_de($id, $tam) ? pieb_can_url_archivo($id, $tam) : '';
}

// ---------------------------------------------------------------- entrega del archivo

add_action('init', 'pieb_can_servir_archivo', 1);

function pieb_can_servir_archivo() {
    if (!isset($_GET['pcan_archivo'])) {
        return;
    }
    if (!defined('DONOTCACHEPAGE')) {
        define('DONOTCACHEPAGE', true);
    }
    $id = (int) $_GET['pcan_archivo'];

    if (!is_user_logged_in() || !current_user_can(PIEB_CAN_CAP_ACCESO)) {
        pieb_can_error_archivo(403, __('Inicia sesión en el cancionero para ver este archivo.', 'pieb-cancionero'));
    }
    if (!pieb_can_es_archivo_cancionero($id)) {
        pieb_can_error_archivo(404, __('Archivo no encontrado.', 'pieb-cancionero'));
    }
    // Los archivos de canciones borradas solo los ve quien gestiona el cancionero.
    $padre = wp_get_post_parent_id($id);
    if ($padre && get_post_status($padre) === 'trash' && !current_user_can(PIEB_CAN_CAP_GESTIONAR)) {
        pieb_can_error_archivo(404, __('Archivo no encontrado.', 'pieb-cancionero'));
    }

    $base = realpath(wp_upload_dir()['basedir']);
    $ruta = get_attached_file($id);
    $mime = get_post_mime_type($id);

    $tam = isset($_GET['t']) ? sanitize_key(wp_unslash($_GET['t'])) : '';
    if ($tam && in_array($tam, array('thumbnail', 'medium', 'large'), true)) {
        $mini = pieb_can_miniatura_de($id, $tam);
        if ($mini) {
            $ruta = $mini['ruta'];
            $mime = $mini['tipo'];
        }
    }

    $real = $ruta ? realpath($ruta) : false;
    if (!$real || !$base || strpos($real, $base) !== 0 || !is_file($real)) {
        pieb_can_error_archivo(404, __('Archivo no encontrado.', 'pieb-cancionero'));
    }

    $editable = (bool) get_post_meta($id, '_pieb_editable', true);
    $descargar = $editable || !empty($_GET['descargar']);
    $tamano = (int) filesize($real);
    $desde = 0;
    $hasta = $tamano - 1;
    $parcial = false;

    // Peticiones parciales (el navegador las usa para avanzar en un audio).
    if (!empty($_SERVER['HTTP_RANGE']) && preg_match('/^bytes=(\d*)-(\d*)$/', trim($_SERVER['HTTP_RANGE']), $m) && ($m[1] !== '' || $m[2] !== '')) {
        if ($m[1] === '') {
            $desde = max(0, $tamano - (int) $m[2]);
        } else {
            $desde = (int) $m[1];
            if ($m[2] !== '') {
                $hasta = min($hasta, (int) $m[2]);
            }
        }
        if ($desde > $hasta || $desde >= $tamano) {
            status_header(416);
            header('Content-Range: bytes */' . $tamano);
            exit;
        }
        $parcial = true;
    }

    // El navegador puede guardar el archivo, pero debe preguntar al servidor cada vez (no-cache): así, tras cerrar sesión,
    // no se puede volver a abrir desde la caché. Si no ha cambiado, el servidor responde 304 sin reenviarlo.
    $modificado = (int) filemtime($real);
    $etag = '"' . md5($id . '|' . $real . '|' . $modificado . '|' . $tamano) . '"';
    header('ETag: ' . $etag);
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $modificado) . ' GMT');
    header('Cache-Control: private, no-cache, must-revalidate');
    if (!$parcial && isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim(wp_unslash($_SERVER['HTTP_IF_NONE_MATCH'])) === $etag) {
        status_header(304);
        exit;
    }

    while (ob_get_level()) {
        ob_end_clean();
    }
    status_header($parcial ? 206 : 200);
    header('Content-Type: ' . ($mime ? $mime : 'application/octet-stream'));
    header('Content-Length: ' . ($hasta - $desde + 1));
    header('Accept-Ranges: bytes');
    if ($parcial) {
        header('Content-Range: bytes ' . $desde . '-' . $hasta . '/' . $tamano);
    }
    $nombre = wp_basename($real);
    header('Content-Disposition: ' . ($descargar ? 'attachment' : 'inline') . "; filename*=UTF-8''" . rawurlencode($nombre));
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');

    $f = fopen($real, 'rb');
    if ($f) {
        fseek($f, $desde);
        $restante = $hasta - $desde + 1;
        while ($restante > 0 && !feof($f)) {
            $trozo = fread($f, min(8192 * 8, $restante));
            if ($trozo === false) {
                break;
            }
            echo $trozo;
            $restante -= strlen($trozo);
            flush();
        }
        fclose($f);
    }
    exit;
}

function pieb_can_error_archivo($codigo, $texto) {
    nocache_headers();
    status_header($codigo);
    header('Content-Type: text/plain; charset=utf-8');
    echo $texto;
    exit;
}

// ---------------------------------------------------------------- mover los archivos que ya existían

add_action('rest_api_init', function () {
    $gestionar = function () { return current_user_can(PIEB_CAN_CAP_GESTIONAR); };
    register_rest_route('pieb/v1', '/archivos/estado', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'pieb_can_rest_archivos_estado',
        'permission_callback' => $gestionar,
    ));
    register_rest_route('pieb/v1', '/archivos/proteger', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_archivos_proteger',
        'permission_callback' => $gestionar,
    ));
});

/** IDs de archivos del cancionero que aún están fuera de la carpeta privada. */
function pieb_can_archivos_sin_proteger($limite = -1) {
    $ids = get_posts(array(
        'post_type'      => 'attachment',
        'post_status'    => 'any',
        'posts_per_page' => -1,
        'fields'         => 'ids',
        'meta_query'     => array(
            'relation' => 'OR',
            array('key' => '_pieb_partitura', 'compare' => 'EXISTS'),
            array('key' => '_pieb_audio', 'compare' => 'EXISTS'),
            array('key' => '_pieb_editable', 'compare' => 'EXISTS'),
        ),
    ));
    $pendientes = array();
    foreach ($ids as $id) {
        $rel = (string) get_post_meta($id, '_wp_attached_file', true);
        if ($rel !== '' && strpos($rel, PIEB_CAN_DIR_PRIVADO . '/') !== 0) {
            $pendientes[] = (int) $id;
            if ($limite > 0 && count($pendientes) >= $limite) {
                break;
            }
        }
    }
    return $pendientes;
}

/**
 * Comprueba si el servidor entrega directamente un archivo de la carpeta privada.
 *
 * @return string 'protegido', 'expuesto' o 'desconocido'
 */
function pieb_can_comprobar_proteccion() {
    $dir = pieb_can_ruta_privada();
    $prueba = $dir . '/prueba.txt';
    if (!file_exists($prueba)) {
        @file_put_contents($prueba, 'Si ves esto sin iniciar sesión, la carpeta no está protegida.');
    }
    $respuesta = wp_remote_get(trailingslashit(wp_upload_dir()['baseurl']) . PIEB_CAN_DIR_PRIVADO . '/prueba.txt', array(
        'timeout'     => 8,
        'redirection' => 0,
        'cookies'     => array(),
    ));
    if (is_wp_error($respuesta)) {
        return 'desconocido';
    }
    $codigo = (int) wp_remote_retrieve_response_code($respuesta);
    if ($codigo === 200) {
        return 'expuesto';
    }
    return in_array($codigo, array(401, 403, 404), true) ? 'protegido' : 'desconocido';
}

function pieb_can_rest_archivos_estado() {
    return rest_ensure_response(array(
        'pendientes' => count(pieb_can_archivos_sin_proteger()),
        'proteccion' => pieb_can_comprobar_proteccion(),
        'tanda'      => PIEB_CAN_TANDA_PROTEGER,
    ));
}

function pieb_can_rest_archivos_proteger() {
    @set_time_limit(120);
    $privada = pieb_can_ruta_privada();
    $movidos = 0;
    $fallos = array();
    foreach (pieb_can_archivos_sin_proteger(PIEB_CAN_TANDA_PROTEGER) as $id) {
        $error = pieb_can_mover_a_privada($id, $privada);
        if ($error) {
            $fallos[] = array('id' => $id, 'archivo' => wp_basename((string) get_post_meta($id, '_wp_attached_file', true)), 'motivo' => $error);
        } else {
            $movidos++;
        }
    }
    // Los que han fallado seguirán pendientes: no se cuentan como restantes para no repetir la tanda sin fin.
    $restantes = max(0, count(pieb_can_archivos_sin_proteger()) - count($fallos));
    return rest_ensure_response(array('movidos' => $movidos, 'fallos' => $fallos, 'restantes' => $restantes));
}

/** Mueve el archivo de un adjunto (y sus miniaturas) a la carpeta privada. Devuelve '' si todo fue bien o el motivo del fallo. */
function pieb_can_mover_a_privada($id, $privada) {
    $base = trailingslashit(wp_upload_dir()['basedir']);
    $rel = (string) get_post_meta($id, '_wp_attached_file', true);
    $origen = $base . $rel;
    if ($rel === '' || !is_file($origen)) {
        return __('El archivo no está en el servidor.', 'pieb-cancionero');
    }

    $nombre = wp_unique_filename($privada, wp_basename($origen));
    if (!@rename($origen, $privada . '/' . $nombre)) {
        if (!@copy($origen, $privada . '/' . $nombre)) {
            return __('No se pudo mover (permisos del servidor).', 'pieb-cancionero');
        }
        @unlink($origen);
    }
    update_post_meta($id, '_wp_attached_file', PIEB_CAN_DIR_PRIVADO . '/' . $nombre);

    $meta = wp_get_attachment_metadata($id);
    if (is_array($meta)) {
        $dir_origen = trailingslashit(dirname($origen));
        if (isset($meta['file'])) {
            $meta['file'] = PIEB_CAN_DIR_PRIVADO . '/' . $nombre;
        }
        if (!empty($meta['original_image'])) {
            $meta['original_image'] = pieb_can_mover_auxiliar($dir_origen, $meta['original_image'], $privada);
        }
        if (!empty($meta['sizes']) && is_array($meta['sizes'])) {
            foreach ($meta['sizes'] as $clave => $tam) {
                if (!empty($tam['file'])) {
                    $meta['sizes'][$clave]['file'] = pieb_can_mover_auxiliar($dir_origen, $tam['file'], $privada);
                }
            }
        }
        wp_update_attachment_metadata($id, $meta);
    }
    return '';
}

/** Mueve un archivo auxiliar (miniatura) y devuelve su nuevo nombre; si no existe, conserva el nombre. */
function pieb_can_mover_auxiliar($dir_origen, $nombre, $privada) {
    $origen = $dir_origen . $nombre;
    if (!is_file($origen)) {
        return $nombre;
    }
    $nuevo = wp_unique_filename($privada, wp_basename($nombre));
    if (!@rename($origen, $privada . '/' . $nuevo)) {
        if (!@copy($origen, $privada . '/' . $nuevo)) {
            return $nombre;
        }
        @unlink($origen);
    }
    return $nuevo;
}

// Las páginas públicas de adjuntos de WordPress (?attachment_id=N) mostrarían el título y el nombre de cada partitura:
// para los archivos del cancionero responden 404.
add_action('template_redirect', function () {
    if (is_attachment() && pieb_can_es_archivo_cancionero(get_queried_object_id())) {
        global $wp_query;
        $wp_query->set_404();
        status_header(404);
        nocache_headers();
        include get_404_template();
        exit;
    }
});
