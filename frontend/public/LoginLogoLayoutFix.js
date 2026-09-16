/* KTC TEST: keep the supplied login logo fully visible without overriding the responsive CSS. */
(() => {
  const apply = () => {
    document.querySelectorAll('img.login-logo-vector').forEach((img) => {
      img.style.objectFit = 'contain';
      img.style.objectPosition = 'center';
      img.style.maxWidth = '100%';
      img.style.overflow = 'visible';
    });
  };
  apply();
  window.addEventListener('resize', apply);
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
})();
