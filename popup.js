const PROXY_API_URL = 'https://vpn.udfsoft.com/api/v1/proxy';
const PROXY_PAGE = 'https://vpn.udfsoft.com/proxy';

function setStatus(text) {
    $('#status').text(text);
}

function saveFields() {
    return chrome.storage.local.set({
        host: $('#host').val().trim(),
        port: Number($('#port').val()) || 3128,
        username: $('#username').val().trim(),
        password: $('#password').val()
    });
}

async function loadFields() {
    const data = await chrome.storage.local.get([
        'host',
        'port',
        'username',
        'password',
        'enabled'
    ]);

    $('#host').val(data.host || '');
    $('#port').val(data.port || 3128);
    $('#username').val(data.username || '');
    $('#password').val(data.password || '');

    updateToggle(!!data.enabled);
}

function updateToggle(enabled) {
    const $button = $('#toggleProxy');

    $button
        .toggleClass('enabled', enabled)
        .toggleClass('disabled', !enabled)
        .text(enabled ? 'Disable' : 'Enable');

    setStatus(
        enabled
            ? '🟢 Proxy enabled'
            : '⚪ Proxy disabled'
    );
}

async function loadProxies() {
    try {
        const response = await fetch(PROXY_API_URL, {
            method: 'GET',
            credentials: 'include'
        });

        let data = null;

        try {
            data = await response.json();
        } catch (e) {
            // Ignore invalid JSON
        }

        if (response.status === 401) {
            showProxyLink('No active proxies.');
            return;
        }

        if (!response.ok) {
            throw new Error(
                data?.message || `HTTP ${response.status}`
            );
        }

        if (!Array.isArray(data) || data.length === 0) {
            showProxyLink('No active proxies.');
            return;
        }

        renderProxies(data);

    } catch (error) {
        console.error('Failed to load proxies:', error);

        showProxyLink(
            error.message || 'Failed to load proxies.'
        );
    }
}

function showProxyLink(message) {
    $('#proxy-list').html(`
        <div class="message">
            <div>${escapeHtml(message)}</div>

            <button
                type="button"
                id="getProxyButton"
                class="get-proxy-button"
            >
                Get Proxy
            </button>
        </div>
    `);

    $('#getProxyButton').on('click', async function () {
        try {
            const tabs = await chrome.tabs.query({
                active: true,
                currentWindow: true
            });

            if (!tabs.length || !tabs[0].id) {
                return;
            }

            await chrome.tabs.update(tabs[0].id, {
                url: PROXY_PAGE
            });

        } catch (error) {
            console.error('Failed to open proxy page:', error);
        }
    });
}

function renderProxies(proxies) {
    const $list = $('#proxy-list');

    $list.empty();

    $.each(proxies, function (index, proxy) {
        const $item = $(`
            <div class="proxy-item" data-id="">
                <img class="proxy-flag" alt="">
                <div class="proxy-info">
                    <div class="proxy-country"></div>
                    <div class="proxy-host"></div>
                    <div class="proxy-ip"></div>
                </div>
            </div>
        `);

        $item.attr('data-id', proxy.id);

        $item.find('.proxy-flag')
            .attr('src', proxy.iconUrl || '')
            .attr('alt', proxy.country || '');

        $item.find('.proxy-country')
            .text(proxy.country || '');

        $item.find('.proxy-host')
            .text(proxy.hostName || '');

        $item.find('.proxy-ip')
            .text(proxy.ip || '');

        $item.on('click', function () {
            selectProxy(proxy, $item);
        });

        $list.append($item);
    });
}

async function clearProxyState() {
    await chrome.storage.local.set({
        host: '',
        port: 3128,
        username: '',
        password: '',
        enabled: false
    });

    $('#host').val('');
    $('#port').val(3128);
    $('#username').val('');
    $('#password').val('');

    updateToggle(false);
}

async function resetCurrentProxy() {
    const data = await chrome.storage.local.get('enabled');

    if (data.enabled) {
        const result = await chrome.runtime.sendMessage({
            action: 'disable'
        });

        if (!result?.success) {
            throw new Error(
                result?.error || 'Failed to disable current proxy'
            );
        }
    }

    await clearProxyState();
}

async function selectProxy(proxy, $item) {
    try {
        $('.proxy-item').removeClass('active');
        $item.addClass('active');

        setStatus('Switching proxy...');

        /*
         * Always disable current proxy and remove old data first.
         */
        await resetCurrentProxy();

        /*
         * Get actual proxy credentials/settings.
         */
        const response = await fetch(
            `${PROXY_API_URL}/${encodeURIComponent(proxy.id)}`,
            {
                method: 'GET',
                credentials: 'include'
            }
        );

        let data = null;

        try {
            data = await response.json();
        } catch (e) {
            // Ignore invalid JSON
        }

        if (!response.ok) {
            throw new Error(
                data?.message || `HTTP ${response.status}`
            );
        }

        console.log('Proxy API response:', data);

        $('#host').val(
            data.host ??
            data.ip ??
            proxy.ip ??
            ''
        );

        $('#port').val(
            data.port ?? 3128
        );

        $('#username').val(
            data.username ??
            data.userName ??
            ''
        );

        $('#password').val(
            data.password ??
            data.userPassword ??
            ''
        );

        await saveFields();

        const hasAuth =
            $('#username').val().trim() !== '' ||
            $('#password').val().trim() !== '';

        setStatus(
            hasAuth
                ? `Selected: ${proxy.country}`
                : `Selected: ${proxy.country} (Free)`
        );

    } catch (error) {
        console.error('Failed to select proxy:', error);
        
        $('.proxy-item').removeClass('active');

        await clearProxyState();

        setStatus(`❌ ${error.message}`);
    }
}

$('#toggleProxy').on('click', async function () {
    try {
        const data = await chrome.storage.local.get('enabled');
        const enabled = !!data.enabled;

        /*
         * Disable
         */
        if (enabled) {
            setStatus('Disabling...');

            const result = await chrome.runtime.sendMessage({
                action: 'disable'
            });

            if (!result?.success) {
                throw new Error(
                    result?.error || 'Failed to disable proxy'
                );
            }

            await chrome.storage.local.set({
                enabled: false
            });

            updateToggle(false);

            return;
        }
        
        if (!$('#host').val().trim()) {
            setStatus('Enter server');
            return;
        }

        const port = Number($('#port').val());

        if (!port || port < 1 || port > 65535) {
            setStatus('Enter valid port');
            return;
        }

        setStatus('Enabling...');

        await saveFields();

        const result = await chrome.runtime.sendMessage({
            action: 'enable'
        });

        if (!result?.success) {
            throw new Error(
                result?.error || 'Failed to enable proxy'
            );
        }

        await chrome.storage.local.set({
            enabled: true
        });

        updateToggle(true);

    } catch (error) {
        console.error(error);

        await clearProxyState();

        setStatus(`❌ ${error.message}`);
    }
});

$('#moreProxy').on('click', async function (event) {
    event.preventDefault();

    try {
        const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        if (!tabs.length || !tabs[0].id) {
            return;
        }

        await chrome.tabs.update(tabs[0].id, {
            url: PROXY_PAGE
        });

    } catch (error) {
        console.error('Failed to open proxy page:', error);
    }
});

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
}

$(async function () {
    try {
        await loadFields();
        await loadProxies();
    } catch (error) {
        console.error('Popup initialization error:', error);
        setStatus('❌ Initialization error');
    }
});
