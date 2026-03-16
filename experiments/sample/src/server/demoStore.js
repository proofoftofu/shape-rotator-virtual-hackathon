"use strict";

const store = {
  challenges: new Map(),
  accounts: new Map(),
  nullifiers: new Map(),
  sessions: new Map()
};

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
