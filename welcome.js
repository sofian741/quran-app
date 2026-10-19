(() => {
  'use strict';
  const splash = document.getElementById('ayat-welcome');
  if (!splash) return;
  const line = splash.querySelector('.ayat-welcome-line');
  const arabic = splash.querySelector('.ayat-welcome-ar');
  const english = splash.querySelector('.ayat-welcome-en');
  const subtitle = splash.querySelector('.ayat-welcome-subtitle');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const animate = (element, frames, options) => element.animate(frames, { fill: 'forwards', ...options }).finished;
  async function play() {
      // A single quick turn, then a deliberate pause before the reveal.
      await animate(line, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 850, easing: 'linear' });
      // Stage 2: line extends before either word is revealed.
      await animate(line, [
        { transform: 'rotate(360deg) scaleY(.55)' },
        { transform: 'rotate(360deg) scaleY(1)' }
      ], { duration: 580, easing: 'cubic-bezier(.2,.8,.2,1)' });
      await wait(120);
      // Reveal each word from the central divider using a moving clip edge.
      // No blur or sudden opacity jump.
      await Promise.all([
        animate(arabic, [
          { opacity: 1, clipPath: 'inset(0 0 0 100%)', transform: 'translateX(13px)' },
          { opacity: 1, clipPath: 'inset(0 0 0 0%)', transform: 'translateX(0)' }
        ], { duration: 1250, easing: 'cubic-bezier(.22,1,.36,1)' }),
        animate(english, [
          { opacity: 1, clipPath: 'inset(0 100% 0 0)', transform: 'translateX(-13px)' },
          { opacity: 1, clipPath: 'inset(0 0% 0 0)', transform: 'translateX(0)' }
        ], { duration: 1250, easing: 'cubic-bezier(.22,1,.36,1)' })
      ]);
      await animate(subtitle, [{ opacity: 0 }, { opacity: 1 }], { duration: 650 });
      await wait(800);
    splash.classList.add('is-leaving');
    await wait(700);
    splash.hidden = true;
  }
  play().catch(() => {
    // Never trap the user behind the splash if animations are unsupported.
    splash.classList.add('is-leaving');
    setTimeout(() => { splash.hidden = true; }, 700);
  });
})();
