// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // The API tests run under Node.
    files: ['backend/test/**/*.js'],
    languageOptions: { globals: { Buffer: 'readonly', __dirname: 'readonly' } },
  },
]);
