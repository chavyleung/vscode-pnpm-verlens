const esbuild = require('esbuild')

const watch = process.argv.includes('--watch')

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started')
    })
    build.onEnd(() => {
      console.log('[watch] build finished')
    })
  },
}

esbuild
  .context({
    entryPoints: ['./src/extension.ts'],
    outfile: './dist/extension.js',
    platform: 'node',
    format: 'cjs',
    mainFields: ['module', 'main'],
    packages: 'bundle',
    external: ['vscode'],
    sourcemap: 'linked',
    bundle: true,
    minifyWhitespace: false,
    minifySyntax: false,
    minifyIdentifiers: false,
    plugins: [esbuildProblemMatcherPlugin],
  })
  .then(async (ctx) => {
    if (watch) {
      await ctx.watch()
    } else {
      await ctx.rebuild()
      await ctx.dispose()
    }
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
