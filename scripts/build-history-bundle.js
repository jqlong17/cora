const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
    entryPoints: [path.join(__dirname, 'history-entry.js')],
    bundle: true,
    format: 'esm',
    outfile: path.join(__dirname, '..', 'media', 'prosemirror-history.bundle.js'),
    minify: true,
    target: 'es2020',
}).then(() => {
    console.log('prosemirror-history.bundle.js built successfully');
}).catch((err) => {
    console.error(err);
    process.exit(1);
});
