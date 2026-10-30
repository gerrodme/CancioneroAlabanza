<?php
/**
 * Aspecto común de los correos del cancionero (bienvenida y enlace de acceso): la cabecera con el logo sobre fondo de
 * neón y una tarjeta blanca. HTML pensado para clientes de correo: tablas, estilos en línea, 600 px como máximo, sin
 * <style> ni fuentes externas.
 *
 * Cada pieza devuelve una fila (<tr>) de la tabla de la tarjeta; pieb_can_correo_html() las envuelve en el documento.
 * Los textos que reciben las piezas ya van escapados (salvo donde se indica), porque a veces llevan un enlace dentro.
 */

if (!defined('ABSPATH')) {
    exit;
}

const PIEB_CAN_CORREO_LETRA = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Dirección de la imagen de cabecera; al enviar se cambia por la imagen incrustada (ver pieb_can_correo_enviar). */
function pieb_can_correo_cabecera() {
    return esc_url(PIEB_CAN_URL . 'assets/correo-cabecera.jpg');
}

/** Título grande de la tarjeta (texto sin escapar). */
function pieb_can_correo_titulo($texto) {
    return '<tr><td style="padding:0 0 14px;"><h1 style="margin:0;font-family:' . PIEB_CAN_CORREO_LETRA . ';font-size:30px;line-height:1.2;font-weight:800;color:#0b0718;">' . esc_html($texto) . '</h1></td></tr>';
}

/** Subtítulo (texto sin escapar). */
function pieb_can_correo_subtitulo($texto) {
    return '<tr><td style="padding:0 0 16px;"><h2 style="margin:0;font-family:' . PIEB_CAN_CORREO_LETRA . ';font-size:20px;line-height:1.3;font-weight:700;color:#0b0718;">' . esc_html($texto) . '</h2></td></tr>';
}

/** Párrafo normal (HTML ya escapado), con el espacio de arriba y de abajo en píxeles. */
function pieb_can_correo_parrafo($html, $abajo = 28, $arriba = 0) {
    return '<tr><td style="padding:' . (int) $arriba . 'px 0 ' . (int) $abajo . 'px;font-family:' . PIEB_CAN_CORREO_LETRA . ';font-size:16px;line-height:1.6;color:#3b3552;">' . $html . '</td></tr>';
}

/** Nota pequeña en gris (HTML ya escapado). */
function pieb_can_correo_nota($html, $arriba = 24) {
    return '<tr><td style="padding:' . (int) $arriba . 'px 0 0;font-family:' . PIEB_CAN_CORREO_LETRA . ';font-size:14px;line-height:1.55;color:#6b6585;">' . $html . '</td></tr>';
}

/** Botón a prueba de clientes de correo: tabla con celda de color y enlace (texto sin escapar). */
function pieb_can_correo_boton($url, $texto, $arriba = 10) {
    return '<tr><td align="center" style="padding:' . (int) $arriba . 'px 0 0;">'
        . '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr>'
        . '<td align="center" bgcolor="#8b5cf6" style="border-radius:12px;background:#8b5cf6;">'
        . '<a href="' . esc_url($url) . '" target="_blank" style="display:inline-block;padding:16px 40px;font-family:' . PIEB_CAN_CORREO_LETRA . ';font-size:18px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:12px;">' . esc_html($texto) . '</a>'
        . '</td></tr></table></td></tr>';
}

/** Una dirección en pequeño, para copiarla. */
function pieb_can_correo_direccion($url, $alinear = 'center', $arriba = 14) {
    return '<tr><td align="' . esc_attr($alinear) . '" style="padding:' . (int) $arriba . 'px 0 0;font-family:' . PIEB_CAN_CORREO_LETRA . ';font-size:12px;line-height:1.5;color:#8a85a0;word-break:break-all;">' . esc_html($url) . '</td></tr>';
}

/** Recuadro destacado con un texto libre (sin escapar; los saltos de línea se respetan). */
function pieb_can_correo_recuadro($texto) {
    return '<tr><td style="padding:28px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
        . '<td style="background:#faf5ff;border-left:4px solid #8b5cf6;padding:14px 18px;font-family:' . PIEB_CAN_CORREO_LETRA . ';font-size:15px;line-height:1.55;color:#3b3552;">' . nl2br(esc_html($texto)) . '</td>'
        . '</tr></table></td></tr>';
}

/** Un correo electrónico en negrita. Va como enlace con su estilo: si no, Gmail lo pinta como enlace azul subrayado. */
function pieb_can_correo_email($email) {
    return '<a href="mailto:' . esc_attr($email) . '" style="color:#0b0718;font-weight:700;text-decoration:none;">' . esc_html($email) . '</a>';
}

/** Documento completo: cabecera con el logo, tarjeta blanca con las filas y el pie (texto sin escapar) debajo. */
function pieb_can_correo_html($asunto, $filas, $pie) {
    $f = PIEB_CAN_CORREO_LETRA;
    $html  = '<!DOCTYPE html>';
    $html .= '<html lang="' . esc_attr(get_bloginfo('language')) . '"><head><meta charset="UTF-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>' . esc_html($asunto) . '</title></head>';
    $html .= '<body style="margin:0;padding:0;background:#f3f0fa;">';
    $html .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f0fa;"><tr><td align="center" style="padding:24px 12px;">';
    $html .= '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">';

    // Cabecera: el logo sobre fondo oscuro, con las esquinas superiores redondeadas.
    $html .= '<tr><td style="border-radius:16px 16px 0 0;line-height:0;font-size:0;">'
        . '<img src="' . pieb_can_correo_cabecera() . '" width="600" height="180" alt="' . esc_attr(pieb_can_nombre()) . '" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:16px 16px 0 0;">'
        . '</td></tr>';

    // Tarjeta blanca.
    $html .= '<tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:32px;font-family:' . $f . ';color:#3b3552;">';
    $html .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' . $filas . '</table>';
    $html .= '</td></tr>';

    // Pie, fuera de la tarjeta.
    $html .= '<tr><td align="center" style="padding:20px 16px 0;font-family:' . $f . ';font-size:12px;line-height:1.5;color:#8a85a0;">' . esc_html($pie) . '</td></tr>';
    $html .= '</table></td></tr></table></body></html>';
    return $html;
}

/**
 * Envía un correo compuesto (array con asunto, html y texto). Solo para este envío, en PHPMailer: el texto plano va
 * como AltBody y la cabecera va incrustada en el propio correo (cid:), porque Gmail y otros no muestran la imagen si
 * no pueden descargarla de la web (sitios de pruebas, protegidos o en local). Si el servicio de correo no pasa por
 * phpmailer_init, queda la dirección de la imagen.
 */
function pieb_can_correo_enviar($email, $correo) {
    $preparar = function ($phpmailer) use ($correo) {
        $phpmailer->AltBody = $correo['texto'];
        $archivo = PIEB_CAN_DIR . 'assets/correo-cabecera.jpg';
        $url = pieb_can_correo_cabecera();
        if (is_readable($archivo) && strpos($phpmailer->Body, $url) !== false
            && $phpmailer->addEmbeddedImage($archivo, 'pcan-cabecera', 'cancionero.jpg', 'base64', 'image/jpeg')) {
            $phpmailer->Body = str_replace($url, 'cid:pcan-cabecera', $phpmailer->Body);
        }
    };
    add_action('phpmailer_init', $preparar);
    try {
        return (bool) wp_mail($email, $correo['asunto'], $correo['html'], array('Content-Type: text/html; charset=UTF-8'));
    } finally {
        remove_action('phpmailer_init', $preparar);
    }
}
