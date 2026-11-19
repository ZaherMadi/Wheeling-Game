// The player's account (the nickname at the top right of the menu): protect
// the nickname with a password and an optional email. On any other device,
// the password is asked once before scores go to that nickname; the device
// is remembered then (a token kept here, see the API's accounts.py).
const DEVICES_KEY = 'wheelie_account_devices';
const keyOf = (nickname) => String(nickname || '').normalize('NFKC').trim().toLowerCase();

function readDevices() {
    try {
        const all = JSON.parse(localStorage.getItem(DEVICES_KEY) || '{}');
        return all && typeof all === 'object' ? all : {};
    } catch {
        return {};
    }
}

// This device's token for the nickname (undefined: none).
export function deviceToken(nickname) {
    return readDevices()[keyOf(nickname)] || undefined;
}

function storeToken(nickname, token) {
    const all = readDevices();
    if (token) all[keyOf(nickname)] = token;
    else delete all[keyOf(nickname)];
    try {
        localStorage.setItem(DEVICES_KEY, JSON.stringify(all));
    } catch {
        // Private browsing: the password will be asked again next time.
    }
}

// Server answers, said for the player.
async function problem(response) {
    const data = await response.json().catch(() => ({}));
    const detail = String(data.detail || '');
    if (response.status === 401) return 'Mot de passe incorrect.';
    if (response.status === 429) {
        const minutes = detail.match(/(\d+) min/)?.[1];
        return `Trop d’essais : réessaie dans ${minutes ? `${minutes} min` : 'quelques minutes'}.`;
    }
    if (response.status === 409) return 'Ce pseudo est déjà protégé.';
    if (response.status === 404) return /ranked run/i.test(detail)
        ? 'Termine d’abord une partie classée avec ce pseudo.' : 'Ce pseudo n’est pas protégé.';
    if (response.status === 422) return /email/i.test(detail)
        ? 'Adresse e-mail invalide.' : 'Le mot de passe doit faire de 6 à 64 caractères.';
    return 'Le serveur ne répond pas, réessaie dans un instant.';
}

function field({ name, label, type = 'password', autocomplete, placeholder = '', optional = false }) {
    const wrap = document.createElement('label');
    wrap.className = 'account-field';
    const text = document.createElement('span');
    text.textContent = label;
    if (optional) {
        const small = document.createElement('small');
        small.textContent = ' (facultatif)';
        text.append(small);
    }
    const input = document.createElement('input');
    input.name = name;
    input.type = type;
    input.placeholder = placeholder;
    input.autocomplete = autocomplete;
    input.spellcheck = false;
    input.autocapitalize = 'off';
    if (type === 'password') input.maxLength = 64;
    if (type === 'email') input.maxLength = 254;
    wrap.append(text, input);
    return wrap;
}

function actionButton(text, className = 'account-btn') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    return button;
}

// post(path, body) -> fetch Response; nickname() -> the player's nickname.
// stats(container): fills "Mes stats" (src/stats.js).
export function createAccount({ post, nickname, onStatus = () => {}, stats = null }) {
    let status = null;
    let pendingCode = null;
    // The nickname the password is asked for (not yet saved on a new device).
    let codeName = null;

    const dialog = document.createElement('div');
    dialog.id = 'account-dialog';
    dialog.className = 'account-dialog';
    dialog.hidden = true;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'account-title');
    dialog.innerHTML = '<div class="account-card"><button type="button" class="account-close" aria-label="Fermer">✕</button>' +
        '<h2 id="account-title">Mon compte</h2><p class="account-name"></p>' +
        '<button type="button" class="account-btn account-stats-btn">📊 MES STATS</button><div class="account-body"></div>' +
        '<p class="account-message" role="status" aria-live="polite"></p></div>';
    document.body.append(dialog);
    const body = dialog.querySelector('.account-body');
    const message = dialog.querySelector('.account-message');
    const say = (text, tone = '') => {
        message.textContent = text || '';
        message.dataset.tone = tone;
    };

    function close(result = false) {
        dialog.hidden = true;
        dialog.querySelector('.account-card')?.classList.remove('is-stats');
        codeName = null;
        if (pendingCode) {
            const resolve = pendingCode;
            pendingCode = null;
            resolve(result);
        }
    }
    dialog.querySelector('.account-close').addEventListener('click', () => close(false));
    // "Mes stats": in place of the account, with a way back. Not while a
    // password is being asked for a score.
    const statsButton = dialog.querySelector('.account-stats-btn');
    const title = dialog.querySelector('#account-title');
    const showStatsButton = (on) => {
        statsButton.hidden = !on || !stats;
        title.textContent = 'Mon compte';
        dialog.querySelector('.account-card')?.classList.remove('is-stats');
    };
    statsButton.addEventListener('click', () => {
        body.textContent = '';
        say('');
        statsButton.hidden = true;
        title.textContent = 'Mes stats';
        const cardEl = dialog.querySelector('.account-card');
        cardEl?.classList.add('is-stats');
        stats(body);
        const back = actionButton('← Mon compte', 'account-btn account-btn--quiet');
        back.addEventListener('click', () => open());
        body.append(back);
        if (cardEl) cardEl.scrollTop = 0;
    });
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) close(false);
    });
    dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') close(false);
        // Typing in the fields must not drive the bike behind.
        event.stopPropagation();
    });
    dialog.addEventListener('keyup', (event) => event.stopPropagation());

    async function call(path, payload) {
        try {
            const response = await post(path, payload);
            if (!response.ok) return { error: await problem(response), status: response.status };
            return { data: await response.json().catch(() => ({})) };
        } catch {
            return { error: 'Le serveur ne répond pas, réessaie dans un instant.' };
        }
    }

    async function refresh() {
        const name = nickname();
        if (!name) {
            status = null;
            onStatus(null);
            return null;
        }
        const { data } = await call('status', { nickname: name, device_token: deviceToken(name) });
        if (data) {
            // The server forgot this device (new password elsewhere): drop it.
            if (data.protected && !data.trusted && deviceToken(name)) storeToken(name, null);
            status = data;
            onStatus(data);
        }
        return data || null;
    }

    function form(fields, submitText, onSubmit, extra = []) {
        const element = document.createElement('form');
        element.className = 'account-form';
        element.noValidate = true;
        fields.forEach((item) => element.append(field(item)));
        const show = document.createElement('label');
        show.className = 'account-show';
        show.innerHTML = '<input type="checkbox"> Afficher le mot de passe';
        show.querySelector('input').addEventListener('change', (event) => {
            element.querySelectorAll('input[name*="password"]').forEach((input) => {
                input.type = event.target.checked ? 'text' : 'password';
            });
        });
        element.append(show);
        const submit = actionButton(submitText, 'account-btn account-btn--primary');
        submit.type = 'submit';
        element.append(submit, ...extra);
        element.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (submit.disabled) return;
            submit.disabled = true;
            const values = Object.fromEntries(new FormData(element).entries());
            try {
                await onSubmit(values);
            } finally {
                submit.disabled = false;
            }
        });
        return element;
    }

    function paragraph(text, className = 'account-text') {
        const p = document.createElement('p');
        p.className = className;
        p.textContent = text;
        return p;
    }

    function render(mode, { reason } = {}) {
        const name = codeName || nickname();
        dialog.querySelector('.account-name').textContent = name ? name : '';
        body.textContent = '';
        say('');
        if (mode === 'none') {
            body.append(paragraph('Termine une partie classée pour créer ton pseudo, puis reviens ici pour le protéger par un mot de passe.'));
            return;
        }
        if (mode === 'loading') {
            body.append(paragraph('Chargement…'));
            return;
        }
        if (mode === 'offline') {
            body.append(paragraph('Le serveur ne répond pas, réessaie dans un instant.'));
            return;
        }
        if (mode === 'protect') {
            body.append(paragraph('Ajoute un mot de passe : sur tout autre appareil, il sera demandé pour publier un score avec ton pseudo. Cet appareil-ci est reconnu.'));
            body.append(form([
                { name: 'email', label: 'E-mail', type: 'email', autocomplete: 'email', placeholder: 'toi@exemple.fr', optional: true },
                { name: 'password', label: 'Mot de passe (6 caractères minimum)', autocomplete: 'new-password' },
                { name: 'password_again', label: 'Encore une fois', autocomplete: 'new-password' }
            ], 'PROTÉGER MON PSEUDO', async ({ email, password, password_again: again }) => {
                if ((password || '').length < 6) return say('Le mot de passe doit faire au moins 6 caractères.', 'bad');
                if (password !== again) return say('Les deux mots de passe ne sont pas pareils.', 'bad');
                say('Enregistrement…');
                const { data, error } = await call('protect', { nickname: name, password, email: email || undefined });
                if (error) return say(error, 'bad');
                storeToken(name, data.device_token);
                status = { protected: true, trusted: true, email: data.email };
                onStatus(status);
                render('trusted');
                say('C’est fait : ton pseudo est protégé.', 'good');
            }));
            return;
        }
        if (mode === 'trusted') {
            body.append(paragraph('🔒 Ton pseudo est protégé. Cet appareil est reconnu : tes scores y sont publiés sans rien demander.'));
            body.append(paragraph(status?.email ? `E-mail : ${status.email}` : 'Aucun e-mail enregistré.', 'account-text account-text--muted'));
            const change = actionButton('Changer l’e-mail ou le mot de passe');
            const forget = actionButton('Oublier cet appareil', 'account-btn account-btn--quiet');
            change.addEventListener('click', () => {
                change.remove();
                forget.before(form([
                    { name: 'password', label: 'Mot de passe actuel', autocomplete: 'current-password' },
                    { name: 'email', label: 'Nouvel e-mail', type: 'email', autocomplete: 'email', placeholder: 'vide : inchangé', optional: true },
                    { name: 'new_password', label: 'Nouveau mot de passe', autocomplete: 'new-password', placeholder: 'vide : inchangé', optional: true }
                ], 'ENREGISTRER', async ({ password, email, new_password: next }) => {
                    if (next && next.length < 6) return say('Le nouveau mot de passe doit faire au moins 6 caractères.', 'bad');
                    say('Enregistrement…');
                    const { data, error } = await call('update', {
                        nickname: name, password, email: email || undefined, new_password: next || undefined
                    });
                    if (error) return say(error, 'bad');
                    if (data.device_token) storeToken(name, data.device_token);
                    status = { ...status, email: data.email };
                    render('trusted');
                    say(next ? 'Mot de passe changé : les autres appareils devront le redonner.' : 'C’est enregistré.', 'good');
                }));
            });
            forget.addEventListener('click', async () => {
                await call('forget', { nickname: name, device_token: deviceToken(name) });
                storeToken(name, null);
                status = { protected: true, trusted: false };
                onStatus(status);
                render('code');
            });
            body.append(change, forget);
            return;
        }
        // The password, from a device the account does not know yet.
        body.append(paragraph(reason || 'Ce pseudo est protégé. Entre son mot de passe pour publier tes scores depuis cet appareil (il sera reconnu ensuite).'));
        const cancel = pendingCode ? actionButton('Annuler', 'account-btn account-btn--quiet') : null;
        cancel?.addEventListener('click', () => close(false));
        body.append(form([{ name: 'password', label: 'Mot de passe', autocomplete: 'current-password' }],
            'VALIDER', async ({ password }) => {
                say('Vérification…');
                const { data, error } = await call('login', { nickname: name, password });
                if (error) return say(error, 'bad');
                storeToken(name, data.device_token);
                status = { protected: true, trusted: true };
                onStatus(status);
                say('C’est bon : cet appareil est reconnu.', 'good');
                if (pendingCode) setTimeout(() => close(true), 600);
                else {
                    await refresh();
                    render('trusted');
                }
            }, cancel ? [cancel] : []));
    }

    function focusFirst() {
        setTimeout(() => dialog.querySelector('input')?.focus(), 50);
    }

    async function open() {
        dialog.hidden = false;
        showStatsButton(true);
        if (!nickname()) return render('none');
        render('loading');
        const data = await refresh();
        if (!data) return render('offline');
        render(!data.protected ? 'protect' : data.trusted ? 'trusted' : 'code');
        focusFirst();
    }

    // The password for this device (a score to send, a nickname to use).
    // Resolves true once given, false if the player gives up.
    function askCode(reason, name = nickname()) {
        if (pendingCode) pendingCode(false);
        return new Promise((resolve) => {
            pendingCode = resolve;
            codeName = name;
            dialog.hidden = false;
            showStatsButton(false);
            render('code', { reason });
            focusFirst();
        });
    }

    return { open, askCode, refresh, close: () => close(false), get status() { return status; } };
}
