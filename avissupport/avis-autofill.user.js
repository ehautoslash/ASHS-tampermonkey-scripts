// ==UserScript==
// @name         Avis Support Autofill
// @namespace    https://github.com/ehautoslash/ASHS-tampermonkey-scripts
// @version      1.0.1
// @description  Autofill Avis customer support form at avis.us.abgcustomerservice.com/createTicket
// @author       Eric House
// @match        https://avis.us.abgcustomerservice.com/createTicket
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      abglac.com
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/ehautoslash/ASHS-tampermonkey-scripts/main/avissupport/avis-autofill.meta.js
// @downloadURL  https://raw.githubusercontent.com/ehautoslash/ASHS-tampermonkey-scripts/main/avissupport/avis-autofill.user.js
// ==/UserScript==

(function () {
  'use strict';

  const DEBUG = true;

  const FIELDS = [
    { label: 'Type of issue', value: 'Billing', exact: true },
    { label: 'Issue', value: 'Rates', exact: true },
    { label: 'Rental Identifier', value: 'Confirmation number', exact: true }
  ];

  const SUBJECT_TEXT = 'Reservation rate not honored';
  const RECEIPT_URL = 'https://www.avis.com/en/reservation/ereceipt';

  function log(...args) {
    if (DEBUG) console.log('[Avis Autofill]', ...args);
  }

  function normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function fireMouse(el, type) {
    try {
      el.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true
      }));
    } catch (e) {
      const evt = document.createEvent('MouseEvents');
      evt.initMouseEvent(type, true, true, window, 1, 0, 0, 0, 0,
        false, false, false, false, 0, null);
      el.dispatchEvent(evt);
    }
  }

  async function copyText(text) {
    const value = String(text || '');
    if (!value) return false;

    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (err) {
      const temp = document.createElement('textarea');
      temp.value = value;
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      temp.style.pointerEvents = 'none';
      document.body.appendChild(temp);
      temp.focus();
      temp.select();

      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }

      document.body.removeChild(temp);
      return ok;
    }
  }

  function setCopyButtonState(button, success) {
    if (!button) return;
    const original = button.dataset.originalText || 'Copy';
    button.textContent = success ? 'Copied!' : 'Copy';
    setTimeout(() => {
      button.textContent = original;
    }, 900);
  }

  function setNativeValue(element, value) {
    if (!element) return;

    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }

    fire(element, 'input');
    fire(element, 'change');
    fire(element, 'blur');
  }

  function getLabelElements(root = document) {
    return Array.from(root.querySelectorAll('label, span, div, p'));
  }

  function looksLikeLabel(el, wantedText) {
    const text = normalize(el.textContent);
    const wanted = normalize(wantedText);
    return text === wanted || text.includes(wanted);
  }

  function findFieldNearLabel(labelText, root = document) {
    const candidates = getLabelElements(root).filter(el => looksLikeLabel(el, labelText));

    for (const label of candidates) {
      if (label.tagName === 'LABEL') {
        const forId = label.getAttribute('for');
        if (forId) {
          const linked = root.getElementById ? root.getElementById(forId) : document.getElementById(forId);
          if (linked) return linked;
        }
      }

      const nested = label.querySelector('select, input, textarea, [role="combobox"], [aria-haspopup="listbox"]');
      if (nested) return nested;

      let node = label.parentElement;
      for (let i = 0; i < 4 && node; i++, node = node.parentElement) {
        const nearby = node.querySelector('select, input, textarea, [role="combobox"], [aria-haspopup="listbox"]');
        if (nearby) return nearby;
      }

      let sib = label.nextElementSibling;
      let hops = 0;
      while (sib && hops < 5) {
        const found = sib.matches?.('select, input, textarea, [role="combobox"], [aria-haspopup="listbox"]')
          ? sib
          : sib.querySelector?.('select, input, textarea, [role="combobox"], [aria-haspopup="listbox"]');
        if (found) return found;
        sib = sib.nextElementSibling;
        hops++;
      }
    }

    return null;
  }

  function findOptionInOpenDropdown(text, exactMatch = false) {
    const wanted = normalize(text);

    const optionSelectors = [
      '[role="option"]',
      '[role="listbox"] [aria-selected]',
      'li',
      '.select-option',
      '.dropdown-item',
      '.menu-item',
      '.option'
    ];

    const options = Array.from(document.querySelectorAll(optionSelectors.join(',')));

    if (exactMatch) {
      return options.find(opt => normalize(opt.textContent) === wanted) || null;
    }

    return options.find(opt => {
      const t = normalize(opt.textContent);
      return t === wanted || t.includes(wanted);
    }) || null;
  }

  async function setRealSelect(field, wantedText, exactMatch = false) {
    if (!field || field.tagName !== 'SELECT') return false;

    const wanted = normalize(wantedText);
    const options = Array.from(field.options);

    let match = null;

    if (exactMatch) {
      match = options.find(opt => normalize(opt.textContent) === wanted) || null;
    } else {
      match =
        options.find(opt => normalize(opt.textContent) === wanted) ||
        options.find(opt => normalize(opt.textContent).includes(wanted)) ||
        null;
    }

    if (!match) return false;

    field.value = match.value;
    fire(field, 'input');
    fire(field, 'change');
    fire(field, 'blur');
    return true;
  }

  async function setInputLikeDropdown(field, wantedText, exactMatch = false) {
    if (!field) return false;

    fireMouse(field, 'mousedown');
    fireMouse(field, 'mouseup');
    fireMouse(field, 'click');
    field.focus();

    await sleep(300);

    if (field.matches('input, textarea, [role="combobox"]')) {
      setNativeValue(field, wantedText);
      await sleep(250);
    }

    let option = findOptionInOpenDropdown(wantedText, exactMatch);

    if (!option) {
      await sleep(400);
      option = findOptionInOpenDropdown(wantedText, exactMatch);
    }

    if (option) {
      option.scrollIntoView({ block: 'nearest' });
      fireMouse(option, 'mousedown');
      fireMouse(option, 'mouseup');
      fireMouse(option, 'click');
      return true;
    }

    return false;
  }

  async function setFieldByLabel(labelText, wantedText, exactMatch = false) {
    const field = findFieldNearLabel(labelText);
    if (!field) return false;

    if (field.tagName === 'SELECT') {
      return await setRealSelect(field, wantedText, exactMatch);
    }

    return await setInputLikeDropdown(field, wantedText, exactMatch);
  }

  function findSubjectField() {
    return (
      document.querySelector('input[name="subject"]') ||
      findFieldNearLabel('Subject')
    );
  }

  function findDescriptionField() {
    return (
      document.querySelector('textarea[name="description"]') ||
      document.querySelector('textarea') ||
      findFieldNearLabel('Description')
    );
  }

  function findConfirmationInputField() {
    const candidates = Array.from(document.querySelectorAll('input[type="text"], input:not([type]), textarea'));

    for (const el of candidates) {
      const placeholder = normalize(el.getAttribute('placeholder') || '');
      const ariaLabel = normalize(el.getAttribute('aria-label') || '');
      const name = normalize(el.getAttribute('name') || '');
      const id = normalize(el.getAttribute('id') || '');
      const value = normalize(el.value || '');

      const nearbyText = normalize(
        (el.parentElement?.textContent || '') +
        ' ' +
        (el.closest('div, section, form')?.textContent || '')
      );

      if (
        placeholder.includes('confirmation number') ||
        ariaLabel.includes('confirmation number') ||
        name.includes('confirmation') ||
        id.includes('confirmation') ||
        nearbyText.includes('confirmation number')
      ) {
        if (value === 'confirmation number') continue;
        return el;
      }
    }

    return null;
  }

  async function waitForConfirmationInput(timeoutMs = 4000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const field = findConfirmationInputField();
      if (field) return field;
      await sleep(100);
    }

    return null;
  }

  async function fillRevealedConfirmationField(confirmationNumber) {
    if (!confirmationNumber) return false;

    const field = await waitForConfirmationInput();
    if (!field) {
      log('Revealed confirmation input field not found');
      return false;
    }

    field.focus();
    setNativeValue(field, confirmationNumber);

    await sleep(120);

    if ((field.value || '').trim() !== confirmationNumber) {
      field.value = confirmationNumber;
      fire(field, 'input');
      fire(field, 'change');
      fire(field, 'blur');
    }

    return true;
  }

  async function setSubjectField() {
    const field = findSubjectField();
    if (!field) return false;

    field.focus();
    setNativeValue(field, SUBJECT_TEXT);

    await sleep(100);

    if (field.value !== SUBJECT_TEXT) {
      field.value = SUBJECT_TEXT;
      fire(field, 'input');
      fire(field, 'change');
      fire(field, 'blur');
    }

    return true;
  }

  async function setDescriptionField(text) {
    const field = findDescriptionField();
    if (!field) return false;

    field.focus();
    setNativeValue(field, text);

    await sleep(100);

    if (field.value !== text) {
      field.value = text;
      fire(field, 'input');
      fire(field, 'change');
      fire(field, 'blur');
    }

    return true;
  }

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        onload(response) {
          resolve(response);
        },
        onerror(error) {
          reject(error);
        },
        ontimeout(error) {
          reject(error);
        }
      });
    });
  }

  function tryParseJson(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function findDeepValue(obj, keyList) {
    const wanted = keyList.map(normalize);

    function walk(value) {
      if (!value || typeof value !== 'object') return null;

      if (Array.isArray(value)) {
        for (const item of value) {
          const found = walk(item);
          if (found != null) return found;
        }
        return null;
      }

      for (const [key, val] of Object.entries(value)) {
        if (wanted.includes(normalize(key))) {
          return val;
        }
      }

      for (const val of Object.values(value)) {
        const found = walk(val);
        if (found != null) return found;
      }

      return null;
    }

    return walk(obj);
  }

  function extractFirst(text, regexes) {
    for (const regex of regexes) {
      const match = text.match(regex);
      if (match && match[1]) return match[1].trim();
    }
    return null;
  }

  function cleanupMoney(value) {
    if (value == null) return null;
    let str = String(value).replace(/\u00a0/g, ' ').trim();
    str = str.replace(/\s+/g, ' ');
    str = str.replace(/^[^$0-9-]+/, '').trim();

    const moneyMatch = str.match(/\$?\s*[\d,]+(?:\.\d{2})?/);
    if (moneyMatch) {
      return moneyMatch[0].replace(/\s+/g, '');
    }

    return str || null;
  }

  function formatMoney(value) {
    const cleaned = cleanupMoney(value);
    if (!cleaned) return '$$$$';
    if (cleaned.startsWith('$')) return cleaned;
    if (/^-?[\d,]+(?:\.\d{2})?$/.test(cleaned)) return `$${cleaned}`;
    return cleaned;
  }

  function extractMoneyNearLabel(html, labelPatterns) {
    for (const pattern of labelPatterns) {
      const regexes = [
        new RegExp(pattern + '[\\s\\S]{0,250}?(\\$\\s*[\\d,]+(?:\\.\\d{2})?)', 'i'),
        new RegExp(pattern + '[\\s\\S]{0,250}?([\\d,]+\\.\\d{2})', 'i'),
        new RegExp('(\\$\\s*[\\d,]+(?:\\.\\d{2})?)[\\s\\S]{0,120}?' + pattern, 'i'),
        new RegExp('>' + pattern + '<[\\s\\S]{0,250}?(\\$\\s*[\\d,]+(?:\\.\\d{2})?)', 'i')
      ];

      for (const regex of regexes) {
        const match = html.match(regex);
        if (match && match[1]) {
          return cleanupMoney(match[1]);
        }
      }
    }
    return null;
  }

  function extractBookingData(responseText, confirmationNumber) {
    const json = tryParseJson(responseText);

    let bookingNumber = null;
    let baseRate = null;
    let total = null;

    if (json) {
      bookingNumber = findDeepValue(json, [
        'bookingNumber', 'booking_number', 'confirmationNumber',
        'confirmation_number', 'reservationNumber', 'reservation_number'
      ]);

      baseRate = findDeepValue(json, [
        'baseRate', 'base_rate', 'confirmedRate', 'confirmed_rate',
        'originalRate', 'original_rate', 'rate'
      ]);

      total = findDeepValue(json, [
        'total', 'totalRate', 'total_rate', 'totalCharge',
        'total_charge', 'reservationTotal', 'reservation_total',
        'totalEstimated', 'total_estimated'
      ]);
    }

    if (!bookingNumber) {
      bookingNumber = extractFirst(responseText, [
        /"bookingNumber"\s*:\s*"([^"]+)"/i,
        /"confirmationNumber"\s*:\s*"([^"]+)"/i,
        /"reservationNumber"\s*:\s*"([^"]+)"/i,
        /confirmation(?:\s|&nbsp;)*number[\s\S]{0,120}?([A-Z0-9]+)/i
      ]) || confirmationNumber;
    }

    if (!baseRate) {
      baseRate = extractFirst(responseText, [
        /"baseRate"\s*:\s*"([^"]+)"/i,
        /"confirmedRate"\s*:\s*"([^"]+)"/i,
        /"originalRate"\s*:\s*"([^"]+)"/i,
        /"rate"\s*:\s*"([^"]+)"/i,
        /"baseRate"\s*:\s*([0-9.]+)/i,
        /"confirmedRate"\s*:\s*([0-9.]+)/i,
        /"originalRate"\s*:\s*([0-9.]+)/i
      ]);
    }

    if (!total) {
      total = extractFirst(responseText, [
        /"total"\s*:\s*"([^"]+)"/i,
        /"totalRate"\s*:\s*"([^"]+)"/i,
        /"totalCharge"\s*:\s*"([^"]+)"/i,
        /"reservationTotal"\s*:\s*"([^"]+)"/i,
        /"totalEstimated"\s*:\s*"([^"]+)"/i,
        /"total"\s*:\s*([0-9.]+)/i,
        /"totalRate"\s*:\s*([0-9.]+)/i,
        /"totalCharge"\s*:\s*([0-9.]+)/i,
        /"totalEstimated"\s*:\s*([0-9.]+)/i
      ]);
    }

    if (!baseRate) {
      baseRate = extractMoneyNearLabel(responseText, [
        'base\\s*rate',
        'rate\\s*details[\\s\\S]{0,80}?base\\s*rate'
      ]);
    }

    if (!total) {
      total = extractMoneyNearLabel(responseText, [
        'total\\s*estimated',
        'estimated\\s*total',
        'total\\s*estimate',
        'total'
      ]);
    }

    return {
      bookingNumber: bookingNumber || confirmationNumber || '####',
      baseRate: formatMoney(baseRate),
      total: formatMoney(total),
      foundAny: !!(bookingNumber || baseRate || total)
    };
  }

  function buildDescription(data) {
    return `For booking ${data.bookingNumber}, the original reservation was confirmed at a base rate of ${data.baseRate} plus tax, for a total of ${data.total}. However, the Avis rental location charged a much higher rate of $$$$ without any explanation. All additional extras were declined and the vehicle was picked up and returned on-time. Can you please ensure I am refunded the amount I was overcharged? Please see the original reservation attached.`;
  }

  function getReservationUrl() {
    const confirmation = (document.getElementById('avis-helper-confirmation')?.value || '').trim();
    const lastName = (document.getElementById('avis-helper-lastname')?.value || '').trim();

    if (!confirmation || !lastName) return '';
    return `https://abglac.com/step4/Avis/${encodeURIComponent(confirmation)}/${encodeURIComponent(lastName)}`;
  }

  function updateReservationLink() {
    const link = document.getElementById('avis-view-reservation');
    if (!link) return;

    const url = getReservationUrl();

    if (url) {
      link.href = url;
      link.style.pointerEvents = 'auto';
      link.style.opacity = '1';
    } else {
      link.href = '#';
      link.style.pointerEvents = 'none';
      link.style.opacity = '0.5';
    }
  }

  function addPanel() {
    if (document.getElementById('avis-autofill-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'avis-autofill-panel';

    Object.assign(panel.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '999999',
      width: '260px',
      padding: '12px',
      background: '#fff',
      border: '2px solid #b30000',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      fontFamily: 'Arial, sans-serif',
      color: '#111'
    });

    panel.innerHTML = `
      <div style="font-weight:700; margin-bottom:10px; font-size:14px;">Avis Support Autofill</div>

      <label style="display:block; font-size:12px; margin-bottom:4px;">Last Name</label>
<div style="display:flex; gap:6px; margin-bottom:10px;">
  <input id="avis-helper-lastname" type="text" style="flex:1; min-width:0; box-sizing:border-box; height:34px; padding:8px; font-size:13px; border:1px solid #999; border-radius:4px;">
  <button id="avis-copy-lastname" type="button" style="height:34px; padding:0 10px; font-size:12px; border:1px solid #999; background:#f3f3f3; border-radius:4px; cursor:pointer;">Copy</button>
</div>

<label style="display:block; font-size:12px; margin-bottom:4px;">Confirmation Number</label>
<div style="display:flex; gap:6px; margin-bottom:10px;">
  <input id="avis-helper-confirmation" type="text" style="flex:1; min-width:0; box-sizing:border-box; height:34px; padding:8px; font-size:13px; border:1px solid #999; border-radius:4px;">
  <button id="avis-copy-confirmation" type="button" style="height:34px; padding:0 10px; font-size:12px; border:1px solid #999; background:#f3f3f3; border-radius:4px; cursor:pointer;">Copy</button>
</div>

      <button id="avis-autofill-btn" type="button" style="width:100%; padding:10px; background:#c00; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:14px; font-weight:700; margin-bottom:8px;">
        Autofill Avis Form
      </button>

      <a id="avis-view-reservation" href="#" target="_blank" rel="noopener noreferrer" style="display:block; text-align:center; padding:8px 10px; background:#f3f3f3; color:#111; border:1px solid #ccc; border-radius:6px; text-decoration:none; font-size:13px; pointer-events:none; opacity:0.5; margin-bottom:8px;">
        View Reservation
      </a>

      <a id="avis-get-receipt"
   href="${RECEIPT_URL}"
   target="_blank"
   rel="noopener noreferrer"
   title="For best results, right click and open in incognito/private. \nThen, copy the name and confirmation from above."
   style="display:block; text-align:center; padding:8px 10px; background:#f3f3f3; color:#111; border:1px solid #ccc; border-radius:6px; text-decoration:none; font-size:13px;">
   Get Receipt
</a>
    `;

    document.body.appendChild(panel);

    const confirmationInput = document.getElementById('avis-helper-confirmation');
    const lastNameInput = document.getElementById('avis-helper-lastname');
    const copyConfirmationBtn = document.getElementById('avis-copy-confirmation');
    const copyLastNameBtn = document.getElementById('avis-copy-lastname');

    copyConfirmationBtn.dataset.originalText = 'Copy';
    copyLastNameBtn.dataset.originalText = 'Copy';

    confirmationInput.addEventListener('input', updateReservationLink);
    lastNameInput.addEventListener('input', updateReservationLink);

    copyConfirmationBtn.addEventListener('click', async () => {
      const ok = await copyText(confirmationInput.value);
      setCopyButtonState(copyConfirmationBtn, ok);
    });

    copyLastNameBtn.addEventListener('click', async () => {
      const ok = await copyText(lastNameInput.value);
      setCopyButtonState(copyLastNameBtn, ok);
    });

    document.getElementById('avis-autofill-btn').addEventListener('click', runAutofillFromPanel);

    updateReservationLink();
  }

  async function runAutofillFromPanel() {
    const btn = document.getElementById('avis-autofill-btn');
    const confirmationInput = document.getElementById('avis-helper-confirmation');
    const lastNameInput = document.getElementById('avis-helper-lastname');

    const confirmationNumber = (confirmationInput?.value || '').trim();
    const lastName = (lastNameInput?.value || '').trim();

    btn.disabled = true;
    btn.textContent = 'Running...';

    try {
      for (const item of FIELDS) {
        await setFieldByLabel(item.label, item.value, item.exact);
        await sleep(500);
      }

      if (confirmationNumber) {
        await fillRevealedConfirmationField(confirmationNumber);
        await sleep(150);
      }

      await setSubjectField();
      await sleep(150);

      updateReservationLink();

      if (!confirmationNumber || !lastName) {
        return;
      }

      const url = getReservationUrl();
      const response = await gmGet(url);
      const responseText = response.responseText || '';
      const status = response.status;

      if (status < 200 || status >= 300) {
        throw new Error(`HTTP ${status}`);
      }

      const data = extractBookingData(responseText, confirmationNumber);

      if (!data.foundAny) {
        throw new Error('Parser could not find booking values in response.');
      }

      const descriptionText = buildDescription(data);
      await setDescriptionField(descriptionText);
    } catch (err) {
      console.error('[Avis Autofill] Error:', err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Autofill Avis Form';
    }
  }

  window.addEventListener('load', () => {
    setTimeout(addPanel, 700);
  });
})();
