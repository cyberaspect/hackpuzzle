const PAGE_SCRIPT_PATH = 'content/hp-runtime.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'hp-inject') {
    return;
  }

  if (!sender.tab || sender.tab.id === undefined) {
    sendResponse({ ok: false, error: 'Missing tab context for injection.' });
    return;
  }

  const target = { tabId: sender.tab.id };
  if (typeof sender.frameId === 'number' && sender.frameId >= 0) {
    target.frameIds = [sender.frameId];
  }

  chrome.scripting.executeScript({
    target,
    files: [PAGE_SCRIPT_PATH],
    world: 'MAIN',
    injectImmediately: true
  }).then(() => {
    sendResponse({ ok: true });
  }).catch((error) => {
    console.error('[hp] failed to inject: ', error);
    sendResponse({ ok: false, error: error.message });
  });

  return true; // keep message channel open for async response
});
