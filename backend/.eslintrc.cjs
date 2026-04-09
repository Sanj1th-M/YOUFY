module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "script"
  },
  plugins: ["security"],
  extends: ["eslint:recommended", "plugin:security/recommended"],
  ignorePatterns: ["node_modules/", "dist/", "build/"]
};

