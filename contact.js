(() => {
  const button = document.getElementById("reveal-contact");
  const details = document.getElementById("contact-details");
  if (!button || !details) return;
  button.hidden = false;
  button.addEventListener("click", () => {
    // Decode only after a visitor asks; the HTML contains no address.
    const address = [41, 34, 60, 41, 52, 40, 40, 54, 58, 47, 51, 27, 60, 54, 58, 50, 55, 117, 56, 52, 54]
      .map(value => String.fromCharCode(value ^ 91)).join("");
    details.textContent = address;
    details.hidden = false;
    button.hidden = true;
    details.focus();
  }, { once: true });
})();
