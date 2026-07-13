# Book Specification

Each book must include:

- `book.md` with YAML metadata
- `chapters/` containing ordered Markdown chapter files
- `diagrams/` for standalone source-first diagrams
- `assets/` for canonical, rights-cleared assets
- `references/` for research and bibliography data
- `releases/` for approved release manifests

Required `book.md` metadata:

- `title`
- `subtitle`
- `version`
- `status`
- `lang`

Generated publishing outputs must be written beneath the root `dist/`
directory, not inside the canonical book directory.
