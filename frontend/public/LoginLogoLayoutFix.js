/* KTC TEST: keep the supplied login logo fully visible; never crop the image. */
(() => {
  const apply = () => {
    document.querySelectorAll('img.login-logo-vector').forEach((img) => {
      img.style.width = window.innerWidth <= 430 ? '200px' : window.innerWidth <= 900 ? '225px' : '250px';
      img.style.height = window.innerWidth <= 430 ? '112px' : window.innerWidth <= 900 ? '126px' : '140px';
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
