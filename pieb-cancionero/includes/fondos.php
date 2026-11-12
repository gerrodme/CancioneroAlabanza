<?php
/**
 * Fondos de las letras: imágenes que sube un administrador para las diapositivas de letras (PowerPoint y PDF).
 *
 * No son partituras ni tienen derechos de autor: van a la biblioteca de medios normal (como el logo de la escaleta), nunca a
 * la carpeta privada del cancionero. Se guardan como una lista de IDs de adjunto en la opción «pieb_can_fondos» (sin autoload).
 * No llevan las marcas _pieb_* de los archivos del cancionero, así que no salen como «archivos sin usar» (/huerfanos) ni se
 * mueven a la carpeta privada. Las copias de seguridad no las incluyen (igual que las imágenes de la escaleta).
 *
 *   GET    /fondos        → { fondos: [{ id, url, miniatura }] }   (acceso)
 *   POST   /fondos        → {id, url, miniatura}  multipart «archivo» (gestionar; JPG o PNG, máx. 5 MB, máx. 40 fondos)
 *   DELETE /fondos/{id}   → { fondos: [...] }                       (gestionar)
 */

if (!defined('ABSPATH')) {
    exit;
}

const PIEB_CAN_FONDOS_MAX        = 40;
const PIEB_CAN_FONDOS_MAX_IMAGEN = 5 * 1048576;
const PIEB_CAN_FONDOS_TIPOS      = array(
    'jpg|jpeg' => 'image/jpeg',
    'png'      => 'image/png',
);

add_action('rest_api_init', function () {
    register_rest_route('pieb/v1', '/fondos', array(
        array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'pieb_can_rest_fondos_ver',
            'permission_callback' => 'pieb_can_rest_acceso',
        ),
        array(
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'pieb_can_rest_fondos_subir',
            'permission_callback' => function () { return current_user_can(PIEB_CAN_CAP_GESTIONAR); },
        ),
    ));
    register_rest_route('pieb/v1', '/fondos/(?P<id>\d+)', array(
        'methods'             => WP_REST_Server::DELETABLE,
        'callback'            => 'pieb_can_rest_fondos_borrar',
        'permission_callback' => function () { return current_user_can(PIEB_CAN_CAP_GESTIONAR); },
    ));
});

/** IDs guardados (enteros, sin repetir). */
function pieb_can_fondos_ids() {
    $ids = get_option('pieb_can_fondos', array());
    return is_array($ids) ? array_values(array_unique(array_filter(array_map('intval', $ids)))) : array();
}

/** {id, url, miniatura} de un fondo, o null si el adjunto ya no existe. */
function pieb_can_fondo_item($id) {
    $url = wp_get_attachment_image_url($id, 'full');
    if (!$url) {
        return null;
    }
    $mini = wp_get_attachment_image_url($id, 'medium');
    return array('id' => (int) $id, 'url' => (string) $url, 'miniatura' => (string) ($mini ? $mini : $url));
}

/** Lista de fondos existentes (omite los adjuntos que se hayan borrado de la biblioteca). */
function pieb_can_fondos_lista() {
    $lista = array();
    foreach (pieb_can_fondos_ids() as $id) {
        $item = pieb_can_fondo_item($id);
        if ($item) {
            $lista[] = $item;
        }
    }
    return $lista;
}

function pieb_can_rest_fondos_ver() {
    return rest_ensure_response(array('fondos' => pieb_can_fondos_lista()));
}

/** Sube un fondo (multipart, campo «archivo») a la biblioteca de medios normal y lo añade al final de la lista. */
function pieb_can_rest_fondos_subir(WP_REST_Request $request) {
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';

    $ids = pieb_can_fondos_ids();
    if (count($ids) >= PIEB_CAN_FONDOS_MAX) {
        return new WP_Error('pieb_fondos_max', sprintf(
            /* translators: %d: número máximo de imágenes de fondo */
            __('Ya hay %d imágenes de fondo, que es el máximo. Borra alguna para subir otra.', 'pieb-cancionero'),
            PIEB_CAN_FONDOS_MAX
        ), array('status' => 400));
    }

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
    if ($tamano > PIEB_CAN_FONDOS_MAX_IMAGEN) {
        return new WP_Error('pieb_tamano', sprintf(
            /* translators: 1: nombre del archivo, 2: tamaño del archivo, 3: tamaño máximo permitido */
            __('«%1$s» pesa %2$s; el máximo es %3$s.', 'pieb-cancionero'),
            $nombre,
            size_format($tamano, 1),
            size_format(PIEB_CAN_FONDOS_MAX_IMAGEN)
        ), array('status' => 400));
    }

    // Se comprueba el contenido real de la imagen, no solo la extensión.
    $tipo = wp_check_filetype_and_ext($f['tmp_name'], $nombre, PIEB_CAN_FONDOS_TIPOS);
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

    $ids[] = (int) $id;
    update_option('pieb_can_fondos', $ids, false);
    return rest_ensure_response(pieb_can_fondo_item($id));
}

/** Quita un fondo de la lista y borra su imagen de la biblioteca. */
function pieb_can_rest_fondos_borrar(WP_REST_Request $request) {
    $id = (int) $request['id'];
    $ids = pieb_can_fondos_ids();
    if (!in_array($id, $ids, true)) {
        return new WP_Error('pieb_fondo', __('Esa imagen de fondo no existe.', 'pieb-cancionero'), array('status' => 404));
    }
    update_option('pieb_can_fondos', array_values(array_diff($ids, array($id))), false);
    wp_delete_attachment($id, true);
    return rest_ensure_response(array('fondos' => pieb_can_fondos_lista()));
}
