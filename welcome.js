(() => {
  const key = 'ayatWelcomeSeenV1';
  const replay = new URLSearchParams(location.search).get('welcome') === '1';
  let seen = false;
  try { seen = localStorage.getItem(key) === '1'; } catch (_) {}
  if (seen && !replay) return;
  const el = document.getElementById('ayat-welcome');
  if (!el) return;
  el.hidden = false;
  let finished = false;
  let timer;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    try { localStorage.setItem(key, '1'); } catch (_) {}
    el.classList.add('is-leaving');
    setTimeout(() => { el.hidden = true; }, 700);
  };
  el.querySelector('.ayat-welcome-skip').addEventListener('click', finish);
  requestAnimationFrame(() => el.classList.add('is-playing'));
  timer = setTimeout(finish, matchMedia('(prefers-reduced-motion: reduce)').matches ? 1800 : 5200);
})();