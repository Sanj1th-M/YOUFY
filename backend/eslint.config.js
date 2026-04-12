const security = require("eslint-plugin-security");

/** @type {import("eslint").Linter.FlatConfig[]} */
module.exports = [
  {
    ignores: ["node_modules/**", "dist/**", "build/**"]
  },
  {
    files: ["**/*.{js,cjs,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script"
    },
    plugins: {
      security
    },
    rules: {
      ...security.configs.recommended.rules
    }
  }
];

