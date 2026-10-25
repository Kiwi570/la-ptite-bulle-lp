(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Écran 1 : la bulle et le formulaire ---------- */

  const hero = $('#concept');
  const form = $('#bulle-form');
  const field = $('#lp-field');
  const label = $('#lp-label');
  const ctaLabel = $('#lp-cta-label');
  const stepText = $('#lp-step');
  const editBtn = $('#lp-edit');
  const iconSite = $('#icon-site');
  const iconMail = $('#icon-mail');
  const formWrap = $('#lp-form-wrap');
  const done = $('#lp-done');
  const doneMail = $('#lp-done-mail');
  const restartBtn = $('#lp-restart');
  const toggleItem = $('#lp-toggle-item');
  const toggleBtn = $('#lp-toggle');
  const note = $('#lp-note-text');
  const stage = $('#bubble-stage');
  const sleep = $('#bubble-sleep');
  const mini = $('#bubble-mini');
  const miniUrl = $('#mini-url');
  const miniBadge = $('#mini-badge');
  const tags = $$('.tag');
  const miniBlocks = $$('[data-mini]');

  const state = { step: 1, site: '', email: '', noSite: false, nudge: false, boing: 0 };
  let nudgeTimer = 0;

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
    if (state.step === 3) return 'c’est parti ! réponse sous 24 h';
    if (state.nudge) {
      if (state.step === 2) return 'une adresse e-mail valide !';
      return state.noSite ? 'd’abord quelques mots !' : 'd’abord votre adresse !';
    }
    if (state.step === 2) return 'plus qu’une étape…';
    if (lit >= 4) return 'la voilà réveillée !';
    if (len > 0) return 'elle s’éveille…';
    return state.noSite ? 'décrivez votre activité, elle s’éveille' : 'tapez votre adresse, elle s’éveille';
  }

  function render() {
    const len = state.site.trim().length;
    const lit = state.step > 1 ? 4 : (len === 0 ? 0 : Math.min(4, Math.ceil(len / 3)));
    const asleep = state.step === 1 && len === 0;
    const isDone = state.step === 3;
    const isStep2 = state.step === 2;

    hero.style.setProperty('--lit', String(isDone ? 4.6 : lit));
    tags.forEach((tag, i) => tag.classList.toggle('is-on', lit > i));
    miniBlocks.forEach((el) => el.classList.toggle('is-on', lit >= Number(el.dataset.mini)));
    sleep.hidden = !asleep;
    mini.hidden = asleep;
    miniBadge.hidden = !isDone;
    miniUrl.textContent = shownName() || (state.noSite ? 'votre-activite.fr' : 'votre-site.fr');
    note.textContent = noteText(len, lit);

    formWrap.hidden = isDone;
    done.hidden = !isDone;
    doneMail.textContent = state.email.trim() || 'votre adresse';
    toggleItem.hidden = state.step !== 1;
    toggleBtn.textContent = state.noSite ? 'J’ai déjà un site' : 'Pas encore de site ?';
    editBtn.hidden = !isStep2;
    iconSite.hidden = isStep2;
    iconMail.hidden = !isStep2;

    if (isStep2) {
      label.textContent = 'Où envoyer votre bulle ?';
      field.type = 'email';
      field.name = 'email';
      field.autocomplete = 'email';
      field.inputMode = 'email';
      field.placeholder = 'vous@exemple.fr';
      ctaLabel.textContent = 'Recevoir ma bulle';
      stepText.textContent = 'Étape 2 sur 2 · Aucun paiement, aucun engagement.';
    } else {
      label.textContent = state.noSite ? 'Votre activité en quelques mots' : 'Votre site actuel';
      field.type = 'text';
      field.name = state.noSite ? 'activite' : 'site';
      field.autocomplete = state.noSite ? 'off' : 'url';
      field.inputMode = state.noSite ? 'text' : 'url';
      field.placeholder = state.noSite ? 'Fleuriste, coach, boulangerie…' : 'www.votre-site.fr';
      ctaLabel.textContent = 'Créer ma bulle';
      stepText.textContent = 'Étape 1 sur 2 · Vos coordonnées juste après.';
    }
    const wanted = isStep2 ? state.email : state.site;
    if (field.value !== wanted) field.value = wanted;
  }

  function bounce() {
    state.boing += 1;
    stage.classList.remove('boing-a', 'boing-b');
    void stage.offsetWidth;
    stage.classList.add(state.boing % 2 ? 'boing-a' : 'boing-b');
  }

  function nudge() {
    clearTimeout(nudgeTimer);
    state.nudge = true;
    form.classList.remove('is-nudge');
    void form.offsetWidth;
    form.classList.add('is-nudge');
    render();
    field.focus();
    nudgeTimer = setTimeout(() => {
      state.nudge = false;
      form.classList.remove('is-nudge');
      render();
    }, 1800);
  }

  function focusField(delay = 40) {
    setTimeout(() => {
      if (field.offsetParent === null) return;
      try { field.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' }); } catch (e) { field.scrollIntoView(); }
      try { field.focus({ preventScroll: true }); } catch (e) { field.focus(); }
    }, delay);
  }

  field.addEventListener('input', () => {
    if (state.step === 2) state.email = field.value;
    else state.site = field.value;
    if (state.nudge) { state.nudge = false; form.classList.remove('is-nudge'); }
    render();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.step === 1) {
      if (!state.site.trim()) { nudge(); return; }
      state.step = 2;
      render();
      focusField(30);
    } else if (state.step === 2) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim())) { nudge(); return; }
      state.step = 3;
      render();
      bounce();
      restartBtn.focus({ preventScroll: true });
    }
  });

  editBtn.addEventListener('click', () => { state.step = 1; render(); focusField(20); });
  restartBtn.addEventListener('click', () => {
    Object.assign(state, { step: 1, site: '', email: '', nudge: false });
    render();
    focusField(20);
  });
  toggleBtn.addEventListener('click', () => {
    state.noSite = !state.noSite;
    state.site = '';
    render();
    focusField(20);
  });
  $('#bubble-bounce').addEventListener('click', bounce);

  $$('[data-goto-field]').forEach((btn) => btn.addEventListener('click', () => {
    const dialog = btn.closest('dialog');
    if (dialog) dialog.close();
    if (state.step === 3) { Object.assign(state, { step: 1, site: '', email: '' }); render(); }
    focusField(dialog ? 80 : 40);
  }));

  /* ---------- Écran 2 : le rouleau piloté par le défilement ---------- */

  const s2 = $('#avant-apres');
  const pin = $('.s2-pin', s2);
  const steps = $$('.step', s2);
  const pinnedQuery = window.matchMedia('(min-width: 1080px) and (min-height: 640px)');
  const thresholds = [0.02, 0.45, 0.9];

  let target = 0;
  let current = 0;
  let tween = null;
  let frame = 0;
  let lastScrollP = 0;

  function measure() {
    const r = s2.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    let p;
    if (pinnedQuery.matches) {
      const dist = Math.max(1, r.height - pin.offsetHeight);
      p = (-r.top + 60) / dist;
    } else {
      p = (vh * 0.75 - r.top) / Math.max(1, r.height * 0.8);
    }
    return clamp(p);
  }

  function apply(p) {
    s2.style.setProperty('--p', p.toFixed(4));
    s2.style.setProperty('--rtop', (6 + 24 * (0.5 - 0.5 * Math.cos(p * Math.PI * 4))).toFixed(2) + '%');
    s2.style.setProperty('--rtilt', (Math.sin(p * Math.PI * 4) * 5).toFixed(2) + 'deg');
    s2.classList.toggle('is-painted', p >= 0.985);
    s2.classList.toggle('is-finished', p >= 0.995);
    steps.forEach((step, i) => step.classList.toggle('is-on', p > thresholds[i]));
  }

  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  function loop(now) {
    frame = 0;
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.ms);
      current = tween.from + (tween.to - tween.from) * easeInOut(k);
      if (k >= 1) { tween = null; target = current; }
    } else {
      const diff = target - current;
      current = (reduceMotion.matches || Math.abs(diff) < 0.0008) ? target : current + diff * 0.16;
    }
    apply(current);
    if (tween || Math.abs(target - current) > 0.0008) frame = requestAnimationFrame(loop);
  }

  function kick() { if (!frame) frame = requestAnimationFrame(loop); }

  function onScroll() {
    const p = measure();
    if (tween && Math.abs(p - lastScrollP) > 0.002) tween = null;
    lastScrollP = p;
    if (!tween) { target = p; kick(); }
  }

  $('#replay').addEventListener('click', () => {
    tween = { from: 0, to: 1, t0: performance.now(), ms: reduceMotion.matches ? 1 : 2600 };
    lastScrollP = measure();
    kick();
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  current = target = lastScrollP = measure();
  apply(current);

  /* ---------- Panneaux Avis et FAQ ---------- */

  $$('[data-open]').forEach((btn) => btn.addEventListener('click', () => {
    const dialog = document.getElementById(btn.dataset.open);
    if (dialog && !dialog.open) dialog.showModal();
  }));
  $$('dialog.panel').forEach((dialog) => {
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    $$('[data-close]', dialog).forEach((btn) => btn.addEventListener('click', () => dialog.close()));
  });

  render();
})();
