/* KTC mobile zoom lock.
 * Prevent pinch / gesture zoom on mobile browsers while preserving normal
 * one-finger scrolling and input interaction.
 */
(function () {
  "use strict";

  var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (!isMobile) return;

  document.addEventListener("gesturestart", function (event) {
    event.preventDefault();
  }, { passive: false });

  document.addEventListener("gesturechange", function (event) {
    event.preventDefault();
  }, { passive: false });

  document.addEventListener("gestureend", function (event) {
    event.preventDefault();
  }, { passive: false });

  document.addEventListener("touchmove", function (event) {
    if (event.touches && event.touches.length > 1) {
      event.preventDefault();
    }
  }, { passive: false });

  document.addEventListener("wheel", function (event) {
    if (event.ctrlKey) {
      event.preventDefault();
    }
  }, { passive: false });
})();
