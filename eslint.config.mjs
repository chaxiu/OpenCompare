import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const corePurity =
  'src/core must stay free of Electron/DOM dependencies so it can be unit-tested in plain Node.'

/**
 * Test-debt backstop, inline so it needs no new dependency: a test file keeps
 * real assertions and never counts `it(` / `test(` occurrences as a sentinel.
 * The gate itself reads case counts from `vitest list`; this rule only stops
 * the cheap "whole file rewritten / assertions emptied" signals at lint time.
 */
const opencompare = {
  rules: {
    'no-test-sentinel': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Test files keep expect() assertions and never count it( / test( occurrences as a sentinel.'
        },
        schema: [],
        messages: {
          zeroExpect:
            'Test file has no expect() assertion; an emptied or wholesale rewritten suite must not pass silently.',
          countSentinel:
            'Do not count test cases with {{method}}({{pattern}}); the test runner collection is the only case source.'
        }
      },
      create(context) {
        const source = context.sourceCode.text
        const countingMethods = new Set(['match', 'exec', 'split', 'test', 'search'])
        return {
          Program(node) {
            if (!/\bexpect\s*\(/.test(source)) {
              context.report({ node, messageId: 'zeroExpect' })
            }
          },
          CallExpression(node) {
            const callee = node.callee
            if (callee.type !== 'MemberExpression' || callee.computed) return
            const method = callee.property.type === 'Identifier' ? callee.property.name : null
            if (!method || !countingMethods.has(method)) return
            const argument = node.arguments[0]
            if (!argument || argument.type !== 'Literal') return
            const pattern =
              typeof argument.value === 'string'
                ? argument.value
                : (argument.regex?.pattern ?? null)
            if (!pattern || !/(?:^|[^A-Za-z0-9_])(?:it|test)\\?\(/.test(pattern)) return
            context.report({ node, messageId: 'countSentinel', data: { method, pattern } })
          }
        }
      }
    }
  }
}

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
    // `scripts/measure-symlink-footer.evidence.test.ts` is the documented
    // zero-assertion evidence printer, outside the vitest include; every real
    // suite keeps the sentinel rule.
    files: ['**/*.test.{ts,tsx}'],
    ignores: [
      'scripts/measure-symlink-footer.evidence.test.ts',
      'scripts/syntax-perf.evidence.test.ts'
    ],
    plugins: { opencompare },
    rules: { 'opencompare/no-test-sentinel': 'error' }
  },
  {
    // Brand icon generator: plain Node script run with `node build/icons/generate-icons.mjs`.
    files: ['build/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    // Harness launchers are plain Node scripts (`node scripts/perf-*.mjs`).
    files: ['scripts/**/*.mjs'],
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
            },
            {
              name: 'lucide-react',
              message:
                'Icons come from @renderer/components/Icon and the vendored table in assets/icons, never from an icon package.'
            }
          ],
          // The renderer has exactly one icon source; every other icon set is out.
          patterns: [
            {
              group: [
                '@tabler/icons*',
                '@heroicons/*',
                'heroicons',
                'feather-icons',
                'react-icons/*',
                '@fortawesome/*',
                'bootstrap-icons',
                '@mdi/*',
                'lucide-react/*',
                'lucide-*'
              ],
              message:
                'Icons come from @renderer/components/Icon and the vendored table in assets/icons, never from an icon package.'
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
