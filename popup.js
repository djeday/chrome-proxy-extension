const host = document.getElementById('host');
const port = document.getElementById('port');
const username = document.getElementById('username');
const password = document.getElementById('password');
const status = document.getElementById('status');

function setStatus(text) {
    status.textContent = text;
}

function saveFields() {
    return chrome.storage.local.set({
        host: host.value.trim(),
        port: Number(port.value) || 3128,
        username: username.value.trim(),
        password: password.value
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

    host.value = data.host || 'YOUR_SERVER_IP';
    port.value = data.port || 3128;
    username.value = data.username || 'proxyuser';
    password.value = data.password || '';

    setStatus(
        data.enabled
            ? '🟢 Прокси включён'
            : '⚪ Прокси выключен'
    );
}

document.getElementById('connect').addEventListener('click', async () => {
    try {
        if (!host.value.trim()) {
            setStatus('Введите сервер');
            return;
        }

        if (!port.value) {
            setStatus('Введите порт');
            return;
        }

        if (!username.value.trim()) {
            setStatus('Введите логин');
            return;
        }

        if (!password.value) {
            setStatus('Введите пароль');
            return;
        }

        setStatus('Подключение...');

        await saveFields();

        const result = await chrome.runtime.sendMessage({
            action: 'enable'
        });

        if (!result?.success) {
            throw new Error(
                result?.error || 'Не удалось включить proxy'
            );
        }

        setStatus('🟢 Прокси включён');

    } catch (error) {
        console.error(error);
        setStatus(`❌ ${error.message}`);
    }
});

document.getElementById('disconnect').addEventListener('click', async () => {
    try {
        setStatus('Отключение...');

        const result = await chrome.runtime.sendMessage({
            action: 'disable'
        });

        if (!result?.success) {
            throw new Error(
                result?.error || 'Не удалось отключить proxy'
            );
        }

        setStatus('⚪ Прокси выключен');

    } catch (error) {
        console.error(error);
        setStatus(`❌ ${error.message}`);
    }
});

loadFields().catch((error) => {
    console.error(error);
    setStatus('❌ Ошибка загрузки');
});
