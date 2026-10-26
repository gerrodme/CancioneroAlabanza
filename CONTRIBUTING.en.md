# Contributing

*Versión en español: [CONTRIBUTING.md](CONTRIBUTING.md)*

Thank you for helping! This is a small project, built for a worship team and maintained with few resources.

## Before you start

- Read the [README](README.en.md), [docs/arquitectura.en.md](docs/arquitectura.en.md) and [CLAUDE.md](CLAUDE.md) (in
  Spanish: conventions and known pitfalls).
- Code comments and the original texts are in **Spanish** (the interface is translated with gettext, see
  "Translations"). Keep to the style of the surrounding code: no JavaScript dependencies, no build step, CSS with `--pc-*`
  variables.

## How to propose a change

1. Open an *issue* describing the problem or the idea (with a screenshot if it is about the interface).
2. Make a *fork*, create a branch and test the change: the interface with the test bench
   (`banco-pruebas/index.html`) and anything that touches PHP on a real WordPress.
3. If the change reaches users, bump the version in `pieb-cancionero/pieb-cancionero.php` (the header and
   `PIEB_CAN_VERSION`) and note it in `CHANGELOG.md`.
4. Open a small *pull request* focused on one thing.

## Translations

The interface is available in Spanish and English and is ready for more languages. If you want to translate it, improve a
translation or add a language, follow the [translation guide](docs/translate.en.md) (no coding needed). If you add new
texts to the code, make them translatable: see "Translations" in [docs/arquitectura.en.md](docs/arquitectura.en.md).

## License of your contributions

By contributing you agree that your code is published under GPL-2.0-or-later and your documentation texts under CC BY-SA
4.0 (see [LICENSE](LICENSE) and [LICENSE-DOCS.txt](LICENSE-DOCS.txt)).

## Data and copyright

Do not upload scores, audio or personal data to the repository.
