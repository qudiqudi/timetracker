/* ============================================
   DEV MENU — localhost only, excluded from deploy
   ============================================ */

(function() {
    const panel = document.createElement('div');
    panel.id = 'dev-menu';
    panel.innerHTML = `
        <div id="dev-menu-header">Dev Menu <span id="dev-menu-toggle">_</span></div>
        <div id="dev-menu-body">
            <div class="dev-section">Animations</div>
            <div class="dev-btn-grid"></div>
            <div class="dev-section">Treat</div>
            <div class="dev-treat-btns"></div>
            <div class="dev-section">Speech</div>
            <div class="dev-speech-btns"></div>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        #dev-menu {
            position: fixed;
            bottom: 90px;
            right: 10px;
            width: 220px;
            background: rgba(30, 30, 30, 0.92);
            border-radius: 8px;
            color: #eee;
            font-family: monospace;
            font-size: 11px;
            z-index: 99999;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            overflow: hidden;
            user-select: none;
        }
        #dev-menu-header {
            padding: 6px 10px;
            background: rgba(255, 140, 66, 0.8);
            font-weight: bold;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        #dev-menu-toggle {
            cursor: pointer;
            padding: 0 4px;
            font-size: 14px;
        }
        #dev-menu-body {
            padding: 8px;
        }
        #dev-menu-body.collapsed {
            display: none;
        }
        .dev-section {
            color: #aaa;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 6px 0 4px;
        }
        .dev-section:first-child {
            margin-top: 0;
        }
        .dev-btn-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
        }
        .dev-treat-btns {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .dev-btn {
            padding: 5px 6px;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 4px;
            color: #ddd;
            font-family: monospace;
            font-size: 10px;
            cursor: pointer;
            text-align: center;
            transition: background 0.15s;
        }
        .dev-btn:hover {
            background: rgba(255, 140, 66, 0.3);
        }
        .dev-btn:active {
            background: rgba(255, 140, 66, 0.5);
        }
    `;

    document.head.appendChild(style);
    document.body.appendChild(panel);

    // Toggle collapse
    document.getElementById('dev-menu-toggle').addEventListener('click', () => {
        document.getElementById('dev-menu-body').classList.toggle('collapsed');
    });

    // Make header draggable
    const header = document.getElementById('dev-menu-header');
    let dragging = false, dragX, dragY;
    header.addEventListener('pointerdown', (e) => {
        if (e.target.id === 'dev-menu-toggle') return;
        dragging = true;
        dragX = e.clientX - panel.offsetLeft;
        dragY = e.clientY - panel.offsetTop;
        header.setPointerCapture(e.pointerId);
    });
    header.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        panel.style.left = (e.clientX - dragX) + 'px';
        panel.style.top = (e.clientY - dragY) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    });
    header.addEventListener('pointerup', () => { dragging = false; });

    // Wait for hubiPet to be initialized
    function waitForPet(cb) {
        if (window.hubiPet) { cb(); return; }
        const check = setInterval(() => {
            if (window.hubiPet) { clearInterval(check); cb(); }
        }, 200);
    }

    waitForPet(() => {
        const states = [
            'sitting', 'idle', 'walking', 'sleeping', 'eating',
            'chasing', 'petted', 'grooming', 'stretching',
            'hunting', 'butterfly', 'box', 'productive'
        ];

        const grid = panel.querySelector('.dev-btn-grid');
        states.forEach(state => {
            const btn = document.createElement('button');
            btn.className = 'dev-btn';
            btn.textContent = state;
            btn.addEventListener('click', () => {
                if (state === 'walking') {
                    window.hubiPet.walkToRandom();
                } else if (state === 'chasing') {
                    window.hubiPet.chaseToy();
                } else {
                    window.hubiPet.setState(state, 5000);
                }
            });
            grid.appendChild(btn);
        });

        const treatBtns = panel.querySelector('.dev-treat-btns');

        const triggerBtn = document.createElement('button');
        triggerBtn.className = 'dev-btn';
        triggerBtn.textContent = 'Give Treat';
        triggerBtn.addEventListener('click', () => {
            window.hubiPet.triggerTreat();
        });
        treatBtns.appendChild(triggerBtn);

        const resetBtn = document.createElement('button');
        resetBtn.className = 'dev-btn';
        resetBtn.textContent = 'Reset Treat (clear daily flag)';
        resetBtn.addEventListener('click', () => {
            localStorage.removeItem('hubi_treat_date');
        });
        treatBtns.appendChild(resetBtn);

        // ---- Speech bubble dev controls ----
        // Each "Say" button clears all cooldowns first so you can spam-test
        // without the message system filtering you out after the first click.
        const speechBtns = document.querySelector('.dev-speech-btns');
        const triggers = ['start', 'resume', 'visibility', 'navigate', 'tick', 'finish'];
        triggers.forEach(trig => {
            const b = document.createElement('button');
            b.className = 'dev-btn';
            b.textContent = `Say (${trig})`;
            b.addEventListener('click', () => {
                if (typeof HubiMessages === 'undefined') return;
                localStorage.removeItem('hubi_msg_history');
                localStorage.removeItem('hubi_msg_last_shown');
                localStorage.removeItem('hubi_msg_session_shown');
                const picked = HubiMessages.trigger(trig, { force: true });
                if (!picked) {
                    window.hubiPet.showSpeechBubble('(no eligible message)', 2500);
                }
            });
            speechBtns.appendChild(b);
        });

        const clearBtn = document.createElement('button');
        clearBtn.className = 'dev-btn';
        clearBtn.textContent = 'Reset speech cooldowns';
        clearBtn.addEventListener('click', () => {
            localStorage.removeItem('hubi_msg_history');
            localStorage.removeItem('hubi_msg_last_shown');
            localStorage.removeItem('hubi_msg_session_shown');
        });
        speechBtns.appendChild(clearBtn);
    });
})();
