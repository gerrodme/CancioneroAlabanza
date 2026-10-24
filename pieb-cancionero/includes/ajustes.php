<?php
/**
 * Ajustes del cancionero (tema por defecto, acceso con Google, lista del equipo)
 * y preferencias de cada usuario (tema elegido).
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Temas disponibles. «sitio» sigue los colores y la tipografía del tema activo de WordPress;
 * «colores» y «pentagrama» son estilos sobre esa misma base (ver pieb_can_atributos_raiz).
 */
function pieb_can_temas() {
    return array(
        'colores'    => 'Colores',
        'pentagrama' => 'Pentagrama',
        'sitio'      => 'Como la web',
        'pulso'      => 'Pulso',
        'claro'      => 'Estudio',
        'escenario'  => 'Escenario',
        'papel'      => 'Partitura',
    );
}

function pieb_can_ajustes() {
    $guardados = get_option('pieb_can_ajustes', array());
    $ajustes = wp_parse_args(is_array($guardados) ? $guardados : array(), array(
        'nombre'           => 'Cancionero',
        'tema_defecto'     => 'colores',
        'google_client_id' => '',
        'emails'           => array(),
        'administradores'  => array(),
        'dominio'          => '',
    ));
    if (trim((string) $ajustes['nombre']) === '') {
        $ajustes['nombre'] = 'Cancionero';
    }
    if (!isset(pieb_can_temas()[$ajustes['tema_defecto']])) {
        $ajustes['tema_defecto'] = 'colores';
    }
    return $ajustes;
}

/** Nombre del cancionero, configurable en Ajustes (por defecto «Cancionero»). */
function pieb_can_nombre() {
    return pieb_can_ajustes()['nombre'];
}

function pieb_can_tema_usuario() {
    $tema = get_user_meta(get_current_user_id(), 'pieb_can_tema', true);
    return isset(pieb_can_temas()[$tema]) ? $tema : pieb_can_ajustes()['tema_defecto'];
}

function pieb_can_normalizar_emails($texto) {
    $emails = array();
    foreach (preg_split('/[\s,;]+/', strtolower((string) $texto)) as $e) {
        $e = sanitize_email($e);
        if ($e && is_email($e)) {
            $emails[$e] = true;
        }
    }
    return array_keys($emails);
}

add_action('rest_api_init', function () {
    register_rest_route('pieb/v1', '/preferencias', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_preferencias',
        'permission_callback' => 'pieb_can_rest_acceso',
    ));

    register_rest_route('pieb/v1', '/ajustes', array(
        array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'pieb_can_rest_ajustes_ver',
            'permission_callback' => function () { return current_user_can(PIEB_CAN_CAP_GESTIONAR); },
        ),
        array(
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'pieb_can_rest_ajustes_guardar',
            'permission_callback' => function () { return current_user_can(PIEB_CAN_CAP_GESTIONAR); },
        ),
    ));

    register_rest_route('pieb/v1', '/huerfanos', array(
        array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'pieb_can_rest_huerfanos',
            'permission_callback' => function () { return current_user_can(PIEB_CAN_CAP_GESTIONAR); },
        ),
        array(
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'pieb_can_rest_huerfanos_borrar',
            'permission_callback' => function () { return current_user_can(PIEB_CAN_CAP_GESTIONAR); },
        ),
    ));
});

function pieb_can_rest_preferencias(WP_REST_Request $request) {
    $tema = (string) $request->get_param('tema');
    if (!isset(pieb_can_temas()[$tema])) {
        return new WP_Error('pieb_tema', 'Tema desconocido.', array('status' => 400));
    }
    update_user_meta(get_current_user_id(), 'pieb_can_tema', $tema);
    return rest_ensure_response(array('tema' => $tema));
}

/** Miembros: correos de la lista más las cuentas que ya tienen el rol del equipo. */
function pieb_can_miembros($ajustes) {
    $miembros = array();
    foreach ($ajustes['emails'] as $email) {
        $u = get_user_by('email', $email);
        $miembros[$email] = array(
            'email'     => $email,
            'nombre'    => $u ? $u->display_name : '',
            'haEntrado' => false,
            'enLista'   => true,
            // Las cuentas de administración no reciben enlaces por correo: entran con contraseña.
            'esAdmin'   => $u && user_can($u, 'manage_options'),
            'esGestor'  => in_array($email, $ajustes['administradores'], true) || ($u && in_array(PIEB_CAN_ROLE_ADMIN, (array) $u->roles, true)),
        );
    }
    foreach (array_merge(get_users(array('role' => PIEB_CAN_ROLE)), get_users(array('role' => PIEB_CAN_ROLE_ADMIN))) as $u) {
        $email = strtolower($u->user_email);
        $miembros[$email] = array(
            'email'     => $email,
            'nombre'    => $u->display_name,
            'haEntrado' => (bool) (get_user_meta($u->ID, 'pieb_can_google_sub', true) || get_user_meta($u->ID, 'pieb_can_ultimo_acceso', true)),
            'enLista'   => isset($miembros[$email]),
            'esAdmin'   => user_can($u, 'manage_options'),
            'esGestor'  => in_array($email, $ajustes['administradores'], true) || in_array(PIEB_CAN_ROLE_ADMIN, (array) $u->roles, true),
        );
    }
    ksort($miembros);
    return array_values($miembros);
}

function pieb_can_rest_ajustes_ver() {
    $ajustes = pieb_can_ajustes();
    return rest_ensure_response(array(
        'nombre'         => $ajustes['nombre'],
        'administradores' => $ajustes['administradores'],
        'temaDefecto'    => $ajustes['tema_defecto'],
        'googleClientId' => $ajustes['google_client_id'],
        'dominio'        => $ajustes['dominio'],
        'emails'         => $ajustes['emails'],
        'miembros'       => pieb_can_miembros($ajustes),
        'origen'         => untrailingslashit(home_url()),
    ));
}

function pieb_can_rest_ajustes_guardar(WP_REST_Request $request) {
    $anterior = pieb_can_ajustes();
    $ajustes = $anterior;

    if ($request->has_param('nombre')) {
        $nombre = trim(sanitize_text_field((string) $request->get_param('nombre')));
        $ajustes['nombre'] = $nombre === '' ? 'Cancionero' : mb_substr($nombre, 0, 40);
    }
    $tema = (string) $request->get_param('temaDefecto');
    if (isset(pieb_can_temas()[$tema])) {
        $ajustes['tema_defecto'] = $tema;
    }
    if ($request->has_param('googleClientId')) {
        $client = trim((string) $request->get_param('googleClientId'));
        if ($client !== '' && !preg_match('/^[0-9a-z-]+\.apps\.googleusercontent\.com$/i', $client)) {
            return new WP_Error('pieb_client', 'El Client ID de Google no tiene el formato esperado (…apps.googleusercontent.com).', array('status' => 400));
        }
        $ajustes['google_client_id'] = $client;
    }
    if ($request->has_param('dominio')) {
        $ajustes['dominio'] = strtolower(preg_replace('/[^a-z0-9.-]/i', '', (string) $request->get_param('dominio')));
    }
    if ($request->has_param('emails')) {
        $ajustes['emails'] = pieb_can_normalizar_emails(implode(' ', (array) $request->get_param('emails')));
    }

    if ($request->has_param('administradores')) {
        $ajustes['administradores'] = pieb_can_normalizar_emails(implode(' ', (array) $request->get_param('administradores')));
        // Un administrador siempre tiene acceso: se añade también a la lista del equipo.
        $ajustes['emails'] = array_values(array_unique(array_merge($ajustes['emails'], $ajustes['administradores'])));
    }

    update_option('pieb_can_ajustes', $ajustes, false);

    // Aplica ya los cambios de administradores a las cuentas existentes.
    foreach (array_unique(array_merge($anterior['administradores'], $ajustes['administradores'])) as $email) {
        $u = get_user_by('email', $email);
        if ($u) {
            pieb_can_sincronizar_administrador($u, $ajustes);
        }
    }

    // Quien sale de la lista pierde el acceso (salvo administradores y editores).
    foreach (array_diff($anterior['emails'], $ajustes['emails']) as $email) {
        $u = get_user_by('email', $email);
        if ($u && in_array(PIEB_CAN_ROLE, (array) $u->roles, true) && !user_can($u, PIEB_CAN_CAP_GESTIONAR)) {
            $u->remove_role(PIEB_CAN_ROLE);
            if (!$u->roles) {
                $u->add_role('subscriber');
            }
        }
    }

    return pieb_can_rest_ajustes_ver();
}

/**
 * Partituras, audios y editables subidos desde el cancionero que ya no usa ninguna canción ni aparecen enlazados
 * en otras páginas. Los de canciones en la papelera se conservan por si se recuperan.
 */
function pieb_can_archivos_sin_usar() {
    global $wpdb;

    $usados = array();
    $en_papelera = array();
    foreach (array('any', 'trash') as $estado) {
        $ids = get_posts(array('post_type' => PIEB_CAN_CPT, 'post_status' => $estado, 'posts_per_page' => -1, 'fields' => 'ids'));
        foreach ($ids as $id) {
            foreach (array_merge(pieb_can_get_partituras($id), pieb_can_get_audios($id), pieb_can_get_editables($id)) as $item) {
                $usados[(int) $item['id']] = true;
                if ($estado === 'trash') {
                    $en_papelera[(int) $item['id']] = true;
                }
            }
        }
    }

    $candidatos = get_posts(array(
        'post_type'      => 'attachment',
        'post_status'    => 'inherit',
        'posts_per_page' => -1,
        'meta_query'     => array(
            'relation' => 'OR',
            array('key' => '_pieb_audio', 'compare' => 'EXISTS'),
            array('key' => '_pieb_partitura', 'compare' => 'EXISTS'),
            array('key' => '_pieb_editable', 'compare' => 'EXISTS'),
        ),
    ));

    $archivos = array();
    foreach ($candidatos as $adjunto) {
        if (isset($usados[$adjunto->ID])) {
            continue;
        }
        $ruta = get_attached_file($adjunto->ID);
        $nombre = $ruta ? wp_basename($ruta) : '';
        // Por si alguien lo enlazó a mano en una página o entrada de la web.
        if ($nombre && $wpdb->get_var($wpdb->prepare(
            "SELECT ID FROM {$wpdb->posts} WHERE post_type NOT IN ('attachment', 'revision') AND post_status <> 'auto-draft' AND post_content LIKE %s LIMIT 1",
            '%' . $wpdb->esc_like($nombre) . '%'
        ))) {
            continue;
        }
        $padre = $adjunto->post_parent ? get_post($adjunto->post_parent) : null;
        $archivos[] = array(
            'id'      => $adjunto->ID,
            'archivo' => $nombre,
            'tipo'    => get_post_meta($adjunto->ID, '_pieb_audio', true) ? 'audio' : (get_post_meta($adjunto->ID, '_pieb_editable', true) ? 'editable' : 'partitura'),
            'tamano'  => $ruta && file_exists($ruta) ? (int) filesize($ruta) : 0,
            'fecha'   => get_the_date('Y-m-d', $adjunto),
            'url'     => pieb_can_url_archivo($adjunto->ID),
            'cancion' => $padre && $padre->post_type === PIEB_CAN_CPT ? html_entity_decode(get_the_title($padre), ENT_QUOTES, 'UTF-8') : '',
        );
    }

    return array('archivos' => $archivos, 'enPapelera' => count($en_papelera));
}

function pieb_can_rest_huerfanos() {
    return rest_ensure_response(pieb_can_archivos_sin_usar());
}

/** Borra del servidor los archivos pedidos, solo si de verdad siguen sin usarse. */
function pieb_can_rest_huerfanos_borrar(WP_REST_Request $request) {
    $sin_usar = array();
    foreach (pieb_can_archivos_sin_usar()['archivos'] as $a) {
        $sin_usar[$a['id']] = $a;
    }
    $borrados = 0;
    $liberado = 0;
    foreach (array_unique(array_map('intval', (array) $request->get_param('ids'))) as $id) {
        if (isset($sin_usar[$id]) && wp_delete_attachment($id, true)) {
            $borrados++;
            $liberado += $sin_usar[$id]['tamano'];
        }
    }
    return rest_ensure_response(array_merge(pieb_can_archivos_sin_usar(), array('borrados' => $borrados, 'liberado' => $liberado)));
}

// ---------------------------------------------------------------- copias de seguridad (solo administradores)
//
// La copia la monta el navegador: pide aquí los datos (/copia), descarga cada archivo y lo guarda todo en un ZIP.
// Para restaurar, el navegador sube cada archivo por trozos (/subidas) y crea las canciones y los cultos de uno en uno,
// así funciona aunque el servidor tenga límites de subida o de tiempo bajos, y también en otra instalación.

add_action('rest_api_init', function () {
    $admin = function () { return current_user_can('manage_options'); };
    $rutas = array(
        '/copia'         => array(WP_REST_Server::READABLE, 'pieb_can_rest_copia_exportar'),
        '/copia/estado'  => array(WP_REST_Server::CREATABLE, 'pieb_can_rest_copia_estado'),
        '/copia/cancion' => array(WP_REST_Server::CREATABLE, 'pieb_can_rest_copia_cancion'),
        '/copia/culto'   => array(WP_REST_Server::CREATABLE, 'pieb_can_rest_copia_culto'),
        '/copia/ajustes' => array(WP_REST_Server::CREATABLE, 'pieb_can_rest_copia_ajustes'),
    );
    foreach ($rutas as $ruta => $def) {
        register_rest_route('pieb/v1', $ruta, array(
            'methods'             => $def[0],
            'callback'            => $def[1],
            'permission_callback' => $admin,
        ));
    }
});

/** Identificador estable de una canción o un culto, para reconocerlos al restaurar (también en otra web). */
function pieb_can_uid($post_id) {
    $uid = (string) get_post_meta($post_id, '_pieb_uid', true);
    if (!preg_match('/^[a-f0-9-]{36}$/', $uid)) {
        $uid = wp_generate_uuid4();
        update_post_meta($post_id, '_pieb_uid', $uid);
    }
    return $uid;
}

function pieb_can_copia_archivo($attachment_id, $extra) {
    $ruta = get_attached_file($attachment_id);
    if (!$ruta || !file_exists($ruta)) {
        return null;
    }
    return array_merge(array(
        'archivo' => wp_basename($ruta),
        'url'     => pieb_can_url_archivo($attachment_id),
        'tamano'  => (int) filesize($ruta),
    ), $extra);
}

function pieb_can_copia_email($user_id) {
    $user = get_userdata($user_id);
    return $user ? $user->user_email : '';
}

function pieb_can_rest_copia_exportar() {
    $canciones = array();
    $uids = array();
    $posts = get_posts(array('post_type' => PIEB_CAN_CPT, 'post_status' => 'publish', 'posts_per_page' => -1, 'orderby' => 'title', 'order' => 'ASC'));
    foreach ($posts as $post) {
        $partituras = array();
        foreach (pieb_can_get_partituras($post->ID) as $p) {
            $f = pieb_can_copia_archivo((int) $p['id'], array('label' => isset($p['label']) ? (string) $p['label'] : ''));
            if ($f) {
                $partituras[] = $f;
            }
        }
        $audios = array();
        foreach (pieb_can_get_audios($post->ID) as $a) {
            $f = pieb_can_copia_archivo((int) $a['id'], array(
                'nombre'      => isset($a['nombre']) ? (string) $a['nombre'] : '',
                'descripcion' => isset($a['descripcion']) ? (string) $a['descripcion'] : '',
            ));
            if ($f) {
                $audios[] = $f;
            }
        }
        $editables = array();
        foreach (pieb_can_get_editables($post->ID) as $e) {
            $f = pieb_can_copia_archivo((int) $e['id'], array('descripcion' => isset($e['descripcion']) ? (string) $e['descripcion'] : ''));
            if ($f) {
                $editables[] = $f;
            }
        }
        $uids[$post->ID] = pieb_can_uid($post->ID);
        $cancion = array(
            'uid'    => $uids[$post->ID],
            'titulo' => html_entity_decode(get_the_title($post), ENT_QUOTES, 'UTF-8'),
        );
        foreach (pieb_can_campos_texto() as $campo => $meta_key) {
            $cancion[$campo] = (string) get_post_meta($post->ID, $meta_key, true);
        }
        $canciones[] = array_merge($cancion, array(
            'letra'      => (string) get_post_meta($post->ID, '_pieb_letra', true),
            'notas'      => (string) get_post_meta($post->ID, '_pieb_notas', true),
            'etiquetas'  => pieb_can_etiquetas($post->ID),
            'youtube'    => pieb_can_get_youtube($post->ID),
            'creada'     => $post->post_date,
            'subidaPor'  => pieb_can_copia_email($post->post_author),
            'partituras' => $partituras,
            'audios'     => $audios,
            'editables'  => $editables,
        ));
    }

    $cultos = array();
    $posts = get_posts(array('post_type' => PIEB_CAN_CULTO, 'post_status' => 'publish', 'posts_per_page' => -1, 'meta_key' => '_pieb_fecha', 'orderby' => 'meta_value', 'order' => 'DESC'));
    foreach ($posts as $post) {
        $items = array();
        foreach (pieb_can_culto_items($post->ID) as $item) {
            $id = (int) $item['cancion'];
            if (!isset($uids[$id])) {
                continue;
            }
            $items[] = array(
                'cancion'   => $uids[$id],
                'titulo'    => html_entity_decode(get_the_title($id), ENT_QUOTES, 'UTF-8'),
                'numero'    => (string) get_post_meta($id, '_pieb_numero', true),
                'tonalidad' => isset($item['tonalidad']) ? (string) $item['tonalidad'] : '',
                'nota'      => isset($item['nota']) ? (string) $item['nota'] : '',
            );
        }
        $cultos[] = array(
            'uid'       => pieb_can_uid($post->ID),
            'titulo'    => html_entity_decode(get_the_title($post), ENT_QUOTES, 'UTF-8'),
            'fecha'     => (string) get_post_meta($post->ID, '_pieb_fecha', true),
            'tipo'      => (string) get_post_meta($post->ID, '_pieb_tipo', true),
            'notas'     => (string) get_post_meta($post->ID, '_pieb_notas', true),
            'creadoPor' => pieb_can_copia_email($post->post_author),
            'items'     => $items,
        );
    }

    $ajustes = pieb_can_ajustes();
    return rest_ensure_response(array(
        'formato'   => 'pieb-cancionero',
        'version'   => 1,
        'plugin'    => PIEB_CAN_VERSION,
        'sitio'     => home_url('/'),
        'fecha'     => current_time('mysql'),
        'canciones' => $canciones,
        'cultos'    => $cultos,
        'ajustes'   => array(
            'temaDefecto'    => $ajustes['tema_defecto'],
            'emails'         => $ajustes['emails'],
            'dominio'        => $ajustes['dominio'],
            'googleClientId' => $ajustes['google_client_id'],
        ),
    ));
}

/**
 * Busca en esta web la canción o el culto de la copia: primero por su identificador;
 * si no lo hay (una web que aún no tenía copias), por título y número, o título y fecha.
 */
function pieb_can_copia_buscar($tipo, $datos) {
    $cpt = $tipo === 'culto' ? PIEB_CAN_CULTO : PIEB_CAN_CPT;
    $uid = isset($datos['uid']) ? (string) $datos['uid'] : '';
    if (preg_match('/^[a-f0-9-]{36}$/', $uid)) {
        $ids = get_posts(array('post_type' => $cpt, 'post_status' => 'publish', 'posts_per_page' => 1, 'fields' => 'ids', 'meta_key' => '_pieb_uid', 'meta_value' => $uid));
        if ($ids) {
            return (int) $ids[0];
        }
    }
    $titulo = isset($datos['titulo']) ? trim((string) $datos['titulo']) : '';
    if ($titulo === '') {
        return 0;
    }
    $ids = get_posts(array('post_type' => $cpt, 'post_status' => 'publish', 'posts_per_page' => -1, 'fields' => 'ids', 'title' => $titulo));
    $uid_valido = (bool) preg_match('/^[a-f0-9-]{36}$/', $uid);
    foreach ($ids as $id) {
        // Un elemento que ya tiene otro identificador es otra canción (o culto) con el mismo título, no el mismo.
        $uid_existente = (string) get_post_meta($id, '_pieb_uid', true);
        if ($uid_valido && preg_match('/^[a-f0-9-]{36}$/', $uid_existente) && $uid_existente !== $uid) {
            continue;
        }
        $igual = $tipo === 'culto'
            ? (string) get_post_meta($id, '_pieb_fecha', true) === (isset($datos['fecha']) ? (string) $datos['fecha'] : '')
            : (string) get_post_meta($id, '_pieb_numero', true) === (isset($datos['numero']) ? (string) $datos['numero'] : '');
        if ($igual) {
            return (int) $id;
        }
    }
    return 0;
}

/** Qué canciones y cultos de la copia ya existen en esta web (0 = no existe). */
function pieb_can_rest_copia_estado(WP_REST_Request $request) {
    $p = (array) $request->get_json_params();
    $res = array('canciones' => array(), 'cultos' => array());
    foreach ((array) (isset($p['canciones']) ? $p['canciones'] : array()) as $c) {
        $res['canciones'][] = pieb_can_copia_buscar('cancion', (array) $c);
    }
    foreach ((array) (isset($p['cultos']) ? $p['cultos'] : array()) as $c) {
        $res['cultos'][] = pieb_can_copia_buscar('culto', (array) $c);
    }
    return rest_ensure_response($res);
}

function pieb_can_rest_copia_cancion(WP_REST_Request $request) {
    $p = (array) $request->get_json_params();
    $c = isset($p['cancion']) ? (array) $p['cancion'] : array();
    $sobrescribir = isset($p['modo']) && $p['modo'] === 'sobrescribir';
    $con_archivos = !empty($p['conArchivos']);
    $titulo = sanitize_text_field(isset($c['titulo']) ? (string) $c['titulo'] : '');
    if ($titulo === '') {
        return new WP_Error('pieb_titulo', 'Hay una canción sin título en la copia.', array('status' => 400));
    }

    $id = pieb_can_copia_buscar('cancion', $c);
    if ($id && !$sobrescribir) {
        return rest_ensure_response(array('estado' => 'saltada', 'id' => $id));
    }

    // Los archivos (ya subidos por trozos) se comprueban antes de tocar nada.
    $archivos = array('partitura' => array(), 'audio' => array(), 'editable' => array());
    foreach (array('partituras' => 'partitura', 'audios' => 'audio', 'editables' => 'editable') as $clave => $tipo) {
        foreach ((array) (isset($c[$clave]) ? $c[$clave] : array()) as $f) {
            $f = (array) $f;
            if (empty($f['subida'])) {
                continue;
            }
            $file = pieb_can_archivo_subido($f['subida'], isset($f['archivo']) ? $f['archivo'] : '');
            if (is_wp_error($file)) {
                $file->add_data(array('status' => 400));
                return $file;
            }
            $archivos[$tipo][] = array($file, $f);
        }
    }

    if ($id) {
        wp_update_post(array('ID' => $id, 'post_title' => $titulo));
        $estado = 'actualizada';
    } else {
        $autor = !empty($c['subidaPor']) ? get_user_by('email', (string) $c['subidaPor']) : false;
        $nuevo = array(
            'post_type'   => PIEB_CAN_CPT,
            'post_status' => 'publish',
            'post_title'  => $titulo,
            'post_author' => $autor ? $autor->ID : get_current_user_id(),
        );
        if (!empty($c['creada']) && strtotime((string) $c['creada'])) {
            $nuevo['post_date'] = date('Y-m-d H:i:s', strtotime((string) $c['creada']));
        }
        $id = wp_insert_post($nuevo, true);
        if (is_wp_error($id)) {
            return $id;
        }
        $estado = 'creada';
    }

    $uid = isset($c['uid']) ? (string) $c['uid'] : '';
    update_post_meta($id, '_pieb_uid', preg_match('/^[a-f0-9-]{36}$/', $uid) ? $uid : wp_generate_uuid4());
    foreach (pieb_can_campos_texto() as $campo => $meta_key) {
        update_post_meta($id, $meta_key, pieb_can_valor_campo($campo, isset($c[$campo]) ? $c[$campo] : ''));
    }
    update_post_meta($id, '_pieb_letra', sanitize_textarea_field(isset($c['letra']) ? (string) $c['letra'] : ''));
    update_post_meta($id, '_pieb_notas', sanitize_textarea_field(isset($c['notas']) ? (string) $c['notas'] : ''));
    update_post_meta($id, '_pieb_youtube', pieb_can_limpiar_youtube(isset($c['youtube']) ? $c['youtube'] : array()));
    $etiquetas = array_filter(array_map('sanitize_text_field', (array) (isset($c['etiquetas']) ? $c['etiquetas'] : array())));
    wp_set_object_terms($id, array_values(array_unique($etiquetas)), PIEB_CAN_TAX);

    // Una copia con archivos manda: sus partituras, audios y editables sustituyen a los de esta web.
    // Una copia solo de datos conserva los archivos que ya hubiera aquí.
    if ($con_archivos) {
        $partituras = array();
        foreach ($archivos['partitura'] as $par) {
            $adjunto = pieb_can_adjuntar($par[0], $id, $titulo, 'partitura');
            if (is_wp_error($adjunto)) {
                $adjunto->add_data(array('status' => 400));
                return $adjunto;
            }
            $partituras[] = array('id' => (int) $adjunto, 'label' => sanitize_text_field(isset($par[1]['label']) ? (string) $par[1]['label'] : ''));
        }
        $audios = array();
        foreach ($archivos['audio'] as $par) {
            $adjunto = pieb_can_adjuntar($par[0], $id, $titulo, 'audio');
            if (is_wp_error($adjunto)) {
                $adjunto->add_data(array('status' => 400));
                return $adjunto;
            }
            $audios[] = pieb_can_limpiar_audio($adjunto, $par[1]);
        }
        $editables = array();
        foreach ($archivos['editable'] as $par) {
            $adjunto = pieb_can_adjuntar($par[0], $id, $titulo, 'editable');
            if (is_wp_error($adjunto)) {
                $adjunto->add_data(array('status' => 400));
                return $adjunto;
            }
            $editables[] = pieb_can_limpiar_editable($adjunto, $par[1]);
        }
        update_post_meta($id, '_pieb_partituras', $partituras);
        update_post_meta($id, '_pieb_audios', $audios);
        update_post_meta($id, '_pieb_editables', $editables);
    }

    return rest_ensure_response(array('estado' => $estado, 'id' => (int) $id));
}

function pieb_can_rest_copia_culto(WP_REST_Request $request) {
    $p = (array) $request->get_json_params();
    $c = isset($p['culto']) ? (array) $p['culto'] : array();
    $sobrescribir = isset($p['modo']) && $p['modo'] === 'sobrescribir';
    $titulo = sanitize_text_field(isset($c['titulo']) ? (string) $c['titulo'] : '');
    $fecha = sanitize_text_field(isset($c['fecha']) ? (string) $c['fecha'] : '');
    $d = DateTime::createFromFormat('Y-m-d', $fecha);
    if ($titulo === '' || !$d || $d->format('Y-m-d') !== $fecha) {
        return new WP_Error('pieb_culto', 'Hay un culto sin título o con una fecha no válida en la copia.', array('status' => 400));
    }

    $id = pieb_can_copia_buscar('culto', $c);
    if ($id && !$sobrescribir) {
        return rest_ensure_response(array('estado' => 'saltado', 'id' => $id, 'faltan' => 0));
    }

    // Cada canción del setlist se busca en esta web; las que no estén se quedan fuera y se avisa.
    $items = array();
    $faltan = 0;
    foreach ((array) (isset($c['items']) ? $c['items'] : array()) as $item) {
        $item = (array) $item;
        $cancion = pieb_can_copia_buscar('cancion', array(
            'uid'    => isset($item['cancion']) ? $item['cancion'] : '',
            'titulo' => isset($item['titulo']) ? $item['titulo'] : '',
            'numero' => isset($item['numero']) ? $item['numero'] : '',
        ));
        if (!$cancion) {
            $faltan++;
            continue;
        }
        $items[] = array(
            'cancion'   => $cancion,
            'tonalidad' => sanitize_text_field(isset($item['tonalidad']) ? (string) $item['tonalidad'] : ''),
            'nota'      => sanitize_text_field(isset($item['nota']) ? (string) $item['nota'] : ''),
        );
    }

    if ($id) {
        wp_update_post(array('ID' => $id, 'post_title' => $titulo));
        $estado = 'actualizado';
    } else {
        $autor = !empty($c['creadoPor']) ? get_user_by('email', (string) $c['creadoPor']) : false;
        $id = wp_insert_post(array(
            'post_type'   => PIEB_CAN_CULTO,
            'post_status' => 'publish',
            'post_title'  => $titulo,
            'post_author' => $autor ? $autor->ID : get_current_user_id(),
        ), true);
        if (is_wp_error($id)) {
            return $id;
        }
        $estado = 'creado';
    }

    $uid = isset($c['uid']) ? (string) $c['uid'] : '';
    update_post_meta($id, '_pieb_uid', preg_match('/^[a-f0-9-]{36}$/', $uid) ? $uid : wp_generate_uuid4());
    update_post_meta($id, '_pieb_fecha', $fecha);
    update_post_meta($id, '_pieb_tipo', sanitize_text_field(isset($c['tipo']) ? (string) $c['tipo'] : ''));
    update_post_meta($id, '_pieb_notas', sanitize_textarea_field(isset($c['notas']) ? (string) $c['notas'] : ''));
    update_post_meta($id, '_pieb_items', $items);

    return rest_ensure_response(array('estado' => $estado, 'id' => (int) $id, 'faltan' => $faltan));
}

/** Ajustes de la copia. La lista del equipo se une a la actual: restaurar nunca deja a nadie sin acceso. */
function pieb_can_rest_copia_ajustes(WP_REST_Request $request) {
    $p = (array) $request->get_json_params();
    $a = isset($p['ajustes']) ? (array) $p['ajustes'] : array();
    $ajustes = pieb_can_ajustes();

    $tema = isset($a['temaDefecto']) ? (string) $a['temaDefecto'] : '';
    if (isset(pieb_can_temas()[$tema])) {
        $ajustes['tema_defecto'] = $tema;
    }
    if (!empty($a['dominio'])) {
        $ajustes['dominio'] = strtolower(preg_replace('/[^a-z0-9.-]/i', '', (string) $a['dominio']));
    }
    $client = isset($a['googleClientId']) ? trim((string) $a['googleClientId']) : '';
    if ($client !== '' && preg_match('/^[0-9a-z-]+\.apps\.googleusercontent\.com$/i', $client)) {
        $ajustes['google_client_id'] = $client;
    }
    $emails = isset($a['emails']) ? (array) $a['emails'] : array();
    $ajustes['emails'] = pieb_can_normalizar_emails(implode(' ', array_merge($ajustes['emails'], $emails)));
    update_option('pieb_can_ajustes', $ajustes, false);

    return rest_ensure_response(array('estado' => 'actualizados', 'emails' => count($ajustes['emails'])));
}
