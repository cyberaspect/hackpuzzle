const featureToggle = document.getElementById('featureToggle');
const statusBadge = document.getElementById('status-badge');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const refreshButton = document.getElementById('refresh');
const compactBtn = document.getElementById('compactBtn');
const flushBtn = document.getElementById('flushBtn');
const compactExitBtn = document.getElementById('compactExitBtn');
const compactFlushBtn = document.getElementById('compactFlushBtn');
const warningBanner = document.getElementById('hp-warning-banner');
const warningCloseBtn = document.getElementById('hp-warning-close');
const warningFlushBtn = document.getElementById('hp-flush-btn');
let warningBannerVisible = false;

function showWarningBanner() {
  if (warningBanner && !warningBannerVisible) {
    warningBanner.style.display = 'flex';
    warningBannerVisible = true;
  }
}

function hideWarningBanner() {
  if (warningBanner && warningBannerVisible) {
    warningBanner.style.display = 'none';
    warningBannerVisible = false;
  }
}

const versionLabel = document.getElementById('version-label');
const updateNotice = document.getElementById('update-notice');
const updateLink = document.getElementById('update-link');

const extensionManifest = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getManifest === 'function'
  ? chrome.runtime.getManifest()
  : { version: '0.0.0' };

const CURRENT_VERSION = extensionManifest.version || '0.0.0';

const RELEASE_CACHE_KEY = 'hpLatestReleaseCache';
const RELEASE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Update the owner/repo if you publish releases under a different GitHub project.
const GITHUB_RELEASE_CONFIG = {
  owner: 'cyberaspect',
  repo: 'hackpuzzle',
  apiUrl: 'https://api.github.com',
  // releasesUrl: `https://github.com/${this.owner}/${this.repo}/releases`
};

GITHUB_RELEASE_CONFIG.releasesUrl = `https://github.com/${GITHUB_RELEASE_CONFIG.owner}/${GITHUB_RELEASE_CONFIG.repo}/releases`;

let updateLinkBound = false;

const STORAGE_KEY = 'hpEnabled';

function normalizeVersion(value) {
  if (!value) {
    return null;
  }

  try {
    const cleaned = value.toString().trim();
    if (!cleaned) {
      return null;
    }
    const withoutPrefix = cleaned.replace(/^v/i, '');
    const base = withoutPrefix.split(/[-+]/)[0];
    return base || null;
  } catch (_) {
    return null;
  }
}

function compareSemver(a, b) {
  const partsA = (a || '').split('.').map((part) => parseInt(part, 10) || 0);
  const partsB = (b || '').split('.').map((part) => parseInt(part, 10) || 0);
  const length = Math.max(partsA.length, partsB.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (partsA[index] || 0) - (partsB[index] || 0);
    if (diff > 0) {
      return 1;
    }
    if (diff < 0) {
      return -1;
    }
  }

  return 0;
}

function hideUpdateNotice() {
  if (updateNotice) {
    updateNotice.style.display = 'none';
  }
  if (updateLink) {
    delete updateLink.dataset.url;
    delete updateLink.dataset.version;
    updateLink.removeAttribute('title');
  }
}

function showUpdateNotice(release, remoteVersion) {
  if (!updateNotice || !updateLink) {
    return;
  }

  const releaseUrl = release && typeof release === 'object'
    ? (release.html_url || `${GITHUB_RELEASE_CONFIG.releasesUrl}/tag/${release.tag_name || remoteVersion || ''}`)
    : GITHUB_RELEASE_CONFIG.releasesUrl;

  updateNotice.style.display = 'inline-flex';
  updateLink.textContent = 'update available';
  updateLink.dataset.url = releaseUrl;
  updateLink.title = remoteVersion ? `Open release v${remoteVersion}` : 'Open latest release';
  if (remoteVersion) {
    updateLink.dataset.version = remoteVersion;
  } else {
    delete updateLink.dataset.version;
  }
}

function bindUpdateLink() {
  if (!updateLink || updateLinkBound) {
    return;
  }

  updateLinkBound = true;
  updateLink.addEventListener('click', (event) => {
    // Prevent default for left/middle click
    if ([0, 1].includes(event.button)) {
      event.preventDefault();
    }
    const targetUrl = updateLink.dataset.url || GITHUB_RELEASE_CONFIG.releasesUrl;
    if (!targetUrl) {
      return;
    }

    if (chrome && chrome.tabs && typeof chrome.tabs.create === 'function') {
      chrome.tabs.create({ url: targetUrl });
      window.close();
      return;
    }

    try {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    } catch (_) {
      // ignore errors opening new window
    }
  });
}

function initVersionMessaging() {
  if (versionLabel) {
    versionLabel.textContent = `v${CURRENT_VERSION}`;
  }
  bindUpdateLink();
  hideUpdateNotice();
}

function getCachedRelease() {
  return new Promise((resolve) => {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      resolve(null);
      return;
    }

    chrome.storage.local.get([RELEASE_CACHE_KEY], (items) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        console.warn('popup release cache get error', chrome.runtime.lastError);
        resolve(null);
        return;
      }
      resolve(items[RELEASE_CACHE_KEY] || null);
    });
  });
}

function setCachedRelease(entry) {
  if (!chrome || !chrome.storage || !chrome.storage.local) {
    return;
  }

  chrome.storage.local.set({ [RELEASE_CACHE_KEY]: entry }, () => {
    if (chrome.runtime && chrome.runtime.lastError) {
      console.warn('popup release cache set error', chrome.runtime.lastError);
    }
  });
}

async function fetchLatestReleaseMetadata() {
  const endpoint = `${GITHUB_RELEASE_CONFIG.apiUrl}/repos/${GITHUB_RELEASE_CONFIG.owner}/${GITHUB_RELEASE_CONFIG.repo}/releases/latest`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      // Keep only CORS-safelisted headers to avoid preflight.
      headers: {
        Accept: 'application/vnd.github+json'
      },
      // Use fetch cache control instead of sending a Cache-Control header.
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn('popup release fetch error', error);
    return null;
  }
}

function applyReleaseToUi(release) {
  if (!release || typeof release !== 'object') {
    hideUpdateNotice();
    return false;
  }

  const remoteVersion = normalizeVersion(release.tag_name || release.name);
  const currentVersion = normalizeVersion(CURRENT_VERSION);

  if (!remoteVersion || !currentVersion) {
    hideUpdateNotice();
    return false;
  }

  if (compareSemver(remoteVersion, currentVersion) > 0) {
    showUpdateNotice(release, remoteVersion);
    return true;
  }

  hideUpdateNotice();
  return false;
}

async function checkForReleaseUpdates() {
  try {
    const cached = await getCachedRelease();
    const now = Date.now();
    if (cached && cached.release && cached.timestamp && now - cached.timestamp < RELEASE_CACHE_TTL_MS) {
      if (applyReleaseToUi(cached.release)) {
        return;
      }
    }

    const latest = await fetchLatestReleaseMetadata();
    if (latest) {
      setCachedRelease({ release: latest, timestamp: now });
      applyReleaseToUi(latest);
    }
  } catch (error) {
    console.warn('popup release check error', error);
  }
}

const STATUS_VARIANTS = {
  loading: { badge: 'status-badge--loading', dot: 'status-dot--loading', message: 'loading...' },
  on: { badge: 'status-badge--on', dot: 'status-dot--on', message: 'enabled' },
  off: { badge: 'status-badge--off', dot: 'status-dot--off', message: 'disabled' },
  standby: { badge: 'status-badge--standby', dot: 'status-dot--standby', message: 'waiting for response' },
  unavailable: { badge: 'status-badge--error', dot: 'status-dot--error', message: 'unavailable' }
};

const ALL_BADGE_VARIANTS = Object.values(STATUS_VARIANTS).map((variant) => variant.badge);
const ALL_DOT_VARIANTS = Object.values(STATUS_VARIANTS).map((variant) => variant.dot);

function applyStatus(state, overrideMessage) {
  const variant = STATUS_VARIANTS[state] || STATUS_VARIANTS.loading;

  if (statusBadge) {
    statusBadge.classList.remove(...ALL_BADGE_VARIANTS);
    statusBadge.classList.add(variant.badge);
  }

  if (statusDot) {
    statusDot.classList.remove(...ALL_DOT_VARIANTS);
    statusDot.classList.add(variant.dot);
  }

  if (statusText) {
    statusText.textContent = overrideMessage || variant.message;
  }


  if (featureToggle) {
    featureToggle.disabled = state === 'standby' || state === 'loading';
  }

  // Show warning banner if status is unavailable
  if (state === 'unavailable') {
    showWarningBanner();
  } else {
    hideWarningBanner();
  }
}

function syncToggle(enabled) {
  if (featureToggle) {
    featureToggle.checked = !!enabled;
  }
}

function loadPreference(defaultValue = true) {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [STORAGE_KEY]: defaultValue }, (items) => {
      if (chrome.runtime.lastError) {
        console.warn('popup storage get error', chrome.runtime.lastError);
        resolve(defaultValue);
        return;
      }
      resolve(!!items[STORAGE_KEY]);
    });
  });
}

function persistPreference(enabled) {
  chrome.storage.sync.set({ [STORAGE_KEY]: enabled }, () => {
    if (chrome.runtime.lastError) {
      console.warn('popup storage set error', chrome.runtime.lastError);
    }
  });
}

// Promise-based setter to ensure storage is flushed before proceeding
function persistPreferenceAsync(enabled) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: enabled }, () => {
      if (chrome.runtime.lastError) {
        console.warn('popup storage set error', chrome.runtime.lastError);
      }
      resolve();
    });
  });
}

function loadCompactPreference() {
  try {
    return localStorage.getItem('hp-use-compact-mode') === 'true';
  } catch (_) {
    return false;
  }
}

function persistCompactPreference(enabled) {
  try {
    localStorage.setItem('hp-use-compact-mode', enabled ? 'true' : 'false');
  } catch (_) {}
}

function setCompactMode(enabled, shouldPersist = true) {
  const nextState = !!enabled;
  document.body.classList.toggle('compact', nextState);
  if (shouldPersist) {
    persistCompactPreference(nextState);
  }
}

const WATCH_PATH_REGEX = /^\/assignments\/[^/]+\/watch\/?$/i;
const EDPUZZLE_HOST_REGEX = /^(?:[^.]+\.)?edpuzzle\.com$/i;

function isAssignmentWatchUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    return EDPUZZLE_HOST_REGEX.test(parsed.hostname) && WATCH_PATH_REGEX.test(parsed.pathname);
  } catch (_) {
    return false;
  }
}

function applyNonWatchStatus(enabled) {
  const message = enabled ? 'ready' : undefined;
  applyStatus(enabled ? 'on' : 'off', message);
}

async function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]);
    });
  });
}

function listEdpuzzleTabs() {
  return new Promise((resolve) => {
    // Query all tabs that match Edpuzzle URLs
    chrome.tabs.query({ url: [
      'https://edpuzzle.com/*',
      'https://*.edpuzzle.com/*'
    ] }, (tabs) => resolve(tabs || []));
  });
}

async function reloadEdpuzzleTabs() {
  try {
    const tabs = await listEdpuzzleTabs();
    for (const t of tabs) {
      try { chrome.tabs.reload(t.id); } catch (_) { /* ignore */ }
    }
  } catch (e) {
    console.warn('failed to reload edpuzzle tabs', e);
  }
}

function getTab(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.get(tabId, (tab) => resolve(tab));
    } catch (_) {
      resolve(null);
    }
  });
}

function waitForTabComplete(tabId, { timeoutMs = 20000, checkInterval = 300 } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = async () => {
      const tab = await getTab(tabId);
      if (tab && tab.status === 'complete') {
        return resolve(true);
      }
      if (Date.now() - started >= timeoutMs) {
        return resolve(false);
      }
      setTimeout(check, checkInterval);
    };
    check();
  });
}

function pollTabStatus(tabId, { attempts = 30, interval = 500, message = 'checking status...' } = {}) {
  return new Promise((resolve) => {
    let tries = 0;
    const tick = async () => {
      tries += 1;
      // If the tab is still loading, wait a bit before messaging the content script
      const ready = await waitForTabComplete(tabId, { timeoutMs: 0 });
      if (!ready) {
        if (tries >= attempts) {
          const saved = await loadPreference();
          syncToggle(saved);
          applyStatus('unavailable', 'unavailable');
          return resolve(false);
        }
        applyStatus('loading', 'loading page...');
        return setTimeout(tick, interval);
      }

      chrome.tabs.sendMessage(tabId, { action: 'getFeatureState' }, async (resp) => {
        if (chrome.runtime.lastError || !resp || typeof resp.featureEnabled !== 'boolean') {
          // Treat missing receiver as transient while content scripts re-inject
          const lastErr = chrome.runtime.lastError && chrome.runtime.lastError.message || '';
          const transient = /Receiving end does not exist|The message port closed/i.test(lastErr);
          if (tries >= attempts) {
            // Give up after attempts; fall back to stored preference
            const saved = await loadPreference();
            syncToggle(saved);
            applyStatus('unavailable', 'unavailable');
            return resolve(false);
          }
          applyStatus('loading', transient ? 'waiting for page...' : message);
          return setTimeout(tick, interval);
        }

        const enabled = !!resp.featureEnabled;
        const applicable = typeof resp.applicable === 'boolean' ? resp.applicable : true;
        syncToggle(enabled);
        if (!applicable) {
          applyNonWatchStatus(enabled);
        } else {
          applyStatus(enabled ? 'on' : 'off');
        }
        return resolve(true);
      });
    };
    tick();
  });
}

function flushActiveTab() {
  applyStatus('loading', 'flushing cache...');
  chrome.storage.sync.remove([STORAGE_KEY], async () => {
    const tab = await getActiveTab();
    if (tab && tab.id) {
      try {
        chrome.tabs.reload(tab.id);
        setTimeout(() => updateStatusFromTab('Checking after flush…'), 800);
      } catch (e) {
        applyStatus('unavailable', 'unable to reload tab');
      }
    } else {
      applyStatus('unavailable', 'no active tab to reload');
    }
  });
}

async function updateStatusFromTab(messageOverride) {
  if (refreshButton) refreshButton.disabled = true;
  applyStatus('loading', messageOverride);

  const tab = await getActiveTab();
  if (!tab) {
    applyStatus('unavailable', 'no active tab');
    showWarningBanner();
    return;
  }

  const tabIsWatchPage = isAssignmentWatchUrl(tab.url);

  if (!tabIsWatchPage) {
    const saved = await loadPreference();
    syncToggle(saved);
    applyNonWatchStatus(saved);
    hideWarningBanner();
    return;
  }

  let statusOk = false;
  await new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { action: 'getFeatureState' }, async (resp) => {
      if (chrome.runtime.lastError || !resp || typeof resp.featureEnabled !== 'boolean') {
        // Instead of falling into a sticky standby, poll a few times to await content readiness
        if (tabIsWatchPage) {
          const pollResult = await pollTabStatus(tab.id, { attempts: 12, interval: 500, message: 'waiting for page...' });
          statusOk = !!pollResult;
          if (!statusOk) showWarningBanner();
          else hideWarningBanner();
          if (refreshButton) refreshButton.disabled = false;
          return resolve();
        }
        const saved = await loadPreference();
        syncToggle(saved);
        applyNonWatchStatus(saved);
        showWarningBanner();
        if (refreshButton) refreshButton.disabled = false;
        return resolve();
      }

      const enabled = !!resp.featureEnabled;
      const applicable = typeof resp.applicable === 'boolean' ? resp.applicable : true;

      if (!applicable) {
        syncToggle(enabled);
        applyNonWatchStatus(enabled);
        hideWarningBanner();
        if (refreshButton) refreshButton.disabled = false;
        return resolve();
      }

      syncToggle(enabled);
      applyStatus(enabled ? 'on' : 'off');
      hideWarningBanner();
      statusOk = true;
      if (refreshButton) refreshButton.disabled = false;
      return resolve();
    });
  });
}

async function initialize() {
  initVersionMessaging();
  void checkForReleaseUpdates();

  applyStatus('loading', 'preparing...');

  const initialCompact = loadCompactPreference();
  setCompactMode(initialCompact, false);

  const savedPreference = await loadPreference();
  syncToggle(savedPreference);

  if (featureToggle) {
    featureToggle.addEventListener('change', async (event) => {
      const enabled = !!event.target.checked;
      syncToggle(enabled);
      applyStatus('loading', enabled ? 'enabling...' : 'disabling...');

      // Persist and wait to ensure content pages can read the setting
      await persistPreferenceAsync(enabled);

      // Reload all Edpuzzle tabs so the change takes effect reliably
      await reloadEdpuzzleTabs();

      // After reloads, wait for the active tab to finish loading, then poll status if it's a watch page
      const tab = await getActiveTab();
      if (tab && isAssignmentWatchUrl(tab.url) && tab.id != null) {
        const loaded = await waitForTabComplete(tab.id, { timeoutMs: 20000, checkInterval: 300 });
        void pollTabStatus(tab.id, {
          attempts: loaded ? 30 : 40,
          interval: 500,
          message: enabled ? 'enabling...' : 'disabling...'
        });
      } else {
        applyNonWatchStatus(enabled);
      }
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      updateStatusFromTab('refreshing...');
    });
  }

  // Wire up warning banner flush and close buttons
  if (warningFlushBtn) {
    warningFlushBtn.addEventListener('click', () => {
      flushActiveTab();
      hideWarningBanner();
    });
  }
  if (warningCloseBtn) {
    warningCloseBtn.addEventListener('click', () => {
      hideWarningBanner();
    });
  }

  // Compact button: shrink UI to just toggle + status.
  if (compactBtn) {
    compactBtn.addEventListener('click', () => {
      setCompactMode(true);
    });
  }

  if (compactExitBtn) {
    compactExitBtn.addEventListener('click', () => {
      setCompactMode(false);
    });
  }

  // Flush buttons: clear stored preference and reload active tab to force reinjection
  if (flushBtn) {
    flushBtn.addEventListener('click', flushActiveTab);
  }

  if (compactFlushBtn) {
    compactFlushBtn.addEventListener('click', flushActiveTab);
  }

  updateStatusFromTab();
}

initialize();
