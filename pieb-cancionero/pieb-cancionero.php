<?php
/**
 * Plugin Name: PIEB Cancionero
 * Description: Cancionero del equipo de Adoración y culto: canciones con partitura, letra, audios y YouTube, setlists de cultos, visor para tableta, temas propios y acceso con Google. Shortcode [cancionero].
 * Version: 1.1.2
 * Author: Gerson Rodrigo Menéndez
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Text Domain: pieb-cancionero
 */

if (!defined('ABSPATH')) {
    exit;
}

define('PIEB_CAN_VERSION', '1.1.2');
define('PIEB_CAN_FILE', __FILE__);
define('PIEB_CAN_DIR', plugin_dir_path(__FILE__));
define('PIEB_CAN_URL', plugin_dir_url(__FILE__));

// Tipo de contenido, taxonomía y rol.
const PIEB_CAN_CPT  = 'pieb_cancion';
const PIEB_CAN_CULTO = 'pieb_culto';
const PIEB_CAN_TAX  = 'pieb_etiqueta';
const PIEB_CAN_ROLE = 'equipo_adoracion';

// Capacidades: acceder (ver, subir, editar canciones) y gestionar (borrar cualquiera, administrar).
const PIEB_CAN_CAP_ACCESO     = 'pieb_cancionero_acceso';
const PIEB_CAN_CAP_GESTIONAR  = 'pieb_cancionero_gestionar';

require_once PIEB_CAN_DIR . 'includes/canciones.php';
require_once PIEB_CAN_DIR . 'includes/rest.php';
require_once PIEB_CAN_DIR . 'includes/migracion.php';
require_once PIEB_CAN_DIR . 'includes/cultos.php';
require_once PIEB_CAN_DIR . 'includes/ajustes.php';
require_once PIEB_CAN_DIR . 'includes/google.php';

add_action('init', 'pieb_can_registrar_tipos');

function pieb_can_registrar_tipos() {
    $gestionar = PIEB_CAN_CAP_GESTIONAR;

    register_post_type(PIEB_CAN_CPT, array(
        'labels' => array(
            'name'          => 'Canciones',
            'singular_name' => 'Canción',
            'menu_name'     => 'Cancionero',
            'all_items'     => 'Todas las canciones',
            'edit_item'     => 'Editar canción',
            'search_items'  => 'Buscar canciones',
            'not_found'     => 'No hay canciones',
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
            'name'          => 'Etiquetas de canción',
            'singular_name' => 'Etiqueta',
            'menu_name'     => 'Etiquetas',
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

function pieb_can_instalar_roles() {
    $caps_equipo = array(
        'read'                => true,
        PIEB_CAN_CAP_ACCESO   => true,
    );

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
    return $user && in_array(PIEB_CAN_ROLE, (array) $user->roles, true) && !current_user_can('edit_posts');
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

// La antigua página de recursos de Adoración y culto ya no existe: quien la tenga guardada llega al cancionero.
add_action('template_redirect', function () {
    $ruta = trim((string) wp_parse_url(isset($_SERVER['REQUEST_URI']) ? wp_unslash($_SERVER['REQUEST_URI']) : '', PHP_URL_PATH), '/');
    if ($ruta === 'recursos-de-adoracion-y-culto') {
        wp_safe_redirect(home_url('/adoracion-y-culto/cancionero/'), 302);
        exit;
    }
});

// Menú principal del sitio (tema Vantage): los apartados con submenú («Quiénes somos», «Diaconías»…) se abren y
// cierran con un clic o un toque en vez de ir a su página, que ya es la primera opción del submenú. Sin esto, en
// pantallas táctiles el toque abría el submenú y navegaba a la vez, y el menú se cerraba antes de poder elegir.
add_action('wp_footer', function () {
    ?>
<style>.main-navigation ul li.pieb-abierto > ul { visibility: visible; opacity: 1; }</style>
<script>
(function () {
  var menu = document.querySelector('.main-navigation');
  if (!menu) { return; }
  function cerrar(excepto) {
    Array.prototype.forEach.call(menu.querySelectorAll('li.pieb-abierto'), function (li) {
      if (!excepto || !li.contains(excepto)) { li.classList.remove('pieb-abierto'); }
    });
  }
  menu.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('li.menu-item-has-children > a') : null;
    if (!a || !menu.contains(a)) { return; }
    e.preventDefault();
    var li = a.parentNode, abierto = li.classList.contains('pieb-abierto');
    cerrar(li);
    li.classList.toggle('pieb-abierto', !abierto);
  });
  // Con ratón, al salir del apartado se cierra como siempre.
  menu.addEventListener('pointerout', function (e) {
    if (e.pointerType !== 'mouse') { return; }
    var li = e.target.closest ? e.target.closest('li.pieb-abierto') : null;
    if (li && !li.contains(e.relatedTarget)) { li.classList.remove('pieb-abierto'); }
  });
  document.addEventListener('click', function (e) { if (!menu.contains(e.target)) { cerrar(null); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { cerrar(null); } });
})();
</script>
    <?php
});

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
        return '<div ' . pieb_can_atributos_raiz($tema) . '><div class="pcan-login-card"><h2>Sin acceso al cancionero</h2>'
            . '<p>Tu cuenta no está en la lista del equipo de adoración. Pide a un responsable que añada tu correo.</p>'
            . '<p><a class="pcan-btn" href="' . esc_url(wp_logout_url(get_permalink())) . '">Salir y entrar con otra cuenta</a></p></div></div>';
    }

    wp_enqueue_script('pieb-cancionero', PIEB_CAN_URL . 'assets/cancionero.js', array(), PIEB_CAN_VERSION, true);
    wp_enqueue_script('pieb-cancionero-visor', PIEB_CAN_URL . 'assets/visor.js', array('pieb-cancionero'), PIEB_CAN_VERSION, true);
    wp_enqueue_script('pieb-cancionero-cultos', PIEB_CAN_URL . 'assets/cultos.js', array('pieb-cancionero', 'pieb-cancionero-visor'), PIEB_CAN_VERSION, true);

    $user = wp_get_current_user();
    $config = array(
        'api'        => esc_url_raw(rest_url('pieb/v1/')),
        'nonce'      => wp_create_nonce('wp_rest'),
        'userId'     => (int) $user->ID,
        'userName'   => $user->display_name,
        'gestionar'  => current_user_can(PIEB_CAN_CAP_GESTIONAR),
        'admin'      => current_user_can('manage_options'),
        'logoutUrl'  => wp_logout_url(get_permalink()),
        'homeUrl'    => home_url('/'),
        'sitio'      => get_bloginfo('name'),
        'maxUpload'  => (int) wp_max_upload_size(),
        // Límites por tipo y tamaño de cada trozo (por debajo del límite de PHP del servidor).
        'maxPartitura' => PIEB_CAN_MAX_PARTITURA,
        'maxAudio'     => PIEB_CAN_MAX_AUDIO,
        'trozo'        => (int) min(1536 * 1024, floor(wp_max_upload_size() * 0.75)),
        'tema'       => $tema,
        'temas'      => pieb_can_temas(),
        'version'    => PIEB_CAN_VERSION,
    );
    // wp_add_inline_script conserva los tipos (booleanos, números), a diferencia de wp_localize_script.
    wp_add_inline_script('pieb-cancionero', 'window.PIEB_CANCIONERO = ' . wp_json_encode($config) . ';', 'before');

    return '<div id="pieb-cancionero" ' . pieb_can_atributos_raiz($tema) . '><div class="pcan-cargando">Cargando cancionero…</div></div>';
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
    $html .= '<p class="pcan-kicker">' . esc_html(get_bloginfo('name')) . ' · Adoración y culto</p>';
    $html .= '<h1>Cancionero</h1>';

    // Llegada desde el enlace del correo: se pide un clic para no gastar el enlace con los filtros antispam.
    if ($token) {
        $html .= '<p>Pulsa el botón para entrar.</p>';
        $html .= '<form method="post" action="' . esc_url($volver) . '" class="pcan-enlace-form">';
        $html .= '<input type="hidden" name="pcan_enlace" value="' . esc_attr($token) . '">';
        $html .= '<input type="hidden" name="pcan_volver" value="' . esc_attr($volver) . '">';
        $html .= '<button type="submit" class="pcan-btn pcan-btn-primary pcan-btn-lg">Entrar al cancionero</button>';
        $html .= '</form></div></div>';
        // Se entra sin dejar esta pantalla en el historial: así «atrás» desde el cancionero no vuelve aquí.
        $html .= '<script>(function(){var f=document.querySelector(".pcan-enlace-form");if(!f||!window.fetch){return;}'
            . 'f.addEventListener("submit",function(e){e.preventDefault();f.querySelector("button").disabled=true;'
            . 'fetch(f.action,{method:"POST",body:new FormData(f),credentials:"same-origin"})'
            . '.then(function(r){location.replace(r.url);}).catch(function(){f.submit();});});})();</script>';
        return $html;
    }

    wp_enqueue_script('pieb-cancionero-login', PIEB_CAN_URL . 'assets/login.js', $client_id ? array('google-gsi') : array(), PIEB_CAN_VERSION, true);
    if ($client_id) {
        wp_enqueue_script('google-gsi', 'https://accounts.google.com/gsi/client', array(), null, true);
    }
    wp_add_inline_script('pieb-cancionero-login', 'window.PIEB_LOGIN = ' . wp_json_encode(array(
        'clientId'   => $client_id,
        'apiGoogle'  => esc_url_raw(rest_url('pieb/v1/google')),
        'apiEnlace'  => esc_url_raw(rest_url('pieb/v1/enlace')),
        'volver'     => $volver,
    )) . ';', 'before');

    if ($aviso === 'caducado') {
        $html .= '<p class="pcan-form-error" role="alert">Ese enlace ya se ha usado o ha caducado. Pide uno nuevo.</p>';
    } elseif ($aviso === 'error') {
        $html .= '<p class="pcan-form-error" role="alert">No se ha podido iniciar la sesión. Inténtalo de nuevo o avisa a un responsable.</p>';
    }

    $html .= '<p>Escribe tu correo y te enviaremos un enlace para entrar. Sin contraseñas.</p>';
    $html .= '<form id="pcan-enlace-form" class="pcan-enlace-form" novalidate>';
    $html .= '<label for="pcan-enlace-email" class="screen-reader-text">Tu correo</label>';
    $html .= '<input type="email" id="pcan-enlace-email" class="pcan-input" autocomplete="email" inputmode="email" required placeholder="tu@correo.com">';
    $html .= '<button type="submit" class="pcan-btn pcan-btn-primary pcan-btn-lg">Enviarme el enlace</button>';
    $html .= '</form>';
    $html .= '<p id="pcan-enlace-ok" class="pcan-login-ok" role="status" hidden></p>';
    $html .= '<p id="pcan-login-error" class="pcan-form-error" role="alert" hidden></p>';

    if ($client_id) {
        $html .= '<p class="pcan-login-o"><span>o</span></p><div id="pcan-google-btn" class="pcan-google-btn"></div>';
    }

    $form = wp_login_form(array(
        'echo'           => false,
        'redirect'       => $volver,
        'label_username' => 'Usuario o correo',
        'label_password' => 'Contraseña',
        'label_remember' => 'Recordarme en este dispositivo',
        'label_log_in'   => 'Entrar',
    ));
    $html .= '<details class="pcan-login-alt"><summary>Entrar con usuario y contraseña</summary>' . $form . '</details>';

    $html .= '</div></div>';
    return $html;
}
