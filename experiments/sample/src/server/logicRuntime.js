"use strict";

const path = require("node:path");
const { createRequire } = require("node:module");

let cachedLogicModule;

function getLogicModule() {
  if (!cachedLogicModule) {
    const logicPackagePath = path.resolve(
      process.cwd(),
      "..",
      "logic",
      "package.json"
    );
    const logicRequire = createRequire(logicPackagePath);
    cachedLogicModule = logicRequire("./src");
  }

  return cachedLogicModule;
}

module.exports = {
  getLogicModule
};
