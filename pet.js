/* ============================================
   HUBI VIRTUAL PET — Logic for the roaming cat
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    const STATES = {
        SITTING: 'sitting',
        IDLE: 'idle',
        WALKING: 'walking',
        SLEEPING: 'sleeping',
        EATING: 'eating',
        CHASING: 'chasing',
        PETTED: 'petted',
        GROOMING: 'grooming',
        STRETCHING: 'stretching',
        HUNTING: 'hunting',
        BUTTERFLY: 'butterfly',
        BOX: 'box',
        PRODUCTIVE: 'productive',
        TREAT: 'treat',
        // Task-preview states (mascot slot only)
        TASK_LERNEN: 'task-lernen',
        TASK_PUTZEN: 'task-putzen',
        TASK_ENTSPANNEN: 'task-entspannen',
        TASK_KOCHEN: 'task-kochen',
        TASK_SPORT: 'task-sport',
        TASK_KREATIV: 'task-kreativ',
        TASK_EINKAUFEN: 'task-einkaufen',
    };

    class HubiPet {
        constructor() {
            this.direction = 1;
            this.state = STATES.SITTING;
            this.speed = 100;

            this.initDOM();
            this.startFromMascot();
        }

        initDOM() {
            this.container = document.createElement('div');
            this.container.id = 'hubi-pet';

            this.container.innerHTML = `
                <span class="pet-prop prop-zzz" aria-hidden="true">💤</span>
                <span class="pet-prop prop-fish" aria-hidden="true">🐟</span>
                <span class="pet-prop prop-toy" aria-hidden="true">🧶</span>
                <span class="pet-prop prop-heart" aria-hidden="true">&#10084;</span>
                <span class="pet-prop prop-butterfly" aria-hidden="true">🦋</span>
                <span class="pet-prop prop-mouse" aria-hidden="true">🐭</span>
                <span class="pet-prop prop-box" aria-hidden="true">📦</span>
                <span class="pet-prop prop-laptop" aria-hidden="true">💻</span>
                <span class="pet-prop prop-glasses" aria-hidden="true">👓</span>
                <span class="pet-prop prop-dream" aria-hidden="true">
                    <span class="dream-bubble"></span>
                    <span class="dream-dot dream-dot-1"></span>
                    <span class="dream-dot dream-dot-2"></span>
                    <span class="dream-fish">🐟</span>
                </span>
                <span class="pet-prop prop-book" aria-hidden="true">
                    <span class="book-cover"></span>
                    <span class="book-page"></span>
                    <span class="book-page book-page-flip"></span>
                </span>
                <span class="pet-prop prop-pot" aria-hidden="true">
                    <span class="pot-body"></span>
                    <span class="pot-steam">~</span>
                    <span class="pot-steam pot-steam-2">~</span>
                    <span class="pot-steam pot-steam-3">~</span>
                </span>
                <span class="pet-prop prop-cart" aria-hidden="true">
                    <span class="cart-body">🛒</span>
                    <span class="cart-treat">🐟</span>
                    <span class="cart-treat cart-treat-2">🐟</span>
                    <span class="cart-treat cart-treat-3">🐟</span>
                </span>
                ${window.getHubiCatHTML('', 'hubi-pet-sprite')}
            `;

            document.body.appendChild(this.container);
            this.sprite = this.container.querySelector('#hubi-pet-sprite');

            // Speech bubble lives in its own body-level layer so it can
            // render in front of the UI while the cat stays behind it.
            this.speechLayer = document.createElement('div');
            this.speechLayer.id = 'hubi-speech';
            this.speechLayer.innerHTML = `
                <div class="speech-bubble" aria-hidden="true">
                    <span class="speech-text"></span>
                </div>
            `;
            document.body.appendChild(this.speechLayer);

            // Move glasses inside cat-head so they follow head animations naturally
            const glasses = this.container.querySelector('.prop-glasses');
            const head = this.sprite.querySelector('.cat-head');
            if (glasses && head) head.appendChild(glasses);

            this.initBodyProps(head);

            // Meow sounds
            this.meowSounds = [];
            this.loadMeows();

            // Touch / click interaction — on the sprite since container has pointer-events: none
            this.sprite.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                this.onPetted();
            });
        }

        // Props that attach to cat body parts (follow animations naturally).
        // Kept as a separate method so future props are easy to add.
        initBodyProps(head) {
            const body = this.sprite.querySelector('.cat-body');
            const face = this.sprite.querySelector('.cat-face');

            // Chef hat (kochen) — tall toque on the head
            const chefHat = document.createElement('div');
            chefHat.className = 'body-prop prop-chef-hat';
            chefHat.setAttribute('aria-hidden', 'true');
            if (head) head.appendChild(chefHat);

            // Headband (sport) — colored band across the head
            const headband = document.createElement('div');
            headband.className = 'body-prop prop-headband';
            headband.setAttribute('aria-hidden', 'true');
            if (head) head.appendChild(headband);

            // Sweat drops (sport) — animated drops
            const sweat = document.createElement('span');
            sweat.className = 'body-prop prop-sweat';
            sweat.setAttribute('aria-hidden', 'true');
            sweat.innerHTML = '<span class="sweat-drop">💧</span><span class="sweat-drop">💧</span>';
            if (head) head.appendChild(sweat);

            // Paint spots (kreativ) — colored dots on the face
            const spots = document.createElement('div');
            spots.className = 'body-prop prop-paint-spots';
            spots.setAttribute('aria-hidden', 'true');
            spots.innerHTML = '<span class="paint-dot" style="background:#EF5350"></span>'
                + '<span class="paint-dot" style="background:#42A5F5"></span>'
                + '<span class="paint-dot" style="background:#66BB6A"></span>';
            if (face) face.appendChild(spots);

            // Brush (kreativ) — attached to front-left leg so it follows the paw
            const legFL = this.sprite.querySelector('.cat-leg.front.left');
            const brush = document.createElement('span');
            brush.className = 'body-prop prop-brush';
            brush.setAttribute('aria-hidden', 'true');
            brush.textContent = '🖌️';
            if (legFL) legFL.appendChild(brush);

            // Easel (kreativ) — canvas on a stand
            const easel = document.createElement('div');
            easel.className = 'pet-prop prop-easel';
            easel.setAttribute('aria-hidden', 'true');
            easel.innerHTML = '<div class="easel-leg-l"></div><div class="easel-leg-r"></div>'
                + '<div class="easel-canvas"><span class="canvas-stroke s1"></span>'
                + '<span class="canvas-stroke s2"></span><span class="canvas-stroke s3"></span></div>';
            this.container.appendChild(easel);
        }

        loadMeows() {
            this.meowSounds = ['assets/meow1.mp3', 'assets/meow2.mp3', 'assets/meow3.mp3'].map(src => {
                const audio = new Audio(src);
                audio.preload = 'auto';
                audio.volume = 0.5;
                return audio;
            });
        }

        playMeow() {
            if (!this.meowSounds.length) return;
            const audio = this.meowSounds[Math.floor(Math.random() * this.meowSounds.length)];
            const clone = audio.cloneNode();
            clone.volume = 0.4 + Math.random() * 0.3;
            clone.playbackRate = 0.9 + Math.random() * 0.3;
            clone.play().catch(() => {
                // Android autoplay policy may block audio — no user-facing error needed
            });
        }

        onPetted() {
            // Don't interrupt treat sequence
            if (this.state === STATES.TREAT) return;

            const prevState = this.state;

            // Interrupt current action and react
            this.container.classList.remove(this.state);
            this.state = STATES.PETTED;
            this.container.classList.add(STATES.PETTED);

            // ~50% chance to meow
            if (Math.random() < 0.5) {
                this.playMeow();
            }

            // After the reaction, return appropriately
            setTimeout(() => {
                if (this.state !== STATES.PETTED) return;
                if (this.inMascotSlot) {
                    // Return to the task preview pose
                    this.container.classList.remove(STATES.PETTED);
                    this.state = prevState;
                    this.container.classList.add(prevState);
                } else {
                    this.transitionToIdle();
                }
            }, 1800);
        }

        isNarrow() {
            return window.innerWidth <= 520;
        }

        // Map task categories to cat animation states
        static TASK_ANIMATIONS = {
            arbeiten:   STATES.PRODUCTIVE,
            lernen:     STATES.TASK_LERNEN,
            putzen:     STATES.TASK_PUTZEN,
            entspannen: STATES.TASK_ENTSPANNEN,
            kochen:     STATES.TASK_KOCHEN,
            sport:      STATES.TASK_SPORT,
            kreativ:    STATES.TASK_KREATIV,
            einkaufen:  STATES.TASK_EINKAUFEN,
        };

        startFromMascot() {
            this.inMascotSlot = true;

            // Find the slot reserved for the mascot in the header
            const slot = document.getElementById('mascot-slot');
            if (!slot) {
                // Fallback: no slot found, start normally
                this.x = window.innerWidth / 2;
                this.y = this.maxY() * 0.7;
                this.updateTransform(0);
                this.setState(STATES.IDLE);
                this.inMascotSlot = false;
                setTimeout(() => this.decideNextAction(), 2000);
                return;
            }

            // Position the pet in the mascot slot
            // On mobile (absolute positioning) we need document-relative coords
            const rect = slot.getBoundingClientRect();
            const scrollY = this.isNarrow() ? window.scrollY : 0;
            this.x = rect.left + rect.width / 2 - 30;
            this.y = rect.top + scrollY;

            this.container.classList.add(STATES.SITTING);
            this.container.style.transition = 'none';
            this.container.style.transform = `translate(${this.x}px, ${this.y}px)`;

            // If there's already an active session (page reload mid-work),
            // skip waiting and jump down immediately
            if (typeof ActiveState !== 'undefined' && ActiveState.get()) {
                setTimeout(() => this.startCycle(), 1500);
                return;
            }

            // Otherwise stay sitting — wait for setTaskPreview() or startCycle()
        }

        // Re-center in the mascot slot (called after page re-render)
        repositionInSlot() {
            if (!this.inMascotSlot) return;
            const slot = document.getElementById('mascot-slot');
            if (!slot) return;
            const rect = slot.getBoundingClientRect();
            const scrollY = this.isNarrow() ? window.scrollY : 0;
            this.x = rect.left + rect.width / 2 - 30;
            this.y = rect.top + scrollY;
            this.container.style.transform = `translate(${this.x}px, ${this.y}px)`;
        }

        // Called by the slot reel when the selected task changes.
        // Smoothly transitions Hubi's pose to preview the task animation
        // while she remains in the mascot slot.
        setTaskPreview(taskKey) {
            if (!this.inMascotSlot) return;

            const targetState = HubiPet.TASK_ANIMATIONS[taskKey] || STATES.IDLE;

            // Don't re-apply the same state
            if (this.state === targetState) return;

            this.container.classList.remove(this.state);
            this.state = targetState;
            this.container.classList.add(this.state);
        }

        // Called when the user presses Start. Hubi jumps down from the
        // mascot slot and begins her autonomous behaviour cycle.
        startCycle() {
            if (!this.inMascotSlot) return;
            this.inMascotSlot = false;

            // Re-read slot position in case layout shifted
            const slot = document.getElementById('mascot-slot');
            if (slot) {
                const rect = slot.getBoundingClientRect();
                const scrollY = this.isNarrow() ? window.scrollY : 0;
                this.x = rect.left + rect.width / 2 - 30;
                this.y = rect.top + scrollY;
            }

            if (this.isNarrow()) {
                this.walkToZone();
            } else {
                this.jumpDown();
            }
        }

        walkToZone() {
            this.setState(STATES.WALKING);

            const target = this.findMobileTarget();
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            this.direction = dx >= 0 ? 1 : -1;
            const duration = (distance / this.speed) * 1000;

            this.x = target.x;
            this.y = target.y;
            this.updateTransform(duration);

            setTimeout(() => {
                if (this.state === STATES.WALKING) {
                    this.transitionToIdle();
                }
            }, duration);
        }

        jumpDown() {
            const startX = this.x;
            const startY = this.y;
            const target = this.findSafeTarget();
            const endX = target.x;
            const endY = target.y;

            // Face the direction of the jump
            this.direction = endX > startX ? 1 : -1;
            const flip = this.direction > 0 ? -1 : 1;
            if (this.sprite) {
                this.sprite.style.scale = `${flip} 1`;
            }

            // Animate a parabolic jump using requestAnimationFrame
            const duration = 700; // ms
            const jumpHeight = 120; // pixels above the start point
            const startTime = performance.now();

            const animate = (now) => {
                const elapsed = now - startTime;
                const t = Math.min(elapsed / duration, 1);

                // Linear interpolation for horizontal/vertical base movement
                const x = startX + (endX - startX) * t;
                const baseY = startY + (endY - startY) * t;

                // Parabolic arc: peaks at t=0.35 (early in the jump, like a real leap)
                const arc = -jumpHeight * 4 * (t - 0.35) * (t - 0.35) + jumpHeight * 4 * 0.35 * 0.35;
                const y = baseY - Math.max(0, arc);

                this.container.style.transition = 'none';
                this.container.style.transform = `translate(${x}px, ${y}px)`;

                if (t < 1) {
                    requestAnimationFrame(animate);
                } else {
                    // Landed
                    this.x = endX;
                    this.y = endY;
                    this.transitionToIdle();
                }
            };

            requestAnimationFrame(animate);
        }

        setState(newState, durationMs) {
            const prevState = this.state;

            // Clean up treat DOM/classes if we're being pulled out of the treat state
            if (prevState === STATES.TREAT && newState !== STATES.TREAT) {
                this.cleanupTreat();
            }

            this.container.classList.remove(prevState);
            this.state = newState;
            this.container.classList.add(this.state);

            if (durationMs) {
                setTimeout(() => {
                    if (this.state === newState) {
                        this.transitionToIdle();
                    }
                }, durationMs);
            }
        }

        // Smoothly return to idle pose before picking the next action.
        // The CSS transitions on body parts handle the visual interpolation.
        transitionToIdle() {
            this.container.classList.remove(this.state);
            this.state = STATES.IDLE;
            this.container.classList.add(STATES.IDLE);

            // Let the body parts settle into their idle transforms before deciding
            const settleTime = 600 + Math.random() * 800;
            setTimeout(() => {
                if (this.state === STATES.IDLE) {
                    this.decideNextAction();
                }
            }, settleTime);
        }

        maxY() {
            if (this.isNarrow()) {
                const zone = document.getElementById('hubi-zone');
                const nav = document.getElementById('bottom-nav');
                if (zone) {
                    const r = zone.getBoundingClientRect();
                    const navHeight = nav ? nav.getBoundingClientRect().height : 80;
                    return r.bottom + window.scrollY - navHeight - 80;
                }
            }
            // Stay above the bottom nav (roughly bottom 80px) with some margin
            return window.innerHeight - 160;
        }

        getObstacles() {
            const obstacles = [];
            const margin = 6;
            const scrollY = this.isNarrow() ? window.scrollY : 0;

            // The main content column — avoid entirely
            const app = document.getElementById('app');
            if (app) {
                const r = app.getBoundingClientRect();
                obstacles.push({
                    left: r.left - margin,
                    top: r.top + scrollY - margin,
                    right: r.right + margin,
                    bottom: r.bottom + scrollY + margin
                });
            }

            // Bottom nav
            const nav = document.getElementById('bottom-nav');
            if (nav) {
                const r = nav.getBoundingClientRect();
                obstacles.push({
                    left: r.left,
                    top: r.top + scrollY - margin,
                    right: r.right,
                    bottom: r.bottom + scrollY
                });
            }

            return obstacles;
        }

        hitsObstacle(x, y, obstacles) {
            const catW = 60, catH = 60;
            for (const o of obstacles) {
                if (x + catW > o.left && x < o.right &&
                    y + catH > o.top && y < o.bottom) {
                    return true;
                }
            }
            return false;
        }

        findMobileTarget() {
            const zone = document.getElementById('hubi-zone');
            if (!zone) return { x: window.innerWidth / 2, y: window.innerHeight };

            const r = zone.getBoundingClientRect();
            const nav = document.getElementById('bottom-nav');
            const navHeight = nav ? nav.getBoundingClientRect().height : 80;
            const scrollY = window.scrollY;
            const catSize = 60;
            const margin = 10;

            const zoneTop = r.top + scrollY + margin;
            const zoneBottom = r.bottom + scrollY - navHeight - catSize - margin;
            const zoneLeft = margin;
            const zoneRight = window.innerWidth - catSize - margin;

            const x = zoneLeft + Math.random() * Math.max(0, zoneRight - zoneLeft);
            // Bias toward the top of the zone so she stays close to the app card
            // (and visible without the user having to scroll further down).
            const yRange = Math.max(0, zoneBottom - zoneTop);
            const u = Math.random();
            const biased = u * u; // squared → favors small values → top of zone
            const y = zoneTop + biased * yRange;
            return { x, y };
        }

        findSafeTarget() {
            // On narrow screens, confine to the hubi zone
            if (this.isNarrow()) {
                return this.findMobileTarget();
            }

            const maxX = window.innerWidth - 80;
            const maxY = this.maxY();
            const catSize = 60;

            // Build list of safe zones (left of content, right of content, below content).
            // Smaller margin (6px) so side zones exist on narrower windows; biased
            // toward the inner edge of each zone so Hubi roams CLOSE to the UI
            // rather than wandering off into dead corners.
            const app = document.getElementById('app');
            const safeZones = [];

            if (app) {
                const r = app.getBoundingClientRect();
                const margin = 6;
                const innerBias = 0.65; // 0..1, higher = closer to the app edge

                // Left side of content (cat sits to the LEFT of the card)
                if (r.left - margin > catSize + 5) {
                    safeZones.push({
                        xMin: 5, xMax: r.left - margin - catSize,
                        yMin: Math.max(10, r.top), yMax: Math.min(maxY, r.bottom),
                        innerEdge: 'right'
                    });
                }
                // Right side of content (cat sits to the RIGHT of the card)
                if (maxX - (r.right + margin) > catSize + 5) {
                    safeZones.push({
                        xMin: r.right + margin, xMax: maxX,
                        yMin: Math.max(10, r.top), yMax: Math.min(maxY, r.bottom),
                        innerEdge: 'left'
                    });
                }
                // Below content (above nav)
                const contentBottom = r.bottom + margin;
                if (maxY - contentBottom > catSize + 5) {
                    safeZones.push({
                        xMin: Math.max(5, r.left - 40),
                        xMax: Math.min(maxX, r.right + 40),
                        yMin: contentBottom, yMax: maxY,
                        innerEdge: 'top'
                    });
                }

                // Pick a zone, then a point biased toward the UI edge so she
                // visibly hangs around the app rather than going to the screen edge.
                if (safeZones.length > 0) {
                    const zone = safeZones[Math.floor(Math.random() * safeZones.length)];
                    const w = Math.max(1, zone.xMax - zone.xMin);
                    const h = Math.max(1, zone.yMax - zone.yMin);
                    const ux = Math.random();
                    const uy = Math.random();
                    let x, y;
                    if (zone.innerEdge === 'right') {
                        x = zone.xMax - ux * w * (1 - innerBias);
                        y = zone.yMin + uy * h;
                    } else if (zone.innerEdge === 'left') {
                        x = zone.xMin + ux * w * (1 - innerBias);
                        y = zone.yMin + uy * h;
                    } else { // top (below the card)
                        x = zone.xMin + ux * w;
                        y = zone.yMin + uy * h * (1 - innerBias);
                    }
                    return { x, y };
                }
            }

            // Fallback: try random positions avoiding obstacles
            const obstacles = this.getObstacles();
            for (let i = 0; i < 30; i++) {
                const x = Math.random() * maxX + 10;
                const y = Math.random() * maxY + 10;
                if (!this.hitsObstacle(x, y, obstacles)) {
                    return { x, y };
                }
            }

            // Last resort: screen edges
            const side = Math.random() < 0.5 ? 15 : maxX - 15;
            return { x: side, y: maxY * 0.5 };
        }

        updateTransform(transitionTimeMs = 0) {
            // Keep in bounds — on mobile maxY is document-relative
            const boundsX = window.innerWidth - 80;
            const boundsY = this.maxY();

            this.x = Math.max(10, Math.min(this.x, boundsX));
            this.y = Math.max(10, Math.min(this.y, boundsY));

            this.container.style.transition = transitionTimeMs
                ? `transform ${transitionTimeMs}ms cubic-bezier(0.25, 0.1, 0.25, 1)`
                : 'none';
            this.container.style.transform = `translate(${this.x}px, ${this.y}px)`;

            // Flip the sprite immediately via independent scale property (avoids folding & CSS conflict)
            const flip = this.direction > 0 ? -1 : 1;
            if (this.sprite) {
                this.sprite.style.scale = `${flip} 1`;
            }
        }

        decideNextAction() {
            // Check if the user earned a treat
            if (this.checkTreatEligibility()) return;

            const rand = Math.random();

            // Chances (walk-heavy so the cat feels natural):
            // 40% Walk
            // 12% Eat
            // 14% Sleep
            // 7% Chase
            // 7% Grooming
            // 5% Stretching
            // 5% Hunting
            // 4% Butterfly
            // 3% Box
            // 3% Productive

            if (rand < 0.40) {
                this.walkToRandom();
            } else if (rand < 0.52) {
                this.setState(STATES.EATING, 4000 + Math.random() * 3000);
            } else if (rand < 0.66) {
                this.setState(STATES.SLEEPING, 6000 + Math.random() * 5000);
            } else if (rand < 0.73) {
                this.chaseToy();
            } else if (rand < 0.80) {
                this.setState(STATES.GROOMING, 3000 + Math.random() * 2000);
            } else if (rand < 0.85) {
                this.setState(STATES.STRETCHING, 2500);
            } else if (rand < 0.90) {
                this.setState(STATES.HUNTING, 3000 + Math.random() * 2000);
            } else if (rand < 0.94) {
                this.setState(STATES.BUTTERFLY, 5000);
            } else if (rand < 0.97) {
                this.setState(STATES.BOX, 5000 + Math.random() * 2000);
            } else {
                this.setState(STATES.PRODUCTIVE, 5000 + Math.random() * 3000);
            }
        }

        walkToRandom() {
            this.setState(STATES.WALKING);

            const target = this.findSafeTarget();
            let targetX = target.x;
            let targetY = target.y;

            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            this.direction = dx >= 0 ? 1 : -1;

            // Duration based on distance and speed
            const duration = (distance / this.speed) * 1000;

            this.x = targetX;
            this.y = targetY;
            this.updateTransform(duration);

            setTimeout(() => {
                if (this.state === STATES.WALKING) {
                    this.transitionToIdle();
                }
            }, duration);
        }

        chaseToy() {
            this.setState(STATES.CHASING);
            this.speed = 200; // Run much faster

            // Pick a safe point across the screen
            const target = this.findSafeTarget();
            let targetX = target.x;
            let targetY = target.y;

            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            this.direction = dx >= 0 ? 1 : -1;

            const duration = (distance / this.speed) * 1000;

            this.x = targetX;
            this.y = targetY;
            this.updateTransform(duration);

            setTimeout(() => {
                this.speed = 100; // Reset speed
                this.transitionToIdle();
            }, duration);
        }

        findTreatSpot() {
            const minDist = 150;
            let best = null;
            let bestDist = 0;

            for (let i = 0; i < 20; i++) {
                const candidate = this.findSafeTarget();
                const dx = candidate.x - this.x;
                const dy = candidate.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist >= minDist) return candidate;
                if (dist > bestDist) {
                    best = candidate;
                    bestDist = dist;
                }
            }

            return best || this.findSafeTarget();
        }

        // --- TREAT SYSTEM ---
        // Note: depends on todayStr(), Storage, and ActiveState from app.js

        getTodayWorkMs() {
            const today = todayStr();
            let total = 0;

            // Completed sessions
            const sessions = Storage.getSessions();
            for (const s of sessions) {
                if (s.date === today) total += s.totalWork;
            }

            // Active session work so far
            const active = ActiveState.get();
            if (active && active.startTime) {
                const elapsed = Date.now() - active.startTime;
                let breakMs = 0;
                if (active.breaks) {
                    for (const b of active.breaks) {
                        breakMs += (b.end || Date.now()) - b.start;
                    }
                }
                if (active.currentBreakStart) {
                    breakMs += Date.now() - active.currentBreakStart;
                }
                total += Math.max(0, elapsed - breakMs);
            }

            return total;
        }

        checkTreatEligibility() {
            const today = todayStr();
            if (localStorage.getItem('hubi_treat_date') === today) return false;
            if (this.treatPending) return false;
            if (this.getTodayWorkMs() < 4 * 3600000) return false;

            // If page is hidden, wait until user comes back
            if (document.hidden) {
                this.treatPending = true;
                const onVisible = () => {
                    if (document.visibilityState === 'visible') {
                        document.removeEventListener('visibilitychange', onVisible);
                        this.treatPending = false;
                        // Re-check eligibility — date may have rolled over while hidden
                        if (localStorage.getItem('hubi_treat_date') !== todayStr()) {
                            this.startTreatSequence();
                        }
                    }
                };
                document.addEventListener('visibilitychange', onVisible);
                return false;
            }

            this.startTreatSequence();
            return true;
        }

        triggerTreat() {
            // Public method for dev menu — skip eligibility
            this.cleanupTreat();
            this.startTreatSequence();
        }

        startTreatSequence() {
            localStorage.setItem('hubi_treat_date', todayStr());
            this.setState(STATES.TREAT);
            this.treatPhase = 'waiting';

            // Safety timeout — if anything goes wrong, recover after 25s
            this.treatSafetyTimer = setTimeout(() => {
                if (this.state === STATES.TREAT) {
                    this.cleanupTreat();
                    this.container.classList.remove(STATES.TREAT);
                    this.transitionToIdle();
                }
            }, 25000);

            // Pick a position for the tray — away from Hubi
            const target = this.findTreatSpot();
            this.treatTarget = target;

            // On narrow screens, treat elements use absolute positioning
            // so coordinates need scroll offset to match document-relative coords
            const scrollY = this.isNarrow() ? window.scrollY : 0;

            // Create tray element
            this.treatTray = document.createElement('div');
            this.treatTray.className = 'treat-tray';
            this.treatTray.style.left = target.x + 'px';
            this.treatTray.style.top = (target.y + 40 + scrollY) + 'px';
            if (this.isNarrow()) {
                this.treatTray.style.position = 'absolute';
            }
            document.body.appendChild(this.treatTray);

            // Create treat box above tray
            this.treatBox = document.createElement('div');
            this.treatBox.className = 'treat-box';
            this.treatBox.style.left = (target.x - 5) + 'px';
            this.treatBox.style.top = (target.y - 70 + scrollY) + 'px';
            if (this.isNarrow()) {
                this.treatBox.style.position = 'absolute';
            }
            this.treatBox.innerHTML = '<span class="treat-box-label">Treats!</span>';
            document.body.appendChild(this.treatBox);

            // Click handler on the treat box
            this.treatBoxHandler = () => this.onTreatBoxClicked();
            this.treatBox.addEventListener('click', this.treatBoxHandler);

            window.dispatchEvent(new CustomEvent('hubi-treat-unlocked'));
        }

        onTreatBoxClicked() {
            if (this.treatPhase !== 'waiting') return;
            this.treatBox.removeEventListener('click', this.treatBoxHandler);
            this.runTreatPhases();
        }

        async runTreatPhases() {
            const delay = ms => new Promise(r => { this.treatDelayTimer = setTimeout(r, ms); });
            const aborted = () => this.state !== STATES.TREAT;

            // Phase: pouring
            this.treatPhase = 'pouring';
            this.treatBox.classList.add('pouring');
            this.spawnTreatParticles();

            await delay(1200);
            if (aborted()) return;

            // Phase: running to tray
            this.treatPhase = 'running';
            this.container.classList.add('treat-run');
            this.playMeow();

            const dx = this.treatTarget.x - this.x;
            const dy = this.treatTarget.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            this.direction = dx >= 0 ? 1 : -1;
            const runDuration = (distance / 180) * 1000;

            this.x = this.treatTarget.x;
            this.y = this.treatTarget.y;
            this.updateTransform(runDuration);

            await delay(runDuration);
            if (aborted()) return;

            // Phase: eating
            this.container.classList.remove('treat-run');
            this.treatPhase = 'eating';
            this.container.classList.add('treat-eat');

            await delay(4000 + Math.random() * 1000);
            if (aborted()) return;

            // Phase: happy
            this.container.classList.remove('treat-eat');
            this.treatPhase = 'happy';
            this.container.classList.add('treat-happy');
            this.spawnTreatHearts();

            await delay(2000);
            if (aborted()) return;

            // Phase: food coma — transition to sleeping
            this.container.classList.remove('treat-happy');
            this.cleanupTreat();
            this.container.classList.remove(STATES.TREAT);
            this.state = STATES.SLEEPING;
            this.container.classList.add(STATES.SLEEPING);

            await delay(8000 + Math.random() * 2000);
            if (this.state === STATES.SLEEPING) {
                this.transitionToIdle();
            }
        }

        spawnTreatParticles() {
            const scrollY = this.isNarrow() ? window.scrollY : 0;
            const count = 5 + Math.floor(Math.random() * 4);
            for (let i = 0; i < count; i++) {
                const p = document.createElement('div');
                p.className = 'treat-particle';
                p.style.left = (this.treatTarget.x + 5 + Math.random() * 30) + 'px';
                p.style.top = (this.treatTarget.y - 10 + scrollY) + 'px';
                if (this.isNarrow()) {
                    p.style.position = 'absolute';
                }
                p.style.setProperty('--drift', (Math.random() * 10 - 5) + 'px');
                p.style.animationDelay = (i * 0.1) + 's';
                document.body.appendChild(p);
                p.addEventListener('animationend', () => p.remove());
            }
        }

        spawnTreatHearts() {
            const scrollY = this.isNarrow() ? window.scrollY : 0;
            for (let i = 0; i < 3; i++) {
                const heart = document.createElement('div');
                heart.className = 'treat-heart';
                heart.textContent = '\u2764';
                heart.style.left = (this.x + 10 + i * 15) + 'px';
                heart.style.top = (this.y - 10 + scrollY) + 'px';
                if (this.isNarrow()) {
                    heart.style.position = 'absolute';
                }
                heart.style.animationDelay = (i * 0.3) + 's';
                document.body.appendChild(heart);
                heart.addEventListener('animationend', () => heart.remove());
            }
        }

        // ---- SPEECH BUBBLE ----
        // Shows a short text bubble above Hubi for ~5 seconds, suppressed
        // during the treat sequence so the messages don't compete.
        showSpeechBubble(text, durationMs = 5500) {
            if (!text) return;
            if (this.state === STATES.TREAT) return;

            const layer = this.speechLayer;
            const bubble = layer && layer.querySelector('.speech-bubble');
            const textEl = bubble && bubble.querySelector('.speech-text');
            if (!layer || !bubble || !textEl) return;

            if (this.speechHideTimer) clearTimeout(this.speechHideTimer);
            if (this.speechRemoveTimer) clearTimeout(this.speechRemoveTimer);

            textEl.textContent = text;
            this.positionSpeechBubble();

            void bubble.offsetWidth;
            bubble.classList.add('visible');
            this.startSpeechFollow();

            this.speechHideTimer = setTimeout(() => {
                bubble.classList.remove('visible');
                this.stopSpeechFollow();
                this.speechRemoveTimer = setTimeout(() => {
                    if (!bubble.classList.contains('visible')) textEl.textContent = '';
                }, 500);
            }, durationMs);
        }

        startSpeechFollow() {
            if (this.speechFollowFrame) return;
            const tick = () => {
                this.speechFollowFrame = null;
                if (!this.speechLayer) return;
                if (!this.speechLayer.querySelector('.speech-bubble.visible')) return;
                this.positionSpeechBubble();
                this.speechFollowFrame = requestAnimationFrame(tick);
            };
            this.speechFollowFrame = requestAnimationFrame(tick);
        }

        stopSpeechFollow() {
            if (this.speechFollowFrame) {
                cancelAnimationFrame(this.speechFollowFrame);
                this.speechFollowFrame = null;
            }
        }

        positionSpeechBubble() {
            if (!this.speechLayer || !this.sprite) return;
            const bubble = this.speechLayer.querySelector('.speech-bubble');
            if (!bubble) return;

            // Anchor the speech layer to the sprite's actual on-screen rect.
            // The sprite's inner .hubi-cat is 80×80 and may overflow the
            // wrapper, so getBoundingClientRect is the source of truth.
            const inner = this.sprite.querySelector('.hubi-cat') || this.sprite;
            const rect = inner.getBoundingClientRect();
            const w = rect.width || 60;
            const h = rect.height || 60;
            this.speechLayer.style.width = w + 'px';
            this.speechLayer.style.height = h + 'px';
            this.speechLayer.style.transform = `translate(${rect.left}px, ${rect.top}px)`;

            // Reset flip state and measure
            bubble.classList.remove('left', 'below');
            const bw = bubble.offsetWidth;
            const bh = bubble.offsetHeight;

            const margin = 8;
            // Default: bubble sits ABOVE the sprite, anchored to its left half.
            // Flip right→left if the bubble would overflow the right viewport edge.
            const defaultRight = rect.left + 30 + bw;
            if (defaultRight > window.innerWidth - margin) {
                bubble.classList.add('left');
            }
            // Flip above→below if there's no room above.
            if (rect.top - bh < margin) {
                bubble.classList.add('below');
            }
        }

        hideSpeechBubble() {
            const bubble = this.speechLayer && this.speechLayer.querySelector('.speech-bubble');
            if (!bubble) return;
            if (this.speechHideTimer) { clearTimeout(this.speechHideTimer); this.speechHideTimer = null; }
            if (this.speechRemoveTimer) { clearTimeout(this.speechRemoveTimer); this.speechRemoveTimer = null; }
            this.stopSpeechFollow();
            bubble.classList.remove('visible');
        }

        cleanupTreat() {
            if (this.treatSafetyTimer) { clearTimeout(this.treatSafetyTimer); this.treatSafetyTimer = null; }
            if (this.treatDelayTimer) { clearTimeout(this.treatDelayTimer); this.treatDelayTimer = null; }
            if (this.treatTray) { this.treatTray.remove(); this.treatTray = null; }
            if (this.treatBox) { this.treatBox.remove(); this.treatBox = null; }
            this.container.classList.remove('treat-run', 'treat-eat', 'treat-happy');
            this.treatPhase = null;
        }
    }

    // Initialize pet after a short delay so the page loads first
    setTimeout(() => {
        window.hubiPet = new HubiPet();
    }, 500);
});
