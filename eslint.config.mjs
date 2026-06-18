import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    files: ["src/**/*.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error"
    }
  },
  {
    ignores: ["dist/**", "node_modules/**", "bin/**", "pages"],
  }
);