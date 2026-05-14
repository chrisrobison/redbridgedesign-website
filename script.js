/**
 * Red Bridge Design — script.js
 * Vanilla JS interactions for the architectural drafting website.
 */

'use strict';

/* =============================================
   1. UTILITIES
   ============================================= */

/** Throttle a callback to fire at most once per `limit` ms */
function throttle(fn, limit = 100) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= limit) {
      last = now;
      fn.apply(this, args);
    }
  };
}

/** Safely query a single element (returns null if not found) */
const qs  = (sel, ctx = document) => ctx.querySelector(sel);
/** Safely query all elements */
const qsa = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];


/* =============================================
   2. STICKY NAVIGATION
   ============================================= */

(function initNav() {
  const header = qs('#site-header');
  if (!header) return;

  const SCROLL_THRESHOLD = 60;

  function updateHeader() {
    const scrolled = window.scrollY > SCROLL_THRESHOLD;
    header.classList.toggle('scrolled', scrolled);
  }

  window.addEventListener('scroll', throttle(updateHeader, 80), { passive: true });
  updateHeader(); // run once on load
})();


/* =============================================
   3. MOBILE HAMBURGER MENU
   ============================================= */

(function initMobileMenu() {
  const hamburger = qs('#hamburger');
  const navLinks  = qs('#nav-links');
  if (!hamburger || !navLinks) return;

  function openMenu() {
    navLinks.classList.add('is-open');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    navLinks.classList.remove('is-open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', () => {
    const isOpen = navLinks.classList.contains('is-open');
    isOpen ? closeMenu() : openMenu();
  });

  // Close on nav link click
  qsa('.nav__link', navLinks).forEach(link => {
    link.addEventListener('click', closeMenu);
  });

  // Close on Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (navLinks.classList.contains('is-open') &&
        !navLinks.contains(e.target) &&
        !hamburger.contains(e.target)) {
      closeMenu();
    }
  });
})();


/* =============================================
   4. ACTIVE NAV LINK (scroll spy)
   ============================================= */

(function initScrollSpy() {
  const sections  = qsa('section[id], div[id]').filter(el =>
    ['hero','services','portfolio','drawings','about','process','testimonials','contact'].includes(el.id)
  );
  const navLinks  = qsa('.nav__link:not(.nav__link--cta)');
  const NAV_H     = 80;

  function update() {
    const scrollY = window.scrollY + NAV_H + 60;
    let current = '';

    sections.forEach(sec => {
      if (scrollY >= sec.offsetTop) current = sec.id;
    });

    navLinks.forEach(link => {
      const href = link.getAttribute('href').replace('#', '');
      link.classList.toggle('nav__link--active', href === current);
    });
  }

  window.addEventListener('scroll', throttle(update, 120), { passive: true });
  update();
})();


/* =============================================
   5. SCROLL REVEAL ANIMATIONS
   ============================================= */

(function initScrollReveal() {
  const revealEls = qsa('.reveal');
  if (!revealEls.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach(el => observer.observe(el));
})();


/* =============================================
   6. ANIMATED COUNTERS
   ============================================= */

(function initCounters() {
  const counters = qsa('[data-target]');
  if (!counters.length) return;

  let started = false;

  function animateCount(el) {
    const target   = +el.dataset.target;
    const duration = 1800;
    const step     = 16;
    const steps    = duration / step;
    const increment = target / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      el.textContent = Math.floor(current).toLocaleString();
    }, step);
  }

  const heroEl = qs('.hero__stats');
  if (!heroEl) return;

  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !started) {
      started = true;
      counters.forEach(animateCount);
      observer.disconnect();
    }
  }, { threshold: 0.5 });

  observer.observe(heroEl);
})();


/* =============================================
   7. PORTFOLIO FILTER
   ============================================= */

(function initPortfolioFilter() {
  const filterBtns = qsa('.filter-btn');
  const items      = qsa('.portfolio-item');
  if (!filterBtns.length || !items.length) return;

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // update button states
      filterBtns.forEach(b => b.classList.remove('filter-btn--active'));
      btn.classList.add('filter-btn--active');

      const filter = btn.dataset.filter;

      items.forEach(item => {
        const match = filter === 'all' || (item.dataset.category || '').split(' ').includes(filter);

        if (match) {
          item.style.display = '';
          // small re-trigger for reveal animation
          requestAnimationFrame(() => {
            item.style.opacity = '1';
            item.style.transform = 'none';
          });
        } else {
          item.style.opacity = '0';
          item.style.transform = 'scale(0.95)';
          setTimeout(() => { item.style.display = 'none'; }, 280);
        }
      });
    });
  });
})();


/* =============================================
   8. PORTFOLIO LIGHTBOX — PDF viewer
   ============================================= */

(function initLightbox() {
  const lightbox = qs('#lightbox');
  const closeBtn = qs('#lightbox-close');
  if (!lightbox) return;

  let pdfDoc       = null;
  let curPage      = 1;
  let totalPages   = 1;
  let lbRendering  = false;

  /* ---- Zoom state ---- */
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 5;
  let zoomLevel    = 1;   // current logical zoom
  let renderedZoom = 1;   // zoom at which canvas was last rendered
  let baseScale    = 1;   // PDF→CSS px scale that fits page to stage at zoom=1
  let panX = 0, panY = 0; // canvas centre offset from stage centre (CSS px)
  let renderTimer  = null;

  /* ---- Build PDF viewer UI inside lightbox__content ---- */
  function buildUI(title) {
    const content = qs('#lightbox-content');
    content.innerHTML = `
      <div class="lightbox__pdf-stage" id="lb-stage">
        <canvas id="lb-canvas" class="lightbox__pdf-canvas"></canvas>
        <div class="lightbox__pdf-loader" id="lb-loader">
          <div class="lightbox__pdf-spinner"></div>
        </div>
      </div>
      <div class="lightbox__thumb-strip" id="lb-thumbs" aria-label="Page thumbnails"></div>
      <div class="lightbox__pdf-bar">
        <span class="lightbox__pdf-title" id="lb-title">${title}</span>
        <div class="lightbox__pdf-controls">
          <div class="lightbox__pdf-zoom-group">
            <button class="lightbox__pdf-btn" id="lb-zoom-out" aria-label="Zoom out" title="Zoom out (-)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <span class="lightbox__zoom-pct" id="lb-zoom-pct">100%</span>
            <button class="lightbox__pdf-btn" id="lb-zoom-in" aria-label="Zoom in" title="Zoom in (+)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="lightbox__pdf-btn lightbox__pdf-btn--fit" id="lb-zoom-fit" aria-label="Fit to window" title="Fit to window (0)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/></svg>
            </button>
          </div>
          <span class="lightbox__pdf-counter" id="lb-counter"></span>
          <div class="lightbox__pdf-nav-group">
            <button class="lightbox__pdf-btn" id="lb-prev" aria-label="Previous sheet">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button class="lightbox__pdf-btn" id="lb-next" aria-label="Next sheet">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
    qs('#lb-prev')?.addEventListener('click', () => lbGoTo(curPage - 1));
    qs('#lb-next')?.addEventListener('click', () => lbGoTo(curPage + 1));
    qs('#lb-zoom-in')?.addEventListener('click',  () => applyZoom(zoomLevel * 1.25));
    qs('#lb-zoom-out')?.addEventListener('click', () => applyZoom(zoomLevel / 1.25));
    qs('#lb-zoom-fit')?.addEventListener('click', resetZoom);
    wireStageInteraction();
  }

  /* ---- Zoom helpers ---- */

  // Apply a new zoom level, optionally keeping the point (fx, fy) — relative to
  // stage centre — visually fixed.
  function applyZoom(newZoom, fx, fy) {
    newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    if (fx !== undefined && fy !== undefined) {
      const ratio = newZoom / zoomLevel;
      panX = fx - (fx - panX) * ratio;
      panY = fy - (fy - panY) * ratio;
    }
    zoomLevel = newZoom;
    clampPan();
    applyTransform();
    updateZoomUI();
    // Re-render at higher quality after the user pauses
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      if (Math.abs(zoomLevel - renderedZoom) > 0.05) lbRenderPage(curPage);
    }, 350);
  }

  // Reset zoom to fit and re-render.
  function resetZoom() {
    clearTimeout(renderTimer);
    zoomLevel = 1; panX = 0; panY = 0;
    const canvas = qs('#lb-canvas');
    if (canvas) canvas.style.transform = '';
    syncStageCursor();
    updateZoomUI();
    lbRenderPage(curPage);
  }

  // Prevent panning so far that the canvas fully leaves the stage.
  function clampPan() {
    const stage  = qs('#lb-stage');
    const canvas = qs('#lb-canvas');
    if (!stage || !canvas) return;
    const vs   = zoomLevel / (renderedZoom || 1);
    const visW = parseFloat(canvas.style.width  || 0) * vs;
    const visH = parseFloat(canvas.style.height || 0) * vs;
    const maxPX = Math.max(0, (visW - stage.clientWidth)  / 2);
    const maxPY = Math.max(0, (visH - stage.clientHeight) / 2);
    panX = Math.max(-maxPX, Math.min(maxPX, panX));
    panY = Math.max(-maxPY, Math.min(maxPY, panY));
  }

  // Push current pan + visual-scale onto the canvas CSS transform.
  // CSS: translate(panX, panY) scale(vs) — scale is applied around the canvas
  // centre (= stage centre via flex), then the whole thing is translated.
  function applyTransform() {
    const canvas = qs('#lb-canvas');
    if (!canvas) return;
    const vs = zoomLevel / (renderedZoom || 1);
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${vs})`;
    syncStageCursor();
  }

  function syncStageCursor() {
    const stage = qs('#lb-stage');
    if (stage) stage.style.cursor = zoomLevel > 1 ? 'grab' : '';
  }

  function updateZoomUI() {
    const pct = qs('#lb-zoom-pct');
    if (pct) pct.textContent = Math.round(zoomLevel * 100) + '%';
    const btnOut = qs('#lb-zoom-out');
    const btnIn  = qs('#lb-zoom-in');
    if (btnOut) btnOut.disabled = zoomLevel <= MIN_ZOOM;
    if (btnIn)  btnIn.disabled  = zoomLevel >= MAX_ZOOM;
  }

  /* ---- Stage interaction: wheel zoom, drag-to-pan, pinch-to-zoom ---- */
  function wireStageInteraction() {
    const stage = qs('#lb-stage');
    if (!stage) return;

    /* Mouse-wheel zoom toward cursor */
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const fx = e.clientX - rect.left  - rect.width  / 2;
      const fy = e.clientY - rect.top   - rect.height / 2;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      applyZoom(zoomLevel * factor, fx, fy);
    }, { passive: false });

    /* Pointer drag-to-pan (mouse / stylus) */
    let dragging = false, dragX0 = 0, dragY0 = 0, panX0 = 0, panY0 = 0;

    stage.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') return;
      if (zoomLevel <= 1) return;
      dragging = true;
      stage.setPointerCapture(e.pointerId);
      stage.style.cursor = 'grabbing';
      dragX0 = e.clientX; dragY0 = e.clientY;
      panX0  = panX;      panY0  = panY;
    });

    stage.addEventListener('pointermove', e => {
      if (!dragging) return;
      panX = panX0 + (e.clientX - dragX0);
      panY = panY0 + (e.clientY - dragY0);
      clampPan();
      applyTransform();
      stage.style.cursor = 'grabbing';
    });

    const endDrag = () => {
      dragging = false;
      syncStageCursor();
    };
    stage.addEventListener('pointerup',     endDrag);
    stage.addEventListener('pointercancel', endDrag);

    /* Touch: single-finger pan + two-finger pinch-to-zoom */
    let pinchDist0 = 0, pinchZoom0 = 1, pinchFX = 0, pinchFY = 0;
    let pinchPanX0 = 0, pinchPanY0 = 0;
    let tDragX0 = 0, tDragY0 = 0, tPanX0 = 0, tPanY0 = 0;
    let touchPanning = false;

    stage.addEventListener('touchstart', e => {
      e.preventDefault();
      if (e.touches.length === 2) {
        touchPanning = false;
        const t1 = e.touches[0], t2 = e.touches[1];
        pinchDist0 = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        pinchZoom0 = zoomLevel;
        pinchPanX0 = panX; pinchPanY0 = panY;
        const rect = stage.getBoundingClientRect();
        pinchFX = (t1.clientX + t2.clientX) / 2 - rect.left - rect.width  / 2;
        pinchFY = (t1.clientY + t2.clientY) / 2 - rect.top  - rect.height / 2;
      } else if (e.touches.length === 1 && zoomLevel > 1) {
        touchPanning = true;
        tDragX0 = e.touches[0].clientX; tDragY0 = e.touches[0].clientY;
        tPanX0  = panX; tPanY0 = panY;
      }
    }, { passive: false });

    stage.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const t1 = e.touches[0], t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchZoom0 * (dist / pinchDist0)));
        const rect  = stage.getBoundingClientRect();
        const midFX = (t1.clientX + t2.clientX) / 2 - rect.left - rect.width  / 2;
        const midFY = (t1.clientY + t2.clientY) / 2 - rect.top  - rect.height / 2;
        const ratio = newZoom / pinchZoom0;
        // Zoom around pinch midpoint, then follow midpoint movement
        panX = pinchFX - (pinchFX - pinchPanX0) * ratio + (midFX - pinchFX);
        panY = pinchFY - (pinchFY - pinchPanY0) * ratio + (midFY - pinchFY);
        zoomLevel = newZoom;
        clampPan();
        applyTransform();
        updateZoomUI();
      } else if (e.touches.length === 1 && touchPanning) {
        panX = tPanX0 + (e.touches[0].clientX - tDragX0);
        panY = tPanY0 + (e.touches[0].clientY - tDragY0);
        clampPan();
        applyTransform();
      }
    }, { passive: false });

    stage.addEventListener('touchend', e => {
      if (e.touches.length < 2) {
        // Transition from pinch to single-finger pan
        if (e.touches.length === 1 && zoomLevel > 1) {
          touchPanning = true;
          tDragX0 = e.touches[0].clientX; tDragY0 = e.touches[0].clientY;
          tPanX0  = panX; tPanY0 = panY;
        } else {
          touchPanning = false;
        }
        // Quality re-render after pinch ends
        clearTimeout(renderTimer);
        renderTimer = setTimeout(() => {
          if (Math.abs(zoomLevel - renderedZoom) > 0.05) lbRenderPage(curPage);
        }, 400);
      }
    }, { passive: false });
  }

  /* ---- Render page thumbnail strip ---- */
  async function renderThumbStrip() {
    const strip = qs('#lb-thumbs');
    if (!strip || !pdfDoc) return;
    strip.innerHTML = '';

    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.className = 'lightbox__thumb-btn' + (i === 1 ? ' active' : '');
      btn.setAttribute('aria-label', `Sheet ${i}`);
      btn.dataset.page = i;

      const pageNum = document.createElement('span');
      pageNum.className = 'lightbox__thumb-num';
      pageNum.textContent = i;

      const canvas = document.createElement('canvas');
      btn.appendChild(canvas);
      btn.appendChild(pageNum);
      strip.appendChild(btn);

      btn.addEventListener('click', () => lbGoTo(parseInt(btn.dataset.page, 10)));

      // Render each thumbnail (fire-and-forget — don't block the loop)
      (async (pageIndex, canvasEl) => {
        try {
          const page = await pdfDoc.getPage(pageIndex);
          const vp0  = page.getViewport({ scale: 1 });
          const thumbH = 76;
          const scale  = thumbH / vp0.height;
          const vp     = page.getViewport({ scale });
          canvasEl.width  = Math.round(vp.width);
          canvasEl.height = Math.round(vp.height);
          canvasEl.style.height = thumbH + 'px';
          canvasEl.style.width  = 'auto';
          await page.render({ canvasContext: canvasEl.getContext('2d'), viewport: vp }).promise;
        } catch (e) {
          console.warn('[Lightbox] thumb render error p' + pageIndex + ':', e);
        }
      })(i, canvas);
    }
  }

  /* ---- Highlight the active thumbnail and scroll it into view ---- */
  function updateThumbActive(n) {
    qsa('.lightbox__thumb-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.page, 10) === n);
    });
    qs('.lightbox__thumb-btn.active')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  /* ---- Render a page into the lightbox canvas ---- */
  // Renders at baseScale * min(zoomLevel, 4) for memory safety. CSS transform
  // handles any visual zoom delta between renders.
  async function lbRenderPage(n) {
    if (lbRendering || !pdfDoc) return;
    lbRendering = true;
    const loader  = qs('#lb-loader');
    const canvas  = qs('#lb-canvas');
    const counter = qs('#lb-counter');
    loader?.classList.remove('hidden');

    try {
      const page   = await pdfDoc.getPage(n);
      const dpr    = window.devicePixelRatio || 1;
      const stage  = qs('#lb-stage');
      const stageW = stage ? stage.clientWidth  : window.innerWidth;
      const stageH = stage ? stage.clientHeight : window.innerHeight * 0.80;
      const vp0    = page.getViewport({ scale: 1 });

      baseScale = Math.min(stageW / vp0.width, stageH / vp0.height);
      const rz    = Math.min(zoomLevel, 4); // cap render zoom at 4× (memory)
      const vp    = page.getViewport({ scale: baseScale * rz * dpr });

      canvas.width  = vp.width;
      canvas.height = vp.height;
      canvas.style.width  = (vp.width  / dpr) + 'px'; // = pageW * baseScale * rz
      canvas.style.height = (vp.height / dpr) + 'px';

      renderedZoom = rz;
      applyTransform(); // sync pan + visual-scale immediately

      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      if (counter) counter.textContent = `Sheet ${n} of ${totalPages}`;
    } catch (e) {
      console.warn('[Lightbox] render error:', e);
    }

    loader?.classList.add('hidden');
    lbRendering = false;
  }

  function lbGoTo(n) {
    // Always reset zoom when flipping pages
    clearTimeout(renderTimer);
    zoomLevel = 1; panX = 0; panY = 0;
    const canvas = qs('#lb-canvas');
    if (canvas) canvas.style.transform = '';
    syncStageCursor();
    updateZoomUI();

    curPage = Math.max(1, Math.min(n, totalPages));
    lbRenderPage(curPage);
    updateThumbActive(curPage);
  }

  /* ---- Open lightbox for a PDF-backed portfolio item ---- */
  async function openLightbox(item) {
    const pdfPath = item.dataset.pdf;
    const title   = item.dataset.title || qs('.portfolio-item__title', item)?.textContent || '';
    curPage      = 1;
    pdfDoc       = null;
    lbRendering  = false;
    zoomLevel    = 1;
    renderedZoom = 1;
    panX = 0; panY = 0;

    buildUI(title);
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';

    try {
      if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js not loaded');
      pdfDoc      = await pdfjsLib.getDocument(pdfPath).promise;
      totalPages  = pdfDoc.numPages;
      const counter = qs('#lb-counter');
      if (counter) counter.textContent = `Sheet 1 of ${totalPages}`;
    } catch (e) {
      console.warn('[Lightbox] PDF load error:', e);
    }

    lbRenderPage(curPage);
    renderThumbStrip();
  }

  function closeLightbox() {
    clearTimeout(renderTimer);
    lightbox.hidden = true;
    document.body.style.overflow = '';
    pdfDoc = null;
  }

  /* ---- Wire click handlers on portfolio items ---- */
  qsa('.portfolio-item').forEach(item => {
    const handler = () => { if (item.dataset.pdf) openLightbox(item); };
    qs('.portfolio-item__btn', item)?.addEventListener('click', handler);
    qs('.portfolio-item__img', item)?.addEventListener('click', handler);
  });

  closeBtn?.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

  document.addEventListener('keydown', e => {
    if (lightbox.hidden) return;
    if (e.key === 'Escape')                               closeLightbox();
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  lbGoTo(curPage + 1);
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')    lbGoTo(curPage - 1);
    if (e.key === '+' || e.key === '=')                   applyZoom(zoomLevel * 1.25);
    if (e.key === '-' || e.key === '_')                   applyZoom(zoomLevel / 1.25);
    if (e.key === '0')                                    resetZoom();
  });
})();


/* =============================================
   9. PORTFOLIO THUMBNAILS — render first PDF page
   ============================================= */

(function initPortfolioThumbnails() {
  const items = qsa('.portfolio-item[data-pdf]');
  if (!items.length || typeof pdfjsLib === 'undefined') return;

  // Ensure worker is set (may already be set by drawings carousel)
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  async function renderThumb(item) {
    const canvas = qs('.portfolio-item__canvas', item);
    const loader = qs('.portfolio-item__thumb-loader', item);
    if (!canvas) return;

    try {
      const doc   = await pdfjsLib.getDocument(item.dataset.pdf).promise;
      const page  = await doc.getPage(1);
      const wrap  = qs('.portfolio-item__thumb', item);
      const dpr   = window.devicePixelRatio || 1;
      const w     = wrap?.clientWidth  || 300;
      const h     = wrap?.clientHeight || 225;
      const vp0   = page.getViewport({ scale: 1 });
      const scale = Math.min(w / vp0.width, h / vp0.height) * dpr;
      const vp    = page.getViewport({ scale });

      canvas.width  = vp.width;
      canvas.height = vp.height;
      canvas.style.width  = (vp.width  / dpr) + 'px';
      canvas.style.height = (vp.height / dpr) + 'px';

      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    } catch (e) {
      console.warn('[Thumbnail] render error:', e);
    }

    loader?.classList.add('hidden');
  }

  // Render when each item enters the viewport
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        renderThumb(entry.target);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05 });

  items.forEach(item => io.observe(item));
})();


/* =============================================
   9. TESTIMONIALS SLIDER
   ============================================= */

(function initTestimonials() {
  const track  = qs('#testimonials-track');
  const dotsEl = qs('#testimonials-dots');
  const prev   = qs('#testimonial-prev');
  const next   = qs('#testimonial-next');
  if (!track) return;

  const cards  = qsa('.testimonial-card', track);
  const total  = cards.length;
  let current  = 0;
  let autoTimer;

  // Build dots
  cards.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'testimonials__dot' + (i === 0 ? ' testimonials__dot--active' : '');
    dot.setAttribute('aria-label', `Go to testimonial ${i + 1}`);
    dot.addEventListener('click', () => goTo(i));
    dotsEl?.appendChild(dot);
  });

  function getDots() { return qsa('.testimonials__dot', dotsEl); }

  function goTo(index) {
    current = (index + total) % total;
    // each card is 100% wide, translate by current index
    track.style.transform = `translateX(calc(-${current * 100}% - ${current * 32}px))`;
    getDots().forEach((d, i) => {
      d.classList.toggle('testimonials__dot--active', i === current);
    });
    resetAuto();
  }

  function resetAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(() => goTo(current + 1), 5500);
  }

  // Make track only show one card at a time
  track.style.cssText += `
    display: flex;
    transition: transform .5s cubic-bezier(0.4, 0, 0.2, 1);
    will-change: transform;
  `;
  cards.forEach(card => {
    card.style.cssText += `
      flex: 0 0 calc(100% - 32px);
      min-width: calc(100% - 32px);
    `;
  });

  prev?.addEventListener('click', () => goTo(current - 1));
  next?.addEventListener('click', () => goTo(current + 1));

  // Touch / swipe support
  let touchStartX = 0;
  track.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => {
    const delta = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 50) goTo(delta > 0 ? current + 1 : current - 1);
  }, { passive: true });

  resetAuto();
})();


/* =============================================
   10. CONTACT FORM VALIDATION & SUBMISSION
   ============================================= */

(function initContactForm() {
  const form       = qs('#contact-form');
  const submitBtn  = qs('#submit-btn');
  const successMsg = qs('#form-success');
  if (!form) return;

  const rules = {
    name:               { required: true, minLength: 2,  message: 'Please enter your full name.' },
    email:              { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Please enter a valid email address.' },
    service:            { required: true, message: 'Please select a service.' },
    'property-address': { required: true, minLength: 5,  message: 'Please enter the property address.' },
    message:            { required: true, minLength: 10, message: 'Please describe your project (min. 10 characters).' },
  };

  function getError(field, value) {
    const rule = rules[field];
    if (!rule) return null;
    if (rule.required && !value.trim()) return rule.message;
    if (rule.minLength && value.trim().length < rule.minLength) return rule.message;
    if (rule.pattern && !rule.pattern.test(value.trim())) return rule.message;
    return null;
  }

  function showError(fieldId, msg) {
    const input = qs(`#${fieldId}`);
    const errEl = qs(`#${fieldId}-error`);
    input?.classList.toggle('error', !!msg);
    if (errEl) errEl.textContent = msg || '';
  }

  function validateField(fieldId) {
    const input = qs(`#${fieldId}`);
    if (!input) return true;
    const error = getError(fieldId, input.value);
    showError(fieldId, error);
    return !error;
  }

  // Live validation on blur
  ['name', 'email', 'service', 'property-address', 'message'].forEach(id => {
    const input = qs(`#${id}`);
    input?.addEventListener('blur', () => validateField(id));
    input?.addEventListener('input', () => {
      if (input.classList.contains('error')) validateField(id);
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate all fields
    const valid = ['name', 'email', 'service', 'property-address', 'message'].every(validateField);
    if (!valid) return;

    // Loading state
    submitBtn.classList.add('btn--loading');
    submitBtn.disabled = true;

    // Submit to the server-side PHP handler
    let submitOk = false;
    try {
      const response = await fetch('submit.php', {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' },
      });
      submitOk = response.ok;
    } catch (_) {
      submitOk = false;
    }

    submitBtn.classList.remove('btn--loading');
    submitBtn.disabled = false;

    if (submitOk) {
      submitBtn.style.display = 'none';
      successMsg.classList.add('visible');
      form.querySelectorAll('input, textarea, select').forEach(el => {
        el.disabled = true;
      });
    } else {
      submitBtn.style.display = '';
      const errBanner = qs('#form-send-error');
      if (errBanner) errBanner.classList.add('visible');
    }
  });
})();


/* =============================================
   11. SMOOTH ANCHOR SCROLL (offset for nav)
   ============================================= */

(function initSmoothScroll() {
  const NAV_H = 72;

  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - NAV_H;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
})();


/* =============================================
   12. BACK TO TOP BUTTON
   ============================================= */

(function initBackToTop() {
  const btn = qs('#back-to-top');
  if (!btn) return;

  function toggle() {
    btn.classList.toggle('visible', window.scrollY > 400);
  }

  window.addEventListener('scroll', throttle(toggle, 100), { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  toggle();
})();


/* =============================================
   13. NAV ACTIVE STATE CSS INJECTION
   ============================================= */

/* =============================================
   13B. HERO CAROUSEL BACKGROUND
   ============================================= */

(function initHeroCarousel() {
  const heroBg = qs('#hero-carousel-bg');
  if (!heroBg || typeof pdfjsLib === 'undefined') return;

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  let frontSlide  = qs('#hero-slide-a');
  let backSlide   = qs('#hero-slide-b');
  let frontInner  = qs('#hero-inner-a');
  let backInner   = qs('#hero-inner-b');
  let frontCanvas = qs('#hero-canvas-a');
  let backCanvas  = qs('#hero-canvas-b');

  const PDFS = [
    { path: 'assets/1618-1632 MASON STREET.pdf',  pages: 9  },
    { path: 'assets/1839 MAGELLAN DRIVE.pdf',     pages: 10 },
    { path: 'assets/27 SATURN STREET.pdf',        pages: 4  },
    { path: 'assets/67 CAYUGA STREET.pdf',        pages: 7  },
    { path: 'assets/697 RHODE ISALND STREET.pdf', pages: 7  },
  ];

  const slides = [];
  PDFS.forEach((pdf, pi) => {
    for (let p = 1; p <= pdf.pages; p++) slides.push({ pi, page: p });
  });
  const TOTAL = slides.length;

  let current     = 0;
  let autoTimer   = null;
  let rendering   = false;
  const SLIDE_MS  = 450;
  const ADVANCE_MS = 5500;

  const docCache = {};

  async function getPdfDoc(pi) {
    if (docCache[pi]) return docCache[pi];
    const doc = await pdfjsLib.getDocument(PDFS[pi].path).promise;
    docCache[pi] = doc;
    return doc;
  }

  async function renderToCanvas(cvs, pi, page) {
    const doc     = await getPdfDoc(pi);
    const pdfPage = await doc.getPage(page);
    const dpr     = window.devicePixelRatio || 1;
    const stageW  = heroBg.clientWidth  || window.innerWidth;
    const stageH  = heroBg.clientHeight || window.innerHeight;
    const vp0     = pdfPage.getViewport({ scale: 1 });
    // Cover scaling — drawing fills the full hero, edges may crop
    const scale   = Math.max(stageW / vp0.width, stageH / vp0.height) * dpr;
    const viewport = pdfPage.getViewport({ scale });

    cvs.width  = viewport.width;
    cvs.height = viewport.height;
    cvs.style.width  = (viewport.width  / dpr) + 'px';
    cvs.style.height = (viewport.height / dpr) + 'px';

    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  }

  let zoomIn = true; // alternates each slide

  function startZoom(el) {
    el.classList.remove('hero__slide-inner--zoom-in', 'hero__slide-inner--zoom-out');
    void el.offsetHeight; // restart animation
    el.classList.add(zoomIn ? 'hero__slide-inner--zoom-in' : 'hero__slide-inner--zoom-out');
    zoomIn = !zoomIn;
  }

  const FADE_MS = 1200; // must match CSS transition duration

  async function renderSlide(idx) {
    if (rendering) return;
    rendering = true;

    const { pi, page } = slides[idx];
    try {
      await renderToCanvas(backCanvas, pi, page);

      // Cross-fade: back in, front out
      requestAnimationFrame(() => {
        backSlide.classList.replace('hero__slide--hidden', 'hero__slide--visible');
        frontSlide.classList.replace('hero__slide--visible', 'hero__slide--hidden');
        startZoom(backInner);
      });

      setTimeout(() => {
        [frontSlide, backSlide]   = [backSlide, frontSlide];
        [frontCanvas, backCanvas] = [backCanvas, frontCanvas];
        [frontInner, backInner]   = [backInner, frontInner];
        rendering = false;
      }, FADE_MS + 30);

    } catch (err) {
      console.warn('[HeroCarousel]', err);
      rendering = false;
    }
  }

  function prefetch(idx) {
    getPdfDoc(slides[(idx + TOTAL) % TOTAL].pi).catch(() => {});
  }

  function goTo(idx) {
    current = ((idx % TOTAL) + TOTAL) % TOTAL;
    renderSlide(current);
    prefetch(current + 1);
    resetAuto();
  }

  function resetAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(() => goTo(current + 1), ADVANCE_MS);
  }

  // Short delay before the first image fades in
  setTimeout(() => goTo(0), 1500);
})();

/* =============================================
   14. PDF DRAWINGS CAROUSEL
   ============================================= */

(function initDrawingsCarousel() {
  const stage     = qs('#drawings-stage');
  const loader    = qs('#drawings-loader');
  const projectEl = qs('#drawings-project');
  const counterEl = qs('#drawings-counter');
  const prevBtn   = qs('#drawings-prev');
  const nextBtn   = qs('#drawings-next');
  const pillsEl   = qs('#drawings-pills');

  // Two-slide system for directional animation
  let frontSlide  = qs('#drawings-slide-a');
  let backSlide   = qs('#drawings-slide-b');
  let frontCanvas = qs('#drawings-canvas');
  let backCanvas  = qs('#drawings-canvas-b');

  if (!stage || !frontCanvas) return;

  // PDF list — paths relative to the page, with known page counts
  const PDFS = [
    { path: 'assets/1618-1632 MASON STREET.pdf',  pages: 9,  label: '1618–1632 Mason St' },
    { path: 'assets/1839 MAGELLAN DRIVE.pdf',     pages: 10, label: '1839 Magellan Dr' },
    { path: 'assets/27 SATURN STREET.pdf',        pages: 4,  label: '27 Saturn St' },
    { path: 'assets/67 CAYUGA STREET.pdf',        pages: 7,  label: '67 Cayuga St' },
    { path: 'assets/697 RHODE ISALND STREET.pdf', pages: 7,  label: '697 Rhode Island St' },
  ];

  // Build flat slides array: [{pdfIndex, pageNum}, ...]
  const slides = [];
  PDFS.forEach((pdf, pi) => {
    for (let p = 1; p <= pdf.pages; p++) slides.push({ pi, page: p });
  });
  const TOTAL = slides.length;

  let current   = 0;
  let autoTimer = null;
  let rendering = false;

  const SLIDE_MS = 450; // must match CSS transition duration

  // Cache loaded PDF documents
  const docCache = {};

  // Set pdf.js worker
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  async function getPdfDoc(pi) {
    if (docCache[pi]) return docCache[pi];
    const doc = await pdfjsLib.getDocument(PDFS[pi].path).promise;
    docCache[pi] = doc;
    return doc;
  }

  // Render a PDF page onto a canvas element
  async function renderToCanvas(cvs, pi, page) {
    const doc     = await getPdfDoc(pi);
    const pdfPage = await doc.getPage(page);
    const dpr     = window.devicePixelRatio || 1;
    const stageW  = stage.clientWidth  || window.innerWidth;
    const stageH  = stage.clientHeight || 560;
    const vp0     = pdfPage.getViewport({ scale: 1 });
    const scale   = Math.min(stageW / vp0.width, stageH / vp0.height) * dpr;
    const viewport = pdfPage.getViewport({ scale });

    cvs.width  = viewport.width;
    cvs.height = viewport.height;
    cvs.style.width  = (viewport.width  / dpr) + 'px';
    cvs.style.height = (viewport.height / dpr) + 'px';

    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  }

  async function renderSlide(idx, direction) {
    if (rendering) return;
    rendering = true;

    const { pi, page } = slides[idx];
    const pdf = PDFS[pi];

    loader.classList.remove('hidden');

    try {
      // Render into the back (off-screen) canvas
      await renderToCanvas(backCanvas, pi, page);

      // Update caption & pills before animation
      if (projectEl) projectEl.textContent = pdf.label;
      if (counterEl) counterEl.textContent =
        `Sheet ${page} / ${pdf.pages}  ·  ${idx + 1} of ${TOTAL}`;
      qsa('.drawings__pill', pillsEl).forEach((btn, i) => {
        btn.classList.toggle('drawings__pill--active', i === pi);
      });

      loader.classList.add('hidden');

      // Position back slide off-screen in the incoming direction (no transition)
      const enterFrom = direction >= 0 ? 'drawings__slide--right' : 'drawings__slide--left';
      const exitTo    = direction >= 0 ? 'drawings__slide--left'  : 'drawings__slide--right';

      backSlide.style.transition = 'none';
      backSlide.classList.remove('drawings__slide--center', 'drawings__slide--left', 'drawings__slide--right');
      backSlide.classList.add(enterFrom);
      void backSlide.offsetHeight; // force reflow so position applies before transition re-enables

      // Re-enable transitions and animate both slides simultaneously
      backSlide.style.transition = '';
      requestAnimationFrame(() => {
        backSlide.classList.replace(enterFrom, 'drawings__slide--center');
        frontSlide.classList.replace('drawings__slide--center', exitTo);
      });

      // After the slide animation completes, promote back→front
      setTimeout(() => {
        const tmpSlide  = frontSlide;
        const tmpCanvas = frontCanvas;
        frontSlide  = backSlide;
        frontCanvas = backCanvas;
        backSlide   = tmpSlide;
        backCanvas  = tmpCanvas;
        rendering = false;
      }, SLIDE_MS + 20);

    } catch (err) {
      console.warn('[DrawingsCarousel] render error:', err);
      loader.classList.add('hidden');
      rendering = false;
    }
  }

  // Warm up: fetch the PDF document for the next slide silently
  function prefetch(idx) {
    const { pi } = slides[(idx + TOTAL) % TOTAL];
    getPdfDoc(pi).catch(() => {});
  }

  function goTo(idx, dir) {
    const next = ((idx % TOTAL) + TOTAL) % TOTAL;
    if (next === current && rendering) return;

    // Determine direction if not supplied
    if (dir === undefined) {
      const diff = next - current;
      dir = (Math.abs(diff) > TOTAL / 2) ? (diff < 0 ? 1 : -1) : (diff >= 0 ? 1 : -1);
    }

    current = next;
    renderSlide(current, dir);
    prefetch(current + 1);
    resetAuto();
  }

  function resetAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(() => goTo(current + 1, 1), 5500);
  }

  // Build project pill buttons
  PDFS.forEach((pdf, i) => {
    const btn = document.createElement('button');
    btn.className = 'drawings__pill';
    btn.textContent = pdf.label;
    btn.setAttribute('aria-label', 'Jump to ' + pdf.label);
    btn.addEventListener('click', () => {
      const firstSlide = slides.findIndex(s => s.pi === i);
      goTo(firstSlide);
    });
    pillsEl?.appendChild(btn);
  });

  // Prev / Next buttons
  prevBtn?.addEventListener('click', () => goTo(current - 1, -1));
  nextBtn?.addEventListener('click', () => goTo(current + 1,  1));

  // Touch / swipe on the stage
  let touchX = 0;
  stage.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', e => {
    const dx = touchX - e.changedTouches[0].clientX;
    if (Math.abs(dx) > 45) goTo(dx > 0 ? current + 1 : current - 1, dx > 0 ? 1 : -1);
  }, { passive: true });

  // Keyboard navigation when stage is focused
  stage.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goTo(current + 1,  1); }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); goTo(current - 1, -1); }
  });

  // Pause auto-advance on hover
  stage.addEventListener('mouseenter', () => clearInterval(autoTimer));
  stage.addEventListener('mouseleave', resetAuto);

  // Start when section scrolls into view
  const section = qs('#drawings');
  if (section) {
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        goTo(0, 1);
        io.disconnect();
      }
    }, { threshold: 0.15 });
    io.observe(section);
  } else {
    goTo(0, 1);
  }
})();


/* =============================================
   15. NAV ACTIVE STATE CSS INJECTION
   (was 13 — renumbered)
   ============================================= */

// Inject active link style once (avoids overriding CTA button)
const styleTag = document.createElement('style');
styleTag.textContent = `.nav__link--active:not(.nav__link--cta) { color: var(--clr-white) !important; font-weight: 600; }
.site-header.scrolled .nav__link--active:not(.nav__link--cta) { color: var(--clr-navy) !important; }`;
document.head.appendChild(styleTag);
