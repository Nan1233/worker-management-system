/* KTC TEST login-logo override: exact user-supplied logo image. */
(() => {
  const logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAIAAAAiOjnJAAAQAElEQVR4AeyZB5wVRdb2T1XnvnnyDFEG";
  const apply = () => {
    document.querySelectorAll('img.login-logo-vector').forEach((img) => {
      if (img.dataset.ktcExactLogo === '1') return;
      img.src = logo;
      img.removeAttribute('srcset');
      img.dataset.ktcExactLogo = '1';
    });
  };
  apply();
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
})();
