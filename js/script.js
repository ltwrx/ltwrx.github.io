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

    const cursorRadius = 12;
    let frame = null;
    let x = -60;
    let y = -60;
    let visible = false;
    let overImage = false;
    let pointerTarget = null;

    const renderPosition = () => {
      cursor.style.transform = `translate3d(${x - cursorRadius}px, ${y - cursorRadius}px, 0)`;
      frame = null;
    };

    const moveCursor = (event) => {
      x = event.clientX;
      y = event.clientY;
      if (frame === null) frame = window.requestAnimationFrame(renderPosition);
    };

    const setImageState = (target) => {
      const nextState = target instanceof Element && Boolean(target.closest(".photo-card, #lightbox-image"));
      if (nextState === overImage) return;
      overImage = nextState;
      cursor.classList.toggle("is-over-image", overImage);
    };

    const trackCursor = (event) => {
      moveCursor(event);
      if (event.target !== pointerTarget) {
        pointerTarget = event.target;
        setImageState(pointerTarget);
      }
      if (visible) return;
      visible = true;
      cursor.classList.add("is-visible");
    };

    const hideCursor = () => {
      if (!visible && !overImage) return;
      visible = false;
      overImage = false;
      pointerTarget = null;
      cursor.classList.remove("is-visible", "is-over-image");
    };

    document.addEventListener("pointermove", trackCursor, { passive: true });
    document.documentElement.addEventListener("pointerleave", hideCursor);
    window.addEventListener("blur", hideCursor);
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
  }

  function unlockBody() {
    if (!bodyLockState || !consentOverlay.hidden || !lightboxOverlay.hidden) return;
    document.body.style.overflow = bodyLockState.overflow;
    document.body.style.paddingRight = bodyLockState.paddingRight;
    bodyLockState = null;
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
    if (photo.creditName) {
      const prefix = document.createTextNode(photo.creditRole ? `${photo.creditRole}: ` : "Credit: ");
      photoCredit.append(prefix);
      if (photo.creditLink) {
        const link = document.createElement("a");
        link.href = photo.creditLink;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = photo.creditName;
        photoCredit.append(link);
      } else {
        photoCredit.append(document.createTextNode(photo.creditName));
      }
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

  function hideLightbox(restore = true) {
    clearScrollCue();
    lightboxOverlay.hidden = true;
    activeIndex = null;
    openedWithPush = false;
    lightboxImage.removeAttribute("src");
    lightboxFigure.getAnimations().forEach((animation) => animation.cancel());
    lightboxFigure.style.removeProperty("transform");
    lightboxFigure.style.removeProperty("opacity");
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
    if (reducedMotion.matches || !("animate" in lightboxFigure)) {
      commitNavigation(candidate);
      lightboxFigure.style.removeProperty("transform");
      lightboxFigure.style.removeProperty("opacity");
      return;
    }

    const mobile = mobileLightbox.matches;
    const start = mobile
      ? `translate3d(0, ${dragOffset}px, 0)`
      : "translate3d(0, 0, 0)";
    const outgoing = mobile
      ? `translate3d(0, ${direction > 0 ? "-18vh" : "18vh"}, 0)`
      : `translate3d(${direction > 0 ? "-12vw" : "12vw"}, 0, 0)`;
    const incoming = mobile
      ? `translate3d(0, ${direction > 0 ? "18vh" : "-18vh"}, 0)`
      : `translate3d(${direction > 0 ? "12vw" : "-12vw"}, 0, 0)`;

    lightboxFigure.style.removeProperty("transform");
    lightboxFigure.style.removeProperty("opacity");
    const exitAnimation = lightboxFigure.animate(
      [
        { transform: start, opacity: 1 },
        { transform: outgoing, opacity: 0 },
      ],
      { duration: mobile ? 210 : 240, easing: "cubic-bezier(0.55, 0, 1, 0.45)", fill: "forwards" },
    );
    await exitAnimation.finished;
    commitNavigation(candidate);
    subtleHaptic();
    exitAnimation.cancel();
    const enterAnimation = lightboxFigure.animate(
      [
        { transform: incoming, opacity: 0 },
        { transform: "translate3d(0, 0, 0)", opacity: 1 },
      ],
      { duration: mobile ? 430 : 460, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    await enterAnimation.finished;
  }

  async function navigate(direction, dragOffset = 0) {
    if (activeIndex === null || photos.length < 2 || transitionRunning) return;
    const candidate = findNavigableIndex(direction);
    if (candidate === null) return;
    transitionRunning = true;
    clearScrollCue();
    try {
      await animateNavigation(candidate, direction, dragOffset);
    } catch {
      if (!lightboxOverlay.hidden && activeIndex !== candidate) commitNavigation(candidate);
    } finally {
      lightboxFigure.style.removeProperty("transform");
      lightboxFigure.style.removeProperty("opacity");
      transitionRunning = false;
    }
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
    if (lightboxOverlay.hidden || !mobileLightbox.matches || transitionRunning) return;
    if (event.target instanceof Element && event.target.closest("button, a")) return;
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY, offset: 0 };
    clearScrollCue();
    lightboxFigure.getAnimations().forEach((animation) => animation.cancel());
  }

  function handleTouchMove(event) {
    if (!touchStart || lightboxOverlay.hidden || transitionRunning) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    if (Math.abs(dx) > Math.abs(dy) * 1.15) return;
    event.preventDefault();
    const offset = Math.max(-96, Math.min(96, dy * 0.72));
    touchStart.offset = offset;
    lightboxFigure.style.transform = `translate3d(0, ${offset}px, 0)`;
    lightboxFigure.style.opacity = String(1 - Math.min(Math.abs(offset) / 420, 0.18));
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
    lightboxFigure.animate(
      [
        { transform: `translate3d(0, ${offset}px, 0)`, opacity: lightboxFigure.style.opacity || 1 },
        { transform: "translate3d(0, 0, 0)", opacity: 1 },
      ],
      { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    lightboxFigure.style.removeProperty("transform");
    lightboxFigure.style.removeProperty("opacity");
  }

  function handleTouchCancel() {
    if (!touchStart) return;
    touchStart = null;
    lightboxFigure.style.removeProperty("transform");
    lightboxFigure.style.removeProperty("opacity");
  }

  applySiteContent();
  createGallery();
  setupCustomCursor();

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
