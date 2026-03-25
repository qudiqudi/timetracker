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
        TREAT: 'treat'
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
                ${window.getHubiCatHTML('', 'hubi-pet-sprite')}
            `;

            document.body.appendChild(this.container);
            this.sprite = this.container.querySelector('#hubi-pet-sprite');

            // Move glasses inside cat-head so they follow head animations naturally
            const glasses = this.container.querySelector('.prop-glasses');
            const head = this.sprite.querySelector('.cat-head');
            if (glasses && head) head.appendChild(glasses);

            // Meow sounds
            this.meowSounds = [];
            this.loadMeows();

            // Touch / click interaction — on the sprite since container has pointer-events: none
            this.sprite.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                this.onPetted();
            });
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

            // Interrupt current action and react
            this.setState(STATES.PETTED, 1800);

            // ~50% chance to meow
            if (Math.random() < 0.5) {
                this.playMeow();
            }
        }

        isNarrow() {
            return window.innerWidth <= 520;
        }

        startFromMascot() {
            // Find the slot reserved for the mascot in the header
            const slot = document.getElementById('mascot-slot');
            if (!slot) {
                // Fallback: no slot found, start normally
                this.x = window.innerWidth / 2;
                this.y = this.maxY() * 0.7;
                this.updateTransform(0);
                this.setState(STATES.IDLE);
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

            // Sit with active tail, then head to safe area
            if (this.isNarrow()) {
                // On mobile, walk down to the hubi zone instead of jumping
                setTimeout(() => this.walkToZone(), 3000);
            } else {
                setTimeout(() => this.jumpDown(), 3000);
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
            const margin = 20;
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
            const y = zoneTop + Math.random() * Math.max(0, zoneBottom - zoneTop);
            return { x, y };
        }

        findSafeTarget() {
            // On narrow screens, confine to the hubi zone
            if (this.isNarrow()) {
                return this.findMobileTarget();
            }

            const obstacles = this.getObstacles();
            const maxX = window.innerWidth - 80;
            const maxY = this.maxY();
            const catSize = 60;

            // Build list of safe zones (left of content, right of content, below content)
            const app = document.getElementById('app');
            const safeZones = [];

            if (app) {
                const r = app.getBoundingClientRect();
                const margin = 20;

                // Left side of content
                if (r.left - margin > catSize + 10) {
                    safeZones.push({ xMin: 10, xMax: r.left - margin - catSize, yMin: 10, yMax: maxY });
                }
                // Right side of content
                if (maxX - (r.right + margin) > catSize + 10) {
                    safeZones.push({ xMin: r.right + margin, xMax: maxX, yMin: 10, yMax: maxY });
                }
                // Below content (above nav)
                const contentBottom = r.bottom + margin;
                if (maxY - contentBottom > catSize + 10) {
                    safeZones.push({ xMin: 10, xMax: maxX, yMin: contentBottom, yMax: maxY });
                }
            }

            // Pick a random point within a random safe zone
            if (safeZones.length > 0) {
                const zone = safeZones[Math.floor(Math.random() * safeZones.length)];
                const x = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
                const y = zone.yMin + Math.random() * (zone.yMax - zone.yMin);
                return { x, y };
            }

            // Fallback: try random positions avoiding obstacles
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

            // Phase: pouring
            this.treatPhase = 'pouring';
            this.treatBox.classList.add('pouring');

            // Spawn treat particles falling into tray
            const scrollY = this.isNarrow() ? window.scrollY : 0;
            const particleCount = 5 + Math.floor(Math.random() * 4);
            for (let i = 0; i < particleCount; i++) {
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

            // Phase: running to tray
            setTimeout(() => {
                this.treatPhase = 'running';
                this.container.classList.add('treat-run');

                // Excited meow
                this.playMeow();

                const dx = this.treatTarget.x - this.x;
                const dy = this.treatTarget.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                this.direction = dx >= 0 ? 1 : -1;
                const runSpeed = 180;
                const duration = (distance / runSpeed) * 1000;

                this.x = this.treatTarget.x;
                this.y = this.treatTarget.y;
                this.updateTransform(duration);

                // Phase: eating
                setTimeout(() => {
                    this.container.classList.remove('treat-run');
                    this.treatPhase = 'eating';
                    this.container.classList.add('treat-eat');

                    const eatDuration = 4000 + Math.random() * 1000;

                    // Phase: happy
                    setTimeout(() => {
                        this.container.classList.remove('treat-eat');
                        this.treatPhase = 'happy';
                        this.container.classList.add('treat-happy');

                        // Spawn hearts
                        const heartScrollY = this.isNarrow() ? window.scrollY : 0;
                        for (let i = 0; i < 3; i++) {
                            const heart = document.createElement('div');
                            heart.className = 'treat-heart';
                            heart.textContent = '\u2764';
                            heart.style.left = (this.x + 10 + i * 15) + 'px';
                            heart.style.top = (this.y - 10 + heartScrollY) + 'px';
                            if (this.isNarrow()) {
                                heart.style.position = 'absolute';
                            }
                            heart.style.animationDelay = (i * 0.3) + 's';
                            document.body.appendChild(heart);
                            heart.addEventListener('animationend', () => heart.remove());
                        }

                        // Phase: sleep
                        setTimeout(() => {
                            this.container.classList.remove('treat-happy');
                            this.cleanupTreat();

                            // Transition to sleeping
                            this.container.classList.remove(STATES.TREAT);
                            this.state = STATES.SLEEPING;
                            this.container.classList.add(STATES.SLEEPING);

                            setTimeout(() => {
                                if (this.state === STATES.SLEEPING) {
                                    this.transitionToIdle();
                                }
                            }, 8000 + Math.random() * 2000);
                        }, 2000);
                    }, eatDuration);
                }, duration);
            }, 1200);
        }

        cleanupTreat() {
            if (this.treatSafetyTimer) { clearTimeout(this.treatSafetyTimer); this.treatSafetyTimer = null; }
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
