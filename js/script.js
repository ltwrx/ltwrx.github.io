(() => {
  "use strict";

  const CONSENT_KEY = "photography-portfolio:sensitive-consent:v1";
  const photos = Array.isArray(window.PORTFOLIO_PHOTOS) ? window.PORTFOLIO_PHOTOS : [];
  const site = window.PORTFOLIO_SITE || {};

  const gallery = document.querySelector("#gallery");
  const consentOverlay = document.querySelector("#consent-overlay");
  const consentDialog = document.querySelector("#consent-dialog");
  const acceptSensitiveButton = document.querySelector("#accept-sensitive");
  const dismissSensitiveButton = document.querySelector("#dismiss-sensitive");
  const lightboxOverlay = document.querySelector("#lightbox-overlay");
  const lightboxDialog = document.querySelector("#lightbox-dialog");
  const lightboxFigure = document.querySelector(".lightbox-figure");
  const lightboxCaption = document.querySelector(".lightbox-caption");
  const lightboxImage = document.querySelector("#lightbox-image");
  const lightboxImageFallback = document.querySelector("#lightbox-image-fallback");
  const lightboxTitle = document.querySelector("#lightbox-title");
  const photoTitle = document.querySelector("#lightbox-photo-title");
  const photoDate = document.querySelector("#lightbox-date");
  const photoTags = document.querySelector("#lightbox-tags");
  const photoCount = document.querySelector("#lightbox-count");
  const photoCredit = document.querySelector("#lightbox-credit");
  const closeButton = document.querySelector("#lightbox-close");
  const previousButton = document.querySelector("#lightbox-previous");
  const nextButton = document.querySelector("#lightbox-next");
  const copyButton = document.querySelector("#copy-link");
  const copyStatus = document.querySelector("#copy-link-status");
  const scrollCue = document.querySelector("#lightbox-scroll-cue");
  const mobileLightbox = window.matchMedia(
    "(max-width: 760px), (max-height: 500px) and (hover: none) and (pointer: coarse)",
  );
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const cards = new Map();
  const pendingFullImagePreloads = new Map();
  const readyFullImageSources = new Set();
  let activeIndex = null;
  let pendingSensitiveId = null;
  let openedWithPush = false;
  let consentGranted = readConsent();
  let lastFocusedElement = null;
  let bodyLockState = null;
  let touchStart = null;
  let copyResetTimer = null;
  let layoutFrame = null;
  let scrollCueTimer = null;
  let transitionRunning = false;
  let navigationQueue = [];
  let syncCustomScrollbar = () => {};
  let refreshCursorTargets = () => {};

  function readConsent() {
    try {
      return window.localStorage.getItem(CONSENT_KEY) === "accepted";
    } catch {
      return false;
    }
  }

  function icon(name) {
    const element = document.createElement("span");
    element.className = `ui-icon ui-icon-${name}`;
    element.setAttribute("aria-hidden", "true");
    return element;
  }

  function photoPath(filename) {
    return `./images/${String(filename)
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")}`;
  }

  function thumbnailPath(filename) {
    return `./images/thumbnails/${String(filename)
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")}`;
  }

  function isGated(photo) {
    return photo.sensitivity !== "none" && !consentGranted;
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = value;
    });
  }

  function setInquiries(items) {
    const inquiries = Array.isArray(items) ? items.filter(Boolean) : [];
    const groups = [inquiries.slice(0, 2), inquiries.slice(2)].filter((group) => group.length);

    document.querySelectorAll("[data-site-inquiries]").forEach((element) => {
      const fragment = document.createDocumentFragment();

      groups.forEach((group) => {
        const span = document.createElement("span");
        span.className = "inquiry-group";
        span.textContent = group.join(" · ");
        fragment.append(span);
      });

      element.replaceChildren(fragment);
    });
  }

  function setupCustomCursor() {
    const precisePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!precisePointer.matches || !("PointerEvent" in window)) return;

    const cursor = document.createElement("span");
    const fill = document.createElement("span");
    cursor.className = "custom-cursor";
    cursor.setAttribute("aria-hidden", "true");
    fill.className = "custom-cursor-fill";
    cursor.append(fill);
    document.body.append(cursor);
    document.documentElement.classList.add("has-custom-cursor");

    const INTERACTIVE = "a[href], button:not([disabled]), #lightbox-image, .custom-scrollbar-thumb";
    const cursorRadius = 12;
    const restScale = 0.25;
    const fullScale = 1;
    const proximityRadius = 96;
    let frame = null;
    let x = -60;
    let y = -60;
    let visible = false;
    let fillScale = restScale;
    let targets = [];
    let targetStamp = 0;
    let metricScroll = -1;
    let metricWidth = 0;
    let metricHeight = 0;

    const collectTargets = () => {
      const next = [];
      const modal = !consentOverlay.hidden
        ? consentOverlay
        : !lightboxOverlay.hidden
          ? lightboxOverlay
          : null;
      document.querySelectorAll(INTERACTIVE).forEach((element) => {
        if (element.closest(".custom-cursor")) return;
        if (modal) {
          if (!modal.contains(element)) return;
        } else if (element.closest(".modal-backdrop")) {
          return;
        }
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;
        next.push(rect);
      });
      targets = next;
      targetStamp = performance.now();
      metricScroll = window.scrollY;
      metricWidth = window.innerWidth;
      metricHeight = window.innerHeight;
    };

    const nearestDistance = (px, py) => {
      let min = Infinity;
      for (let i = 0; i < targets.length; i += 1) {
        const rect = targets[i];
        const dx = px < rect.left ? rect.left - px : px > rect.right ? px - rect.right : 0;
        const dy = py < rect.top ? rect.top - py : py > rect.bottom ? py - rect.bottom : 0;
        const distance = dx === 0 && dy === 0 ? 0 : Math.hypot(dx, dy);
        if (distance < min) min = distance;
        if (min === 0) break;
      }
      return min;
    };

    const render = () => {
      frame = null;
      if (
        metricScroll !== window.scrollY ||
        metricWidth !== window.innerWidth ||
        metricHeight !== window.innerHeight ||
        performance.now() - targetStamp > 90
      ) {
        collectTargets();
      }

      cursor.style.transform = `translate3d(${x - cursorRadius}px, ${y - cursorRadius}px, 0)`;

      const distance = nearestDistance(x, y);
      const proximity = distance >= proximityRadius ? 0 : 1 - distance / proximityRadius;
      const eased = proximity * proximity * (3 - 2 * proximity);
      const targetScale = restScale + (fullScale - restScale) * eased;
      if (reducedMotion.matches) fillScale = targetScale;
      else fillScale += (targetScale - fillScale) * 0.3;
      if (Math.abs(fillScale - targetScale) < 0.002) fillScale = targetScale;
      fill.style.transform = `scale(${fillScale})`;

      if (Math.abs(fillScale - targetScale) > 0.002) {
        frame = window.requestAnimationFrame(render);
      }
    };

    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(render);
    };

    const moveCursor = (event) => {
      x = event.clientX;
      y = event.clientY;
      schedule();
    };

    const trackCursor = (event) => {
      moveCursor(event);
      if (visible) return;
      visible = true;
      cursor.classList.add("is-visible");
    };

    const hideCursor = () => {
      if (!visible) return;
      visible = false;
      fillScale = restScale;
      fill.style.transform = `scale(${restScale})`;
      cursor.classList.remove("is-visible");
    };

    refreshCursorTargets = () => {
      targetStamp = 0;
      if (visible) schedule();
    };

    document.addEventListener("pointermove", trackCursor, { passive: true });
    document.documentElement.addEventListener("pointerleave", hideCursor);
    window.addEventListener("blur", hideCursor);
    window.addEventListener("scroll", () => {
      if (visible) schedule();
    }, { passive: true });
  }

  function setupCustomScrollbar() {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!finePointer.matches) return;

    const root = document.documentElement;
    const track = document.createElement("div");
    const thumb = document.createElement("div");
    const pebble = document.createElement("span");
    track.className = "custom-scrollbar";
    thumb.className = "custom-scrollbar-thumb";
    pebble.className = "custom-scrollbar-pebble";
    thumb.append(pebble);
    track.append(thumb);
    track.setAttribute("aria-hidden", "true");
    document.body.append(track);
    root.classList.add("has-custom-scrollbar");

    const allowMotion = !reducedMotion.matches;
    const minThumb = 48;
    const trackPad = 10;
    let frame = null;
    let lastScroll = window.scrollY;
    let lastTime = performance.now();
    let velocity = 0;
    let squash = 0;
    let displayY = trackPad;
    let dragging = false;
    let dragOffset = 0;
    let metrics = { visible: false, thumb: minThumb, y: trackPad, maxScroll: 0, maxTravel: 0 };

    const readMetrics = () => {
      const view = root.clientHeight;
      const content = root.scrollHeight;
      const maxScroll = Math.max(0, content - view);
      const travel = Math.max(0, view - trackPad * 2);
      const thumbSize = maxScroll === 0 ? travel : Math.max(minThumb, Math.round((view / content) * travel));
      const maxTravel = Math.max(0, travel - thumbSize);
      const y = maxScroll === 0 ? trackPad : trackPad + (window.scrollY / maxScroll) * maxTravel;
      return {
        visible: maxScroll > 1 && !bodyLockState,
        thumb: thumbSize,
        y,
        maxScroll,
        maxTravel,
      };
    };

    const tick = (now) => {
      frame = null;
      metrics = readMetrics();
      track.classList.toggle("is-visible", metrics.visible);
      if (!metrics.visible) {
        velocity = 0;
        squash = 0;
        displayY = metrics.y;
        return;
      }

      const dt = Math.max(8, now - lastTime);
      const nextScroll = window.scrollY;
      const instant = (nextScroll - lastScroll) / dt;
      velocity = velocity * 0.92 + instant * 0.08;
      lastScroll = nextScroll;
      lastTime = now;

      if (allowMotion && !dragging) {
        squash += (Math.min(1, Math.abs(velocity) * 5) - squash) * 0.07;
      } else {
        squash *= 0.9;
      }
      if (squash < 0.004) squash = 0;
      if (Math.abs(velocity) < 0.0015) velocity = 0;

      displayY += (metrics.y - displayY) * (allowMotion && !dragging ? 0.16 : 1);

      const stretch = allowMotion ? 1 + squash * 0.07 : 1;
      const thin = allowMotion ? 1 - squash * 0.16 : 1;
      pebble.style.transformOrigin = "center center";
      pebble.style.transform = `scaleX(${thin}) scaleY(${stretch})`;
      thumb.style.height = `${metrics.thumb}px`;
      thumb.style.transform = `translate3d(0, ${displayY}px, 0)`;
      track.classList.toggle("is-scrolling", (squash > 0 || velocity !== 0) && !dragging);

      if (squash > 0 || velocity !== 0 || Math.abs(displayY - metrics.y) > 0.2) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(tick);
    };

    const scrollToRatio = (clientY) => {
      if (metrics.maxTravel <= 0) return;
      const y = Math.min(metrics.maxTravel, Math.max(0, clientY - trackPad - dragOffset));
      window.scrollTo({ top: (y / metrics.maxTravel) * metrics.maxScroll, behavior: "auto" });
    };

    thumb.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      dragging = true;
      track.classList.add("is-dragging");
      dragOffset = event.clientY - thumb.getBoundingClientRect().top;
      thumb.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    thumb.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      scrollToRatio(event.clientY);
      schedule();
    });

    const endDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      track.classList.remove("is-dragging");
      if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId);
      schedule();
    };

    thumb.addEventListener("pointerup", endDrag);
    thumb.addEventListener("pointercancel", endDrag);
    thumb.addEventListener("pointerenter", () => track.classList.add("is-hover"));
    thumb.addEventListener("pointerleave", () => {
      if (!dragging) track.classList.remove("is-hover");
    });

    track.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target === thumb || thumb.contains(event.target)) return;
      metrics = readMetrics();
      dragOffset = metrics.thumb / 2;
      scrollToRatio(event.clientY);
      schedule();
    });

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    if ("ResizeObserver" in window) {
      new ResizeObserver(schedule).observe(root);
    }

    syncCustomScrollbar = schedule;
    schedule();
  }

  function applySiteContent() {
    const name = site.name || "Lightworks";
    const copyrightName = site.copyrightName || name;
    const description = site.description || "Lightworks Studio ∙ Photographer working across portraits, figure studies, travel, landscapes and quiet observations.";
    const email = site.email || "lightworks.studio@outlook.com";
    const location = site.location || "Poland";

    setText("[data-site-name]", name);
    setText("[data-site-copyright-name]", copyrightName);
    setText("[data-site-eyebrow]", site.eyebrow || "Photography · Selected works");
    setText("[data-site-description]", description);
    document.querySelectorAll("[data-site-location]").forEach((element) => {
      const country = document.createElement("strong");
      country.textContent = location;
      element.replaceChildren(document.createTextNode("Based in "), country);
    });
    setInquiries(site.inquiries);
    setText("[data-current-year]", new Date().getFullYear());

    document.querySelectorAll("[data-site-email]").forEach((element) => {
      element.textContent = email;
      element.href = `mailto:${email}`;
    });

    document.title = `${name} ∙ Portfolio`;
    const pageDescription = document.querySelector('meta[name="description"]');
    const openGraphTitle = document.querySelector('meta[property="og:title"]');
    const openGraphDescription = document.querySelector('meta[property="og:description"]');
    const openGraphSite = document.querySelector('meta[property="og:site_name"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    if (pageDescription) pageDescription.content = description;
    if (openGraphTitle) openGraphTitle.content = `${name} ∙ Portfolio`;
    if (openGraphDescription) openGraphDescription.content = description;
    if (openGraphSite) openGraphSite.content = `${name} ∙ Portfolio`;
    if (twitterTitle) twitterTitle.content = `${name} ∙ Portfolio`;
    if (twitterDescription) twitterDescription.content = description;
  }

  function createFallback() {
    const fallback = document.createElement("span");
    fallback.className = "image-fallback";
    fallback.hidden = true;
    fallback.append(icon("image-unavailable"));
    const label = document.createElement("span");
    label.textContent = "Image unavailable";
    fallback.append(label);
    return fallback;
  }

  function createSensitiveLabel() {
    const label = document.createElement("span");
    label.className = "sensitive-label";
    label.append(icon("sensitive-hidden"));
    const title = document.createElement("span");
    title.textContent = "Sensitive work";
    const action = document.createElement("small");
    action.textContent = "View";
    label.append(title, action);
    return label;
  }

  function markImageLoaded(image, placeholder) {
    if (!image.naturalWidth) return;
    image.classList.add("is-loaded");
    placeholder.classList.add("is-hidden");
  }

  function createGallery() {
    if (!gallery) return;
    if (photos.length === 0) {
      const message = document.createElement("div");
      const eyebrow = document.createElement("p");
      const title = document.createElement("h2");
      const description = document.createElement("p");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = "Selected works";
      title.textContent = "The next frame is coming.";
      description.textContent = "This portfolio is currently being curated.";
      message.append(eyebrow, title, description);
      gallery.replaceChildren(message);
      gallery.classList.add("is-ready", "empty-state");
      gallery.setAttribute("aria-busy", "false");
      updateGalleryHeading();
      return;
    }
    const fragment = document.createDocumentFragment();

    photos.forEach((photo, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "photo-card";
      card.dataset.photoId = photo.id;

      const placeholder = document.createElement("span");
      placeholder.className = "image-placeholder";
      placeholder.setAttribute("aria-hidden", "true");

      const image = document.createElement("img");
      image.dataset.photoId = photo.id;
      image.width = photo.width;
      image.height = photo.height;
      image.loading = "eager";
      image.fetchPriority = index < 6 ? "high" : "auto";
      image.decoding = "async";
      image.draggable = false;

      const fallback = createFallback();
      const sensitiveLabel = createSensitiveLabel();
      const number = document.createElement("span");
      number.className = "photo-number";
      number.setAttribute("aria-hidden", "true");
      number.textContent = String(index + 1).padStart(2, "0");

      image.addEventListener("load", () => markImageLoaded(image, placeholder));
      image.addEventListener("error", () => {
        image.hidden = true;
        fallback.hidden = false;
        placeholder.classList.add("is-hidden");
      });
      image.addEventListener("contextmenu", (event) => event.preventDefault());
      card.addEventListener("click", () => openPhoto(index, true));

      card.append(placeholder, image, fallback, sensitiveLabel, number);
      fragment.append(card);
      cards.set(photo.id, { card, image, sensitiveLabel });
      image.src = thumbnailPath(photo.filename);

      if (image.complete) {
        queueMicrotask(() => markImageLoaded(image, placeholder));
      }
    });

    gallery.replaceChildren(fragment);
    gallery.setAttribute("aria-busy", "false");
    updateGating();
    updateGalleryHeading();
    requestLayout();
  }

  function updateGalleryHeading() {
    const count = document.querySelector("#photo-count");
    const years = document.querySelector("#photo-years");
    if (count) count.textContent = photos.length;
    const availableYears = photos
      .map((photo) => Number(photo.captureYear))
      .filter((year) => Number.isFinite(year));
    if (years && availableYears.length) {
      const first = Math.min(...availableYears);
      const last = Math.max(...availableYears);
      years.textContent = first === last ? String(first) : `${first}–${last}`;
    }
  }

  function updateGating() {
    photos.forEach((photo) => {
      const record = cards.get(photo.id);
      if (!record) return;
      const gated = isGated(photo);
      record.card.classList.toggle("is-gated", gated);
      record.sensitiveLabel.hidden = !gated;
      record.image.alt = gated
        ? "Sensitive artistic photograph, hidden until consent."
        : photo.alt || "Untitled photograph";
      record.card.setAttribute(
        "aria-label",
        gated
          ? "Sensitive artistic photograph. Open the content warning to view."
          : `Open photograph: ${photo.alt || "Untitled photograph"}`,
      );
    });
  }

  function columnCountForWidth(width) {
    if (width < 880) return 2;
    if (width < 1240) return 3;
    if (width < 1640) return 4;
    if (width < 2180) return 5;
    return 6;
  }

  function layoutGallery() {
    layoutFrame = null;
    if (!gallery || photos.length === 0) return;
    const width = gallery.getBoundingClientRect().width;
    if (width <= 0) return;

    const gap = Number.parseFloat(
      window.getComputedStyle(gallery).getPropertyValue("--gallery-gap"),
    ) || 12;
    const columns = Math.min(columnCountForWidth(width), photos.length);
    const columnWidth = Math.floor((width - gap * (columns - 1)) / columns);
    const heights = Array.from({ length: columns }, () => 0);

    photos.forEach((photo) => {
      let column = 0;
      for (let index = 1; index < heights.length; index += 1) {
        if (heights[index] < heights[column]) column = index;
      }
      const height = Math.round(columnWidth * (photo.height / photo.width));
      const record = cards.get(photo.id);
      if (record) {
        record.card.style.width = `${columnWidth}px`;
        record.card.style.height = `${height}px`;
        record.card.style.left = `${column * (columnWidth + gap)}px`;
        record.card.style.top = `${heights[column]}px`;
        record.card.style.transform = "none";
      }
      heights[column] += height + gap;
    });

    gallery.style.height = `${Math.max(...heights) - gap}px`;
    gallery.classList.add("is-ready");
    syncCustomScrollbar();
    refreshCursorTargets();
  }
  function requestLayout() {
    if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(layoutGallery);
  }

  function lockBody() {
    if (bodyLockState) return;
    const body = document.body;
    bodyLockState = {
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    syncCustomScrollbar();
    refreshCursorTargets();
  }

  function unlockBody() {
    if (!bodyLockState || !consentOverlay.hidden || !lightboxOverlay.hidden) return;
    document.body.style.overflow = bodyLockState.overflow;
    document.body.style.paddingRight = bodyLockState.paddingRight;
    bodyLockState = null;
    syncCustomScrollbar();
    refreshCursorTargets();
  }

  function rememberFocus() {
    if (consentOverlay.hidden && lightboxOverlay.hidden) {
      lastFocusedElement = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
  }

  function restoreFocus() {
    const target = lastFocusedElement;
    lastFocusedElement = null;
    if (target && document.contains(target)) {
      window.setTimeout(() => target.focus({ preventScroll: true }), 0);
    }
  }

  function cleanPhotoUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("photo");
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function replaceCleanPhotoUrl() {
    window.history.replaceState(null, "", cleanPhotoUrl());
  }

  function showConsent(photo) {
    if (!consentOverlay.hidden) return;
    pendingSensitiveId = photo.id;
    rememberFocus();
    consentOverlay.hidden = false;
    lockBody();
    window.setTimeout(() => acceptSensitiveButton.focus({ preventScroll: true }), 0);
  }

  function hideConsent(restore = true) {
    consentOverlay.hidden = true;
    pendingSensitiveId = null;
    unlockBody();
    if (restore) restoreFocus();
  }

  function acceptSensitive() {
    try {
      window.localStorage.setItem(CONSENT_KEY, "accepted");
    } catch {
      // Consent remains active for this visit if browser storage is unavailable.
    }
    if (pendingSensitiveId && new URLSearchParams(window.location.search).has("photo")) {
      replaceCleanPhotoUrl();
    }
    consentGranted = true;
    updateGating();
    hideConsent(true);
  }

  function dismissConsent() {
    if (new URLSearchParams(window.location.search).has("photo")) replaceCleanPhotoUrl();
    hideConsent(true);
  }

  function setOptionalText(element, value) {
    element.textContent = value || "";
    element.hidden = !value;
  }

  function renderLightbox(photo, index) {
    const title = photo.title || `Photograph ${index + 1} of ${photos.length}`;
    lightboxTitle.textContent = title;
    lightboxImage.hidden = false;
    lightboxImageFallback.hidden = true;
    lightboxImage.alt = photo.alt || "Untitled photograph";
    lightboxImage.width = photo.width;
    lightboxImage.height = photo.height;
    lightboxImage.src = photoPath(photo.filename);

    setOptionalText(photoTitle, photo.title);
    const date = photo.captureMonth && photo.captureYear
      ? `${photo.captureMonth} ${photo.captureYear}`
      : photo.captureYear
        ? String(photo.captureYear)
        : "";
    setOptionalText(photoDate, date);
    setOptionalText(photoTags, Array.isArray(photo.tags) ? photo.tags.join(" · ") : "");
    photoCount.textContent = `${String(index + 1).padStart(2, "0")} / ${String(photos.length).padStart(2, "0")}`;

    photoCredit.replaceChildren();
    const muses = [].concat(photo.muse || []).filter(Boolean);
    if (muses.length) {
      const label = document.createElement("span");
      label.textContent = `${muses.length > 1 ? "Muses" : "Muse"}:`;
      const names = document.createElement("span");
      names.className = "muse-name";
      names.textContent = muses.join(", ");
      photoCredit.append(label, names);
      photoCredit.hidden = false;
    } else {
      photoCredit.hidden = true;
    }

    copyStatus.textContent = "Copy link";
  }

  function clearScrollCue() {
    if (scrollCueTimer !== null) {
      window.clearTimeout(scrollCueTimer);
      scrollCueTimer = null;
    }
    lightboxOverlay.classList.remove("show-scroll-cue");
  }

  function showScrollCue() {
    clearScrollCue();
    if (!mobileLightbox.matches || reducedMotion.matches || !scrollCue) return;
    scrollCue.hidden = false;
    window.requestAnimationFrame(() => {
      lightboxOverlay.classList.add("show-scroll-cue");
    });
    scrollCueTimer = window.setTimeout(clearScrollCue, 3600);
  }

  function subtleHaptic() {
    if (!mobileLightbox.matches || reducedMotion.matches || !("vibrate" in navigator)) return;
    navigator.vibrate(5);
  }

  function preloadFullPhoto(photo) {
    if (!photo) return Promise.resolve(false);
    const source = photoPath(photo.filename);
    if (readyFullImageSources.has(source)) return Promise.resolve(true);
    if (pendingFullImagePreloads.has(source)) return pendingFullImagePreloads.get(source);

    const preload = new Image();
    preload.decoding = "async";
    const ready = new Promise((resolve) => {
      preload.addEventListener("load", async () => {
        try {
          if (typeof preload.decode === "function") await preload.decode();
        } catch {
          // A successful load is still safe to display when explicit decoding is unavailable.
        }
        readyFullImageSources.add(source);
        resolve(true);
      }, { once: true });
      preload.addEventListener("error", () => resolve(false), { once: true });
      preload.src = source;
    });

    pendingFullImagePreloads.set(source, ready);
    ready.finally(() => pendingFullImagePreloads.delete(source));
    return ready;
  }

  function preloadNeighboringPhotos(index) {
    if (index === null || photos.length < 2) return;
    [-1, 1].forEach((direction) => {
      for (let step = 1; step <= photos.length; step += 1) {
        const candidate = (index + direction * step + photos.length) % photos.length;
        if (!isGated(photos[candidate])) {
          void preloadFullPhoto(photos[candidate]);
          break;
        }
      }
    });
  }

  async function waitForDisplayedPhoto() {
    if (!lightboxImage.complete) {
      await new Promise((resolve) => {
        lightboxImage.addEventListener("load", resolve, { once: true });
        lightboxImage.addEventListener("error", resolve, { once: true });
      });
    }
    if (!lightboxImage.hidden && typeof lightboxImage.decode === "function") {
      try {
        await lightboxImage.decode();
      } catch {
        // The load and error handlers own the visible fallback state.
      }
    }
  }

  function openPhoto(index, pushHistory) {
    const photo = photos[index];
    if (!photo) return;
    if (isGated(photo)) {
      showConsent(photo);
      return;
    }

    rememberFocus();
    activeIndex = index;
    openedWithPush = Boolean(pushHistory || window.history.state?.portfolioPhoto);
    renderLightbox(photo, index);

    if (pushHistory) {
      const url = new URL(window.location.href);
      url.searchParams.set("photo", photo.id);
      window.history.pushState(
        { portfolioPhoto: true },
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }

    lightboxOverlay.hidden = false;
    lockBody();
    showScrollCue();
    window.setTimeout(() => closeButton.focus({ preventScroll: true }), 0);
  }

  // Desktop slides the whole figure. On mobile the caption stays pinned to the
  // bottom edge: only the picture moves, while the lines that change from one
  // photograph to the next roll out and back in without leaving their place.
  const pictureElements = [lightboxImage, lightboxImageFallback];
  const pictureTargets = () => (mobileLightbox.matches ? pictureElements : [lightboxFigure]);
  const captionLines = () => Array.from(lightboxCaption.querySelectorAll(".lightbox-roll > *"));
  const captionRollTargets = () => (mobileLightbox.matches ? captionLines() : []);

  function setMotionStyles(targets, transform, opacity) {
    targets.forEach((element) => {
      element.style.transform = transform;
      element.style.opacity = opacity;
    });
  }

  function clearMotionStyles(targets) {
    targets.forEach((element) => {
      element.style.removeProperty("transform");
      element.style.removeProperty("opacity");
    });
  }

  function resetMotion(cancelAnimations = false) {
    const targets = [lightboxFigure, ...pictureElements, ...captionLines()];
    if (cancelAnimations) {
      targets.forEach((element) => element.getAnimations().forEach((animation) => animation.cancel()));
    }
    clearMotionStyles(targets);
  }

  function playMotion(targets, keyframes, options) {
    const animations = targets.map((element) => element.animate(keyframes, options));
    return {
      finished: Promise.all(animations.map((animation) => animation.finished)),
      cancel: () => animations.forEach((animation) => animation.cancel()),
    };
  }

  function hideLightbox(restore = true) {
    clearScrollCue();
    navigationQueue.length = 0;
    lightboxOverlay.hidden = true;
    activeIndex = null;
    openedWithPush = false;
    lightboxImage.removeAttribute("src");
    resetMotion(true);
    transitionRunning = false;
    unlockBody();
    if (restore) restoreFocus();
  }

  function closeLightbox() {
    if (openedWithPush) {
      window.history.back();
    } else {
      replaceCleanPhotoUrl();
      hideLightbox(true);
    }
  }

  function findNavigableIndex(direction) {
    if (activeIndex === null) return null;
    for (let step = 1; step <= photos.length; step += 1) {
      const candidate = (activeIndex + direction * step + photos.length) % photos.length;
      if (!isGated(photos[candidate])) return candidate;
    }
    return null;
  }

  function commitNavigation(candidate) {
    activeIndex = candidate;
    const photo = photos[candidate];
    const url = new URL(window.location.href);
    url.searchParams.set("photo", photo.id);
    window.history.replaceState(
      openedWithPush ? { portfolioPhoto: true } : null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    renderLightbox(photo, candidate);
  }

  async function animateNavigation(candidate, direction, dragOffset = 0) {
    const targetReady = preloadFullPhoto(photos[candidate]);
    if (reducedMotion.matches || !("animate" in lightboxFigure)) {
      await targetReady;
      commitNavigation(candidate);
      await waitForDisplayedPhoto();
      resetMotion();
      return;
    }

    const mobile = mobileLightbox.matches;
    const picture = pictureTargets();
    const start = mobile
      ? `translate3d(0, ${dragOffset}px, 0)`
      : "translate3d(0, 0, 0)";
    const outgoing = mobile
      ? `translate3d(0, ${direction > 0 ? "-18vh" : "18vh"}, 0)`
      : `translate3d(${direction > 0 ? "-12vw" : "12vw"}, 0, 0)`;
    const incoming = mobile
      ? `translate3d(0, ${direction > 0 ? "18vh" : "-18vh"}, 0)`
      : `translate3d(${direction > 0 ? "12vw" : "-12vw"}, 0, 0)`;

    // The caption lines roll one line height, in the same direction as the picture.
    const rollOut = `translate3d(0, ${direction > 0 ? "-110%" : "110%"}, 0)`;
    const rollIn = `translate3d(0, ${direction > 0 ? "110%" : "-110%"}, 0)`;
    const rest = "translate3d(0, 0, 0)";

    resetMotion();
    const exitOptions = { duration: mobile ? 210 : 240, easing: "cubic-bezier(0.55, 0, 1, 0.45)", fill: "forwards" };
    const exitAnimation = playMotion(picture, [
      { transform: start, opacity: 1 },
      { transform: outgoing, opacity: 0 },
    ], exitOptions);
    const captionExit = playMotion(captionRollTargets(), [
      { transform: rest, opacity: 1 },
      { transform: rollOut, opacity: 0 },
    ], exitOptions);
    await Promise.all([exitAnimation.finished, captionExit.finished, targetReady]);
    commitNavigation(candidate);
    await waitForDisplayedPhoto();
    subtleHaptic();

    // Rendering the new photograph replaced the muse line, so look the lines up again.
    const incomingLines = captionRollTargets();
    setMotionStyles(picture, incoming, "0");
    setMotionStyles(incomingLines, rollIn, "0");
    const enterOptions = { duration: mobile ? 430 : 460, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both" };
    const enterAnimation = playMotion(picture, [
      { transform: incoming, opacity: 0 },
      { transform: rest, opacity: 1 },
    ], enterOptions);
    const captionEnter = playMotion(incomingLines, [
      { transform: rollIn, opacity: 0 },
      { transform: rest, opacity: 1 },
    ], enterOptions);
    exitAnimation.cancel();
    captionExit.cancel();
    await Promise.all([enterAnimation.finished, captionEnter.finished]);
    setMotionStyles(picture, rest, "1");
    clearMotionStyles(incomingLines);
    enterAnimation.cancel();
    captionEnter.cancel();
  }

  async function navigate(direction, dragOffset = 0) {
    if (activeIndex === null || photos.length < 2) return;
    if (transitionRunning) {
      navigationQueue.push({ direction, dragOffset });
      return;
    }
    await runNavigation(direction, dragOffset);
  }

  async function runNavigation(direction, dragOffset) {
    const candidate = findNavigableIndex(direction);
    if (candidate === null) return;
    transitionRunning = true;
    clearScrollCue();
    try {
      await animateNavigation(candidate, direction, dragOffset);
    } catch {
      if (!lightboxOverlay.hidden && activeIndex !== candidate) commitNavigation(candidate);
    } finally {
      resetMotion();
      transitionRunning = false;
    }

    if (lightboxOverlay.hidden) {
      navigationQueue.length = 0;
      return;
    }
    const next = navigationQueue.shift();
    if (next) await runNavigation(next.direction, next.dragOffset);
  }

  function readUrl() {
    const id = new URLSearchParams(window.location.search).get("photo");
    if (!id) {
      if (!lightboxOverlay.hidden) hideLightbox(true);
      if (!consentOverlay.hidden) hideConsent(true);
      return;
    }

    const index = photos.findIndex((photo) => photo.id === id);
    if (index < 0) {
      replaceCleanPhotoUrl();
      if (!lightboxOverlay.hidden) hideLightbox(true);
      return;
    }

    if (isGated(photos[index])) {
      if (!lightboxOverlay.hidden) hideLightbox(false);
      showConsent(photos[index]);
      return;
    }

    if (!consentOverlay.hidden) hideConsent(false);
    openPhoto(index, false);
  }

  function focusableElements(dialog) {
    return Array.from(
      dialog.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'),
    ).filter((element) => !element.hidden && element.getClientRects().length > 0);
  }

  function handleKeyboard(event) {
    const dialog = !consentOverlay.hidden
      ? consentDialog
      : !lightboxOverlay.hidden
        ? lightboxDialog
        : null;
    if (!dialog) return;

    if (event.key === "Escape") {
      event.preventDefault();
      consentOverlay.hidden ? closeLightbox() : dismissConsent();
      return;
    }
    if (consentOverlay.hidden && !mobileLightbox.matches && event.key === "ArrowLeft") {
      event.preventDefault();
      navigate(-1);
      return;
    }
    if (consentOverlay.hidden && !mobileLightbox.matches && event.key === "ArrowRight") {
      event.preventDefault();
      navigate(1);
      return;
    }
    if (consentOverlay.hidden && mobileLightbox.matches && event.key === "ArrowUp") {
      event.preventDefault();
      navigate(-1);
      return;
    }
    if (consentOverlay.hidden && mobileLightbox.matches && event.key === "ArrowDown") {
      event.preventDefault();
      navigate(1);
      return;
    }
    if (event.key !== "Tab") return;

    const items = focusableElements(dialog);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function copyCurrentLink() {
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(window.location.href);
        copied = true;
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = window.location.href;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        copied = document.execCommand("copy");
        textarea.remove();
      }
    } catch {
      copied = false;
    }

    copyStatus.textContent = copied ? "Copied" : "Copy failed";
    if (copyResetTimer !== null) window.clearTimeout(copyResetTimer);
    copyResetTimer = window.setTimeout(() => {
      copyStatus.textContent = "Copy link";
    }, 1800);
  }

  function handleTouchStart(event) {
    if (lightboxOverlay.hidden || !mobileLightbox.matches) return;
    if (event.target instanceof Element && event.target.closest("button, a")) return;
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY, offset: 0 };
    clearScrollCue();
    // A swipe made while a transition is playing still counts: it is queued by
    // navigate() and runs once the current animation ends.
    if (!transitionRunning) {
      pictureTargets().forEach((element) => element.getAnimations().forEach((animation) => animation.cancel()));
    }
  }

  function handleTouchMove(event) {
    if (!touchStart || lightboxOverlay.hidden) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    if (Math.abs(dx) > Math.abs(dy) * 1.15) return;
    event.preventDefault();
    if (transitionRunning) return;
    const offset = Math.max(-96, Math.min(96, dy * 0.72));
    touchStart.offset = offset;
    setMotionStyles(
      pictureTargets(),
      `translate3d(0, ${offset}px, 0)`,
      String(1 - Math.min(Math.abs(offset) / 420, 0.18)),
    );
  }

  function handleTouchEnd(event) {
    if (!touchStart || lightboxOverlay.hidden) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    const offset = touchStart.offset;
    touchStart = null;
    if (Math.abs(dy) > 52 && Math.abs(dy) > Math.abs(dx) * 1.1) {
      navigate(dy < 0 ? 1 : -1, offset);
      return;
    }
    if (transitionRunning) return;
    const picture = pictureTargets();
    picture.forEach((element) => {
      element.animate(
        [
          { transform: `translate3d(0, ${offset}px, 0)`, opacity: element.style.opacity || 1 },
          { transform: "translate3d(0, 0, 0)", opacity: 1 },
        ],
        { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    });
    clearMotionStyles(picture);
  }

  function handleTouchCancel() {
    if (!touchStart) return;
    touchStart = null;
    clearMotionStyles(pictureTargets());
  }

  applySiteContent();
  createGallery();
  setupCustomCursor();
  setupCustomScrollbar();

  if ("ResizeObserver" in window && gallery) {
    new ResizeObserver(requestLayout).observe(gallery);
  } else {
    window.addEventListener("resize", requestLayout);
  }

  acceptSensitiveButton.addEventListener("click", acceptSensitive);
  dismissSensitiveButton.addEventListener("click", dismissConsent);
  closeButton.addEventListener("click", closeLightbox);
  previousButton.addEventListener("click", () => navigate(-1));
  nextButton.addEventListener("click", () => navigate(1));
  copyButton.addEventListener("click", copyCurrentLink);
  lightboxImage.addEventListener("contextmenu", (event) => event.preventDefault());
  lightboxImage.addEventListener("load", () => {
    lightboxImage.hidden = false;
    lightboxImageFallback.hidden = true;
    if (activeIndex !== null) readyFullImageSources.add(photoPath(photos[activeIndex].filename));
    preloadNeighboringPhotos(activeIndex);
  });
  lightboxImage.addEventListener("error", () => {
    lightboxImage.hidden = true;
    lightboxImageFallback.hidden = false;
  });
  consentOverlay.addEventListener("mousedown", (event) => {
    if (event.target === consentOverlay) dismissConsent();
  });
  lightboxOverlay.addEventListener("mousedown", (event) => {
    if (event.target === lightboxOverlay) closeLightbox();
  });
  lightboxOverlay.addEventListener("touchstart", handleTouchStart, { passive: true });
  lightboxOverlay.addEventListener("touchmove", handleTouchMove, { passive: false });
  lightboxOverlay.addEventListener("touchend", handleTouchEnd, { passive: true });
  lightboxOverlay.addEventListener("touchcancel", handleTouchCancel, { passive: true });
  document.addEventListener("keydown", handleKeyboard);
  window.addEventListener("popstate", readUrl);
  readUrl();
})();
