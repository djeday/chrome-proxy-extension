let proxyState = {
    enabled: false,
    host: '',
    port: 3128,
    username: '',
    password: ''
};

// requestId -> number of auth attempts
const authAttempts = new Map();

async function loadState() {
    const data = await chrome.storage.local.get([
        'enabled',
        'host',
        'port',
        'username',
        'password'
    ]);

    proxyState = {
        enabled: Boolean(data.enabled),
        host: String(data.host || ''),
        port: Number(data.port || 3128),
        username: String(data.username || ''),
        password: String(data.password || '')
    };
}

async function saveState() {
    await chrome.storage.local.set({
        enabled: proxyState.enabled,
        host: proxyState.host,
        port: proxyState.port,
        username: proxyState.username,
        password: proxyState.password
    });
}

async function enableProxy() {
    if (!proxyState.host || !proxyState.port) {
        throw new Error('Proxy host/port is not configured');
    }

    await chrome.proxy.settings.set({
        value: {
            mode: 'fixed_servers',
            rules: {
                singleProxy: {
                    scheme: 'http',
                    host: proxyState.host,
                    port: proxyState.port
                }
            }
        },
        scope: 'regular'
    });

    proxyState.enabled = true;

    await saveState();
}

async function disableProxy() {
    await chrome.proxy.settings.clear({
        scope: 'regular'
    });

    proxyState.enabled = false;

    await saveState();
    authAttempts.clear();
}

async function restoreProxyState() {
    await loadState();

    if (!proxyState.enabled) {
        return;
    }

    if (!proxyState.host || !proxyState.port) {
        proxyState.enabled = false;
        await saveState();
        return;
    }

    try {
        await chrome.proxy.settings.set({
            value: {
                mode: 'fixed_servers',
                rules: {
                    singleProxy: {
                        scheme: 'http',
                        host: proxyState.host,
                        port: proxyState.port
                    }
                }
            },
            scope: 'regular'
        });
    } catch (error) {
        console.error('Failed to restore proxy:', error);
    }
}

/*
 * Extension/service worker startup
 */
restoreProxyState();

/*
 * Chrome browser startup
 */
chrome.runtime.onStartup.addListener(() => {
    restoreProxyState();
});

/*
 * Extension installed / updated
 */
chrome.runtime.onInstalled.addListener(() => {
    restoreProxyState();
});

/*
 * Keep in-memory state synchronized with storage.
 */
chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
        proxyState.enabled = Boolean(changes.enabled.newValue);
    }

    if (changes.host) {
        proxyState.host = String(changes.host.newValue || '');
    }

    if (changes.port) {
        proxyState.port = Number(changes.port.newValue || 3128);
    }

    if (changes.username) {
        proxyState.username = String(changes.username.newValue || '');
    }

    if (changes.password) {
        proxyState.password = String(changes.password.newValue || '');
    }
});

/*
 * Automatic proxy authentication.
 *
 * Important:
 * details.isProxy === true means this is
 * Proxy-Authenticate / HTTP proxy auth.
 */
chrome.webRequest.onAuthRequired.addListener(
    (details, callback) => {
        try {
            // Ignore normal website authentication.
            if (!details.isProxy) {
                callback({});
                return;
            }

            // Proxy must currently be enabled.
            if (!proxyState.enabled) {
                callback({});
                return;
            }

            // Check challenger exists.
            if (!details.challenger) {
                callback({});
                return;
            }

            // Only answer for our proxy.
            if (
                details.challenger.host !== proxyState.host ||
                Number(details.challenger.port) !== Number(proxyState.port)
            ) {
                callback({});
                return;
            }

            // Credentials must exist.
            if (!proxyState.username || !proxyState.password) {
                callback({});
                return;
            }

            /*
             * Prevent endless retries on bad credentials.
             */
            const attempts = authAttempts.get(details.requestId) || 0;

            if (attempts >= 2) {
                console.warn(
                    'Proxy authentication failed too many times:',
                    details.requestId
                );

                authAttempts.delete(details.requestId);
                callback({
                    cancel: true
                });

                return;
            }

            authAttempts.set(details.requestId, attempts + 1);

            callback({
                authCredentials: {
                    username: proxyState.username,
                    password: proxyState.password
                }
            });

        } catch (error) {
            console.error('onAuthRequired error:', error);

            callback({
                cancel: true
            });
        }
    },
    {
        urls: ['<all_urls>']
    },
    ['asyncBlocking']
);

/*
 * Request completed successfully.
 * Remove auth attempt counter.
 */
chrome.webRequest.onCompleted.addListener(
    (details) => {
        authAttempts.delete(details.requestId);
    },
    {
        urls: ['<all_urls>']
    }
);

/*
 * Request failed.
 * Remove auth attempt counter.
 */
chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
        authAttempts.delete(details.requestId);
    },
    {
        urls: ['<all_urls>']
    }
);

/*
 * Proxy-level errors.
 */
chrome.proxy.onProxyError.addListener((details) => {
    console.error('Proxy error:', details);
});

/*
 * Messages from popup.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message?.action === 'enable') {
        loadState()
            .then(() => enableProxy())
            .then(() => {
                sendResponse({
                    success: true
                });
            })
            .catch((error) => {
                console.error('Enable proxy error:', error);

                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }

    if (message?.action === 'disable') {
        disableProxy()
            .then(() => {
                sendResponse({
                    success: true
                });
            })
            .catch((error) => {
                console.error('Disable proxy error:', error);

                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }

    if (message?.action === 'getState') {
        loadState()
            .then(() => {
                sendResponse({
                    success: true,
                    state: {
                        enabled: proxyState.enabled,
                        host: proxyState.host,
                        port: proxyState.port,
                        username: proxyState.username
                    }
                });
            })
            .catch((error) => {
                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }
});
