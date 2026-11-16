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

    // Manifiesto web para el acceso directo de la página. Es una ruta REST (y no un parámetro de la propia página)
    // porque la página con sesión no se cachea y así el manifiesto sí puede cachearse; solo contiene el nombre del
    // cancionero y direcciones públicas, nada privado.
    register_rest_route($ns, '/manifest', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'pieb_can_rest_manifest',
        'permission_callback' => '__return_true',
        'args'                => array('pagina' => array('sanitize_callback' => 'absint')),
    ));

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

    register_rest_route($ns, '/etiquetas', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => function () { return rest_ensure_response((object) pieb_can_colores_etiquetas()); },
        'permission_callback' => $acceso,
    ));

    // Etiquetar o desetiquetar varias canciones de golpe (la interfaz lo llama por tandas).
    register_rest_route($ns, '/canciones/etiquetar', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_etiquetar',
        'permission_callback' => $acceso,
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

    // Tonalidad habitual y partitura principal de la iglesia activa (solo su administración).
    register_rest_route($ns, '/canciones/(?P<id>\d+)/iglesia', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_cancion_iglesia',
        'permission_callback' => $acceso,
    ));

    // Publicar un audio en todas las iglesias, o retirarlo (solo el administrador central).
    register_rest_route($ns, '/canciones/(?P<id>\d+)/audios/(?P<audio>\d+)/universal', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_audio_universal',
        'permission_callback' => $acceso,
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
    $clase = pieb_can_clase_archivo((string) $request->get_param('tipo'));
    $nombre = sanitize_file_name((string) $request->get_param('nombre'));
    $total = (int) $request->get_param('total');
    $desde = (int) $request->get_param('desde');
    $max = $clase['max'];

    if (!preg_match('/^[a-f0-9]{32}$/', $id) || $nombre === '' || $total <= 0 || $desde < 0) {
        return new WP_Error('pieb_subida', __('Petición de subida no válida.', 'pieb-cancionero'), array('status' => 400));
    }
    if ($total > $max) {
        return new WP_Error('pieb_tamano', sprintf(
            /* translators: 1: nombre del archivo, 2: tamaño del archivo, 3: tamaño máximo permitido */
            __('«%1$s» pesa %2$s; el máximo es %3$s.', 'pieb-cancionero'),
            $nombre,
            size_format($total, 1),
            size_format($max)
        ), array('status' => 400));
    }
    $extension = wp_check_filetype($nombre, $clase['tipos']);
    if (empty($extension['ext'])) {
        return new WP_Error('pieb_tipo', sprintf($clase['error'], $nombre), array('status' => 400));
    }

    $files = $request->get_file_params();
    if (empty($files['trozo']['tmp_name']) || $files['trozo']['error'] !== UPLOAD_ERR_OK) {
        return new WP_Error('pieb_subida', __('No llegó el trozo del archivo.', 'pieb-cancionero'), array('status' => 400));
    }

    $ruta = pieb_can_ruta_trozo($id);
    if ($desde === 0) {
        pieb_can_limpiar_trozos();
        @unlink($ruta);
    }
    clearstatcache(true, $ruta);
    $actual = is_file($ruta) ? filesize($ruta) : 0;
    if ($actual !== $desde) {
        return new WP_Error('pieb_orden', __('La subida se interrumpió; vuelve a intentarlo.', 'pieb-cancionero'), array('status' => 409, 'recibido' => $actual));
    }
    $trozo = file_get_contents($files['trozo']['tmp_name']);
    if ($trozo === false || $actual + strlen($trozo) > $total) {
        return new WP_Error('pieb_subida', __('El trozo recibido no cuadra con el tamaño del archivo.', 'pieb-cancionero'), array('status' => 400));
    }
    if (file_put_contents($ruta, $trozo, FILE_APPEND | LOCK_EX) === false) {
        return new WP_Error('pieb_subida', __('El servidor no pudo guardar el archivo.', 'pieb-cancionero'), array('status' => 500));
    }

    $recibido = $actual + strlen($trozo);
    return rest_ensure_response(array('recibido' => $recibido, 'completo' => $recibido === $total));
}

/** Canción publicada; con $con_papelera, quien gestiona el cancionero también puede ver las borradas. */
function pieb_can_rest_cancion($id, $con_papelera = false) {
    $post = get_post((int) $id);
    $estado_ok = $post && ($post->post_status === 'publish' || ($con_papelera && $post->post_status === 'trash' && current_user_can(PIEB_CAN_CAP_GESTIONAR)));
    if (!$post || $post->post_type !== PIEB_CAN_CPT || !$estado_ok) {
        return new WP_Error('pieb_no_existe', __('La canción no existe.', 'pieb-cancionero'), array('status' => 404));
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

    // La iglesia activa se calcula una vez para todo el listado.
    $activa = (int) pieb_can_iglesia_activa();
    return rest_ensure_response(array_map(function ($p) use ($activa) {
        return pieb_can_resumen($p, $activa);
    }, $posts));
}

function pieb_can_rest_ver(WP_REST_Request $request) {
    $post = pieb_can_rest_cancion($request['id'], true);
    if (is_wp_error($post)) {
        return $post;
    }
    return rest_ensure_response(pieb_can_detalle($post));
}

function pieb_can_rest_crear(WP_REST_Request $request) {
    $titulo = sanitize_text_field((string) $request->get_param('titulo'));
    if ($titulo === '') {
        return new WP_Error('pieb_titulo', __('El título es obligatorio.', 'pieb-cancionero'), array('status' => 400));
    }

    $files = $request->get_file_params();
    $subidas = json_decode((string) $request->get_param('nuevasSubidas'), true);
    if (empty($files['nuevas']['name'][0]) && empty($subidas)) {
        return new WP_Error('pieb_partitura', __('Toda canción necesita al menos una partitura.', 'pieb-cancionero'), array('status' => 400));
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
        return new WP_Error('pieb_titulo', __('El título es obligatorio.', 'pieb-cancionero'), array('status' => 400));
    }

    $resultado = pieb_can_guardar($post->ID, $request, false);
    if (is_wp_error($resultado)) {
        return $resultado;
    }

    // Con varias iglesias, el título solo lo cambia quien puede (ver pieb_can_puede_campo): si no, se conserva el actual.
    if (pieb_can_puede_campo('titulo', $post)) {
        if (html_entity_decode($titulo, ENT_QUOTES, 'UTF-8') !== html_entity_decode((string) $post->post_title, ENT_QUOTES, 'UTF-8')) {
            pieb_can_registrar_campos_autor($post->ID, array('titulo'));
        }
        wp_update_post(array('ID' => $post->ID, 'post_title' => $titulo));
    }

    return rest_ensure_response(pieb_can_detalle(get_post($post->ID)));
}

/**
 * Cambia la tonalidad habitual y/o la partitura principal de la canción para la iglesia activa. Cuerpo JSON
 * { tonalidad?, principal? }: solo se tocan las claves que llegan. Solo la administración de la iglesia (o el central).
 */
function pieb_can_rest_cancion_iglesia(WP_REST_Request $request) {
    $post = pieb_can_rest_cancion($request['id']);
    if (is_wp_error($post)) {
        return $post;
    }
    if (!pieb_can_es_admin_iglesia()) {
        return new WP_Error('pieb_permiso', __('Solo la administración de la iglesia puede cambiar esto.', 'pieb-cancionero'), array('status' => 403));
    }
    $params = $request->get_json_params();
    $params = is_array($params) ? $params : array();

    $cambios = array();
    if (array_key_exists('tonalidad', $params)) {
        $tono = is_scalar($params['tonalidad']) ? sanitize_text_field((string) $params['tonalidad']) : '';
        if ($tono !== '') {
            $clave = pieb_can_tono_clave($tono);
            if ($clave === pieb_can_tono_clave(get_post_meta($post->ID, '_pieb_tonalidad', true))) {
                $tono = ''; // igual que la original: se guarda vacía (sigue a la original)
            } else {
                $elegida = null;
                foreach (pieb_can_tonalidades($post->ID) as $t) {
                    if (pieb_can_tono_clave($t) === $clave) {
                        $elegida = $t;
                        break;
                    }
                }
                if ($elegida === null) {
                    return new WP_Error('pieb_tonalidad', __('Esa tonalidad no está entre las de la canción.', 'pieb-cancionero'), array('status' => 400));
                }
                $tono = $elegida;
            }
        }
        $cambios['tonalidad'] = $tono;
    }
    if (array_key_exists('principal', $params)) {
        $principal = is_scalar($params['principal']) ? (int) $params['principal'] : 0;
        if ($principal && !in_array($principal, array_map('intval', wp_list_pluck(pieb_can_get_partituras($post->ID), 'id')), true)) {
            return new WP_Error('pieb_principal', __('Esa partitura no es de la canción.', 'pieb-cancionero'), array('status' => 400));
        }
        $cambios['principal'] = $principal;
    }
    if ($cambios) {
        pieb_can_cancion_iglesia_guardar($post->ID, 0, $cambios);
    }
    return rest_ensure_response(pieb_can_detalle(get_post($post->ID)));
}

/** Marca un audio como universal (lo ven todas las iglesias) o lo devuelve a su iglesia. Solo el central, con varias iglesias. */
function pieb_can_rest_audio_universal(WP_REST_Request $request) {
    $post = pieb_can_rest_cancion($request['id']);
    if (is_wp_error($post)) {
        return $post;
    }
    if (!pieb_can_proteccion_activa() || !pieb_can_es_central()) {
        return new WP_Error('pieb_permiso', __('Solo el administrador central puede publicar un audio en todas las iglesias.', 'pieb-cancionero'), array('status' => 403));
    }
    $params = $request->get_json_params();
    $params = is_array($params) ? $params : array();
    $valor = isset($params['universal']) ? $params['universal'] : false;
    $universal = $valor === true || $valor === 1 || $valor === '1' || $valor === 'true';

    $audio_id = (int) $request['audio'];
    $items = get_post_meta($post->ID, '_pieb_audios', true);
    $items = is_array($items) ? array_values($items) : array();
    $encontrado = false;
    foreach ($items as $i => $a) {
        if (!is_array($a) || (int) (isset($a['id']) ? $a['id'] : 0) !== $audio_id) {
            continue;
        }
        // Se fijan también su autor e iglesia (los que se deducían al leer) para que no cambien al cambiar la lista.
        $completo = pieb_can_con_origen(array($a), $post->ID);
        $a = $completo[0];
        if ($universal) {
            $a['universal'] = 1;
        } else {
            unset($a['universal']);
        }
        $items[$i] = $a;
        $encontrado = true;
        break;
    }
    if (!$encontrado) {
        return new WP_Error('pieb_no_existe', __('La canción no tiene ese audio.', 'pieb-cancionero'), array('status' => 404));
    }
    update_post_meta($post->ID, '_pieb_audios', $items);
    return rest_ensure_response(pieb_can_detalle(get_post($post->ID)));
}

function pieb_can_rest_borrar(WP_REST_Request $request) {
    $post = pieb_can_rest_cancion($request['id']);
    if (is_wp_error($post)) {
        return $post;
    }
    if (!pieb_can_puede_borrar_cancion($post)) {
        $mensaje = pieb_can_proteccion_activa()
            ? __('Solo quien subió la canción o el administrador central puede borrarla.', 'pieb-cancionero')
            : __('Solo quien subió la canción o un administrador puede borrarla.', 'pieb-cancionero');
        return new WP_Error('pieb_permiso', $mensaje, array('status' => 403));
    }

    // A la papelera del cancionero: un administrador puede verla, restaurarla o eliminarla para siempre.
    wp_trash_post($post->ID);
    // Si WordPress tiene la papelera desactivada (EMPTY_TRASH_DAYS = 0) la entrada ya se habrá eliminado.
    if (get_post_status($post->ID) !== 'trash') {
        return rest_ensure_response(array('borrada' => true, 'id' => $post->ID, 'definitiva' => true));
    }

    // Aviso por correo a los administradores, agrupado con los borrados seguidos (ver includes/avisos.php).
    pieb_can_aviso_borrado_encolar($post->ID);

    return rest_ensure_response(array('borrada' => true, 'id' => $post->ID));
}

/**
 * Guarda campos, etiquetas, YouTube y partituras de una canción.
 * Valida antes de escribir para no dejar la canción sin partitura.
 */
function pieb_can_guardar($post_id, WP_REST_Request $request, $es_nueva) {
    $titulo = sanitize_text_field((string) $request->get_param('titulo'));
    $post = get_post($post_id);
    // Con varias iglesias, el título ajeno no se cambia (ver pieb_can_puede_campo): los archivos nuevos usan el actual.
    if (!$es_nueva && !pieb_can_puede_campo('titulo', $post)) {
        $titulo = sanitize_text_field((string) $post->post_title);
    }
    // Valores finales de los campos de texto: el recibido si quien guarda puede cambiarlo; si no, el que ya tiene.
    $valores_campos = pieb_can_valores_campos($post, $request);

    // Partituras existentes que se conservan (solo se aceptan las que ya pertenecen a esta canción).
    $actuales = array();
    foreach (pieb_can_get_partituras($post_id) as $p) {
        $actuales[(int) $p['id']] = $p;
    }

    // Tonalidad de la canción que llega en esta misma petición: una partitura en esa misma tonalidad sigue a la habitual.
    $tono_cancion_clave = pieb_can_tono_clave($valores_campos['tonalidad']);
    $limpiar_tono = function ($tono) use ($tono_cancion_clave) {
        $tono = sanitize_text_field((string) $tono);
        return pieb_can_tono_clave($tono) === $tono_cancion_clave ? '' : $tono;
    };

    // Si cambia la tonalidad habitual de una canción que tiene partituras en varias tonalidades, las que seguían a la
    // habitual (tonalidad vacía) se quedan en la que tenían: el archivo no ha cambiado de tonalidad. Con todas en la
    // habitual, en cambio, la siguen (lo normal es que se esté corrigiendo un dato).
    $tono_anterior = trim((string) get_post_meta($post_id, '_pieb_tonalidad', true));
    $fijar_anterior = false;
    if (!$es_nueva && $tono_anterior !== '' && pieb_can_tono_clave($tono_anterior) !== $tono_cancion_clave) {
        foreach ($actuales as $p) {
            if (trim((string) $p['tonalidad']) !== '') {
                $fijar_anterior = true;
                break;
            }
        }
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
                    'tonalidad' => $limpiar_tono(($fijar_anterior && trim((string) (isset($p['tonalidad']) ? $p['tonalidad'] : '')) === '' && $actuales[$id]['tonalidad'] === '')
                        ? $tono_anterior : (isset($p['tonalidad']) ? $p['tonalidad'] : '')),
                ) + pieb_can_origen_de($actuales[$id]);
            }
        }
    }

    // Con varias iglesias se conservan tal cual las partituras ajenas y, si quien guarda no es el creador ni el central,
    // también su orden (ver pieb_can_fusionar_elementos).
    $conservar = pieb_can_fusionar_elementos(array_values($actuales), $conservar, function ($e) {
        return (int) $e['id'];
    }, $post, pieb_can_puede_ordenar($post));

    $files = $request->get_file_params();
    // Partituras nuevas subidas por trozos (o, como antes, dentro de esta misma petición).
    $subidas = json_decode((string) $request->get_param('nuevasSubidas'), true);
    $subidas = is_array($subidas) ? $subidas : array();
    $hay_nuevas = !empty($files['nuevas']['name'][0]) || $subidas;

    if (!$conservar && !$hay_nuevas) {
        return new WP_Error('pieb_partitura', __('Toda canción necesita al menos una partitura.', 'pieb-cancionero'), array('status' => 400));
    }

    $nuevas = array();
    if ($hay_nuevas) {
        $labels = json_decode((string) $request->get_param('nuevasLabels'), true);
        $labels = is_array($labels) ? $labels : array();
        $tonos = json_decode((string) $request->get_param('nuevasTonalidades'), true);
        $tonos = is_array($tonos) ? $tonos : array();

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
                'tonalidad' => $limpiar_tono(isset($s['tonalidad']) ? $s['tonalidad'] : ''),
            ) + pieb_can_origen_nuevo();
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
                'tonalidad' => $limpiar_tono(isset($tonos[$i]) ? $tonos[$i] : ''),
            ) + pieb_can_origen_nuevo();
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
            $audio = pieb_can_limpiar_audio($id, $a, pieb_can_origen_de($audios_actuales[$id]));
            // «universal» nunca llega del cliente: se conserva el que tenía (solo cambia por su ruta, del central).
            if (!empty($audios_actuales[$id]['universal'])) {
                $audio['universal'] = 1;
            }
            $audios[] = $audio;
        }
    }
    // Con varias iglesias, los audios ajenos, los que no puede cambiar y los de otras iglesias (que ni ve) se conservan tal
    // cual (los nuevos se añaden después).
    $audios = pieb_can_fusionar_elementos(array_values($audios_actuales), $audios, function ($e) {
        return (int) $e['id'];
    }, $post, true, function ($e) use ($post) {
        return pieb_can_puede_cambiar_audio($e, $post);
    });
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

    // Partituras editables: igual que los audios, se conservan las que ya eran de la canción y se añaden las subidas.
    $editables_actuales = array();
    foreach (pieb_can_get_editables($post_id) as $e) {
        $editables_actuales[(int) $e['id']] = $e;
    }
    $editables = array();
    foreach ((array) json_decode((string) $request->get_param('editables'), true) as $e) {
        $id = isset($e['id']) ? (int) $e['id'] : 0;
        if (isset($editables_actuales[$id])) {
            $editables[] = pieb_can_limpiar_editable($id, $e, pieb_can_origen_de($editables_actuales[$id]));
        }
    }
    // Con varias iglesias, los editables ajenos se conservan tal cual.
    $editables = pieb_can_fusionar_elementos(array_values($editables_actuales), $editables, function ($e) {
        return (int) $e['id'];
    }, $post);
    foreach ((array) json_decode((string) $request->get_param('editablesSubidos'), true) as $s) {
        $file = pieb_can_archivo_subido(isset($s['id']) ? $s['id'] : '', isset($s['archivo']) ? (string) $s['archivo'] : '');
        $attachment_id = is_wp_error($file) ? $file : pieb_can_adjuntar($file, $post_id, $titulo, 'editable');
        if (is_wp_error($attachment_id)) {
            $attachment_id->add_data(array('status' => 400));
            return $attachment_id;
        }
        $editables[] = pieb_can_limpiar_editable($attachment_id, $s);
    }
    update_post_meta($post_id, '_pieb_editables', $editables);

    // Campos de texto: se anota quién cambió cada uno (meta _pieb_campos_autor) antes de sobrescribirlo.
    $cambiados = array();
    foreach (pieb_can_campos_texto() as $campo => $meta_key) {
        if ((string) get_post_meta($post_id, $meta_key, true) !== $valores_campos[$campo]) {
            $cambiados[] = $campo;
        }
        update_post_meta($post_id, $meta_key, $valores_campos[$campo]);
    }
    pieb_can_registrar_campos_autor($post_id, $cambiados);
    // La letra ajena (si ya hay una y quien guarda no es el creador ni el central) se conserva.
    if (pieb_can_puede_letra($post)) {
        pieb_can_guardar_letra($post_id, $request->get_param('letra'), $request->has_param('letraHtml') ? (string) $request->get_param('letraHtml') : null);
    }
    // Las notas son de cada iglesia: se guardan en las de la iglesia activa (la por defecto sigue usando _pieb_notas).
    pieb_can_notas_guardar($post_id, 0, (string) $request->get_param('notas'));

    $youtube_actuales = pieb_can_get_youtube($post_id);
    $youtube = json_decode((string) $request->get_param('youtube'), true);
    $youtube = pieb_can_limpiar_youtube($youtube, $youtube_actuales);
    // Con varias iglesias, los enlaces ajenos se conservan tal cual (identidad: la URL).
    $youtube = pieb_can_fusionar_elementos($youtube_actuales, $youtube, function ($e) {
        return (string) $e['url'];
    }, $post);
    update_post_meta($post_id, '_pieb_youtube', $youtube);

    $etiquetas = array_filter(array_map(function ($e) {
        return sanitize_text_field(trim($e));
    }, explode(',', (string) $request->get_param('etiquetas'))));
    // Por iglesia: conserva las de otras iglesias y respeta las universales (ver includes/etiquetas.php).
    pieb_can_etiquetas_fijar($post_id, array_values(array_unique($etiquetas)));

    return true;
}

/**
 * Añade y/o quita etiquetas a varias canciones. Solo toca las etiquetas: el resto de la ficha no se envía ni se
 * reescribe. Devuelve las etiquetas finales de cada canción para que la interfaz las pinte sin recargar.
 */
function pieb_can_rest_etiquetar(WP_REST_Request $request) {
    $limpiar = function ($lista) {
        $salida = array();
        foreach ((array) $lista as $e) {
            $e = sanitize_text_field(trim((string) $e));
            if ($e !== '' && !in_array(mb_strtolower($e), array_map('mb_strtolower', $salida), true)) {
                $salida[] = $e;
            }
        }
        return $salida;
    };
    $anadir = $limpiar($request->get_param('anadir'));
    $quitar = $limpiar($request->get_param('quitar'));
    $ids = array_slice(array_unique(array_map('intval', (array) $request->get_param('ids'))), 0, 200);
    if (!$ids || (!$anadir && !$quitar)) {
        return new WP_Error('pieb_etiquetar', __('Elige canciones y al menos una etiqueta.', 'pieb-cancionero'), array('status' => 400));
    }

    $resultado = array();
    foreach ($ids as $id) {
        $post = get_post($id);
        if (!$post || $post->post_type !== PIEB_CAN_CPT || $post->post_status !== 'publish') {
            continue;
        }
        $actuales = pieb_can_etiquetas($id);
        $minusculas_quitar = array_map('mb_strtolower', $quitar);
        $finales = array();
        foreach (array_merge($actuales, $anadir) as $e) {
            if (in_array(mb_strtolower($e), $minusculas_quitar, true) || in_array(mb_strtolower($e), array_map('mb_strtolower', $finales), true)) {
                continue;
            }
            $finales[] = $e;
        }
        if ($finales !== $actuales) {
            pieb_can_etiquetas_fijar($id, $finales);
        }
        $resultado[] = array('id' => $id, 'etiquetas' => pieb_can_etiquetas($id), 'etiquetasUniversales' => pieb_can_etiquetas_universales_de($id));
    }
    return rest_ensure_response(array('canciones' => $resultado));
}

/** Manifiesto web (application/manifest+json) para crear un acceso directo o instalar la página del cancionero. */
function pieb_can_rest_manifest($request) {
    // La página de inicio es la del cancionero que pasa el <link>; si no existe o no lleva el shortcode, la portada.
    $inicio = home_url('/');
    $id = (int) $request->get_param('pagina');
    if ($id && 'publish' === get_post_status($id) && has_shortcode((string) get_post_field('post_content', $id), 'cancionero')) {
        $inicio = get_permalink($id);
    }
    $nombre = pieb_can_nombre();
    $corto = function_exists('mb_substr') ? mb_substr($nombre, 0, 12) : substr($nombre, 0, 12);
    $icono = function ($archivo, $tam, $uso) {
        return array('src' => PIEB_CAN_URL . 'assets/' . $archivo . '?v=' . PIEB_CAN_VERSION, 'sizes' => $tam, 'type' => 'image/png', 'purpose' => $uso);
    };
    $datos = array(
        'name'             => $nombre,
        'short_name'       => $corto,
        'start_url'        => $inicio,
        'scope'            => $inicio,
        'display'          => 'standalone',
        'background_color' => '#8b5cf6',
        'theme_color'      => '#8b5cf6',
        'lang'             => str_replace('_', '-', get_locale()),
        'icons'            => array(
            $icono('icono-192.png', '192x192', 'any'),
            $icono('icono-512.png', '512x512', 'any'),
            $icono('icono-maskable-512.png', '512x512', 'maskable'),
        ),
    );
    $respuesta = new WP_REST_Response($datos);
    $respuesta->header('Content-Type', 'application/manifest+json; charset=' . get_option('blog_charset'));
    $respuesta->header('Cache-Control', 'public, max-age=3600');
    return $respuesta;
}
