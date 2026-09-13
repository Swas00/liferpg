/**
 * LIFE RPG // CLASSY TACTICAL DUAL CURSOR ENGINE
 * Smooth, elegant HUD reticle with precision core dot and physics-interpolated ring.
 * Automatically adapts between Dark (Neon Azure) and Light (Sapphire Cobalt) themes.
 */
(function () {
  // Disable on touchscreen devices for native mobile UX
  if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) {
    return;
  }

  function setupCursor() {
    let cursorDot = document.getElementById("rpg-cursor-dot");
    let cursorRing = document.getElementById("rpg-cursor-ring");

    if (!cursorDot) {
      cursorDot = document.createElement("div");
      cursorDot.id = "rpg-cursor-dot";
      cursorDot.className = "cursor-hidden";
      document.body.appendChild(cursorDot);
    }

    if (!cursorRing) {
      cursorRing = document.createElement("div");
      cursorRing.id = "rpg-cursor-ring";
      cursorRing.className = "cursor-hidden";
      document.body.appendChild(cursorRing);
    }

    let mouseX = -100;
    let mouseY = -100;
    let ringX = -100;
    let ringY = -100;
    let isHovered = false;
    let isMouseDown = false;
    let isVisible = false;

    // Direct tracking of pointer coordinates
    window.addEventListener("mousemove", (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (!isVisible) {
        isVisible = true;
        ringX = mouseX;
        ringY = mouseY;
        cursorDot.classList.remove("cursor-hidden");
        cursorRing.classList.remove("cursor-hidden");
      }

      // Zero-latency instant positioning for inner precision dot
      cursorDot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%) ${
        isMouseDown ? "scale(0.5)" : isHovered ? "scale(1.4)" : "scale(1)"
      }`;

      // Contextual interactive hover detection
      const target = e.target;
      const interactiveEl = target && target.closest ? target.closest(
        'button, a, input, select, textarea, [role="button"], .chip, .stat-plus-btn, .quest-checkbox, .inv-slot, .hud-btn, .icon-btn, .quest-card, .shop-card, .console-tab, .del-quest-btn, .close-modal-btn'
      ) : null;

      const shouldHover = !!interactiveEl;
      if (shouldHover !== isHovered) {
        isHovered = shouldHover;
        if (isHovered) {
          cursorRing.classList.add("cursor-hover");
          cursorDot.classList.add("cursor-hover");
        } else {
          cursorRing.classList.remove("cursor-hover");
          cursorDot.classList.remove("cursor-hover");
        }
      }
    }, { passive: true });

    // Smooth physics LERP loop for outer tactical reticle ring
    function renderRing() {
      // 0.18 lerp factor creates an ultra-sleek, fluid trailing effect
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;

      cursorRing.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%) ${
        isMouseDown ? "scale(0.85)" : "scale(1)"
      }`;

      requestAnimationFrame(renderRing);
    }
    requestAnimationFrame(renderRing);

    // Micro-animations on tactile click
    window.addEventListener("mousedown", () => {
      isMouseDown = true;
      cursorRing.classList.add("cursor-click");
      cursorDot.classList.add("cursor-click");
    });

    window.addEventListener("mouseup", () => {
      isMouseDown = false;
      cursorRing.classList.remove("cursor-click");
      cursorDot.classList.remove("cursor-click");
    });

    // Window boundaries: hide when mouse leaves window
    document.addEventListener("mouseleave", () => {
      isVisible = false;
      cursorDot.classList.add("cursor-hidden");
      cursorRing.classList.add("cursor-hidden");
    });

    document.addEventListener("mouseenter", () => {
      isVisible = true;
      cursorDot.classList.remove("cursor-hidden");
      cursorRing.classList.remove("cursor-hidden");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupCursor);
  } else {
    setupCursor();
  }
})();
