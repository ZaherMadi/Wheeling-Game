// Full Boutique UI (#shop-screen), top-left start button (#shop-btn),
// #rider-screen visual character gallery (#rider-gallery), confirmation
// docks near the 3D showroom preview, API gifting/redeeming + unboxing FX.
import './shop.css';
import './shop-modern.css';
import { isModernUI, subscribeUITheme } from '../ui/theme.js';
import { modernIcon } from '../ui/modern-icons.js';
import {
    buy, canBuy, CATEGORIES, equip, equipped, gifted, grant,
    item, items, markGifted, owns, points, seen
} from './store.js';
import {
    applyCharacter, CHARACTERS, characterPortraitSvg, equipCharacter,
    equippedCharacterId, isCharacterOwned, previewCharacter, syncLoveCharacters
} from './characters.js';
import { applyEquippedOutfit, outfitLookFor, syncLegacyShopKeys } from './outfits.js';
import { realCarInfo } from '../v2/realcars.js';

const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString('fr-FR');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function carBadgeSvg(model, colourHex, secret) {
    const hex = secret ? '#252936' : `#${Number(colourHex || 0xf6c416).toString(16).padStart(6, '0')}`;
    const accent = secret ? '#475569' : '#f6c416';
    const label = secret ? '???' : (model || '').split('-').slice(-1)[0].toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 88">
      <rect width="128" height="88" rx="12" fill="#0d1018"/>
      <ellipse cx="64" cy="68" rx="46" ry="7" fill="rgba(0,0,0,0.6)"/>
      <path d="M18 52c3-9 10-15 22-17l13-11h24l14 11c11 2 18 7 19 17v7H18z" fill="${hex}" stroke="rgba(255,255,255,0.28)" stroke-width="1.6"/>
      <path d="M40 36l11-9h23l11 9z" fill="#0f172a" stroke="#7dd3fc" stroke-opacity="0.35"/>
      <circle cx="36" cy="59" r="9.5" fill="#11131a" stroke="${accent}" stroke-width="2.2"/>
      <circle cx="36" cy="59" r="4" fill="#64748b"/>
      <circle cx="92" cy="59" r="9.5" fill="#11131a" stroke="${accent}" stroke-width="2.2"/>
      <circle cx="92" cy="59" r="4" fill="#64748b"/>
      <text x="64" y="21" text-anchor="middle" fill="${secret ? '#94a3b8' : '#e2e8f0'}" font-family="system-ui,sans-serif" font-size="9" font-weight="800" letter-spacing="1.4">${label}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function mediaUrlFor(entry, colour) {
    if (!entry) return '';
    if (entry.category === 'characters') return characterPortraitSvg(entry.id);
    if (entry.category === 'cars') {
        const revealed = !entry.secret || seen(entry.id) || owns(entry.id);
        return carBadgeSvg(entry.preview?.model, colour ?? entry.preview?.colour, !revealed);
    }
    return entry.icon || entry.preview?.cover || entry.preview?.src || '';
}

const CATEGORY_ICONS = {
    characters: 'cat-characters',
    outfits: 'cat-outfits',
    cars: 'cat-cars',
    music: 'cat-music',
    extras: 'cat-extras'
};

export function installShop(deps) {
    const startBtn = document.getElementById('shop-btn');
    const shopScreen = document.getElementById('shop-screen');
    const startScreen = document.getElementById('start-screen');
    const riderScreen = document.getElementById('rider-screen');
    const riderOptions = document.getElementById('rider-options');
    const backFromRider = document.getElementById('back-from-rider');

    let activeCategory = 'characters';
    let activeFilter = 'all';
    let selectedId = 'characters:default';
    let selectedCarColour = null;
    let pendingConfirmId = null;
    let selectedRiderId = equippedCharacterId();
    let pendingRiderConfirmId = null;
    let giftSending = false;
    let returnScreen = startScreen;
    let stageView = 'spin';
    let stageZoom = false;

    // Build Gift / Code unboxing modal once.
    const giftOverlay = document.createElement('div');
    giftOverlay.id = 'shop-gift-fx';
    giftOverlay.className = 'shop-gift-fx';
    giftOverlay.innerHTML = '<div class="shop-gift-modal" role="dialog" aria-modal="true"></div>';
    document.body.append(giftOverlay);

    giftOverlay.addEventListener('click', (event) => {
        if (event.target === giftOverlay || event.target.closest('[data-gift-close]')) {
            giftOverlay.classList.remove('is-open');
            return;
        }
        const equipBtn = event.target.closest('[data-gift-equip]');
        if (equipBtn) {
            const id = equipBtn.dataset.giftEquip;
            equipOwnedItem(id);
            giftOverlay.classList.remove('is-open');
            return;
        }
        const copyBtn = event.target.closest('[data-gift-copy]');
        if (copyBtn) {
            const payload = copyBtn.dataset.giftCopy || '';
            navigator.clipboard?.writeText(payload).then(() => {
                copyBtn.textContent = '✓ Copié !';
            }).catch(() => {});
        }
    });

    function showGiftModal({ title, message, code, imageUrl, value, equipId, copyText }) {
        const box = giftOverlay.querySelector('.shop-gift-modal');
        box.innerHTML = `
          ${imageUrl ? `<div class="shop-gift-modal__art"><img src="${imageUrl}" alt=""></div>` : ''}
          <h3>${esc(title)}</h3>
          <p>${esc(message)}</p>
          ${value ? `<p><strong style="color:#f6c416">Valeur : ${fmt(value)} points</strong></p>` : ''}
          ${code ? `<div class="shop-gift-modal__code">${esc(code)}</div>` : ''}
          <div class="shop-dock__actions" style="justify-content:center; margin-top:8px;">
            ${copyText ? `<button type="button" class="shop-btn shop-btn--gold" data-gift-copy="${esc(copyText)}">📋 Copier le code</button>` : ''}
            ${equipId ? `<button type="button" class="shop-btn shop-btn--equip" data-gift-equip="${esc(equipId)}">✨ Équiper maintenant</button>` : ''}
            <button type="button" class="shop-btn shop-btn--ghost" data-gift-close="1">Fermer</button>
          </div>`;
        giftOverlay.classList.add('is-open');
    }

    function isItemOwned(id) {
        if (id?.startsWith('characters:')) return isCharacterOwned(id);
        return owns(id);
    }

    function isItemEquipped(entry) {
        if (!entry) return false;
        if (entry.category === 'characters') return equippedCharacterId() === entry.id;
        return !!entry.slot && equipped(entry.slot) === entry.id;
    }

    function equipOwnedItem(id) {
        const entry = item(id);
        if (!entry || !isItemOwned(id)) return false;
        const v2 = deps.v2?.();
        if (entry.category === 'characters') {
            equipCharacter(v2, id);
            applyEquippedOutfit(v2);
        } else if (entry.slot === 'outfit') {
            equip('outfit', equipped('outfit') === id ? null : id);
        } else if (entry.slot === 'music') {
            equip('music', id);
            deps.musicPlayer?.togglePreview?.(id);
        } else if (entry.slot) {
            equip(entry.slot, id);
        }
        renderShop();
        renderRiderGallery();
        return true;
    }

    function previewInShowroom(entry) {
        const v2 = deps.v2?.();
        if (!v2 || !entry) return;
        if (entry.category === 'characters') {
            previewCharacter(v2, entry.id);
            return;
        }
        if (entry.category === 'outfits') {
            v2.previewLook?.(outfitLookFor(entry.id));
            return;
        }
        if (entry.category === 'cars') {
            const revealed = !entry.secret || seen(entry.id) || isItemOwned(entry.id);
            if (!revealed) {
                v2.previewLook?.(null);
                return;
            }
            const info = realCarInfo(entry.preview?.model);
            const colour = selectedCarColour ?? info?.colours?.[0] ?? entry.preview?.colour ?? 0xf2f2f0;
            v2.previewCar?.(entry.preview.model, colour);
            return;
        }
        v2.previewLook?.(null);
    }

    function selectShopItem(id) {
        const entry = item(id);
        if (!entry) return;
        if (selectedId !== id) {
            pendingConfirmId = null;
            selectedCarColour = entry.category === 'cars' ? (realCarInfo(entry.preview?.model)?.colours?.[0] ?? null) : null;
        }
        selectedId = id;
        previewInShowroom(entry);
        renderShop();
    }

    // --- Top-left Start button ------------------------------------------------------
    function updateStartButton() {
        if (!startBtn) return;
        const pts = points();
        const hasBuyable = items().some((entry) => !entry.free && !isItemOwned(entry.id) && canBuy(entry.id));
        startBtn.classList.toggle('has-buyable', hasBuyable);
        if (isModernUI()) {
            startBtn.innerHTML = `<span class="shop-start-btn__dot" aria-hidden="true"></span>` +
                `${modernIcon('crown', 'shop-m-btn__crown')}<span>BOUTIQUE 51</span>` +
                `<span class="shop-start-btn__pts">${modernIcon('coin', 'shop-m-coin')}${fmt(pts)} pts</span>`;
            return;
        }
        startBtn.innerHTML = `<span class="shop-start-btn__dot" aria-hidden="true"></span><span>🛍️ BOUTIQUE</span><span class="shop-start-btn__pts">${fmt(pts)} pts</span>`;
    }

    function stageControlsHtml() {
        return `<div class="shop-stage-controls" id="shop-stage-controls" hidden>
          <button type="button" class="shop-stage-btn" data-stage-view="front">Face</button>
          <button type="button" class="shop-stage-btn" data-stage-view="back">Dos</button>
          <button type="button" class="shop-stage-btn is-on" data-stage-view="spin">360°</button>
          <button type="button" class="shop-stage-btn" data-stage-zoom="1">Zoom</button>
        </div>`;
    }

    // --- Shop DOM scaffolding (Classic + Modern) ------------------------------------
    function mountShopShell() {
        if (!shopScreen) return;
        const keepCode = document.getElementById('shop-code-input')?.value || '';
        const keepMsg = document.getElementById('shop-code-msg')?.textContent || '';
        if (isModernUI()) {
            shopScreen.innerHTML = `
              <header class="shop-m-topbar">
                <div class="shop-m-brand">
                  <div class="shop-m-brand__row">
                    ${modernIcon('crown', 'shop-m-brand__icon')}
                    <h2>BOUTIQUE <span>51</span></h2>
                  </div>
                  <p>Ton univers. Ton style. Ton garage.</p>
                </div>
                <div class="shop-m-topbar__right">
                  <div class="shop-m-wallet" id="shop-wallet">${modernIcon('coin')}<span>0 pts</span></div>
                  <button type="button" class="shop-m-close" id="shop-close-btn" aria-label="Fermer la boutique">${modernIcon('close')}</button>
                </div>
              </header>
              ${stageControlsHtml()}
              <aside class="shop-confirm-dock shop-m-dock" id="shop-confirm-dock"></aside>
              <section class="shop-panel shop-m-panel" id="shop-panel">
                <nav class="shop-m-tabs" id="shop-tabs" role="tablist"></nav>
                <div class="shop-m-subhead">
                  <span class="shop-m-subhead__title" id="shop-subhead-title">Personnages</span>
                  <select id="shop-filter" class="shop-m-filter" aria-label="Filtrer les articles">
                    <option value="all">Tous</option>
                    <option value="owned">Possédés</option>
                    <option value="available">Disponibles</option>
                    <option value="locked">Verrouillés</option>
                  </select>
                </div>
                <div class="shop-m-grid" id="shop-grid"></div>
                <form class="shop-m-code" id="shop-code-form" autocomplete="off">
                  <label class="shop-m-code__label" for="shop-code-input">${modernIcon('gift')}<span>Code boutique ou cadeau d’un ami</span></label>
                  <input id="shop-code-input" type="text" maxlength="24" placeholder="EX : 51-XXXX-XXXX" autocapitalize="characters" spellcheck="false">
                  <button type="submit" class="shop-m-code__submit">Valider ›</button>
                  <div class="shop-code-msg" id="shop-code-msg" aria-live="polite"></div>
                </form>
              </section>`;
            const filter = document.getElementById('shop-filter');
            if (filter) filter.value = activeFilter;
        } else {
            shopScreen.innerHTML = `
              <div class="shop-stage-hint">↔ Glisse pour tourner · Clique un article</div>
              ${stageControlsHtml()}
              <aside class="shop-confirm-dock" id="shop-confirm-dock"></aside>
              <section class="shop-panel" id="shop-panel">
                <header class="shop-panel__top">
                  <div class="shop-panel__brand">
                    <h2>BOUTIQUE 51</h2>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div class="shop-panel__wallet" id="shop-wallet">🪙 0 pts</div>
                    <button type="button" class="shop-btn shop-btn--ghost" id="shop-close-btn">✕ FERMER</button>
                  </div>
                </header>
                <nav class="shop-tabs" id="shop-tabs" role="tablist"></nav>
                <div class="shop-grid" id="shop-grid"></div>
                <form class="shop-code-box" id="shop-code-form" autocomplete="off">
                  <label for="shop-code-input">🎁 Code boutique ou cadeau d’un ami</label>
                  <input id="shop-code-input" type="text" maxlength="24" placeholder="EX : 51-XXXX-XXXX" autocapitalize="characters" spellcheck="false">
                  <button type="submit" class="shop-btn shop-btn--gold" style="flex:0 0 auto;min-width:105px;">Valider</button>
                  <div class="shop-code-msg" id="shop-code-msg" aria-live="polite"></div>
                </form>
              </section>`;
        }
        const inputEl = document.getElementById('shop-code-input');
        const msgEl = document.getElementById('shop-code-msg');
        if (inputEl && keepCode) inputEl.value = keepCode;
        if (msgEl && keepMsg) msgEl.textContent = keepMsg;
    }

    mountShopShell();
    shopScreen?.addEventListener('keydown', (event) => {
        if (event.target instanceof Element && event.target.id === 'shop-code-input') event.stopPropagation();
    });
    shopScreen?.addEventListener('change', (event) => {
        if (event.target instanceof HTMLSelectElement && event.target.id === 'shop-filter') {
            activeFilter = event.target.value || 'all';
            renderShop();
        }
    });
    shopScreen?.addEventListener('submit', (event) => {
        if (event.target instanceof HTMLFormElement && event.target.id === 'shop-code-form') {
            handleRedeemSubmit(event);
        }
    });

    async function handleGiftItem(entry) {
        if (!entry || !isItemOwned(entry.id) || entry.giftable === false || gifted(entry.id) || giftSending) return;
        const apiBase = deps.apiBase;
        const name = deps.nickname?.() || '';
        const dev = deps.deviceId?.() || '';
        if (!apiBase) return;
        giftSending = true;
        renderShopDock();

        const send = () => deps.apiFetch(`${apiBase}/shop/gift`, {
            method: 'POST',
            body: JSON.stringify({
                nickname: name,
                device_id: dev,
                device_token: deps.deviceToken?.() || '',
                item_id: entry.id,
                item_name: entry.name,
                value: entry.price
            })
        });

        try {
            let res = await send();
            if (res.status === 403) {
                const body = await res.json().catch(() => ({}));
                if (body?.account === 'code_required' && deps.askAccountCode) {
                    const ok = await deps.askAccountCode('use', name);
                    if (ok) res = await send();
                }
            }
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 409) {
                    markGifted(entry.id);
                    showGiftModal({
                        title: 'Déjà offert',
                        message: data?.detail || 'Tu as déjà offert cet article une fois.',
                        imageUrl: mediaUrlFor(entry)
                    });
                } else {
                    showGiftModal({
                        title: 'Impossible d’offrir',
                        message: data?.detail || 'Crée ou associe ton pseudo dans le classement avant d’offrir un cadeau.',
                        imageUrl: mediaUrlFor(entry)
                    });
                }
                return;
            }
            markGifted(entry.id);
            deps.stat?.('shopGifted');
            const copyText = `${data.message}\nCode : ${data.code}`;
            showGiftModal({
                title: '🎁 Cadeau prêt à offrir !',
                message: `${data.message} Donne ce code unique à ton ami pour qu’il le récupère dans sa Boutique.`,
                code: data.code,
                value: data.value || entry.price,
                imageUrl: mediaUrlFor(entry),
                copyText
            });
        } catch {
            showGiftModal({
                title: 'Hors ligne',
                message: 'Impossible de joindre le serveur pour générer le code cadeau.',
                imageUrl: mediaUrlFor(entry)
            });
        } finally {
            giftSending = false;
            renderShop();
        }
    }

    async function handleRedeemSubmit(event) {
        event.preventDefault();
        const codeInput = document.getElementById('shop-code-input');
        const codeMsg = document.getElementById('shop-code-msg');
        const raw = (codeInput?.value || '').trim().toUpperCase();
        if (!raw) return;
        const setMsg = (txt) => { if (codeMsg) codeMsg.textContent = txt; };

        // Local legacy shortcuts remain supported smoothly alongside API codes.
        if (raw === '5HC') {
            localStorage.setItem('wheelie_love_event', '1');
            grant('extras:love-event', 'code');
            deps.onLoveUnlock?.();
            codeInput.value = '';
            setMsg('Événement Love&Faith débloqué !');
            showGiftModal({
                title: '💖 Événement débloqué !',
                message: 'Le mode Love&Faith et son pass sont désormais disponibles.',
                imageUrl: '/event/love/logo-heart.png'
            });
            return;
        }
        if (raw === 'LOVE51' || raw === 'FAITH51') {
            const id = raw === 'FAITH51' ? 'characters:love-girl' : 'characters:love-boy';
            grant(id, 'code');
            equipOwnedItem(id);
            codeInput.value = '';
            const unlocked = item(id);
            setMsg(`${unlocked?.name || 'Perso'} débloqué !`);
            showGiftModal({
                title: '🎁 Perso débloqué !',
                message: `${unlocked?.name || 'Perso Love&Faith'} est maintenant dans ton garage.`,
                value: unlocked?.price,
                imageUrl: mediaUrlFor(unlocked),
                equipId: id
            });
            return;
        }

        if (!deps.apiBase || !deps.apiFetch) {
            setMsg('Serveur indisponible pour vérifier ce code.');
            return;
        }
        setMsg('Vérification du code…');
        try {
            const res = await deps.apiFetch(`${deps.apiBase}/shop/redeem`, {
                method: 'POST',
                body: JSON.stringify({
                    code: raw,
                    nickname: deps.nickname?.() || '',
                    device_id: deps.deviceId?.() || ''
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMsg(data?.detail || 'Code invalide ou déjà utilisé.');
                return;
            }
            const list = Array.isArray(data.items) ? data.items : [];
            let firstEntry = null;
            for (const id of list) {
                grant(id, 'code');
                if (!firstEntry) firstEntry = item(id);
            }
            codeInput.value = '';
            setMsg(data.message || 'Cadeau activé !');
            deps.stat?.('shopCodeUsed');
            renderShop();
            renderRiderGallery();
            showGiftModal({
                title: data.kind === 'gift' ? '🎁 Cadeau reçu !' : '🎉 Code boutique activé !',
                message: data.message || `${data.item_name || 'Article'} ajouté à ton compte.`,
                value: data.value || firstEntry?.price || 0,
                imageUrl: firstEntry ? mediaUrlFor(firstEntry) : '/logo-51wheling.webp',
                equipId: firstEntry?.slot ? firstEntry.id : ''
            });
        } catch {
            setMsg('Erreur réseau pendant la vérification du code.');
        }
    }

    function matchesFilter(entry) {
        if (activeFilter === 'all') return true;
        const owned = isItemOwned(entry.id);
        const revealed = !entry.secret || seen(entry.id) || owned;
        if (activeFilter === 'owned') return owned;
        if (activeFilter === 'available') return !owned && revealed && (!entry.available || entry.available());
        if (activeFilter === 'locked') return !owned && (!revealed || (entry.available && !entry.available()) || points() < entry.price);
        return true;
    }

    function renderShopDock() {
        const dock = document.getElementById('shop-confirm-dock');
        if (!dock) return;
        const entry = item(selectedId) || items(activeCategory)[0];
        if (!entry) {
            dock.innerHTML = '';
            return;
        }
        const owned = isItemOwned(entry.id);
        const eq = isItemEquipped(entry);
        const revealed = !entry.secret || seen(entry.id) || owned;
        const pts = points();
        const isCar = entry.category === 'cars';
        const carInfo = isCar ? realCarInfo(entry.preview?.model) : null;
        const isMusic = entry.category === 'music';
        const musicState = deps.musicPlayer?.state?.();
        const isPlayingThis = isMusic && musicState?.playing && musicState?.currentId === entry.id;

        const priceLabel = !revealed
            ? 'Prix caché'
            : entry.free
                ? 'Gratuit'
                : `${fmt(entry.price)} pts`;

        let swatchesHtml = '';
        if (isCar && revealed && carInfo?.colours?.length) {
            const activeColour = selectedCarColour ?? carInfo.colours[0];
            swatchesHtml = `<div class="shop-dock__swatches" aria-label="Couleurs disponibles">
              ${carInfo.colours.map((c) => {
                  const hex = `#${c.toString(16).padStart(6, '0')}`;
                  return `<button type="button" class="shop-dock__swatch ${activeColour === c ? 'is-on' : ''}" data-car-colour="${c}" style="background:${hex}" title="Couleur"></button>`;
              }).join('')}
            </div>`;
        }

        let musicBox = '';
        if (isMusic) {
            musicBox = `<div class="shop-music-preview">
              <img class="${isPlayingThis ? 'is-spinning' : ''}" src="${entry.preview.disc}" alt="">
              <div style="flex:1;min-width:0;">
                <strong style="display:block;font-size:12.5px;">${esc(entry.name)}</strong>
                <small style="color:#94a3b8;">${esc(entry.badge || 'Anasheed')} · Vinyle jouable en jeu & pause</small>
              </div>
              <button type="button" class="shop-btn shop-btn--music" data-shop-preview-music="${entry.id}">${isPlayingThis ? '⏸ Pause' : '▶ Écouter'}</button>
            </div>`;
        }

        let actionHtml = '';
        if (!revealed) {
            actionHtml = `<button type="button" class="shop-btn" disabled>🔍 Croise-la en mode libre</button>`;
        } else if (owned) {
            if (entry.slot) {
                actionHtml += `<button type="button" class="shop-btn shop-btn--equip" data-shop-equip="${entry.id}">${eq ? (entry.slot === 'outfit' ? '✓ Porté · Retirer' : '✓ Porté') : '✨ Porter / Équiper'}</button>`;
            } else {
                actionHtml += `<button type="button" class="shop-btn" disabled>✓ Débloqué</button>`;
            }
            if (entry.giftable !== false) {
                if (gifted(entry.id)) {
                    actionHtml += `<button type="button" class="shop-btn shop-btn--ghost" disabled>🎁 Offert (1/1)</button>`;
                } else {
                    actionHtml += `<button type="button" class="shop-btn shop-btn--gift" data-shop-gift="${entry.id}" ${giftSending ? 'disabled' : ''}>${giftSending ? 'Envoi…' : '🎁 Offrir'}</button>`;
                }
            }
        } else if (entry.available && !entry.available()) {
            actionHtml = `<button type="button" class="shop-btn" disabled>🔒 ${esc(entry.locked || 'Indisponible')}</button>`;
        } else if (pts < entry.price) {
            actionHtml = `<button type="button" class="shop-btn" disabled>Il manque ${fmt(entry.price - pts)} pts</button>`;
        } else if (pendingConfirmId === entry.id) {
            actionHtml = `
              <button type="button" class="shop-btn shop-btn--confirm" data-shop-confirm="${entry.id}">✓ Confirmer l’achat (−${fmt(entry.price)} pts)</button>
              <button type="button" class="shop-btn shop-btn--ghost" data-shop-cancel="1">✕</button>`;
        } else {
            actionHtml = `<button type="button" class="shop-btn shop-btn--gold" data-shop-arm="${entry.id}">✓ Valider & Acheter · ${fmt(entry.price)} pts</button>`;
        }

        dock.innerHTML = `
          <div class="shop-dock__head">
            <span class="shop-dock__badge">${esc(revealed ? (entry.badge || CATEGORIES.find((c) => c.id === entry.category)?.name || '') : 'Secret')}</span>
            <span class="shop-dock__price">${esc(priceLabel)}</span>
          </div>
          <h3 class="shop-dock__title">${esc(revealed ? entry.name : 'Véhicule inconnu (???)')}</h3>
          <p class="shop-dock__desc">${esc(revealed ? (entry.tagline || '') : 'Croise cette voiture garée ou en circulation dans le monde libre pour débloquer son prix et son aperçu 3D.')}</p>
          ${swatchesHtml}
          ${musicBox}
          <div class="shop-dock__actions">${actionHtml}</div>`;
    }

    function syncStageControls() {
        if (!shopScreen) return;
        const show = activeCategory === 'outfits' || activeCategory === 'characters';
        shopScreen.classList.toggle('is-studio', activeCategory === 'outfits');
        const box = document.getElementById('shop-stage-controls');
        if (!box) return;
        box.hidden = !show;
        box.querySelectorAll('[data-stage-view]').forEach((btn) => {
            btn.classList.toggle('is-on', btn.dataset.stageView === stageView);
        });
        const zoomBtn = box.querySelector('[data-stage-zoom]');
        if (zoomBtn) zoomBtn.classList.toggle('is-on', stageZoom);
    }

    function renderShop() {
        updateStartButton();
        if (!shopScreen?.classList.contains('active')) return;
        syncStageControls();
        const modern = isModernUI();
        const pts = points();
        const wallet = document.getElementById('shop-wallet');
        if (wallet) {
            if (modern) wallet.innerHTML = `${modernIcon('coin')}<span>${fmt(pts)} pts</span>`;
            else wallet.textContent = `🪙 ${fmt(pts)} pts`;
        }

        const tabs = document.getElementById('shop-tabs');
        if (tabs) {
            tabs.innerHTML = CATEGORIES.map((cat) => {
                const count = items(cat.id).filter((e) => isItemOwned(e.id)).length;
                const total = items(cat.id).length;
                if (modern) {
                    const iconName = CATEGORY_ICONS[cat.id] || 'cat-extras';
                    return `<button type="button" class="shop-m-tab ${cat.id === activeCategory ? 'is-active' : ''}" data-shop-tab="${cat.id}" role="tab" aria-selected="${cat.id === activeCategory}">
                      ${modernIcon(iconName, 'shop-m-tab__icon')}
                      <span class="shop-m-tab__text">
                        <span class="shop-m-tab__name">${esc(cat.name)}</span>
                        <span class="shop-m-tab__count">${count} / ${total}</span>
                      </span>
                    </button>`;
                }
                return `<button type="button" class="shop-tab ${cat.id === activeCategory ? 'is-active' : ''}" data-shop-tab="${cat.id}">
                  <span>${cat.icon}</span><span>${esc(cat.name)}</span><small>${count}/${total}</small>
                </button>`;
            }).join('');
        }

        const grid = document.getElementById('shop-grid');
        if (grid) {
            const list = items(activeCategory);
            if (!list.some((e) => e.id === selectedId) && list.length) {
                selectedId = list[0].id;
            }
            if (modern) {
                const catMeta = CATEGORIES.find((c) => c.id === activeCategory);
                const ownedCount = list.filter((e) => isItemOwned(e.id)).length;
                const subTitle = document.getElementById('shop-subhead-title');
                if (subTitle) {
                    const fullName = catMeta?.id === 'characters' ? 'Personnages' : (catMeta?.name || '');
                    subTitle.innerHTML = `${esc(fullName)} <small>(${ownedCount} / ${list.length})</small>`;
                }
                const filtered = list.filter(matchesFilter);
                grid.innerHTML = filtered.length ? filtered.map((entry, idx) => {
                    const owned = isItemOwned(entry.id);
                    const eq = isItemEquipped(entry);
                    const revealed = !entry.secret || seen(entry.id) || owned;
                    const selected = entry.id === selectedId;
                    const media = mediaUrlFor(entry);
                    const pill = !revealed
                        ? `${modernIcon('lock')}<span>Secret</span>`
                        : eq
                            ? `${modernIcon('check')}<span>Équipé</span>`
                            : owned
                                ? `${modernIcon('check')}<span>Possédé</span>`
                                : entry.free
                                    ? `${modernIcon('check')}<span>Gratuit</span>`
                                    : `${modernIcon('lock')}<span>Verrouillé</span>`;
                    const desc = !revealed
                        ? 'Croise ce modèle en mode libre pour révéler son prix.'
                        : (entry.tagline || '');
                    const foot = !revealed
                        ? `${modernIcon('lock')}<span>??? pts</span>`
                        : entry.free
                            ? '<span>Gratuit</span>'
                            : `${modernIcon('coin')}<span>${fmt(entry.price)} pts</span>`;
                    return `<button type="button" class="shop-m-card ${selected ? 'is-selected' : ''} ${owned ? 'is-owned' : 'is-unowned'} ${eq ? 'is-equipped' : ''} ${!revealed ? 'is-secret' : ''}" data-shop-select="${entry.id}" style="--i:${idx}">
                      <div class="shop-m-card__media">
                        ${!revealed ? '<span class="shop-card__secret-q">???</span>' : `<img class="${!owned && entry.category === 'characters' ? 'is-grayscale' : ''}" src="${media}" alt="">`}
                        <span class="shop-m-card__pill">${pill}</span>
                      </div>
                      <div class="shop-m-card__body">
                        <span class="shop-m-card__name">${esc(revealed ? entry.name : 'Modèle secret')}</span>
                        <p class="shop-m-card__desc">${esc(desc)}</p>
                      </div>
                      <div class="shop-m-card__foot ${entry.free ? 'is-free' : ''}">${foot}</div>
                    </button>`;
                }).join('') : '<div class="shop-m-empty">Aucun article ne correspond à ce filtre.</div>';
            } else {
                grid.innerHTML = list.map((entry, idx) => {
                    const owned = isItemOwned(entry.id);
                    const eq = isItemEquipped(entry);
                    const revealed = !entry.secret || seen(entry.id) || owned;
                    const selected = entry.id === selectedId;
                    const media = mediaUrlFor(entry);
                    const status = !revealed
                        ? 'Inconnu'
                        : eq
                            ? 'Porté'
                            : owned
                                ? 'À toi'
                                : entry.free
                                    ? 'Inclus'
                                    : 'Verrouillé';
                    const priceTxt = !revealed ? '??? pts' : entry.free ? 'Gratuit' : `${fmt(entry.price)} pts`;
                    return `<button type="button" class="shop-card ${selected ? 'is-selected' : ''} ${owned ? 'is-owned' : 'is-unowned'} ${eq ? 'is-equipped' : ''} ${!revealed ? 'is-secret' : ''}" data-shop-select="${entry.id}" style="--i:${idx}">
                      <div class="shop-card__media">
                        ${!revealed ? '<span class="shop-card__secret-q">???</span>' : `<img class="${!owned && entry.category === 'characters' ? 'is-grayscale' : ''}" src="${media}" alt="">`}
                      </div>
                      <div class="shop-card__name">${esc(revealed ? entry.name : 'Modèle secret')}</div>
                      <div class="shop-card__foot">
                        <span class="shop-card__price">${esc(priceTxt)}</span>
                        <span class="shop-card__status">${esc(status)}</span>
                      </div>
                    </button>`;
                }).join('');
            }
        }

        renderShopDock();
    }

    shopScreen?.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('#shop-close-btn')) {
            closeShop();
            return;
        }
        const stageViewBtn = target.closest('[data-stage-view]');
        if (stageViewBtn) {
            stageView = stageViewBtn.dataset.stageView;
            deps.v2?.()?.showroomPreset?.(stageView);
            syncStageControls();
            return;
        }
        const stageZoomBtn = target.closest('[data-stage-zoom]');
        if (stageZoomBtn) {
            stageZoom = !stageZoom;
            deps.v2?.()?.showroomPreset?.('zoom');
            syncStageControls();
            return;
        }
        const tab = target.closest('[data-shop-tab]');
        if (tab) {
            activeCategory = tab.dataset.shopTab;
            activeFilter = 'all';
            const filter = document.getElementById('shop-filter');
            if (filter) filter.value = 'all';
            pendingConfirmId = null;
            if (activeCategory === 'outfits') {
                if (stageView === 'spin') {
                    stageView = 'front';
                    deps.v2?.()?.showroomPreset?.('front');
                }
            } else if (stageZoom) {
                stageZoom = false;
                deps.v2?.()?.showroomPreset?.('reset-zoom');
            }
            const first = items(activeCategory)[0];
            if (first) selectShopItem(first.id);
            else renderShop();
            return;
        }
        const card = target.closest('[data-shop-select]');
        if (card) {
            selectShopItem(card.dataset.shopSelect);
            return;
        }
        const swatch = target.closest('[data-car-colour]');
        if (swatch) {
            selectedCarColour = Number(swatch.dataset.carColour);
            previewInShowroom(item(selectedId));
            renderShopDock();
            return;
        }
        const musicBtn = target.closest('[data-shop-preview-music]');
        if (musicBtn) {
            deps.musicPlayer?.togglePreview?.(musicBtn.dataset.shopPreviewMusic);
            renderShopDock();
            return;
        }
        const armBtn = target.closest('[data-shop-arm]');
        if (armBtn) {
            pendingConfirmId = armBtn.dataset.shopArm;
            renderShopDock();
            return;
        }
        if (target.closest('[data-shop-cancel]')) {
            pendingConfirmId = null;
            renderShopDock();
            return;
        }
        const confirmBtn = target.closest('[data-shop-confirm]');
        if (confirmBtn) {
            const id = confirmBtn.dataset.shopConfirm;
            if (buy(id)) {
                pendingConfirmId = null;
                equipOwnedItem(id);
                if (id === 'extras:free-tricks') deps.onFreeTricksUnlock?.();
                if (id === 'extras:love-event') deps.onLoveUnlock?.();
                const purchased = item(id);
                showGiftModal({
                    title: '✓ Article acheté !',
                    message: `${purchased?.name || 'Article'} vient d’être ajouté à ton compte.`,
                    value: purchased?.price,
                    imageUrl: mediaUrlFor(purchased, selectedCarColour)
                });
            }
            renderShop();
            return;
        }
        const equipBtn = target.closest('[data-shop-equip]');
        if (equipBtn) {
            equipOwnedItem(equipBtn.dataset.shopEquip);
            return;
        }
        const giftBtn = target.closest('[data-shop-gift]');
        if (giftBtn) {
            handleGiftItem(item(giftBtn.dataset.shopGift));
        }
    });

    function openShop(initialCategory = 'characters', backTarget = startScreen) {
        if (!shopScreen) return;
        returnScreen = backTarget || startScreen;
        activeCategory = initialCategory;
        activeFilter = 'all';
        stageView = activeCategory === 'outfits' ? 'front' : 'spin';
        stageZoom = false;
        const filter = document.getElementById('shop-filter');
        if (filter) filter.value = 'all';
        const list = items(activeCategory);
        const eqId = activeCategory === 'characters' ? equippedCharacterId() : list[0]?.id;
        selectedId = list.some((e) => e.id === eqId) ? eqId : (list[0]?.id || 'characters:default');
        pendingConfirmId = null;
        startScreen?.classList.remove('active');
        riderScreen?.classList.remove('active');
        shopScreen.classList.add('active');
        deps.v2?.()?.showroom(true, '#shop-screen .shop-panel');
        if (activeCategory === 'outfits') deps.v2?.()?.showroomPreset?.('front');
        previewInShowroom(item(selectedId));
        renderShop();
    }

    function closeShop() {
        deps.musicPlayer?.stopPreview?.();
        pendingConfirmId = null;
        stageView = 'spin';
        stageZoom = false;
        if (!shopScreen?.classList.contains('active')) return;
        shopScreen.classList.remove('active', 'is-studio');
        const v2 = deps.v2?.();
        v2?.showroom(false);
        applyCharacter(v2);
        applyEquippedOutfit(v2);
        if (returnScreen === riderScreen) {
            riderScreen.classList.add('active');
            v2?.showroom(true, '#rider-screen .rider-panel');
            onRiderOpen();
        } else {
            startScreen?.classList.add('active');
        }
    }

    startBtn?.addEventListener('click', () => openShop('characters', startScreen));

    // --- #rider-screen visual character gallery + confirmation dock ---------------
    let galleryWrap = null;
    let riderStageDock = null;

    function ensureRiderDom() {
        if (!riderOptions || galleryWrap) return;
        galleryWrap = document.createElement('div');
        galleryWrap.className = 'rider-gallery-wrap';
        galleryWrap.id = 'rider-gallery-wrap';
        galleryWrap.innerHTML = `
          <div class="rider-gallery-head">
            <span>Personnages</span>
            <button type="button" class="shop-btn shop-btn--ghost" id="rider-open-shop" style="padding:4px 9px;font-size:10.5px;">🛍️ Ouvrir la Boutique</button>
          </div>
          <div class="rider-gallery" id="rider-gallery"></div>
          <div class="rider-livery-label">Personnalisation moto & livrée</div>`;
        riderOptions.before(galleryWrap);

        riderStageDock = document.createElement('aside');
        riderStageDock.className = 'rider-stage-dock';
        riderStageDock.id = 'rider-stage-dock';
        riderScreen.append(riderStageDock);

        galleryWrap.addEventListener('click', (event) => {
            if (event.target.closest('#rider-open-shop')) {
                openShop('characters', riderScreen);
                return;
            }
            const card = event.target.closest('[data-rider-char]');
            if (!card) return;
            selectedRiderId = card.dataset.riderChar;
            pendingRiderConfirmId = null;
            previewCharacter(deps.v2?.(), selectedRiderId);
            renderRiderGallery();
        });

        riderStageDock.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return;
            const armBtn = target.closest('[data-rider-arm]');
            if (armBtn) {
                pendingRiderConfirmId = armBtn.dataset.riderArm;
                renderRiderDock();
                return;
            }
            if (target.closest('[data-rider-cancel]')) {
                pendingRiderConfirmId = null;
                renderRiderDock();
                return;
            }
            const confirmBtn = target.closest('[data-rider-confirm]');
            if (confirmBtn) {
                const id = confirmBtn.dataset.riderConfirm;
                if (buy(id)) {
                    pendingRiderConfirmId = null;
                    equipCharacter(deps.v2?.(), id);
                    applyEquippedOutfit(deps.v2?.());
                }
                renderRiderGallery();
                return;
            }
            const equipBtn = target.closest('[data-rider-equip]');
            if (equipBtn) {
                equipCharacter(deps.v2?.(), equipBtn.dataset.riderEquip);
                applyEquippedOutfit(deps.v2?.());
                renderRiderGallery();
                return;
            }
            if (target.closest('[data-rider-shop]')) {
                openShop('characters', riderScreen);
            }
        });
    }

    function renderRiderDock() {
        if (!riderStageDock) return;
        const char = CHARACTERS.find((c) => c.id === selectedRiderId) || CHARACTERS[0];
        const owned = isCharacterOwned(char.id);
        const eq = equippedCharacterId() === char.id;
        const pts = points();
        const priceLabel = char.free ? 'Gratuit' : `${fmt(char.price)} pts`;

        let action = '';
        if (owned) {
            action = `<button type="button" class="shop-btn shop-btn--equip" data-rider-equip="${char.id}">${eq ? '✓ Personnage équipé' : '✨ Valider & Porter ce perso'}</button>`;
        } else if (pts < char.price) {
            action = `<button type="button" class="shop-btn" disabled>Il manque ${fmt(char.price - pts)} pts</button>`;
        } else if (pendingRiderConfirmId === char.id) {
            action = `
              <button type="button" class="shop-btn shop-btn--confirm" data-rider-confirm="${char.id}">✓ Confirmer (−${fmt(char.price)} pts)</button>
              <button type="button" class="shop-btn shop-btn--ghost" data-rider-cancel="1">✕</button>`;
        } else {
            action = `<button type="button" class="shop-btn shop-btn--gold" data-rider-arm="${char.id}">✓ Valider & Acheter · ${fmt(char.price)} pts</button>`;
        }

        riderStageDock.innerHTML = `
          <div class="shop-dock__head">
            <span class="shop-dock__badge">${esc(char.badge || 'Perso')}</span>
            <span class="shop-dock__price">${esc(priceLabel)}</span>
          </div>
          <h3 class="shop-dock__title">${esc(char.name)}</h3>
          <p class="shop-dock__desc">${esc(char.tagline)}</p>
          <div class="shop-dock__actions">
            ${action}
            <button type="button" class="shop-btn shop-btn--ghost" data-rider-shop="1">🛍️ Boutique</button>
          </div>`;
    }

    function renderRiderGallery() {
        ensureRiderDom();
        const grid = document.getElementById('rider-gallery');
        if (!grid) return;
        const eqId = equippedCharacterId();
        grid.innerHTML = CHARACTERS.map((char) => {
            const owned = isCharacterOwned(char.id);
            const selected = char.id === selectedRiderId;
            const eq = char.id === eqId;
            const price = char.free ? 'Gratuit' : owned ? (eq ? 'Porté' : 'À toi') : `${fmt(char.price)} pts`;
            return `<button type="button" class="rider-char-card ${selected ? 'is-selected' : ''} ${owned ? 'is-owned' : 'is-unowned'} ${eq ? 'is-equipped' : ''}" data-rider-char="${char.id}">
              <img src="${characterPortraitSvg(char.id)}" alt="">
              <span class="rider-char-card__name">${esc(char.name)}</span>
              <span class="rider-char-card__price">${esc(price)}</span>
            </button>`;
        }).join('');
        renderRiderDock();
    }

    function onRiderOpen() {
        selectedRiderId = equippedCharacterId();
        pendingRiderConfirmId = null;
        renderRiderGallery();
        previewCharacter(deps.v2?.(), selectedRiderId);
    }

    backFromRider?.addEventListener('click', () => {
        pendingRiderConfirmId = null;
        const v2 = deps.v2?.();
        v2?.previewLook?.(null);
        applyCharacter(v2);
        applyEquippedOutfit(v2);
    });

    // Global state sync listeners.
    const refreshAll = () => {
        updateStartButton();
        renderShop();
        renderRiderGallery();
    };
    document.addEventListener('wheelie:shop', refreshAll);
    document.addEventListener('wheelie:points', refreshAll);
    document.addEventListener('wheelie:love-sync', () => {
        syncLoveCharacters();
        syncLegacyShopKeys();
        const v2 = deps.v2?.();
        applyCharacter(v2);
        applyEquippedOutfit(v2);
        refreshAll();
    });
    deps.musicPlayer?.subscribe?.(() => renderShopDock());
    subscribeUITheme(() => {
        mountShopShell();
        refreshAll();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (giftOverlay.classList.contains('is-open')) {
            giftOverlay.classList.remove('is-open');
            event.stopPropagation();
        } else if (shopScreen?.classList.contains('active')) {
            closeShop();
            event.stopPropagation();
        }
    });

    updateStartButton();

    return {
        open: openShop,
        close: closeShop,
        onRiderOpen,
        refresh: refreshAll,
        isOpen: () => !!shopScreen?.classList.contains('active')
    };
}
