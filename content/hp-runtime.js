(() => {
  // hp script
  if (window.__hackpuzzleLoaded) {
    return;
  }
  window.__hackpuzzleLoaded = true;

  const MATCH_URL_FRAGMENTS = [
    '/api/v3/learning/assignments/',
    '/api/v3/assignments/'
  ];
  const WATCH_PATH_REGEX = /^\/assignments\/[^/]+\/watch\/?$/;

  window.__hackpuzzle_enabled = window.__hackpuzzle_enabled ?? true;
  window.__hackpuzzleLogEnabled = window.__hackpuzzleLogEnabled ?? false;
  let isWatchPage = WATCH_PATH_REGEX.test(window.location.pathname);

  function log(...args) {
    if (window.__hackpuzzleLogEnabled) {
      try {
        console.info('[hp]', ...args);
      } catch (_) {
        // ignore
      }
    }
  }

  function computeWatchPage() {
    return WATCH_PATH_REGEX.test(window.location.pathname);
  }

  function updateWatchPageFlag() {
    const next = computeWatchPage();
    if (next !== isWatchPage) {
      isWatchPage = next;
      log('watch page ->', isWatchPage);
    }
  }

  function wrapHistoryMethod(name) {
    try {
      const original = history[name];
      if (typeof original !== 'function') {
        return;
      }

      history[name] = function wrappedHistoryMethod(...args) {
        const result = original.apply(this, args);
        queueMicrotask(updateWatchPageFlag);
        return result;
      };
    } catch (error) {
      log(`${name} override failed`, error);
    }
  }

  function matchesAssignmentApi(url) {
    if (!url) {
      return false;
    }

    try {
      return MATCH_URL_FRAGMENTS.some((fragment) => url.includes(fragment));
    } catch (_) {
      return false;
    }
  }

  function shouldPatchAssignments() {
    return window.__hackpuzzle_enabled && isWatchPage;
  }

  function deepSetAllowSkipping(obj) {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        continue;
      }

      try {
        if (key === 'allowSkippingThroughVideos' || key === 'allowSkipAhead') {
          obj[key] = true;
        } else if (typeof obj[key] === 'object') {
          deepSetAllowSkipping(obj[key]);
        }
      } catch (_) {
        // ignore individual property failures
      }
    }
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = async function hackpuzzleFetchProxy(...args) {
      const response = await nativeFetch.apply(this, args);

      try {
      const request = args[0];
      const url = (typeof request === 'string') ? request : (request && request.url) || '';
      if (matchesAssignmentApi(url) && shouldPatchAssignments()) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await response.clone().json();
            deepSetAllowSkipping(json);
            log('modified fetch response for', url);

            const headers = new Headers();
            response.headers.forEach((value, key) => headers.append(key, value));

            return new Response(JSON.stringify(json), {
              status: response.status,
              statusText: response.statusText,
              headers
            });
          }
        }
      } catch (error) {
        log('fetch intercept error', error);
      }

      return response;
    };
  }

  try {
    const NativeXHR = window.XMLHttpRequest;
    const HackpuzzleXHR = function () {
      const xhr = new NativeXHR();
      let requestUrl = '';

      const originalOpen = xhr.open;
      xhr.open = function hackpuzzleOpenProxy(method, url) {
        requestUrl = url || '';
        return originalOpen.apply(this, arguments);
      };

      const originalSend = xhr.send;
      xhr.send = function hackpuzzleSendProxy() {
        this.addEventListener('readystatechange', function onReadyStateChange() {
          try {
            if (this.readyState === 4 && matchesAssignmentApi(requestUrl) && shouldPatchAssignments()) {
              const contentType = this.getResponseHeader('content-type') || '';
              if (contentType.includes('application/json')) {
                try {
                  const parsed = JSON.parse(this.responseText);
                  deepSetAllowSkipping(parsed);

                  try {
                    Object.defineProperty(this, 'responseText', {
                      configurable: true,
                      get: () => JSON.stringify(parsed)
                    });
                  } catch (_) {}

                  try {
                    Object.defineProperty(this, 'response', {
                      configurable: true,
                      get: () => JSON.stringify(parsed)
                    });
                  } catch (_) {}

                  log('modified XHR response for', requestUrl);
                } catch (_) {
                  // ignore JSON parse failures
                }
              }
            }
          } catch (_) {
            // ignore XHR interception failures
          }
        }, false);

        return originalSend.apply(this, arguments);
      };

      return xhr;
    };

    window.XMLHttpRequest = HackpuzzleXHR;
  } catch (error) {
    log('XHR override failed', error);
  }

  window.addEventListener('message', (event) => {
    try {
      const data = event && event.data;
      if (!data || typeof data !== 'object') {
        return;
      }

      if (data.type === 'hp-toggle') {
        window.__hackpuzzle_enabled = !!data.enabled;
        log('hackpuzzle enabled =', window.__hackpuzzle_enabled);
      }

      if (data.type === 'hp-log') {
        window.__hackpuzzleLogEnabled = !!data.enabled;
        log('hackpuzzle logging =', window.__hackpuzzleLogEnabled);
      }
    } catch (_) {
      // swallow message errors
    }
  }, false);

  wrapHistoryMethod('pushState');
  wrapHistoryMethod('replaceState');
  window.addEventListener('popstate', () => queueMicrotask(updateWatchPageFlag));
  queueMicrotask(updateWatchPageFlag);

  log('hackpuzzle active.');
})();
