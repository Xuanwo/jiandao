import antfu from "@antfu/eslint-config"

export default antfu({
  stylistic: {
    quotes: "double",
  },
  ignores: [
    "**/skills/**",
    // Design boards are hand-written HTML at fixed sizes, not application code.
    "design/**",
  ],
  rules: {
    "unused-imports/no-unused-imports": "error",
    "no-inner-declarations": "error",
    "antfu/consistent-list-newline": "off",
    "perfectionist/sort-imports": ["error", {
      groups: [
        "setup",
        "type-import",
        ["type-parent", "type-sibling", "type-index", "type-internal"],
        "value-builtin",
        "value-external",
        "value-internal",
        ["value-parent", "value-sibling", "value-index"],
        "side-effect",
        "ts-equals-import",
        "unknown",
      ],
      customGroups: [
        {
          groupName: "setup",
          elementNamePattern: "@/utils/zod-config",
        },
      ],
      newlinesBetween: "ignore",
      newlinesInside: "ignore",
      order: "asc",
      type: "natural",
    }],
  },
  react: {
    overrides: {
      // Not useful in React 19 — key is no longer part of props
      "react/no-implicit-key": "off",
    },
  },
}, [
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: [".claude/**/*"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
], [
  {
    files: ["**/*.md"],
    rules: {
      "perfectionist/sort-imports": "off",
    },
  },
], [
  {
    ignores: ["**/*.md/**", ".agents/**/*", ".claude/**/*", ".codex/**/*", ".cursor/**/*"],
  },
]).append({
  rules: {
    "react-refresh/only-export-components": "off",
    "test/consistent-test-it": "error",
    "test/no-identical-title": "error",
    "test/prefer-hooks-on-top": "error",
  },
}).append({
  files: [
    "**/__tests__/**/*.ts",
    "**/__tests__/**/*.tsx",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx",
  ],
  rules: {
    "react/component-hook-factories": "off",
  },
})
