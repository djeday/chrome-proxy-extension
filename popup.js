const PROXY_API_URL =
    'https://vpn.udfsoft.com/api/v1/proxy';

const PROXY_PAGE =
    'https://vpn.udfsoft.com/proxy';

const LOGIN_PAGE = 'https://auth.udfsoft.com/?from=' + encodeURIComponent(PROXY_PAGE);


/**
 * ---------------------------------------------------------
 * STATUS
 * ---------------------------------------------------------
 */

function setStatus(text) {
    $('#status').text(text);
}


/**
 * ---------------------------------------------------------
 * STORAGE
 * ---------------------------------------------------------
 */

async function saveFields(fields = null) {

    if (!fields) {
        fields = {
            host: $('#host').val().trim(),

            port:
                Number($('#port').val()) || 3128,

            username:
                $('#username').val().trim(),

            password:
                $('#password').val()
        };
    }

    await chrome.storage.local.set({
        host: fields.host || '',
        port: Number(fields.port) || 3128,
        username: fields.username || '',
        password: fields.password || ''
    });
}


async function loadFields() {

    const data =
        await chrome.storage.local.get([
            'host',
            'port',
            'username',
            'password',
            'enabled',
            'selectedProxyId'
        ]);

    $('#host').val(data.host || '');

    $('#port').val(data.port || 3128);

    $('#username').val(data.username || '');

    $('#password').val(data.password || '');

    updateToggle(
        Boolean(data.enabled)
    );

    if (data.enabled) {
        setStatus('🟢 Proxy connected');
    } else {
        setStatus('⚪ Proxy disconnected');
    }
}


/**
 * ---------------------------------------------------------
 * CONNECT / DISCONNECT BUTTON
 * ---------------------------------------------------------
 */

function updateToggle(enabled) {

    const $button =
        $('#toggleProxy');

    if (enabled) {

        $button
            .show()
            .text('Disconnect');

    } else {

        $button.hide();
    }
}


/**
 * ---------------------------------------------------------
 * LOAD PROXIES
 * ---------------------------------------------------------
 */

async function loadProxies() {

    try {

        const response =
            await fetch(PROXY_API_URL, {
                method: 'GET',
                credentials: 'include'
            });

        let data = null;

        try {

            data = await response.json();

        } catch (e) {

            // Invalid JSON.
        }

        if (response.status === 401) {

            showLoginButton('Please log in to view your proxies.');
            return;
        }


        if (!response.ok) {

            throw new Error(
                data?.message ||
                `HTTP ${response.status}`
            );
        }


        if (
            !Array.isArray(data) ||
            data.length === 0
        ) {
            showProxyLink(
                'No active proxies.'
            );

            return;
        }


        renderProxies(data);

    } catch (error) {

        console.error(
            'Failed to load proxies:',
            error
        );

        showProxyLink(
            error.message ||
            'Failed to load proxies.'
        );
    }
}


/**
 * ---------------------------------------------------------
 * GET PROXY / MORE PROXIES
 * ---------------------------------------------------------
 */

async function openProxyPage() {

    try {

        const tabs =
            await chrome.tabs.query({
                active: true,
                currentWindow: true
            });

        if (
            !tabs.length ||
            !tabs[0].id
        ) {
            return;
        }

        await chrome.tabs.update(
            tabs[0].id,
            {
                url: PROXY_PAGE
            }
        );

    } catch (error) {

        console.error(
            'Failed to open proxy page:',
            error
        );
    }
}


function showProxyLink(message) {

    $('#proxy-list').html(`
        <div class="message">

            <div>
                ${escapeHtml(message)}
            </div>

            <button
                type="button"
                id="getProxyButton"
                class="get-proxy-button"
            >
                Get Proxy
            </button>

        </div>
    `);


    $('#getProxyButton').on(
        'click',
        openProxyPage
    );
}


function showLoginButton(message) {
    $('#proxy-list').html(`
        <div class="message">
            <div>${escapeHtml(message)}</div>

            <button
                type="button"
                id="loginButton"
                class="get-proxy-button"
            >
                Login
            </button>
        </div>
    `);

    $('#loginButton').on('click', async function () {
        try {
            const tabs = await chrome.tabs.query({
                active: true,
                currentWindow: true
            });

            if (!tabs.length || !tabs[0].id) {
                return;
            }

            await chrome.tabs.update(tabs[0].id, {
                url: LOGIN_PAGE
            });

        } catch (error) {
            console.error('Failed to open login page:', error);
        }
    });
}

/**
 * ---------------------------------------------------------
 * RENDER PROXY LIST
 * ---------------------------------------------------------
 */

async function renderProxies(proxies) {

    const $list =
        $('#proxy-list');

    $list.empty();


    const storage =
        await chrome.storage.local.get([
            'selectedProxyId',
            'enabled'
        ]);


    const selectedProxyId =
        storage.selectedProxyId;


    const enabled =
        Boolean(storage.enabled);


    $.each(
        proxies,
        function (index, proxy) {

            const $item = $(`
                <div class="proxy-item" data-id="">
                    <img class="proxy-flag" alt="">
            
                    <div class="proxy-info">
                        <div class="proxy-country"></div>
                        <div class="proxy-ip"></div>
                    </div>
            
                    <span class="proxy-type"></span>
                </div>
            `);


            $item.attr('data-id', proxy.id);


            $item.find('.proxy-flag')
                .attr('src', proxy.iconUrl || '')
                .attr('alt', proxy.country || '');


            $item.find('.proxy-country')
                .text(proxy.country || '');


            $item.find('.proxy-ip')
                .text(proxy.ip || '');

            const isPremium =
                String(proxy.type || '').toLowerCase() === 'premium';

            $item.find('.proxy-type')
                .text(isPremium ? 'premium' : 'free')
                .addClass(isPremium ? 'premium' : 'free');

            if (enabled && String(selectedProxyId) === String(proxy.id)) {
                $item.addClass('active');
            }


            /*
             * Клик по прокси.
             */
            $item.on(
                'click',
                function () {
                    selectProxy(proxy, $item);
                }
            );


            $list.append($item);
        }
    );
}


/**
 * ---------------------------------------------------------
 * CLEAR CURRENT PROXY
 * ---------------------------------------------------------
 */

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


/**
 * ---------------------------------------------------------
 * DISABLE CURRENT PROXY
 * ---------------------------------------------------------
 */

async function resetCurrentProxy() {

    const data =
        await chrome.storage.local.get(
            'enabled'
        );


    if (data.enabled) {

        const result =
            await chrome.runtime.sendMessage({
                action: 'disable'
            });


        if (!result?.success) {

            throw new Error(
                result?.error ||
                'Failed to disable current proxy'
            );
        }
    }


    await clearProxyState();
}


/**
 * ---------------------------------------------------------
 * SELECT PROXY
 * ---------------------------------------------------------
 */

async function selectProxy(
    proxy,
    $item
) {

    try {
        $('.proxy-item').removeClass('active');

        $item.addClass('active');

        setStatus('Connecting...');

        await resetCurrentProxy();

        const response =
            await fetch(
                `${PROXY_API_URL}/${encodeURIComponent(proxy.id)}`,
                {
                    method: 'GET',
                    credentials: 'include'
                }
            );


        let data = null;

        try {

            data =
                await response.json();

        } catch (e) {

            // Invalid JSON.
        }


        if (!response.ok) {

            throw new Error(
                data?.message ||
                `HTTP ${response.status}`
            );
        }


        console.log('Proxy API response:', data);

        const fields = {

            host:
                data.host ??
                data.ip ??
                proxy.ip ??
                '',

            port:
                data.port ??
                3128,

            username:
                data.username ??
                data.userName ??
                '',

            password:
                data.password ??
                data.userPassword ??
                ''
        };

        if (!fields.host) {
            throw new Error(
                'Proxy host is empty'
            );
        }

        await saveFields(fields);

        await chrome.storage.local.set({
            selectedProxyId: proxy.id
        });


        const result =
            await chrome.runtime.sendMessage({
                action: 'enable'
            });


        if (!result?.success) {

            throw new Error(
                result?.error ||
                'Failed to enable proxy'
            );
        }


        await chrome.storage.local.set({
            enabled: true
        });


        updateToggle(true);


        const hasAuth =
            fields.username.trim() !== '' ||
            fields.password.trim() !== '';


        if (hasAuth) {
            setStatus(`🟢 Connected: ${proxy.country}`);
        } else {
            setStatus(`🟢 Connected: ${proxy.country} (Free)`);
        }

    } catch (error) {

        console.error(
            'Failed to select proxy:',
            error
        );

        $('.proxy-item').removeClass('active');

        await clearProxyState();

        setStatus(`❌ ${error.message}`);
    }
}


/**
 * ---------------------------------------------------------
 * DISCONNECT
 * ---------------------------------------------------------
 */

$('#toggleProxy').on(
    'click',
    async function () {

        try {
            setStatus('Disconnecting...');

            const result =
                await chrome.runtime.sendMessage({
                    action: 'disable'
                });

            if (!result?.success) {

                throw new Error(
                    result?.error ||
                    'Failed to disable proxy'
                );
            }


            await chrome.storage.local.set({
                enabled: false
            });

            updateToggle(false);

            $('.proxy-item')
                .removeClass('active');


            setStatus('⚪ Proxy disconnected');


        } catch (error) {

            console.error(
                'Disconnect error:',
                error
            );


            setStatus(`❌ ${error.message}`);
        }
    }
);


/**
 * ---------------------------------------------------------
 * SETTINGS BUTTON
 * ---------------------------------------------------------
 */

$('#settingsButton').on(
    'click',
    function () {
        $('#proxy-settings-form').slideToggle(150);
    }
);


/**
 * ---------------------------------------------------------
 * MORE PROXIES
 * ---------------------------------------------------------
 */

$('#moreProxy').on(
    'click',
    async function (event) {
        event.preventDefault();

        await openProxyPage();
    }
);


/**
 * ---------------------------------------------------------
 * ESCAPE HTML
 * ---------------------------------------------------------
 */

function escapeHtml(value) {

    const div =
        document.createElement('div');

    div.textContent = value ?? '';

    return div.innerHTML;
}


/**
 * ---------------------------------------------------------
 * INIT
 * ---------------------------------------------------------
 */

$(async function () {

    try {
        await loadFields();

        await loadProxies();
    } catch (error) {
        console.error(
            'Popup initialization error:',
            error
        );

        setStatus('❌ Initialization error');
    }
});

$('#connectManual').on(
    'click',
    async function () {

        try {

            const host =
                $('#host').val().trim();

            if (!host) {

                setStatus('Enter server');

                return;
            }

            const port = Number($('#port').val());

            if (!port || port < 1 || port > 65535) {
                setStatus('Enter valid port');

                return;
            }

            setStatus('Connecting...');

            const current =
                await chrome.storage.local.get(
                    'enabled'
                );

            if (current.enabled) {

                const disableResult =
                    await chrome.runtime.sendMessage({
                        action: 'disable'
                    });

                if (!disableResult?.success) {

                    throw new Error(
                        disableResult?.error ||
                        'Failed to disable current proxy'
                    );
                }
            }

            await saveFields();

            await chrome.storage.local.set({
                selectedProxyId: null
            });

            const result =
                await chrome.runtime.sendMessage({
                    action: 'enable'
                });

            if (!result?.success) {

                throw new Error(
                    result?.error ||
                    'Failed to enable proxy'
                );
            }

            await chrome.storage.local.set({
                enabled: true
            });

            $('.proxy-item')
                .removeClass('active');

            updateToggle(true);

            setStatus('🟢 Proxy connected');

        } catch (error) {
            console.error(
                'Manual connect error:',
                error
            );

            await clearProxyState();

            setStatus(`❌ ${error.message}`);
        }
    }
);
