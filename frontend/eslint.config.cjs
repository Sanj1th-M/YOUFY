const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const security = require("eslint-plugin-security");

/** @type {import("eslint").Linter.FlatConfig[]} */
module.exports = [
  {
    ignores: ["node_modules/**", "dist/**"]
  },
  {
    files: ["**/*.{js,jsx,cjs,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly"
      },
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    settings: {
      react: { version: "detect" }
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      security
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...security.configs.recommended.rules,

      // Modern React (new JSX transform) and typical Vite setups
      "react/react-in-jsx-scope": "off",
      // Youfy does not use PropTypes (TypeScript is not present either)
      "react/prop-types": "off",
      // Often too noisy for app UIs (apostrophes in copy)
      "react/no-unescaped-entities": "off"
    }
  }
];

