(() => {
  const section = document.getElementById('finale-sec');
  const svg = document.getElementById('finale');
  if (!section || !svg) return;

  const boat = svg.querySelector('[data-finale-boat]');
  const boatLink = svg.querySelector('.finale-boat-link');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = value => Math.max(0, Math.min(1, value));
  let strokes;
  let totalLength = 0;
  let frame = 0;
  let lastProgress = -1;
  let boatAvailable;

  function setBoatAvailable(available) {
    if (!boatLink || available === boatAvailable) return;
    boatAvailable = available;
    boatLink.setAttribute('tabindex', available ? '0' : '-1');
    boatLink.setAttribute('aria-disabled', String(!available));
    if (available) {
      boatLink.removeAttribute('aria-hidden');
    } else {
      if (document.activeElement === boatLink) boatLink.blur();
      boatLink.setAttribute('aria-hidden', 'true');
    }
  }

  function measureStrokes() {
    // Group/document order is the drawing order: skyline, village, shore,
    // foreground, water, boat. Lengths always come from the actual geometry.
    strokes = [...svg.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse')]
      .filter(element => !element.closest('defs, clipPath, mask, [data-no-draw]'))
      .flatMap(element => {
        const length = element.getTotalLength();
        if (!Number.isFinite(length) || length <= 0) return [];
        // Normalized pathLength values otherwise change the dash units.
        element.removeAttribute('pathLength');
        const start = totalLength;
        totalLength += length;
        return [{ element, length, start, offset: null }];
      });
  }

  function render(progress) {
    if (progress === lastProgress) return;
    lastProgress = progress;
    setBoatAvailable(progress >= 0.88);
    // Finish the drawing before the boat moves through the final 12%.
    // Ease into the reveal so early scrolling leaves a lighter, sparser sketch.
    const drawn = Math.pow(clamp(progress / 0.88), 1.65) * totalLength;
    for (const stroke of strokes) {
      const offset = stroke.length - Math.max(0, Math.min(stroke.length, drawn - stroke.start));
      if (offset === stroke.offset) continue;
      stroke.offset = offset;
      stroke.element.style.strokeDashoffset = String(offset);
      // Round line caps can leave a dot even with a fully offset dash.
      stroke.element.style.visibility = offset >= stroke.length ? 'hidden' : 'visible';
    }
    if (boat) {
      const sail = clamp((progress - 0.88) / 0.12);
      const eased = sail * sail * (3 - 2 * sail);
      // SVG units: a small drift, with no loop or travel off the canvas.
      boat.setAttribute('transform', `translate(${eased * 24} ${-Math.sin(eased * Math.PI) * 1.5})`);
    }
  }

  function draw() {
    frame = 0;
    if (document.body.classList.contains('has-capsized') || motion.matches || !strokes?.length) return;
    const viewport = window.innerHeight;
    const rect = section.getBoundingClientRect();
    const sectionTop = window.scrollY + rect.top;
    const start = sectionTop - viewport * 0.9;
    const end = Math.min(
      sectionTop,
      document.documentElement.scrollHeight - viewport,
    );
    // Start as the scene enters, while the preceding text is still visible.
    // Keep the scene anchored in the text flow; only the boat is translated.
    // A short page must still finish before the user runs out of scroll.
    render(clamp((window.scrollY - start) / Math.max(1, end - start)));
  }

  function schedule() {
    if (!document.body.classList.contains('has-capsized') && !frame && !motion.matches) frame = requestAnimationFrame(draw);
  }

  function applyMotionPreference() {
    if (document.body.classList.contains('has-capsized')) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastProgress = -1;
    if (motion.matches) {
      section.classList.remove('is-animated');
      strokes?.forEach(stroke => {
        stroke.element.style.removeProperty('stroke-dasharray');
        stroke.element.style.removeProperty('stroke-dashoffset');
        stroke.element.style.removeProperty('visibility');
        stroke.offset = null;
      });
      boat?.removeAttribute('transform');
      setBoatAvailable(true);
      return;
    }
    if (!strokes) measureStrokes();
    if (!strokes.length) return;
    for (const stroke of strokes) {
      stroke.element.style.strokeDasharray = `${stroke.length} ${stroke.length}`;
    }
    section.classList.add('is-animated');
    draw();
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('pageshow', schedule);
  motion.addEventListener('change', applyMotionPreference);
  // Expanding biography details and loading fonts can move the section
  // without a scroll or viewport resize.
  const resize = new ResizeObserver(schedule);
  resize.observe(section);
  const content = document.getElementById('first-content');
  if (content) resize.observe(content);
  applyMotionPreference();
})();
