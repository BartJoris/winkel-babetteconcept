export default [
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"]
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    }
  }
];
