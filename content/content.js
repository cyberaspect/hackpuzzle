(() => {
  const ENABLE_LOGGING = true; // flip to false to silence console output [done automatically in production builds]
  const STORAGE_KEY = 'hpEnabled';
  const INJECT_MESSAGE_TYPE = 'hp-inject';
  const PREFIX = 'hp-';
  const WATCH_PATH_REGEX = /^\/assignments\/[^/]+\/watch\/?$/;

  let featureEnabled = true;
  let injectionPromise = null;
  let lastKnownApplicability = WATCH_PATH_REGEX.test(window.location.pathname);

  function log(...args) {
    if (ENABLE_LOGGING) {
      console.log('[hp]', ...args);
    }
  }

  function isWatchPage() {
    return WATCH_PATH_REGEX.test(window.location.pathname);
  }

  function getResponsePayload() {
    return {
      featureEnabled,
      applicable: isWatchPage()
    };
  }

  function ensurePageScriptInjected() {
    if (injectionPromise) {
      return injectionPromise;
    }

    injectionPromise = new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: INJECT_MESSAGE_TYPE }, (response) => {
        if (chrome.runtime.lastError) {
          log('inject message error', chrome.runtime.lastError);
          injectionPromise = null;
          resolve(false);
          return;
        }

        if (response && response.ok) {
          log('page script injected');
          resolve(true);
          return;
        }

        log('page script injection failed', response && response.error);
        injectionPromise = null;
        resolve(false);
      });
    });

    return injectionPromise;
  }

  function postToPage(payload) {
    ensurePageScriptInjected().then((injected) => {
      if (!injected) {
        return;
      }

      try {
        window.postMessage(payload, '*');
      } catch (error) {
        log('postMessage error', error);
      }
    });
  }

  function notifyLogPreference() {
  postToPage({ type: `${PREFIX}log`, enabled: ENABLE_LOGGING });
  }

  function postFeatureState() {
    const applicable = isWatchPage();
    const effective = featureEnabled && applicable;
  postToPage({ type: `${PREFIX}toggle`, enabled: effective });
    log('synced feature state ->', featureEnabled, '(effective:', effective, 'applicable:', applicable, ')');
  }

  function handleLocationChange() {
    const currentApplicability = isWatchPage();
    if (currentApplicability === lastKnownApplicability) {
      return;
    }

    lastKnownApplicability = currentApplicability;
    log('location changed, applicable ->', currentApplicability);

    ensurePageScriptInjected().then((injected) => {
      if (injected) {
        notifyLogPreference();
        postFeatureState();
      }
    });
  }

  function wrapHistoryMethod(name) {
    try {
      const original = history[name];
      if (typeof original !== 'function') {
        return;
      }

      history[name] = function wrappedHistoryMethod(...args) {
        const result = original.apply(this, args);
        queueMicrotask(handleLocationChange);
        return result;
      };
    } catch (error) {
      log(`${name} override failed`, error);
    }
  }

  function setFeatureState(enabled) {
    featureEnabled = !!enabled;
    postFeatureState();
  }

  function persistFeatureState() {
    chrome.storage.sync.set({ [STORAGE_KEY]: featureEnabled }, () => {
      if (chrome.runtime && chrome.runtime.lastError) {
        log('storage set error', chrome.runtime.lastError);
      }
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) {
      return;
    }

    if (message.action === 'getFeatureState') {
      sendResponse(getResponsePayload());
    }

    if (message.action === 'setFeatureState') {
      setFeatureState(message.enabled);
      persistFeatureState();
      sendResponse(getResponsePayload());
    }

    return;
  });

  wrapHistoryMethod('pushState');
  wrapHistoryMethod('replaceState');
  window.addEventListener('popstate', () => queueMicrotask(handleLocationChange));

  ensurePageScriptInjected().then((injected) => {
    if (injected) {
      notifyLogPreference();
      postFeatureState();
    }
  });

  chrome.storage.sync.get({ [STORAGE_KEY]: true }, (items) => {
    if (chrome.runtime && chrome.runtime.lastError) {
      log('storage get error', chrome.runtime.lastError);
      return;
    }

    setFeatureState(items[STORAGE_KEY]);
  });

  // React to changes to STORAGE_KEY so toggles propagate across tabs immediately
  chrome.storage.onChanged.addListener((changes, area) => {
    try {
      if (area !== 'sync' || !changes || !changes[STORAGE_KEY]) {
        return;
      }
      const next = !!changes[STORAGE_KEY].newValue;
      setFeatureState(next);
    } catch (err) {
      log('storage change handler error', err);
    }
  });

  notifyLogPreference();
  handleLocationChange();
})();
