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
// 植物・ろうそく・コーヒー・本は、同じキャンバス（view-scene）で描き分ける
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
    if (isScene) { sceneCanvas.setAttribute('aria-label', `${viewLabel(name)}のタイマー`); renderShapes(); }
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

// --- キャンバスで描く表示（植物・ろうそく・コーヒー・本） ---
// どれも 320×220 の箱の中に描く。集中は緑系、休憩は茶系。休憩に入ると0.8秒かけて色が変わる。
const SCENES = ['plant', 'candle', 'coffee', 'book'];
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
    if (!isWorkMode) toneShiftAt = performance.now();
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
    if (sceneName === 'plant') drawPlant(ctx, ratio, t);
    else if (sceneName === 'candle') drawCandle(ctx, ratio, t);
    else if (sceneName === 'coffee') drawCoffee(ctx, ratio, t);
    else if (sceneName === 'book') drawBook(ctx, ratio, t);
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

// --- 植物：集中＝芽が伸びて葉が増え、最後に花が咲く／休憩＝花屋さんが花束にして、お客さんに手渡す ---
const LEAF_COUNT = 8;
const PLANT = { x: 160, base: 176, maxH: 128 };
// 休憩の流れ（休憩の進み具合 0〜1 で区切る）
const SHOP = {
    walkIn: [0, 0.15],   // 花屋さんが左から鉢植えの横まで歩いてくる
    cut: [0.15, 0.3],    // ハサミで茎を切る
    wrap: [0.3, 0.5],    // 包み紙で包んで、リボンを結ぶ
    deliver: [0.5, 0.95], // お客さんのところまで歩く
    // 残り（0.95〜1）で手渡し
    enterX: 20, standX: 92, handOff: 190, customer: 282, hold: 38, holdY: 150,
};

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

function drawFlower(ctx, x, y, size, petal) {
    ctx.fillStyle = petal;
    for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * 9 * size, y + Math.sin(a) * 9 * size, 7 * size, 4.5 * size, a, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = C.sand;
    ctx.beginPath();
    ctx.arc(x, y, 5 * size, 0, Math.PI * 2);
    ctx.fill();
}

// 鉢植え。grow = 0〜1 の育ち具合。休憩中は植物と鉢を別々に描く
function drawPottedPlant(ctx, grow, parts = { plant: true, pot: true }) {
    if (parts.plant) drawPlantBody(ctx, grow);
    if (parts.pot) drawPot(ctx);
}

function drawPlantBody(ctx, grow) {
    const stemH = PLANT.maxH * clamp01(grow / 0.88);
    const top = PLANT.base - stemH;

    ctx.strokeStyle = C.sage;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let y = PLANT.base; y >= top; y -= 2) {
        if (y === PLANT.base) ctx.moveTo(stemX(y), y); else ctx.lineTo(stemX(y), y);
    }
    ctx.stroke();

    for (let i = 0; i < LEAF_COUNT; i++) {
        const h = PLANT.maxH * (0.12 + 0.72 * (i / (LEAF_COUNT - 1)));
        const scale = clamp01((stemH - h) / 16);
        if (scale <= 0) continue;
        const side = i % 2 ? 1 : -1;
        const y = PLANT.base - h;
        drawLeaf(ctx, stemX(y), y, side > 0 ? -0.5 : Math.PI + 0.5, (34 - i * 1.6) * scale, i % 2 ? C.sage : C.sageSoft);
    }

    const bloom = clamp01((grow - 0.88) / 0.12);
    if (bloom > 0) drawFlower(ctx, stemX(top), top - 4, bloom, C.sandSoft);
}

function drawPot(ctx) {
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

// 花束：(x, y) が包み紙の先。wrap = 包み紙の出来具合、ribbon = リボンの出来具合（0〜1）
function drawBouquet(ctx, x, y, wrap = 1, ribbon = 1) {
    drawLeaf(ctx, x - 2, y - 34, Math.PI + 0.9, 26, C.sage);
    drawLeaf(ctx, x + 2, y - 34, -0.9, 26, C.sageSoft);
    drawLeaf(ctx, x, y - 40, -Math.PI / 2 - 0.25, 22, C.sage);
    drawFlower(ctx, x - 13, y - 50, 0.8, C.sandSoft);
    drawFlower(ctx, x + 13, y - 52, 0.8, C.sandMist);
    drawFlower(ctx, x, y - 64, 0.9, C.sandSoft);
    // 茎の束
    ctx.strokeStyle = C.sage;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const dx of [-6, 0, 6]) { ctx.moveTo(x + dx, y - 42); ctx.lineTo(x + dx * 0.3, y); }
    ctx.stroke();
    // 包み紙：下から巻き上がるように現れる
    if (wrap > 0) {
        const top = y - 42 * wrap;
        const half = 22 * wrap;
        ctx.fillStyle = C.sand;
        ctx.beginPath();
        ctx.moveTo(x - half, top); ctx.lineTo(x + half, top); ctx.lineTo(x, y);
        ctx.closePath();
        ctx.fill();
    }
    // リボン
    if (ribbon > 0) {
        ctx.fillStyle = C.sage;
        ctx.beginPath();
        ctx.ellipse(x - 6 * ribbon, y - 20, 6 * ribbon, 3.5 * ribbon, 0.4, 0, Math.PI * 2);
        ctx.ellipse(x + 6 * ribbon, y - 20, 6 * ribbon, 3.5 * ribbon, -0.4, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 人。dir = 向き（1 = 右向き、-1 = 左向き）。hand = 手の先の位置（なければ腕を下ろす）
function drawPerson(ctx, p) {
    const { x, dir, body, t, hand, apron, walking } = p;
    const bob = walking ? Math.abs(Math.sin(t * 6)) * 3 : 0;
    const y0 = -bob;
    // 足（歩いている時は交互に動く）
    ctx.fillStyle = C.ink;
    ctx.globalAlpha *= 0.8;
    const step = walking ? Math.sin(t * 6) * 5 : 0;
    ctx.beginPath();
    ctx.ellipse(x - 8 + step, 199, 6, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 8 - step, 199, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha /= 0.8;
    // 体
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(x - 20, 114 + y0, 40, 82, [20, 20, 6, 6]);
    ctx.fill();
    // エプロン（花屋さん）
    if (apron) {
        ctx.fillStyle = C.sandMist;
        ctx.beginPath();
        ctx.roundRect(x - 13, 130 + y0, 26, 58, [4, 4, 8, 8]);
        ctx.fill();
        ctx.fillStyle = C.sandSoft;
        ctx.fillRect(x - 6, 150 + y0, 12, 9);
    }
    // 腕
    ctx.strokeStyle = body;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + dir * 12, 128 + y0);
    if (hand) ctx.lineTo(hand[0], hand[1]);
    else ctx.lineTo(x + dir * 20, 160 + y0);
    ctx.stroke();
    // 顔
    ctx.fillStyle = C.sandMist;
    ctx.beginPath();
    ctx.arc(x, 94 + y0, 17, 0, Math.PI * 2);
    ctx.fill();
    // 花屋さんは三角巾
    if (apron) {
        ctx.fillStyle = C.sage;
        ctx.beginPath();
        ctx.arc(x, 92 + y0, 17.5, Math.PI * 1.05, Math.PI * 1.95);
        ctx.closePath();
        ctx.fill();
    }
    ctx.fillStyle = C.ink;
    const blink = Math.sin(t * 1.3 + x) > 0.97 ? 0.3 : 1;
    const ex = x + dir * 2;
    ctx.beginPath();
    ctx.ellipse(ex - 6, 95 + y0, 1.8, 1.8 * blink, 0, 0, Math.PI * 2);
    ctx.ellipse(ex + 6, 95 + y0, 1.8, 1.8 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(ex, 100 + y0, 5, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
}

// ハサミ（open = 0〜1 の開き具合）
function drawScissors(ctx, x, y, open) {
    const a = 0.15 + open * 0.35;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const s of [-1, 1]) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(s * a) * 16, y + Math.sin(s * a) * 16);
    }
    ctx.stroke();
    ctx.strokeStyle = C.sand;
    ctx.lineWidth = 2;
    for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(x - Math.cos(s * a) * 8, y - Math.sin(s * a) * 8, 4, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawHeart(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.9);
    ctx.bezierCurveTo(x - size * 1.4, y, x - size * 0.6, y - size, x, y - size * 0.3);
    ctx.bezierCurveTo(x + size * 0.6, y - size, x + size * 1.4, y, x, y + size * 0.9);
    ctx.fill();
}

function span(q, [a, b]) { return clamp01((q - a) / (b - a)); }

function drawPlant(ctx, ratio, t) {
    if (isWorkMode) { drawPottedPlant(ctx, 1 - ratio); return; }

    const q = 1 - ratio;
    const walkIn = span(q, SHOP.walkIn);
    const cut = span(q, SHOP.cut);
    const wrap = span(q, SHOP.wrap);
    const deliver = span(q, SHOP.deliver);
    const handed = clamp01((q - SHOP.deliver[1]) / (1 - SHOP.deliver[1]));

    // 花屋さんの位置：左から歩いてきて、鉢植えの横で作業し、お客さんのところへ歩く
    const floristX = q < SHOP.cut[0]
        ? SHOP.enterX + (SHOP.standX - SHOP.enterX) * walkIn
        : SHOP.standX + (SHOP.handOff - SHOP.standX) * deliver;
    const walking = isRunning && ((walkIn > 0 && walkIn < 1) || (deliver > 0 && deliver < 1));

    // 足元の点線（花屋さんがこれから歩く道のり）
    ctx.fillStyle = C.sandSoft;
    for (let x = SHOP.enterX; x <= SHOP.handOff; x += 8) {
        ctx.globalAlpha = x < floristX ? 0.25 : 0.9;
        ctx.beginPath();
        ctx.arc(x, 210, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 鉢（花束を持って歩き出すと片づけられて消える）
    const potFade = clamp01(deliver / 0.15);
    if (potFade < 1) {
        ctx.globalAlpha = 1 - potFade;
        drawPot(ctx);
        ctx.globalAlpha = 1;
    }
    // 切る前の植物（切り終わる瞬間に、花屋さんの手に移る）
    if (cut < 1) drawPlantBody(ctx, 1);

    // お客さん（花束が近づくと手を伸ばす）
    const reach = clamp01((deliver - 0.7) / 0.3);
    const custHand = [SHOP.customer - 20 - 16 * reach, 158 - 12 * reach];
    drawPerson(ctx, { x: SHOP.customer, dir: -1, body: C.sageSoft, t, hand: custHand });

    // 花屋さんの手の位置
    const bob = walking ? Math.abs(Math.sin(t * 6)) * 3 : 0;
    let hand;
    if (cut > 0 && cut < 1) {
        // 茎を切っている間は、ハサミを茎の根元に当てる
        hand = [stemX(158) - 10, 158];
    } else if (cut >= 1) {
        hand = [floristX + SHOP.hold - 6, SHOP.holdY - 10 - bob];
    }
    drawPerson(ctx, { x: floristX, dir: 1, body: C.sage, t, hand, apron: true, walking });

    // ハサミ：チョキチョキ動かす
    if (cut > 0 && cut < 1) {
        drawScissors(ctx, stemX(158) - 2, 158, Math.abs(Math.sin(t * 7)));
    }

    // 花束：切った花を手に持ち、包み紙とリボンで仕上げる。最後はお客さんの手に渡る
    if (cut >= 1) {
        let bx = floristX + SHOP.hold;
        let by = SHOP.holdY - bob;
        if (handed > 0) { bx += (custHand[0] - 2 - bx) * handed; by += 8 * handed; }
        drawBouquet(ctx, bx, by, clamp01(wrap / 0.7), clamp01((wrap - 0.7) / 0.3));
    }

    // 手渡したら、ハートがふわっと浮かぶ
    if (handed > 0) {
        for (let h = 0; h < 3; h++) {
            const f = (t * 0.5 + h / 3) % 1;
            ctx.globalAlpha = handed * (1 - f);
            ctx.fillStyle = h % 2 ? C.sand : C.sageSoft;
            drawHeart(ctx, (floristX + SHOP.customer) / 2 + (h - 1) * 16, 64 - f * 36, 5 + h);
        }
        ctx.globalAlpha = 1;
    }
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
