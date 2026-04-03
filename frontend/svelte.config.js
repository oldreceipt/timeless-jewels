import adapter from '@sveltejs/adapter-static';
import preprocess from 'svelte-preprocess';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://github.com/sveltejs/svelte-preprocess
  // for more information about preprocessors
  preprocess: preprocess({
    postcss: true
  }),

  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html'
    }),
    paths: {
      base: '/timeless-jewels'
    },
    typescript: {
      config(cfg) {
        // importsNotUsedAsValues and preserveValueImports were removed in TS 5.5.
        // Replace them with verbatimModuleSyntax which is the TS 5.5+ equivalent.
        delete cfg.compilerOptions.importsNotUsedAsValues;
        delete cfg.compilerOptions.preserveValueImports;
        delete cfg.compilerOptions.ignoreDeprecations;
        cfg.compilerOptions.verbatimModuleSyntax = true;
        return cfg;
      }
    }
  }
};

export default config;
