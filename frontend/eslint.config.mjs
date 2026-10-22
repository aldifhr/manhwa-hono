import tailwindCanonicalClasses from 'eslint-plugin-tailwind-canonical-classes';
import tsParser from '@typescript-eslint/parser';

const tsFiles = ['**/*.{tsx,jsx,ts,js}'];

// Get recommended configs and add TS parser + file patterns
const recommended = tailwindCanonicalClasses.configs['flat/recommended'].map((cfg) => ({
  ...cfg,
  files: tsFiles,
  languageOptions: {
    ...(cfg.languageOptions ?? {}),
    parser: tsParser,
    parserOptions: {
      ...(cfg.languageOptions?.parserOptions ?? {}),
      ecmaFeatures: { ...(cfg.languageOptions?.parserOptions?.ecmaFeatures ?? {}), jsx: true },
    },
  },
}));

export default [
  ...recommended,

  // Override rule options
  {
    files: tsFiles,
    rules: {
      'tailwind-canonical-classes/tailwind-canonical-classes': [
        'warn',
        {
          cssPath: './app/globals.css',
          rootFontSize: 16,
          calleeFunctions: ['cn', 'clsx'],
        },
      ],
    },
  },
];
