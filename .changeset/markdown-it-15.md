---
'mdscroll': patch
---

Update markdown-it to 15.

markdown-it 15 bundles its own type declarations, so `@types/markdown-it` is dropped. Its default export is now a callable value rather than a value/type merge, so the instance type is imported separately as a named `MarkdownIt` type.

markdown-it 15 also moves to linkify-it 6, which changes autolinking in the preview:

- Scheme-less URLs (`www.example.com`) are no longer autolinked — fuzzy links are off by default upstream. `https://` URLs and email addresses are unaffected.
- Unicode punctuation now terminates a link, so `詳細はhttps://example.com。続きます` links only the URL instead of swallowing the trailing `。`.

Both behaviors are pinned by tests.
