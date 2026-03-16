"use strict";

const STORE_KEY = "__u2ssoDemoStore";

function createStore() {
  return {
    challenges: new Map(),
    accounts: new Map(),
    nullifiers: new Map(),
    sessions: new Map()
  };
}

const store = globalThis[STORE_KEY] || createStore();
globalThis[STORE_KEY] = store;

function resetStore() {
  store.challenges.clear();
  store.accounts.clear();
  store.nullifiers.clear();
  store.sessions.clear();
}

module.exports = {
  resetStore,
  store
};
