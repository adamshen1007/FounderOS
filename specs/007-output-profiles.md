# Publishing Output Profiles Specification

## Shared Rules

Every output profile must:

- Use the metadata in the canonical `book.md` file.
- Include chapters in filename order.
- Include a generated table of contents.
- Replace Mermaid source blocks with generated diagram images.
- Preserve headings, lists, callouts, links, and sources.
- Write only beneath `dist/`.

## HTML Profile

- Filename: `index.html`
- Format: standalone HTML5
- Assets: embedded where supported
- Styling: `publishing/styles.css`
- Purpose: local preview and future static hosting

## EPUB Profile

- Filename: book-specific `.epub`
- Format: EPUB 3
- Styling: `publishing/epub.css`
- Purpose: ebook readers and release distribution

## DOCX Profile

- Filename: book-specific `.docx`
- Format: Office Open XML
- Purpose: editorial review and document exchange

M1 uses Pandoc's default reference document. A branded reference DOCX may be
introduced later without changing canonical content.

## Verification

- Every artifact exists and exceeds the minimum expected size.
- HTML contains the canonical title and a document body.
- EPUB and DOCX have a ZIP-compatible file signature.
- Output filenames and directories match this specification.
