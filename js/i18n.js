(function () {
  let saved;
  try { saved = localStorage.getItem('language'); } catch { /* Optional storage. */ }
  const query = new URLSearchParams(location.search).get('lang');
  let language = [query, saved].find(value => ['ja', 'en'].includes(value)) ||
    (navigator.language.startsWith('ja') ? 'ja' : 'en');
  function t(key) { return ArtMessages[language][key] || key; }
  function apply() {
    document.documentElement.lang = language;
    document.querySelectorAll('[data-i18n]').forEach(element => {
      element.textContent = t(element.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(element => {
      element.setAttribute('aria-label', t(element.dataset.i18nAria));
    });
    const toggle = document.getElementById('languageToggle');
    toggle.textContent = language === 'ja' ? 'English' : '日本語';
    toggle.lang = language === 'ja' ? 'en' : 'ja';
    document.querySelectorAll('.layer-canvas').forEach((canvas, i) => {
      canvas.setAttribute('aria-label', t('layer') + ' ' + (i + 1));
    });
    document.dispatchEvent(new Event('languagechange'));
  }
  window.ArtI18n = {t, apply};
  document.getElementById('languageToggle').addEventListener('click', () => {
    language = language === 'ja' ? 'en' : 'ja';
    try { localStorage.setItem('language', language); } catch { /* Optional storage. */ }
    apply();
  });
  apply();
})();
