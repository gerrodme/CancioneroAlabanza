<?php
/**
 * Aviso de canciones borradas: cuando alguien borra una canción desde el cancionero (la manda a la papelera), los
 * administradores reciben un correo con la canción, sus archivos, quién la borró y cuándo.
 *
 * Flujo:
 *  1. pieb_can_rest_borrar() (includes/rest.php) llama a pieb_can_aviso_borrado_encolar() cuando la canción ha quedado en
 *     la papelera. Si el aviso está activo (ajuste «aviso_borrado»), guarda en la cola (opción «pieb_can_avisos_borrado»,
 *     sin autoload) una foto de lo borrado, tomada en ese momento: si luego la canción se elimina para siempre, sus datos
 *     y archivos ya no existirían.
 *  2. Un minuto después, un evento de WordPress-Cron («pieb_can_enviar_avisos_borrado») envía los avisos. El borrado
 *     múltiple de la interfaz hace un DELETE por canción, seguidos: con la espera, todos llegan en UN solo correo.
 *  3. El manejador vacía la cola ANTES de enviar (para no repetir nada si el envío tarda o falla) y manda un correo a cada
 *     destinatario: la lista «administradores» de los ajustes y el correo de administración de la web. A cada uno se le
 *     quitan las canciones que borró él mismo (ya lo sabe) y, si no le queda ninguna, no se le envía.
 *
 * El envío depende del cron de WordPress, que se dispara con las visitas a la web (y con las peticiones a la API de la
 * propia interfaz): si no hay actividad, el correo sale con la siguiente. Con DISABLE_WP_CRON hace falta un cron del
 * sistema que llame a wp-cron.php.
 *
 * El aspecto es el común de includes/correo.php.
 */

if (!defined('ABSPATH')) {
    exit;
}

// Segundos que se espera para agrupar los borrados seguidos en un solo correo, y máximo de canciones que se detallan en un
// correo (más allá, una línea con las restantes: Gmail recorta los correos muy largos y se perdería el botón).
const PIEB_CAN_AVISOS_ESPERA    = 60;
const PIEB_CAN_AVISOS_MAX_LISTA = 40;

add_action('pieb_can_enviar_avisos_borrado', 'pieb_can_enviar_avisos_borrado');

// ---------------------------------------------------------------- cola

/** ¿Está activo el aviso de canciones borradas? (ajuste «aviso_borrado», activo por defecto) */
function pieb_can_aviso_borrado_activo() {
    return !empty(pieb_can_ajustes()['aviso_borrado']);
}

/**
 * Nombres de los archivos de una canción (partituras, audios y editables): el del archivo y, si ya no está en el
 * servidor, el título del adjunto.
 */
function pieb_can_aviso_archivos($post_id) {
    $nombres = array();
    foreach (array_merge(pieb_can_get_partituras($post_id), pieb_can_get_audios($post_id), pieb_can_get_editables($post_id)) as $item) {
        if (empty($item['id'])) {
            continue;
        }
        $ruta = get_attached_file((int) $item['id']);
        $nombre = $ruta ? wp_basename($ruta) : html_entity_decode(get_the_title((int) $item['id']), ENT_QUOTES, 'UTF-8');
        if ($nombre !== '') {
            $nombres[] = $nombre;
        }
    }
    return $nombres;
}

/**
 * Anota en la cola una canción que acaba de ir a la papelera (con quién la borró y cuándo) y programa el envío, un minuto
 * después, si no hay ya uno programado. No hace nada si el aviso está desactivado.
 */
function pieb_can_aviso_borrado_encolar($post_id) {
    if (!pieb_can_aviso_borrado_activo()) {
        return;
    }
    $post = get_post($post_id);
    if (!$post || $post->post_type !== PIEB_CAN_CPT) {
        return;
    }
    $usuario = wp_get_current_user();
    $cola = get_option('pieb_can_avisos_borrado', array());
    if (!is_array($cola)) {
        $cola = array();
    }
    $cola[] = array(
        'id'        => (int) $post->ID,
        'titulo'    => html_entity_decode(get_the_title($post), ENT_QUOTES, 'UTF-8'),
        'numero'    => (string) get_post_meta($post->ID, '_pieb_numero', true),
        'tonalidad' => (string) get_post_meta($post->ID, '_pieb_tonalidad', true),
        'archivos'  => pieb_can_aviso_archivos($post->ID),
        'por'       => array(
            'id'     => (int) $usuario->ID,
            'nombre' => $usuario->display_name !== '' ? (string) $usuario->display_name : (string) $usuario->user_login,
            'email'  => strtolower((string) $usuario->user_email),
        ),
        'cuando'    => time(),
    );
    // La cola no se carga en cada petición (autoload falso).
    update_option('pieb_can_avisos_borrado', $cola, false);

    if (!wp_next_scheduled('pieb_can_enviar_avisos_borrado')) {
        wp_schedule_single_event(time() + PIEB_CAN_AVISOS_ESPERA, 'pieb_can_enviar_avisos_borrado');
    }
}

// ---------------------------------------------------------------- envío

/**
 * Correos que reciben el aviso: los administradores del cancionero (lista «administradores» de los ajustes) y el correo
 * de administración de la web, sin repetir.
 */
function pieb_can_avisos_destinatarios() {
    $correos = array_filter((array) pieb_can_ajustes()['administradores'], 'is_string');
    $correos[] = (string) get_option('admin_email');
    return pieb_can_normalizar_emails(implode(' ', $correos));
}

/** Evento de cron: envía los avisos acumulados en la cola (ver arriba). */
function pieb_can_enviar_avisos_borrado() {
    $cola = get_option('pieb_can_avisos_borrado', array());
    // Se vacía antes de enviar: lo que se mande ya no se repite aunque el envío tarde, falle o se interrumpa.
    delete_option('pieb_can_avisos_borrado');
    // Si el aviso se desactivó mientras tanto, lo pendiente se descarta.
    if (!is_array($cola) || !$cola || !pieb_can_aviso_borrado_activo()) {
        return;
    }
    $cola = array_values($cola);

    // A cada destinatario se le quitan las canciones que borró él mismo.
    $envios = array();
    foreach (pieb_can_avisos_destinatarios() as $email) {
        $cuenta = get_user_by('email', $email);
        $ajenas = array();
        foreach ($cola as $aviso) {
            $por = isset($aviso['por']) && is_array($aviso['por']) ? $aviso['por'] : array();
            $propia = (isset($por['email']) && strtolower((string) $por['email']) === $email)
                || ($cuenta && !empty($por['id']) && (int) $por['id'] === (int) $cuenta->ID);
            if (!$propia) {
                $ajenas[] = $aviso;
            }
        }
        if ($ajenas) {
            $envios[$email] = $ajenas;
        }
    }
    if (!$envios) {
        return;
    }

    // Todos los correos se componen en una sola pasada por el idioma del sitio (recargar las traducciones una vez, no una
    // por destinatario): quien lo recibe no está en esta petición, así que no hay un idioma de usuario que seguir.
    $correos = pieb_can_en_idioma_del_sitio(function () use ($envios) {
        $compuestos = array();
        foreach ($envios as $email => $avisos) {
            $compuestos[$email] = pieb_can_aviso_borrado_componer($avisos);
        }
        return $compuestos;
    });
    foreach ($correos as $email => $correo) {
        pieb_can_correo_enviar($email, $correo);
    }
}

// ---------------------------------------------------------------- el correo

/**
 * Compone el correo para un destinatario: asunto, HTML y texto plano. $avisos es la lista de canciones de la cola (sin las
 * que borró el propio destinatario). Se llama dentro de pieb_can_en_idioma_del_sitio().
 */
function pieb_can_aviso_borrado_componer($avisos) {
    $avisos = array_values($avisos);
    $total = count($avisos);
    $nombre = pieb_can_nombre();
    $dias = pieb_can_papelera_dias();
    $formato_fecha = get_option('date_format') . ' ' . get_option('time_format');
    $papelera = pieb_can_pagina() . '#/ajustes/papelera';

    if ($total === 1) {
        /* translators: %s: título de la canción borrada */
        $asunto = sprintf(__('Se ha borrado «%s» del cancionero', 'pieb-cancionero'), $avisos[0]['titulo']);
    } else {
        /* translators: %d: número de canciones borradas */
        $asunto = sprintf(_n('Se ha borrado %d canción del cancionero', 'Se han borrado %d canciones del cancionero', $total, 'pieb-cancionero'), $total);
    }
    if ($total === 1) {
        $titulo = __('Canción borrada', 'pieb-cancionero');
    } else {
        /* translators: %d: número de canciones borradas */
        $titulo = sprintf(_n('%d canción borrada', '%d canciones borradas', $total, 'pieb-cancionero'), $total);
    }

    /* translators: 1: nombre de quien borró la canción, 2: su correo electrónico, 3: fecha y hora del borrado */
    $borrada = __('Borrada por %1$s (%2$s) el %3$s', 'pieb-cancionero');
    /* translators: %s: lista de nombres de archivo separados por comas */
    $con_archivos = __('Archivos: %s', 'pieb-cancionero');
    $sin_archivos = __('Sin archivos', 'pieb-cancionero');

    // La nota, en frases completas según haya una o varias canciones y según el plazo de la papelera.
    if ($dias > 0 && $total === 1) {
        $nota = sprintf(
            /* translators: %d: días que se conservan las canciones borradas en la papelera */
            _n('Está en la papelera: se puede recuperar durante %d día desde Ajustes y equipo → Papelera.', 'Está en la papelera: se puede recuperar durante %d días desde Ajustes y equipo → Papelera.', $dias, 'pieb-cancionero'),
            $dias
        );
    } elseif ($dias > 0) {
        $nota = sprintf(
            /* translators: %d: días que se conservan las canciones borradas en la papelera */
            _n('Están en la papelera: se pueden recuperar durante %d día desde Ajustes y equipo → Papelera.', 'Están en la papelera: se pueden recuperar durante %d días desde Ajustes y equipo → Papelera.', $dias, 'pieb-cancionero'),
            $dias
        );
    } elseif ($total === 1) {
        $nota = __('Está en la papelera hasta que un administrador la elimine.', 'pieb-cancionero');
    } else {
        $nota = __('Están en la papelera hasta que un administrador las elimine.', 'pieb-cancionero');
    }
    $boton = __('Abrir la papelera', 'pieb-cancionero');
    /* translators: %s: nombre del cancionero */
    $pie = sprintf(__('Recibes este aviso porque administras el cancionero «%s». Se puede desactivar en Ajustes y equipo → General.', 'pieb-cancionero'), $nombre);

    $mostradas = array_slice($avisos, 0, PIEB_CAN_AVISOS_MAX_LISTA);
    $resto = $total - count($mostradas);
    $mas = '';
    if ($resto > 0) {
        /* translators: %d: número de canciones borradas que no se detallan en el correo */
        $mas = sprintf(_n('Y %d canción más.', 'Y %d canciones más.', $resto, 'pieb-cancionero'), $resto);
    }

    $filas = pieb_can_correo_titulo($titulo);
    $texto = $titulo . "\n";

    foreach ($mostradas as $i => $aviso) {
        $cabecera = ($aviso['numero'] !== '' ? $aviso['numero'] . ' · ' : '') . $aviso['titulo'];
        $por = isset($aviso['por']) && is_array($aviso['por']) ? $aviso['por'] : array();
        $quien = isset($por['nombre']) ? (string) $por['nombre'] : '';
        $correo = isset($por['email']) ? (string) $por['email'] : '';
        $cuando = wp_date($formato_fecha, (int) $aviso['cuando']);
        $archivos = is_array($aviso['archivos']) ? $aviso['archivos'] : array();

        $linea_borrada = sprintf(esc_html($borrada), esc_html($quien), pieb_can_correo_email($correo), esc_html($cuando));
        $linea_archivos = $archivos
            ? sprintf(esc_html($con_archivos), implode(', ', array_map('esc_html', $archivos)))
            : esc_html($sin_archivos);

        $contenido = '<strong style="font-size:16px;color:#0b0718;">' . esc_html($cabecera) . '</strong>'
            . ($aviso['tonalidad'] !== '' ? '<span style="color:#6b6585;"> · ' . esc_html($aviso['tonalidad']) . '</span>' : '')
            . '<br>' . $linea_borrada
            . '<br><span style="font-size:14px;color:#6b6585;">' . $linea_archivos . '</span>';
        $filas .= pieb_can_correo_recuadro_html($contenido, $i === 0 ? 0 : 12);

        $texto .= "\n- " . $cabecera . ($aviso['tonalidad'] !== '' ? ' · ' . $aviso['tonalidad'] : '') . "\n"
            . '  ' . sprintf($borrada, $quien, $correo, $cuando) . "\n"
            . '  ' . ($archivos ? sprintf($con_archivos, implode(', ', $archivos)) : $sin_archivos) . "\n";
    }
    if ($mas !== '') {
        $filas .= pieb_can_correo_parrafo(esc_html($mas), 0, 14);
        $texto .= "\n" . $mas . "\n";
    }

    $filas .= pieb_can_correo_nota(esc_html($nota), 22);
    $filas .= pieb_can_correo_boton($papelera, $boton, 22);
    $texto .= "\n" . $nota . "\n\n" . $boton . "\n" . $papelera . "\n\n--\n" . $pie . "\n";

    return array('asunto' => $asunto, 'html' => pieb_can_correo_html($asunto, $filas, $pie), 'texto' => $texto);
}
