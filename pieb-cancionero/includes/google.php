<?php
/**
 * Acceso con Google (Google Identity Services).
 *
 * El navegador obtiene un ID token firmado por Google y lo envía a /pieb/v1/google.
 * Aquí se valida con Google, se comprueba que el correo está en la lista del equipo
 * (o en el dominio permitido) y se inicia la sesión de WordPress. La primera vez se crea
 * la cuenta con el rol «Equipo de adoración».
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', function () {
    register_rest_route('pieb/v1', '/google', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_google',
        'permission_callback' => '__return_true',
    ));
});

/** Valida el ID token con Google y devuelve sus datos, o WP_Error. */
function pieb_can_google_verificar($credential, $client_id) {
    $respuesta = wp_remote_get('https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($credential), array('timeout' => 10));
    if (is_wp_error($respuesta)) {
        return new WP_Error('pieb_google', __('No se pudo contactar con Google. Inténtalo de nuevo.', 'pieb-cancionero'), array('status' => 502));
    }
    $datos = json_decode(wp_remote_retrieve_body($respuesta), true);
    if (wp_remote_retrieve_response_code($respuesta) !== 200 || !is_array($datos)) {
        return new WP_Error('pieb_google', __('Google no ha validado el inicio de sesión.', 'pieb-cancionero'), array('status' => 401));
    }

    $iss_ok = in_array(isset($datos['iss']) ? $datos['iss'] : '', array('accounts.google.com', 'https://accounts.google.com'), true);
    $aud_ok = isset($datos['aud']) && hash_equals($client_id, (string) $datos['aud']);
    $exp_ok = isset($datos['exp']) && (int) $datos['exp'] > time();
    $email_ok = isset($datos['email'], $datos['email_verified']) && in_array($datos['email_verified'], array(true, 'true'), true);

    if (!$iss_ok || !$aud_ok || !$exp_ok || !$email_ok || empty($datos['sub'])) {
        return new WP_Error('pieb_google', __('El inicio de sesión de Google no es válido para este sitio.', 'pieb-cancionero'), array('status' => 401));
    }
    return $datos;
}

function pieb_can_email_permitido($email, $ajustes) {
    if (in_array($email, $ajustes['emails'], true) || in_array($email, $ajustes['administradores'], true)) {
        return true;
    }
    if ($ajustes['dominio'] && substr($email, -strlen('@' . $ajustes['dominio'])) === '@' . $ajustes['dominio']) {
        return true;
    }
    return false;
}

function pieb_can_rest_google(WP_REST_Request $request) {
    $ajustes = pieb_can_ajustes();
    if (!$ajustes['google_client_id']) {
        return new WP_Error('pieb_google', __('El acceso con Google no está configurado.', 'pieb-cancionero'), array('status' => 400));
    }

    $credential = (string) $request->get_param('credential');
    if ($credential === '') {
        return new WP_Error('pieb_google', __('Falta la credencial de Google.', 'pieb-cancionero'), array('status' => 400));
    }

    $datos = pieb_can_google_verificar($credential, $ajustes['google_client_id']);
    if (is_wp_error($datos)) {
        return $datos;
    }

    $email = strtolower(sanitize_email($datos['email']));
    $sub = (string) $datos['sub'];
    $user = get_user_by('email', $email);

    $permitido = pieb_can_email_permitido($email, $ajustes) || ($user && user_can($user, PIEB_CAN_CAP_ACCESO));
    if (!$permitido) {
        return new WP_Error('pieb_google', sprintf(
            /* translators: %s: correo electrónico */
            __('La cuenta %s no está en la lista del equipo. Pide a un responsable que la añada.', 'pieb-cancionero'),
            $email
        ), array('status' => 403));
    }

    if (!$user) {
        $base = sanitize_user(strstr($email, '@', true), true);
        $login = $base ? $base : 'equipo';
        $i = 1;
        while (username_exists($login)) {
            $login = $base . (++$i);
        }
        $nombre = isset($datos['name']) ? sanitize_text_field($datos['name']) : $login;
        $user_id = wp_insert_user(array(
            'user_login'   => $login,
            'user_email'   => $email,
            'user_pass'    => wp_generate_password(32, true, true),
            'display_name' => $nombre,
            'first_name'   => isset($datos['given_name']) ? sanitize_text_field($datos['given_name']) : '',
            'last_name'    => isset($datos['family_name']) ? sanitize_text_field($datos['family_name']) : '',
            'role'         => PIEB_CAN_ROLE,
        ));
        if (is_wp_error($user_id)) {
            return new WP_Error('pieb_google', sprintf(
                /* translators: %s: motivo del error devuelto por WordPress */
                __('No se pudo crear la cuenta: %s', 'pieb-cancionero'),
                $user_id->get_error_message()
            ), array('status' => 500));
        }
        $user = get_userdata($user_id);
        pieb_can_sincronizar_administrador($user);
    } else {
        // Las cuentas de administración siguen entrando con contraseña: Google solo da acceso al equipo.
        if (user_can($user, 'manage_options')) {
            return new WP_Error('pieb_google', __('Las cuentas de administración entran con usuario y contraseña.', 'pieb-cancionero'), array('status' => 403));
        }
        // Una cuenta ya vinculada a otro usuario de Google no se puede usar con un correo reasignado.
        $sub_guardado = get_user_meta($user->ID, 'pieb_can_google_sub', true);
        if ($sub_guardado && !hash_equals($sub_guardado, $sub)) {
            return new WP_Error('pieb_google', __('Esta cuenta está vinculada a otro usuario de Google.', 'pieb-cancionero'), array('status' => 403));
        }
        if (!user_can($user, PIEB_CAN_CAP_ACCESO)) {
            $user->add_role(PIEB_CAN_ROLE);
        }
        pieb_can_sincronizar_administrador($user);
    }

    update_user_meta($user->ID, 'pieb_can_google_sub', $sub);
    if (!empty($datos['picture'])) {
        update_user_meta($user->ID, 'pieb_can_avatar', esc_url_raw($datos['picture']));
    }

    wp_set_current_user($user->ID);
    wp_set_auth_cookie($user->ID, true);
    do_action('wp_login', $user->user_login, $user);

    return rest_ensure_response(array('ok' => true, 'nombre' => $user->display_name));
}

/* ------------------------------------------------------------------
 * Enlace mágico por correo (sin contraseñas)
 *
 * 1. La persona escribe su correo; si está en la lista del equipo, recibe un enlace de un solo uso (15 min).
 * 2. El enlace abre una pantalla con el botón «Entrar»: así los filtros antispam que visitan los enlaces
 *    no gastan el único uso.
 * 3. Al pulsar «Entrar» se valida el token, se crea la cuenta si hace falta y se inicia la sesión.
 * ------------------------------------------------------------------ */

const PIEB_CAN_ENLACE_MINUTOS = 15;

add_action('rest_api_init', function () {
    register_rest_route('pieb/v1', '/enlace', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_enlace',
        'permission_callback' => '__return_true',
    ));
    register_rest_route('pieb/v1', '/correo-prueba', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_correo_prueba',
        'permission_callback' => function () { return current_user_can(PIEB_CAN_CAP_GESTIONAR); },
    ));
});

/** Contador simple con transients: false si se supera el máximo en la ventana de tiempo. */
function pieb_can_limite($clave, $max, $segundos) {
    $clave = 'pieb_can_lim_' . md5($clave);
    $n = (int) get_transient($clave);
    if ($n >= $max) {
        return false;
    }
    set_transient($clave, $n + 1, $segundos);
    return true;
}

/** ¿Puede este correo entrar al cancionero? (Las cuentas de administración entran con contraseña). */
function pieb_can_email_con_acceso($email) {
    $user = get_user_by('email', $email);
    if ($user && user_can($user, 'manage_options')) {
        return false;
    }
    return pieb_can_email_permitido($email, pieb_can_ajustes()) || ($user && user_can($user, PIEB_CAN_CAP_ACCESO));
}

function pieb_can_rest_enlace(WP_REST_Request $request) {
    $email = strtolower(sanitize_email((string) $request->get_param('email')));
    $volver = wp_validate_redirect(esc_url_raw((string) $request->get_param('volver')), home_url('/'));
    $generico = rest_ensure_response(array(
        'ok'      => true,
        'mensaje' => __('Si tu correo está en la lista del equipo, en un momento recibirás un enlace para entrar. Revisa también la carpeta de spam.', 'pieb-cancionero'),
    ));

    if (!is_email($email)) {
        return new WP_Error('pieb_enlace', __('Escribe un correo válido.', 'pieb-cancionero'), array('status' => 400));
    }
    $ip = isset($_SERVER['REMOTE_ADDR']) ? sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'])) : '';
    if (!pieb_can_limite('ip' . $ip, 30, HOUR_IN_SECONDS)) {
        return new WP_Error('pieb_enlace', __('Demasiados intentos. Prueba de nuevo dentro de un rato.', 'pieb-cancionero'), array('status' => 429));
    }
    // La respuesta es la misma tanto si el correo está en la lista como si no: así no se puede averiguar quién está.
    if (!pieb_can_email_con_acceso($email) || !pieb_can_limite('mail' . $email, 3, PIEB_CAN_ENLACE_MINUTOS * MINUTE_IN_SECONDS)) {
        return $generico;
    }

    $token = bin2hex(random_bytes(32));
    set_transient('pieb_can_enlace_' . hash('sha256', $token), array('email' => $email), PIEB_CAN_ENLACE_MINUTOS * MINUTE_IN_SECONDS);

    $url = add_query_arg('pcan_enlace', $token, $volver);

    // El correo va en el idioma del sitio, no en el que tenga elegido quien haga la petición: quien lo recibe puede no
    // tener aún cuenta ni idioma propio. Se compone dentro de pieb_can_en_idioma_del_sitio().
    $mensaje = pieb_can_en_idioma_del_sitio(function () use ($url) {
        return pieb_can_enlace_componer($url);
    });

    if (!pieb_can_correo_enviar($email, $mensaje)) {
        return new WP_Error('pieb_enlace', __('El servidor no ha podido enviar el correo. Avisa a un responsable del equipo.', 'pieb-cancionero'), array('status' => 500));
    }
    return $generico;
}

/**
 * Correo con el enlace de acceso: asunto, HTML y texto plano, con el mismo aspecto que la bienvenida (cabecera con el
 * logo y tarjeta, ver includes/correo.php). Se llama dentro de pieb_can_en_idioma_del_sitio().
 */
function pieb_can_enlace_componer($url) {
    $nombre = pieb_can_nombre();
    $sitio = trim(wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES));

    /* translators: %s: nombre del cancionero */
    $asunto = sprintf(__('Tu enlace para entrar en %s', 'pieb-cancionero'), $nombre);
    $titulo = __('¡Ya casi estás dentro!', 'pieb-cancionero');
    if ($sitio !== '') {
        $parrafo = sprintf(
            /* translators: 1: nombre del cancionero, 2: nombre del sitio web */
            __('Aquí tienes tu enlace para entrar en %1$s, el cancionero de %2$s. Pulsa el botón y, cuando se abra, vuelve a pulsar «Entrar al cancionero». ¡Así de fácil!', 'pieb-cancionero'),
            $nombre,
            $sitio
        );
    } else {
        $parrafo = sprintf(
            /* translators: %s: nombre del cancionero */
            __('Aquí tienes tu enlace para entrar en %s. Pulsa el botón y, cuando se abra, vuelve a pulsar «Entrar al cancionero». ¡Así de fácil!', 'pieb-cancionero'),
            $nombre
        );
    }
    $boton = __('Entrar al cancionero', 'pieb-cancionero');
    $caduca = sprintf(
        /* translators: %d: minutos de validez del enlace */
        _n('El botón sirve una sola vez y caduca en %d minuto. Si se te pasa, pide otro desde el cancionero: es un momento.',
            'El botón sirve una sola vez y caduca en %d minutos. Si se te pasa, pide otro desde el cancionero: es un momento.',
            PIEB_CAN_ENLACE_MINUTOS, 'pieb-cancionero'),
        PIEB_CAN_ENLACE_MINUTOS
    );
    $copiar = __('¿El botón no funciona? Copia esta dirección en el navegador:', 'pieb-cancionero');
    $ignorar = __('Si no has pedido tú este enlace, no te preocupes: puedes ignorar este correo y el enlace caducará solo.', 'pieb-cancionero');
    $despedida = __('¡Nos vemos dentro! 🎶', 'pieb-cancionero');
    /* translators: %s: nombre del cancionero */
    $pie = sprintf(__('Recibes este correo porque se ha pedido entrar en el cancionero «%s» con esta dirección.', 'pieb-cancionero'), $nombre);

    $texto = $titulo . "\n\n"
        . $parrafo . "\n\n"
        . $boton . "\n" . $url . "\n\n"
        . $caduca . "\n"
        . $ignorar . "\n\n"
        . $despedida . "\n"
        . "\n--\n" . $pie . "\n";

    $filas  = pieb_can_correo_titulo($titulo);
    $filas .= pieb_can_correo_parrafo(esc_html($parrafo), 18);
    $filas .= pieb_can_correo_boton($url, $boton, 0);
    $filas .= pieb_can_correo_nota(esc_html($caduca));
    $filas .= pieb_can_correo_nota(esc_html($copiar), 12);
    $filas .= pieb_can_correo_direccion($url, 'left', 4);
    $filas .= pieb_can_correo_nota(esc_html($ignorar), 12);
    $filas .= pieb_can_correo_parrafo(esc_html($despedida), 0, 24);

    return array('asunto' => $asunto, 'html' => pieb_can_correo_html($asunto, $filas, $pie), 'texto' => $texto);
}

function pieb_can_rest_correo_prueba() {
    $user = wp_get_current_user();
    $ok = wp_mail(
        $user->user_email,
        __('Prueba de correo del Cancionero', 'pieb-cancionero'),
        __('Si lees esto, el servidor puede enviar los enlaces de acceso del Cancionero.', 'pieb-cancionero') . "\n"
    );
    if (!$ok) {
        return new WP_Error('pieb_correo', __('El servidor no ha podido enviar el correo: hace falta configurar un servicio de envío (SMTP).', 'pieb-cancionero'), array('status' => 500));
    }
    return rest_ensure_response(array('ok' => true, 'destino' => $user->user_email));
}

/** Busca o crea la cuenta del equipo para un correo. */
function pieb_can_usuario_para_email($email) {
    $user = get_user_by('email', $email);
    if (!$user) {
        $base = sanitize_user(strstr($email, '@', true), true);
        $login = $base ? $base : 'equipo';
        $i = 1;
        while (username_exists($login)) {
            $login = ($base ? $base : 'equipo') . (++$i);
        }
        $user_id = wp_insert_user(array(
            'user_login'   => $login,
            'user_email'   => $email,
            'user_pass'    => wp_generate_password(32, true, true),
            'display_name' => $login,
            'role'         => PIEB_CAN_ROLE,
        ));
        if (is_wp_error($user_id)) {
            return $user_id;
        }
        $nuevo = get_userdata($user_id);
        pieb_can_sincronizar_administrador($nuevo);
        return $nuevo;
    }
    if (!user_can($user, PIEB_CAN_CAP_ACCESO)) {
        $user->add_role(PIEB_CAN_ROLE);
    }
    pieb_can_sincronizar_administrador($user);
    return $user;
}

/**
 * Da o quita el rol de administrador del cancionero según la lista de Ajustes.
 * No toca a los administradores de WordPress, que ya gestionan todo.
 */
function pieb_can_sincronizar_administrador($user, $ajustes = null) {
    if (!$user || user_can($user, 'manage_options')) {
        return;
    }
    $ajustes = $ajustes ? $ajustes : pieb_can_ajustes();
    $es = in_array(strtolower($user->user_email), $ajustes['administradores'], true);
    $tiene = in_array(PIEB_CAN_ROLE_ADMIN, (array) $user->roles, true);
    if ($es && !$tiene) {
        $user->add_role(PIEB_CAN_ROLE_ADMIN);
    } elseif (!$es && $tiene) {
        $user->remove_role(PIEB_CAN_ROLE_ADMIN);
        // Deja de ser administrador, pero conserva el acceso si sigue en la lista del equipo.
        if (!user_can($user, PIEB_CAN_CAP_ACCESO) && pieb_can_email_permitido(strtolower($user->user_email), $ajustes)) {
            $user->add_role(PIEB_CAN_ROLE);
        }
    }
}

// Al pulsar «Entrar» en la pantalla del enlace.
add_action('init', function () {
    if (empty($_POST['pcan_enlace']) || (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] !== 'POST')) {
        return;
    }
    $token = preg_replace('/[^a-f0-9]/', '', (string) wp_unslash($_POST['pcan_enlace']));
    $volver = wp_validate_redirect(esc_url_raw(isset($_POST['pcan_volver']) ? wp_unslash($_POST['pcan_volver']) : ''), home_url('/'));
    $clave = 'pieb_can_enlace_' . hash('sha256', $token);
    $datos = get_transient($clave);

    if (!$datos || empty($datos['email']) || !pieb_can_email_con_acceso($datos['email'])) {
        wp_safe_redirect(add_query_arg('pcan_aviso', 'caducado', $volver));
        exit;
    }
    delete_transient($clave);

    $user = pieb_can_usuario_para_email($datos['email']);
    if (is_wp_error($user)) {
        wp_safe_redirect(add_query_arg('pcan_aviso', 'error', $volver));
        exit;
    }
    update_user_meta($user->ID, 'pieb_can_ultimo_acceso', time());
    wp_set_current_user($user->ID);
    wp_set_auth_cookie($user->ID, true);
    do_action('wp_login', $user->user_login, $user);
    wp_safe_redirect($volver);
    exit;
});
