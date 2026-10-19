(() => {
  'use strict';
  const splash = document.getElementById('ayat-welcome');
  if (!splash) return;

  // The brand splash runs on every home launch, independently of onboarding.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animationDuration = reducedMotion ? 800 : 4450;
  const fadeDuration = reducedMotion ? 0 : 650;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => splash.classList.add('is-playing'));
  });

  window.setTimeout(() => {
    splash.classList.add('is-leaving');
    window.setTimeout(() => {
      splash.hidden = true;
    }, fadeDuration);
  }, animationDuration);
})();
