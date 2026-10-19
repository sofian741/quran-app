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
      // Stage 1: the gold line visibly turns twice, one continuous motion.
      await animate(line, [
        { transform: 'scaleY(.55) rotate(0deg)', offset: 0 },
        { transform: 'scaleY(.55) rotate(360deg)', offset: .5 },
        { transform: 'scaleY(.55) rotate(720deg)', offset: 1 }
      ], { duration: 2000, easing: 'linear' });
      // Stage 2: line extends before either word is revealed.
      await animate(line, [
        { transform: 'scaleY(.55) rotate(720deg)' },
        { transform: 'scaleY(1) rotate(720deg)' }
      ], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' });
      await wait(180);
      // Stage 3: both words emerge smoothly from the center.
      await Promise.all([
        animate(arabic, [
          { opacity: 0, transform: 'translateX(48px)', filter: 'blur(5px)' },
          { opacity: 1, transform: 'translateX(0)', filter: 'blur(0)' }
        ], { duration: 1100, easing: 'cubic-bezier(.2,.8,.2,1)' }),
        animate(english, [
          { opacity: 0, transform: 'translateX(-48px)', filter: 'blur(5px)' },
          { opacity: 1, transform: 'translateX(0)', filter: 'blur(0)' }
        ], { duration: 1100, easing: 'cubic-bezier(.2,.8,.2,1)' })
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
