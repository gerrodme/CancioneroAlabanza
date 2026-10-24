<?php
/**
 * Lectura y escritura de canciones.
 *
 * Metadatos de cada canción:
 *  _pieb_numero     Número en el himnario (texto, opcional)
 *  _pieb_autor      Autor / compositor
 *  _pieb_tonalidad  Tonalidad habitual
 *  _pieb_letra      Letra completa (texto plano)
 *  _pieb_notas      Notas internas
 *  _pieb_partituras array( array('id' => attachment_id, 'label' => 'Original'), ... )  (mínimo 1)
 *  _pieb_youtube    array( array('url' => '...', 'label' => 'Versión coral'), ... )
 *  _pieb_audios     array( array('id' => attachment_id, 'nombre' => 'Ensayo voces', 'descripcion' => '...'), ... )
 *  _pieb_editables  array( array('id' => attachment_id, 'descripcion' => 'Arreglo coro'), ... )  (MuseScore, MusicXML…)
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
            'error' => '«%s» no es un audio MP3, M4A, OGG, WAV o AAC.');
    }
    if ($tipo === 'editable') {
        return array('max' => PIEB_CAN_MAX_EDITABLE, 'tipos' => PIEB_CAN_TIPOS_EDITABLE, 'meta' => '_pieb_editable',
            'error' => '«%s» no es una partitura editable (MuseScore, MusicXML, Sibelius, Finale, Dorico, Guitar Pro, Encore, Capella, LilyPond o MIDI).');
    }
    return array('max' => PIEB_CAN_MAX_PARTITURA, 'tipos' => PIEB_CAN_TIPOS_PARTITURA, 'meta' => '_pieb_partitura',
        'error' => '«%s» no es un PDF ni una imagen JPG/PNG.');
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
    return is_array($items) ? array_values($items) : array();
}

function pieb_can_get_audios($post_id) {
    $items = get_post_meta($post_id, '_pieb_audios', true);
    return is_array($items) ? array_values($items) : array();
}

function pieb_can_get_editables($post_id) {
    $items = get_post_meta($post_id, '_pieb_editables', true);
    return is_array($items) ? array_values($items) : array();
}

function pieb_can_get_youtube($post_id) {
    $items = get_post_meta($post_id, '_pieb_youtube', true);
    return is_array($items) ? array_values($items) : array();
}

function pieb_can_youtube_id($url) {
    if (preg_match('~(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})~', $url, $m)) {
        return $m[1];
    }
    return '';
}

function pieb_can_etiquetas($post_id) {
    $terms = wp_get_object_terms($post_id, PIEB_CAN_TAX, array('fields' => 'names'));
    return is_wp_error($terms) ? array() : array_values($terms);
}

function pieb_can_usuario_puede_borrar($post) {
    return current_user_can(PIEB_CAN_CAP_GESTIONAR) || (int) $post->post_author === get_current_user_id();
}

/** Datos ligeros para el listado y la búsqueda. */
function pieb_can_resumen($post) {
    $partituras = pieb_can_get_partituras($post->ID);
    $thumb = '';
    if ($partituras) {
        $thumb = wp_get_attachment_image_url($partituras[0]['id'], 'medium');
    }

    return array(
        'id'          => $post->ID,
        'titulo'      => html_entity_decode(get_the_title($post), ENT_QUOTES, 'UTF-8'),
        'numero'      => (string) get_post_meta($post->ID, '_pieb_numero', true),
        'autor'       => (string) get_post_meta($post->ID, '_pieb_autor', true),
        'tonalidad'   => (string) get_post_meta($post->ID, '_pieb_tonalidad', true),
        'tempo'       => (string) get_post_meta($post->ID, '_pieb_tempo', true),
        'etiquetas'   => pieb_can_etiquetas($post->ID),
        'letra'       => (string) get_post_meta($post->ID, '_pieb_letra', true),
        'partituras'  => count($partituras),
        'youtube'     => count(pieb_can_get_youtube($post->ID)),
        'audios'      => count(pieb_can_get_audios($post->ID)),
        'editables'   => count(pieb_can_get_editables($post->ID)),
        'miniatura'   => $thumb ? $thumb : '',
        'creada'      => get_post_time('c', true, $post),
        'modificada'  => get_post_modified_time('c', true, $post),
    );
}

/** Ficha completa de una canción. */
function pieb_can_detalle($post) {
    $datos = pieb_can_resumen($post);

    $datos['notas'] = (string) get_post_meta($post->ID, '_pieb_notas', true);

    $datos['partituras'] = array();
    foreach (pieb_can_get_partituras($post->ID) as $p) {
        $url = wp_get_attachment_url($p['id']);
        if (!$url) {
            continue;
        }
        $file = get_attached_file($p['id']);
        $datos['partituras'][] = array(
            'id'        => (int) $p['id'],
            'label'     => (string) $p['label'],
            'url'       => $url,
            'tipo'      => get_post_mime_type($p['id']) === 'application/pdf' ? 'pdf' : 'imagen',
            'archivo'   => $file ? wp_basename($file) : '',
            'miniatura' => (string) wp_get_attachment_image_url($p['id'], 'large'),
        );
    }

    $datos['audios'] = array();
    foreach (pieb_can_get_audios($post->ID) as $a) {
        $url = wp_get_attachment_url($a['id']);
        if (!$url) {
            continue;
        }
        $meta = wp_get_attachment_metadata($a['id']);
        $file = get_attached_file($a['id']);
        $datos['audios'][] = array(
            'id'          => (int) $a['id'],
            'nombre'      => (string) $a['nombre'],
            'descripcion' => (string) $a['descripcion'],
            'url'         => $url,
            'archivo'     => $file ? wp_basename($file) : '',
            'duracion'    => is_array($meta) && !empty($meta['length_formatted']) ? $meta['length_formatted'] : '',
        );
    }

    $datos['editables'] = array();
    foreach (pieb_can_get_editables($post->ID) as $e) {
        $url = wp_get_attachment_url($e['id']);
        $file = get_attached_file($e['id']);
        if (!$url || !$file) {
            continue;
        }
        $datos['editables'][] = array(
            'id'          => (int) $e['id'],
            'descripcion' => (string) $e['descripcion'],
            'url'         => $url,
            'archivo'     => wp_basename($file),
            'tamano'      => file_exists($file) ? (int) filesize($file) : 0,
        );
    }

    $datos['youtube'] = array();
    foreach (pieb_can_get_youtube($post->ID) as $y) {
        $datos['youtube'][] = array(
            'url'     => $y['url'],
            'label'   => (string) $y['label'],
            'videoId' => pieb_can_youtube_id($y['url']),
        );
    }

    $author = get_userdata($post->post_author);
    $datos['subidaPor']   = $author ? $author->display_name : '';
    $datos['puedeBorrar'] = pieb_can_usuario_puede_borrar($post);

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
        return new WP_Error('pieb_subida', sprintf('No se pudo subir «%s» (error %d).', $file['name'], $file['error']));
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
        return new WP_Error('pieb_tamano', sprintf('«%s» pesa %s; el máximo es %s.', $file['name'], size_format($file['size'], 1), size_format($clase['max'])));
    }

    // Los editables se aceptan por su extensión: su contenido (ZIP, XML, binario propio…) no lo reconoce WordPress.
    $check = $tipo === 'editable'
        ? wp_check_filetype($file['name'], $clase['tipos'])
        : wp_check_filetype_and_ext($file['tmp_name'], $file['name'], $clase['tipos']);
    if (empty($check['ext']) || empty($check['type'])) {
        return new WP_Error('pieb_tipo', sprintf($clase['error'], $file['name']));
    }

    if ($tipo === 'editable') {
        pieb_can_permitir_editables(true);
    }
    $attachment_id = media_handle_sideload($file, $post_id, $titulo, array(
        'post_title' => $titulo,
    ));
    if ($tipo === 'editable') {
        pieb_can_permitir_editables(false);
    }

    if (!is_wp_error($attachment_id)) {
        update_post_meta($attachment_id, $clase['meta'], 1);
    }

    return $attachment_id;
}

/**
 * Mientras se guarda un editable, WordPress admite sus extensiones y lo coloca en uploads/pieb-editables,
 * una carpeta cuyo .htaccess obliga a descargar los archivos (un MusicXML no debe abrirse como página).
 */
function pieb_can_permitir_editables($activar) {
    if ($activar) {
        $dir = trailingslashit(wp_upload_dir()['basedir']) . 'pieb-editables';
        if (!is_dir($dir)) {
            wp_mkdir_p($dir);
        }
        if (!file_exists($dir . '/.htaccess')) {
            @file_put_contents($dir . '/.htaccess', "# Partituras editables del cancionero: siempre se descargan, nunca se abren en el navegador.\n"
                . "<IfModule mod_mime.c>\nForceType application/octet-stream\n</IfModule>\n"
                . "<IfModule mod_headers.c>\nHeader set Content-Disposition attachment\nHeader set X-Content-Type-Options nosniff\n</IfModule>\n");
        }
        add_filter('upload_mimes', 'pieb_can_mimes_editables');
        add_filter('wp_check_filetype_and_ext', 'pieb_can_tipo_editable', 10, 3);
        add_filter('upload_dir', 'pieb_can_dir_editables');
    } else {
        remove_filter('upload_mimes', 'pieb_can_mimes_editables');
        remove_filter('wp_check_filetype_and_ext', 'pieb_can_tipo_editable', 10);
        remove_filter('upload_dir', 'pieb_can_dir_editables');
    }
}

function pieb_can_mimes_editables($mimes) {
    return array_merge($mimes, PIEB_CAN_TIPOS_EDITABLE);
}

function pieb_can_tipo_editable($datos, $ruta, $nombre) {
    $tipo = wp_check_filetype($nombre, PIEB_CAN_TIPOS_EDITABLE);
    return $tipo['ext'] ? array('ext' => $tipo['ext'], 'type' => $tipo['type'], 'proper_filename' => false) : $datos;
}

function pieb_can_dir_editables($dir) {
    $dir['subdir'] = '/pieb-editables';
    $dir['path'] = $dir['basedir'] . '/pieb-editables';
    $dir['url'] = $dir['baseurl'] . '/pieb-editables';
    return $dir;
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
        return new WP_Error('pieb_subida', sprintf('No se encontró «%s» en el servidor: vuelve a elegir el archivo.', $nombre));
    }
    return array('name' => $nombre, 'type' => '', 'tmp_name' => $ruta, 'error' => UPLOAD_ERR_OK, 'size' => filesize($ruta));
}

/** Normaliza la lista de enlaces de YouTube recibida del formulario. */
function pieb_can_limpiar_youtube($items) {
    $limpio = array();
    foreach ((array) $items as $item) {
        $url = isset($item['url']) ? esc_url_raw(trim($item['url'])) : '';
        if (!$url || !pieb_can_youtube_id($url)) {
            continue;
        }
        $limpio[] = array(
            'url'   => $url,
            'label' => isset($item['label']) ? sanitize_text_field($item['label']) : '',
        );
    }
    return $limpio;
}

function pieb_can_limpiar_editable($attachment_id, $datos) {
    return array(
        'id'          => (int) $attachment_id,
        'descripcion' => isset($datos['descripcion']) ? sanitize_text_field($datos['descripcion']) : '',
    );
}

function pieb_can_limpiar_audio($attachment_id, $datos) {
    return array(
        'id'          => (int) $attachment_id,
        'nombre'      => isset($datos['nombre']) ? sanitize_text_field($datos['nombre']) : '',
        'descripcion' => isset($datos['descripcion']) ? sanitize_textarea_field($datos['descripcion']) : '',
    );
}
