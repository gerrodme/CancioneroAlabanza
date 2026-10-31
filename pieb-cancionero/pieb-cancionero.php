<?php
/**
 * Plugin Name: Cancionero
 * Description: Cancionero para equipos de música y alabanza: canciones con partitura, letra, audios y YouTube, setlists de cultos, visor para tableta, temas propios y acceso con Google. Shortcode [cancionero].
 * Version: 1.15.1
 * Author: Gerson Rodrigo Menéndez
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Text Domain: pieb-cancionero
 * Domain Path: /languages
 */

if (!defined('ABSPATH')) {
    exit;
}

define('PIEB_CAN_VERSION', '1.15.1');
define('PIEB_CAN_FILE', __FILE__);
define('PIEB_CAN_DIR', plugin_dir_path(__FILE__));
define('PIEB_CAN_URL', plugin_dir_url(__FILE__));

// Tipo de contenido, taxonomía y rol.
const PIEB_CAN_CPT  = 'pieb_cancion';
const PIEB_CAN_CULTO = 'pieb_culto';
const PIEB_CAN_TAX  = 'pieb_etiqueta';
const PIEB_CAN_ROLE = 'equipo_adoracion';
const PIEB_CAN_ROLE_ADMIN = 'administrador_cancionero';

// Capacidades: acceder (ver, subir, editar canciones) y gestionar (borrar cualquiera, administrar).
const PIEB_CAN_CAP_ACCESO     = 'pieb_cancionero_acceso';
const PIEB_CAN_CAP_GESTIONAR  = 'pieb_cancionero_gestionar';

// Traducciones del plugin (el idioma de cada usuario se decide en el filtro plugin_locale, ver includes/ajustes.php).
// Prioridad 1 y registrado antes de incluir el resto de archivos: así se carga antes que cualquier otro gancho de «init»
// (p. ej. la entrega de archivos privados) y antes de registrar los tipos de contenido, cuyas etiquetas ya usan el dominio.
add_action('init', function () {
    load_plugin_textdomain('pieb-cancionero', false, dirname(plugin_basename(PIEB_CAN_FILE)) . '/languages');
}, 1);

require_once PIEB_CAN_DIR . 'includes/canciones.php';
require_once PIEB_CAN_DIR . 'includes/archivos.php';
require_once PIEB_CAN_DIR . 'includes/papelera.php';
require_once PIEB_CAN_DIR . 'includes/rest.php';
require_once PIEB_CAN_DIR . 'includes/migracion.php';
require_once PIEB_CAN_DIR . 'includes/cultos.php';
require_once PIEB_CAN_DIR . 'includes/ajustes.php';
require_once PIEB_CAN_DIR . 'includes/correo.php';
require_once PIEB_CAN_DIR . 'includes/google.php';
require_once PIEB_CAN_DIR . 'includes/bienvenida.php';
require_once PIEB_CAN_DIR . 'includes/avisos.php';
require_once PIEB_CAN_DIR . 'includes/accesos.php';
require_once PIEB_CAN_DIR . 'includes/escaleta.php';

add_action('init', 'pieb_can_registrar_tipos');

function pieb_can_registrar_tipos() {
    $gestionar = PIEB_CAN_CAP_GESTIONAR;

    register_post_type(PIEB_CAN_CPT, array(
        'labels' => array(
            'name'          => __('Canciones', 'pieb-cancionero'),
            'singular_name' => __('Canción', 'pieb-cancionero'),
            'menu_name'     => pieb_can_nombre(),
            'all_items'     => __('Todas las canciones', 'pieb-cancionero'),
            'edit_item'     => __('Editar canción', 'pieb-cancionero'),
            'search_items'  => __('Buscar canciones', 'pieb-cancionero'),
            'not_found'     => __('No hay canciones', 'pieb-cancionero'),
        ),
        'public'              => false,
        'show_ui'             => true,
        'show_in_menu'        => true,
        'show_in_rest'        => false,
        'exclude_from_search' => true,
        'publicly_queryable'  => false,
        'menu_icon'           => 'dashicons-format-audio',
        'supports'            => array('title', 'author'),
        'map_meta_cap'        => false,
        'capabilities'        => array(
            'edit_post'              => $gestionar,
            'read_post'              => $gestionar,
            'delete_post'            => $gestionar,
            'edit_posts'             => $gestionar,
            'edit_others_posts'      => $gestionar,
            'publish_posts'          => $gestionar,
            'read_private_posts'     => $gestionar,
            'delete_posts'           => $gestionar,
            'delete_others_posts'    => $gestionar,
            'delete_published_posts' => $gestionar,
            'edit_published_posts'   => $gestionar,
            'create_posts'           => $gestionar,
        ),
    ));

    register_taxonomy(PIEB_CAN_TAX, PIEB_CAN_CPT, array(
        'labels' => array(
            'name'          => __('Etiquetas de canción', 'pieb-cancionero'),
            'singular_name' => __('Etiqueta', 'pieb-cancionero'),
            'menu_name'     => __('Etiquetas', 'pieb-cancionero'),
        ),
        'public'            => false,
        'show_ui'           => true,
        'show_admin_column' => true,
        'show_in_rest'      => false,
        'hierarchical'      => false,
        'capabilities'      => array(
            'manage_terms' => $gestionar,
            'edit_terms'   => $gestionar,
            'delete_terms' => $gestionar,
            'assign_terms' => $gestionar,
        ),
    ));
}

register_activation_hook(__FILE__, 'pieb_can_activar');

function pieb_can_activar() {
    pieb_can_instalar_roles();
    pieb_can_registrar_tipos();
    flush_rewrite_rules();
}

// Se ejecuta también al actualizar el plugin (el hook de activación no salta al reemplazar archivos).
add_action('admin_init', function () {
    if (get_option('pieb_can_version') !== PIEB_CAN_VERSION) {
        pieb_can_instalar_roles();
        update_option('pieb_can_version', PIEB_CAN_VERSION);
    }
});

/**
 * Nombres de los roles del plugin para mostrarlos. Lo que se guarda con add_role() se queda en español (es lo que ya hay
 * en la base de datos); al mostrarlos se traducen con el contexto «User role», el mismo que usa translate_user_role().
 * Se llama siempre en tiempo de ejecución (nunca al incluir el archivo ni antes de «init»).
 */
function pieb_can_nombres_roles() {
    return array(
        PIEB_CAN_ROLE       => _x('Equipo de adoración', 'User role', 'pieb-cancionero'),
        PIEB_CAN_ROLE_ADMIN => _x('Administrador del cancionero', 'User role', 'pieb-cancionero'),
    );
}

function pieb_can_instalar_roles() {
    $caps_equipo = array(
        'read'                => true,
        PIEB_CAN_CAP_ACCESO   => true,
    );

    // Administradores del cancionero: gestionan ajustes, equipo y borrado sin ser administradores de WordPress.
    $caps_admin = $caps_equipo + array(PIEB_CAN_CAP_GESTIONAR => true);
    $rol_admin = get_role(PIEB_CAN_ROLE_ADMIN);
    if (!$rol_admin) {
        add_role(PIEB_CAN_ROLE_ADMIN, 'Administrador del cancionero', $caps_admin);
    } else {
        foreach ($caps_admin as $cap => $grant) {
            $rol_admin->add_cap($cap, $grant);
        }
    }

    $role = get_role(PIEB_CAN_ROLE);
    if (!$role) {
        add_role(PIEB_CAN_ROLE, 'Equipo de adoración', $caps_equipo);
    } else {
        foreach ($caps_equipo as $cap => $grant) {
            $role->add_cap($cap, $grant);
        }
    }

    foreach (array('administrator', 'editor') as $role_name) {
        $r = get_role($role_name);
        if ($r) {
            $r->add_cap(PIEB_CAN_CAP_ACCESO);
            $r->add_cap(PIEB_CAN_CAP_GESTIONAR);
        }
    }
}

// Los miembros del equipo no necesitan el escritorio de WordPress ni la barra de administración.
add_filter('show_admin_bar', function ($show) {
    if (is_user_logged_in() && pieb_can_es_solo_equipo()) {
        return false;
    }
    return $show;
});

function pieb_can_es_solo_equipo() {
    $user = wp_get_current_user();
    return $user && (in_array(PIEB_CAN_ROLE, (array) $user->roles, true) || in_array(PIEB_CAN_ROLE_ADMIN, (array) $user->roles, true)) && !current_user_can('edit_posts');
}

// Shortcode con la aplicación.
add_shortcode('cancionero', 'pieb_can_shortcode');

// La página del cancionero oculta el título del tema: la aplicación ya tiene su propia cabecera.
add_filter('body_class', function ($classes) {
    if (is_singular() && has_shortcode((string) get_post_field('post_content', get_queried_object_id()), 'cancionero')) {
        $classes[] = 'pcan-page-full';
    }
    return $classes;
});

// Con sesión, la página del cancionero es personal (tema, idioma, notación y la clave de la API van dentro): no debe
// guardarse en caché, o tras cambiar una preferencia se seguiría sirviendo la copia anterior. Se avisa a WordPress
// (DONOTCACHEPAGE, que respetan los plugins de caché), al navegador y a la CDN (nocache_headers) y a LiteSpeed.
add_action('template_redirect', function () {
    if (!is_user_logged_in() || !is_singular() || !has_shortcode((string) get_post_field('post_content', get_queried_object_id()), 'cancionero')) {
        return;
    }
    if (!defined('DONOTCACHEPAGE')) {
        define('DONOTCACHEPAGE', true);
    }
    nocache_headers();
    header('X-LiteSpeed-Cache-Control: no-cache');
    do_action('litespeed_control_set_nocache', 'Cancionero: página personal de cada usuario');
}, 0);

function pieb_can_atributos_raiz($tema) {
    $clase = 'pcan is-app';
    // «Colores» y «Pentagrama» son estilos sobre la base de «Como la web» (igual que temaEn en cancionero.js).
    $estilo = in_array($tema, array('colores', 'pentagrama'), true) ? $tema : '';
    return 'class="' . esc_attr($clase) . '" data-pcan-theme="' . esc_attr($estilo ? 'sitio' : $tema) . '"'
        . ($estilo ? ' data-pcan-estilo="' . esc_attr($estilo) . '"' : '');
}

function pieb_can_shortcode() {
    wp_enqueue_style('pieb-cancionero', PIEB_CAN_URL . 'assets/cancionero.css', array(), PIEB_CAN_VERSION);

    if (!is_user_logged_in()) {
        return pieb_can_render_login();
    }

    $tema = pieb_can_tema_usuario();

    if (!current_user_can(PIEB_CAN_CAP_ACCESO)) {
        return '<div ' . pieb_can_atributos_raiz($tema) . '><div class="pcan-login-card"><h2>' . esc_html__('Sin acceso al cancionero', 'pieb-cancionero') . '</h2>'
            . '<p>' . esc_html__('Tu cuenta no está en la lista del equipo de adoración. Pide a un responsable que añada tu correo.', 'pieb-cancionero') . '</p>'
            . '<p><a class="pcan-btn" href="' . esc_url(wp_logout_url(get_permalink())) . '">' . esc_html__('Salir y entrar con otra cuenta', 'pieb-cancionero') . '</a></p></div></div>';
    }

    // Registro de accesos: anota hoy como día de uso (como mucho una escritura al día, ver includes/accesos.php).
    pieb_can_registrar_dia();

    wp_enqueue_script('pieb-cancionero', PIEB_CAN_URL . 'assets/cancionero.js', array('wp-i18n'), PIEB_CAN_VERSION, true);
    wp_enqueue_script('pieb-cancionero-visor', PIEB_CAN_URL . 'assets/visor.js', array('pieb-cancionero', 'wp-i18n'), PIEB_CAN_VERSION, true);
    wp_enqueue_script('pieb-cancionero-cultos', PIEB_CAN_URL . 'assets/cultos.js', array('pieb-cancionero', 'pieb-cancionero-visor', 'wp-i18n'), PIEB_CAN_VERSION, true);
    foreach (array('pieb-cancionero', 'pieb-cancionero-visor', 'pieb-cancionero-cultos') as $script) {
        wp_set_script_translations($script, 'pieb-cancionero', PIEB_CAN_DIR . 'languages');
    }

    $user = wp_get_current_user();
    $config = array(
        'api'        => esc_url_raw(rest_url('pieb/v1/')),
        'nonce'      => wp_create_nonce('wp_rest'),
        'userId'     => (int) $user->ID,
        'userName'   => $user->display_name,
        'userEmail'  => strtolower($user->user_email),
        'gestionar'  => current_user_can(PIEB_CAN_CAP_GESTIONAR),
        'admin'      => current_user_can('manage_options'),
        'logoutUrl'  => wp_logout_url(get_permalink()),
        'homeUrl'    => home_url('/'),
        'sitio'      => pieb_can_subtitulo(),
        'nombre'     => pieb_can_nombre(),
        'maxUpload'  => (int) wp_max_upload_size(),
        // Límites por tipo y tamaño de cada trozo (por debajo del límite de PHP del servidor).
        'maxPartitura' => PIEB_CAN_MAX_PARTITURA,
        'maxAudio'     => PIEB_CAN_MAX_AUDIO,
        'maxEditable'  => PIEB_CAN_MAX_EDITABLE,
        'trozo'        => (int) min(1536 * 1024, floor(wp_max_upload_size() * 0.75)),
        'tema'       => $tema,
        'temas'      => pieb_can_temas(),
        'version'    => PIEB_CAN_VERSION,
        // Idioma del usuario: etiqueta BCP 47 para fechas y números, idiomas disponibles (locale => nombre nativo)
        // y el elegido en su menú ('' = el del sitio); notación de las tonalidades efectiva y elegida.
        'idioma'          => pieb_can_idioma_bcp47(),
        'idiomas'         => pieb_can_idiomas_disponibles(),
        'idiomaElegido'   => pieb_can_idioma_elegido(),
        'notacion'        => pieb_can_notacion(),
        'notacionElegida' => pieb_can_notacion_elegida(),
    );
    // wp_add_inline_script conserva los tipos (booleanos, números), a diferencia de wp_localize_script.
    wp_add_inline_script('pieb-cancionero', 'window.PIEB_CANCIONERO = ' . wp_json_encode($config) . ';', 'before');

    return '<div id="pieb-cancionero" ' . pieb_can_atributos_raiz($tema) . '><div class="pcan-cargando">' . esc_html__('Cargando cancionero…', 'pieb-cancionero') . '</div></div>';
}

function pieb_can_render_login() {
    $ajustes = pieb_can_ajustes();
    $tema = $ajustes['tema_defecto'];
    $client_id = $ajustes['google_client_id'];
    $volver = get_permalink();
    $token = isset($_GET['pcan_enlace']) ? preg_replace('/[^a-f0-9]/', '', (string) wp_unslash($_GET['pcan_enlace'])) : '';
    $aviso = isset($_GET['pcan_aviso']) ? sanitize_key(wp_unslash($_GET['pcan_aviso'])) : '';

    $html  = '<div ' . pieb_can_atributos_raiz($tema) . '><div class="pcan-login-card">';
    $html .= '<span class="pcan-login-logo" aria-hidden="true">♪</span>';
    if (pieb_can_subtitulo() !== '') {
        $html .= '<p class="pcan-kicker">' . esc_html(pieb_can_subtitulo()) . '</p>';
    }
    $html .= '<h1>' . esc_html(pieb_can_nombre()) . '</h1>';

    // Llegada desde el enlace del correo: se pide un clic para no gastar el enlace con los filtros antispam.
    if ($token) {
        $html .= '<p>' . esc_html__('Pulsa el botón para entrar.', 'pieb-cancionero') . '</p>';
        $html .= '<form method="post" action="' . esc_url($volver) . '" class="pcan-enlace-form">';
        $html .= '<input type="hidden" name="pcan_enlace" value="' . esc_attr($token) . '">';
        $html .= '<input type="hidden" name="pcan_volver" value="' . esc_attr($volver) . '">';
        $html .= '<button type="submit" class="pcan-btn pcan-btn-primary pcan-btn-lg">' . esc_html__('Entrar al cancionero', 'pieb-cancionero') . '</button>';
        $html .= '</form></div></div>';
        // Se entra sin dejar esta pantalla en el historial: así «atrás» desde el cancionero no vuelve aquí.
        $html .= '<script>(function(){var f=document.querySelector(".pcan-enlace-form");if(!f||!window.fetch){return;}'
            . 'f.addEventListener("submit",function(e){e.preventDefault();f.querySelector("button").disabled=true;'
            . 'fetch(f.action,{method:"POST",body:new FormData(f),credentials:"same-origin"})'
            . '.then(function(r){location.replace(r.url);}).catch(function(){f.submit();});});})();</script>';
        return $html;
    }

    wp_enqueue_script('pieb-cancionero-login', PIEB_CAN_URL . 'assets/login.js', $client_id ? array('wp-i18n', 'google-gsi') : array('wp-i18n'), PIEB_CAN_VERSION, true);
    wp_set_script_translations('pieb-cancionero-login', 'pieb-cancionero', PIEB_CAN_DIR . 'languages');
    if ($client_id) {
        wp_enqueue_script('google-gsi', 'https://accounts.google.com/gsi/client', array(), null, true);
    }
    wp_add_inline_script('pieb-cancionero-login', 'window.PIEB_LOGIN = ' . wp_json_encode(array(
        'clientId'   => $client_id,
        'apiGoogle'  => esc_url_raw(rest_url('pieb/v1/google')),
        'apiEnlace'  => esc_url_raw(rest_url('pieb/v1/enlace')),
        'volver'     => $volver,
        'idioma'     => pieb_can_idioma_bcp47(), // para el botón de Google
    )) . ';', 'before');

    if ($aviso === 'caducado') {
        $html .= '<p class="pcan-form-error" role="alert">' . esc_html__('Ese enlace ya se ha usado o ha caducado. Pide uno nuevo.', 'pieb-cancionero') . '</p>';
    } elseif ($aviso === 'error') {
        $html .= '<p class="pcan-form-error" role="alert">' . esc_html__('No se ha podido iniciar la sesión. Inténtalo de nuevo o avisa a un responsable.', 'pieb-cancionero') . '</p>';
    }

    $html .= '<p>' . esc_html__('Escribe tu correo y te enviaremos un enlace para entrar. Sin contraseñas.', 'pieb-cancionero') . '</p>';
    $html .= '<form id="pcan-enlace-form" class="pcan-enlace-form" novalidate>';
    $html .= '<label for="pcan-enlace-email" class="screen-reader-text">' . esc_html__('Tu correo', 'pieb-cancionero') . '</label>';
    $html .= '<input type="email" id="pcan-enlace-email" class="pcan-input" autocomplete="email" inputmode="email" required placeholder="' . esc_attr__('tu@correo.com', 'pieb-cancionero') . '">';
    $html .= '<button type="submit" class="pcan-btn pcan-btn-primary pcan-btn-lg">' . esc_html__('Enviarme el enlace', 'pieb-cancionero') . '</button>';
    $html .= '</form>';
    $html .= '<p id="pcan-enlace-ok" class="pcan-login-ok" role="status" hidden></p>';
    $html .= '<p id="pcan-login-error" class="pcan-form-error" role="alert" hidden></p>';

    if ($client_id) {
        $html .= '<p class="pcan-login-o"><span>' . esc_html_x('o', 'separador entre el acceso por correo y el acceso con Google', 'pieb-cancionero') . '</span></p><div id="pcan-google-btn" class="pcan-google-btn"></div>';
    }

    $form = wp_login_form(array(
        'echo'           => false,
        'redirect'       => $volver,
        'label_username' => __('Usuario o correo', 'pieb-cancionero'),
        'label_password' => __('Contraseña', 'pieb-cancionero'),
        'label_remember' => __('Recordarme en este dispositivo', 'pieb-cancionero'),
        'label_log_in'   => __('Entrar', 'pieb-cancionero'),
    ));
    $html .= '<details class="pcan-login-alt"><summary>' . esc_html__('Entrar con usuario y contraseña', 'pieb-cancionero') . '</summary>' . $form . '</details>';

    $html .= '</div></div>';
    return $html;
}
