(() => {
  const root = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  const validPreference = value => ['light', 'dark'].includes(value) ? value : 'system';
  const readPreference = () => {
    try { return validPreference(localStorage.getItem('theme')); }
    catch { return 'system'; }
  };
  let preference = readPreference();
  const apply = () => {
    const theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    root.dataset.theme = theme;
    document.querySelectorAll('.theme-toggle').forEach(button => {
      button.setAttribute('aria-checked', String(theme === 'dark'));
      button.title = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
    });
  };
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.theme-toggle').forEach(button => {
      button.hidden = false;
      button.addEventListener('click', () => {
        preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('theme', preference); } catch { /* Keep this visit's preference when storage is unavailable. */ }
        apply();
      });
    });
    apply();
  });
  system.addEventListener('change', apply);
  window.addEventListener('storage', event => {
    if (event.key === 'theme' || event.key === null) {
      preference = readPreference();
      apply();
    }
  });
})();
