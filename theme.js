(() => {
  const root = document.documentElement;
  const preference = matchMedia("(prefers-color-scheme: dark)");
  const storedTheme = () => {
    try { return localStorage.getItem("theme"); } catch { return null; }
  };
  const apply = (theme) => {
    root.dataset.theme = theme === "dark" ? "dark" : "light";
    const button = document.querySelector(".theme-toggle");
    if (button) {
      button.setAttribute("aria-checked", String(theme === "dark"));
      button.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
    }
  };
  apply(["light", "dark"].includes(storedTheme()) ? storedTheme() : preference.matches ? "dark" : "light");
  document.addEventListener("DOMContentLoaded", () => {
    apply(root.dataset.theme);
    document.querySelector(".theme-toggle")?.addEventListener("click", () => {
      const theme = root.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem("theme", theme); } catch { /* Theme still works without storage. */ }
      apply(theme);
    });
  });
  preference.addEventListener("change", () => {
    if (!["light", "dark"].includes(storedTheme())) apply(preference.matches ? "dark" : "light");
  });
})();
