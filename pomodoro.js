// --- DOM Elements ---
const viewButtons = document.querySelectorAll('.view-switch__btn');
const views = { plate: document.getElementById('view-plate'), bar: document.getElementById('view-bar'), glass: document.getElementById('view-glass'), sky: document.getElementById('view-sky'), balls: document.getElementById('view-balls') };

const plateWedge = document.getElementById('plate-wedge');
const plateDots = document.getElementById('plate-dots');
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

const ballsCanvas = document.getElementById('balls-canvas');
const ballsCtx = ballsCanvas.getContext('2d');
const ballsTime = document.getElementById('balls-time');
const ballsPhase = document.getElementById('balls-phase');
const BOX = { w: 320, h: 220 };
const BALL_SPEED = 110;              // 1秒に進む距離（箱の大きさ基準）。速さは分数に関係なく一定
const BALL_FILL = 0.62;              // 満杯＝箱の面積の約6割をボールが占める状態（見た目にぎっしり。これ以上だと動けなくなる）
const BALL_COLORS = ['#6F9B88', '#A3C2AD', '#C9A47B', '#E0C6A5'];
let balls = [];
let ballTarget = 100;                // 満杯になる時のボールの数
let ballR = 10;
let drops = [];
let lastFrameAt = 0;

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
let stepCount = 25;   // 円のドットの数（1分ごと。60を超える時はまとめる）
const BAR_COUNT = 20; // バーは分数に関係なく常に20本
let glassFlipping = false; // 砂時計が回転している間は砂を止めて見せる
let glassFrozenRatio = 0;
const GLASS = { neck: 130, topMax: 80, bottomBase: 220, bottomMax: 72 };

const PLATE = { cx: 100, cy: 100, wedgeR: 74, dotR: 84 };
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

// --- 表示の切り替え（円 / バー） ---
function setView(name) {
    Object.entries(views).forEach(([key, el]) => el.classList.toggle('is-active', key === name));
    viewButtons.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.view === name)));
    try { localStorage.setItem('pomodoro-view', name); } catch (e) {}
    if (name === 'balls') { syncScene(); renderShapes(); }
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
    // 円：1分ごとにドットを1つ（60分を超える時は60個にまとめる）
    stepCount = Math.min(minutes, 60);
    plateDots.innerHTML = '';
    const dotR = stepCount > 40 ? 2.2 : 3;
    for (let i = 0; i < stepCount; i++) {
        const [x, y] = polar(PLATE.dotR, (i + 0.5) / stepCount);
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', x.toFixed(2));
        dot.setAttribute('cy', y.toFixed(2));
        dot.setAttribute('r', dotR);
        dot.classList.add('dot');
        plateDots.appendChild(dot);
    }

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

function paintDots(ratio) {
    const remainingSteps = Math.ceil(ratio * stepCount);
    const dots = plateDots.children;
    for (let i = 0; i < stepCount; i++) {
        // 反時計回りに並べているので、i が小さいほど12時に近い＝最後まで残る
        dots[i].classList.toggle('is-spent', i >= remainingSteps);
        dots[i].classList.toggle('is-current', i === remainingSteps - 1);
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

// --- ボール：分数が短いほど大きく少なく、長いほど小さく多く。時間ちょうどで箱が埋まる ---
const BALL_EVERY_MS = 10000; // 10秒ごとに1個増える

function configureBalls(minutes) {
    // 最初の1個＋10秒ごとに1個。最後の10秒の間は「いっぱい」の状態を見せたいので、
    // 終了10秒前に出る1個で箱が埋まるように大きさを決める → 1分=6個、5分=30個、20分=120個、25分=150個
    ballTarget = Math.ceil((minutes * 60000) / BALL_EVERY_MS);
    // 面積から出した大きさと、「N個を格子状に並べても少し余裕がある大きさ」の小さい方を使う
    // （ボールが少なく大きい時に、重ならずに動ける余地を残すため）
    const byArea = Math.sqrt((BALL_FILL * BOX.w * BOX.h) / (Math.PI * ballTarget));
    let byGrid = 0;
    for (let cols = 1; cols <= ballTarget; cols++) {
        const rows = Math.ceil(ballTarget / cols);
        byGrid = Math.max(byGrid, Math.min(BOX.w / (2 * cols), BOX.h / (2 * rows)));
    }
    ballR = Math.min(byArea, byGrid * 0.85);
}

function addBall(x, y, inwardX = 0, inwardY = 0) {
    let a = Math.random() * Math.PI * 2;
    let vx = Math.cos(a) * BALL_SPEED;
    let vy = Math.sin(a) * BALL_SPEED;
    // 壁で生まれたボールは、箱の内側に向かって飛び出す
    if (inwardX && Math.sign(vx) !== inwardX) vx = -vx;
    if (inwardY && Math.sign(vy) !== inwardY) vy = -vy;
    balls.push({
        x: Math.min(BOX.w - ballR, Math.max(ballR, x)),
        y: Math.min(BOX.h - ballR, Math.max(ballR, y)),
        vx, vy,
        c: BALL_COLORS[Math.floor(Math.random() * BALL_COLORS.length)],
    });
}

function resetScene() {
    balls = [];
    addBall(BOX.w / 2, BOX.h / 2);
    drops = [];
    for (let i = 0; i < 36; i++) {
        drops.push({ x: Math.random() * BOX.w, y: Math.random() * BOX.h, v: 140 + Math.random() * 80 });
    }
}

function ballsWanted(ratio) {
    const elapsed = (1 - ratio) * totalMs;
    return Math.min(ballTarget, 1 + Math.floor(elapsed / BALL_EVERY_MS));
}

// 箱のふちのどこかから、内側に向かって新しいボールを出す
function addBallFromWall() {
    const side = Math.floor(Math.random() * 4);
    const along = Math.random();
    if (side === 0) addBall(ballR, along * BOX.h, 1, 0);
    else if (side === 1) addBall(BOX.w - ballR, along * BOX.h, -1, 0);
    else if (side === 2) addBall(along * BOX.w, ballR, 0, 1);
    else addBall(along * BOX.w, BOX.h - ballR, 0, -1);
}

function stepBalls(dt, ratio) {
    for (const b of balls) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < ballR) { b.x = ballR; b.vx = Math.abs(b.vx); }
        if (b.x > BOX.w - ballR) { b.x = BOX.w - ballR; b.vx = -Math.abs(b.vx); }
        if (b.y < ballR) { b.y = ballR; b.vy = Math.abs(b.vy); }
        if (b.y > BOX.h - ballR) { b.y = BOX.h - ballR; b.vy = -Math.abs(b.vy); }
    }

    // ボール同士の衝突（重なったら押し戻し、ぶつかる向きの速度を入れ替える）
    // 混み合うと1回では押し戻しきれないので、1フレームに3回くり返す
    const d2 = (2 * ballR) * (2 * ballR);
    for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        for (let j = i + 1; j < balls.length; j++) {
            const b = balls[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const dist2 = dx * dx + dy * dy;
            if (dist2 >= d2 || dist2 === 0) continue;
            const dist = Math.sqrt(dist2);
            const nx = dx / dist, ny = dy / dist;
            const push = (2 * ballR - dist) / 2;
            a.x -= nx * push; a.y -= ny * push;
            b.x += nx * push; b.y += ny * push;
            const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
            if (rel > 0) {
                a.vx -= rel * nx; a.vy -= rel * ny;
                b.vx += rel * nx; b.vy += rel * ny;
            }
        }
    }
    for (const b of balls) {
        b.x = Math.min(BOX.w - ballR, Math.max(ballR, b.x));
        b.y = Math.min(BOX.h - ballR, Math.max(ballR, b.y));
    }
    }

    // 10秒ごとに1個増える（タブを裏にしていた等で遅れた時は、まとめて追いつく）
    const want = ballsWanted(ratio);
    while (balls.length < want) addBallFromWall();
}

function waterLevel(ratio) {
    return BOX.h * (1 - ratio); // 休憩の終わりにちょうど満杯
}

function stepRain(dt, ratio) {
    const surface = BOX.h - waterLevel(ratio);
    for (const d of drops) {
        d.y += d.v * dt;
        if (d.y > surface) {
            d.y = -10 - Math.random() * 40;
            d.x = Math.random() * BOX.w;
        }
    }
}

function sizeCanvas() {
    const rect = ballsCanvas.getBoundingClientRect();
    if (!rect.width) return false;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (ballsCanvas.width !== w || ballsCanvas.height !== h) {
        ballsCanvas.width = w;
        ballsCanvas.height = h;
    }
    ballsCtx.setTransform(w / BOX.w, 0, 0, h / BOX.h, 0, 0);
    return true;
}

function drawScene(ratio) {
    if (!views.balls.classList.contains('is-active') || !sizeCanvas()) return;
    const ctx = ballsCtx;
    ctx.clearRect(0, 0, BOX.w, BOX.h);
    if (isWorkMode) {
        for (const b of balls) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, ballR, 0, Math.PI * 2);
            ctx.fillStyle = b.c;
            ctx.fill();
        }
        return;
    }
    // 休憩：雨と、たまっていく水（水面は少し揺れる）
    const level = waterLevel(ratio);
    const surface = BOX.h - level;
    const t = performance.now() / 1000;
    ctx.fillStyle = 'rgba(163, 194, 173, 0.55)'; // color-B
    ctx.beginPath();
    ctx.moveTo(0, BOX.h);
    for (let x = 0; x <= BOX.w; x += 8) {
        ctx.lineTo(x, surface + Math.sin(x / 22 + t * 2) * 2.2);
    }
    ctx.lineTo(BOX.w, BOX.h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6F9B88'; // color-A
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const d of drops) {
        if (d.y < surface) {
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x - 1.5, Math.min(d.y + 9, surface));
        }
    }
    ctx.stroke();
}

function syncScene() {
    // 途中から「ボール」に切り替えた時などは、今の進み具合までボールを増やしておく
    if (!isWorkMode) return;
    const want = ballsWanted(Math.min(1, currentRemaining() / totalMs));
    while (balls.length < want) addBallFromWall();
}

function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function currentRemaining() {
    return isRunning ? Math.max(0, endAt - performance.now()) : remainingMs;
}

// 絵（扇形・ドット・バー）：毎フレーム呼んで滑らかに動かす
function renderShapes() {
    const ratio = Math.min(1, currentRemaining() / totalMs);
    plateWedge.setAttribute('d', wedgePath(ratio));
    paintDots(ratio);
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
    ballsTime.textContent = text;
    const phase = isWorkMode ? PHASE_LABEL.work : PHASE_LABEL.break;
    document.title = isRunning ? `${text} ${phase}｜Visual Pomodoro` : 'Visual Pomodoro';
}

function updateDisplay() {
    renderShapes();
    renderText(true);
}

function frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrameAt) / 1000); // 裏のタブから戻った時に大きく飛ばない
    lastFrameAt = now;
    if (views.balls.classList.contains('is-active')) {
        const ratio = Math.min(1, currentRemaining() / totalMs);
        if (isWorkMode) stepBalls(dt, ratio);
        else stepRain(dt, ratio);
    }
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
    ballsPhase.textContent = phase;
    skipBtn.textContent = isWork ? '休憩に入る' : '集中に戻る';

    buildSteps(mins);
    if (isWork) configureBalls(mins);
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
    lastFrameAt = performance.now();
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
    if (saved && views[saved]) setView(saved);
} catch (e) {}
switchMode(true);
