// Spike: run existing karma-jasmine specs under Vitest, unmodified.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

/** Webpack imports .html templates as raw strings (html-loader); mirror that. */
const rawHtml = {
  name: 'raw-html',
  enforce: 'pre',
  load(id) {
    if (id.endsWith('.html')) {
      return `export default ${JSON.stringify(fs.readFileSync(id, 'utf8'))};`;
    }
  }
};

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  define: {
    __OPENMCT_VERSION__: JSON.stringify('spike'),
    __OPENMCT_BUILD_DATE__: JSON.stringify('spike'),
    __OPENMCT_REVISION__: JSON.stringify('spike'),
    __OPENMCT_BUILD_BRANCH__: JSON.stringify('spike')
  },
  plugins: [rawHtml, vue()],
  resolve: {
    alias: {
      '@': path.join(root, 'src'),
      csv: 'comma-separated-values',
      'plotly-basic': 'plotly.js-basic-dist-min',
      'plotly-gl2d': 'plotly.js-gl2d-dist-min',
      printj: 'printj/printj.mjs',
      styles: path.join(root, 'src/styles'),
      MCT: path.join(root, 'src/MCT'),
      testUtils: path.join(root, 'src/utils/testUtils.js'),
      objectUtils: path.join(root, 'src/api/objects/object-utils.js'),
      utils: path.join(root, 'src/utils')
    }
  },
  test: {
    globals: true,
    css: false,
    environment: 'jsdom',
    setupFiles: ['./vitest.jasmine-compat.mjs'],
    include: ['src/**/*Spec.js']
  }
});
