<?php
/**
 * Registro de accesos: cuándo y cómo entra cada persona del equipo, para que el administrador vea en «Ajustes y equipo»
 * los inicios de sesión de cada una y estadísticas de uso.
 *
 * Se guarda lo mínimo: fecha, método (enlace, Google o contraseña) y tipo de dispositivo (móvil, tableta u ordenador).
 * Nunca la IP ni el navegador. El servidor solo registra y devuelve los datos en bruto (GET /pieb/v1/accesos); las
 * estadísticas las calcula la interfaz.
 *
 * - Meta de usuario «pieb_can_accesos»: inicios de sesión, lo más nuevo primero, cada uno
 *   array('t' => hora Unix, 'm' => 'enlace'|'google'|'contrasena', 'd' => 'movil'|'tableta'|'ordenador').
 * - Meta de usuario «pieb_can_dias»: días en que la persona abrió el cancionero ('Y-m-d' en la zona horaria del sitio), lo
 *   más nuevo primero. Iniciar sesión no es usar el cancionero (con «recordarme» la sesión dura 14 días), por eso se
 *   cuentan aparte.
 * - Meta de usuario «pieb_can_ultimo_acceso»: hora del último inicio de sesión (también la usa la lista del equipo).
 * - Opción «pieb_can_accesos_desde» (sin autoload): desde cuándo se registra, para que la interfaz no presente como
 *   «sin uso» lo que es simplemente anterior al registro.
 *
 * Se conservan 12 meses y como mucho PIEB_CAN_ACCESOS_MAX inicios de sesión por persona. Las copias de seguridad no
 * incluyen este registro.
 */

if (!defined('ABSPATH')) {
    exit;
}

// Días que se conserva el historial y máximo de inicios de sesión guardados por persona.
const PIEB_CAN_ACCESOS_DIAS = 365;
const PIEB_CAN_ACCESOS_MAX  = 400;

add_action('rest_api_init', function () {
    register_rest_route('pieb/v1', '/accesos', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'pieb_can_rest_accesos',
        'permission_callback' => function () { return current_user_can(PIEB_CAN_CAP_GESTIONAR); },
    ));
});

// Cada inicio de sesión de alguien con acceso al cancionero (también administradores y editores de WordPress).
add_action('wp_login', 'pieb_can_registrar_acceso', 10, 2);

// ---------------------------------------------------------------- registro

/**
 * Método del inicio de sesión en curso: 'enlace', 'google' o 'contrasena'. Los manejadores que inician la sesión por su
 * cuenta (el enlace por correo y Google, en google.php) lo indican justo antes de lanzar «wp_login»; si nadie lo indica,
 * es el formulario de WordPress ('contrasena'). Con un argumento lo fija; sin él, lo devuelve.
 */
function pieb_can_metodo_acceso($nuevo = null) {
    static $metodo = 'contrasena';
    if ($nuevo !== null) {
        $metodo = in_array($nuevo, array('enlace', 'google', 'contrasena'), true) ? $nuevo : 'contrasena';
    }
    return $metodo;
}

/**
 * Tipo de dispositivo según el agente de usuario de la petición: 'tableta', 'movil' u 'ordenador'. El agente de usuario
 * no se guarda. Los iPad modernos (iPadOS 13 o posterior) se presentan como un Mac y cuentan como ordenador.
 */
function pieb_can_dispositivo_acceso() {
    $agente = isset($_SERVER['HTTP_USER_AGENT']) ? strtolower((string) wp_unslash($_SERVER['HTTP_USER_AGENT'])) : '';
    // Android sin «Mobile» es una tableta (los móviles lo llevan; las tabletas, no).
    if (preg_match('/ipad|tablet|kindle|playbook/', $agente) || (strpos($agente, 'android') !== false && strpos($agente, 'mobi') === false)) {
        return 'tableta';
    }
    if (preg_match('/mobi|iphone|ipod|android|windows phone|blackberry|opera mini|iemobile/', $agente)) {
        return 'movil';
    }
    return 'ordenador';
}

/** Deja solo los inicios de sesión de los últimos PIEB_CAN_ACCESOS_DIAS días y, como mucho, PIEB_CAN_ACCESOS_MAX. */
function pieb_can_accesos_recortar($eventos, $ahora) {
    $limite = $ahora - PIEB_CAN_ACCESOS_DIAS * DAY_IN_SECONDS;
    $vigentes = array();
    foreach ($eventos as $evento) {
        if (is_array($evento) && isset($evento['t']) && (int) $evento['t'] >= $limite) {
            $vigentes[] = $evento;
        }
    }
    return array_slice($vigentes, 0, PIEB_CAN_ACCESOS_MAX);
}

/** Anota desde cuándo se registran los accesos. Solo la primera vez: add_option no pisa lo que ya existe. */
function pieb_can_accesos_marcar_inicio() {
    add_option('pieb_can_accesos_desde', time(), '', false);
}

/** Anota un inicio de sesión (gancho «wp_login»). Solo para quien tiene acceso al cancionero. */
function pieb_can_registrar_acceso($user_login, $user = null) {
    // El método vale solo para este inicio de sesión: se lee y se restablece aunque luego no haya nada que anotar.
    $metodo = pieb_can_metodo_acceso();
    pieb_can_metodo_acceso('contrasena');
    if (!($user instanceof WP_User) || !user_can($user, PIEB_CAN_CAP_ACCESO)) {
        return;
    }

    $ahora = time();
    $eventos = get_user_meta($user->ID, 'pieb_can_accesos', true);
    $eventos = is_array($eventos) ? $eventos : array();
    array_unshift($eventos, array('t' => $ahora, 'm' => $metodo, 'd' => pieb_can_dispositivo_acceso()));
    update_user_meta($user->ID, 'pieb_can_accesos', pieb_can_accesos_recortar($eventos, $ahora));
    update_user_meta($user->ID, 'pieb_can_ultimo_acceso', $ahora);
    pieb_can_accesos_marcar_inicio();
}

/**
 * Anota el día de hoy (zona horaria del sitio) como día de uso de la persona que abre el cancionero. Se llama desde el
 * shortcode, ya comprobado el acceso. Se mira solo el primer día guardado, así que se escribe como mucho una vez al día.
 * No cuenta cuando el shortcode se procesa en el escritorio o en la API (p. ej. al editar la página).
 */
function pieb_can_registrar_dia() {
    if (is_admin() || (defined('REST_REQUEST') && REST_REQUEST)) {
        return;
    }
    $user = wp_get_current_user();
    if (!$user->exists() || !user_can($user, PIEB_CAN_CAP_ACCESO)) {
        return;
    }

    $hoy = wp_date('Y-m-d');
    $dias = get_user_meta($user->ID, 'pieb_can_dias', true);
    $dias = is_array($dias) ? $dias : array();
    if (isset($dias[0]) && $dias[0] === $hoy) {
        return;
    }

    array_unshift($dias, $hoy);
    $limite = wp_date('Y-m-d', time() - PIEB_CAN_ACCESOS_DIAS * DAY_IN_SECONDS);
    $vigentes = array();
    foreach (array_unique($dias) as $dia) {
        if (is_string($dia) && $dia >= $limite) {
            $vigentes[] = $dia;
        }
    }
    update_user_meta($user->ID, 'pieb_can_dias', array_slice($vigentes, 0, PIEB_CAN_ACCESOS_DIAS));
    pieb_can_accesos_marcar_inicio();
}

// ---------------------------------------------------------------- GET /accesos

/**
 * Lo registrado de una cuenta, depurado para la API: último acceso (Unix, 0 si nunca), inicios de sesión
 * ({t, metodo, dispositivo}) y días de uso ('Y-m-d'), todo con lo más nuevo primero.
 */
function pieb_can_registro_usuario($user) {
    $accesos = array();
    $crudos = get_user_meta($user->ID, 'pieb_can_accesos', true);
    if (is_array($crudos)) {
        foreach ($crudos as $evento) {
            if (!is_array($evento) || empty($evento['t'])) {
                continue;
            }
            $metodo = isset($evento['m']) ? $evento['m'] : '';
            $dispositivo = isset($evento['d']) ? $evento['d'] : '';
            $accesos[] = array(
                't'           => (int) $evento['t'],
                'metodo'      => in_array($metodo, array('enlace', 'google', 'contrasena'), true) ? $metodo : 'contrasena',
                'dispositivo' => in_array($dispositivo, array('movil', 'tableta', 'ordenador'), true) ? $dispositivo : 'ordenador',
            );
        }
        usort($accesos, function ($a, $b) {
            return $b['t'] <=> $a['t'];
        });
    }

    $dias = array();
    $crudos = get_user_meta($user->ID, 'pieb_can_dias', true);
    if (is_array($crudos)) {
        foreach ($crudos as $dia) {
            if (is_string($dia) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dia)) {
                $dias[$dia] = $dia;
            }
        }
        $dias = array_values($dias);
        rsort($dias, SORT_STRING);
    }

    $ultimo = (int) get_user_meta($user->ID, 'pieb_can_ultimo_acceso', true);
    if ($accesos) {
        $ultimo = max($ultimo, $accesos[0]['t']);
    }
    return array('ultimoAcceso' => $ultimo, 'accesos' => $accesos, 'dias' => $dias);
}

/**
 * Datos en bruto para las estadísticas de uso (las calcula la interfaz). Personas: las de pieb_can_miembros() (los
 * correos de la lista, tengan o no cuenta, y las cuentas con los roles del cancionero) más cualquier otra cuenta con
 * acceso al cancionero que tenga algo registrado (p. ej. administradores de WordPress que entran al cancionero).
 */
function pieb_can_rest_accesos() {
    $ajustes = pieb_can_ajustes();

    $personas = array();
    $usuarios = array();
    foreach (pieb_can_miembros($ajustes) as $miembro) {
        $email = $miembro['email'];
        $personas[$email] = array(
            'email'    => $email,
            'nombre'   => (string) $miembro['nombre'],
            'enLista'  => (bool) $miembro['enLista'],
            'esAdmin'  => (bool) $miembro['esAdmin'],
            'esGestor' => (bool) $miembro['esGestor'],
        );
        $usuarios[$email] = get_user_by('email', $email);
    }

    // Otras cuentas con acceso que tengan algo registrado y no estén ya en el equipo.
    $otras = array();
    $con_registro = get_users(array(
        'meta_query' => array(
            'relation' => 'OR',
            array('key' => 'pieb_can_accesos', 'compare' => 'EXISTS'),
            array('key' => 'pieb_can_dias', 'compare' => 'EXISTS'),
        ),
    ));
    foreach ($con_registro as $u) {
        $email = strtolower($u->user_email);
        if (!isset($personas[$email]) && user_can($u, PIEB_CAN_CAP_ACCESO)) {
            $otras[$email] = $u;
        }
    }

    // Una sola consulta con los metadatos de todas las cuentas implicadas.
    $ids = array();
    foreach (array_merge(array_values($usuarios), array_values($otras)) as $u) {
        if ($u) {
            $ids[] = (int) $u->ID;
        }
    }
    if ($ids) {
        update_meta_cache('user', $ids);
    }

    foreach ($otras as $email => $u) {
        $registro = pieb_can_registro_usuario($u);
        if (!$registro['accesos'] && !$registro['dias']) {
            continue;
        }
        $personas[$email] = array(
            'email'    => $email,
            'nombre'   => (string) $u->display_name,
            'enLista'  => in_array($email, $ajustes['emails'], true),
            'esAdmin'  => user_can($u, 'manage_options'),
            // Igual que en pieb_can_miembros().
            'esGestor' => in_array($email, $ajustes['administradores'], true) || in_array(PIEB_CAN_ROLE_ADMIN, (array) $u->roles, true),
        );
        $usuarios[$email] = $u;
    }

    $resultado = array();
    ksort($personas);
    foreach ($personas as $email => $persona) {
        $u = isset($usuarios[$email]) ? $usuarios[$email] : false;
        $registro = $u ? pieb_can_registro_usuario($u) : array('ultimoAcceso' => 0, 'accesos' => array(), 'dias' => array());
        $persona['esAdmin'] = (bool) $persona['esAdmin'];
        $persona['cuenta'] = (bool) $u;
        // Antes de este registro, con Google o contraseña no se guardaba la fecha: «ha entrado» mira también eso.
        $persona['haEntrado'] = $u && (pieb_can_usuario_ha_entrado($u) || $registro['accesos'] || $registro['dias']);
        $resultado[] = $persona + $registro;
    }

    return rest_ensure_response(array(
        'desde'    => (int) get_option('pieb_can_accesos_desde', 0),
        'ahora'    => time(),
        'hoy'      => wp_date('Y-m-d'),
        'personas' => $resultado,
    ));
}
