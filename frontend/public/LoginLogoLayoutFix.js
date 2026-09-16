/* KTC TEST: keep the supplied square logo image cropped to its actual horizontal logo area. */
(() => {
  const apply = () => {
    document.querySelectorAll('img.login-logo-vector').forEach((img) => {
      img.style.width = window.innerWidth <= 430 ? '200px' : window.innerWidth <= 900 ? '225px' : '250px';
      img.style.height = window.innerWidth <= 430 ? '112px' : window.innerWidth <= 900 ? '126px' : '140px';
      img.style.objectFit = 'cover';
      img.style.objectPosition = 'center';
    });
  };
  apply();
  window.addEventListener('resize', apply);
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
})();
