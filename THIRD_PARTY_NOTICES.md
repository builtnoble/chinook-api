# Third-party notices

## Chinook database

The Chinook table and column definitions in `api/src/db/schema.ts` and in the baseline migration under `api/drizzle/`
mirror the schema of the [Chinook database](https://github.com/lerocha/chinook-database) by Luis Rocha, which is
distributed under the following license. This notice is reproduced as that license requires. The sample rows shown in
the documentation's examples come from the same dataset.

```text
Chinook Database
--------------------------------------
Copyright (c) 2008-2024 Luis Rocha

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated 
documentation files (the "Software"), to deal in the Software without restriction, including without limitation 
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and 
to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## The docs site's design

The published docs image (`builtnoble/chinook-docs`) is built with a template that is not part of this repository: the
[Protocol](https://tailwindcss.com/plus/templates/protocol) template from Tailwind Plus, used under the
[Tailwind Plus license](https://tailwindcss.com/plus/license). That template's source is not published here, and this
repository's MIT license does not cover it or the compiled site built from it. The generator, the Dockerfile and the
documents in `docs-site/` and `docs/` are MIT-licensed like the rest of the repository.
