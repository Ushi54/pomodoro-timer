// --- DOM Elements ---
const viewButtons = document.querySelectorAll('.view-switch__btn');
const views = { plate: document.getElementById('view-plate'), bar: document.getElementById('view-bar'), glass: document.getElementById('view-glass'), sky: document.getElementById('view-sky'), scene: document.getElementById('view-scene') };

const plateWedge = document.getElementById('plate-wedge');
const plateTime = document.getElementById('plate-time');
const platePhase = document.getElementById('plate-phase');

const barSteps = document.getElementById('bar-steps');
const barTime = document.getElementById('bar-time');
const barPhase = document.getElementById('bar-phase');

const glassBody = document.getElementById('glass-body');
const glassSandTop = document.getElementById('glass-sand-top');
const glassSandBottom = document.getElementById('glass-sand-bottom');
const glassStream = document.getElementById('glass-stream');
const glassTime = document.getElementById('glass-time');
const glassPhase = document.getElementById('glass-phase');

const skySun = document.getElementById('sky-sun');
const skyMoon = document.getElementById('sky-moon');
const skyStars = document.getElementById('sky-stars');
const skyTime = document.getElementById('sky-time');
const skyPhase = document.getElementById('sky-phase');
const SKY = { cx: 160, cy: 160, r: 120 };

const sceneCanvas = document.getElementById('scene-canvas');
const sceneCtx = sceneCanvas.getContext('2d');
const sceneTime = document.getElementById('scene-time');
const scenePhase = document.getElementById('scene-phase');
const BOX = { w: 320, h: 220 };
const TONE_SHIFT_MS = 800;           // 休憩に入った時、緑→茶に変わる時間
let toneShiftAt = 0;                 // 休憩に入った時刻
let sceneName = 'plant';             // キャンバスで描いている表示

const liveStatus = document.getElementById('live-status');
const toggleTimerBtn = document.getElementById('toggle-timer-btn');
const resetBtn = document.getElementById('reset-btn');
const skipBtn = document.getElementById('skip-btn');

const workTimeInput = document.getElementById('work-time');
const breakTimeInput = document.getElementById('break-time');

// --- State ---
let isRunning = false;
let isWorkMode = true; // true = 集中, false = 休憩
let logicInterval = null; // モード切り替え・音・文字の更新（裏のタブでも動く）
let frameId = null;       // 扇形・バーの滑らかな描画（画面が見えている間だけ）

let totalMs = 25 * 60 * 1000;
let remainingMs = totalMs;
let endAt = 0;        // 動いている間の終了予定時刻（performance.now 基準）
let lastShownSec = -1;
const BAR_COUNT = 20; // バーは分数に関係なく常に20本
let glassFlipping = false; // 砂時計が回転している間は砂を止めて見せる
let glassFrozenRatio = 0;
const GLASS = { neck: 130, topMax: 80, bottomBase: 220, bottomMax: 72 };

const PLATE = { cx: 100, cy: 100, wedgeR: 84 };
const PHASE_LABEL = { work: '集中タイム', break: 'ひと休み' };

// --- Audio System (Web Audio API) ---
// v1から変更なし：集中中はブラウンノイズ、休憩中は森の環境音。切り替えは2秒でクロスフェード。
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
    const fadeOutTime = 2.0;
    if (audioCtx) {
        const now = audioCtx.currentTime;
        activeAudioNodes.forEach(({ source, gainNode }) => {
            if (gainNode) {
                try {
                    gainNode.gain.cancelScheduledValues(now);
                    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
                    gainNode.gain.linearRampToValueAtTime(0, now + fadeOutTime);
                } catch (e) {}
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
            const white = Math.random() * 2 - 1;
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
    for (let i = 0; i < count; i++) {
        setTimeout(chirp, i * 200 + Math.random() * 50);
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
        const white = Math.random() * 2 - 1;
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

function playModeSound() {
    if (isWorkMode) playNoise('brown');
    else playForestSound();
}

// --- 表示の切り替え ---
// 植物・ろうそく・コーヒー・本・ドラムは、同じキャンバス（view-scene）で描き分ける
function setView(name) {
    const isScene = SCENES.includes(name);
    if (isScene) sceneName = name;
    Object.entries(views).forEach(([key, el]) => el.classList.toggle('is-active', key === (isScene ? 'scene' : name)));
    viewButtons.forEach((btn) => {
        const on = btn.dataset.view === name;
        btn.setAttribute('aria-pressed', String(on));
        // 横スクロールの外に隠れていたら、見える位置まで動かす
        if (on) btn.parentElement.scrollLeft = Math.max(0, btn.offsetLeft - btn.parentElement.clientWidth / 2 + btn.offsetWidth / 2);
    });
    try { localStorage.setItem('pomodoro-view', name); } catch (e) {}
    if (isScene) { sceneCanvas.setAttribute('aria-label', `${viewLabel(name)}のタイマー`); syncScene(); renderShapes(); }
}

function viewLabel(name) {
    const btn = [...viewButtons].find((b) => b.dataset.view === name);
    return btn ? btn.textContent : '';
}

// --- 円：扇形（残り時間）とドット（1分ごと） ---
// TIME TIMERと同じく、12時の位置から反時計回りに残り時間の扇形を描く。
function polar(r, turns) {
    const a = -Math.PI / 2 - turns * 2 * Math.PI; // 12時から反時計回り
    return [PLATE.cx + r * Math.cos(a), PLATE.cy + r * Math.sin(a)];
}

function wedgePath(ratio) {
    const { cx, cy, wedgeR: r } = PLATE;
    if (ratio <= 0) return '';
    if (ratio >= 0.9999) {
        return `M ${cx} ${cy - r} A ${r} ${r} 0 1 0 ${cx} ${cy + r} A ${r} ${r} 0 1 0 ${cx} ${cy - r} Z`;
    }
    const [x, y] = polar(r, ratio);
    const largeArc = ratio > 0.5 ? 1 : 0;
    // 12時 → 反時計回りに ratio 分進んだ点まで（sweep-flag 0 = 反時計回り）
    return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 0 ${x} ${y} Z`;
}

function buildSteps(minutes) {
    // バー：常に20本。1本は「設定時間の1/20」ぶん（例：5分なら15秒、10分なら30秒）
    if (barSteps.children.length !== BAR_COUNT) {
        barSteps.innerHTML = '';
        for (let i = 0; i < BAR_COUNT; i++) {
            const step = document.createElement('span');
            step.className = 'bar__step';
            const fill = document.createElement('span');
            fill.className = 'bar__fill';
            step.appendChild(fill);
            barSteps.appendChild(step);
        }
    }
}

function paintBar(ratio) {
    // 残り本数を小数で出す（例：7.4本 → 7本は満タン、使っている最中の1本が40%）
    const left = ratio * BAR_COUNT;
    const full = Math.floor(left);
    const partial = left - full;
    const steps = barSteps.children;
    for (let i = 0; i < BAR_COUNT; i++) {
        // 右から消えていく：左端（i = 0）が最後まで残る
        let level;
        if (i < full) level = 1;
        else if (i === full) level = partial;
        else level = 0;
        steps[i].classList.toggle('is-spent', level === 0);
        steps[i].firstChild.style.transform = `scaleX(${level})`;
    }
}

function paintGlass(ratio) {
    // 砂の量は面積で考える。上の山は首に近いほど細いので、残りが少なくなると速く下がって見える
    const hTop = GLASS.topMax * Math.sqrt(ratio);
    const hBottom = GLASS.bottomMax * (1 - Math.sqrt(1 - (1 - ratio)));
    glassSandTop.setAttribute('y', (GLASS.neck - hTop).toFixed(2));
    glassSandTop.setAttribute('height', hTop.toFixed(2));
    glassSandBottom.setAttribute('y', (GLASS.bottomBase - hBottom).toFixed(2));
    glassSandBottom.setAttribute('height', hBottom.toFixed(2));
    glassStream.setAttribute('y2', (GLASS.bottomBase - hBottom).toFixed(2));
    glassStream.classList.toggle('is-flowing', ratio > 0 && !glassFlipping);
}

// モードが切り替わる時に砂時計を180度回す。回し終えたら向きを戻し、新しいモードの砂（上が満タン）を描く。
// 砂時計は上下対称なので、戻す瞬間は見た目が変わらない。
function flipGlass(fromRatio) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !views.glass.classList.contains('is-active')) return;
    glassFrozenRatio = fromRatio;
    glassFlipping = true;
    glassBody.classList.add('is-flipping');
    setTimeout(() => {
        glassBody.style.transition = 'none';
        glassBody.classList.remove('is-flipping');
        void glassBody.getBoundingClientRect();
        glassBody.style.transition = '';
        glassFlipping = false;
        renderShapes();
    }, 1000);
}

// 空：地平線（左）から昇り、半円を描いて右の地平線に沈む
function paintSky(ratio) {
    const progress = 1 - ratio;
    const a = Math.PI * progress;
    const x = SKY.cx - SKY.r * Math.cos(a);
    const y = SKY.cy - SKY.r * Math.sin(a);
    const body = isWorkMode ? skySun : skyMoon;
    body.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
}

function buildStars() {
    // 毎回同じ並びになるよう、簡単な疑似乱数で星を置く
    let seed = 7;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 34; i++) {
        const star = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        star.setAttribute('cx', (8 + rand() * 304).toFixed(1));
        star.setAttribute('cy', (10 + rand() * 120).toFixed(1));
        star.setAttribute('r', (0.6 + rand() * 1.2).toFixed(2));
        star.setAttribute('opacity', (0.5 + rand() * 0.5).toFixed(2));
        skyStars.appendChild(star);
    }
}

// --- キャンバスで描く表示（植物・ろうそく・コーヒー・本・ドラム） ---
// どれも 320×220 の箱の中に描く。集中は緑系、休憩は茶系。休憩に入ると0.8秒かけて色が変わる。
const SCENES = ['plant', 'candle', 'coffee', 'book', 'drum'];
const C = {
    white: '#FFFFFF', ink: '#2D241E',
    sage: '#6F9B88', sageSoft: '#A3C2AD', sageMist: '#DCE5D2',
    sandMist: '#EFE2CC', sandSoft: '#E0C6A5', sand: '#C9A47B',
};

function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, k) {
    const x = hexRgb(a), y = hexRgb(b);
    return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(', ')})`;
}

// 0 = 集中の色、1 = 休憩の色
function toneK() {
    return isWorkMode ? 0 : Math.min(1, (performance.now() - toneShiftAt) / TONE_SHIFT_MS);
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function resetScene() {
    leafFallAt = {};
    if (!isWorkMode) toneShiftAt = performance.now();
    syncScene();
}

// 途中から表示を切り替えた時などは、もう落ちているはずの葉を最初から「落ちた後」にしておく
function syncScene() {
    const ratio = Math.min(1, currentRemaining() / totalMs);
    if (isWorkMode) return;
    const remaining = Math.ceil(ratio * LEAF_COUNT);
    LEAF_ORDER.forEach((leaf, rank) => {
        if (rank < LEAF_COUNT - remaining && !(leaf in leafFallAt)) leafFallAt[leaf] = -Infinity;
    });
}

function sizeCanvas() {
    const rect = sceneCanvas.getBoundingClientRect();
    if (!rect.width) return false;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (sceneCanvas.width !== w || sceneCanvas.height !== h) {
        sceneCanvas.width = w;
        sceneCanvas.height = h;
    }
    sceneCtx.setTransform(w / BOX.w, 0, 0, h / BOX.h, 0, 0);
    return true;
}

function drawScene(ratio) {
    if (!views.scene.classList.contains('is-active') || !sizeCanvas()) return;
    const ctx = sceneCtx;
    ctx.clearRect(0, 0, BOX.w, BOX.h);
    const t = performance.now() / 1000;
    if (sceneName === 'plant') drawPlant(ctx, ratio);
    else if (sceneName === 'candle') drawCandle(ctx, ratio, t);
    else if (sceneName === 'coffee') drawCoffee(ctx, ratio, t);
    else if (sceneName === 'book') drawBook(ctx, ratio, t);
    else if (sceneName === 'drum') drawDrum(ctx, ratio, t);
}

// なめらかに揺れる線（湯気・煙）
function wisp(ctx, x0, yBottom, height, phase, t, amp) {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
        const k = i / 24;
        const y = yBottom - k * height;
        const x = x0 + Math.sin(k * 5 + t * 1.6 + phase) * amp * k;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

// --- 植物：集中＝芽が伸びて葉が増え、最後に花が咲く／休憩＝葉が茶色になって1枚ずつ散る ---
const LEAF_COUNT = 8;
const LEAF_ORDER = [7, 2, 5, 0, 6, 3, 1, 4]; // 散る順番
const LEAF_FALL_MS = 2400;
const PLANT = { x: 160, base: 176, maxH: 128 };
let leafFallAt = {};

function stemX(y) {
    // 茎は少しだけ曲げる
    const k = (PLANT.base - y) / PLANT.maxH;
    return PLANT.x + Math.sin(k * Math.PI) * 6;
}

function drawLeaf(ctx, x, y, angle, len, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -len * 0.38, len, 0);
    ctx.quadraticCurveTo(len * 0.5, len * 0.38, 0, 0);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
}

function drawPlant(ctx, ratio) {
    const k = toneK();
    const grow = isWorkMode ? 1 - ratio : 1; // 休憩中は育ちきった姿から
    const stemH = PLANT.maxH * clamp01(grow / 0.88);
    const top = PLANT.base - stemH;

    // 茎
    ctx.strokeStyle = mix(C.sage, C.sand, k);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let y = PLANT.base; y >= top; y -= 2) {
        if (y === PLANT.base) ctx.moveTo(stemX(y), y); else ctx.lineTo(stemX(y), y);
    }
    ctx.stroke();

    // 葉
    const now = performance.now();
    const remaining = Math.ceil(ratio * LEAF_COUNT);
    for (let i = 0; i < LEAF_COUNT; i++) {
        const h = PLANT.maxH * (0.12 + 0.72 * (i / (LEAF_COUNT - 1)));
        const scale = clamp01((stemH - h) / 16);
        if (scale <= 0) continue;
        const side = i % 2 ? 1 : -1;
        const y = PLANT.base - h;
        const x = stemX(y);
        const len = (34 - i * 1.6) * scale;
        const angle = side > 0 ? -0.5 : Math.PI + 0.5;
        const color = i % 2
            ? mix(C.sage, C.sand, k)
            : mix(C.sageSoft, C.sandSoft, k);

        const rank = LEAF_ORDER.indexOf(i);
        const fallen = !isWorkMode && rank < LEAF_COUNT - remaining;
        if (!fallen) { drawLeaf(ctx, x, y, angle, len, color); continue; }

        if (!(i in leafFallAt)) leafFallAt[i] = now;
        const f = (now - leafFallAt[i]) / LEAF_FALL_MS;
        if (f >= 1) continue;
        // ひらひらと地面まで落ちて、最後に薄くなって消える
        const fy = y + (PLANT.base + 20 - y) * Math.min(1, f / 0.8);
        const fx = x + side * 18 * f + Math.sin(f * 9) * 10;
        ctx.globalAlpha = f < 0.8 ? 1 : 1 - (f - 0.8) / 0.2;
        drawLeaf(ctx, fx, fy, angle + Math.sin(f * 7) * 0.8, len, color);
        ctx.globalAlpha = 1;
    }

    // 花（集中の最後に開く。休憩中は咲いたまま茶色になる）
    const bloom = clamp01((grow - 0.88) / 0.12);
    if (bloom > 0) {
        const fx = stemX(top), fy = top - 4;
        ctx.fillStyle = mix(C.sandSoft, C.sandMist, k);
        for (let p = 0; p < 6; p++) {
            const a = (p / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(fx + Math.cos(a) * 9 * bloom, fy + Math.sin(a) * 9 * bloom, 7 * bloom, 4.5 * bloom, a, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = C.sand;
        ctx.beginPath();
        ctx.arc(fx, fy, 5 * bloom, 0, Math.PI * 2);
        ctx.fill();
    }

    // 鉢
    ctx.fillStyle = C.sand;
    ctx.beginPath();
    ctx.moveTo(126, 176); ctx.lineTo(194, 176); ctx.lineTo(184, 212); ctx.lineTo(136, 212);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.sandSoft;
    ctx.beginPath();
    ctx.roundRect(120, 170, 80, 12, 4);
    ctx.fill();
}

// --- ろうそく：集中＝火がゆらぎながら短くなる／休憩＝火が消え、煙が細くなって消える ---
function drawCandle(ctx, ratio, t) {
    const k = toneK();
    const bodyH = isWorkMode ? 16 + 116 * ratio : 16;
    const bottom = 190;
    const top = bottom - bodyH;
    const cx = 160;

    // 火の明かり（集中中だけ）
    if (isWorkMode) {
        const g = ctx.createRadialGradient(cx, top - 18, 2, cx, top - 18, 70);
        g.addColorStop(0, 'rgba(224, 198, 165, 0.55)');
        g.addColorStop(1, 'rgba(224, 198, 165, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, BOX.w, BOX.h);
    }

    // 燭台
    ctx.fillStyle = mix(C.sageSoft, C.sandSoft, k);
    ctx.beginPath();
    ctx.ellipse(cx, bottom + 6, 58, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // ろうそく本体
    ctx.fillStyle = mix(C.sageMist, C.sandMist, k);
    ctx.strokeStyle = mix(C.sageSoft, C.sandSoft, k);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - 22, top, 44, bodyH, [6, 6, 3, 3]);
    ctx.fill();
    ctx.stroke();

    // 芯
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx, top - 7);
    ctx.stroke();

    if (isWorkMode) {
        // 炎：高さと先端が少しずつゆらぐ
        const h = 28 + Math.sin(t * 9) * 2.5 + Math.sin(t * 23) * 1.5;
        const sway = Math.sin(t * 3.1) * 2.5;
        const base = top - 6;
        const flame = (w, hh, color) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(cx + sway, base - hh);
            ctx.bezierCurveTo(cx + w, base - hh * 0.45, cx + w, base, cx, base);
            ctx.bezierCurveTo(cx - w, base, cx - w, base - hh * 0.45, cx + sway, base - hh);
            ctx.fill();
        };
        flame(11, h, C.sand);
        flame(6, h * 0.6, C.sandMist);
    } else {
        // 煙：休憩の残りが少ないほど薄くなる
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.6;
        for (let s = 0; s < 3; s++) {
            ctx.globalAlpha = 0.3 * ratio;
            wisp(ctx, cx + (s - 1) * 3, top - 8, 110 - s * 18, s * 2.1, t, 12 + s * 4);
        }
        ctx.globalAlpha = 1;
    }
}

// --- コーヒー：集中＝ドリッパーから落ちて、カップにたまる／休憩＝湯気を立てながら減る ---
function drawCoffee(ctx, ratio, t) {
    const k = toneK();
    const level = isWorkMode ? 1 - ratio : ratio;
    const cup = { l: 112, r: 208, top: 96, bottom: 188 };

    // 受け皿
    ctx.fillStyle = mix(C.sageMist, C.sandMist, k);
    ctx.beginPath();
    ctx.ellipse(160, 194, 84, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    const cupPath = () => {
        ctx.beginPath();
        ctx.moveTo(cup.l, cup.top);
        ctx.lineTo(cup.r, cup.top);
        ctx.lineTo(cup.r - 6, cup.bottom - 16);
        ctx.quadraticCurveTo(cup.r - 10, cup.bottom, cup.r - 26, cup.bottom);
        ctx.lineTo(cup.l + 26, cup.bottom);
        ctx.quadraticCurveTo(cup.l + 10, cup.bottom, cup.l + 6, cup.bottom - 16);
        ctx.closePath();
    };

    // 取っ手
    ctx.strokeStyle = mix(C.sage, C.sand, k);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cup.r + 4, 136, 18, -Math.PI / 2.4, Math.PI / 2.4);
    ctx.stroke();

    // カップの中身
    ctx.fillStyle = C.white;
    cupPath();
    ctx.fill();
    ctx.save();
    cupPath();
    ctx.clip();
    const surface = cup.bottom - (cup.bottom - cup.top - 8) * level;
    ctx.fillStyle = C.sand;
    ctx.fillRect(cup.l, surface, cup.r - cup.l, cup.bottom - surface);
    if (level > 0.02) {
        ctx.fillStyle = C.sandSoft;
        ctx.beginPath();
        ctx.ellipse(160, surface, 46, 3, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = mix(C.sage, C.sand, k);
    ctx.lineWidth = 3;
    cupPath();
    ctx.stroke();

    if (isWorkMode) {
        // ドリッパーと、落ちるしずく
        ctx.fillStyle = mix(C.sageSoft, C.sandSoft, k);
        ctx.beginPath();
        ctx.moveTo(122, 24); ctx.lineTo(198, 24); ctx.lineTo(170, 64); ctx.lineTo(150, 64);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(116, 64, 88, 6);
        ctx.fillStyle = C.sand;
        for (let d = 0; d < 2; d++) {
            const f = (t * 1.4 + d * 0.5) % 1;
            const y = 72 + (surface - 72) * f;
            ctx.beginPath();
            ctx.ellipse(160, y, 2.4, 3.4, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (level > 0.02) {
        // 湯気（残りが少ないほど弱く）
        ctx.strokeStyle = C.sand;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        for (let s = 0; s < 3; s++) {
            ctx.globalAlpha = 0.5 * Math.min(1, level * 2);
            wisp(ctx, 140 + s * 20, 86, 50 + s * 6, s * 1.7, t, 8);
        }
        ctx.globalAlpha = 1;
    }
}

// --- 本：集中＝ページが1枚ずつめくれて右の束が薄くなる／休憩＝本を閉じて、しおりが揺れる ---
const PAGE_COUNT = 20;
const FLIP_MS = 900;

function drawPageLines(ctx, x, y, w) {
    ctx.strokeStyle = C.sageMist;
    ctx.lineWidth = 2;
    for (let r = 0; r < 8; r++) {
        const ly = y + 18 + r * 13;
        ctx.beginPath();
        ctx.moveTo(x + 12, ly);
        ctx.lineTo(x + w - 12 - (r === 7 ? 30 : 0), ly);
        ctx.stroke();
    }
}

function drawBook(ctx, ratio, t) {
    const k = toneK();
    if (!isWorkMode) {
        // 閉じた本としおり
        const sway = Math.sin(t * 1.3) * 7;
        ctx.strokeStyle = mix(C.sage, C.sand, k);
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(192, 180);
        ctx.quadraticCurveTo(192 + sway * 0.4, 198, 192 + sway, 212);
        ctx.stroke();
        ctx.fillStyle = C.sandMist;
        ctx.beginPath();
        ctx.roundRect(112, 34, 102, 150, 4);
        ctx.fill();
        ctx.fillStyle = mix(C.sage, C.sand, k);
        ctx.beginPath();
        ctx.roundRect(104, 30, 104, 150, 6);
        ctx.fill();
        ctx.fillStyle = mix(C.sageSoft, C.sandSoft, k);
        ctx.fillRect(104, 30, 12, 150);
        ctx.fillRect(130, 70, 56, 4);
        ctx.fillRect(130, 80, 40, 4);
        return;
    }

    const progress = (1 - ratio) * PAGE_COUNT;
    const flipped = Math.floor(progress);
    const sinceFlip = (progress - flipped) * (totalMs / PAGE_COUNT);
    const flipping = flipped > 0 && sinceFlip < FLIP_MS;
    const leftCount = flipping ? flipped - 1 : flipped;
    const rightCount = PAGE_COUNT - flipped;
    const page = { top: 44, h: 140, w: 110, spine: 160 };

    // 表紙
    ctx.fillStyle = mix(C.sage, C.sand, k);
    ctx.beginPath();
    ctx.roundRect(page.spine - page.w - 12, page.top - 6, (page.w + 12) * 2, page.h + 16, 8);
    ctx.fill();

    // ページの束（残りが多いほど厚い）
    const stack = (count, dir) => {
        const layers = Math.ceil(count / 2);
        for (let j = layers; j >= 0; j--) {
            const x = dir < 0 ? page.spine - page.w - j * 0.6 : page.spine + j * 0.6;
            ctx.fillStyle = j === 0 ? C.white : C.sandMist;
            ctx.strokeStyle = C.sandSoft;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.rect(x, page.top + j * 0.6, page.w, page.h);
            ctx.fill();
            ctx.stroke();
        }
    };
    stack(leftCount, -1);
    stack(rightCount, 1);
    if (leftCount > 0) drawPageLines(ctx, page.spine - page.w, page.top, page.w);
    if (rightCount > 0) drawPageLines(ctx, page.spine, page.top, page.w);

    // めくれている1枚（右から左へ）
    if (flipping) {
        const f = sinceFlip / FLIP_MS;
        const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
        const xEnd = page.spine + page.w * Math.cos(Math.PI * e);
        const lift = Math.sin(Math.PI * e) * 10;
        ctx.fillStyle = C.white;
        ctx.strokeStyle = C.sandSoft;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(page.spine, page.top);
        ctx.lineTo(xEnd, page.top - lift);
        ctx.lineTo(xEnd, page.top + page.h - lift);
        ctx.lineTo(page.spine, page.top + page.h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // 綴じ目
    ctx.strokeStyle = C.sandSoft;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(page.spine, page.top);
    ctx.lineTo(page.spine, page.top + page.h);
    ctx.stroke();
}

// --- ドラム：集中＝16分の1ずつ進む1小節のパターン／休憩＝テンポを落とした4分音符 ---
const DRUM_ROWS = [
    { label: 'HH', hits: [0, 2, 4, 6, 8, 10, 12, 14] },
    { label: 'SD', hits: [4, 12] },
    { label: 'BD', hits: [0, 7, 8, 10] },
];

function drawDrum(ctx, ratio, t) {
    const k = toneK();
    const on = mix(C.sage, C.sand, k);
    const soft = mix(C.sageSoft, C.sandSoft, k);
    const mist = mix(C.sageMist, C.sandMist, k);
    const progress = 1 - ratio;

    ctx.font = '700 11px Nunito, sans-serif';
    ctx.textBaseline = 'middle';

    if (!isWorkMode) {
        // 4分音符が4つ。ゆっくり1つずつ進む
        const beat = Math.min(3, Math.floor(progress * 4));
        const pulse = 1 + Math.sin(t * 2.2) * 0.06;
        for (let b = 0; b < 4; b++) {
            const x = 64 + b * 64, y = 118;
            const r = b === beat ? 22 * pulse : 22;
            ctx.fillStyle = b < beat ? on : b === beat ? soft : mist;
            ctx.beginPath();
            ctx.ellipse(x, y, r, r * 0.78, -0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = b <= beat ? on : mist;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(x + r * 0.92, y - 6);
            ctx.lineTo(x + r * 0.92, y - 76);
            ctx.stroke();
        }
        // 進み具合の線
        ctx.fillStyle = mist;
        ctx.fillRect(32, 176, 256, 4);
        ctx.fillStyle = on;
        ctx.fillRect(32, 176, 256 * progress, 4);
        return;
    }

    const x0 = 52, y0 = 54, cols = 16, cw = 15.5, rh = 38;
    const col = Math.min(cols - 1, Math.floor(progress * cols));
    const pulse = Math.sin(t * 8) * 0.5 + 0.5;

    // 拍ごとの帯
    for (let g = 0; g < 4; g++) {
        ctx.fillStyle = g % 2 ? C.white : 'rgba(239, 226, 204, 0.5)';
        ctx.fillRect(x0 + g * 4 * cw - 2, y0 - 8, 4 * cw, rh * 3 + 4);
    }

    DRUM_ROWS.forEach((row, ri) => {
        const y = y0 + ri * rh + rh / 2 - 6;
        ctx.fillStyle = C.ink;
        ctx.globalAlpha = 0.6;
        ctx.fillText(row.label, 20, y);
        ctx.globalAlpha = 1;
        for (let c = 0; c < cols; c++) {
            const x = x0 + c * cw + cw / 2 - 2;
            const hit = row.hits.includes(c);
            if (!hit) {
                ctx.fillStyle = mist;
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
                continue;
            }
            let r = 5.5;
            if (c < col) ctx.fillStyle = on;
            else if (c === col) { ctx.fillStyle = on; r = 5.5 + pulse * 1.8; }
            else ctx.fillStyle = soft;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // 再生位置の線（なめらかに進む）
    const px = x0 + progress * cols * cw - 2;
    ctx.strokeStyle = C.ink;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, y0 - 12);
    ctx.lineTo(px, y0 + rh * 3);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 拍の番号
    ctx.fillStyle = C.ink;
    ctx.globalAlpha = 0.5;
    for (let g = 0; g < 4; g++) ctx.fillText(String(g + 1), x0 + g * 4 * cw + cw / 2 - 5, y0 + rh * 3 + 14);
    ctx.globalAlpha = 1;
}

function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function currentRemaining() {
    return isRunning ? Math.max(0, endAt - performance.now()) : remainingMs;
}

// 絵（扇形・バーなど）：毎フレーム呼んで滑らかに動かす
function renderShapes() {
    const ratio = Math.min(1, currentRemaining() / totalMs);
    plateWedge.setAttribute('d', wedgePath(ratio));
    paintBar(ratio);
    paintGlass(glassFlipping ? glassFrozenRatio : ratio);
    paintSky(ratio);
    drawScene(ratio);
}

// 文字（残り時間・タブのタイトル）：秒が変わった時だけ書き換える
function renderText(force = false) {
    const sec = Math.ceil(currentRemaining() / 1000);
    if (!force && sec === lastShownSec) return;
    lastShownSec = sec;
    const text = formatTime(sec);
    plateTime.textContent = text;
    barTime.textContent = text;
    glassTime.textContent = text;
    skyTime.textContent = text;
    sceneTime.textContent = text;
    const phase = isWorkMode ? PHASE_LABEL.work : PHASE_LABEL.break;
    document.title = isRunning ? `${text} ${phase}｜Visual Pomodoro` : 'Visual Pomodoro';
}

function updateDisplay() {
    renderShapes();
    renderText(true);
}

function frame() {
    renderShapes();
    frameId = isRunning ? requestAnimationFrame(frame) : null;
}

function announce(message) {
    liveStatus.textContent = message;
}

function readMinutes(input, fallback) {
    const v = parseInt(input.value, 10);
    const max = parseInt(input.max, 10);
    if (Number.isNaN(v) || v < 1) { input.value = fallback; return fallback; }
    if (v > max) { input.value = max; return max; }
    return v;
}

function switchMode(isWork) {
    isWorkMode = isWork;
    const mins = isWork ? readMinutes(workTimeInput, 25) : readMinutes(breakTimeInput, 5);
    totalMs = mins * 60 * 1000;
    remainingMs = totalMs;
    if (isRunning) endAt = performance.now() + totalMs;

    document.body.classList.toggle('is-focus', isWork);
    document.body.classList.toggle('is-break', !isWork);

    const phase = isWork ? PHASE_LABEL.work : PHASE_LABEL.break;
    platePhase.textContent = phase;
    barPhase.textContent = phase;
    glassPhase.textContent = phase;
    skyPhase.textContent = phase;
    scenePhase.textContent = phase;
    skipBtn.textContent = isWork ? '休憩に入る' : '集中に戻る';

    buildSteps(mins);
    resetScene();
    updateDisplay();
    if (isRunning) playModeSound();
}

// 裏のタブでも止まらないよう、終了判定と文字の更新は setInterval で行う
function logicTick() {
    if (!isRunning) return;
    if (endAt - performance.now() <= 0) {
        flipGlass(0);
        switchMode(!isWorkMode);
        announce(isWorkMode ? '休憩が終わりました。集中タイムです' : '集中タイムが終わりました。ひと休みしましょう');
    }
    renderText();
}

function setInputsLocked(locked) {
    workTimeInput.disabled = locked;
    breakTimeInput.disabled = locked;
}

function startTimer() {
    initAudio();
    if (isRunning) return;
    isRunning = true;
    endAt = performance.now() + remainingMs;
    document.body.classList.add('is-running');
    logicInterval = setInterval(logicTick, 200);
    frameId = requestAnimationFrame(frame);
    toggleTimerBtn.textContent = '一時停止';
    setInputsLocked(true);
    playModeSound();
    renderText(true);
}

function pauseTimer() {
    if (!isRunning) return;
    remainingMs = Math.max(0, endAt - performance.now());
    isRunning = false;
    document.body.classList.remove('is-running');
    clearInterval(logicInterval);
    if (frameId) cancelAnimationFrame(frameId);
    frameId = null;
    toggleTimerBtn.textContent = '再開';
    stopAudio();
    updateDisplay();
}

function resetTimer() {
    pauseTimer();
    toggleTimerBtn.textContent = 'スタート';
    setInputsLocked(false);
    switchMode(isWorkMode); // 今のモードのまま最初から
}

function skipMode() {
    const ratioBefore = Math.min(1, currentRemaining() / totalMs);
    pauseTimer();
    flipGlass(ratioBefore);
    toggleTimerBtn.textContent = 'スタート';
    setInputsLocked(false);
    switchMode(!isWorkMode);
    announce(isWorkMode ? '集中タイムに切り替えました' : 'ひと休みに切り替えました');
}

function toggleTimer() {
    if (isRunning) pauseTimer();
    else startTimer();
}

// --- Event Listeners ---
viewButtons.forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));
toggleTimerBtn.addEventListener('click', toggleTimer);
resetBtn.addEventListener('click', resetTimer);
skipBtn.addEventListener('click', skipMode);

workTimeInput.addEventListener('change', () => {
    if (!isRunning && isWorkMode) switchMode(true);
});
breakTimeInput.addEventListener('change', () => {
    if (!isRunning && !isWorkMode) switchMode(false);
});

// スペースキーでスタート・一時停止（入力欄やボタンを操作中は除く）
document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA') return;
    e.preventDefault();
    toggleTimer();
});

window.addEventListener('resize', () => renderShapes());

// --- Initialize ---
buildStars();
try {
    const saved = localStorage.getItem('pomodoro-view');
    if (saved && (views[saved] || SCENES.includes(saved))) setView(saved);
} catch (e) {}
switchMode(true);
