/** @type {import("eslint").Linter.Config} */
module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
  ],
  rules: {
    // Prefer explicit return types on exported functions
    "@typescript-eslint/explicit-module-boundary-types": "warn",
    // No floating promises — async calls must be awaited or .catch()-ed
    "@typescript-eslint/no-floating-promises": "error",
    // Allow _ prefix for intentionally unused vars
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    // Don't allow `any` outside of declaration files
    "@typescript-eslint/no-explicit-any": "error",
  },
};
