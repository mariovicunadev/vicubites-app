// Publishes Refill reminder events for the Refill Radar web pixel: a line seen on screen and a
// Reorder click. Only the species and a days-left bucket leave the page. Shopify delivers them to
// pixels only when the visitor's consent allows it.
(() => {
  const PREFIX = 'vicubites_refill:';

  const publish = (name, item) => {
    const analytics = window.Shopify && window.Shopify.analytics;
    if (!analytics || typeof analytics.publish !== 'function') return;
    analytics.publish(PREFIX + name, {
      species: item.dataset.refillSpecies,
      bucket: item.dataset.refillBucket,
    });
  };

  const items = document.querySelectorAll('.vb-refill[data-refill-live] .vb-refill__item');
  if (items.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        publish('reminder_viewed', entry.target);
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.5 }
  );
  items.forEach((item) => observer.observe(item));

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('.vb-refill__form')) return;
    const item = form.closest('.vb-refill__item');
    if (item) publish('reminder_clicked', item);
  });
})();
