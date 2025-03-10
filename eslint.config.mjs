import globals from "globals";
import pluginJs from "@eslint/js";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ["**/*.js"],
    languageOptions: { globals: globals.browser },
    ignorePatterns: ["node_modules/"],
  },
  pluginJs.configs.recommended,
];
