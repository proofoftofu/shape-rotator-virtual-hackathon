chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") {
    return;
  }

  chrome.tabs.create({
    active: true,
    url: chrome.runtime.getURL("index.html?mode=setup")
  });
});
