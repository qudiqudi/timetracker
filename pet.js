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
        PETTED: 'petted'
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
                ${window.getHubiCatHTML('', 'hubi-pet-sprite')}
            `;

            document.body.appendChild(this.container);
            this.sprite = this.container.querySelector('#hubi-pet-sprite');

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
            clone.play().catch(() => {});
        }

        onPetted() {
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
            // On narrow screens, start directly in the hubi zone
            if (this.isNarrow()) {
                const target = this.findSafeTarget();
                this.x = target.x;
                this.y = target.y;
                this.updateTransform(0);
                this.setState(STATES.SITTING);
                setTimeout(() => this.decideNextAction(), 2000);
                return;
            }

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
            const rect = slot.getBoundingClientRect();
            this.x = rect.left + rect.width / 2 - 30;
            this.y = rect.top;

            this.container.classList.add(STATES.SITTING);
            this.container.style.transition = 'none';
            this.container.style.transform = `translate(${this.x}px, ${this.y}px)`;

            // Sit with active tail, then jump down
            setTimeout(() => this.jumpDown(), 3000);
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
            const rand = Math.random();

            // Chances:
            // 45% Walk
            // 20% Eat
            // 20% Sleep
            // 15% Chase
            if (rand < 0.45) {
                this.walkToRandom();
            } else if (rand < 0.65) {
                this.setState(STATES.EATING, 4000 + Math.random() * 3000);
            } else if (rand < 0.85) {
                this.setState(STATES.SLEEPING, 6000 + Math.random() * 5000);
            } else {
                this.chaseToy();
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
    }

    // Initialize pet after a short delay so the page loads first
    setTimeout(() => {
        window.hubiPet = new HubiPet();
    }, 500);
});
