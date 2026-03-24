/* ============================================
   HUBI VIRTUAL PET — Logic for the roaming cat
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    const STATES = {
        IDLE: 'idle',
        WALKING: 'walking',
        SLEEPING: 'sleeping',
        EATING: 'eating',
        CHASING: 'chasing'
    };

    class HubiPet {
        constructor() {
            // Initial position (center-ish)
            this.x = window.innerWidth / 2;
            this.y = window.innerHeight / 2;
            this.direction = 1; // 1 for right (scaleX(-1)), -1 for left (scaleX(1))
            this.state = STATES.IDLE;
            this.speed = 100; // pixels per second
            
            this.initDOM();
            this.updateTransform(0);
            
            // Start the pet loop after a short delay
            setTimeout(() => this.decideNextAction(), 2000);
        }

        initDOM() {
            this.container = document.createElement('div');
            this.container.id = 'hubi-pet';
            
            this.container.innerHTML = `
                <span class="pet-prop prop-zzz" aria-hidden="true">💤</span>
                <span class="pet-prop prop-fish" aria-hidden="true">🐟</span>
                <span class="pet-prop prop-toy" aria-hidden="true">🧶</span>
                ${window.getHubiCatHTML('', 'hubi-pet-sprite')}
            `;
            
            document.body.appendChild(this.container);
            this.sprite = this.container.querySelector('#hubi-pet-sprite');
        }

        setState(newState, durationMs) {
            this.container.classList.remove(this.state);
            this.state = newState;
            this.container.classList.add(this.state);

            if (durationMs) {
                setTimeout(() => {
                    if (this.state === newState) {
                        this.decideNextAction();
                    }
                }, durationMs);
            }
        }

        updateTransform(transitionTimeMs = 0) {
            // Keep in bounds
            const boundsX = window.innerWidth - 80;
            const boundsY = window.innerHeight - 80;
            
            this.x = Math.max(10, Math.min(this.x, boundsX));
            this.y = Math.max(10, Math.min(this.y, boundsY));

            this.container.style.transitionDuration = `${transitionTimeMs}ms`;
            
            // ScaleX(-1) if direction is positive (moving right), because image defaults facing left slightly.
            const flip = this.direction > 0 ? -1 : 1;
            
            this.container.style.transform = `translate(${this.x}px, ${this.y}px) scaleX(${flip})`;
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
            
            let targetX = Math.random() * (window.innerWidth - 100) + 10;
            let targetY = Math.random() * (window.innerHeight - 100) + 10;

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
                    this.setState(STATES.IDLE, 500 + Math.random() * 1000);
                }
            }, duration);
        }

        chaseToy() {
            this.setState(STATES.CHASING);
            this.speed = 200; // Run much faster
            
            // Pick a point across the screen
            let targetX = Math.random() * (window.innerWidth - 100) + 10;
            let targetY = Math.random() * (window.innerHeight - 100) + 10;

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
                this.setState(STATES.IDLE, 1000 + Math.random() * 2000); // Wait/catch breath
            }, duration);
        }
    }

    // Initialize pet after a short delay so the page loads first
    setTimeout(() => {
        window.hubiPet = new HubiPet();
    }, 500);
});
