import { build } from 'esbuild';
import { writeFileSync, watch as fsWatch } from 'fs';
import { join } from 'path';

const watchFlag = process.argv.includes('--watch');
const metafile = process.argv.includes('--metafile');

const buildOptions = {
  entryPoints: ['plugin.js'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'es2020',
  outfile: 'main.js',
  sourcemap: true,
  minify: false,
  metafile,
  // Keep Obsidian's runtime API external so require('obsidian') remains
  // unresolved at bundle time and is provided by the Obsidian host.
  external: ['obsidian'],
};

async function runBuild() {
  try {
    const result = await build(buildOptions);
    if (metafile && result && result.metafile) {
      writeFileSync('meta.json', JSON.stringify(result.metafile, null, 2), 'utf8');
      console.log('Wrote meta.json');
    }
    console.log('Build complete.');
  } catch (err) {
    console.error('Build failed:', err);
  }
}

if (!watchFlag) {
  // Single build and exit
  await runBuild();
  process.exit(0);
} else {
  // Watch mode: use fs.watch with a debounce to re-run build on file changes.
  console.log('Starting build in watch mode...');
  await runBuild();

  let timer = null;
  let isBuilding = false;

  const debounceMs = 250;
  const repoRoot = process.cwd();

  const triggerRebuild = () => {
    if (isBuilding) return; // skip if a build is already running
    isBuilding = true;
    runBuild().finally(() => { isBuilding = false; });
  };

  // Watch the plugin folder recursively. On Windows, fs.watch supports recursive.
  try {
    fsWatch(repoRoot, { recursive: true }, (eventType, filename) => {
      // Ignore node_modules to avoid rebuild storms
      if (!filename) return;
      const f = filename.toString();
      if (f.includes('node_modules')) return;
      // Debounce
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => triggerRebuild(), debounceMs);
    });
    console.log('Watching for changes... (press Ctrl+C to exit)');
  } catch (e) {
    console.error('File watching not supported in this environment:', e);
    console.log('Falling back to single-run build.');
    process.exit(0);
  }
}