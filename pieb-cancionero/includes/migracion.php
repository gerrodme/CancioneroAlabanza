<?php
/**
 * Convierte los PDF del plugin anterior (archivos «adoracion_culto_*» de la biblioteca de medios)
 * en canciones. Es idempotente: marca cada adjunto migrado y no lo vuelve a procesar.
 */

if (!defined('ABSPATH')) {
    exit;
}

function pieb_can_migrar_recursos_antiguos() {
    $adjuntos = get_posts(array(
        'post_type'      => 'attachment',
        'post_status'    => 'inherit',
        'post_mime_type' => 'application/pdf',
        'posts_per_page' => -1,
        'meta_query'     => array(
            array('key' => '_pieb_migrado', 'compare' => 'NOT EXISTS'),
        ),
    ));

    $creadas = 0;

    foreach ($adjuntos as $adjunto) {
        $file = get_attached_file($adjunto->ID);
        $nombre = $file ? wp_basename($file) : '';
        if (!preg_match('/^adoracion[_-]culto[_-](.+)\.pdf$/iu', $nombre, $m)) {
            continue;
        }

        list($titulo, $numero) = pieb_can_titulo_desde_archivo($m[1]);

        $post_id = wp_insert_post(array(
            'post_type'   => PIEB_CAN_CPT,
            'post_status' => 'publish',
            'post_title'  => $titulo,
            'post_author' => get_current_user_id() ? get_current_user_id() : $adjunto->post_author,
        ), true);

        if (is_wp_error($post_id)) {
            continue;
        }

        update_post_meta($post_id, '_pieb_numero', $numero);
        update_post_meta($post_id, '_pieb_partituras', array(array('id' => $adjunto->ID, 'label' => 'Himnario')));
        update_post_meta($post_id, '_pieb_youtube', array());
        update_post_meta($adjunto->ID, '_pieb_migrado', $post_id);
        update_post_meta($adjunto->ID, '_pieb_partitura', 1);

        $creadas++;
    }

    return $creadas;
}

/**
 * «A-Ti-la-gloria-03» → array('A Ti la gloria', '3')
 */
function pieb_can_titulo_desde_archivo($base) {
    $numero = '';
    if (preg_match('/[_-](\d+)$/u', $base, $m)) {
        $numero = ltrim($m[1], '0');
        if ($numero === '') {
            $numero = '0';
        }
        $base = substr($base, 0, -strlen($m[0]));
    }

    $titulo = trim(preg_replace('/[_-]+/u', ' ', $base));
    if (function_exists('mb_strtoupper')) {
        $titulo = mb_strtoupper(mb_substr($titulo, 0, 1)) . mb_substr($titulo, 1);
    }

    return array($titulo, $numero);
}

add_action('admin_init', function () {
    if (!get_option('pieb_can_migrado') && current_user_can(PIEB_CAN_CAP_GESTIONAR)) {
        $n = pieb_can_migrar_recursos_antiguos();
        update_option('pieb_can_migrado', gmdate('c') . ' · ' . $n . ' canciones');
    }
});
