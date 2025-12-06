module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  settings: {
    'import/resolver': {
      // To use a more complex ESLint import resolver, install npm install -D eslint-import-resolver-typescript 
      // and enable the following configuration (remove node: true):
      //typescript: {
      //  alwaysTryTypes: true,
      //  project: './tsconfig.json',
      //},
      node: true,
    },
  },
  rules: {
    // TypeScript specific
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/consistent-type-imports': [
      'error',
      {
        prefer: 'type-imports',
        fixStyle: 'inline-type-imports',
      },
    ],
    '@typescript-eslint/no-import-type-side-effects': 'error',

    // Import rules
    'import/order': [
      'error',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index',
          'type',
        ],
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc',
          caseInsensitive: true,
        },
      },
    ],
    'import/no-duplicates': 'error',
    'import/no-unresolved': 'off', // TypeScript handles this

    // General
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: ['error', 'always'],
  },
  overrides: [
    {
      // Test files: disable type-aware rules (tests are excluded from tsconfig)
      files: ['tests/**/*.ts'],
      extends: ['plugin:@typescript-eslint/disable-type-checked'],
      parserOptions: {
        project: null,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
      },
    },
    {
      // CommonJS files: fix sourceType and disable type-aware rules
      // (type-aware rules require tsconfig project, which JS files aren't in)
      files: ['*.cjs'],
      extends: ['plugin:@typescript-eslint/disable-type-checked'],
      parserOptions: {
        sourceType: 'commonjs',
        project: null,
      },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
    {
      // ESM JavaScript files: disable type-aware rules (not in tsconfig)
      files: ['*.js'],
      extends: ['plugin:@typescript-eslint/disable-type-checked'],
      parserOptions: {
        project: null,
      },
    },
  ],
  ignorePatterns: ['dist', 'node_modules', 'coverage', '*.config.ts', '*.config.js'],
};

