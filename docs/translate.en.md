# Translating Cancionero into another language

*Versión en español: [traducir.md](traducir.md)*

Cancionero (the Songbook) comes in **Spanish** (the base language) and **English**, and anyone can add another language
without touching the code. Each person picks their language in their account menu (**Language**); by default the
WordPress language is used.

## What is in `pieb-cancionero/languages/`

| File | What it is for |
|---|---|
| `pieb-cancionero.pot` | The **template**: every text in the plugin, in Spanish, untranslated. The starting point for a new language. |
| `pieb-cancionero-<locale>.po` | What the **translator edits** (e.g. `pieb-cancionero-en_US.po`, `pieb-cancionero-pt_BR.po`). Original text and translation, with notes for translators. |
| `pieb-cancionero-<locale>.mo` | The compiled `.po`, read by WordPress for the server-side texts (PHP). Generated, not edited. |
| `pieb-cancionero-<locale>-<hash>.json` | The same texts for JavaScript (one per `.js` file; the `<hash>` is the md5 of its path). Generated, not edited. |

The `<locale>` is the WordPress code: `language_COUNTRY`, such as `en_US`, `pt_BR`, `fr_FR`, `de_DE` or `it_IT`. The
account menu offers Spanish plus every language that has its `.mo` in this folder. If someone uses `en_GB` and there is
no such file, they get the first one of the same language (`en_US`).

## Three ways to translate

### a) Loco Translate (inside WordPress, no coding)

1. Install and activate the free **Loco Translate** plugin.
2. Go to **Loco Translate → Plugins → Cancionero** and click **New language**. The `.pot` template is picked automatically.
3. Choose the language and, as the file location, the plugin's own folder (called *Author* in Loco:
   `wp-content/plugins/pieb-cancionero/languages/`). Cancionero only offers the languages that have their `.mo` in that
   folder: files saved in `wp-content/languages/plugins/` (*System*) or in Loco's own folder are not detected.
4. Translate each text in the editor and click **Save**. Loco creates the `.po` and the `.mo`. JavaScript texts also need
   the `.json` files: recent versions of Loco generate them on save; if they do not show up in the folder, compile the
   `.po` with method c.
5. Open the songbook, open your account menu and choose the new language under **Language**.

**Watch out for updates:** when the plugin is updated ("Replace current with uploaded"), WordPress replaces the plugin
folder, and files that are not in the zip disappear. Before updating, **download the `.po`** from the Loco editor
(**Download .po**) and keep it. If you send it to the project (see "How to send it"), it will be included in future
versions and you will not have to worry. Downloading the `.po` is also how you **share** it.

### b) Poedit, starting from the template

1. Install [Poedit](https://poedit.net), open `pieb-cancionero.pot` and choose **Create new translation** with the
   language you want.
2. Save it with the exact name `pieb-cancionero-<locale>.po` in `pieb-cancionero/languages/`, for example
   `pieb-cancionero-pt_BR.po` or `pieb-cancionero-fr_FR.po`. Any other name will not be recognized.
3. Translate and save: Poedit creates the `.mo` next to it.
4. Generate the JavaScript `.json` files with the repository tool (method c, `compilar`).

### c) From the repository, with `herramientas/i18n.py`

It needs Python and `pip install -r herramientas/requirements.txt` (installs `polib`). From the repository root:

```bash
python herramientas/i18n.py extraer    # updates pieb-cancionero.pot and the .po files with new texts from the code
python herramientas/i18n.py compilar   # for each .po: the .mo, the JavaScript .json files and banco-pruebas/i18n/<locale>.js
python herramientas/i18n.py estado     # percentage translated for each language
```

(`extraer` = extract, `compilar` = compile, `estado` = status.)

To start a new language, create the `.po` with Poedit as in method b (or copy `pieb-cancionero.pot` as
`pieb-cancionero-<locale>.po` and fill in `Language:`, `Language-Team:` and `Plural-Forms:` in the header with the rules
for your language). Then run `compilar`. `python herramientas/empaquetar.py` also runs `compilar` before building the zip.

## How to test it

- **In the test bench** (no WordPress needed): after `compilar`, start `python -m http.server 8765 --bind 127.0.0.1` in
  the repository root and open `http://127.0.0.1:8765/banco-pruebas/index.html?idioma=pt_BR` (change the `locale`). Add
  `&notacion=americana` or `&notacion=latina` to see the notation too. This is the quickest way to spot cut-off texts,
  buttons that do not fit, plurals and dates. Anything that depends on PHP (API errors, emails, role names) can only be
  checked in WordPress.
- **In WordPress:** build the zip with `python herramientas/empaquetar.py`, upload it (Plugins → Add New → Upload Plugin →
  Replace current with uploaded), open the songbook and choose the language in the account menu. A test site is best.

## How to send it

- A **Pull request** with `pieb-cancionero-<locale>.po` and the compiled files (`.mo`, the `.json` files and
  `banco-pruebas/i18n/<locale>.js`). See [CONTRIBUTING.en.md](../CONTRIBUTING.en.md).
- Or **open an Issue** and attach the `.po` (zipped if needed): the maintainer compiles it and includes it in the next
  version.

Please say how much is translated (`estado`) and whether you plan to keep it up to date when new texts appear.

## Tips

- **Placeholders:** keep `%s`, `%d`, `%1$s`, `%2$s`: they are values the program fills in (a name, a number). You can
  change their **order** in the sentence if your language needs it (that is why some are numbered), but do not delete or
  alter them.
- **Plurals:** texts with a singular and a plural have one box per form in your language (Poedit and Loco show them
  according to `Plural-Forms`). Fill in all of them.
- **Notes for translators:** the notes starting with `translators:` explain what each placeholder is or where the text
  appears. Read them, especially when a word can mean two things.
- **Context:** the same word can appear in different contexts (for example "Tono" as a song's key) and be translated
  differently.
- **Buttons and menus:** they appear in tight spaces (phone, tablet). Prefer the shortest form that is still clear, and
  check the result in the test bench.
- **Keys:** you do not need to translate them. What is stored is always `Sol`, `Mib`, `La m`… and the interface shows them
  as Do-Re-Mi or C-D-E depending on the **Notation** each person chooses (by default Do-Re-Mi in Spanish and C-D-E in
  every other language).
- **Setlist PDF:** for now it only supports Latin characters (Latin-1); letters from other scripts (Cyrillic, Greek,
  Arabic, Chinese…) are left out of the PDF. The rest of the interface has no such limit.
- **Team data:** titles, tags and service types that are already saved are not translated; only the interface is.
- **Terminology:** always use the same word for the same concept. For reference, here is the Spanish → English glossary
  (the full [`pieb-cancionero-en_US.po`](../pieb-cancionero/languages/pieb-cancionero-en_US.po) is a good example of how
  each text was handled):

  | Spanish | English |
  |---|---|
  | Cancionero (default name) | Songbook |
  | canción / canciones | song / songs |
  | partitura (principal) | score (main score) |
  | partitura editable | editable score |
  | letra | lyrics |
  | tonalidad / tono | key |
  | número de himnario | hymnal number |
  | etiqueta | tag |
  | culto | service |
  | setlist | setlist |
  | modo culto · Tocar | play mode · Play |
  | equipo de adoración | worship team |
  | administrador del cancionero | songbook administrator |
  | papelera | trash |
  | copia de seguridad | backup |
  | subida múltiple | bulk upload |
  | estadísticas | statistics |
  | ficha (de la canción) | song page |
