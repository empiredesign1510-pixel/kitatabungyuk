(() => {
  'use strict';

  const ROOT = document.documentElement;
  const THEME_KEY = 'KITA_TABUNG_PUBLIC_THEME';
  const APP_THEME_KEY = 'KITA_TABUNG_THEME_V3';
  const lightVideo = document.getElementById('video-light');
  const darkVideo = document.getElementById('video-dark');
  const heroMedia = document.querySelector('.hero-media');
  const hero = document.querySelector('.video-hero');
  const topbar = document.getElementById('public-topbar');
  const themeColor = document.getElementById('public-theme-color');
  const buttons = [...document.querySelectorAll('[data-theme-choice]')];
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)');
  const mobileMedia = window.matchMedia?.('(max-width: 767px)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  let transitionToken = 0;
  let heroVisible = true;
  let currentTheme = ROOT.dataset.theme === 'dark' ? 'dark' : 'light';
  let posterMode = false;

  function readAppTheme() {
    try {
      const saved = JSON.parse(localStorage.getItem(APP_THEME_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return null;
      if (saved.adaptiveTheme === true) return systemDark?.matches ? 'dark' : 'light';
      return saved.theme === 'dark' ? 'dark' : saved.theme === 'light' ? 'light' : null;
    } catch (_) { return null; }
  }

  function getInitialTheme() {
    const manual = localStorage.getItem(THEME_KEY);
    if (manual === 'light' || manual === 'dark') return manual;
    return readAppTheme() || (systemDark?.matches ? 'dark' : 'light');
  }

  function shouldUsePosterMode() {
    if (reduceMotion?.matches) return true;
    if (connection?.saveData) return true;
    if (/slow-2g|2g/.test(connection?.effectiveType || '')) return true;
    if ((navigator.deviceMemory || 4) <= 1) return true;
    if ((navigator.hardwareConcurrency || 4) <= 2) return true;
    return false;
  }

  function mediaSrc(video) {
    if (!video) return '';
    return mobileMedia?.matches ? video.dataset.mobileSrc : video.dataset.desktopSrc;
  }

  function ensureSource(video, preload = 'metadata') {
    if (!video || posterMode) return;
    const wanted = mediaSrc(video);
    if (!wanted) return;
    video.preload = preload;
    if ((video.getAttribute('src') || '') !== wanted) {
      video.setAttribute('src', wanted);
      video.load();
    }
  }

  function waitForVideo(video, timeout = 850) {
    return new Promise(resolve => {
      if (!video) return resolve(false);
      if (video.readyState >= 3) return resolve(true);
      let done = false;
      const finish = ok => {
        if (done) return;
        done = true;
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('playing', onReady);
        resolve(ok);
      };
      const onReady = () => finish(true);
      video.addEventListener('canplay', onReady, { once:true });
      video.addEventListener('playing', onReady, { once:true });
      setTimeout(() => finish(video.readyState >= 2), timeout);
    });
  }

  function syncTime(source, target) {
    if (!source || !target || !Number.isFinite(source.currentTime)) return;
    try {
      const duration = Number.isFinite(target.duration) && target.duration > 0 ? target.duration : 10;
      const t = source.currentTime % duration;
      if (Math.abs((target.currentTime || 0) - t) > .12) target.currentTime = t;
    } catch (_) {}
  }

  async function playVideo(video) {
    if (!video || posterMode || !heroVisible || document.hidden) return false;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    try {
      const result = video.play();
      if (result?.then) {
        await Promise.race([result, new Promise(resolve => setTimeout(resolve, 900))]);
      }
      return !video.paused || video.readyState >= 2;
    } catch (_) { return false; }
  }

  function updateThemeUI(next, persist) {
    ROOT.dataset.theme = next;
    currentTheme = next;
    heroMedia?.classList.toggle('theme-dark', next === 'dark');
    themeColor?.setAttribute('content', next === 'dark' ? '#08111A' : '#3B82B8');
    buttons.forEach(button => {
      const selected = button.dataset.themeChoice === next;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    if (persist) {
      try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
    }
  }

  async function applyTheme(theme, { persist = false, initial = false } = {}) {
    const next = theme === 'dark' ? 'dark' : 'light';
    const token = ++transitionToken;
    const target = next === 'dark' ? darkVideo : lightVideo;
    const source = next === 'dark' ? lightVideo : darkVideo;

    if (posterMode) {
      updateThemeUI(next, persist);
      return;
    }

    ensureSource(target, 'auto');
    ensureSource(source, 'metadata');

    if (!initial && source?.readyState >= 2) {
      if (target?.readyState < 1) {
        await new Promise(resolve => {
          const timer = setTimeout(resolve, 500);
          target?.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve(); }, { once:true });
        });
      }
      syncTime(source, target);
    }

    const started = await playVideo(target);
    if (token !== transitionToken) return;

    if (!started && target?.readyState < 2) {
      posterMode = true;
      heroMedia?.classList.add('poster-mode');
      lightVideo?.pause();
      darkVideo?.pause();
      updateThemeUI(next, persist);
      return;
    }

    await waitForVideo(target, initial ? 1100 : 700);
    if (token !== transitionToken) return;

    updateThemeUI(next, persist);
    requestAnimationFrame(() => {
      target?.classList.add('active');
      source?.classList.remove('active');
    });

    window.setTimeout(() => {
      if (token !== transitionToken) return;
      source?.pause();
      if (source) source.preload = 'metadata';
    }, initial ? 0 : 900);
  }

  function warmInactiveVideo() {
    if (posterMode) return;
    const inactive = currentTheme === 'dark' ? lightVideo : darkVideo;
    const mobile = !!mobileMedia?.matches;
    ensureSource(inactive, mobile ? 'auto' : 'metadata');
    // Mobile clips are only ~200–300 KB. Warm the browser HTTP cache while idle
    // so the first light/dark switch can crossfade immediately without a network stall.
    if (mobile && !connection?.saveData && !/slow-2g|2g/.test(connection?.effectiveType || '')) {
      const src = mediaSrc(inactive);
      if (src) fetch(src, { cache:'force-cache', credentials:'same-origin' }).catch(() => {});
    }
  }

  function scheduleWarmup() {
    const cb = () => warmInactiveVideo();
    if ('requestIdleCallback' in window) requestIdleCallback(cb, { timeout:1800 });
    else setTimeout(cb, 1200);
  }

  function setupHeroVisibility() {
    if (!hero || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
      heroVisible = !!entries[0]?.isIntersecting;
      const active = currentTheme === 'dark' ? darkVideo : lightVideo;
      if (!heroVisible) {
        lightVideo?.pause();
        darkVideo?.pause();
      } else if (!posterMode && !document.hidden) {
        playVideo(active);
      }
    }, { threshold:.04 });
    io.observe(hero);
  }

  function reselectVideoSource() {
    if (posterMode) return;
    const active = currentTheme === 'dark' ? darkVideo : lightVideo;
    const wanted = mediaSrc(active);
    if (active?.getAttribute('src') === wanted) return;
    const t = active?.currentTime || 0;
    active?.pause();
    if (active) {
      active.setAttribute('src', wanted);
      active.preload = 'auto';
      active.load();
      active.addEventListener('loadedmetadata', () => {
        try { active.currentTime = Math.min(t, Math.max(0, active.duration - .08)); } catch (_) {}
        playVideo(active);
      }, { once:true });
    }
  }

  buttons.forEach(button => button.addEventListener('click', () => {
    if (button.dataset.themeChoice === currentTheme) return;
    applyTheme(button.dataset.themeChoice, { persist:true });
  }));

  [lightVideo, darkVideo].forEach(video => {
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.addEventListener('error', () => {
      posterMode = true;
      heroMedia?.classList.add('poster-mode');
      lightVideo?.pause();
      darkVideo?.pause();
    });
  });

  document.addEventListener('visibilitychange', () => {
    const active = currentTheme === 'dark' ? darkVideo : lightVideo;
    if (document.hidden) {
      lightVideo?.pause();
      darkVideo?.pause();
    } else if (!posterMode && heroVisible) {
      playVideo(active);
    }
  });

  mobileMedia?.addEventListener?.('change', () => {
    clearTimeout(window.__ktVideoResizeTimer);
    window.__ktVideoResizeTimer = setTimeout(reselectVideoSource, 180);
  });

  systemDark?.addEventListener?.('change', event => {
    if (!localStorage.getItem(THEME_KEY)) applyTheme(event.matches ? 'dark' : 'light');
  });

  function updateTopbar() {
    topbar?.classList.toggle('is-scrolled', window.scrollY > 38);
  }
  window.addEventListener('scroll', updateTopbar, { passive:true });
  updateTopbar();

  const q = new URLSearchParams(location.search);
  const authQuery = q.has('token_hash') || q.has('code') || q.has('type');
  const authHash = /(access_token|refresh_token|type=recovery)/.test(location.hash || '');
  if (authQuery || authHash) {
    location.replace('app.html' + location.search + location.hash);
    return;
  }

  posterMode = shouldUsePosterMode();
  if (posterMode) heroMedia?.classList.add('poster-mode');
  const initialTheme = getInitialTheme();
  updateThemeUI(initialTheme, false);
  setupHeroVisibility();
  applyTheme(initialTheme, { initial:true });
  scheduleWarmup();
})();
