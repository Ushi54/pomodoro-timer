// --- DOM Elements ---
const uiClock = document.getElementById('ui-clock');
const uiMeter = document.getElementById('ui-meter');
const toggleUiBtn = document.getElementById('toggle-ui-btn');

const clockBase = document.getElementById('clock-base');
const clockProgress = document.getElementById('clock-progress');
const clockMarks = document.getElementById('clock-marks');
const clockTimeDisplay = document.getElementById('clock-time-display');

const meterFill = document.getElementById('meter-fill');
const meterGrid = document.getElementById('meter-grid');
const meterTimeDisplay = document.getElementById('meter-time-display');

const currentStatusEl = document.getElementById('current-status');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');
const skipBtn = document.getElementById('skip-btn');

const workTimeInput = document.getElementById('work-time');
const breakTimeInput = document.getElementById('break-time');
const bgmSelect = document.getElementById('bgm-select');

// --- State ---
let isClockUi = true;
let isRunning = false;
let isWorkMode = true; // true = Focus, false = Break
let timerInterval = null;

let totalSeconds = 25 * 60;
let remainingSeconds = 25 * 60;

// SVG Constants
const CIRCLE_RADIUS = 45;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

// --- Audio System (Web Audio API) ---
let audioCtx = null;
let activeAudioNodes = [];
let birdInterval = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function stopAudio() {
    const fadeOutTime = 2.0; // 2 seconds fade out
    if (audioCtx) {
        const now = audioCtx.currentTime;
        activeAudioNodes.forEach(({ source, gainNode }) => {
            if (gainNode) {
                try {
                    gainNode.gain.cancelScheduledValues(now);
                    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
                    gainNode.gain.linearRampToValueAtTime(0, now + fadeOutTime);
                } catch(e) {}
            }
            if (source) {
                setTimeout(() => {
                    try { source.stop(); source.disconnect(); } catch (e) {}
                }, fadeOutTime * 1000);
            }
        });
        activeAudioNodes = [];
    }
    if (birdInterval) {
        clearInterval(birdInterval);
        birdInterval = null;
    }
}

function fadeNodeIn(gainNode, targetGain) {
    if (!audioCtx) return;
    const fadeInTime = 2.0;
    const now = audioCtx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(targetGain, now + fadeInTime);
}

function playNoise(type) {
    stopAudio();
    if (type === 'none') return;
    if (!audioCtx) return;

    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'white') {
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    } else if (type === 'brown') {
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            let white = Math.random() * 2 - 1;
            data[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5; 
        }
    }

    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = type === 'brown' ? 400 : 1000;

    const gainNode = audioCtx.createGain();

    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    noiseSource.start();
    
    fadeNodeIn(gainNode, 0.1);
    activeAudioNodes.push({ source: noiseSource, gainNode: gainNode });
}

function chirp() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    
    const now = audioCtx.currentTime;
    osc.frequency.setValueAtTime(2500 + Math.random() * 1000, now);
    osc.frequency.exponentialRampToValueAtTime(3500 + Math.random() * 1500, now + 0.1);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.03, now + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + 0.15);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(now);
    osc.stop(now + 0.2);
}

function playBird() {
    const count = Math.floor(Math.random() * 3) + 1;
    for(let i=0; i<count; i++) {
        setTimeout(chirp, i * 200 + Math.random()*50);
    }
}

function playForestSound() {
    stopAudio();
    if (!audioCtx) return;
    
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
        let white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        data[i] *= 0.11;
        b6 = white * 0.115926;
    }

    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;

    const gainNode = audioCtx.createGain();
    
    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    noiseSource.start();
    
    fadeNodeIn(gainNode, 0.08);
    activeAudioNodes.push({ source: noiseSource, gainNode: gainNode });
    
    birdInterval = setInterval(() => {
        if (Math.random() > 0.4) {
            playBird();
        }
    }, 4000);
}

function toggleUI() {
    isClockUi = !isClockUi;
    if (isClockUi) {
        uiClock.classList.add('active');
        uiMeter.classList.remove('active');
    } else {
        uiMeter.classList.add('active');
        uiClock.classList.remove('active');
    }
}

function updateClockMarks(minutes) {
    clockMarks.innerHTML = '';
    // TIME TIMER風: 0が12時位置。反時計回りに数字が増える。
    // 例: 25分なら、5分刻みで 0, 5, 10, 15, 20, 25 を配置
    let step = 5;
    if (minutes <= 5) step = 1;
    if (minutes > 60) step = 10;

    for (let i = 0; i <= minutes; i += step) {
        if (i === 0) continue; // 0は省略するか、一番上に書く
        // 角度 (12時から反時計回り)
        let angle = -(i / minutes) * 360;
        let rad = (angle - 90) * (Math.PI / 180);
        
        // svg座標系 (cx=50, cy=50)
        let r1 = 43; // 目盛りの内側
        let r2 = 47; // 目盛りの外側
        let rText = 36; // テキスト位置

        // 目盛り線
        let x1 = 50 + r1 * Math.cos(rad);
        let y1 = 50 + r1 * Math.sin(rad);
        let x2 = 50 + r2 * Math.cos(rad);
        let y2 = 50 + r2 * Math.sin(rad);

        // テキスト位置（数字をSVGの回転に合わせて戻すため、別途計算）
        let xt = 50 + rText * Math.cos(rad);
        let yt = 50 + rText * Math.sin(rad);

        // 時計SVG全体が-90度回転しているので、中の要素の座標はそのまま0度=3時方向として計算し、
        // 実際には全体が回転して12時になる。
        // 上のrad計算では `-90` をしているが、SVG自体が `-90` 回転しているため、相殺されてしまう。
        // 正しく配置するには：
        // SVGは -90度回転(12時が0度になる)
        // したがって、角度 a は 0 から反時計回り(マイナス方向)に計算。
        let a = -(i / minutes) * 360;
        let r = a * (Math.PI / 180);
        
        let cx1 = 50 + r1 * Math.cos(r);
        let cy1 = 50 + r1 * Math.sin(r);
        let cx2 = 50 + r2 * Math.cos(r);
        let cy2 = 50 + r2 * Math.sin(r);
        let cxt = 50 + rText * Math.cos(r);
        let cyt = 50 + rText * Math.sin(r);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', cx1);
        line.setAttribute('y1', cy1);
        line.setAttribute('x2', cx2);
        line.setAttribute('y2', cy2);
        line.classList.add('mark-line');
        
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', cxt);
        text.setAttribute('y', cyt);
        text.textContent = i;
        text.classList.add('mark-text');
        // 全体の-90度回転をテキストだけ打ち消して正立させる
        text.setAttribute('transform', `rotate(90, ${cxt}, ${cyt})`);

        clockMarks.appendChild(line);
        clockMarks.appendChild(text);
    }
}

function updateMeterGrid(minutes) {
    // 10等分などのグリッドをCSSで調整
    let step = 10;
    if (minutes <= 10) step = 20;
    meterGrid.style.backgroundSize = `${step}% 100%`;
}

function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateDisplay(instant = false) {
    // Text display
    clockTimeDisplay.textContent = formatTime(remainingSeconds);
    meterTimeDisplay.textContent = Math.ceil(remainingSeconds / 60);

    // Progress calculations
    const progressRatio = remainingSeconds / totalSeconds;

    // Clock Progress
    // プラス方向（CIRCLE_CIRCUMFERENCE）にオフセットを増やすことで、パスの始点（12時位置）から時計回りに消えていく（白い部分が増えていく）動きになります。
    const offset = progressRatio * CIRCLE_CIRCUMFERENCE;

    if (instant) {
        clockProgress.style.transition = 'none';
        meterFill.style.transition = 'none';
    } else {
        clockProgress.style.transition = 'stroke-dashoffset 1s linear, stroke 0.3s ease';
        meterFill.style.transition = 'width 1s linear, background 0.3s ease';
    }

    clockProgress.style.strokeDashoffset = offset;
    meterFill.style.width = `${progressRatio * 100}%`;

    if (instant) {
        // 強制リフロー (SVGとDOM両方に確実に効かせるため getBoundingClientRect を使用)
        void clockProgress.getBoundingClientRect();
        void meterFill.getBoundingClientRect();
        
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                clockProgress.style.transition = 'stroke-dashoffset 1s linear, stroke 0.3s ease';
                meterFill.style.transition = 'width 1s linear, background 0.3s ease';
            });
        });
    }
}

function switchMode(isWork) {
    isWorkMode = isWork;
    const mins = isWork ? parseInt(workTimeInput.value) : parseInt(breakTimeInput.value);
    totalSeconds = mins * 60;
    remainingSeconds = totalSeconds;

    currentStatusEl.textContent = isWork ? '作業中 (Focus)' : '休憩中 (Break)';
    
    // Theme colors
    if (isWork) {
        currentStatusEl.classList.remove('break-mode');
        clockBase.classList.remove('break-mode');
        meterFill.classList.remove('break-mode');
        startBtn.classList.remove('break-mode');
        skipBtn.classList.remove('break-mode');
        skipBtn.textContent = 'すぐ休憩に入る';
        if (isRunning) playNoise(bgmSelect.value);
    } else {
        currentStatusEl.classList.add('break-mode');
        clockBase.classList.add('break-mode');
        meterFill.classList.add('break-mode');
        startBtn.classList.add('break-mode');
        skipBtn.classList.add('break-mode');
        skipBtn.textContent = 'すぐ作業を始める';
        if (isRunning) playForestSound(); // 休憩用サウンド
    }

    updateClockMarks(mins);
    updateMeterGrid(mins);
    // リセットや切り替え時はアニメーションなしで即座に満タン表示にする
    updateDisplay(true);
}

function tick() {
    remainingSeconds--;
    if (remainingSeconds < 0) {
        // Switch mode
        switchMode(!isWorkMode);
    } else {
        updateDisplay(false);
    }
}

function startTimer() {
    initAudio();
    if (!isRunning) {
        isRunning = true;
        timerInterval = setInterval(tick, 1000);
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        workTimeInput.disabled = true;
        breakTimeInput.disabled = true;

        if (isWorkMode) {
            playNoise(bgmSelect.value);
        } else {
            playForestSound();
        }
    }
}

function pauseTimer() {
    if (isRunning) {
        isRunning = false;
        clearInterval(timerInterval);
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        stopAudio();
    }
}

function resetTimer() {
    pauseTimer();
    workTimeInput.disabled = false;
    breakTimeInput.disabled = false;
    switchMode(isWorkMode); // 現在のモードのままリセット
}

function skipMode() {
    pauseTimer();
    workTimeInput.disabled = false;
    breakTimeInput.disabled = false;
    switchMode(!isWorkMode); // 逆のモードに切り替える
}

// --- Event Listeners ---
toggleUiBtn.addEventListener('click', toggleUI);
startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
resetBtn.addEventListener('click', resetTimer);
skipBtn.addEventListener('click', skipMode);

workTimeInput.addEventListener('change', () => {
    if (!isRunning && isWorkMode) switchMode(true);
});
breakTimeInput.addEventListener('change', () => {
    if (!isRunning && !isWorkMode) switchMode(false);
});
bgmSelect.addEventListener('change', () => {
    if (isRunning && isWorkMode) playNoise(bgmSelect.value);
});

// Initialize
switchMode(true);
