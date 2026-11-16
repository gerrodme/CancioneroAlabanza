<?php
/**
 * Iglesias: varias iglesias en una misma instalación (ver docs/plan-multi-iglesia.md).
 *
 * Tipo de contenido «pieb_iglesia»: sin interfaz propia; el nombre de la iglesia es el título. Siempre hay al menos una
 * (la «por defecto», guardada en la opción pieb_can_iglesia_defecto), que se crea sola la primera vez que se necesita.
 *
 * Datos:
 *  _pieb_iglesias         Meta de usuario: array( idIglesia => 'equipo' | 'escaleta' | 'admin' ) (iglesias creadas en la 1.28). La
 *                         pertenencia se calcula con el correo y el equipo de cada iglesia (ver pieb_can_iglesias_de).
 *  _pieb_equipo           Meta de la iglesia (salvo la por defecto, que usa pieb_can_ajustes): su equipo (ver pieb_can_equipo).
 *  _pieb_iglesia_activa   Meta de usuario: la última iglesia elegida.
 *  pieb_can_multi         Opción: versión de la migración a varias iglesias (1 = hecha).
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('init', 'pieb_can_iglesias_registrar_tipo');
// Después del registro de todos los tipos (prioridad 10): sella los cultos existentes con la iglesia por defecto.
add_action('init', 'pieb_can_migrar_iglesias', 20);

function pieb_can_iglesias_registrar_tipo() {
    register_post_type(PIEB_CAN_IGLESIA, array(
        'labels' => array(
            'name'          => 'Iglesias',
            'singular_name' => 'Iglesia',
        ),
        'public'              => false,
        'show_ui'             => false,
        'show_in_menu'        => false,
        'show_in_rest'        => false,
        'exclude_from_search' => true,
        'publicly_queryable'  => false,
        'supports'            => array('title'),
        'map_meta_cap'        => false,
        'capabilities'        => array(
            'edit_post'              => PIEB_CAN_CAP_CENTRAL,
            'read_post'              => PIEB_CAN_CAP_CENTRAL,
            'delete_post'            => PIEB_CAN_CAP_CENTRAL,
            'edit_posts'             => PIEB_CAN_CAP_CENTRAL,
            'edit_others_posts'      => PIEB_CAN_CAP_CENTRAL,
            'publish_posts'          => PIEB_CAN_CAP_CENTRAL,
            'read_private_posts'     => PIEB_CAN_CAP_CENTRAL,
            'delete_posts'           => PIEB_CAN_CAP_CENTRAL,
            'delete_others_posts'    => PIEB_CAN_CAP_CENTRAL,
            'delete_published_posts' => PIEB_CAN_CAP_CENTRAL,
            'edit_published_posts'   => PIEB_CAN_CAP_CENTRAL,
            'create_posts'           => PIEB_CAN_CAP_CENTRAL,
        ),
    ));
}

/**
 * ID de la iglesia por defecto. Si no existe todavía (o ya no está publicada), se crea con el nombre que tenía el
 * cancionero (la línea bajo el nombre o, si está vacía, el nombre del sitio). Solo se puede crear con el tipo ya
 * registrado (a partir de «init»); antes de eso devuelve lo que haya guardado. Nunca crea dos.
 */
function pieb_can_iglesia_defecto() {
    static $id = 0;
    if ($id) {
        return $id;
    }

    $guardado = (int) get_option('pieb_can_iglesia_defecto', 0);
    if ($guardado) {
        $p = get_post($guardado);
        if ($p && $p->post_type === PIEB_CAN_IGLESIA && $p->post_status === 'publish') {
            $id = $guardado;
            return $id;
        }
    }
    if (!post_type_exists(PIEB_CAN_IGLESIA)) {
        return $guardado;
    }

    // Si ya hay alguna iglesia publicada (p. ej. se perdió la opción), se adopta la más antigua en vez de crear otra.
    $existentes = get_posts(array(
        'post_type'      => PIEB_CAN_IGLESIA,
        'post_status'    => 'publish',
        'posts_per_page' => 1,
        'orderby'        => 'ID',
        'order'          => 'ASC',
        'fields'         => 'ids',
    ));
    if ($existentes) {
        $id = (int) $existentes[0];
        update_option('pieb_can_iglesia_defecto', $id);
        return $id;
    }

    $nombre = trim((string) pieb_can_subtitulo());
    if ($nombre === '') {
        $nombre = trim((string) get_bloginfo('name'));
    }
    if ($nombre === '') {
        $nombre = 'Iglesia';
    }
    $nuevo = wp_insert_post(array(
        'post_type'   => PIEB_CAN_IGLESIA,
        'post_status' => 'publish',
        'post_title'  => $nombre,
    ));
    if (!$nuevo || is_wp_error($nuevo)) {
        return 0;
    }
    // La opción apuntaba a una iglesia que ya no existe: se sustituye sin más.
    if ($guardado) {
        update_option('pieb_can_iglesia_defecto', (int) $nuevo);
        $id = (int) $nuevo;
        return $id;
    }
    // add_option no pisa: si otra petición simultánea ya guardó la suya, se queda esa y se descarta la recién creada.
    if (!add_option('pieb_can_iglesia_defecto', (int) $nuevo)) {
        wp_delete_post($nuevo, true);
        $id = (int) get_option('pieb_can_iglesia_defecto', 0);
        return $id;
    }
    $id = (int) $nuevo;
    return $id;
}

/** Todas las iglesias publicadas por orden de título: array( array('id' => int, 'nombre' => string), … ). */
function pieb_can_iglesias() {
    pieb_can_iglesia_defecto(); // garantiza que existe la de por defecto
    $posts = get_posts(array(
        'post_type'      => PIEB_CAN_IGLESIA,
        'post_status'    => 'publish',
        'posts_per_page' => -1,
        'orderby'        => 'title',
        'order'          => 'ASC',
    ));
    $salida = array();
    foreach ($posts as $p) {
        $salida[] = array(
            'id'     => (int) $p->ID,
            'nombre' => html_entity_decode(get_the_title($p), ENT_QUOTES, 'UTF-8'),
        );
    }
    return $salida;
}

/** Nombre de una iglesia ('' si no existe). */
function pieb_can_iglesia_nombre($id) {
    foreach (pieb_can_iglesias() as $i) {
        if ($i['id'] === (int) $id) {
            return $i['nombre'];
        }
    }
    return '';
}

// ---------------------------------------------------------------- equipo de cada iglesia (fase 5a)
//
// Cada iglesia tiene su equipo: tres listas de correos (emails = acceso, administradores, responsablesEscaleta) y un
// dominio. La iglesia POR DEFECTO sigue usando las claves de siempre de la opción pieb_can_ajustes (sin migración); las
// demás, la meta _pieb_equipo de su post. Un administrador o responsable de escaleta está siempre también en «emails».
// Atención a la recursión: pieb_can_equipo() solo lee opciones y metas; nunca debe llamar a nada que dependa de la
// pertenencia (pieb_can_iglesias_de y derivadas).

/** Lista de correos limpia (solo cadenas, sin huecos). */
function pieb_can_equipo_lista($valor) {
    return is_array($valor) ? array_values(array_filter($valor, 'is_string')) : array();
}

/** ¿Es esta la iglesia por defecto? El 0 también cuenta (aún no hay iglesias: se usan las claves de siempre). */
function pieb_can_es_iglesia_defecto($iglesia_id) {
    $iglesia_id = (int) $iglesia_id;
    return !$iglesia_id || $iglesia_id === (int) pieb_can_iglesia_defecto();
}

/** Equipo de una iglesia: array('emails', 'administradores', 'responsablesEscaleta', 'dominio'). */
function pieb_can_equipo($iglesia_id) {
    if (pieb_can_es_iglesia_defecto($iglesia_id)) {
        $datos = get_option('pieb_can_ajustes', array());
    } else {
        $datos = get_post_meta((int) $iglesia_id, '_pieb_equipo', true);
    }
    $datos = is_array($datos) ? $datos : array();
    return array(
        'emails'               => pieb_can_equipo_lista(isset($datos['emails']) ? $datos['emails'] : array()),
        'administradores'      => pieb_can_equipo_lista(isset($datos['administradores']) ? $datos['administradores'] : array()),
        'responsablesEscaleta' => pieb_can_equipo_lista(isset($datos['responsablesEscaleta']) ? $datos['responsablesEscaleta'] : array()),
        'dominio'              => isset($datos['dominio']) && is_string($datos['dominio']) ? $datos['dominio'] : '',
    );
}

/** Orden de los roles de una iglesia (mayor número = más poder). */
function pieb_can_rol_rango($rol) {
    $rangos = array('equipo' => 1, 'escaleta' => 2, 'admin' => 3);
    return isset($rangos[$rol]) ? $rangos[$rol] : 0;
}

/** El mayor de dos roles ('' si ninguno). */
function pieb_can_rol_mayor($a, $b) {
    return pieb_can_rol_rango($b) > pieb_can_rol_rango($a) ? $b : $a;
}

/** Rol de un correo según las listas y el dominio de un equipo ('admin', 'escaleta', 'equipo' o ''). */
function pieb_can_rol_en_equipo($equipo, $email) {
    $email = strtolower(trim((string) $email));
    if ($email === '') {
        return '';
    }
    if (in_array($email, $equipo['administradores'], true)) {
        return 'admin';
    }
    if (in_array($email, $equipo['responsablesEscaleta'], true)) {
        return 'escaleta';
    }
    if (in_array($email, $equipo['emails'], true)) {
        return 'equipo';
    }
    $dominio = (string) $equipo['dominio'];
    if ($dominio !== '' && substr($email, -strlen('@' . $dominio)) === '@' . $dominio) {
        return 'equipo';
    }
    return '';
}

/** Los equipos de todas las iglesias: array( idIglesia => equipo ). */
function pieb_can_equipos_todos() {
    $equipos = array();
    foreach (pieb_can_iglesias() as $i) {
        $equipos[$i['id']] = pieb_can_equipo($i['id']);
    }
    return $equipos;
}

/**
 * Roles de un correo en cada iglesia según sus listas y dominios: array( idIglesia => rol ). Vacío = no está en ninguna.
 * $equipos (opcional): lo que devuelve pieb_can_equipos_todos(), para no recalcularlo dentro de un bucle.
 */
function pieb_can_roles_por_correo($email, $equipos = null) {
    $equipos = $equipos === null ? pieb_can_equipos_todos() : $equipos;
    $salida = array();
    foreach ($equipos as $id => $equipo) {
        $rol = pieb_can_rol_en_equipo($equipo, $email);
        if ($rol !== '') {
            $salida[(int) $id] = $rol;
        }
    }
    return $salida;
}

/** ¿Puede entrar este correo al cancionero? Si está permitido en CUALQUIER iglesia. */
function pieb_can_email_permitido($email) {
    return (bool) pieb_can_roles_por_correo($email);
}

/**
 * Guarda el equipo de una iglesia. $equipo puede llevar solo algunas claves (las demás se conservan). Normaliza los
 * correos y mete a administradores y responsables de escaleta también en «emails». Quien cambia de rol en esa iglesia
 * (o sale) pierde su entrada antigua en la meta de usuario _pieb_iglesias, para que no quede un permiso que ya no toca.
 */
function pieb_can_equipo_guardar($iglesia_id, $equipo) {
    $iglesia_id = (int) $iglesia_id;
    $anterior = pieb_can_equipo($iglesia_id);
    $nuevo = array_merge($anterior, array_intersect_key((array) $equipo, $anterior));

    $unir = function ($lista) {
        return pieb_can_normalizar_emails(implode(' ', array_filter((array) $lista, 'is_string')));
    };
    $nuevo['administradores'] = $unir($nuevo['administradores']);
    $nuevo['responsablesEscaleta'] = $unir($nuevo['responsablesEscaleta']);
    $nuevo['emails'] = array_values(array_unique(array_merge($unir($nuevo['emails']), $nuevo['administradores'], $nuevo['responsablesEscaleta'])));
    $nuevo['dominio'] = strtolower(preg_replace('/[^a-z0-9.-]/i', '', (string) $nuevo['dominio']));

    if (pieb_can_es_iglesia_defecto($iglesia_id)) {
        $guardados = get_option('pieb_can_ajustes', array());
        $guardados = is_array($guardados) ? $guardados : array();
        update_option('pieb_can_ajustes', array_merge($guardados, $nuevo), false);
    } else {
        update_post_meta($iglesia_id, '_pieb_equipo', $nuevo);
    }

    // Meta de usuario obsoleta de quien ha cambiado de rol o ha salido de esta iglesia.
    $todos = array_unique(array_merge($anterior['emails'], $anterior['administradores'], $anterior['responsablesEscaleta'], $nuevo['emails']));
    foreach ($todos as $email) {
        if (pieb_can_rol_en_equipo($anterior, $email) === pieb_can_rol_en_equipo($nuevo, $email)) {
            continue;
        }
        $u = get_user_by('email', $email);
        $meta = $u ? get_user_meta($u->ID, '_pieb_iglesias', true) : null;
        if (is_array($meta) && isset($meta[$iglesia_id])) {
            unset($meta[$iglesia_id]);
            if ($meta) {
                update_user_meta($u->ID, '_pieb_iglesias', $meta);
            } else {
                delete_user_meta($u->ID, '_pieb_iglesias');
            }
        }
    }
    pieb_can_iglesias_de(0, true);
    return $nuevo;
}

/**
 * Rol que dan las capacidades de WordPress ('admin', 'escaleta', 'equipo' o '' si no hay acceso). Con $solo_ajenos solo
 * cuentan los roles que no son del plugin (administrador, editor…) y solo puede dar 'admin' o 'escaleta': así quien
 * administra otra iglesia (cuyo rol de WordPress es solo un reflejo de esa lista) no hereda nada en esta.
 */
function pieb_can_rol_por_capacidades($user, $solo_ajenos = false) {
    if (!$solo_ajenos) {
        if (!user_can($user, PIEB_CAN_CAP_ACCESO)) {
            return '';
        }
        return user_can($user, PIEB_CAN_CAP_GESTIONAR) ? 'admin' : (user_can($user, PIEB_CAN_CAP_ESCALETA) ? 'escaleta' : 'equipo');
    }
    $propios = array(PIEB_CAN_ROLE, PIEB_CAN_ROLE_ADMIN, PIEB_CAN_ROLE_ESCALETA);
    $tiene = function ($cap) use ($user, $propios) {
        if (user_can($user, 'manage_options')) {
            return true;
        }
        foreach ((array) $user->roles as $r) {
            $rol = in_array($r, $propios, true) ? null : get_role($r);
            if ($rol && $rol->has_cap($cap)) {
                return true;
            }
        }
        return false;
    };
    return $tiene(PIEB_CAN_CAP_GESTIONAR) ? 'admin' : ($tiene(PIEB_CAN_CAP_ESCALETA) ? 'escaleta' : '');
}

/**
 * Iglesias a las que pertenece un usuario: array( idIglesia => rol ), solo de iglesias que existen. Sale de:
 *  - el CORREO del usuario en el equipo de cada iglesia (listas y dominio);
 *  - la meta de usuario _pieb_iglesias (iglesias creadas en la 1.28);
 *  - solo para la iglesia por defecto, la compatibilidad con los roles de WordPress: quien tiene acceso al cancionero y no
 *    figura en ninguna otra iglesia pertenece a la de por defecto con el rol que dicen sus capacidades. Si figura en
 *    otra, solo cuentan los roles que no son del plugin (ver pieb_can_rol_por_capacidades).
 * Si figura por dos vías en la misma iglesia, gana el rol mayor. Se recuerda durante la petición; $reiniciar = true
 * vacía lo recordado (al guardar un equipo, crear una iglesia o cambiar roles) y no devuelve nada útil.
 */
function pieb_can_iglesias_de($user_id, $reiniciar = false) {
    static $cache = array();
    if ($reiniciar) {
        $cache = array();
        return array();
    }
    $user_id = (int) $user_id;
    if (!$user_id) {
        return array();
    }
    if (isset($cache[$user_id])) {
        return $cache[$user_id];
    }
    $user = get_userdata($user_id);
    if (!$user) {
        return array();
    }
    $email = strtolower($user->user_email);
    $defecto = (int) pieb_can_iglesia_defecto();

    $salida = array();
    $en_otra = false; // figura (listas o meta) en una iglesia que no es la de por defecto
    foreach (pieb_can_equipos_todos() as $id => $equipo) {
        $rol = pieb_can_rol_en_equipo($equipo, $email);
        if ($rol !== '') {
            $salida[$id] = $rol;
            $en_otra = $en_otra || $id !== $defecto;
        }
    }

    // Meta de la 1.28 (solo iglesias que existen).
    $meta = get_user_meta($user_id, '_pieb_iglesias', true);
    if (is_array($meta)) {
        $existentes = array();
        foreach (pieb_can_iglesias() as $i) {
            $existentes[$i['id']] = true;
        }
        foreach ($meta as $id => $rol) {
            $id = (int) $id;
            if (isset($existentes[$id]) && pieb_can_rol_rango($rol) > 0) {
                $salida[$id] = pieb_can_rol_mayor(isset($salida[$id]) ? $salida[$id] : '', $rol);
                    $en_otra = $en_otra || $id !== $defecto;
            }
        }
    }

    // Compatibilidad con los roles de WordPress, solo en la iglesia por defecto.
    if ($defecto) {
        $rol_wp = pieb_can_rol_por_capacidades($user, $en_otra);
        if ($rol_wp !== '') {
            $salida[$defecto] = pieb_can_rol_mayor(isset($salida[$defecto]) ? $salida[$defecto] : '', $rol_wp);
        }
    }

    $cache[$user_id] = $salida;
    return $salida;
}

/** Rol del usuario en una iglesia ('equipo', 'escaleta', 'admin') o '' si no pertenece a ella. */
function pieb_can_rol_en($user_id, $iglesia_id) {
    $mias = pieb_can_iglesias_de($user_id);
    $iglesia_id = (int) $iglesia_id;
    return isset($mias[$iglesia_id]) ? $mias[$iglesia_id] : '';
}

/**
 * Iglesia en la que trabaja el usuario (0 = el actual): la de la cabecera X-PCAN-Iglesia si pertenece a ella, si no
 * la última elegida, la primera suya o la de por defecto. El administrador central (capacidad pieb_cancionero_central)
 * puede estar en cualquier iglesia existente, aunque no sea miembro.
 */
function pieb_can_iglesia_activa($user_id = 0) {
    $user_id = $user_id ? (int) $user_id : get_current_user_id();
    $mias = pieb_can_iglesias_de($user_id);
    // El administrador central (capacidad real) puede trabajar en cualquier iglesia que exista.
    $validas = $mias;
    if ($user_id && user_can($user_id, PIEB_CAN_CAP_CENTRAL)) {
        foreach (pieb_can_iglesias() as $i) {
            if (!isset($validas[$i['id']])) {
                $validas[$i['id']] = 'admin';
            }
        }
    }

    if ($user_id === get_current_user_id() && isset($_SERVER['HTTP_X_PCAN_IGLESIA'])) {
        $cabecera = (int) $_SERVER['HTTP_X_PCAN_IGLESIA'];
        if ($cabecera && isset($validas[$cabecera])) {
            return $cabecera;
        }
    }
    $guardada = (int) get_user_meta($user_id, '_pieb_iglesia_activa', true);
    if ($guardada && isset($validas[$guardada])) {
        return $guardada;
    }
    if ($mias) {
        $ids = array_keys($mias);
        return (int) $ids[0];
    }
    return (int) pieb_can_iglesia_defecto();
}

/**
 * ¿Es administrador central? Quien tiene la capacidad pieb_cancionero_central o, mientras solo exista una iglesia,
 * quien gestiona el cancionero (así una instalación de una sola iglesia no cambia nada).
 */
function pieb_can_es_central($user_id = 0) {
    $user_id = $user_id ? (int) $user_id : get_current_user_id();
    if (!$user_id) {
        return false;
    }
    if (user_can($user_id, PIEB_CAN_CAP_CENTRAL)) {
        return true;
    }
    return user_can($user_id, PIEB_CAN_CAP_GESTIONAR) && count(pieb_can_iglesias()) === 1;
}

/**
 * ¿Administra esa iglesia el usuario? $iglesia_id = 0: la iglesia activa; $user_id = 0: el usuario actual. Es verdadero
 * para el administrador central (ver pieb_can_es_central) y para quien tiene rol 'admin' en esa iglesia.
 */
function pieb_can_es_admin_iglesia($iglesia_id = 0, $user_id = 0) {
    $user_id = $user_id ? (int) $user_id : get_current_user_id();
    if (!$user_id) {
        return false;
    }
    if (pieb_can_es_central($user_id)) {
        return true;
    }
    $iglesia_id = $iglesia_id ? (int) $iglesia_id : (int) pieb_can_iglesia_activa($user_id);
    return pieb_can_rol_en($user_id, $iglesia_id) === 'admin';
}

/**
 * ¿Puede el usuario (0 = el actual) gestionar la iglesia ACTIVA (equipo, ajustes, borrar…)? El central o quien tiene rol
 * 'admin' en ella. Con una sola iglesia equivale a la capacidad pieb_cancionero_gestionar de siempre.
 */
function pieb_can_puede_gestionar($user_id = 0) {
    return pieb_can_es_admin_iglesia(0, $user_id);
}

/** ¿Puede preparar la escaleta en la iglesia activa? El central, o rol 'admin' o 'escaleta' en ella. */
function pieb_can_puede_escaleta($user_id = 0) {
    $user_id = $user_id ? (int) $user_id : get_current_user_id();
    if (!$user_id) {
        return false;
    }
    if (pieb_can_es_central($user_id)) {
        return true;
    }
    $rol = pieb_can_rol_en($user_id, pieb_can_iglesia_activa($user_id));
    return $rol === 'admin' || $rol === 'escaleta';
}

/**
 * ¿Está activa la protección de lo que añade cada persona a una canción? Solo cuando hay más de una iglesia (ver fase 3
 * del plan). Con una sola, todo el equipo edita cualquier cosa, como siempre. El resultado se recuerda durante la
 * petición; $reiniciar = true lo vuelve a calcular (al crear una iglesia).
 */
function pieb_can_proteccion_activa($reiniciar = false) {
    static $activa = null;
    if ($reiniciar || $activa === null) {
        $activa = count(pieb_can_iglesias()) > 1;
    }
    return $activa;
}

/**
 * Iglesias del usuario como lista para la interfaz: array( array('id', 'nombre', 'rol', 'ajena'), … ). Al administrador
 * central (capacidad pieb_cancionero_central) le salen todas: en las que no es miembro, rol 'admin' y ajena true.
 */
function pieb_can_iglesias_lista_usuario($user_id = 0) {
    $user_id = $user_id ? (int) $user_id : get_current_user_id();
    $mias = pieb_can_iglesias_de($user_id);
    $todas = $user_id && user_can($user_id, PIEB_CAN_CAP_CENTRAL);
    $lista = array();
    foreach (pieb_can_iglesias() as $i) {
        if (isset($mias[$i['id']])) {
            $lista[] = array('id' => $i['id'], 'nombre' => $i['nombre'], 'rol' => $mias[$i['id']], 'ajena' => false);
        } elseif ($todas) {
            $lista[] = array('id' => $i['id'], 'nombre' => $i['nombre'], 'rol' => 'admin', 'ajena' => true);
        }
    }
    return $lista;
}

/**
 * ¿Es este correo del equipo de esa iglesia? Por sus listas y dominio o, si tiene cuenta, por su pertenencia (que incluye
 * la compatibilidad con los roles de WordPress en la iglesia por defecto).
 */
function pieb_can_correo_en_iglesia($email, $iglesia_id) {
    if (pieb_can_rol_en_equipo(pieb_can_equipo($iglesia_id), $email) !== '') {
        return true;
    }
    $u = get_user_by('email', $email);
    return $u && pieb_can_rol_en($u->ID, $iglesia_id) !== '';
}

/** ¿Puede el usuario trabajar en esa iglesia? Si es miembro, o es administrador central y la iglesia existe. */
function pieb_can_puede_entrar_en($user_id, $iglesia_id) {
    $iglesia_id = (int) $iglesia_id;
    if (!$iglesia_id) {
        return false;
    }
    if (pieb_can_rol_en($user_id, $iglesia_id) !== '') {
        return true;
    }
    return user_can((int) $user_id, PIEB_CAN_CAP_CENTRAL) && pieb_can_iglesia_nombre($iglesia_id) !== '';
}

/** Migración a varias iglesias: sella los cultos existentes con la iglesia por defecto. Se puede repetir sin duplicar nada. */
function pieb_can_migrar_iglesias() {
    if ((int) get_option('pieb_can_multi', 0) >= 1) {
        return;
    }
    $defecto = pieb_can_iglesia_defecto();
    if (!$defecto) {
        return;
    }
    $ids = get_posts(array(
        'post_type'      => PIEB_CAN_CULTO,
        'post_status'    => array_values(get_post_stati()), // cualquier estado, también la papelera
        'posts_per_page' => -1,
        'fields'         => 'ids',
        'meta_query'     => array(array('key' => '_pieb_iglesia', 'compare' => 'NOT EXISTS')),
    ));
    foreach ($ids as $id) {
        update_post_meta($id, '_pieb_iglesia', $defecto);
    }
    update_option('pieb_can_multi', 1);
}

/**
 * Escritorio de WordPress con varias iglesias: las pantallas nativas de canciones, cultos, iglesias y etiquetas no conocen
 * las reglas por iglesia (quién puede cambiar o borrar qué), así que solo las usa el administrador central. El resto
 * trabaja desde el propio cancionero. Con una sola iglesia no cambia nada.
 */
add_action('current_screen', function ($pantalla) {
    if (!$pantalla || !pieb_can_proteccion_activa() || current_user_can(PIEB_CAN_CAP_CENTRAL)) {
        return;
    }
    $tipos = array(PIEB_CAN_CPT, PIEB_CAN_CULTO, PIEB_CAN_IGLESIA);
    if (in_array((string) $pantalla->post_type, $tipos, true) || (string) $pantalla->taxonomy === PIEB_CAN_TAX) {
        wp_die(esc_html__('Con varias iglesias, las canciones y los cultos se gestionan desde el propio cancionero.', 'pieb-cancionero'), '', array('response' => 403));
    }
});

// ---------------------------------------------------------------- API

add_action('rest_api_init', function () {
    register_rest_route('pieb/v1', '/iglesias', array(
        array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'pieb_can_rest_iglesias',
            'permission_callback' => 'pieb_can_rest_acceso',
        ),
        array(
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => 'pieb_can_rest_iglesia_crear',
            'permission_callback' => 'pieb_can_rest_acceso',
        ),
    ));
    register_rest_route('pieb/v1', '/iglesias/activa', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_iglesia_activa',
        'permission_callback' => 'pieb_can_rest_acceso',
    ));
    // Renombrar: solo el administrador central (crear es POST /iglesias).
    register_rest_route('pieb/v1', '/iglesias/(?P<id>\d+)', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'pieb_can_rest_iglesia_renombrar',
        'permission_callback' => 'pieb_can_rest_acceso',
    ));
});

function pieb_can_iglesias_estado() {
    return array(
        'activa'    => pieb_can_iglesia_activa(),
        'central'   => pieb_can_es_central(),
        'iglesias'  => pieb_can_iglesias_lista_usuario(),
    );
}

function pieb_can_rest_iglesias() {
    return rest_ensure_response(pieb_can_iglesias_estado());
}

function pieb_can_rest_iglesia_activa(WP_REST_Request $request) {
    $params = $request->get_json_params();
    $params = is_array($params) ? $params : array();
    $iglesia = isset($params['iglesia']) ? (int) $params['iglesia'] : (int) $request->get_param('iglesia');
    if (!pieb_can_puede_entrar_en(get_current_user_id(), $iglesia)) {
        return new WP_Error('pieb_permiso', __('No perteneces a esa iglesia.', 'pieb-cancionero'), array('status' => 403));
    }
    update_user_meta(get_current_user_id(), '_pieb_iglesia_activa', $iglesia);
    // La elegida pasa a ser la activa también dentro de esta petición (por si la cabecera apuntaba a otra).
    unset($_SERVER['HTTP_X_PCAN_IGLESIA']);
    return rest_ensure_response(pieb_can_iglesias_estado());
}

/** Nombre de iglesia saneado y recortado a 80 caracteres ('' si no viene). */
function pieb_can_iglesia_nombre_limpio($params) {
    $nombre = isset($params['nombre']) && is_scalar($params['nombre']) ? trim(sanitize_text_field((string) $params['nombre'])) : '';
    return mb_substr($nombre, 0, 80);
}

/** Crea una iglesia (solo el administrador central) y añade a quien la crea como administrador de ella. */
function pieb_can_rest_iglesia_crear(WP_REST_Request $request) {
    if (!current_user_can(PIEB_CAN_CAP_CENTRAL)) {
        return new WP_Error('pieb_permiso', __('Solo el administrador central puede crear iglesias.', 'pieb-cancionero'), array('status' => 403));
    }
    $params = $request->get_json_params();
    $params = is_array($params) ? $params : array();
    $nombre = pieb_can_iglesia_nombre_limpio($params);
    if ($nombre === '') {
        return new WP_Error('pieb_nombre', __('El nombre de la iglesia es obligatorio.', 'pieb-cancionero'), array('status' => 400));
    }

    $usuario = get_current_user_id();
    $id = wp_insert_post(array(
        'post_type'   => PIEB_CAN_IGLESIA,
        'post_status' => 'publish',
        'post_title'  => $nombre,
    ), true);
    if (is_wp_error($id)) {
        return $id;
    }
    // Quien la crea es su administrador: en la lista de la iglesia y, además, en su meta de usuario (la sola meta, sin
    // lo deducido de las listas, para no convertir en permanente lo que hoy depende de ellas).
    $correo = strtolower((string) wp_get_current_user()->user_email);
    if ($correo !== '') {
        pieb_can_equipo_guardar((int) $id, array('administradores' => array($correo)));
    }
    $pertenencia = get_user_meta($usuario, '_pieb_iglesias', true);
    $pertenencia = is_array($pertenencia) ? $pertenencia : array();
    $pertenencia[(int) $id] = 'admin';
    update_user_meta($usuario, '_pieb_iglesias', $pertenencia);
    pieb_can_iglesias_de(0, true);
    pieb_can_sincronizar_administrador(wp_get_current_user());
    pieb_can_proteccion_activa(true); // con la segunda iglesia empieza la protección de lo ajeno

    $estado = pieb_can_iglesias_estado();
    $estado['creada'] = (int) $id;
    return rest_ensure_response($estado);
}

/** Cambia el nombre de una iglesia (solo el administrador central). */
function pieb_can_rest_iglesia_renombrar(WP_REST_Request $request) {
    if (!current_user_can(PIEB_CAN_CAP_CENTRAL)) {
        return new WP_Error('pieb_permiso', __('Solo el administrador central puede renombrar iglesias.', 'pieb-cancionero'), array('status' => 403));
    }
    $id = (int) $request['id'];
    if (pieb_can_iglesia_nombre($id) === '') {
        return new WP_Error('pieb_no_existe', __('La iglesia no existe.', 'pieb-cancionero'), array('status' => 404));
    }
    $params = $request->get_json_params();
    $params = is_array($params) ? $params : array();
    $nombre = pieb_can_iglesia_nombre_limpio($params);
    if ($nombre === '') {
        return new WP_Error('pieb_nombre', __('El nombre de la iglesia es obligatorio.', 'pieb-cancionero'), array('status' => 400));
    }
    $r = wp_update_post(array('ID' => $id, 'post_title' => $nombre), true);
    if (is_wp_error($r)) {
        return $r;
    }
    return rest_ensure_response(pieb_can_iglesias_estado());
}

// ---------------------------------------------------------------- autor e iglesia de cada elemento de una canción

/**
 * Completa 'autor' e 'iglesia' de los elementos de una lista (partituras, audios, editables, YouTube) que aún no los
 * tienen: la persona que subió la canción y la iglesia por defecto. Solo al leer; no escribe nada.
 */
function pieb_can_con_origen($items, $post_id) {
    $autor = (int) get_post_field('post_author', $post_id);
    $iglesia = (int) pieb_can_iglesia_defecto();
    $salida = array();
    foreach ((array) $items as $it) {
        $it = is_array($it) ? $it : array();
        $it['autor'] = !empty($it['autor']) ? (int) $it['autor'] : $autor;
        $it['iglesia'] = !empty($it['iglesia']) ? (int) $it['iglesia'] : $iglesia;
        $salida[] = $it;
    }
    return $salida;
}

/** Origen de un elemento nuevo: el usuario actual y su iglesia activa. */
function pieb_can_origen_nuevo() {
    return array('autor' => get_current_user_id(), 'iglesia' => pieb_can_iglesia_activa());
}

/** Origen de un elemento que se conserva: el que tenía ('autor' e 'iglesia' ya completados al leer). */
function pieb_can_origen_de($existente) {
    return array('autor' => (int) $existente['autor'], 'iglesia' => (int) $existente['iglesia']);
}
