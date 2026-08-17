import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist/**',
    'android/**',
    'ios/**',
    'coverage/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Các rule React Compiler này chỉ là khuyến nghị tối ưu hóa và đang
      // báo lỗi cho nhiều effect tải dữ liệu hợp lệ của ứng dụng hiện tại.
      // Giữ exhaustive-deps ở mức cảnh báo, không chặn build/release.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
])
