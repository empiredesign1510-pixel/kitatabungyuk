(() => {
  'use strict';

  const ROOT = document.documentElement;
  const THEME_KEY = 'KITA_TABUNG_PUBLIC_THEME';
  const APP_THEME_KEY = 'KITA_TABUNG_THEME_V3';
  const lightVideo = document.getElementById('video-light');
  const darkVideo = document.getElementById('video-dark');
  const topbar = document.getElementById('public-topbar');
  const themeColor = document.getElementById('public-theme-color');
  const buttons = [...document.querySelectorAll('[data-theme-choice]')];
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)');

  function readAppTheme() {
    try {
      const saved = JSON.parse(localStorage.getItem(APP_THEME_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return null;
      if (saved.adaptiveTheme === true) return systemDark?.matches ? 'dark' : 'light';
      return saved.theme === 'dark' ? 'dark' : saved.theme === 'light' ? 'light' : null;
    } catch (_) {
      return null;
    }
  }

  function getInitialTheme() {
    const manual = localStorage.getItem(THEME_KEY);
    if (manual === 'light' || manual === 'dark') return manual;
    return readAppTheme() || (systemDark?.matches ? 'dark' : 'light');
  }

  function safePlay(video) {
    if (!video || reduceMotion?.matches) return;
    video.muted = true;
    const p = video.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  function syncVideos(source, target) {
    if (!source || !target || !Number.isFinite(source.currentTime)) return;
    try {
      const duration = Number.isFinite(target.duration) && target.duration > 0 ? target.duration : 10;
      target.currentTime = Math.min(Math.max(source.currentTime, 0), Math.max(0, duration - .08));
    } catch (_) {}
  }

  function applyTheme(theme, { persist = false } = {}) {
    const next = theme === 'dark' ? 'dark' : 'light';
    const active = next === 'dark' ? darkVideo : lightVideo;
    const inactive = next === 'dark' ? lightVideo : darkVideo;

    // Both clips are matching 10-second scenes. Sync before the opacity crossfade
    // so day/night switching feels like the same moment, not a new video.
    syncVideos(inactive, active);
    safePlay(lightVideo);
    safePlay(darkVideo);

    ROOT.dataset.theme = next;
    themeColor?.setAttribute('content', next === 'dark' ? '#08111A' : '#3B82B8');
    lightVideo?.classList.toggle('active', next === 'light');
    darkVideo?.classList.toggle('active', next === 'dark');

    buttons.forEach(button => {
      const selected = button.dataset.themeChoice === next;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });

    if (persist) {
      try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
    }
  }

  function keepVideosAligned() {
    if (reduceMotion?.matches || !lightVideo || !darkVideo) return;
    const activeTheme = ROOT.dataset.theme === 'dark' ? 'dark' : 'light';
    const source = activeTheme === 'dark' ? darkVideo : lightVideo;
    const target = activeTheme === 'dark' ? lightVideo : darkVideo;
    if (source.readyState >= 2 && target.readyState >= 2 && Math.abs(source.currentTime - target.currentTime) > .22) {
      syncVideos(source, target);
    }
  }

  buttons.forEach(button => button.addEventListener('click', () => applyTheme(button.dataset.themeChoice, { persist: true })));

  [lightVideo, darkVideo].forEach(video => {
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.addEventListener('canplay', () => safePlay(video), { once: true });
  });

  if (reduceMotion?.matches) {
    lightVideo?.pause();
    darkVideo?.pause();
  } else {
    setInterval(keepVideosAligned, 1800);
  }

  systemDark?.addEventListener?.('change', event => {
    if (!localStorage.getItem(THEME_KEY)) applyTheme(event.matches ? 'dark' : 'light');
  });

  function updateTopbar() {
    topbar?.classList.toggle('is-scrolled', window.scrollY > 38);
  }
  window.addEventListener('scroll', updateTopbar, { passive: true });
  updateTopbar();

  // Preserve Supabase auth/recovery links that accidentally land on the public root.
  const q = new URLSearchParams(location.search);
  const authQuery = q.has('token_hash') || q.has('code') || q.has('type');
  const authHash = /(access_token|refresh_token|type=recovery)/.test(location.hash || '');
  if (authQuery || authHash) {
    location.replace('app.html' + location.search + location.hash);
    return;
  }

  applyTheme(getInitialTheme());
})();
