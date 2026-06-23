/**
 * @type {import('npm-check-updates').RunOptions}
 */
module.exports = {
  reject: [
    // we'll upgrade Node manually when it's time
    "@types/node",

    // many icons removed in v1.0
    "lucide-react",

    // it takes time...
    "typescript",

    // turbo ships with a custom update codemod
    "turbo",
  ],

  packageManager: "bun",

  // workspaces mode (deep won't work here)
  workspaces: true,
};
