"use strict";

let cachedLogicModule;

function getLogicModule() {
  if (!cachedLogicModule) {
    cachedLogicModule = require("./u2ssoLogic");
  }

  return cachedLogicModule;
}

module.exports = {
  getLogicModule
};
