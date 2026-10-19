import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const corePurity =
  'src/core must stay free of Electron/DOM dependencies so it can be unit-tested in plain Node.'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    }
  },
  {
    // Brand icon generator: plain Node script run with `node build/icons/generate-icons.mjs`.
    files: ['build/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message:
                'Renderer code must reach the platform through PlatformPort, never Electron APIs directly.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'electron', message: corePurity }],
          patterns: [
            { group: ['electron/*', 'react', 'react-dom', 'lucide-react', '*.css'], message: corePurity }
          ]
        }
      ]
    }
  }
)
