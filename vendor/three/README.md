# three.js r169 (MIT) – tree-shaken build for world.html

`three.custom.min.js` = only the classes `js/world.js` uses (see `entry.js`), bundled once with esbuild so the landing
does not load the full 690 kB library (this file: ~480 kB, ~124 kB gzipped). No CDN at runtime.

Rebuild (only when js/world.js needs another three.js class – add it to entry.js):

    npm i three@0.169.0 esbuild && npx esbuild entry.js --bundle --format=esm --minify --legal-comments=inline --outfile=three.custom.min.js

License: MIT, © 2010-2024 three.js authors (LICENSE).
