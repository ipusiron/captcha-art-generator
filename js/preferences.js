// Run before styles so a saved theme does not flash during startup.
(function () {
  let theme = 'light';
  try {
    const saved = localStorage.getItem('theme');
    theme = ['light', 'dark'].includes(saved) ? saved :
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } catch { /* Storage is optional. */ }
  document.documentElement.dataset.theme = theme;
})();
