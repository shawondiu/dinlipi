// Prepares www/ for Capacitor: bundles src/native.js and copies Chart.js for offline use.
// Run with `npm run build` (the GitHub workflow does this automatically).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

await build({
  entryPoints: ['src/native.js'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  outfile: 'www/js/native.bundle.js',
});

mkdirSync('www/vendor', { recursive: true });
copyFileSync('node_modules/chart.js/dist/chart.umd.js', 'www/vendor/chart.umd.js');

console.log('Web build ready: www/js/native.bundle.js, www/vendor/chart.umd.js');
