(() => {
  const trigger = document.querySelector('.finale-boat-link');
  const artwork = document.getElementById('finale');
  if (!trigger || !artwork) return;

  const physicsURL = new URL('vendor/matter-0.20.0.min.js', document.currentScript.src);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const random = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let loading = false;

  // Keep the physics engine off the normal page's loading path. It is bundled
  // locally so the surprise also works without a CDN or third-party requests.
  function loadPhysics() {
    if (window.Matter) return Promise.resolve(window.Matter);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = physicsURL.href;
      script.onload = () => resolve(window.Matter);
      script.onerror = () => {
        script.remove();
        reject(new Error('Could not load gravity'));
      };
      document.head.append(script);
    });
  }

  function captureWords() {
    const words = [];
    const styles = new Map();
    const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!node.textContent.trim() || parent.closest('svg, script, dialog, .interest-subtopics:not(.is-open)')) continue;
      if (!styles.has(parent)) styles.set(parent, getComputedStyle(parent));
      const style = styles.get(parent);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const isName = Boolean(parent.closest('.name-mark'));
      const matches = node.textContent.matchAll(isName ? /\S/g : /\S+/g);
      for (const match of matches) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const rect = range.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        // Do not resurrect news hidden inside its own scroll area.
        const news = parent.closest('.news-list');
        if (news) {
          const clip = news.getBoundingClientRect();
          if (rect.bottom > clip.bottom || rect.top < clip.top) continue;
        }
        const element = document.createElement('span');
        element.className = 'gravity-piece gravity-word';
        element.textContent = match[0];
        for (const prop of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'color', 'textTransform', 'textDecoration']) {
          element.style[prop] = style[prop];
        }
        element.style.lineHeight = `${rect.height}px`;
        words.push({ element, rect, important: isName || Boolean(parent.closest('h2, nav')), isName });
      }
    }
    const budget = motion.matches ? 95 : innerWidth < 600 ? 150 : 260;
    const important = words.filter(word => word.important);
    const rest = words.filter(word => !word.important);
    const stride = Math.max(1, Math.ceil(rest.length / Math.max(1, budget - important.length)));
    return [...important, ...rest.filter((_, index) => index % stride === 0)];
  }

  function captureShards() {
    const rect = artwork.getBoundingClientRect();
    const matrix = artwork.getScreenCTM();
    const canvas = document.createElement('canvas');
    const scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(rect.width * scale);
    canvas.height = Math.ceil(rect.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(matrix.a * scale, matrix.b * scale, matrix.c * scale, matrix.d * scale,
      (matrix.e - rect.left) * scale, (matrix.f - rect.top) * scale);
    ctx.strokeStyle = getComputedStyle(artwork).color;
    ctx.lineWidth = parseFloat(getComputedStyle(artwork.querySelector('path')).strokeWidth);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const path of artwork.querySelectorAll('path')) {
      const isBoat = path.closest('[data-finale-boat]');
      if (isBoat) {
        const boatMatrix = path.getScreenCTM();
        ctx.save();
        ctx.setTransform(boatMatrix.a * scale, boatMatrix.b * scale, boatMatrix.c * scale, boatMatrix.d * scale,
          (boatMatrix.e - rect.left) * scale, (boatMatrix.f - rect.top) * scale);
      }
      ctx.globalAlpha = Number(path.getAttribute('opacity') || 1);
      ctx.stroke(new Path2D(path.getAttribute('d')));
      if (isBoat) ctx.restore();
    }
    const shards = [];
    const columns = motion.matches ? 8 : 12;
    const tile = Math.ceil(canvas.width / columns);
    for (let y = 0; y < canvas.height; y += tile) {
      for (let x = 0; x < canvas.width; x += tile) {
        const w = Math.min(tile, canvas.width - x), h = Math.min(tile, canvas.height - y);
        const pixels = ctx.getImageData(x, y, w, h).data;
        let left = w, top = h, right = -1, bottom = -1;
        for (let py = 0; py < h; py++) {
          for (let px = 0; px < w; px++) {
            if (pixels[(py * w + px) * 4 + 3] < 12) continue;
            left = Math.min(left, px); top = Math.min(top, py);
            right = Math.max(right, px); bottom = Math.max(bottom, py);
          }
        }
        if (right < left) continue;
        const element = document.createElement('canvas');
        element.className = 'gravity-piece gravity-shard';
        element.width = right - left + 1;
        element.height = bottom - top + 1;
        element.getContext('2d').drawImage(canvas, x + left, y + top, element.width, element.height,
          0, 0, element.width, element.height);
        shards.push({ element, rect: {
          x: rect.left + (x + left) / scale, y: rect.top + (y + top) / scale,
          width: element.width / scale, height: element.height / scale,
        } });
      }
    }
    return shards;
  }

  function capsize(Matter) {
    const { Engine, Bodies, Body, Composite, Constraint, Query, Sleeping } = Matter;
    let width = innerWidth, height = innerHeight;
    const origin = trigger.getBoundingClientRect();
    const blast = { x: origin.x + origin.width / 2, y: origin.y + origin.height / 2 };
    const snapshots = [...captureWords(), ...captureShards()];
    const engine = Engine.create({ enableSleeping: true, positionIterations: 6, velocityIterations: 4 });
    engine.gravity.y = 1.65;
    const scene = document.createElement('section');
    scene.className = 'gravity-scene';
    scene.tabIndex = -1;
    scene.setAttribute('aria-label', 'The website has capsized');
    scene.style.setProperty('--blast-x', `${blast.x}px`);
    scene.style.setProperty('--blast-y', `${blast.y}px`);
    const debris = document.createElement('div');
    debris.className = 'gravity-debris';
    debris.setAttribute('aria-hidden', 'true');
    const shock = document.createElement('div');
    shock.className = 'gravity-shockwave';
    shock.setAttribute('aria-hidden', 'true');
    scene.append(debris, shock);

    let walls = [], frame = 0, started = 0, previous = 0, accumulator = 0;
    let held = null, constraint = null, pointer = null, lastPointer = null;
    const entries = snapshots.map(({ element, rect, isName }, index) => {
      const w = Math.min(rect.width, width - 12), h = rect.height;
      const inView = rect.y >= -h && rect.y < height;
      const x = clamp(rect.x + w / 2, w / 2 + 2, width - w / 2 - 2);
      // Content higher up the document rains in from above the current scene.
      const y = inView ? rect.y + h / 2 : -random(60, height * 0.9);
      const body = Bodies.rectangle(x, y, Math.max(w, 5), Math.max(h * 0.78, 5), {
        restitution: 0.48, friction: 0.55, frictionStatic: 0.8, frictionAir: 0.008,
        density: isName ? 0.004 : 0.0015, sleepThreshold: 75,
      });
      element.style.width = `${w}px`;
      element.style.height = `${h}px`;
      debris.append(element);
      const angle = Math.atan2(y - blast.y, x - blast.x);
      const entry = { element, body, w, h, released: false,
        delay: inView ? random(80, 260) : random(350, 1700),
        vx: inView ? Math.cos(angle) * random(5, 15) : random(-5, 5),
        vy: inView ? Math.sin(angle) * random(7, 16) - 5 : random(0, 3),
        spin: random(-0.16, 0.16),
      };
      if (motion.matches) {
        Body.setPosition(body, { x: random(w / 2 + 6, width - w / 2 - 6),
          y: height - 30 - (index % 9) * Math.min(32, height / 20) });
        Body.setAngle(body, random(-0.6, 0.6));
      }
      return entry;
    });

    function renderEntry(entry) {
      const { position, angle } = entry.body;
      entry.element.style.transform = `translate3d(${position.x - entry.w / 2}px, ${position.y - entry.h / 2}px, 0) rotate(${angle}rad)`;
    }

    function release(entry) {
      entry.released = true;
      Composite.add(engine.world, entry.body);
      if (!motion.matches) {
        Body.setVelocity(entry.body, { x: entry.vx, y: entry.vy });
        Body.setAngularVelocity(entry.body, entry.spin);
      }
    }

    function resize() {
      const oldWidth = width, oldHeight = height;
      width = innerWidth; height = innerHeight;
      Composite.remove(engine.world, walls);
      walls = [
        Bodies.rectangle(width / 2, height + 60, width + 240, 120, { isStatic: true }),
        Bodies.rectangle(-60, height / 2 - 1500, 120, height + 4000, { isStatic: true }),
        Bodies.rectangle(width + 60, height / 2 - 1500, 120, height + 4000, { isStatic: true }),
      ];
      Composite.add(engine.world, walls);
      for (const entry of entries) {
        const body = entry.body;
        const halfWidth = (body.bounds.max.x - body.bounds.min.x) / 2;
        const halfHeight = (body.bounds.max.y - body.bounds.min.y) / 2;
        // Keep each layer's distance above the floor, instead of compressing
        // the whole pile into the new bottom edge when the viewport shrinks.
        Body.setPosition(body, {
          x: clamp(body.position.x * width / oldWidth, halfWidth + 1, width - halfWidth - 1),
          y: Math.min(body.position.y + height - oldHeight, height - halfHeight - 1),
        });
        Sleeping.set(body, false);
        renderEntry(entry);
      }
    }

    function contain(entry) {
      const { body } = entry;
      const { min, max } = body.bounds;
      const dx = max.x < 0 ? 1 - min.x : min.x > width ? width - max.x - 1 : 0;
      const dy = min.y > height ? height - max.y - 1 : 0;
      if (!dx && !dy) return;
      // Severe resize compression can push a body through a wall in one step.
      // Recover escaped bodies so they stay grabbable and can settle to sleep.
      Body.translate(body, { x: dx, y: dy });
      Body.setVelocity(body, { x: dx ? 0 : body.velocity.x, y: dy ? 0 : body.velocity.y });
      Sleeping.set(body, false);
    }

    function tick(now) {
      frame = 0;
      if (motion.matches || document.hidden) return;
      if (!started) started = now;
      const elapsed = now - started;
      for (const entry of entries) {
        if (!entry.released && elapsed >= entry.delay) release(entry);
      }
      // Fixed steps keep bounces and dragging consistent on 60/120 Hz displays.
      accumulator += Math.min(now - (previous || now), 50);
      previous = now;
      engine.gravity.x = elapsed < 1400 ? Math.sin(elapsed / 260) * 0.75 : 0;
      while (accumulator >= 1000 / 60) {
        Engine.update(engine, 1000 / 60);
        accumulator -= 1000 / 60;
      }
      for (const entry of entries) {
        if (!entry.released) continue;
        contain(entry);
        renderEntry(entry);
      }
      if (elapsed < 2200 || held || entries.some(entry => !entry.body.isSleeping)) frame = requestAnimationFrame(tick);
    }

    function wake() {
      if (!frame && !motion.matches && !document.hidden) {
        previous = 0;
        frame = requestAnimationFrame(tick);
      }
    }

    function releasePointer(event) {
      if (event && event.pointerId !== pointer) return;
      if (constraint) Composite.remove(engine.world, constraint);
      if (held) held.element.classList.remove('is-held');
      held = constraint = pointer = lastPointer = null;
      scene.classList.remove('is-grabbing');
      wake();
    }

    scene.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || pointer !== null) return;
      const point = { x: event.clientX, y: event.clientY };
      const bodies = entries.filter(entry => entry.released).map(entry => entry.body);
      // Typography's visual box is a little taller than its collision body.
      // Prefer the browser's hit target so an edge grab selects what was touched.
      const target = entries.find(entry => entry.element === event.target && entry.released);
      const body = target?.body || Query.point(bodies, point).pop();
      if (!body) return;
      event.preventDefault();
      pointer = event.pointerId;
      scene.setPointerCapture(pointer);
      held = entries.find(entry => entry.body === body);
      held.element.classList.add('is-held');
      scene.classList.add('is-grabbing');
      lastPointer = { ...point, offsetX: point.x - body.position.x, offsetY: point.y - body.position.y };
      Sleeping.set(body, false);
      if (!motion.matches) {
        constraint = Constraint.create({ pointA: point, bodyB: body,
          pointB: { x: point.x - body.position.x, y: point.y - body.position.y },
          stiffness: 0.22, damping: 0.12, length: 0 });
        Composite.add(engine.world, constraint);
      }
      wake();
    });

    scene.addEventListener('pointermove', event => {
      if (!held || event.pointerId !== pointer) return;
      event.preventDefault();
      if (motion.matches) {
        Body.setPosition(held.body, {
          x: clamp(event.clientX - lastPointer.offsetX, held.w / 2, width - held.w / 2),
          y: clamp(event.clientY - lastPointer.offsetY, held.h / 2, height - held.h / 2),
        });
        renderEntry(held);
      } else {
        constraint.pointA = { x: event.clientX, y: event.clientY };
        Sleeping.set(held.body, false);
      }
    });
    scene.addEventListener('pointerup', releasePointer);
    scene.addEventListener('pointercancel', releasePointer);
    scene.addEventListener('lostpointercapture', releasePointer);

    // Hidden tabs do no work. Resuming never integrates the time spent away.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(frame); frame = 0;
        releasePointer();
      } else wake();
    });
    motion.addEventListener('change', () => {
      releasePointer();
      if (motion.matches) {
        cancelAnimationFrame(frame); frame = 0;
        for (const entry of entries) {
          if (!entry.released) release(entry);
          Body.setVelocity(entry.body, { x: 0, y: 0 });
          Body.setAngularVelocity(entry.body, 0);
        }
      } else wake();
    });
    window.addEventListener('resize', () => { resize(); wake(); });

    for (const entry of entries) {
      renderEntry(entry);
      if (motion.matches) release(entry);
    }
    document.body.append(scene);
    document.body.classList.add('has-capsized');
    document.documentElement.classList.add('has-capsized');
    document.querySelector('main').inert = true;
    scene.focus({ preventScroll: true });
    resize();
    wake();
  }

  async function activate(event) {
    event.preventDefault();
    if (trigger.getAttribute('aria-disabled') === 'true' || loading || document.body.classList.contains('has-capsized')) return;
    loading = true;
    trigger.classList.add('is-capsizing');
    trigger.setAttribute('aria-busy', 'true');
    try {
      const Matter = await loadPhysics();
      capsize(Matter);
      document.querySelector('.gravity-load-error')?.remove();
    } catch (error) {
      // A failed asset load leaves the intact website usable and retryable.
      if (!document.querySelector('.gravity-load-error')) {
        const message = document.createElement('p');
        message.className = 'gravity-load-error';
        message.setAttribute('role', 'status');
        message.textContent = 'The boat is stuck. Give it another try.';
        document.querySelector('.finale-figure').append(message);
      }
      console.error(error);
    } finally {
      loading = false;
      trigger.classList.remove('is-capsizing');
      trigger.removeAttribute('aria-busy');
    }
  }

  trigger.addEventListener('click', activate);
  trigger.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') activate(event);
  });
})();
