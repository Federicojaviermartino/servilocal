module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  env: {
    node: true,
  },
  // Los globales de Vitest en las pruebas. Con TypeScript, no-undef está
  // desactivado y esto no cambia qué se señala; se declara para que quien lea
  // la configuración sepa con qué corren las pruebas.
  overrides: [
    {
      files: ['**/*.spec.ts', 'test/**/*.ts'],
      globals: {
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
      },
    },
  ],
  ignorePatterns: ['.eslintrc.js', 'dist/', 'node_modules/', 'coverage/'],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // Deuda tecnica pendiente de tipar (peticiones de Express y errores
    // capturados). Se mantiene visible como aviso en lugar de silenciarla.
    '@typescript-eslint/no-explicit-any': 'warn',
    // ignoreRestSiblings permite el patron `const { password, ...rest } = user`
    // para omitir campos sensibles sin que la variable cuente como no usada.
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],
  },
};
