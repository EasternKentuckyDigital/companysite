(() => {
  const root = document.documentElement;
  const system = matchMedia("(prefers-color-scheme: dark)");
  const validPreference = value => ["light", "dark"].includes(value) ? value : "system";
  let preference;
  try { preference = validPreference(localStorage.getItem("theme")); }
  catch { preference = "system"; }
  const apply = () => {
    root.dataset.theme = preference === "system" ? (system.matches ? "dark" : "light") : preference;
    document.querySelectorAll("[data-theme-select]").forEach(select => { select.value = preference; });
  };
  apply();
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-theme-select]").forEach(select => {
      select.closest(".theme-control").hidden = false;
      select.addEventListener("change", () => {
        preference = validPreference(select.value);
        try {
          if (preference === "system") localStorage.removeItem("theme");
          else localStorage.setItem("theme", preference);
        } catch { /* Keep this visit's preference when storage is unavailable. */ }
        apply();
      });
    });
    apply();
  });
  system.addEventListener("change", apply);
  window.addEventListener("storage", event => {
    if (event.key === "theme" || event.key === null) {
      preference = validPreference(event.newValue);
      apply();
    }
  });
})();
