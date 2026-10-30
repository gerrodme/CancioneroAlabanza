<?php
/**
 * Correo de bienvenida al equipo: explica cómo entrar al cancionero a quien se añade a la lista de correos.
 *
 * Envío automático: al guardar los ajustes, pieb_can_rest_ajustes_guardar() calcula con pieb_can_bienvenida_pendientes()
 * qué correos acaban de entrar en la lista y deben recibirla, y los devuelve en «bienvenidaPendiente». El envío NO se
 * hace dentro del guardado: lo hace la interfaz llamando a POST /pieb/v1/bienvenida por tandas de
 * PIEB_CAN_BIENVENIDA_TANDA correos y con barra de progreso, así no hay tiempos de espera largos si se pegan 40 correos
 * (cada wp_mail puede tardar un segundo con SMTP). El mismo endpoint sirve para reenviarla a mano y para la prueba (el
 * administrador se la envía a sí mismo para ver cómo queda).
 *
 * Registro: la opción «pieb_can_bienvenidas» (correo => marca de tiempo del último envío) evita repetir la automática.
 */

if (!defined('ABSPATH')) {
    exit;
}

// Máximo de correos por petición a /bienvenida y de bienvenidas por hora al mismo correo.
const PIEB_CAN_BIENVENIDA_TANDA    = 10;
const PIEB_CAN_BIENVENIDA_POR_HORA = 3;

add_action('rest_api_init', function () {
    register_rest_route('pieb/v1', '/bienvenida', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_bienvenida',
        'permission_callback' => function () { return current_user_can(PIEB_CAN_CAP_GESTIONAR); },
    ));
});

// ---------------------------------------------------------------- registro de envíos

/** Registro de bienvenidas enviadas: correo => marca de tiempo (Unix) del último envío. */
function pieb_can_bienvenidas() {
    $registro = get_option('pieb_can_bienvenidas', array());
    return is_array($registro) ? $registro : array();
}

/** Anota un envío correcto (no las pruebas). La opción no se carga en cada petición (autoload falso). */
function pieb_can_registrar_bienvenida($email) {
    $registro = pieb_can_bienvenidas();
    $registro[strtolower($email)] = time();
    update_option('pieb_can_bienvenidas', $registro, false);
}

/** ¿Ha entrado alguna vez esta cuenta (con Google o con enlace)? */
function pieb_can_usuario_ha_entrado($user) {
    return (bool) ($user && (get_user_meta($user->ID, 'pieb_can_google_sub', true) || get_user_meta($user->ID, 'pieb_can_ultimo_acceso', true)));
}

// ---------------------------------------------------------------- dirección de la página del cancionero

/**
 * Dirección válida de la página del cancionero: absoluta, de esta misma web y sin fragmento ni consulta, salvo
 * «page_id» o «p», que con los enlaces permanentes simples (?page_id=12) son la propia página. Devuelve '' si no vale.
 */
function pieb_can_pagina_valida($url) {
    if (!is_string($url) || trim($url) === '') {
        return '';
    }
    $url = wp_validate_redirect(esc_url_raw(trim($url)), '');
    $partes = wp_parse_url($url);
    if (!$partes || empty($partes['host']) || !isset($partes['scheme']) || !in_array($partes['scheme'], array('http', 'https'), true)) {
        return '';
    }
    $limpia = preg_replace('/[?#].*$/s', '', $url);
    if (!empty($partes['query'])) {
        parse_str($partes['query'], $consulta);
        $pagina = array_map('absint', array_intersect_key($consulta, array('page_id' => true, 'p' => true)));
        if (array_filter($pagina)) {
            $limpia = add_query_arg(array_filter($pagina), $limpia);
        }
    }
    return $limpia;
}

/** Página a la que apuntan los correos: la pedida si vale; si no, la guardada en los ajustes; si no, la portada. */
function pieb_can_pagina($pedida = '') {
    $url = pieb_can_pagina_valida($pedida);
    if ($url === '') {
        $url = pieb_can_pagina_valida(pieb_can_ajustes()['pagina']);
    }
    return $url !== '' ? $url : home_url('/');
}

// ---------------------------------------------------------------- bienvenida automática

/**
 * Correos a los que la interfaz debe enviar ahora la bienvenida automática tras guardar los ajustes: los que entran en la
 * lista con este guardado (están en «emails» y no estaban en los anteriores) cuando la bienvenida automática está activa,
 * que nunca la han recibido, que no han entrado nunca (sin cuenta, o cuenta sin acceso previo) y que no son cuentas de
 * administración de WordPress (esas entran con contraseña).
 */
function pieb_can_bienvenida_pendientes($anterior, $ajustes) {
    if (empty($ajustes['bienvenida_auto'])) {
        return array();
    }
    $registro = pieb_can_bienvenidas();
    $pendientes = array();
    foreach (array_diff($ajustes['emails'], $anterior['emails']) as $email) {
        if (isset($registro[$email])) {
            continue;
        }
        $u = get_user_by('email', $email);
        if ($u && (user_can($u, 'manage_options') || pieb_can_usuario_ha_entrado($u))) {
            continue;
        }
        $pendientes[] = $email;
    }
    return $pendientes;
}

// ---------------------------------------------------------------- el correo

/**
 * Compone el correo de bienvenida para un destinatario: asunto, HTML y texto plano. Se llama dentro de
 * pieb_can_en_idioma_del_sitio() (el correo va en el idioma del sitio, no en el de quien lo envía).
 *
 * HTML pensado para clientes de correo: tablas, estilos en línea, 600 px como máximo, sin <style> ni fuentes externas.
 * La imagen de cabecera va por dirección absoluta; al enviar se incrusta en el correo (ver pieb_can_bienvenida_enviar).
 */
function pieb_can_bienvenida_componer($email, $pagina, $texto_admin = null) {
    $ajustes = pieb_can_ajustes();
    $nombre = $ajustes['nombre'];
    // Igual que en el enlace de acceso: el nombre del sitio sin entidades HTML.
    $sitio = trim(wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES));
    // El texto del administrador es el guardado, salvo en la prueba, que lleva el que se está escribiendo.
    $texto_admin = trim(str_replace(array("\r\n", "\r"), "\n", (string) ($texto_admin === null ? $ajustes['bienvenida_texto'] : $texto_admin)));
    $con_google = $ajustes['google_client_id'] !== '';

    /* translators: %s: nombre del cancionero */
    $asunto = sprintf(__('Te damos la bienvenida a %s', 'pieb-cancionero'), $nombre);
    $titulo = __('¡Ya tienes acceso!', 'pieb-cancionero');
    if ($sitio !== '') {
        $parrafo = sprintf(
            /* translators: 1: nombre del cancionero, 2: nombre del sitio web */
            __('Ya puedes entrar en %1$s, el cancionero de %2$s. Ahí tienes todas las partituras, letras, audios de ensayo y setlists del equipo, a mano en el móvil, la tableta o el ordenador.', 'pieb-cancionero'),
            $nombre,
            $sitio
        );
    } else {
        $parrafo = sprintf(
            /* translators: %s: nombre del cancionero */
            __('Ya puedes entrar en %s. Ahí tienes todas las partituras, letras, audios de ensayo y setlists del equipo, a mano en el móvil, la tableta o el ordenador.', 'pieb-cancionero'),
            $nombre
        );
    }
    $como = __('Cómo entrar', 'pieb-cancionero');
    $paso1 = __('Abre el cancionero con el botón de abajo y guárdalo en favoritos o en la pantalla de inicio del móvil.', 'pieb-cancionero');
    /* translators: %s: correo electrónico de la persona que recibe el mensaje */
    $paso2 = sprintf(__('Escribe tu correo: %s', 'pieb-cancionero'), $email);
    $paso3 = __('Te llegará un enlace para entrar: púlsalo y listo, sin contraseñas.', 'pieb-cancionero');
    /* translators: «Iniciar sesión con Google» es el texto del botón de Google de la pantalla de acceso; en cada idioma, tal como lo muestra Google (en inglés, «Sign in with Google») */
    $aviso_google = __('Si tu correo es de Google, también puedes entrar con el botón «Iniciar sesión con Google».', 'pieb-cancionero');
    $boton = __('Abrir el cancionero', 'pieb-cancionero');
    /* translators: %s: nombre del cancionero */
    $pie = sprintf(__('Recibes este correo porque te han añadido al equipo del cancionero «%s». Si no lo esperabas, puedes ignorarlo.', 'pieb-cancionero'), $nombre);

    // ---- Texto plano
    $texto = $titulo . "\n\n"
        . $parrafo . "\n\n"
        . $como . "\n"
        . '1. ' . $paso1 . "\n"
        . '2. ' . $paso2 . "\n"
        . '3. ' . $paso3 . "\n";
    if ($con_google) {
        $texto .= "\n" . $aviso_google . "\n";
    }
    $texto .= "\n" . $boton . "\n" . $pagina . "\n";
    if ($texto_admin !== '') {
        $texto .= "\n" . $texto_admin . "\n";
    }
    $texto .= "\n--\n" . $pie . "\n";

    // ---- HTML
    $f = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
    $fila_paso = function ($numero, $color, $contenido) use ($f) {
        return '<tr>'
            . '<td width="32" valign="top" style="padding:0 0 18px 0;">'
            . '<table role="presentation" width="32" cellpadding="0" cellspacing="0" border="0"><tr>'
            . '<td width="32" height="32" align="center" valign="middle" bgcolor="' . $color . '" style="width:32px;height:32px;border-radius:16px;background:' . $color . ';color:#ffffff;font-family:' . $f . ';font-size:16px;font-weight:700;line-height:32px;">' . $numero . '</td>'
            . '</tr></table></td>'
            . '<td valign="top" style="padding:4px 0 18px 14px;font-family:' . $f . ';font-size:16px;line-height:1.5;color:#3b3552;">' . $contenido . '</td>'
            . '</tr>';
    };

    $html  = '<!DOCTYPE html>';
    $html .= '<html lang="' . esc_attr(get_bloginfo('language')) . '"><head><meta charset="UTF-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>' . esc_html($asunto) . '</title></head>';
    $html .= '<body style="margin:0;padding:0;background:#f3f0fa;">';
    $html .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f0fa;"><tr><td align="center" style="padding:24px 12px;">';
    $html .= '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">';

    // Cabecera: el logo sobre fondo oscuro, con las esquinas superiores redondeadas.
    $html .= '<tr><td style="border-radius:16px 16px 0 0;line-height:0;font-size:0;">'
        . '<img src="' . esc_url(PIEB_CAN_URL . 'assets/correo-cabecera.jpg') . '" width="600" height="180" alt="' . esc_attr($nombre) . '" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:16px 16px 0 0;">'
        . '</td></tr>';

    // Tarjeta blanca.
    $html .= '<tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:32px;font-family:' . $f . ';color:#3b3552;">';
    $html .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">';

    $html .= '<tr><td style="padding:0 0 14px;"><h1 style="margin:0;font-family:' . $f . ';font-size:30px;line-height:1.2;font-weight:800;color:#0b0718;">' . esc_html($titulo) . '</h1></td></tr>';
    $html .= '<tr><td style="padding:0 0 28px;font-family:' . $f . ';font-size:16px;line-height:1.6;color:#3b3552;">' . esc_html($parrafo) . '</td></tr>';
    $html .= '<tr><td style="padding:0 0 16px;"><h2 style="margin:0;font-family:' . $f . ';font-size:20px;line-height:1.3;font-weight:700;color:#0b0718;">' . esc_html($como) . '</h2></td></tr>';

    $html .= '<tr><td style="padding:0 0 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">';
    $html .= $fila_paso(1, '#ff2e88', esc_html($paso1));
    $html .= $fila_paso(2, '#8b5cf6', sprintf(
        /* translators: %s: correo electrónico de la persona que recibe el mensaje */
        esc_html__('Escribe tu correo: %s', 'pieb-cancionero'),
        // Enlace explícito con su estilo: si no, Gmail lo convierte en un enlace azul subrayado.
        '<a href="mailto:' . esc_attr($email) . '" style="color:#0b0718;font-weight:700;text-decoration:none;">' . esc_html($email) . '</a>'
    ));
    $html .= $fila_paso(3, '#22d3ee', esc_html($paso3));
    $html .= '</table></td></tr>';

    if ($con_google) {
        $html .= '<tr><td style="padding:0 0 10px;font-family:' . $f . ';font-size:14px;line-height:1.5;color:#6b6585;">' . esc_html($aviso_google) . '</td></tr>';
    }

    // Botón a prueba de clientes de correo (tabla con celda de color y enlace) y la dirección en pequeño, para copiarla.
    $html .= '<tr><td align="center" style="padding:16px 0 0;">'
        . '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr>'
        . '<td align="center" bgcolor="#8b5cf6" style="border-radius:12px;background:#8b5cf6;">'
        . '<a href="' . esc_url($pagina) . '" target="_blank" style="display:inline-block;padding:16px 40px;font-family:' . $f . ';font-size:18px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:12px;">' . esc_html($boton) . '</a>'
        . '</td></tr></table></td></tr>';
    $html .= '<tr><td align="center" style="padding:14px 0 0;font-family:' . $f . ';font-size:12px;line-height:1.5;color:#8a85a0;word-break:break-all;">' . esc_html($pagina) . '</td></tr>';

    // Mensaje opcional del administrador (p. ej. dónde está el cancionero en su web).
    if ($texto_admin !== '') {
        $html .= '<tr><td style="padding:28px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
            . '<td style="background:#faf5ff;border-left:4px solid #8b5cf6;padding:14px 18px;font-family:' . $f . ';font-size:15px;line-height:1.55;color:#3b3552;">' . nl2br(esc_html($texto_admin)) . '</td>'
            . '</tr></table></td></tr>';
    }

    $html .= '</table></td></tr>'; // fin de la tarjeta

    // Pie, fuera de la tarjeta.
    $html .= '<tr><td align="center" style="padding:20px 16px 0;font-family:' . $f . ';font-size:12px;line-height:1.5;color:#8a85a0;">' . esc_html($pie) . '</td></tr>';
    $html .= '</table></td></tr></table></body></html>';

    return array('asunto' => $asunto, 'html' => $html, 'texto' => $texto);
}

/**
 * Envía un correo ya compuesto. Solo para este envío, en PHPMailer: el texto plano va como AltBody y la cabecera va
 * incrustada en el propio correo (cid:), porque Gmail y otros no muestran la imagen si no pueden descargarla de la web
 * (sitios de pruebas, protegidos o en local). Si el servicio de correo no pasa por phpmailer_init, queda la dirección.
 */
function pieb_can_bienvenida_enviar($email, $correo) {
    $poner_texto = function ($phpmailer) use ($correo) {
        $phpmailer->AltBody = $correo['texto'];
        $archivo = PIEB_CAN_DIR . 'assets/correo-cabecera.jpg';
        $url = esc_url(PIEB_CAN_URL . 'assets/correo-cabecera.jpg');
        if (is_readable($archivo) && strpos($phpmailer->Body, $url) !== false
            && $phpmailer->addEmbeddedImage($archivo, 'pcan-cabecera', 'cancionero.jpg', 'base64', 'image/jpeg')) {
            $phpmailer->Body = str_replace($url, 'cid:pcan-cabecera', $phpmailer->Body);
        }
    };
    add_action('phpmailer_init', $poner_texto);
    try {
        return (bool) wp_mail($email, $correo['asunto'], $correo['html'], array('Content-Type: text/html; charset=UTF-8'));
    } finally {
        remove_action('phpmailer_init', $poner_texto);
    }
}

// ---------------------------------------------------------------- API

/**
 * POST /bienvenida: envía la bienvenida a una tanda de correos (máx. PIEB_CAN_BIENVENIDA_TANDA).
 *   emails  lista de correos.
 *   pagina  (opcional) dirección de la página del cancionero.
 *   prueba  (opcional) si es verdadero, solo se envía al usuario actual y sin registrarla; puede llevar
 *           «bienvenidaTexto» (el texto aún sin guardar) para ver cómo queda.
 * Responde { enviados: [correo], fallidos: [{email, motivo}], omitidos: [{email, motivo}], momento }.
 */
function pieb_can_rest_bienvenida(WP_REST_Request $request) {
    $prueba = rest_sanitize_boolean($request->get_param('prueba'));
    $pagina = pieb_can_pagina($request->get_param('pagina'));
    $res = array('enviados' => array(), 'fallidos' => array(), 'omitidos' => array());
    $destinos = array();
    $texto_admin = null;

    if ($prueba) {
        // La prueba va a quien la pide, aunque sea cuenta de administración, para que vea cómo queda el correo.
        $email = strtolower((string) wp_get_current_user()->user_email);
        if (!is_email($email)) {
            return new WP_Error('pieb_bienvenida', __('Tu cuenta no tiene un correo válido.', 'pieb-cancionero'), array('status' => 400));
        }
        $destinos[] = $email;
        // Puede llevar el texto que se está escribiendo, aún sin guardar, para ver cómo queda.
        if ($request->has_param('bienvenidaTexto')) {
            $texto_admin = mb_substr(trim(sanitize_textarea_field((string) $request->get_param('bienvenidaTexto'))), 0, 1000);
        }
    } else {
        $emails = pieb_can_normalizar_emails(implode(' ', array_filter((array) $request->get_param('emails'), 'is_string')));
        if (count($emails) > PIEB_CAN_BIENVENIDA_TANDA) {
            return new WP_Error('pieb_bienvenida', sprintf(
                /* translators: %d: número máximo de correos por petición */
                __('Demasiados correos de una vez (máximo %d).', 'pieb-cancionero'),
                PIEB_CAN_BIENVENIDA_TANDA
            ), array('status' => 400));
        }
        foreach ($emails as $email) {
            $user = get_user_by('email', $email);
            if ($user && user_can($user, 'manage_options')) {
                $motivo = __('Cuenta de administración: entra con contraseña', 'pieb-cancionero');
            } elseif (!pieb_can_email_con_acceso($email)) {
                $motivo = __('No está en la lista del equipo', 'pieb-cancionero');
            } elseif (!pieb_can_limite('bienvenida' . $email, PIEB_CAN_BIENVENIDA_POR_HORA, HOUR_IN_SECONDS)) {
                $motivo = __('Demasiados envíos seguidos; prueba más tarde', 'pieb-cancionero');
            } else {
                $destinos[] = $email;
                continue;
            }
            $res['omitidos'][] = array('email' => $email, 'motivo' => $motivo);
        }
    }

    if ($destinos) {
        // Todos los correos de la tanda se componen en una sola pasada por el idioma del sitio (recargar las traducciones
        // una vez, no una por correo). Los motivos de arriba y de abajo, en cambio, van en el idioma de quien administra.
        $correos = pieb_can_en_idioma_del_sitio(function () use ($destinos, $pagina, $texto_admin) {
            $compuestos = array();
            foreach ($destinos as $email) {
                $compuestos[$email] = pieb_can_bienvenida_componer($email, $pagina, $texto_admin);
            }
            return $compuestos;
        });
        foreach ($destinos as $email) {
            if (pieb_can_bienvenida_enviar($email, $correos[$email])) {
                $res['enviados'][] = $email;
                if (!$prueba) {
                    pieb_can_registrar_bienvenida($email);
                }
            } else {
                $res['fallidos'][] = array('email' => $email, 'motivo' => __('El servidor no ha podido enviar el correo', 'pieb-cancionero'));
            }
        }
    }

    $res['momento'] = time();
    return rest_ensure_response($res);
}
