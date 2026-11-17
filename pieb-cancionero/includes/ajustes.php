<?php
/**
 * Ajustes del cancionero (tema por defecto, acceso con Google, lista del equipo)
 * y preferencias de cada usuario (tema, idioma y notación de las tonalidades).
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Temas disponibles. «sitio» sigue los colores y la tipografía del tema activo de WordPress;
 * «colores» y «pentagrama» son estilos sobre esa misma base (ver pieb_can_atributos_raiz).
 * Los nombres se traducen al llamar a la función, nunca antes de «init».
 */
function pieb_can_temas() {
    return array(
        'colores'    => __('Colores', 'pieb-cancionero'),
        'pentagrama' => __('Pentagrama', 'pieb-cancionero'),
        'sitio'      => __('Como la web', 'pieb-cancionero'),
        'pulso'      => __('Pulso', 'pieb-cancionero'),
        'claro'      => __('Estudio', 'pieb-cancionero'),
        'escenario'  => __('Escenario', 'pieb-cancionero'),
        'papel'      => __('Partitura', 'pieb-cancionero'),
    );
}

function pieb_can_ajustes() {
    $guardados = get_option('pieb_can_ajustes', array());
    $ajustes = wp_parse_args(is_array($guardados) ? $guardados : array(), array(
        'nombre'           => '',
        'subtitulo'        => null,
        'papelera_dias'    => 30,
        'tema_defecto'     => 'colores',
        'google_client_id' => '',
        'emails'           => array(),
        'administradores'  => array(),
        // Responsables de escaleta: además de lo del equipo, preparan la escaleta de los cultos (rol PIEB_CAN_ROLE_ESCALETA).
        'responsablesEscaleta' => array(),
        'dominio'          => '',
        // Correo de bienvenida a quien se añade a la lista (ver includes/bienvenida.php): envío automático, texto extra
        // del administrador y dirección de la página del cancionero (la que envía la interfaz; '' = aún no se conoce).
        'bienvenida_auto'  => true,
        'bienvenida_texto' => '',
        'pagina'           => '',
        // Aviso por correo a los administradores cuando alguien borra una canción (ver includes/avisos.php).
        'aviso_borrado'    => true,
    ));
    $ajustes['bienvenida_auto'] = (bool) $ajustes['bienvenida_auto'];
    $ajustes['aviso_borrado'] = (bool) $ajustes['aviso_borrado'];
    // Sin nombre propio se muestra el nombre por defecto en el idioma de quien mira («Cancionero» / «Songbook»). Las
    // instalaciones que guardaron «Cancionero» antes de la 1.8.1 se tratan igual que las que no guardaron nada.
    if (trim((string) $ajustes['nombre']) === '' || $ajustes['nombre'] === 'Cancionero') {
        /* translators: nombre por defecto del cancionero cuando la instalación no le ha puesto uno propio (en inglés, «Songbook») */
        $ajustes['nombre'] = __('Cancionero', 'pieb-cancionero');
    }
    // Sin subtítulo guardado se usa el nombre del sitio de WordPress; guardado vacío = sin subtítulo.
    if ($ajustes['subtitulo'] === null) {
        $ajustes['subtitulo'] = get_bloginfo('name');
    }
    if (!isset(pieb_can_temas()[$ajustes['tema_defecto']])) {
        $ajustes['tema_defecto'] = 'colores';
    }
    return $ajustes;
}

/** Nombre del cancionero, configurable en Ajustes (por defecto «Cancionero», traducible). */
function pieb_can_nombre() {
    return pieb_can_ajustes()['nombre'];
}

/** Línea bajo el nombre del cancionero (por defecto, el nombre del sitio). */
function pieb_can_subtitulo() {
    return pieb_can_ajustes()['subtitulo'];
}

function pieb_can_tema_usuario() {
    $tema = get_user_meta(get_current_user_id(), 'pieb_can_tema', true);
    return isset(pieb_can_temas()[$tema]) ? $tema : pieb_can_ajustes()['tema_defecto'];
}

// ---------------------------------------------------------------- idioma y notación de cada usuario

/**
 * Nombres nativos de los idiomas más habituales, para el menú del usuario (sin consultar nada por red).
 * Un idioma que no esté aquí se muestra con su nombre nativo según WordPress, si lo conoce, o con su código.
 */
function pieb_can_nombres_idiomas() {
    return array(
        'en_US' => 'English',
        'en_GB' => 'English (UK)',
        'es_ES' => 'Español',
        'es_MX' => 'Español (México)',
        'fr_FR' => 'Français',
        'pt_BR' => 'Português (Brasil)',
        'pt_PT' => 'Português (Portugal)',
        'de_DE' => 'Deutsch',
        'it_IT' => 'Italiano',
        'ca'    => 'Català',
        'gl_ES' => 'Galego',
        'nl_NL' => 'Nederlands',
        'ru_RU' => 'Русский',
        'ko_KR' => '한국어',
        'ja'    => '日本語',
        'zh_CN' => '简体中文',
    );
}

/** Código de lengua de un locale: «en_GB» → «en». */
function pieb_can_lengua($locale) {
    $partes = preg_split('/[_-]/', strtolower((string) $locale));
    return $partes[0];
}

/**
 * Locales que tienen traducción propia: uno por cada pieb-cancionero-<locale>.mo, ya sea en la carpeta del plugin
 * (languages/) o en la del sistema (wp-content/languages/plugins/: Loco Translate «System», translate.wordpress.org).
 */
function pieb_can_locales_con_traduccion() {
    static $locales = null;
    if ($locales === null) {
        $locales = array();
        $carpetas = array(PIEB_CAN_DIR . 'languages');
        if (defined('WP_LANG_DIR')) {
            $carpetas[] = rtrim(WP_LANG_DIR, '/\\') . '/plugins';
        }
        foreach ($carpetas as $carpeta) {
            $archivos = glob($carpeta . '/pieb-cancionero-*.mo');
            foreach ((array) $archivos as $archivo) {
                $locale = substr(basename($archivo, '.mo'), strlen('pieb-cancionero-'));
                if ($locale !== '' && preg_match('/^[A-Za-z0-9_@-]+$/', $locale) && !in_array($locale, $locales, true)) {
                    $locales[] = $locale;
                }
            }
        }
        sort($locales);
    }
    return $locales;
}

/**
 * Idiomas entre los que puede elegir un usuario: locale => nombre nativo. El español es el idioma base de los textos
 * (no necesita archivo) y cada .mo de languages/ añade uno.
 */
function pieb_can_idiomas_disponibles() {
    $conocidos = pieb_can_nombres_idiomas();
    $idiomas = array('es_ES' => $conocidos['es_ES']);
    foreach (pieb_can_locales_con_traduccion() as $locale) {
        if (isset($idiomas[$locale])) {
            continue;
        }
        if (isset($conocidos[$locale])) {
            $idiomas[$locale] = $conocidos[$locale];
        } elseif (function_exists('wp_get_available_translations')) {
            $traducciones = wp_get_available_translations();
            $idiomas[$locale] = isset($traducciones[$locale]['native_name']) ? $traducciones[$locale]['native_name'] : $locale;
        } else {
            $idiomas[$locale] = $locale;
        }
    }
    return $idiomas;
}

/** Idioma que el usuario actual eligió en su menú ('' = el del sitio). */
function pieb_can_idioma_elegido() {
    $id = function_exists('get_current_user_id') ? get_current_user_id() : 0;
    if (!$id) {
        return '';
    }
    $elegido = (string) get_user_meta($id, 'pieb_idioma', true);
    return isset(pieb_can_idiomas_disponibles()[$elegido]) ? $elegido : '';
}

/**
 * Idioma forzado temporalmente (ver pieb_can_en_idioma_del_sitio). Sin argumentos devuelve el actual (null = ninguno);
 * con argumento lo fija y devuelve el anterior.
 */
function pieb_can_idioma_forzado($nuevo = false) {
    static $forzado = null;
    $anterior = $forzado;
    if ($nuevo !== false) {
        $forzado = $nuevo;
    }
    return $anterior;
}

/**
 * Ejecuta $funcion con los textos del cancionero en el idioma del sitio (no en el que tenga elegido quien hace la
 * petición) y vuelve al idioma normal. Se usa para los correos, cuya persona destinataria puede no tener cuenta aún.
 * Recarga el dominio a mano porque switch_to_locale() no vuelve a cargar los plugins en WordPress anteriores a la 6.5.
 */
function pieb_can_en_idioma_del_sitio($funcion) {
    $anterior = pieb_can_idioma_forzado(get_locale());
    unload_textdomain('pieb-cancionero');
    load_plugin_textdomain('pieb-cancionero', false, dirname(plugin_basename(PIEB_CAN_FILE)) . '/languages');
    try {
        return call_user_func($funcion);
    } finally {
        pieb_can_idioma_forzado($anterior);
        unload_textdomain('pieb-cancionero');
        load_plugin_textdomain('pieb-cancionero', false, dirname(plugin_basename(PIEB_CAN_FILE)) . '/languages');
    }
}

/** Idioma pedido: el forzado, el que eligió el usuario o, si no, el de WordPress. */
function pieb_can_idioma_pedido() {
    $forzado = pieb_can_idioma_forzado();
    if ($forzado) {
        return (string) $forzado;
    }
    $elegido = pieb_can_idioma_elegido();
    if ($elegido !== '') {
        return $elegido;
    }
    $sitio = (string) determine_locale();
    return $sitio !== '' ? $sitio : 'es_ES';
}

/**
 * Locale efectivo del cancionero para el usuario actual (el de las traducciones que se cargan).
 * Español: sin archivo, porque es el idioma base. Otros idiomas: su .mo; si no existe, el primero del mismo idioma
 * (en_GB → en_US) y, si tampoco, el español base.
 */
function pieb_can_idioma() {
    $pedido = pieb_can_idioma_pedido();
    $lengua = pieb_can_lengua($pedido);
    if ($lengua === 'es') {
        return $pedido;
    }
    $disponibles = pieb_can_locales_con_traduccion();
    if (in_array($pedido, $disponibles, true)) {
        return $pedido;
    }
    foreach ($disponibles as $locale) {
        if (pieb_can_lengua($locale) === $lengua) {
            return $locale;
        }
    }
    return 'es_ES';
}

/** Etiqueta BCP 47 para Intl en el navegador: «en_GB» → «en-GB». Si el locale pedido es del mismo idioma, se prefiere su región. */
function pieb_can_idioma_bcp47() {
    $locale = pieb_can_idioma();
    $pedido = pieb_can_idioma_pedido();
    if (pieb_can_lengua($pedido) === pieb_can_lengua($locale)) {
        $locale = $pedido;
    }
    $partes = preg_split('/[_-]/', preg_replace('/@.*/', '', $locale));
    $etiqueta = strtolower($partes[0]);
    if (isset($partes[1]) && preg_match('/^([A-Za-z]{2}|[0-9]{3})$/', $partes[1])) {
        $etiqueta .= '-' . strtoupper($partes[1]);
    }
    return $etiqueta;
}

/** Notación de tonalidades elegida por el usuario: '' (automática), 'latina' o 'americana'. */
function pieb_can_notacion_elegida() {
    $id = function_exists('get_current_user_id') ? get_current_user_id() : 0;
    $elegida = $id ? (string) get_user_meta($id, 'pieb_notacion', true) : '';
    return in_array($elegida, array('latina', 'americana'), true) ? $elegida : '';
}

/**
 * Notación efectiva: la elegida o, si la persona aún no ha elegido, la del idioma de la web (latina en español,
 * americana en los demás). No depende del idioma que cada uno elige en su menú: cambiar de idioma no cambia la notación.
 */
function pieb_can_notacion() {
    $elegida = pieb_can_notacion_elegida();
    if ($elegida !== '') {
        return $elegida;
    }
    return pieb_can_lengua(get_locale()) === 'es' ? 'latina' : 'americana';
}

/*
 * Cada usuario puede usar el cancionero en un idioma distinto al del sitio. Estos filtros afectan solo al dominio
 * «pieb-cancionero», nunca al resto de WordPress. El usuario ya se conoce en «init» (también en las peticiones REST,
 * por la cookie de sesión), así que los mensajes de la API salen en su idioma sin tener que recargar nada más.
 */
add_filter('plugin_locale', function ($locale, $domain) {
    return $domain === 'pieb-cancionero' ? pieb_can_idioma() : $locale;
}, 10, 2);

// Los JSON de las traducciones de JS se buscan con el locale del sitio; aquí se cambia por el del usuario (solo los nuestros).
// WordPress llama a este filtro una vez por cada ruta que prueba: primero la de la carpeta del plugin (el $path que
// pasa wp_set_script_translations) y después wp-content/languages/plugins. Para que la carpeta del sistema tenga
// preferencia (igual que con los .mo) y funcione en cualquiera de los dos intentos, se busca el archivo con el locale
// del usuario primero allí y luego en la del plugin; si no está en ninguna, se deja en la carpeta del intento.
add_filter('load_script_translation_file', function ($archivo, $handle, $dominio) {
    if ($dominio !== 'pieb-cancionero' || !is_string($archivo) || $archivo === '') {
        return $archivo;
    }
    $carpeta = wp_normalize_path(dirname($archivo));
    $carpetas = array();
    if (defined('WP_LANG_DIR')) {
        $carpetas[] = wp_normalize_path(rtrim(WP_LANG_DIR, '/\\') . '/plugins');
    }
    $carpetas[] = wp_normalize_path(rtrim(PIEB_CAN_DIR, '/\\') . '/languages');
    if (!in_array($carpeta, $carpetas, true)) {
        return $archivo;
    }
    $nombre = basename($archivo);
    $prefijo = 'pieb-cancionero-' . determine_locale() . '-';
    if (strpos($nombre, $prefijo) !== 0) {
        return $archivo;
    }
    $nuevo = 'pieb-cancionero-' . pieb_can_idioma() . '-' . substr($nombre, strlen($prefijo));
    foreach ($carpetas as $candidata) {
        if (file_exists($candidata . '/' . $nuevo)) {
            return $candidata . '/' . $nuevo;
        }
    }
    return $carpeta . '/' . $nuevo;
}, 10, 3);

/**
 * Guarda los ajustes. Si el nombre es el por defecto (el traducido de cualquier idioma o «Cancionero») se guarda vacío,
 * para que siga siendo «el de por defecto» y cada persona lo vea en su idioma, no el de quien guardó.
 */
function pieb_can_guardar_ajustes($ajustes) {
    $nombre = trim((string) $ajustes['nombre']);
    if ($nombre === 'Cancionero' || $nombre === __('Cancionero', 'pieb-cancionero')) {
        $nombre = '';
    }
    $ajustes['nombre'] = $nombre;
    update_option('pieb_can_ajustes', $ajustes, false);
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
            'permission_callback' => function () { return pieb_can_puede_gestionar(); },
        ),
        array(
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'pieb_can_rest_ajustes_guardar',
            'permission_callback' => function () { return pieb_can_puede_gestionar(); },
        ),
    ));

    register_rest_route('pieb/v1', '/huerfanos', array(
        array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'pieb_can_rest_huerfanos',
            'permission_callback' => function () { return pieb_can_es_central(); },
        ),
        array(
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'pieb_can_rest_huerfanos_borrar',
            'permission_callback' => function () { return pieb_can_es_central(); },
        ),
    ));
});

function pieb_can_rest_preferencias(WP_REST_Request $request) {
    // Cada parámetro es opcional ('idioma' y 'notacion' vacíos = automático), pero debe llegar al menos uno.
    $tiene_idioma   = $request->has_param('idioma');
    $tiene_notacion = $request->has_param('notacion');
    $tiene_tema     = $request->has_param('tema') || !($tiene_idioma || $tiene_notacion);
    $tema     = (string) $request->get_param('tema');
    $idioma   = (string) $request->get_param('idioma');
    $notacion = (string) $request->get_param('notacion');

    if ($tiene_tema && !isset(pieb_can_temas()[$tema])) {
        return new WP_Error('pieb_tema', __('Tema desconocido.', 'pieb-cancionero'), array('status' => 400));
    }
    if ($tiene_idioma && $idioma !== '' && !isset(pieb_can_idiomas_disponibles()[$idioma])) {
        return new WP_Error('pieb_idioma', __('Idioma desconocido.', 'pieb-cancionero'), array('status' => 400));
    }
    if ($tiene_notacion && !in_array($notacion, array('', 'latina', 'americana'), true)) {
        return new WP_Error('pieb_notacion', __('Notación desconocida.', 'pieb-cancionero'), array('status' => 400));
    }

    $usuario = get_current_user_id();
    $respuesta = array();
    if ($tiene_tema) {
        update_user_meta($usuario, 'pieb_can_tema', $tema);
        $respuesta['tema'] = $tema;
    }
    if ($tiene_idioma) {
        if ($idioma === '') {
            delete_user_meta($usuario, 'pieb_idioma');
        } else {
            update_user_meta($usuario, 'pieb_idioma', $idioma);
        }
        $respuesta['idioma'] = $idioma;
    }
    if ($tiene_notacion) {
        if ($notacion === '') {
            delete_user_meta($usuario, 'pieb_notacion');
        } else {
            update_user_meta($usuario, 'pieb_notacion', $notacion);
        }
        $respuesta['notacion'] = $notacion;
    }
    // Si LiteSpeed Cache guardó una copia privada de la página para esta persona, se borra: al recargar debe verse ya
    // con el tema, el idioma y la notación nuevos (sin el plugin de LiteSpeed, esta acción no hace nada).
    do_action('litespeed_purge_private_all');
    return rest_ensure_response($respuesta);
}

/**
 * Miembros de una iglesia (0 = la activa): los correos de sus listas, con o sin cuenta. En la iglesia por defecto, además,
 * las cuentas con roles del cancionero que no figuran en ninguna lista de ninguna iglesia.
 */
function pieb_can_miembros($iglesia_id = 0) {
    $iglesia_id = $iglesia_id ? (int) $iglesia_id : (int) pieb_can_iglesia_activa();
    $defecto = pieb_can_es_iglesia_defecto($iglesia_id);
    $equipos = pieb_can_equipos_todos();
    $equipo = pieb_can_equipo($iglesia_id);

    // Correos de las demás iglesias: sus roles de WordPress no cuentan como roles de esta (ver pieb_can_iglesias_de).
    $en_otras = array();
    foreach ($equipos as $id => $otro) {
        if (!pieb_can_es_iglesia_defecto($id)) {
            $en_otras = array_merge($en_otras, $otro['administradores'], $otro['responsablesEscaleta'], $otro['emails']);
        }
    }
    $en_otras = array_flip($en_otras);
    $flags = function ($email, $u) use ($equipo, $defecto, $en_otras) {
        $por_rol = $defecto && $u && !isset($en_otras[$email]);
        return array(
            'esGestor'   => in_array($email, $equipo['administradores'], true) || ($por_rol && in_array(PIEB_CAN_ROLE_ADMIN, (array) $u->roles, true)),
            'esEscaleta' => in_array($email, $equipo['responsablesEscaleta'], true) || ($por_rol && in_array(PIEB_CAN_ROLE_ESCALETA, (array) $u->roles, true)),
        );
    };

    $miembros = array();
    foreach ($equipo['emails'] as $email) {
        $u = get_user_by('email', $email);
        $miembros[$email] = array(
            'email'     => $email,
            'nombre'    => $u ? $u->display_name : '',
            'haEntrado' => false,
            'enLista'   => true,
            // Las cuentas de administración no reciben enlaces por correo: entran con contraseña.
            'esAdmin'   => $u && user_can($u, 'manage_options'),
        ) + $flags($email, $u);
    }
    if ($defecto) {
        foreach (array_merge(get_users(array('role' => PIEB_CAN_ROLE)), get_users(array('role' => PIEB_CAN_ROLE_ADMIN)), get_users(array('role' => PIEB_CAN_ROLE_ESCALETA))) as $u) {
            $email = strtolower($u->user_email);
            // Solo quien ya figura en la lista de esta iglesia o no figura en ninguna.
            if (!isset($miembros[$email]) && pieb_can_roles_por_correo($email, $equipos)) {
                continue;
            }
            $miembros[$email] = array(
                'email'     => $email,
                'nombre'    => $u->display_name,
                'haEntrado' => pieb_can_usuario_ha_entrado($u),
                'enLista'   => isset($miembros[$email]),
                'esAdmin'   => user_can($u, 'manage_options'),
            ) + $flags($email, $u);
        }
    }
    // Bienvenida: cuándo se le envió por última vez (0 = nunca) y si se le puede enviar (las cuentas de administración
    // no entran con enlace, así que no tiene sentido explicárselo).
    $bienvenidas = pieb_can_bienvenidas();
    foreach ($miembros as $email => $miembro) {
        $miembros[$email]['bienvenida'] = isset($bienvenidas[$email]) ? (int) $bienvenidas[$email] : 0;
        $miembros[$email]['puedeBienvenida'] = !$miembro['esAdmin'] && pieb_can_email_con_acceso($email);
    }
    ksort($miembros);
    return array_values($miembros);
}

/**
 * Lo que devuelve GET /ajustes (y, ampliado, el guardado). El equipo (emails, administradores, responsablesEscaleta,
 * dominio, miembros), el correo de bienvenida (bienvenidaAuto, bienvenidaTexto) y la plantilla de la escaleta son los de la
 * iglesia ACTIVA; lo demás es común a toda la instalación. Añade `central` e `iglesia`.
 */
function pieb_can_ajustes_datos() {
    $ajustes = pieb_can_ajustes();
    $iglesia = (int) pieb_can_iglesia_activa();
    $equipo = pieb_can_equipo($iglesia);
    $bienvenida = pieb_can_bienvenida_ajustes($iglesia);
    return array(
        'nombre'         => $ajustes['nombre'],
        'subtitulo'      => $ajustes['subtitulo'],
        'papeleraDias'   => (int) $ajustes['papelera_dias'],
        'version'        => PIEB_CAN_VERSION,
        'administradores' => $equipo['administradores'],
        'responsablesEscaleta' => $equipo['responsablesEscaleta'],
        'temaDefecto'    => $ajustes['tema_defecto'],
        'googleClientId' => $ajustes['google_client_id'],
        'dominio'        => $equipo['dominio'],
        'emails'         => $equipo['emails'],
        'miembros'       => pieb_can_miembros($iglesia),
        // Correo de bienvenida: el de la iglesia activa.
        'bienvenidaAuto'  => (bool) $bienvenida['auto'],
        'bienvenidaTexto' => (string) $bienvenida['texto'],
        'pagina'         => (string) $ajustes['pagina'],
        'avisoBorrado'   => (bool) $ajustes['aviso_borrado'],
        // Correo de administración de la web: también recibe el aviso de borrado (la interfaz lo muestra en la ayuda).
        'correoAdmin'    => (string) get_option('admin_email'),
        'origen'         => untrailingslashit(home_url()),
        // Plantilla de la escaleta del culto de la iglesia activa (la guardada o la genérica; ver includes/escaleta.php).
        'escaleta'       => pieb_can_escaleta_plantilla(),
        'central'        => pieb_can_es_central(),
        'iglesia'        => array('id' => $iglesia, 'nombre' => pieb_can_iglesia_nombre($iglesia)),
    );
}

function pieb_can_rest_ajustes_ver() {
    return rest_ensure_response(pieb_can_ajustes_datos());
}

/**
 * Guarda los ajustes. Lo de la iglesia activa lo guarda quien la gestione: el equipo (emails, administradores,
 * responsablesEscaleta, dominio), el correo de bienvenida (bienvenidaAuto, bienvenidaTexto) y la plantilla de la escaleta
 * (escaleta). Todo lo demás es de la instalación y solo lo cambia el administrador central: si lo envía otra persona, se
 * ignora en silencio.
 */
function pieb_can_rest_ajustes_guardar(WP_REST_Request $request) {
    $iglesia = (int) pieb_can_iglesia_activa();
    $central = pieb_can_es_central();
    $anterior_equipo = pieb_can_equipo($iglesia);
    $ajustes = pieb_can_ajustes();

    // Plantilla de la escaleta de la iglesia activa (solo si llega; null = volver a la genérica). Se valida aquí, antes de
    // guardar nada, y se guarda más abajo (ver includes/escaleta.php).
    $con_escaleta = $request->has_param('escaleta');
    $escaleta = null;
    if ($con_escaleta) {
        $escaleta = pieb_can_escaleta_limpiar_plantilla($request->get_param('escaleta'), pieb_can_escaleta_guardada());
        if (is_wp_error($escaleta)) {
            return $escaleta;
        }
    }
    // Correo de bienvenida de la iglesia activa (solo lo que llega).
    $bienvenida = array();
    if ($request->has_param('bienvenidaAuto')) {
        $bienvenida['auto'] = rest_sanitize_boolean($request->get_param('bienvenidaAuto'));
    }
    if ($request->has_param('bienvenidaTexto')) {
        $bienvenida['texto'] = mb_substr(trim(sanitize_textarea_field((string) $request->get_param('bienvenidaTexto'))), 0, 1000);
    }

    if ($central) {
        if ($request->has_param('nombre')) {
            $nombre = trim(sanitize_text_field((string) $request->get_param('nombre')));
            $ajustes['nombre'] = mb_substr($nombre, 0, 40);
        }
        if ($request->has_param('subtitulo')) {
            $ajustes['subtitulo'] = mb_substr(trim(sanitize_text_field((string) $request->get_param('subtitulo'))), 0, 60);
        }
        if ($request->has_param('papeleraDias')) {
            $ajustes['papelera_dias'] = max(0, min(3650, (int) $request->get_param('papeleraDias')));
        }
        $tema = (string) $request->get_param('temaDefecto');
        if (isset(pieb_can_temas()[$tema])) {
            $ajustes['tema_defecto'] = $tema;
        }
        if ($request->has_param('googleClientId')) {
            $client = trim((string) $request->get_param('googleClientId'));
            if ($client !== '' && !preg_match('/^[0-9a-z-]+\.apps\.googleusercontent\.com$/i', $client)) {
                return new WP_Error('pieb_client', __('El Client ID de Google no tiene el formato esperado (…apps.googleusercontent.com).', 'pieb-cancionero'), array('status' => 400));
            }
            $ajustes['google_client_id'] = $client;
        }
        if ($request->has_param('avisoBorrado')) {
            $ajustes['aviso_borrado'] = rest_sanitize_boolean($request->get_param('avisoBorrado'));
        }
        if ($request->has_param('pagina')) {
            // Solo se guarda si es una dirección válida de esta web; si no, se conserva la que hubiera.
            $pagina = pieb_can_pagina_valida($request->get_param('pagina'));
            if ($pagina !== '') {
                $ajustes['pagina'] = $pagina;
            }
        }
        pieb_can_guardar_ajustes($ajustes);
    }

    // Lo de la iglesia activa (bienvenida y escaleta) lo guarda quien la gestiona, después de lo global (así el guardado
    // de arriba, que escribe la opción entera, no pisa la bienvenida de la iglesia por defecto).
    if ($bienvenida) {
        pieb_can_bienvenida_guardar($bienvenida, $iglesia);
    }
    if ($con_escaleta) {
        pieb_can_escaleta_guardar($escaleta);
    }

    // Equipo de la iglesia activa (pieb_can_equipo_guardar normaliza y añade administradores y responsables a «emails»).
    $cambios = array();
    foreach (array('dominio', 'emails', 'administradores', 'responsablesEscaleta') as $clave) {
        if ($request->has_param($clave)) {
            $valor = $request->get_param($clave);
            $cambios[$clave] = $clave === 'dominio' ? (string) $valor : (array) $valor;
        }
    }
    $equipo = $cambios ? pieb_can_equipo_guardar($iglesia, $cambios) : $anterior_equipo;

    // Aplica ya los cambios de administradores y de responsables de escaleta a las cuentas existentes.
    $afectados = array_unique(array_merge($anterior_equipo['administradores'], $equipo['administradores'], $anterior_equipo['responsablesEscaleta'], $equipo['responsablesEscaleta']));
    foreach ($afectados as $email) {
        $u = get_user_by('email', $email);
        if ($u) {
            pieb_can_sincronizar_administrador($u);
        }
    }

    // Quien sale de la lista pierde el acceso (salvo administradores y editores y quien sigue en otra iglesia).
    foreach (array_diff($anterior_equipo['emails'], $equipo['emails']) as $email) {
        $u = get_user_by('email', $email);
        if ($u && in_array(PIEB_CAN_ROLE, (array) $u->roles, true) && !user_can($u, PIEB_CAN_CAP_GESTIONAR)
            && !array_diff_key(pieb_can_roles_por_correo($email), array($iglesia => true))) {
            $u->remove_role(PIEB_CAN_ROLE);
            if (!$u->roles) {
                $u->add_role('subscriber');
            }
        }
    }
    pieb_can_iglesias_de(0, true);

    // La bienvenida automática NO se envía aquí: el servidor solo calcula a quién le toca (los correos que entran en la
    // lista con este guardado y aún no la han recibido ni han entrado nunca) y la interfaz los envía después llamando a
    // POST /bienvenida por tandas y con barra de progreso, para no alargar este guardado si se pegan decenas de correos.
    $datos = pieb_can_ajustes_datos();
    $datos['bienvenidaPendiente'] = pieb_can_bienvenida_pendientes($anterior_equipo['emails'], $equipo['emails']);
    return rest_ensure_response($datos);
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

// ---------------------------------------------------------------- copias de seguridad (administradores del cancionero)
//
// La copia la monta el navegador: pide aquí los datos (/copia), descarga cada archivo y lo guarda todo en un ZIP.
// Para restaurar, el navegador sube cada archivo por trozos (/subidas) y crea las canciones y los cultos de uno en uno,
// así funciona aunque el servidor tenga límites de subida o de tiempo bajos, y también en otra instalación.
//
// Formato «version: 2» (fase 5c, varias iglesias): además de canciones, cultos y ajustes globales, la copia lleva las
// iglesias publicadas (nombre, equipo, bienvenida y plantilla de la escaleta), los datos de cada canción por iglesia, las
// etiquetas con su iglesia (o universales), los audios con su iglesia y los cultos con su iglesia y privacidad. Restaurar
// no depende de la iglesia en la que esté mirando el administrador central: la iglesia de cada cosa sale de la copia y de
// un «mapa» uid de iglesia → id en esta web, que devuelve POST /copia/iglesias. Una copia antigua (sin iglesias) se
// restaura entera en la iglesia por defecto.

add_action('rest_api_init', function () {
    $admin = function () { return pieb_can_es_central(); };
    $rutas = array(
        '/copia'         => array(WP_REST_Server::READABLE, 'pieb_can_rest_copia_exportar'),
        '/copia/estado'  => array(WP_REST_Server::CREATABLE, 'pieb_can_rest_copia_estado'),
        '/copia/cancion' => array(WP_REST_Server::CREATABLE, 'pieb_can_rest_copia_cancion'),
        '/copia/culto'   => array(WP_REST_Server::CREATABLE, 'pieb_can_rest_copia_culto'),
        '/copia/ajustes' => array(WP_REST_Server::CREATABLE, 'pieb_can_rest_copia_ajustes'),
        '/copia/iglesias' => array(WP_REST_Server::CREATABLE, 'pieb_can_rest_copia_iglesias'),
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

/** uid con el que se exporta una iglesia por su ID; una que ya no existe se exporta como la de por defecto. */
function pieb_can_copia_uid_iglesia($iglesia_id) {
    $iglesia_id = (int) $iglesia_id;
    if (!$iglesia_id || get_post_type($iglesia_id) !== PIEB_CAN_IGLESIA) {
        $iglesia_id = (int) pieb_can_iglesia_defecto();
    }
    return pieb_can_uid($iglesia_id);
}

/** Las iglesias publicadas para la copia: nombre, equipo, bienvenida, plantilla de la escaleta (sin imágenes) y fondos. */
function pieb_can_copia_iglesias_exportar() {
    $salida = array();
    foreach (pieb_can_iglesias() as $i) {
        $equipo = pieb_can_equipo($i['id']);
        $salida[] = array(
            'uid'        => pieb_can_uid($i['id']),
            'nombre'     => $i['nombre'],
            'defecto'    => pieb_can_es_iglesia_defecto($i['id']),
            'equipo'     => $equipo,
            'bienvenida' => pieb_can_dato_iglesia('bienvenida', $i['id']),
            'escaleta'   => pieb_can_escaleta_para_copia($i['id']),
            // Los fondos son imágenes de la biblioteca de medios: sus ids no valen en otra web y la copia no las lleva.
            'fondos'     => null,
        );
    }
    return $salida;
}

function pieb_can_rest_copia_exportar() {
    $canciones = array();
    $uids = array();
    $iglesias_pub = pieb_can_iglesias();
    $yo = get_current_user_id();
    $posts = get_posts(array('post_type' => PIEB_CAN_CPT, 'post_status' => 'publish', 'posts_per_page' => -1, 'orderby' => 'title', 'order' => 'ASC'));
    // Posición de cada partitura dentro de las de su canción (solo las que tienen archivo, como en la copia), para recordar
    // cuál se eligió en cada culto y cuál es la principal de cada iglesia: los ids de los archivos no valen en otra web,
    // la posición sí.
    $posiciones = array();
    foreach ($posts as $post) {
        $partituras = array();
        foreach (pieb_can_get_partituras($post->ID) as $p) {
            $f = pieb_can_copia_archivo((int) $p['id'], array('label' => isset($p['label']) ? (string) $p['label'] : '', 'tonalidad' => isset($p['tonalidad']) ? (string) $p['tonalidad'] : ''));
            if ($f) {
                $posiciones[(int) $p['id']] = count($partituras);
                $partituras[] = $f;
            }
        }
        $audios = array();
        foreach (pieb_can_get_audios($post->ID) as $a) {
            // La copia es solo del administrador central: salen todos los audios, con su iglesia y si son universales.
            $f = pieb_can_copia_archivo((int) $a['id'], array(
                'nombre'      => isset($a['nombre']) ? (string) $a['nombre'] : '',
                'descripcion' => isset($a['descripcion']) ? (string) $a['descripcion'] : '',
                'iglesia'     => pieb_can_copia_uid_iglesia(isset($a['iglesia']) ? $a['iglesia'] : 0),
                'universal'   => !empty($a['universal']),
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
        // Etiquetas: TODAS las de la canción (de cualquier iglesia y universales), cada una con su iglesia (null = universal).
        $etiquetas = array();
        $terminos = wp_get_object_terms($post->ID, PIEB_CAN_TAX);
        foreach (is_array($terminos) ? $terminos : array() as $t) {
            $etiquetas[] = array(
                'nombre'  => html_entity_decode($t->name, ENT_QUOTES, 'UTF-8'),
                'iglesia' => pieb_can_etiqueta_es_universal($t) ? null : pieb_can_copia_uid_iglesia(pieb_can_etiqueta_iglesia($t)),
            );
        }
        // Datos propios de cada iglesia (tonalidad habitual, notas y partitura principal); se omiten las iglesias sin datos.
        $por_iglesia = array();
        foreach ($iglesias_pub as $i) {
            $d = pieb_can_cancion_iglesia($post->ID, $i['id']);
            if (trim($d['tonalidad']) === '' && !$d['principal'] && trim($d['notas']) === '') {
                continue;
            }
            $por_iglesia[pieb_can_uid($i['id'])] = array(
                'tonalidad' => $d['tonalidad'],
                'notas'     => $d['notas'],
                'principal' => $d['principal'] && isset($posiciones[$d['principal']]) ? $posiciones[$d['principal']] : -1,
            );
        }
        $canciones[] = array_merge($cancion, array(
            'letra'      => (string) get_post_meta($post->ID, '_pieb_letra', true),
            'letraHtml'  => (string) get_post_meta($post->ID, '_pieb_letra_html', true),
            // Las notas de primer nivel son las de la iglesia por defecto (_pieb_notas), como siempre (copias antiguas).
            'notas'      => (string) get_post_meta($post->ID, '_pieb_notas', true),
            'iglesias'   => (object) $por_iglesia,
            'etiquetas'  => $etiquetas,
            'youtube'    => array_map(function ($y) {
                return array('url' => (string) $y['url'], 'label' => (string) (isset($y['label']) ? $y['label'] : ''));
            }, pieb_can_get_youtube($post->ID)),
            'creada'     => $post->post_date,
            'subidaPor'  => pieb_can_copia_email($post->post_author),
            'partituras' => $partituras,
            'audios'     => $audios,
            'editables'  => $editables,
        ));
    }

    // Cultos de todas las iglesias publicadas (los de una iglesia archivada no se exportan). Los privados de otras personas
    // no salen: no se vuelcan al fichero del administrador central; los propios sí.
    $publicadas = array_map('intval', wp_list_pluck($iglesias_pub, 'id'));
    $cultos = array();
    $posts = get_posts(array('post_type' => PIEB_CAN_CULTO, 'post_status' => 'publish', 'posts_per_page' => -1, 'meta_key' => '_pieb_fecha', 'orderby' => 'meta_value', 'order' => 'DESC'));
    foreach ($posts as $post) {
        $iglesia_culto = pieb_can_culto_iglesia($post->ID);
        if (!in_array($iglesia_culto, $publicadas, true)) {
            continue;
        }
        if (pieb_can_culto_privado($post->ID) && (int) $post->post_author !== $yo) {
            continue;
        }
        $items = array();
        foreach (pieb_can_culto_items($post->ID) as $item) {
            $id = (int) $item['cancion'];
            if (!isset($uids[$id])) {
                continue;
            }
            $elegida = isset($item['partitura']) ? (int) $item['partitura'] : 0;
            $items[] = array(
                'cancion'   => $uids[$id],
                'titulo'    => html_entity_decode(get_the_title($id), ENT_QUOTES, 'UTF-8'),
                'numero'    => (string) get_post_meta($id, '_pieb_numero', true),
                'tonalidad' => isset($item['tonalidad']) ? (string) $item['tonalidad'] : '',
                'nota'      => isset($item['nota']) ? (string) $item['nota'] : '',
                'partituraPos' => isset($posiciones[$elegida]) ? $posiciones[$elegida] : -1,
            );
        }
        $culto = array(
            'uid'       => pieb_can_uid($post->ID),
            'titulo'    => html_entity_decode(get_the_title($post), ENT_QUOTES, 'UTF-8'),
            'fecha'     => (string) get_post_meta($post->ID, '_pieb_fecha', true),
            'tipo'      => (string) get_post_meta($post->ID, '_pieb_tipo', true),
            'notas'     => (string) get_post_meta($post->ID, '_pieb_notas', true),
            'creadoPor' => pieb_can_copia_email($post->post_author),
            'iglesia'   => pieb_can_uid($iglesia_culto),
            'privado'   => pieb_can_culto_privado($post->ID),
            'items'     => $items,
        );
        // Escaleta del culto (solo si tiene; sus canciones van por uid, como las del setlist).
        $escaleta = pieb_can_escaleta_exportar_culto($post->ID, $uids);
        if ($escaleta !== null) {
            $culto['escaleta'] = $escaleta;
        }
        $cultos[] = $culto;
    }

    $ajustes = pieb_can_ajustes();
    // Solo lo global: el equipo, la bienvenida y la escaleta de cada iglesia van en «iglesias».
    $ajustes_copia = array(
        'temaDefecto'    => $ajustes['tema_defecto'],
        'googleClientId' => $ajustes['google_client_id'],
        'avisoBorrado'   => (bool) $ajustes['aviso_borrado'],
        'papeleraDias'   => (int) $ajustes['papelera_dias'],
    );
    // Nombre y subtítulo solo si la instalación les puso uno propio (lo guardado, no el valor por defecto).
    $guardados = get_option('pieb_can_ajustes', array());
    $guardados = is_array($guardados) ? $guardados : array();
    if (isset($guardados['nombre']) && trim((string) $guardados['nombre']) !== '' && $guardados['nombre'] !== 'Cancionero') {
        $ajustes_copia['nombre'] = (string) $guardados['nombre'];
    }
    if (isset($guardados['subtitulo']) && $guardados['subtitulo'] !== null) {
        $ajustes_copia['subtitulo'] = (string) $guardados['subtitulo'];
    }
    return rest_ensure_response(array(
        'formato'   => 'pieb-cancionero',
        'version'   => 2,
        'plugin'    => PIEB_CAN_VERSION,
        'sitio'     => home_url('/'),
        'fecha'     => current_time('mysql'),
        'iglesias'  => pieb_can_copia_iglesias_exportar(),
        'canciones' => $canciones,
        'cultos'    => $cultos,
        'ajustes'   => $ajustes_copia,
    ));
}

/**
 * Busca en esta web la canción o el culto de la copia: primero por su identificador;
 * si no lo hay (una web que aún no tenía copias), por título y número, o título y fecha.
 */
function pieb_can_copia_buscar($tipo, $datos, $iglesia_id = 0) {
    $cpt = $tipo === 'culto' ? PIEB_CAN_CULTO : PIEB_CAN_CPT;
    // Un culto se busca solo DENTRO de su iglesia (no se pisa el de otra con el mismo uid, título y fecha).
    $en_iglesia = $tipo === 'culto' && $iglesia_id ? array('meta_query' => array(pieb_can_cultos_meta_iglesia($iglesia_id))) : array();
    $uid = isset($datos['uid']) ? (string) $datos['uid'] : '';
    if (preg_match('/^[a-f0-9-]{36}$/', $uid)) {
        $ids = get_posts(array('post_type' => $cpt, 'post_status' => 'publish', 'posts_per_page' => 1, 'fields' => 'ids', 'meta_key' => '_pieb_uid', 'meta_value' => $uid) + $en_iglesia);
        if ($ids) {
            return (int) $ids[0];
        }
    }
    $titulo = isset($datos['titulo']) ? trim((string) $datos['titulo']) : '';
    if ($titulo === '') {
        return 0;
    }
    $ids = get_posts(array('post_type' => $cpt, 'post_status' => 'publish', 'posts_per_page' => -1, 'fields' => 'ids', 'title' => $titulo) + $en_iglesia);
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

/** Mapa de la petición (uid de iglesia de la copia => id en esta web) con solo ids de iglesias publicadas. */
function pieb_can_copia_mapa($p) {
    $mapa = array();
    foreach ((array) (isset($p['mapa']) ? $p['mapa'] : array()) as $uid => $id) {
        if (is_string($uid) && preg_match('/^[a-f0-9-]{36}$/', $uid) && pieb_can_iglesia_nombre((int) $id) !== '') {
            $mapa[$uid] = (int) $id;
        }
    }
    return $mapa;
}

/**
 * Iglesia de esta web donde va algo de la copia: la que dice su uid según el mapa o, si la copia no la trae (copia antigua) o
 * no está en el mapa, la iglesia por defecto. Nunca la iglesia en la que esté mirando quien restaura.
 */
function pieb_can_copia_iglesia_destino($uid, $mapa) {
    return is_string($uid) && isset($mapa[$uid]) ? (int) $mapa[$uid] : (int) pieb_can_iglesia_defecto();
}

/** Qué canciones y cultos de la copia ya existen en esta web (0 = no existe). Los cultos, solo dentro de su iglesia. */
function pieb_can_rest_copia_estado(WP_REST_Request $request) {
    $p = (array) $request->get_json_params();
    $mapa = pieb_can_copia_mapa($p);
    $res = array('canciones' => array(), 'cultos' => array());
    foreach ((array) (isset($p['canciones']) ? $p['canciones'] : array()) as $c) {
        $res['canciones'][] = pieb_can_copia_buscar('cancion', (array) $c);
    }
    foreach ((array) (isset($p['cultos']) ? $p['cultos'] : array()) as $c) {
        $c = (array) $c;
        $res['cultos'][] = pieb_can_copia_buscar('culto', $c, pieb_can_copia_iglesia_destino(isset($c['iglesia']) ? $c['iglesia'] : null, $mapa));
    }
    return rest_ensure_response($res);
}

/** Origen (autor e iglesia) de un elemento restaurado: quien restaura y la iglesia destino, no la activa. */
function pieb_can_copia_origen($iglesia_id) {
    return array('autor' => get_current_user_id(), 'iglesia' => (int) $iglesia_id);
}

/**
 * Restaura las etiquetas de una canción (reemplaza las que tenía). Cada una es un objeto {nombre, iglesia} (iglesia = uid de
 * la copia, o null = universal) o, en copias antiguas, una cadena = etiqueta de la iglesia por defecto. La etiqueta se crea en
 * la iglesia que diga el mapa (o la de por defecto si no está), nunca en la activa.
 */
function pieb_can_copia_etiquetas($post_id, $lista, $mapa) {
    $ids = array();
    foreach ((array) $lista as $e) {
        if (is_array($e)) {
            $nombre = sanitize_text_field(isset($e['nombre']) ? (string) $e['nombre'] : '');
            $universal = array_key_exists('iglesia', $e) && ($e['iglesia'] === null || $e['iglesia'] === '');
            $iglesia = pieb_can_copia_iglesia_destino(isset($e['iglesia']) ? $e['iglesia'] : null, $mapa);
        } else {
            $nombre = sanitize_text_field((string) $e);
            $universal = false;
            $iglesia = (int) pieb_can_iglesia_defecto();
        }
        if ($nombre === '') {
            continue;
        }
        $id = $universal ? pieb_can_etiqueta_universal_obtener($nombre) : pieb_can_etiqueta_obtener($nombre, $iglesia);
        if ($id) {
            $ids[] = (int) $id;
        }
    }
    wp_set_object_terms($post_id, array_values(array_unique($ids)), PIEB_CAN_TAX);
}

function pieb_can_rest_copia_cancion(WP_REST_Request $request) {
    $p = (array) $request->get_json_params();
    $c = isset($p['cancion']) ? (array) $p['cancion'] : array();
    $sobrescribir = isset($p['modo']) && $p['modo'] === 'sobrescribir';
    $con_archivos = !empty($p['conArchivos']);
    $mapa = pieb_can_copia_mapa($p);
    $defecto = (int) pieb_can_iglesia_defecto();
    $titulo = sanitize_text_field(isset($c['titulo']) ? (string) $c['titulo'] : '');
    if ($titulo === '') {
        return new WP_Error('pieb_titulo', __('Hay una canción sin título en la copia.', 'pieb-cancionero'), array('status' => 400));
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
    // Con letraHtml (copias nuevas) la letra plana se deriva de él; las copias antiguas solo traen letra.
    pieb_can_guardar_letra($id, isset($c['letra']) ? (string) $c['letra'] : '', isset($c['letraHtml']) ? (string) $c['letraHtml'] : '');
    update_post_meta($id, '_pieb_notas', sanitize_textarea_field(isset($c['notas']) ? (string) $c['notas'] : ''));
    update_post_meta($id, '_pieb_youtube', pieb_can_limpiar_youtube(isset($c['youtube']) ? $c['youtube'] : array(), pieb_can_get_youtube($id), pieb_can_copia_origen($defecto)));
    pieb_can_copia_etiquetas($id, isset($c['etiquetas']) ? $c['etiquetas'] : array(), $mapa);

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
            $tono = sanitize_text_field(isset($par[1]['tonalidad']) ? (string) $par[1]['tonalidad'] : '');
            // Una tonalidad igual a la habitual de la canción se guarda vacía (sigue a la habitual).
            if (pieb_can_tono_clave($tono) === pieb_can_tono_clave(pieb_can_valor_campo('tonalidad', isset($c['tonalidad']) ? $c['tonalidad'] : ''))) {
                $tono = '';
            }
            $partituras[] = array('id' => (int) $adjunto, 'label' => sanitize_text_field(isset($par[1]['label']) ? (string) $par[1]['label'] : ''), 'tonalidad' => $tono) + pieb_can_copia_origen($defecto);
        }
        $audios = array();
        foreach ($archivos['audio'] as $par) {
            $adjunto = pieb_can_adjuntar($par[0], $id, $titulo, 'audio');
            if (is_wp_error($adjunto)) {
                $adjunto->add_data(array('status' => 400));
                return $adjunto;
            }
            // Cada audio vuelve a su iglesia (la de por defecto si la copia no la trae o no está en el mapa) y, si era
            // universal, sigue siéndolo.
            $audio = pieb_can_limpiar_audio($adjunto, $par[1], pieb_can_copia_origen(pieb_can_copia_iglesia_destino(isset($par[1]['iglesia']) ? $par[1]['iglesia'] : null, $mapa)));
            if (!empty($par[1]['universal'])) {
                $audio['universal'] = 1;
            }
            $audios[] = $audio;
        }
        $editables = array();
        foreach ($archivos['editable'] as $par) {
            $adjunto = pieb_can_adjuntar($par[0], $id, $titulo, 'editable');
            if (is_wp_error($adjunto)) {
                $adjunto->add_data(array('status' => 400));
                return $adjunto;
            }
            $editables[] = pieb_can_limpiar_editable($adjunto, $par[1], pieb_can_copia_origen($defecto));
        }
        update_post_meta($id, '_pieb_partituras', $partituras);
        update_post_meta($id, '_pieb_audios', $audios);
        update_post_meta($id, '_pieb_editables', $editables);
    }

    // Datos de la canción por iglesia (tonalidad habitual, notas y partitura principal). La principal llega como posición
    // entre las partituras exportadas (-1 = ninguna) y se convierte aquí en el id de la partitura restaurada. Las notas de la
    // iglesia por defecto no van en _pieb_ig_{id} sino en _pieb_notas (ya restauradas arriba).
    $por_iglesia = isset($c['iglesias']) && is_array($c['iglesias']) ? $c['iglesias'] : array();
    if ($por_iglesia) {
        $actuales = array_values(pieb_can_get_partituras($id));
        foreach ($por_iglesia as $uid_iglesia => $d) {
            if (!is_string($uid_iglesia) || !isset($mapa[$uid_iglesia]) || !is_array($d)) {
                continue;
            }
            $ig = (int) $mapa[$uid_iglesia];
            $pos = isset($d['principal']) ? (int) $d['principal'] : -1;
            $cambios = array(
                'tonalidad' => sanitize_text_field(isset($d['tonalidad']) ? (string) $d['tonalidad'] : ''),
                'principal' => $pos >= 0 && isset($actuales[$pos]['id']) ? (int) $actuales[$pos]['id'] : 0,
            );
            if ($ig !== $defecto) {
                $cambios['notas'] = sanitize_textarea_field(isset($d['notas']) ? (string) $d['notas'] : '');
            }
            pieb_can_cancion_iglesia_guardar($id, $ig, $cambios);
        }
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
        return new WP_Error('pieb_culto', __('Hay un culto sin título o con una fecha no válida en la copia.', 'pieb-cancionero'), array('status' => 400));
    }

    // Iglesia del culto: la del mapa o, si la copia no la trae (copia antigua), la de por defecto; nunca la activa. Se busca
    // el culto existente solo dentro de esa iglesia.
    $iglesia = pieb_can_copia_iglesia_destino(isset($c['iglesia']) ? $c['iglesia'] : null, pieb_can_copia_mapa($p));
    $id = pieb_can_copia_buscar('culto', $c, $iglesia);
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
        // Partitura elegida para este culto: se recupera por su posición entre las de la canción (0 = la primera).
        $partitura = 0;
        $pos = isset($item['partituraPos']) ? (int) $item['partituraPos'] : -1;
        if ($pos >= 0) {
            $partituras = array_values(pieb_can_get_partituras($cancion));
            if (isset($partituras[$pos]['id'])) {
                $partitura = (int) $partituras[$pos]['id'];
            }
        }
        $items[] = array(
            'cancion'   => $cancion,
            'tonalidad' => sanitize_text_field(isset($item['tonalidad']) ? (string) $item['tonalidad'] : ''),
            'nota'      => sanitize_text_field(isset($item['nota']) ? (string) $item['nota'] : ''),
            'partitura' => $partitura,
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
    update_post_meta($id, '_pieb_iglesia', $iglesia);
    // Privacidad: solo si la copia la trae (las antiguas no); privado = solo su autor, que se resuelve por «creadoPor».
    if (array_key_exists('privado', $c)) {
        pieb_can_culto_fijar_privado($id, !empty($c['privado']));
    }

    $uid = isset($c['uid']) ? (string) $c['uid'] : '';
    update_post_meta($id, '_pieb_uid', preg_match('/^[a-f0-9-]{36}$/', $uid) ? $uid : wp_generate_uuid4());
    update_post_meta($id, '_pieb_fecha', $fecha);
    update_post_meta($id, '_pieb_tipo', sanitize_text_field(isset($c['tipo']) ? (string) $c['tipo'] : ''));
    update_post_meta($id, '_pieb_notas', sanitize_textarea_field(isset($c['notas']) ? (string) $c['notas'] : ''));
    update_post_meta($id, '_pieb_items', $items);
    // La escaleta se restaura solo si la copia la trae (las anteriores no la incluyen). Sus canciones se buscan en esta web
    // como las del setlist; las que no estén se quedan con el nombre escrito a mano.
    if (isset($c['escaleta']) && is_array($c['escaleta'])) {
        $escaleta = pieb_can_escaleta_limpiar_culto(pieb_can_escaleta_importar_culto($c['escaleta']));
        if (is_array($escaleta)) {
            pieb_can_escaleta_guardar_culto($id, $escaleta);
        }
    }

    return rest_ensure_response(array('estado' => $estado, 'id' => (int) $id, 'faltan' => $faltan));
}

/**
 * Restaura lo propio de una iglesia (equipo, bienvenida y plantilla de la escaleta), sea de una copia con iglesias o de una
 * antigua aplicada a la de por defecto. $d lleva solo lo que la copia trae: 'equipo' (emails, administradores,
 * responsablesEscaleta, dominio), 'bienvenida' (auto, texto) y 'escaleta'. El equipo se UNE al actual: restaurar nunca deja a
 * nadie sin acceso. NUNCA envía correos de bienvenida (esta función no calcula «bienvenidaPendiente»).
 */
function pieb_can_copia_restaurar_iglesia($iglesia_id, $d) {
    $iglesia_id = (int) $iglesia_id;
    if (isset($d['equipo']) && is_array($d['equipo'])) {
        $actual = pieb_can_equipo($iglesia_id);
        $copia = $d['equipo'];
        $nuevo = array();
        foreach (array('emails', 'administradores', 'responsablesEscaleta') as $clave) {
            $nuevo[$clave] = array_merge($actual[$clave], pieb_can_equipo_lista(isset($copia[$clave]) ? $copia[$clave] : array()));
        }
        $nuevo['dominio'] = !empty($copia['dominio']) && is_string($copia['dominio']) ? $copia['dominio'] : $actual['dominio'];
        $guardado = pieb_can_equipo_guardar($iglesia_id, $nuevo);
        // Quien pasa a administrar o a preparar la escaleta recibe el rol de WordPress que lo refleja.
        foreach (array_merge($guardado['administradores'], $guardado['responsablesEscaleta']) as $email) {
            $u = get_user_by('email', $email);
            if ($u) {
                pieb_can_sincronizar_administrador($u);
            }
        }
    }
    // La bienvenida se restaura solo si la copia la trae (las copias antiguas no la incluyen).
    if (isset($d['bienvenida']) && is_array($d['bienvenida'])) {
        $b = $d['bienvenida'];
        $bienvenida = pieb_can_dato_iglesia('bienvenida', $iglesia_id);
        if (isset($b['auto'])) {
            $bienvenida['auto'] = rest_sanitize_boolean($b['auto']);
        }
        if (isset($b['texto'])) {
            $bienvenida['texto'] = mb_substr(trim(sanitize_textarea_field((string) $b['texto'])), 0, 1000);
        }
        pieb_can_dato_iglesia_guardar('bienvenida', $iglesia_id, $bienvenida);
    }
    // La plantilla de la escaleta se restaura solo si la copia la trae. La copia no lleva las imágenes (sus ids no valen
    // en otra web): se quitan las que pudieran venir y se conservan el logo y la cabecera que ya tenga esta iglesia.
    if (isset($d['escaleta']) && is_array($d['escaleta'])) {
        $plantilla = $d['escaleta'];
        unset($plantilla['logo'], $plantilla['cabecera']);
        $plantilla = pieb_can_escaleta_limpiar_plantilla($plantilla, pieb_can_escaleta_guardada($iglesia_id));
        if (is_array($plantilla)) {
            pieb_can_escaleta_guardar($plantilla, $iglesia_id);
        }
    }
}

/**
 * Restaura las iglesias de una copia con iglesias (version 2) y devuelve el mapa uid de la copia => id en esta web. Cada una se
 * empareja por uid, si no por nombre (sin distinguir mayúsculas), si no, siendo la de por defecto de la copia, con la de por
 * defecto de esta web; si nada coincide se CREA. Con modo «saltar» las que ya existían no se tocan; con «sobrescribir» se les
 * une el equipo y se restauran su bienvenida y su escaleta. Una iglesia archivada aquí no cuenta para emparejar.
 */
function pieb_can_rest_copia_iglesias(WP_REST_Request $request) {
    @set_time_limit(120);
    $p = (array) $request->get_json_params();
    $sobrescribir = isset($p['modo']) && $p['modo'] === 'sobrescribir';
    $defecto = (int) pieb_can_iglesia_defecto();

    $existentes = pieb_can_iglesias(); // array( array('id', 'nombre'), … )
    $mapa = array();
    $creadas = 0;
    $emparejadas = 0;
    foreach ((array) (isset($p['iglesias']) ? $p['iglesias'] : array()) as $d) {
        $d = (array) $d;
        $uid = isset($d['uid']) ? (string) $d['uid'] : '';
        if (!preg_match('/^[a-f0-9-]{36}$/', $uid)) {
            continue;
        }
        $nombre = mb_substr(trim(sanitize_text_field(isset($d['nombre']) ? (string) $d['nombre'] : '')), 0, 80);
        $es_defecto = !empty($d['defecto']);

        $id = 0;
        foreach ($existentes as $e) {
            if ((string) get_post_meta($e['id'], '_pieb_uid', true) === $uid) {
                $id = (int) $e['id'];
                break;
            }
        }
        if (!$id && $nombre !== '') {
            foreach ($existentes as $e) {
                if (pieb_can_etiqueta_clave($e['nombre']) === pieb_can_etiqueta_clave($nombre)) {
                    $id = (int) $e['id'];
                    break;
                }
            }
        }
        if (!$id && $es_defecto) {
            $id = $defecto;
        }

        if ($id) {
            $emparejadas++;
            // Si la de esta web aún no tenía identificador propio, se queda con el de la copia.
            if (!preg_match('/^[a-f0-9-]{36}$/', (string) get_post_meta($id, '_pieb_uid', true))) {
                update_post_meta($id, '_pieb_uid', $uid);
            }
            $restaurar = $sobrescribir;
        } else {
            if ($nombre === '') {
                continue;
            }
            $id = pieb_can_iglesia_crear($nombre);
            if (is_wp_error($id)) {
                return $id;
            }
            update_post_meta($id, '_pieb_uid', $uid);
            $existentes[] = array('id' => (int) $id, 'nombre' => $nombre);
            $creadas++;
            $restaurar = true;
        }
        $mapa[$uid] = (int) $id;
        if ($restaurar) {
            pieb_can_copia_restaurar_iglesia($id, $d);
        }
    }
    pieb_can_iglesias_reiniciar();

    return rest_ensure_response(array('mapa' => (object) $mapa, 'creadas' => $creadas, 'emparejadas' => $emparejadas));
}

/**
 * Ajustes GLOBALES de la copia (tema, Google, aviso de borrado, papelera, nombre y subtítulo). Lo de cada iglesia (equipo,
 * bienvenida, escaleta) llega por /copia/iglesias en las copias nuevas; una copia antigua, que lo traía aquí dentro (emails,
 * dominio, bienvenidaAuto, bienvenidaTexto, responsablesEscaleta, escaleta), lo aplica a la iglesia POR DEFECTO (no a la
 * activa). El equipo se une al actual: restaurar nunca deja a nadie sin acceso.
 * Restaurar NUNCA envía correos de bienvenida (esta ruta no calcula «bienvenidaPendiente»).
 */
function pieb_can_rest_copia_ajustes(WP_REST_Request $request) {
    $p = (array) $request->get_json_params();
    $a = isset($p['ajustes']) ? (array) $p['ajustes'] : array();
    $ajustes = pieb_can_ajustes();

    $tema = isset($a['temaDefecto']) ? (string) $a['temaDefecto'] : '';
    if (isset(pieb_can_temas()[$tema])) {
        $ajustes['tema_defecto'] = $tema;
    }
    $client = isset($a['googleClientId']) ? trim((string) $a['googleClientId']) : '';
    if ($client !== '' && preg_match('/^[0-9a-z-]+\.apps\.googleusercontent\.com$/i', $client)) {
        $ajustes['google_client_id'] = $client;
    }
    // El aviso de borrado: solo si la copia lo trae.
    if (isset($a['avisoBorrado'])) {
        $ajustes['aviso_borrado'] = rest_sanitize_boolean($a['avisoBorrado']);
    }
    // Nombre, subtítulo y días de papelera: solo si la copia los trae (las anteriores no los incluyen).
    if (!empty($a['nombre'])) {
        $ajustes['nombre'] = sanitize_text_field((string) $a['nombre']);
    }
    if (isset($a['subtitulo'])) {
        $ajustes['subtitulo'] = sanitize_text_field((string) $a['subtitulo']);
    }
    if (isset($a['papeleraDias'])) {
        $ajustes['papelera_dias'] = max(0, min(3650, (int) $a['papeleraDias']));
    }
    pieb_can_guardar_ajustes($ajustes);

    // Copia antigua: lo de la iglesia venía aquí dentro. Se aplica a la iglesia por defecto, explícitamente (después de guardar
    // lo global, porque el equipo de la de por defecto vive en esa misma opción y se lee de nuevo).
    $defecto = (int) pieb_can_iglesia_defecto();
    $antiguo = array();
    if (isset($a['emails']) || isset($a['dominio']) || isset($a['responsablesEscaleta'])) {
        $antiguo['equipo'] = array(
            'emails'               => isset($a['emails']) ? (array) $a['emails'] : array(),
            'responsablesEscaleta' => isset($a['responsablesEscaleta']) ? (array) $a['responsablesEscaleta'] : array(),
            'dominio'              => isset($a['dominio']) ? (string) $a['dominio'] : '',
        );
    }
    if (isset($a['bienvenidaAuto']) || isset($a['bienvenidaTexto'])) {
        $antiguo['bienvenida'] = array();
        if (isset($a['bienvenidaAuto'])) {
            $antiguo['bienvenida']['auto'] = $a['bienvenidaAuto'];
        }
        if (isset($a['bienvenidaTexto'])) {
            $antiguo['bienvenida']['texto'] = $a['bienvenidaTexto'];
        }
    }
    if (isset($a['escaleta']) && is_array($a['escaleta'])) {
        $antiguo['escaleta'] = $a['escaleta'];
    }
    if ($antiguo) {
        pieb_can_copia_restaurar_iglesia($defecto, $antiguo);
    }

    return rest_ensure_response(array('estado' => 'actualizados', 'emails' => count(pieb_can_equipo($defecto)['emails'])));
}
