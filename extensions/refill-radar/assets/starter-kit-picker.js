// Ties the starter kit picker to the product form of the same section. The selects live in their
// own block, outside the form; the HTML `form` attribute makes them part of it, so the theme's own
// add to cart (`new FormData(form)`, or a plain submit) sends them as line item properties.
// Without this script the kit is still added and expands into the default choices.
(() => {
  const connect = (picker) => {
    const scope = picker.closest('.shopify-section') || document;
    const form = scope.querySelector('form[action*="/cart/add"]');
    if (!form) return;
    if (!form.id) form.id = 'StarterKitProductForm-' + Math.random().toString(36).slice(2);
    for (const field of picker.querySelectorAll('[data-kit-field]')) {
      field.setAttribute('form', form.id);
    }
  };

  const init = () => document.querySelectorAll('[data-starter-kit-picker]').forEach(connect);

  init();
  // The theme editor re-renders sections in place.
  document.addEventListener('shopify:section:load', init);
})();
