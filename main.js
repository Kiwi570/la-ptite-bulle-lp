(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const NB = ' ';
  const NNB = ' ';

  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
  const setHidden = (el, hidden) => { if (el.hidden !== hidden) el.hidden = hidden; };

  /* ---------- Formulaires (hero et section finale, état partagé) ---------- */

  const hero = $('#concept');
  const note = $('#lp-note-text');
  const stage = $('#bubble-stage');
  const sleep = $('#bubble-sleep');
  const mini = $('#bubble-mini');
  const miniUrl = $('#mini-url');
  const miniBadge = $('#mini-badge');
  const tags = $$('.tag');
  const miniBlocks = $$('[data-mini]');

  function makeView(p) {
    const form = $('#' + p + '-form');
    if (!form) return null;
    return {
      form,
      field: $('#' + p + '-field'),
      trap: $('#' + p + '-hp'),
      label: $('#' + p + '-label'),
      ctaLabel: $('#' + p + '-cta-label'),
      stepText: $('#' + p + '-step'),
      status: $('#' + p + '-status'),
      privacy: $('#' + p + '-privacy'),
      edit: $('#' + p + '-edit'),
      iconSite: $('#' + p + '-icon-site'),
      iconMail: $('#' + p + '-icon-mail'),
      wrap: $('#' + p + '-form-wrap'),
      done: $('#' + p + '-done'),
      doneMail: $('#' + p + '-done-mail'),
      doneEta: $('#' + p + '-done .done-eta'),
      restart: $('#' + p + '-restart'),
      toggle: $('#' + p + '-toggle'),
      toggleHide: $('#' + p + '-toggle-item') || $('#' + p + '-toggle'),
      card: form.closest('.final-card'),
      announceTimer: 0
    };
  }
  const views = [makeView('lp'), makeView('fin')].filter(Boolean);
  const heroView = views[0];
  const endpoint = (heroView.form.dataset.endpoint || '').trim();

  const state = { step: 1, site: '', email: '', noSite: false, nudge: false, error: '', sending: false, boing: 0, active: heroView, eta: '' };
  let nudgeTimer = 0;

  function announce(view, message) {
    clearTimeout(view.announceTimer);
    view.status.textContent = '';
    view.announceTimer = setTimeout(() => { view.status.textContent = message; }, 60);
  }

  const slugify = (text) => text.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 20);

  function shownName() {
    const t = state.site.trim();
    let shown;
    if (state.noSite) {
      const slug = slugify(t);
      shown = slug ? slug + '.fr' : '';
    } else {
      shown = t.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '');
    }
    return shown.length > 24 ? shown.slice(0, 23) + '…' : shown;
  }

  function noteText(len, lit) {
    if (state.step === 3) return 'c’est parti' + NNB + '! votre bulle arrive';
    if (state.nudge && state.active === heroView) {
      if (state.step === 2) return 'une adresse e-mail valide' + NNB + '!';
      return state.noSite ? 'd’abord quelques mots' + NNB + '!' : 'd’abord votre adresse' + NNB + '!';
    }
    if (state.step === 2) return 'plus qu’une étape…';
    if (lit >= 4) return 'la voilà réveillée' + NNB + '!';
    if (len > 0) return 'elle s’éveille…';
    return state.noSite ? 'décrivez votre activité, elle s’éveille' : 'tapez votre adresse, elle s’éveille';
  }

  function renderView(v) {
    const isDone = state.step === 3;
    const isStep2 = state.step === 2;
    const mine = state.active === v;
    setHidden(v.wrap, isDone);
    setHidden(v.done, !isDone);
    if (v.card) {
      setHidden(v.card.querySelector('.field-head'), isDone);
      setHidden(v.card.querySelector('.eta'), isDone);
    } else {
      v.label.style.visibility = isDone ? 'hidden' : '';
    }
    setText(v.doneMail, state.email.trim() || 'votre adresse');
    if (v.doneEta) setText(v.doneEta, state.eta || 'sous 24' + NB + 'h ouvrées');
    setHidden(v.toggleHide, state.step !== 1);
    setText(v.toggle, state.noSite ? 'J’ai déjà un site' : 'Pas encore de site' + NNB + '?');
    setHidden(v.edit, !isStep2);
    setText(v.edit, state.noSite ? 'Modifier l’activité' : 'Modifier l’adresse');
    v.edit.disabled = state.sending;
    setHidden(v.privacy, !isStep2);
    v.field.setAttribute('aria-describedby', isStep2 ? v.stepText.id + ' ' + v.privacy.id : v.stepText.id);
    v.iconSite.toggleAttribute('hidden', isStep2);
    v.iconMail.toggleAttribute('hidden', !isStep2);

    let defaultStep;
    const f = v.field;
    if (isStep2) {
      setText(v.label, 'Où envoyer votre bulle' + NNB + '?');
      if (f.type !== 'email') f.type = 'email';
      f.name = 'email';
      f.autocomplete = 'email';
      f.inputMode = 'email';
      f.placeholder = 'vous@exemple.fr';
      setText(v.ctaLabel, state.sending && mine ? 'Envoi…' : 'Recevoir ma bulle');
      defaultStep = 'Étape 2 sur 2 · Aucun paiement, aucun engagement.';
    } else {
      setText(v.label, state.noSite ? 'Votre activité en quelques mots' : 'Votre site actuel');
      if (f.type !== 'text') f.type = 'text';
      f.name = state.noSite ? 'activite' : 'site';
      f.autocomplete = state.noSite ? 'off' : 'url';
      f.inputMode = state.noSite ? 'text' : 'url';
      f.placeholder = state.noSite ? 'Fleuriste, coach, boulangerie…' : 'www.votre-site.fr';
      setText(v.ctaLabel, 'Créer ma bulle');
      defaultStep = 'Étape 1 sur 2 · Vos coordonnées juste après.';
    }
    f.readOnly = state.sending;
    const err = mine ? state.error : '';
    setText(v.stepText, err || defaultStep);
    v.stepText.classList.toggle('is-error', Boolean(err));
    if (err) f.setAttribute('aria-invalid', 'true');
    else f.removeAttribute('aria-invalid');
    v.form.classList.toggle('is-sending', state.sending && mine);
    if (!mine) v.form.classList.remove('is-nudge');

    const wanted = isStep2 ? state.email : state.site;
    if (f.value !== wanted) f.value = wanted;
  }

  function render() {
    const len = state.site.trim().length;
    const lit = state.step > 1 ? 4 : (len === 0 ? 0 : Math.min(4, Math.ceil(len / 3)));
    const asleep = state.step === 1 && len === 0;
    const isDone = state.step === 3;

    hero.style.setProperty('--lit', String(isDone ? 4.6 : lit));
    schedulePalette(asleep ? '' : shownName());
    tags.forEach((tag, i) => tag.classList.toggle('is-on', lit > i));
    miniBlocks.forEach((el) => el.classList.toggle('is-on', lit >= Number(el.dataset.mini)));
    setHidden(sleep, !asleep);
    setHidden(mini, asleep);
    setHidden(miniBadge, !isDone);
    setText(miniUrl, shownName() || (state.noSite ? 'votre-activite.fr' : 'votre-site.fr'));
    setText(note, noteText(len, lit));
    views.forEach(renderView);
  }

  function bounce() {
    state.boing += 1;
    stage.classList.remove('boing-a', 'boing-b');
    void stage.offsetWidth;
    stage.classList.add(state.boing % 2 ? 'boing-a' : 'boing-b');
  }

  function fail(v, message) {
    clearTimeout(nudgeTimer);
    state.active = v;
    state.nudge = true;
    state.error = message;
    v.form.classList.remove('is-nudge');
    void v.form.offsetWidth;
    v.form.classList.add('is-nudge');
    const hadFocus = document.activeElement === v.field;
    render();
    if (hadFocus) announce(v, message);
    v.field.focus();
    nudgeTimer = setTimeout(() => {
      state.nudge = false;
      v.form.classList.remove('is-nudge');
      render();
    }, 1800);
  }

  function focusField(v, delay = 40) {
    setTimeout(() => {
      const f = v.field;
      if (f.offsetParent === null) return;
      try { f.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' }); } catch (e) { f.scrollIntoView(); }
      try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }
    }, delay);
  }

  async function sendRequest(v) {
    if (v.trap && v.trap.value) return true;
    if (!endpoint) return true;
    const payload = {
      type: state.noSite ? 'activite' : 'site',
      site: state.site.trim(),
      email: state.email.trim(),
      origine: v === heroView ? 'hero' : 'final',
      offreJusqua: offerBar.dataset.end,
      page: window.location.href,
      date: new Date().toISOString()
    };
    const ctrl = 'AbortController' in window ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : 0;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      });
      return response.ok;
    } catch (e) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  function reset(v) {
    Object.assign(state, { step: 1, site: '', email: '', nudge: false, error: '', active: v });
    render();
  }

  views.forEach((v) => {
    v.field.addEventListener('input', () => {
      if (state.sending) return;
      state.active = v;
      if (state.step === 2) state.email = v.field.value;
      else state.site = v.field.value;
      if (state.nudge || state.error) {
        state.nudge = false;
        state.error = '';
        v.form.classList.remove('is-nudge');
      }
      render();
    });

    v.form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (state.sending) return;
      state.active = v;
      if (state.step === 1) {
        if (!state.site.trim()) {
          fail(v, state.noSite ? 'Décrivez d’abord votre activité en quelques mots.' : 'Indiquez d’abord l’adresse de votre site.');
          return;
        }
        state.step = 2;
        state.error = '';
        render();
        v.field.blur();
        try { v.field.focus({ preventScroll: true }); } catch (e) { v.field.focus(); }
      } else if (state.step === 2) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(state.email.trim())) {
          fail(v, 'Cette adresse e-mail semble incomplète.');
          return;
        }
        state.sending = true;
        state.error = '';
        render();
        const ok = await sendRequest(v);
        state.sending = false;
        if (!ok) {
          fail(v, 'L’envoi n’a pas abouti. Réessayez dans un instant.');
          return;
        }
        state.eta = etaInfo().when;
        state.step = 3;
        render();
        bounce();
        const doneText = v.done.querySelector('.done-text');
        try { doneText.focus({ preventScroll: true }); } catch (e) { doneText.focus(); }
      }
    });

    v.edit.addEventListener('click', () => {
      if (state.sending) return;
      state.active = v;
      state.step = 1;
      state.error = '';
      render();
      focusField(v, 20);
    });
    v.restart.addEventListener('click', () => { reset(v); focusField(v, 20); });
    v.toggle.addEventListener('click', () => {
      state.active = v;
      state.noSite = !state.noSite;
      state.site = '';
      state.error = '';
      render();
      focusField(v, 20);
    });
  });

  $('#bubble-bounce').addEventListener('click', bounce);

  $$('[data-goto-field]').forEach((btn) => btn.addEventListener('click', () => {
    const dialog = btn.closest('dialog');
    if (dialog) dialog.close();
    if (state.step === 3) reset(heroView);
    const mid = window.innerHeight / 2;
    const target = views.reduce((best, v) => {
      const r = v.form.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      return d < best.d ? { v, d } : best;
    }, { v: heroView, d: Infinity }).v;
    state.active = target;
    focusField(target, dialog ? 80 : 40);
  }));

  /* ---------- Offre limitée : compte à rebours réel ---------- */

  const offerBar = $('#offer');
  const offerEnd = Date.parse(offerBar.dataset.end);
  const timeParts = { h: $$('[data-t="h"]'), m: $$('[data-t="m"]'), s: $$('[data-t="s"]') };
  const secBubble = $('.cd-sec');
  let offerTimer = 0;
  const pad = (n) => String(n).padStart(2, '0');

  function syncBarHeight() {
    const sticky = !document.documentElement.classList.contains('offer-ended');
    document.documentElement.style.setProperty('--bar-h', sticky ? offerBar.offsetHeight + 'px' : '0px');
  }

  function offerTick() {
    const left = offerEnd - Date.now();
    if (!(left > 0)) {
      document.documentElement.classList.add('offer-ended');
      document.documentElement.classList.remove('offer-last-hour');
      clearInterval(offerTimer);
      syncBarHeight();
      return;
    }
    const total = Math.floor(left / 1000);
    const values = { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
    Object.keys(values).forEach((key) => timeParts[key].forEach((el) => setText(el, pad(values[key]))));
    document.documentElement.classList.toggle('offer-last-hour', left < 3600000);
    if (secBubble && !reduceMotion.matches) {
      secBubble.classList.remove('tick');
      void secBubble.offsetWidth;
      secBubble.classList.add('tick');
    }
  }

  offerTick();
  syncBarHeight();
  if (!document.documentElement.classList.contains('offer-ended')) offerTimer = setInterval(offerTick, 1000);
  window.addEventListener('resize', syncBarHeight);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) offerTick(); });

  /* ---------- Heure de livraison : 24 h ouvrées, heure de Paris ---------- */

  const DAY = 86400000;
  const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const holidayCache = {};

  function easterUTC(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return Date.UTC(y, month - 1, day);
  }

  function holidays(y) {
    if (holidayCache[y]) return holidayCache[y];
    const set = new Set([[0, 1], [4, 1], [4, 8], [6, 14], [7, 15], [10, 1], [10, 11], [11, 25]].map(([mo, d]) => Date.UTC(y, mo, d)));
    const easter = easterUTC(y);
    [1, 39, 50].forEach((n) => set.add(easter + n * DAY));
    holidayCache[y] = set;
    return set;
  }

  function parisNow() {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date());
      const get = (type) => Number(parts.find((x) => x.type === type).value);
      return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
    } catch (e) {
      const d = new Date();
      return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
    }
  }

  function businessDeadline(start, hours) {
    let t = start;
    let left = hours * 3600000;
    for (let guard = 0; guard < 40; guard++) {
      const day = Math.floor(t / DAY) * DAY;
      const date = new Date(day);
      const wd = date.getUTCDay();
      if (wd === 0 || wd === 6 || holidays(date.getUTCFullYear()).has(day)) { t = day + DAY; continue; }
      const available = day + DAY - t;
      if (left <= available) return t + left;
      left -= available;
      t = day + DAY;
    }
    return t;
  }

  function etaInfo() {
    const now = parisNow();
    let dl = Math.ceil(businessDeadline(now, 24) / 3600000) * 3600000;
    let evening = false;
    let morning = false;
    if (dl % DAY === 0) { dl -= 60000; evening = true; }
    else if (new Date(dl).getUTCHours() < 8) { morning = true; }
    const d = new Date(dl);
    const diff = Math.round((Math.floor(dl / DAY) - Math.floor(now / DAY)));
    const dayName = diff === 0 ? 'aujourd’hui' : diff === 1 ? 'demain' : DAYS[d.getUTCDay()];
    const when = evening
      ? (diff === 0 ? 'ce soir' : dayName + ' soir')
      : morning
      ? dayName + ' matin'
      : dayName + ' avant ' + d.getUTCHours() + NB + 'h';
    const n = d.getUTCDate();
    const full = DAYS[d.getUTCDay()] + ' ' + n + (n === 1 ? 'er' : '') + ' ' + MONTHS[d.getUTCMonth()];
    return { when, date: full.charAt(0).toUpperCase() + full.slice(1) };
  }

  const etaWhen = $$('.eta-when');
  const etaDate = $$('.eta-date');
  function updateEta() {
    const info = etaInfo();
    etaWhen.forEach((el) => setText(el, info.when));
    etaDate.forEach((el) => setText(el, info.date));
  }
  updateEta();
  setInterval(updateEta, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateEta(); });

  /* ---------- La bulle : ouverture, palette et réactions à la souris ---------- */

  function paletteFor(text) {
    let h = 2166136261;
    for (const ch of text) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    const hue = (h >>> 0) % 360;
    const c = (dh, s, l) => 'hsl(' + ((hue + dh) % 360) + ' ' + s + '% ' + l + '%)';
    return [c(0, 82, 72), c(38, 76, 76), c(172, 66, 72), c(205, 62, 80), c(18, 86, 86)];
  }

  let paletteKey = null;
  let paletteTimer = 0;
  function applyPalette(key) {
    if (key === paletteKey) return;
    paletteKey = key;
    const list = key ? paletteFor(key) : null;
    for (let i = 0; i < 5; i++) {
      if (list) stage.style.setProperty('--c' + (i + 1), list[i]);
      else stage.style.removeProperty('--c' + (i + 1));
    }
  }
  function schedulePalette(text) {
    const key = text ? text.toLowerCase() : '';
    clearTimeout(paletteTimer);
    if (!key) { applyPalette(''); return; }
    paletteTimer = setTimeout(() => applyPalette(key), 220);
  }

  setTimeout(() => hero.classList.remove('is-intro'), reduceMotion.matches ? 0 : 2400);

  const frees = $$('.free', stage).map((el) => ({ el, ox: 0, oy: 0, tx: 0, ty: 0 }));
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  let pointer = null;
  let tiltFrame = 0;

  function tiltLoop() {
    tiltFrame = 0;
    tilt.x += (tilt.tx - tilt.x) * 0.12;
    tilt.y += (tilt.ty - tilt.y) * 0.12;
    let busy = Math.abs(tilt.tx - tilt.x) > 0.01 || Math.abs(tilt.ty - tilt.y) > 0.01;
    const rects = pointer ? frees.map((f) => f.el.getBoundingClientRect()) : null;
    frees.forEach((f, i) => {
      f.tx = 0;
      f.ty = 0;
      if (rects) {
        const r = rects[i];
        const dx = r.left + r.width / 2 - f.ox - pointer.x;
        const dy = r.top + r.height / 2 - f.oy - pointer.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 150) {
          const k = (1 - d / 150) * 48;
          f.tx = dx / d * k;
          f.ty = dy / d * k;
        }
      }
      f.ox += (f.tx - f.ox) * 0.16;
      f.oy += (f.ty - f.oy) * 0.16;
      if (Math.abs(f.tx - f.ox) > 0.1 || Math.abs(f.ty - f.oy) > 0.1) busy = true;
    });
    stage.style.setProperty('--tx', tilt.x.toFixed(3));
    stage.style.setProperty('--ty', tilt.y.toFixed(3));
    frees.forEach((f) => {
      f.el.style.setProperty('--fx', f.ox.toFixed(1) + 'px');
      f.el.style.setProperty('--fy', f.oy.toFixed(1) + 'px');
    });
    if (busy) tiltFrame = requestAnimationFrame(tiltLoop);
  }
  const kickTilt = () => { if (!tiltFrame) tiltFrame = requestAnimationFrame(tiltLoop); };

  hero.addEventListener('pointermove', (event) => {
    if (!finePointer.matches || reduceMotion.matches) return;
    const r = stage.getBoundingClientRect();
    tilt.tx = Math.max(-1, Math.min(1, (event.clientX - (r.left + r.width / 2)) / r.width)) * 10;
    tilt.ty = Math.max(-1, Math.min(1, (event.clientY - (r.top + r.height / 2)) / r.height)) * 10;
    pointer = { x: event.clientX, y: event.clientY };
    kickTilt();
  });
  hero.addEventListener('pointerleave', () => {
    tilt.tx = 0;
    tilt.ty = 0;
    pointer = null;
    kickTilt();
  });

  $$('[data-magnet]').forEach((btn) => {
    let ox = 0;
    let oy = 0;
    btn.addEventListener('pointermove', (event) => {
      if (!finePointer.matches || reduceMotion.matches) return;
      const r = btn.getBoundingClientRect();
      const cx = r.left - ox + r.width / 2;
      const cy = r.top - oy + r.height / 2;
      ox = (event.clientX - cx) * 0.18;
      oy = (event.clientY - cy) * 0.3;
      btn.style.translate = ox.toFixed(1) + 'px ' + oy.toFixed(1) + 'px';
    });
    btn.addEventListener('pointerleave', () => { ox = 0; oy = 0; btn.style.translate = ''; });
  });

  /* ---------- Écran 2 : le rouleau piloté par le défilement ---------- */

  const s2 = $('#avant-apres');
  const pin = $('.s2-pin', s2);
  const frameEl = $('.frame', s2);
  const fresh = $('.fresh', s2);
  const wet = $('.wet', s2);
  const roller = $('.roller-wrap', s2);
  const dripA = $('.drip-a', s2);
  const dripB = $('.drip-b', s2);
  const progressBar = $('.mini-progress span', s2);
  const stepsLine = $('.steps-line span', s2);
  const splatBox = $('.splats', s2);
  const steps = $$('.step', s2);
  const pinnedQuery = window.matchMedia('(min-width: 1080px) and (min-height: 640px)');
  const thresholds = [0.02, 0.45, 0.9];

  const BANDS = 6;
  const BW = 100 / BANDS;
  const STROKE = 0.84;
  const SCREEN_H = 66.667 - 6.4;
  const EMPTY = 'polygon(0% 0%,0% 0%,0% 0%)';
  const FULL = 'polygon(0% 0%,100% 0%,100% 100%,0% 100%)';

  const noise = (i, seed) => {
    const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return x - Math.floor(x) - 0.5;
  };
  const jitter = (t, seed, step, amp) => {
    const a = Math.floor(t / step);
    const f = t / step - a;
    return amp * (noise(a, seed) * (1 - f) + noise(a + 1, seed) * f);
  };
  const keep = (v) => Math.max(0, Math.min(100, v));
  const fmt = (v) => Math.round(v * 100) / 100;

  function samples(from, to, step) {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const list = [];
    for (let j = Math.ceil(lo / step); j <= Math.floor(hi / step); j++) {
      const v = j * step;
      if (v > lo && v < hi) list.push(v);
    }
    if (to < from) list.reverse();
    return [from, ...list, to];
  }

  function verticalEdge(pts, x, y0, y1, seed) {
    samples(y0, y1, 3.2).forEach((y) => pts.push([keep(x + jitter(y, seed, 3.2, 0.6)), y]));
  }

  function leadingEdge(pts, y, x0, x1, seed) {
    const step = BW / 9;
    samples(x0, x1, step).forEach((x) => {
      const bristle = noise(Math.round(x * 7), seed + 9) > 0.32 ? 1.1 : 0;
      pts.push([x, keep(y + jitter(x, seed, step, 2) + (y < 50 ? bristle : -bristle))]);
    });
  }

  function paintShape(k, g, down) {
    if (k >= BANDS) return FULL;
    if (k === 0 && g <= 0.001) return EMPTY;
    const x1 = k === 0 ? -2 : k * BW;
    const x2 = k === BANDS - 1 ? 104 : (k + 1) * BW;
    const finished = g >= 0.999;
    const lead = finished ? (down ? 104 : -4) : (down ? g * 100 : 100 - g * 100);
    const pts = [[0, 0]];
    if (g <= 0.001) {
      verticalEdge(pts, x1, 0, 100, k);
    } else if (down) {
      verticalEdge(pts, x2, 0, lead, k + 1);
      leadingEdge(pts, lead, x2, x1, 50 + k);
      verticalEdge(pts, x1, lead, 100, k);
    } else {
      verticalEdge(pts, x1, 0, lead, k);
      leadingEdge(pts, lead, x1, x2, 50 + k);
      verticalEdge(pts, x2, lead, 100, k + 1);
    }
    pts.push([0, 100]);
    return 'polygon(' + pts.map(([x, y]) => fmt(x) + '% ' + fmt(y) + '%').join(',') + ')';
  }

  const splats = [];
  for (let b = 0; b < BANDS - 1; b++) {
    for (let i = 0; i < 3; i++) {
      const y = 10 + (noise(i, b + 20) + 0.5) * 80;
      const down = b % 2 === 0;
      const el = document.createElement('span');
      el.className = 'splat';
      const size = 0.45 + (noise(i, b + 40) + 0.5) * 0.75;
      el.style.left = ((b + 1) * BW + 0.8 + (noise(i, b + 30) + 0.5) * 3) + '%';
      el.style.top = y + '%';
      el.style.width = size + 'cqw';
      el.style.height = (size * 0.85) + 'cqw';
      splatBox.appendChild(el);
      splats.push({ el, band: b, at: down ? y / 100 : 1 - y / 100, on: false });
    }
  }

  let target = 0;
  let current = 0;
  let tween = null;
  let hold = null;
  let frame = 0;
  let lastShape = '';
  const flags = { painted: null, finished: null, steps: [null, null, null] };

  function measure() {
    const vh = window.innerHeight || 800;
    let p;
    if (pinnedQuery.matches) {
      const r = s2.getBoundingClientRect();
      const dist = Math.max(1, r.height - pin.offsetHeight);
      const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) || 0;
      p = (barH - r.top + 60) / dist;
    } else {
      const fr = frameEl.getBoundingClientRect();
      const start = vh * 0.92;
      const end = vh * 0.5 - fr.height * 0.5;
      p = (start - fr.top) / Math.max(1, start - end);
    }
    return clamp(p);
  }

  function apply(p) {
    const s = p * BANDS;
    let k = Math.floor(s);
    let sb = s - k;
    if (k >= BANDS) { k = BANDS; sb = 0; }
    const down = k % 2 === 0;
    let g = 1;
    let shift = 0;
    if (k < BANDS) {
      if (sb < STROKE) g = sb / STROKE;
      else shift = (sb - STROKE) / (1 - STROKE);
    }
    const lead = down ? g * 100 : 100 - g * 100;
    const leadCqw = lead / 100 * SCREEN_H;
    const glide = shift < 0.5 ? 2 * shift * shift : 1 - Math.pow(-2 * shift + 2, 2) / 2;
    const grow = Math.min(1, g * 2.5);

    const shape = paintShape(k, g, down);
    if (shape !== lastShape) {
      fresh.style.clipPath = shape;
      wet.style.clipPath = shape;
      lastShape = shape;
    }
    wet.style.setProperty('--x1', (Math.min(k, BANDS - 1) * BW).toFixed(3));
    wet.style.opacity = k >= BANDS ? '0' : (shift > 0 ? (1 - shift).toFixed(3) : '1');
    wet.style.setProperty('--lead', leadCqw.toFixed(3) + 'cqw');

    const rx = k * BW + BW / 2 + glide * BW;
    roller.style.translate = 'calc(' + rx.toFixed(3) + 'cqw - 50%) calc(' + leadCqw.toFixed(3) + 'cqw - 12.94%)';
    roller.style.rotate = (Math.sin(g * Math.PI * 2) * 1.4 + (down ? 1.2 : -1.2) * (1 - shift)).toFixed(2) + 'deg';
    roller.style.setProperty('--roll', ((lead * 2.6) % 8).toFixed(2) + 'px');

    const dripOn = down && k < BANDS && g > 0.06 && shift === 0;
    dripA.style.opacity = dripOn ? '1' : '0';
    dripB.style.opacity = dripOn ? '1' : '0';
    if (dripOn) {
      dripA.style.translate = 'calc(' + (k * BW + BW * 0.3).toFixed(2) + 'cqw - 50%) ' + (leadCqw - 0.2).toFixed(2) + 'cqw';
      dripB.style.translate = 'calc(' + (k * BW + BW * 0.72).toFixed(2) + 'cqw - 50%) ' + (leadCqw - 0.2).toFixed(2) + 'cqw';
      dripA.style.height = (1.4 + 3.2 * grow).toFixed(2) + 'cqw';
      dripB.style.height = (1 + 2 * grow).toFixed(2) + 'cqw';
    }

    progressBar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    stepsLine.style.transform = 'scaleY(' + p.toFixed(4) + ')';

    splats.forEach((sp) => {
      const on = k > sp.band || (k === sp.band && g > sp.at);
      if (on !== sp.on) { sp.on = on; sp.el.classList.toggle('on', on); }
    });
    const painted = p >= 0.985;
    const finished = p >= 0.995;
    if (painted !== flags.painted) { flags.painted = painted; s2.classList.toggle('is-painted', painted); }
    if (finished !== flags.finished) { flags.finished = finished; s2.classList.toggle('is-finished', finished); }
    steps.forEach((step, i) => {
      const on = p > thresholds[i];
      if (on !== flags.steps[i]) { flags.steps[i] = on; step.classList.toggle('is-on', on); }
    });
  }

  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  function loop(now) {
    frame = 0;
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.ms);
      current = tween.from + (tween.to - tween.from) * easeInOut(k);
      if (k >= 1) { tween = null; target = current; hold = measure(); }
    } else {
      const diff = target - current;
      current = (reduceMotion.matches || Math.abs(diff) < 0.0006) ? target : current + diff * 0.14;
    }
    apply(current);
    if (tween || Math.abs(target - current) > 0.0006) frame = requestAnimationFrame(loop);
  }

  function kick() { if (!frame) frame = requestAnimationFrame(loop); }

  function onScroll() {
    const p = measure();
    if (tween) {
      if (Math.abs(p - tween.startP) <= 0.02) return;
      tween = null;
    }
    if (hold !== null) {
      if (Math.abs(p - hold) < 0.04) return;
      hold = null;
    }
    if (Math.abs(p - target) < 0.0002 && Math.abs(current - target) < 0.0006) return;
    target = p;
    kick();
  }

  $('#replay').addEventListener('click', () => {
    hold = null;
    tween = { from: 0, to: 1, t0: performance.now(), ms: reduceMotion.matches ? 1 : 4200, startP: measure() };
    kick();
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  current = target = measure();
  apply(current);

  /* ---------- Section finale : bulle géante et bulles à éclater ---------- */

  const finalSection = $('#final');
  const finalBg = $('.final-bg', finalSection);
  let finalTick = false;
  function updateFinal() {
    finalTick = false;
    if (reduceMotion.matches) { finalBg.style.setProperty('--fp', '1'); return; }
    const r = finalSection.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    if (r.top > vh * 1.2 || r.bottom < -100) return;
    const fp = clamp((vh - r.top) / (vh * 0.85));
    finalBg.style.setProperty('--fp', fp.toFixed(3));
  }
  const kickFinal = () => { if (!finalTick) { finalTick = true; requestAnimationFrame(updateFinal); } };
  window.addEventListener('scroll', kickFinal, { passive: true });
  window.addEventListener('resize', kickFinal);
  updateFinal();

  $$('.pop', finalSection).forEach((pop) => {
    pop.addEventListener('click', () => pop.classList.add('is-popped'), { once: true });
  });

  if ('IntersectionObserver' in window) {
    const revealer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('is-in'); revealer.unobserve(entry.target); }
      });
    }, { threshold: 0.2 });
    revealer.observe(finalSection);
  } else {
    finalSection.classList.add('is-in');
  }

  /* ---------- Animations : pause hors écran et bouton pause ---------- */

  if ('IntersectionObserver' in window) {
    const watcher = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-off', !entry.isIntersecting));
    }, { rootMargin: '80px 0px' });
    watcher.observe(hero);
    watcher.observe(s2);
    watcher.observe(finalSection);
  }

  const motionBtn = $('#motion-toggle');
  const motionLabel = $('#motion-label');
  function setPaused(on, save) {
    document.documentElement.classList.toggle('is-paused', on);
    motionLabel.textContent = on ? 'Relancer' : 'Pause';
    if (save) { try { localStorage.setItem('lpb-paused', on ? '1' : '0'); } catch (e) { /* stockage indisponible */ } }
  }
  motionBtn.addEventListener('click', () => setPaused(!document.documentElement.classList.contains('is-paused'), true));
  let storedPause = false;
  try { storedPause = localStorage.getItem('lpb-paused') === '1'; } catch (e) { storedPause = false; }
  if (storedPause) setTimeout(() => setPaused(true, false), 2600);

  /* ---------- Panneaux Avis et FAQ ---------- */

  $$('[data-open]').forEach((btn) => btn.addEventListener('click', () => {
    const dialog = document.getElementById(btn.dataset.open);
    if (dialog && !dialog.open) dialog.showModal();
  }));
  $$('dialog.panel').forEach((dialog) => {
    let downOnBackdrop = false;
    dialog.addEventListener('pointerdown', (event) => { downOnBackdrop = event.target === dialog; });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog && downOnBackdrop) dialog.close();
      downOnBackdrop = false;
    });
    $$('[data-close]', dialog).forEach((btn) => btn.addEventListener('click', () => dialog.close()));
  });

  render();
})();
