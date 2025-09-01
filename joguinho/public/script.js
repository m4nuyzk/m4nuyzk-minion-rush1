const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// ---------- Configuração base ----------
const G = 0.6;
const JUMP = -13;
const DASH_TIME = 15;
const WORLD_FLOOR = 60; // altura do “chão” visual

let player, obstacles, bananas, powerups, gameSpeed, score, lives, bestScore, magnetTimer, shieldTimer;
let levelIndex = 0, levelTimer = 0, isGameOver = false, gameLoop = null, showLevelGate = false;

const levels = [
  {
    name: "Fase 1: Laboratório",
    desc: "Esteiras, canos e lasers intermitentes.",
    duration: 35, // em segundos
    speed: 5,
    theme: {
      sky: ["#1a2147","#0b0f2e"],
      accents: { a:"#ffd84d", b:"#5bb1ff", laser:"#ff6b6b" },
      silhouettes: "lab"
    },
    spawn: { obstacle: 0.020, banana: 0.018, laser: 0.004 }
  },
  {
    name: "Fase 2: Cidade do Vilão",
    desc: "Prédios neon, droids rolantes e mais tráfego!",
    duration: 45,
    speed: 6.5,
    theme: {
      sky: ["#1c114a","#0a0823"],
      accents: { a:"#ffd84d", b:"#64c0ff", laser:"#ff5aa6" },
      silhouettes: "city"
    },
    spawn: { obstacle: 0.026, banana: 0.020, laser: 0.006 }
  },
  {
    name: "Fase 3: Praia Tropical",
    desc: "Ondas, coqueiros, plataformas altas e bananas por todo lado.",
    duration: 60,
    speed: 7.5,
    theme: {
      sky: ["#162b58","#0a1736"],
      accents: { a:"#ffd84d", b:"#7de3ff", laser:"#ffa95a" },
      silhouettes: "beach"
    },
    spawn: { obstacle: 0.030, banana: 0.024, laser: 0.007 }
  }
];

// ---------- Utilidades ----------
function rand(min, max){ return Math.random() * (max - min) + min; }
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function chance(p){ return Math.random() < p; }

// ---------- Jogo ----------
function resetGame() {
  const L = levels[levelIndex];
  player = {
    x: 90, y: canvas.height - WORLD_FLOOR - 90,
    w: 60, h: 80,
    dy: 0,
    jumping: false,
    dashing: false,
    dashTimer: 0,
    facing: 1 // para futuros usos
  };
  obstacles = [];
  bananas = [];
  powerups = [];
  gameSpeed = L.speed;
  score = 0;
  lives = 3;
  magnetTimer = 0;
  shieldTimer = 0;
  levelTimer = 0;
  isGameOver = false;
  showLevelGate = false;

  // HUD
  document.getElementById("lives").textContent = "❤".repeat(lives);
  document.getElementById("score").textContent = "🍌 " + score;
  document.getElementById("speed").textContent = "Velocidade x" + (gameSpeed/5).toFixed(1);
  document.getElementById("level").textContent = L.name;
}

function levelUp() {
  levelIndex = (levelIndex + 1) % levels.length;
  showLevelGate = true;
  clearInterval(gameLoop);
  const L = levels[levelIndex];
  document.getElementById("levelTitle").textContent = L.name;
  document.getElementById("levelDesc").textContent = L.desc;
  document.getElementById("screen-level").classList.add("show");
}

function startLevel() {
  document.getElementById("screen-level").classList.remove("show");
  const L = levels[levelIndex];
  gameSpeed = L.speed;
  levelTimer = 0;
  showLevelGate = false;
  if (!isGameOver) gameLoop = setInterval(update, 1000/60);
}

// ---------- Desenho: fundo parallax ----------
function drawBackground() {
  const L = levels[levelIndex];
  const grd = ctx.createLinearGradient(0,0,0,canvas.height);
  grd.addColorStop(0, L.theme.sky[0]);
  grd.addColorStop(1, L.theme.sky[1]);
  ctx.fillStyle = grd;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // camada 1 – silhuetas distantes
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#0a0e25";
  if (L.theme.silhouettes === "lab") {
    // torres, tubos
    for (let x=0; x<canvas.width; x+=180){
      const h = rand(120, 200);
      ctx.fillRect(x, canvas.height - WORLD_FLOOR - h, 40, h);
      ctx.fillRect(x+50, canvas.height - WORLD_FLOOR - h*0.7, 18, h*0.7);
    }
  } else if (L.theme.silhouettes === "city") {
    for (let x=0; x<canvas.width; x+=140){
      const w = rand(50, 100), h = rand(110, 210);
      ctx.fillRect(x, canvas.height - WORLD_FLOOR - h, w, h);
    }
  } else {
    // beach
    for (let x=0; x<canvas.width; x+=200){
      const h = rand(60, 120);
      ctx.beginPath();
      ctx.arc(x, canvas.height - WORLD_FLOOR + 20, h, Math.PI, Math.PI*1.15);
      ctx.fill();
    }
  }
  ctx.restore();

  // camada 2 – “esteira”/chão
  ctx.fillStyle = "rgba(255,255,255,.06)";
  for (let x=0; x<canvas.width; x+=60){
    ctx.fillRect((x - (Date.now()/30) % 60), canvas.height - WORLD_FLOOR + 6, 30, 3);
  }

  // linha do chão
  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.fillRect(0, canvas.height - WORLD_FLOOR, canvas.width, 2);
}

// ---------- Personagem (estilizado) ----------
function drawPlayer() {
  const cx = player.x + player.w/2;
  const cy = player.y + player.h/2;
  const L = levels[levelIndex];

  // sombra
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(cx, canvas.height - WORLD_FLOOR + 12, player.w*0.55, 10, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // trilha do dash
  if (player.dashing) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = L.theme.accents.b;
    ctx.fillRect(player.x - 18, player.y + 10, 18, player.h - 20);
    ctx.restore();
  }

  // corpo (pílula)
  ctx.save();
  ctx.fillStyle = "#ffd84d";
  const r = 18;
  roundRect(ctx, player.x, player.y, player.w, player.h, r);
  ctx.fill();

  // macacão (azul)
  ctx.fillStyle = "#2a63ff";
  ctx.fillRect(player.x, player.y + player.h*0.55, player.w, player.h*0.45);
  ctx.fillStyle = "#274dbb";
  ctx.fillRect(player.x, player.y + player.h*0.55, player.w, 6);

  // alças do macacão
  ctx.fillStyle = "#2a63ff";
  ctx.fillRect(player.x + 8, player.y + player.h*0.45, 10, 16);
  ctx.fillRect(player.x + player.w - 18, player.y + player.h*0.45, 10, 16);

  // faixa do óculos
  ctx.fillStyle = "#222";
  ctx.fillRect(player.x, player.y + 24, player.w, 10);

  // óculos
  drawGoggle(cx - 12, player.y + 28);
  drawGoggle(cx + 12, player.y + 28);

  // boca
  ctx.strokeStyle = "#2b1a0e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, player.y + player.h*0.72, 10, 0.15*Math.PI, 0.85*Math.PI);
  ctx.stroke();

  // “cabelo”
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx-6, player.y+8); ctx.lineTo(cx-2, player.y+2);
  ctx.moveTo(cx+4, player.y+8); ctx.lineTo(cx+8, player.y+2);
  ctx.stroke();

  // escudo ativo
  if (shieldTimer > 0) {
    ctx.strokeStyle = L.theme.accents.b;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, player.w*0.62, player.h*0.66, 0, 0, Math.PI*2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawGoggle(x, y){
  ctx.fillStyle = "#cfd6df";
  ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#221f27";
  ctx.beginPath(); ctx.arc(x+1.5, y+1.5, 4, 0, Math.PI*2); ctx.fill();
}

function roundRect(c, x, y, w, h, r){
  c.beginPath();
  c.moveTo(x+r, y);
  c.arcTo(x+w, y, x+w, y+h, r);
  c.arcTo(x+w, y+h, x, y+h, r);
  c.arcTo(x, y+h, x, y, r);
  c.arcTo(x, y, x+w, y, r);
  c.closePath();
}

// ---------- Obstáculos & colecionáveis ----------
function spawnEntities() {
  const L = levels[levelIndex];

  // caixas/droids (retângulos e círculos)
  if (chance(L.spawn.obstacle)) {
    const type = Math.random() < 0.5 ? "box" : "droid";
    if (type === "box") {
      obstacles.push({ type, x: canvas.width, y: canvas.height - WORLD_FLOOR - 50, w: 50, h: 50, vx: gameSpeed });
    } else {
      const s = 28;
      obstacles.push({ type, x: canvas.width, y: canvas.height - WORLD_FLOOR - s, w: s, h: s, vx: gameSpeed*1.2 });
    }
  }

  // laser (de cima ou de baixo, abre/fecha)
  if (chance(L.spawn.laser)) {
    const fromTop = Math.random() < 0.5;
    const h = 18;
    const gapY = fromTop ? 0 : canvas.height - WORLD_FLOOR - h;
    obstacles.push({
      type: "laser",
      x: canvas.width, y: gapY,
      w: 120, h,
      vx: gameSpeed*1.1,
      t: 0, // anima piscando
      color: L.theme.accents.laser
    });
  }

  // bananas
  if (chance(L.spawn.banana)) {
    const y = canvas.height - WORLD_FLOOR - rand(80, 240);
    bananas.push({ x: canvas.width, y, r: 10 });
  }

  // powerups (raros)
  if (chance(0.004)) {
    const kind = Math.random() < 0.5 ? "shield" : "magnet";
    const y = canvas.height - WORLD_FLOOR - rand(90, 220);
    powerups.push({ kind, x: canvas.width, y, r: 12 });
  }
}

function drawObstacles() {
  const L = levels[levelIndex];
  obstacles.forEach(o => {
    if (o.type === "box") {
      ctx.fillStyle = "#b7712b";
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = "rgba(0,0,0,.4)";
      ctx.strokeRect(o.x, o.y, o.w, o.h);
    } else if (o.type === "droid") {
      ctx.fillStyle = "#8bd2ff";
      ctx.beginPath(); ctx.arc(o.x + o.w/2, o.y + o.h/2, o.w/2, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#0c2945";
      ctx.beginPath(); ctx.arc(o.x + o.w/2, o.y + o.h/2, 6, 0, Math.PI*2); ctx.fill();
    } else if (o.type === "laser") {
      o.t += 0.2;
      const pulse = (Math.sin(o.t)+1)/2; // 0..1
      ctx.save();
      ctx.globalAlpha = 0.6 + 0.4*pulse;
      ctx.fillStyle = o.color || L.theme.accents.laser;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.restore();
    }
  });
}

function drawBananas() {
  ctx.fillStyle = "#ffe135";
  bananas.forEach(b => {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.PI/6);
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 20, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  });
}

function drawPowerUps() {
  powerups.forEach(p => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.beginPath();
    if (p.kind === "shield") {
      ctx.strokeStyle = "#7ec9ff";
      ctx.lineWidth = 3;
      ctx.ellipse(0, 0, 16, 16, 0, 0, Math.PI*2);
      ctx.stroke();
      ctx.fillStyle = "rgba(126,201,255,.25)";
      ctx.fill();
      ctx.fillStyle = "#7ec9ff";
      ctx.fillRect(-2, -8, 4, 16);
    } else {
      // magnet
      ctx.fillStyle = "#ff4d4d";
      ctx.beginPath();
      ctx.arc(-6, 0, 8, Math.PI*1.5, Math.PI*0.5);
      ctx.arc(6, 0, 8, Math.PI*0.5, Math.PI*1.5);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(-10, -4, 4, 8);
      ctx.fillRect(6, -4, 4, 8);
    }
    ctx.restore();
  });
}

// ---------- Atualização ----------
function update() {
  const L = levels[levelIndex];
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // Fundo
  drawBackground();

  // Física do player
  player.y += player.dy;
  if (!player.dashing) player.dy += G;

  // chão
  const groundY = canvas.height - WORLD_FLOOR - player.h;
  if (player.y > groundY) { player.y = groundY; player.jumping = false; }

  if (player.dashing) {
    player.dashTimer--;
    if (player.dashTimer <= 0) player.dashing = false;
  }

  // Timers de powerups
  if (magnetTimer > 0) magnetTimer--;
  if (shieldTimer > 0) shieldTimer--;

  // Spawns
  spawnEntities();

  // Movimentos
  obstacles.forEach(o => o.x -= (o.vx || gameSpeed));
  obstacles = obstacles.filter(o => o.x + (o.w || 0) > -10);

  bananas.forEach(b => {
    // magnet effect
    if (magnetTimer > 0) {
      const cx = player.x + player.w/2, cy = player.y + player.h/2;
      const dx = cx - b.x, dy = cy - b.y;
      const d = Math.hypot(dx, dy);
      const pull = clamp(140 / (d+1), 0, 3.5);
      b.x += (dx/d) * pull;
      b.y += (dy/d) * pull;
    }
    b.x -= gameSpeed;
  });
  bananas = bananas.filter(b => b.x > -20);

  powerups.forEach(p => p.x -= gameSpeed);
  powerups = powerups.filter(p => p.x > -30);

  // Colisões
  // Obstáculos
  for (let i=obstacles.length-1; i>=0; i--) {
    const o = obstacles[i];
    let hit = false;
    if (o.type === "droid") {
      hit = rectCircleCollide(player, {x:o.x+o.w/2, y:o.y+o.h/2, r:o.w/2});
    } else {
      hit = rectRectCollide(player, o);
    }

    if (hit) {
      if (player.dashing) {
        obstacles.splice(i,1); // quebrado com dash
      } else if (shieldTimer > 0) {
        shieldTimer = 0; // consome escudo
        obstacles.splice(i,1);
      } else {
        lives--;
        document.getElementById("lives").textContent = "❤".repeat(Math.max(0,lives));
        obstacles.splice(i,1);
        if (lives <= 0) return endGame();
      }
    }
  }

  // Bananas
  for (let i=bananas.length-1; i>=0; i--) {
    const b = bananas[i];
    if (rectCircleCollide(player, {x:b.x, y:b.y, r:14})) {
      bananas.splice(i,1);
      score++;
      document.getElementById("score").textContent = "🍌 " + score;

      // A cada 5 bananas, acelera um pouco
      if (score % 5 === 0) {
        gameSpeed += 0.4;
        document.getElementById("speed").textContent = "Velocidade x" + (gameSpeed/5).toFixed(1);
      }
    }
  }

  // Powerups
  for (let i=powerups.length-1; i>=0; i--) {
    const p = powerups[i];
    if (rectCircleCollide(player, {x:p.x, y:p.y, r:16})) {
      powerups.splice(i,1);
      if (p.kind === "shield") shieldTimer = 60 * 6; // 6s
      else magnetTimer = 60 * 6;
    }
  }

  // Desenho principal
  drawObstacles();
  drawBananas();
  drawPowerUps();
  drawPlayer();

  // Cronometragem da fase
  levelTimer += 1/60;
  if (levelTimer >= L.duration && !showLevelGate) levelUp();
}

// ---------- Colisões ----------
function rectRectCollide(a, b){
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}
function rectCircleCollide(rect, c){
  const cx = clamp(c.x, rect.x, rect.x + rect.w);
  const cy = clamp(c.y, rect.y, rect.y + rect.h);
  const dx = c.x - cx, dy = c.y - cy;
  return (dx*dx + dy*dy) <= (c.r*c.r);
}

// ---------- Ações ----------
function jump() {
  if (!player.jumping) {
    player.dy = JUMP;
    player.jumping = true;
  }
}
function dash() {
  if (!player.dashing) {
    player.dashing = true;
    player.dashTimer = DASH_TIME;
    player.dy = Math.min(player.dy, -5); // leve impulso para cima
  }
}

function endGame() {
  isGameOver = true;
  clearInterval(gameLoop);
  document.getElementById("screen-gameover").classList.add("show");
  document.getElementById("finalScore").textContent = score;
  const prev = Number(localStorage.getItem("minion_best") || 0);
  bestScore = Math.max(prev, score);
  localStorage.setItem("minion_best", String(bestScore));
  document.getElementById("bestScore").textContent = bestScore;
}

// ---------- Controles ----------
document.getElementById("btnJump").addEventListener("click", jump);
document.getElementById("btnDash").addEventListener("click", dash);

document.addEventListener("keydown", e => {
  if (e.code === "Space") { e.preventDefault(); jump(); }
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") { e.preventDefault(); dash(); }
});

let lastTap = 0;
canvas.addEventListener("touchstart", () => {
  const now = Date.now();
  if (now - lastTap < 300) dash(); else jump();
  lastTap = now;
}, {passive:true});

// ---------- Fluxo de telas ----------
document.getElementById("btnPlay").addEventListener("click", () => {
  levelIndex = 0;
  resetGame();
  document.getElementById("screen-start").classList.remove("show");
  gameLoop = setInterval(update, 1000/60);
});

document.getElementById("btnGo").addEventListener("click", () => startLevel());

document.getElementById("btnRestart").addEventListener("click", () => {
  levelIndex = 0;
  resetGame();
  document.getElementById("screen-gameover").classList.remove("show");
  gameLoop = setInterval(update, 1000/60);
});

// Carrega best score
(function init(){
  const prev = Number(localStorage.getItem("minion_best") || 0);
  document.getElementById("bestScore").textContent = prev;
})();
