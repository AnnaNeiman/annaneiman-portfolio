// Dev-only ESLint flat config for the site's inline vanilla JS.
// Lints the <script> blocks in ../../index.html and ../../marketplace.html (+ case-*.html)
// via eslint-plugin-html. eslint:recommended + the brief's explicit rules
// (=== , no stray console.*, no leaked globals). Not shipped with the site.
import js from "@eslint/js";
import html from "eslint-plugin-html";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.html"],
    plugins: { html },
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: {
        ...globals.browser
      }
    },
    rules: {
      eqeqeq: ["error", "always"],
      "no-console": "error",
      "no-undef": "error",
      "no-implicit-globals": "error",
      "no-var": "off",
      "no-unused-vars": ["error", { args: "none" }]
    }
  }
];
