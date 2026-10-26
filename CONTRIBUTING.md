# Contribuir

*English version: [CONTRIBUTING.en.md](CONTRIBUTING.en.md)*

¡Gracias por ayudar! Este es un proyecto pequeño, hecho para un equipo de adoración, y se mantiene con pocos medios.

## Antes de empezar

- Lee el [README](README.md), [docs/arquitectura.md](docs/arquitectura.md) y [CLAUDE.md](CLAUDE.md) (convenciones y
  trampas conocidas).
- Los comentarios del código y los textos originales están en **español** (la interfaz se traduce con gettext, ver
  «Traducciones»). Mantén el estilo del código que te rodea: sin dependencias de
  JavaScript, sin paso de compilación, CSS con variables `--pc-*`.

## Cómo proponer un cambio

1. Abre un *issue* describiendo el problema o la idea (con una captura si es de interfaz).
2. Haz un *fork*, crea una rama y prueba el cambio: la interfaz con el banco de pruebas
   (`banco-pruebas/index.html`) y todo lo que toque PHP en un WordPress real.
3. Si el cambio llega a los usuarios, sube la versión en `pieb-cancionero/pieb-cancionero.php` (cabecera y
   `PIEB_CAN_VERSION`) y anótalo en `CHANGELOG.md`.
4. Abre un *pull request* pequeño y centrado en una sola cosa.

## Traducciones

La interfaz se puede ver en español e inglés y está preparada para más idiomas. Si quieres traducirla, mejorar una
traducción o añadir un idioma, sigue la [guía para traducir](docs/traducir.md) (no hace falta programar). Si añades
textos nuevos en el código, que sean traducibles: ver «Traducciones» en [docs/arquitectura.md](docs/arquitectura.md).

## Licencia de tus aportaciones

Al contribuir aceptas que tu código se publique bajo GPL-2.0-or-later y tus textos de documentación bajo CC BY-SA 4.0
(ver [LICENSE](LICENSE) y [LICENSE-DOCS.txt](LICENSE-DOCS.txt)).

## Datos y derechos de autor

No subas partituras, audios ni datos personales al repositorio.
