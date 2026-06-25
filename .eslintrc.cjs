module.exports = {
    root: true,
    env: {
        node: true,
        es2022: true,
    },
    parser: "@typescript-eslint/parser",
    parserOptions: {
        project: [
            "./server/tsconfig.json",
            "./web/tsconfig.json",
            "./packages/registry-client/tsconfig.json",
            "./mcp/tsconfig.json",
        ],
        tsconfigRootDir: __dirname,
        sourceType: "module",
    },
    plugins: ["@typescript-eslint", "prettier"],
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:prettier/recommended"],
    ignorePatterns: [
        "node_modules/",
        "dist/",
        ".pnpm/",
        "contract/",
        "server/dist/",
        "web/dist/",
        "packages/registry-client/src/generated/",
    ],
    rules: {
        "prettier/prettier": "error",
        "no-console": ["warn", { allow: ["warn", "error"] }],
        "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-namespace": "off",
        "@typescript-eslint/triple-slash-reference": "off",
    },
};
