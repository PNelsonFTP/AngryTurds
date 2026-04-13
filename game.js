// ============================================================
// ANGRY TURDS v2 — Mobile-First with Virtual Coordinate System
// ============================================================

// ---- VIRTUAL COORDINATE SYSTEM ----
// Design at 960×540 (16:9), scale uniformly to fit any screen
const VIRTUAL_W = 960;
const VIRTUAL_H = 540;

// ---- CONSTANTS & CONFIG ----
const GRAVITY = 600;
const SLING_X = 130;
const SLING_Y_BASE_OFFSET = 140;
const SLING_POWER = 4.5;
const MAX_PULL = 100;
const GROUND_HEIGHT = 70;
const BLOCK_TYPES = { WOOD: 'wood', STONE: 'stone', GLASS: 'glass' };
const MIN_VELOCITY = 8;
const DAMAGE_THRESHOLD = 15;
const SETTLE_TIME = 2.5;

// ---- CANVAS SETUP ----
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let scale = 1;
let offsetX = 0;
let offsetY = 0;

function resizeCanvas() {
  // Use visualViewport for iPhone Chrome reliability
  const vv = window.visualViewport;
  const screenW = vv ? vv.width : window.innerWidth;
  const screenH = vv ? vv.height : window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = screenW * dpr;
  canvas.height = screenH * dpr;
  canvas.style.width = screenW + 'px';
  canvas.style.height = screenH + 'px';

  // Scale to fit virtual coords, maintaining aspect ratio
  const scaleX = screenW / VIRTUAL_W;
  const scaleY = screenH / VIRTUAL_H;
  scale = Math.min(scaleX, scaleY);

  // Center the game area (letterbox)
  offsetX = (screenW - VIRTUAL_W * scale) / 2;
  offsetY = (screenH - VIRTUAL_H * scale) / 2;

  // Account for DPR in the context transform (applied each frame)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resizeCanvas);
}

// Convert screen coords to virtual coords
function screenToVirtual(sx, sy) {
  return {
    x: (sx - offsetX) / scale,
    y: (sy - offsetY) / scale,
  };
}

// Set up the canvas transform for rendering in virtual coords
function applyVirtualTransform() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
}

// ---- AUDIO ----
let audioCtx = null;
let soundEnabled = true;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playSFX(freq, duration = 0.12, type = 'square', vol = 0.15) {
  if (!audioCtx || !soundEnabled) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch(e) {}
}

function playLaunch() { playSFX(180, 0.2, 'sawtooth', 0.12); setTimeout(() => playSFX(120, 0.15, 'sawtooth', 0.08), 80); }
function playImpact() { playSFX(80, 0.15, 'triangle', 0.2); playSFX(60, 0.2, 'sawtooth', 0.1); }
function playBreak() { playSFX(200, 0.08, 'square', 0.15); setTimeout(() => playSFX(300, 0.06, 'square', 0.1), 50); }
function playPigSqueal() { playSFX(600, 0.15, 'sine', 0.12); setTimeout(() => playSFX(500, 0.12, 'sine', 0.1), 80); }
function playWin() { [400,500,600,800].forEach((f,i) => setTimeout(() => playSFX(f, 0.2, 'sine', 0.12), i*120)); }
function playLose() { [300,250,200,150].forEach((f,i) => setTimeout(() => playSFX(f, 0.25, 'triangle', 0.1), i*150)); }
function playSplat() { playSFX(100, 0.3, 'sawtooth', 0.15); playSFX(150, 0.2, 'triangle', 0.1); }

// Sound toggle
const soundToggleBtn = document.getElementById('soundToggle');
soundToggleBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundToggleBtn.textContent = soundEnabled ? '🔊' : '🔇';
});

// ---- PARTICLE SYSTEM ----
class Particle {
  constructor() { this.active = false; }
  init(x, y, vx, vy, life, color, size) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.color = color; this.size = size; this.active = true;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 300 * dt;
    this.life -= dt;
    if (this.life <= 0) this.active = false;
  }
  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    const s = this.size * (0.5 + 0.5 * alpha);
    ctx.beginPath();
    ctx.arc(this.x, this.y, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

const particles = Array.from({ length: 300 }, () => new Particle());

function emitParticles(x, y, count, cfg) {
  let emitted = 0;
  for (const p of particles) {
    if (!p.active && emitted < count) {
      p.init(x, y,
        (Math.random() - 0.5) * cfg.spread,
        -Math.random() * cfg.speed - cfg.speed * 0.3,
        cfg.life + Math.random() * (cfg.lifeVar || 0.3),
        cfg.colors ? cfg.colors[Math.floor(Math.random() * cfg.colors.length)] : cfg.color,
        cfg.size + Math.random() * (cfg.sizeVar || 2)
      );
      emitted++;
    }
  }
}

// ---- PHYSICS BODIES ----
class Body {
  constructor(x, y, w, h, type = 'dynamic', bodyType = 'block') {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.angle = 0; this.angularVel = 0;
    this.type = type;
    this.bodyType = bodyType;
    this.mass = type === 'static' ? Infinity : (w * h) / 500;
    this.restitution = 0.3;
    this.friction = 0.6;
    this.health = 100;
    this.maxHealth = 100;
    this.destroyed = false;
    this.settled = false;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get speed() { return Math.sqrt(this.vx * this.vx + this.vy * this.vy); }

  update(dt) {
    if (this.type === 'static' || this.destroyed) return;
    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.angularVel * dt;
    this.vx *= 0.995;
    this.angularVel *= 0.98;
  }

  applyDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.destroyed = true;
      return true;
    }
    return false;
  }
}

// ---- POOP PROJECTILE (BIGGER!) ----
class Turd {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = 32; // Much bigger! Was 18
    this.mass = 5;
    this.launched = false;
    this.active = true;
    this.trail = [];
    this.rotation = 0;
    this.squish = 1;
    this.splatted = false;
  }

  update(dt) {
    if (!this.launched || !this.active) return;
    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += 3 * dt;
    
    // Trail
    if (Math.random() < 0.6) {
      this.trail.push({ x: this.x, y: this.y, life: 0.6, maxLife: 0.6 });
    }
    this.trail = this.trail.filter(t => {
      t.life -= dt;
      return t.life > 0;
    });

    // Off screen (using virtual coords)
    if (this.x > VIRTUAL_W + 100 || this.y > VIRTUAL_H + 100 || this.x < -200) {
      this.active = false;
    }
  }

  draw(ctx) {
    // Trail
    for (const t of this.trail) {
      const a = t.life / t.maxLife;
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = '#5C3A1E';
      ctx.beginPath();
      ctx.arc(t.x, t.y, this.radius * 0.35 * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    if (!this.active) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.scale(1, this.squish);
    
    drawPoop(ctx, 0, 0, this.radius);
    
    ctx.restore();
  }

  get speed() { return Math.sqrt(this.vx * this.vx + this.vy * this.vy); }
}

function drawPoop(ctx, x, y, size) {
  const s = size;
  
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.9, s * 0.9, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Base (bottom round)
  ctx.fillStyle = '#6B4226';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.3, s * 0.85, s * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Middle bulge
  ctx.fillStyle = '#7B5230';
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.05, s * 0.65, s * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Top peak
  ctx.fillStyle = '#8B6240';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.05, y - s * 0.4, s * 0.4, s * 0.35, -0.2, 0, Math.PI * 2);
  ctx.fill();
  
  // Tip
  ctx.fillStyle = '#8B6240';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.1, y - s * 0.7, s * 0.2, s * 0.2, -0.3, 0, Math.PI * 2);
  ctx.fill();
  
  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.ellipse(x - s * 0.15, y - s * 0.25, s * 0.15, s * 0.2, -0.4, 0, Math.PI * 2);
  ctx.fill();
  
  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x - s * 0.2, y - s * 0.15, s * 0.16, 0, Math.PI * 2);
  ctx.arc(x + s * 0.2, y - s * 0.15, s * 0.16, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#1a0e05';
  ctx.beginPath();
  ctx.arc(x - s * 0.18, y - s * 0.13, s * 0.08, 0, Math.PI * 2);
  ctx.arc(x + s * 0.22, y - s * 0.13, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
  
  // Angry eyebrows
  ctx.strokeStyle = '#3A2410';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.35, y - s * 0.35);
  ctx.lineTo(x - s * 0.08, y - s * 0.28);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + s * 0.35, y - s * 0.35);
  ctx.lineTo(x + s * 0.08, y - s * 0.28);
  ctx.stroke();
}

// ---- PIG (ENEMY) ----
class Pig {
  constructor(x, y, size = 28) {
    this.x = x; this.y = y;
    this.size = size;
    this.vx = 0; this.vy = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.destroyed = false;
    this.mass = 2;
    this.expression = 'normal';
  }

  update(dt) {
    if (this.destroyed) return;
    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.98;
    
    // Ground collision (virtual coords)
    const groundY = VIRTUAL_H - GROUND_HEIGHT;
    if (this.y + this.size > groundY) {
      this.y = groundY - this.size;
      this.vy *= -0.2;
      this.vx *= 0.8;
      if (Math.abs(this.vy) < 5) this.vy = 0;
    }

    if (this.health < 50) this.expression = 'worried';
    if (this.health <= 0) {
      this.expression = 'dead';
      this.destroyed = true;
    }
  }

  draw(ctx) {
    if (this.destroyed) return;
    const s = this.size;
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + s * 1.1, s * 0.8, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Body (green pig)
    const grad = ctx.createRadialGradient(this.x - s * 0.2, this.y - s * 0.2, s * 0.1, this.x, this.y, s);
    grad.addColorStop(0, '#7BC67E');
    grad.addColorStop(1, '#4A8B4C');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, s, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#3A6B3C';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Ears
    ctx.fillStyle = '#5A9B5C';
    ctx.beginPath();
    ctx.ellipse(this.x - s * 0.75, this.y - s * 0.55, s * 0.25, s * 0.35, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(this.x + s * 0.75, this.y - s * 0.55, s * 0.25, s * 0.35, 0.3, 0, Math.PI * 2);
    ctx.fill();
    
    // Nose (snout)
    ctx.fillStyle = '#5A9B5C';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + s * 0.15, s * 0.4, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3A6B3C';
    ctx.beginPath();
    ctx.arc(this.x - s * 0.12, this.y + s * 0.15, s * 0.08, 0, Math.PI * 2);
    ctx.arc(this.x + s * 0.12, this.y + s * 0.15, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
    
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x - s * 0.25, this.y - s * 0.2, s * 0.2, 0, Math.PI * 2);
    ctx.arc(this.x + s * 0.25, this.y - s * 0.2, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    
    if (this.expression === 'worried') {
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(this.x - s * 0.25, this.y - s * 0.15, s * 0.1, 0, Math.PI * 2);
      ctx.arc(this.x + s * 0.25, this.y - s * 0.15, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x - s * 0.4, this.y - s * 0.4);
      ctx.lineTo(this.x - s * 0.1, this.y - s * 0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.x + s * 0.4, this.y - s * 0.4);
      ctx.lineTo(this.x + s * 0.1, this.y - s * 0.45);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(this.x - s * 0.25, this.y - s * 0.2, s * 0.1, 0, Math.PI * 2);
      ctx.arc(this.x + s * 0.25, this.y - s * 0.2, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Health bar
    if (this.health < this.maxHealth && this.health > 0) {
      const barW = s * 1.6;
      const barH = 4;
      const barX = this.x - barW / 2;
      const barY = this.y - s - 10;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(barX, barY, barW, barH);
      const pct = this.health / this.maxHealth;
      ctx.fillStyle = pct > 0.5 ? '#4CAF50' : pct > 0.25 ? '#FF9800' : '#E53935';
      ctx.fillRect(barX, barY, barW * pct, barH);
    }
  }

  applyDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.destroyed = true;
      return true;
    }
    return false;
  }
}

// ---- BLOCK DRAWING ----
function drawBlock(ctx, block) {
  if (block.destroyed) return;
  
  const { x, y, w, h } = block;
  const dmg = 1 - block.health / block.maxHealth;
  
  ctx.save();
  ctx.translate(block.cx, block.cy);
  ctx.rotate(block.angle);
  
  if (block.material === BLOCK_TYPES.WOOD) {
    // TOILET PAPER ROLL rendering!
    drawTPRoll(ctx, w, h, dmg);
  } else {
    let baseColor, darkColor, lightColor;
    
    switch (block.material) {
      case BLOCK_TYPES.STONE:
        baseColor = `rgb(${140 - dmg * 30}, ${140 - dmg * 30}, ${150 - dmg * 30})`;
        darkColor = '#666';
        lightColor = '#aaa';
        break;
      case BLOCK_TYPES.GLASS:
        baseColor = `rgba(${160 - dmg * 40}, ${210 - dmg * 40}, ${240 - dmg * 40}, 0.8)`;
        darkColor = 'rgba(80, 150, 200, 0.6)';
        lightColor = 'rgba(200, 235, 255, 0.9)';
        break;
    }
    
    ctx.fillStyle = baseColor;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = lightColor;
    ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, 3);
    
    // Damage cracks
    if (dmg > 0.3) {
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-w * 0.3, -h * 0.4);
      ctx.lineTo(w * 0.1, h * 0.1);
      ctx.lineTo(w * 0.3, h * 0.4);
      ctx.stroke();
    }
    if (dmg > 0.6) {
      ctx.beginPath();
      ctx.moveTo(w * 0.2, -h * 0.3);
      ctx.lineTo(-w * 0.1, h * 0.2);
      ctx.stroke();
    }
  }
  
  ctx.restore();
}

function drawTPRoll(ctx, w, h, dmg) {
  // Determine if this is more like a horizontal or vertical block
  const isWide = w > h;
  
  // Base color (white to off-white, gets dirtier with damage)
  const r = Math.round(255 - dmg * 50);
  const g = Math.round(250 - dmg * 60);
  const b = Math.round(245 - dmg * 50);
  
  // Draw the TP roll body
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  
  // Soft paper texture — subtle horizontal lines
  ctx.strokeStyle = `rgba(200, 190, 180, ${0.3 - dmg * 0.1})`;
  ctx.lineWidth = 0.5;
  const lineSpacing = 4;
  if (isWide) {
    // Horizontal lines for wide blocks (like planks)
    for (let ly = -h / 2 + lineSpacing; ly < h / 2; ly += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(-w / 2, ly);
      ctx.lineTo(w / 2, ly);
      ctx.stroke();
    }
  } else {
    // Horizontal wrap lines for vertical pillars
    for (let ly = -h / 2 + lineSpacing; ly < h / 2; ly += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(-w / 2, ly);
      ctx.lineTo(w / 2, ly);
      ctx.stroke();
    }
  }
  
  // Perforated line down the middle
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = `rgba(180, 170, 160, ${0.5 - dmg * 0.2})`;
  ctx.lineWidth = 0.8;
  if (isWide) {
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(0, h / 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  
  // Cardboard tube visible at the ends
  const tubeColor = `rgb(${180 - dmg * 30}, ${155 - dmg * 25}, ${120 - dmg * 20})`;
  if (isWide && h > 10) {
    // Left end — cardboard ring
    ctx.fillStyle = tubeColor;
    ctx.beginPath();
    ctx.ellipse(-w / 2, 0, 3, h / 2 - 1, 0, 0, Math.PI * 2);
    ctx.fill();
    // Right end
    ctx.beginPath();
    ctx.ellipse(w / 2, 0, 3, h / 2 - 1, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (w > 10) {
    // Top end
    ctx.fillStyle = tubeColor;
    ctx.beginPath();
    ctx.ellipse(0, -h / 2, w / 2 - 1, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Bottom end
    ctx.beginPath();
    ctx.ellipse(0, h / 2, w / 2 - 1, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Subtle border
  ctx.strokeStyle = `rgba(180, 170, 160, 0.6)`;
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  
  // Edge highlight (paper sheen)
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, 2);
  
  // Damage: tears and crumple
  if (dmg > 0.3) {
    ctx.strokeStyle = 'rgba(150, 130, 110, 0.5)';
    ctx.lineWidth = 1;
    // Tear line
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, -h * 0.4);
    ctx.lineTo(-w * 0.1, h * 0.0);
    ctx.lineTo(w * 0.2, h * 0.3);
    ctx.stroke();
  }
  if (dmg > 0.6) {
    // More tears, paper getting shredded
    ctx.strokeStyle = 'rgba(130, 110, 90, 0.5)';
    ctx.beginPath();
    ctx.moveTo(w * 0.2, -h * 0.3);
    ctx.lineTo(-w * 0.15, h * 0.15);
    ctx.stroke();
    // Crumpled shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(-w * 0.2, -h * 0.2, w * 0.4, h * 0.4);
  }
}

// ---- SLINGSHOT DRAWING ----
function drawSlingshotBack(ctx, slingX, slingY) {
  ctx.fillStyle = '#4A2E18';
  ctx.fillRect(slingX - 18, slingY - 44, 7, 50);
}

function drawSlingshotFront(ctx, slingX, slingY) {
  ctx.fillStyle = '#6B4226';
  ctx.fillRect(slingX + 11, slingY - 44, 7, 50);
  
  // Base
  ctx.fillStyle = '#4A2E18';
  ctx.fillRect(slingX - 20, slingY + 4, 40, 9);
  ctx.fillRect(slingX - 14, slingY + 11, 28, 16);
  
  // Fork tops
  ctx.fillStyle = '#6B4226';
  ctx.beginPath();
  ctx.arc(slingX - 14, slingY - 42, 5, 0, Math.PI * 2);
  ctx.arc(slingX + 14, slingY - 42, 5, 0, Math.PI * 2);
  ctx.fill();
}

// ---- BACKGROUND ----
function drawBackground(ctx) {
  const w = VIRTUAL_W;
  const h = VIRTUAL_H;
  const groundY = h - GROUND_HEIGHT;
  
  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
  skyGrad.addColorStop(0, '#87CEEB');
  skyGrad.addColorStop(0.5, '#B0E0F0');
  skyGrad.addColorStop(1, '#E8F5E9');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, groundY);
  
  // Clouds
  drawCloud(ctx, w * 0.15, h * 0.12, 50);
  drawCloud(ctx, w * 0.45, h * 0.08, 65);
  drawCloud(ctx, w * 0.75, h * 0.18, 40);
  drawCloud(ctx, w * 0.9, h * 0.06, 55);
  
  // Hills background
  ctx.fillStyle = '#6BAF6E';
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  for (let x = 0; x <= w; x += 30) {
    ctx.lineTo(x, groundY - 25 - Math.sin(x * 0.006) * 20 - Math.sin(x * 0.015) * 12);
  }
  ctx.lineTo(w, groundY);
  ctx.closePath();
  ctx.fill();
  
  // Ground
  const groundGrad = ctx.createLinearGradient(0, groundY, 0, h);
  groundGrad.addColorStop(0, '#5D8C3F');
  groundGrad.addColorStop(0.15, '#4A7A32');
  groundGrad.addColorStop(0.3, '#8B6B4A');
  groundGrad.addColorStop(1, '#6B4D33');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, groundY, w, GROUND_HEIGHT);
  
  // Grass tufts
  ctx.strokeStyle = '#6BAF6E';
  ctx.lineWidth = 1.5;
  for (let x = 0; x < w; x += 18 + Math.random() * 12) {
    const gy = groundY;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.quadraticCurveTo(x - 3, gy - 7, x - 1, gy - 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.quadraticCurveTo(x + 4, gy - 8, x + 2, gy - 12);
    ctx.stroke();
  }
}

function drawCloud(ctx, x, y, size) {
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
  ctx.arc(x + size * 0.4, y - size * 0.15, size * 0.4, 0, Math.PI * 2);
  ctx.arc(x + size * 0.8, y, size * 0.45, 0, Math.PI * 2);
  ctx.arc(x + size * 0.35, y + size * 0.15, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

// ---- TRAJECTORY DOTS ----
function drawTrajectory(ctx, startX, startY, vx, vy) {
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  let tx = startX, ty = startY, tvx = vx, tvy = vy;
  const groundY = VIRTUAL_H - GROUND_HEIGHT;
  for (let i = 0; i < 30; i++) {
    const dt = 0.05;
    tvy += GRAVITY * dt;
    tx += tvx * dt;
    ty += tvy * dt;
    if (ty > groundY) break;
    if (i % 2 === 0) {
      ctx.beginPath();
      ctx.arc(tx, ty, 2.5 - i * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---- LEVELS (in virtual coords) ----
function createLevels() {
  const G = VIRTUAL_H - GROUND_HEIGHT; // ground Y line
  
  return [
    // Level 1 — Simple intro
    {
      turds: 3,
      blocks: () => [
        makeBlock(G, 500, G - 80, 20, 80, 'wood'),
        makeBlock(G, 580, G - 80, 20, 80, 'wood'),
        makeBlock(G, 495, G - 100, 110, 20, 'wood'),
      ],
      pigs: () => [
        new Pig(540, G - 30, 25),
      ],
    },
    // Level 2 — Two pigs, mixed materials
    {
      turds: 4,
      blocks: () => [
        makeBlock(G, 500, G - 60, 20, 60, 'wood'),
        makeBlock(G, 570, G - 60, 20, 60, 'wood'),
        makeBlock(G, 495, G - 80, 100, 20, 'wood'),
        makeBlock(G, 680, G - 80, 20, 80, 'stone'),
        makeBlock(G, 750, G - 80, 20, 80, 'stone'),
        makeBlock(G, 675, G - 100, 100, 20, 'stone'),
      ],
      pigs: () => [
        new Pig(535, G - 25, 22),
        new Pig(715, G - 25, 22),
      ],
    },
    // Level 3 — Tower
    {
      turds: 4,
      blocks: () => [
        makeBlock(G, 580, G - 60, 20, 60, 'stone'),
        makeBlock(G, 660, G - 60, 20, 60, 'stone'),
        makeBlock(G, 575, G - 80, 110, 20, 'wood'),
        makeBlock(G, 600, G - 140, 20, 60, 'wood'),
        makeBlock(G, 640, G - 140, 20, 60, 'wood'),
        makeBlock(G, 595, G - 160, 70, 20, 'wood'),
        makeBlock(G, 615, G - 200, 20, 40, 'glass'),
        makeBlock(G, 607, G - 215, 30, 15, 'glass'),
      ],
      pigs: () => [
        new Pig(620, G - 25, 22),
        new Pig(620, G - 105, 20),
      ],
    },
    // Level 4 — Fortress
    {
      turds: 5,
      blocks: () => [
        makeBlock(G, 480, G - 100, 20, 100, 'stone'),
        makeBlock(G, 700, G - 100, 20, 100, 'stone'),
        makeBlock(G, 475, G - 120, 250, 20, 'stone'),
        makeBlock(G, 540, G - 60, 15, 60, 'wood'),
        makeBlock(G, 640, G - 60, 15, 60, 'wood'),
        makeBlock(G, 535, G - 75, 125, 15, 'wood'),
        makeBlock(G, 560, G - 30, 80, 15, 'glass'),
        makeBlock(G, 510, G - 160, 15, 40, 'glass'),
        makeBlock(G, 690, G - 160, 15, 40, 'glass'),
        makeBlock(G, 505, G - 175, 205, 15, 'glass'),
      ],
      pigs: () => [
        new Pig(560, G - 25, 20),
        new Pig(620, G - 25, 20),
        new Pig(590, G - 145, 18),
      ],
    },
    // Level 5 — Final challenge
    {
      turds: 5,
      blocks: () => [
        makeBlock(G, 450, G - 120, 20, 120, 'stone'),
        makeBlock(G, 530, G - 120, 20, 120, 'stone'),
        makeBlock(G, 445, G - 140, 110, 20, 'stone'),
        
        makeBlock(G, 650, G - 120, 20, 120, 'stone'),
        makeBlock(G, 730, G - 120, 20, 120, 'stone'),
        makeBlock(G, 645, G - 140, 110, 20, 'stone'),
        
        makeBlock(G, 545, G - 80, 110, 15, 'wood'),
        makeBlock(G, 560, G - 60, 15, 60, 'wood'),
        makeBlock(G, 640, G - 60, 15, 60, 'wood'),
        
        makeBlock(G, 470, G - 180, 15, 40, 'glass'),
        makeBlock(G, 510, G - 180, 15, 40, 'glass'),
        makeBlock(G, 465, G - 195, 65, 15, 'glass'),
        
        makeBlock(G, 670, G - 180, 15, 40, 'glass'),
        makeBlock(G, 710, G - 180, 15, 40, 'glass'),
        makeBlock(G, 665, G - 195, 65, 15, 'glass'),
      ],
      pigs: () => [
        new Pig(490, G - 25, 22),
        new Pig(690, G - 25, 22),
        new Pig(595, G - 25, 20),
        new Pig(490, G - 165, 16),
        new Pig(690, G - 165, 16),
      ],
    },
  ];
}

function makeBlock(groundY, x, y, w, h, material) {
  const b = new Body(x, y, w, h, 'dynamic', 'block');
  b.material = material;
  switch (material) {
    case 'wood':
      b.health = 80; b.maxHealth = 80; b.mass = (w * h) / 400;
      break;
    case 'stone':
      b.health = 200; b.maxHealth = 200; b.mass = (w * h) / 250;
      break;
    case 'glass':
      b.health = 40; b.maxHealth = 40; b.mass = (w * h) / 600;
      break;
  }
  return b;
}

// ---- GAME STATE ----
const state = {
  phase: 'menu',
  currentLevel: 0,
  score: 0,
  turdsRemaining: 0,
  turds: [],
  currentTurd: null,
  blocks: [],
  pigs: [],
  pullStart: null,
  pullCurrent: null,
  isPulling: false,
  settleTimer: 0,
  levels: null,
  totalScore: 0,
};

function getSlingY() {
  return VIRTUAL_H - GROUND_HEIGHT - SLING_Y_BASE_OFFSET + 50;
}

function loadLevel(index) {
  const levels = state.levels || createLevels();
  state.levels = levels;
  
  if (index >= levels.length) {
    state.phase = 'menu';
    return;
  }
  
  const level = levels[index];
  
  state.currentLevel = index;
  state.turdsRemaining = level.turds;
  state.blocks = level.blocks();
  state.pigs = level.pigs();
  state.turds = [];
  state.currentTurd = null;
  state.isPulling = false;
  state.settleTimer = 0;
  state.phase = 'aiming';
  state.score = 0;
  
  spawnNextTurd();
  
  document.getElementById('hud').style.display = 'flex';
  document.getElementById('menu-overlay').style.display = 'none';
  document.getElementById('level-complete').style.display = 'none';
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('soundToggle').style.display = 'flex';
  updateHUD();
}

function spawnNextTurd() {
  if (state.turdsRemaining <= 0) return;
  const slingY = getSlingY();
  const turd = new Turd(SLING_X, slingY - 48);
  state.currentTurd = turd;
  state.turds.push(turd);
  state.turdsRemaining--;
  state.phase = 'aiming';
  updateHUD();
}

function updateHUD() {
  document.getElementById('scoreDisplay').textContent = `Score: ${state.score}`;
  document.getElementById('levelDisplay').textContent = `Level ${state.currentLevel + 1}`;
  
  const turdsDiv = document.getElementById('turdsDisplay');
  turdsDiv.innerHTML = '';
  const total = (state.levels[state.currentLevel]?.turds || 0);
  const used = total - state.turdsRemaining - (state.currentTurd ? 1 : 0);
  for (let i = 0; i < total; i++) {
    const icon = document.createElement('div');
    icon.className = 'turd-icon' + (i >= used ? ' active' : '');
    turdsDiv.appendChild(icon);
  }
}

// ---- INPUT (converted to virtual coords) ----
const mouse = { x: 0, y: 0, down: false };

function getVirtualPos(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  return screenToVirtual(sx, sy);
}

canvas.addEventListener('mousedown', (e) => {
  initAudio();
  const pos = getVirtualPos(e.clientX, e.clientY);
  mouse.x = pos.x;
  mouse.y = pos.y;
  mouse.down = true;
  
  if (state.phase === 'aiming' && state.currentTurd) {
    const turd = state.currentTurd;
    const dx = mouse.x - turd.x;
    const dy = mouse.y - turd.y;
    if (Math.sqrt(dx * dx + dy * dy) < 60) {
      state.isPulling = true;
      state.pullStart = { x: turd.x, y: turd.y };
    }
  }
});

canvas.addEventListener('mousemove', (e) => {
  const pos = getVirtualPos(e.clientX, e.clientY);
  mouse.x = pos.x;
  mouse.y = pos.y;
});

canvas.addEventListener('mouseup', () => {
  mouse.down = false;
  releaseSling();
});

// Touch support — large touch targets for iPhone
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  initAudio();
  const touch = e.touches[0];
  const pos = getVirtualPos(touch.clientX, touch.clientY);
  mouse.x = pos.x;
  mouse.y = pos.y;
  mouse.down = true;
  
  if (state.phase === 'aiming' && state.currentTurd) {
    const turd = state.currentTurd;
    const dx = mouse.x - turd.x;
    const dy = mouse.y - turd.y;
    // 90px touch radius in virtual coords for easy mobile grab
    if (Math.sqrt(dx * dx + dy * dy) < 90) {
      state.isPulling = true;
      state.pullStart = { x: turd.x, y: turd.y };
    }
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const pos = getVirtualPos(touch.clientX, touch.clientY);
  mouse.x = pos.x;
  mouse.y = pos.y;
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  mouse.down = false;
  releaseSling();
}, { passive: false });

function releaseSling() {
  if (state.isPulling && state.currentTurd) {
    const turd = state.currentTurd;
    const slingY = getSlingY();
    const dx = SLING_X - turd.x;
    const dy = (slingY - 48) - turd.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 10) {
      turd.vx = dx * SLING_POWER;
      turd.vy = dy * SLING_POWER;
      turd.launched = true;
      state.phase = 'flying';
      playLaunch();
    } else {
      turd.x = SLING_X;
      turd.y = slingY - 48;
    }
    state.isPulling = false;
  }
}

// ---- COLLISION DETECTION ----
function circleRectCollision(cx, cy, cr, rx, ry, rw, rh) {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) < (cr * cr);
}

function resolveCircleRect(turd, block) {
  const cx = turd.x, cy = turd.y, cr = turd.radius;
  const rx = block.x, ry = block.y, rw = block.w, rh = block.h;
  
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist === 0) return;
  
  const overlap = cr - dist;
  const nx = dx / dist;
  const ny = dy / dist;
  
  turd.x += nx * overlap;
  turd.y += ny * overlap;
  
  const relVel = turd.vx * nx + turd.vy * ny;
  if (relVel > 0) return;
  
  const restitution = 0.3;
  const j = -(1 + restitution) * relVel;
  
  turd.vx += j * nx * 0.7;
  turd.vy += j * ny * 0.7;
  
  if (block.type !== 'static') {
    block.vx -= j * nx * 0.3 * (turd.mass / block.mass);
    block.vy -= j * ny * 0.3 * (turd.mass / block.mass);
    block.angularVel += (Math.random() - 0.5) * 0.5;
  }
  
  const impactSpeed = Math.abs(relVel);
  if (impactSpeed > DAMAGE_THRESHOLD) {
    const damage = impactSpeed * 1.2;
    if (block.applyDamage(damage)) {
      state.score += block.material === 'stone' ? 500 : block.material === 'wood' ? 300 : 200;
      emitParticles(block.cx, block.cy, 15, {
        spread: 250, speed: 180, life: 0.6, lifeVar: 0.3,
        colors: block.material === 'wood' ? ['#F5F0EB', '#D4C5B2', '#EDE4DA', '#B5A48E'] :
                block.material === 'stone' ? ['#888', '#666', '#aaa'] :
                ['#A0D8EF', '#80C0E0', '#C0E8FF'],
        size: 3, sizeVar: 4
      });
      playBreak();
      updateHUD();
    } else {
      playImpact();
    }
  }
}

function resolveCircleCircle(turd, pig) {
  const dx = pig.x - turd.x;
  const dy = pig.y - turd.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = turd.radius + pig.size;
  
  if (dist >= minDist || dist === 0) return false;
  
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  
  turd.x -= nx * overlap * 0.5;
  turd.y -= ny * overlap * 0.5;
  pig.x += nx * overlap * 0.5;
  pig.y += ny * overlap * 0.5;
  
  const relVel = (turd.vx - pig.vx) * nx + (turd.vy - pig.vy) * ny;
  if (relVel < 0) return false;
  
  const j = relVel * 1.5;
  turd.vx -= j * nx * 0.5;
  turd.vy -= j * ny * 0.5;
  pig.vx += j * nx * 1.0;
  pig.vy += j * ny * 1.0;
  
  const impactSpeed = Math.abs(relVel);
  const damage = impactSpeed * 1.5;
  if (pig.applyDamage(damage)) {
    state.score += 1000;
    emitParticles(pig.x, pig.y, 15, {
      spread: 250, speed: 200, life: 0.6, lifeVar: 0.3,
      colors: ['#4CAF50', '#388E3C', '#66BB6A', '#fff'],
      size: 3, sizeVar: 4
    });
    playPigSqueal();
    updateHUD();
    return true;
  }
  playImpact();
  return false;
}

function blockBlockCollision(a, b) {
  if (a.destroyed || b.destroyed) return;
  if (a.type === 'static' && b.type === 'static') return;
  
  const overlapX = Math.min(a.x + a.w - b.x, b.x + b.w - a.x);
  const overlapY = Math.min(a.y + a.h - b.y, b.y + b.h - a.y);
  
  if (overlapX <= 0 || overlapY <= 0) return;
  
  if (overlapX < overlapY) {
    const sign = a.cx < b.cx ? -1 : 1;
    if (a.type !== 'static') a.x += sign * overlapX * 0.5;
    if (b.type !== 'static') b.x -= sign * overlapX * 0.5;
    if (a.type !== 'static') a.vx = -a.vx * 0.3;
    if (b.type !== 'static') b.vx = -b.vx * 0.3;
  } else {
    const sign = a.cy < b.cy ? -1 : 1;
    if (a.type !== 'static') a.y += sign * overlapY * 0.5;
    if (b.type !== 'static') b.y -= sign * overlapY * 0.5;
    if (a.type !== 'static') a.vy = -a.vy * 0.3;
    if (b.type !== 'static') b.vy = -b.vy * 0.3;
  }
}

function blockGroundCollision(block) {
  if (block.destroyed || block.type === 'static') return;
  const groundY = VIRTUAL_H - GROUND_HEIGHT;
  
  if (block.y + block.h > groundY) {
    const impact = Math.abs(block.vy);
    block.y = groundY - block.h;
    block.vy *= -0.2;
    block.vx *= 0.7;
    block.angularVel *= 0.5;
    if (Math.abs(block.vy) < 5) block.vy = 0;
    if (Math.abs(block.vx) < 2) block.vx = 0;
    
    if (impact > 80) {
      block.applyDamage(impact * 0.3);
      if (block.destroyed) {
        state.score += block.material === 'stone' ? 500 : block.material === 'wood' ? 300 : 200;
        emitParticles(block.cx, block.cy, 8, {
          spread: 150, speed: 100, life: 0.4,
          colors: block.material === 'wood' ? ['#F5F0EB', '#D4C5B2'] : ['#888', '#666'],
          size: 2, sizeVar: 2
        });
        playBreak();
        updateHUD();
      }
    }
  }
  
  // Side boundaries (virtual coords)
  if (block.x < 0) { block.x = 0; block.vx *= -0.3; }
  if (block.x + block.w > VIRTUAL_W) { block.x = VIRTUAL_W - block.w; block.vx *= -0.3; }
}

function blockPigCollision(block, pig) {
  if (block.destroyed || pig.destroyed) return;
  
  const cx = pig.x, cy = pig.y, cr = pig.size;
  const rx = block.x, ry = block.y, rw = block.w, rh = block.h;
  
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;
  
  if (distSq >= cr * cr) return;
  
  const dist = Math.sqrt(distSq) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = cr - dist;
  
  pig.x += nx * overlap;
  pig.y += ny * overlap;
  
  const relSpeed = Math.abs(block.vx * nx + block.vy * ny) + Math.abs(block.vy) * 0.3;
  if (relSpeed > 15) {
    const damage = relSpeed * 1.0;
    if (pig.applyDamage(damage)) {
      state.score += 1000;
      emitParticles(pig.x, pig.y, 12, {
        spread: 200, speed: 150, life: 0.5,
        colors: ['#4CAF50', '#388E3C', '#66BB6A'],
        size: 3, sizeVar: 3
      });
      playPigSqueal();
      updateHUD();
    }
  }
}

// ---- UPDATE ----
function update(dt) {
  if (state.phase === 'menu') return;
  
  // Update pulling
  if (state.isPulling && state.currentTurd) {
    const slingY = getSlingY();
    const dx = mouse.x - SLING_X;
    const dy = mouse.y - (slingY - 48);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, MAX_PULL);
    const angle = Math.atan2(dy, dx);
    state.currentTurd.x = SLING_X + Math.cos(angle) * clamped;
    state.currentTurd.y = (slingY - 48) + Math.sin(angle) * clamped;
  }
  
  // Update turds
  for (const turd of state.turds) {
    turd.update(dt);
    
    if (turd.launched && turd.active) {
      // Ground collision for turd (virtual coords)
      const groundY = VIRTUAL_H - GROUND_HEIGHT;
      if (turd.y + turd.radius > groundY) {
        turd.y = groundY - turd.radius;
        turd.vy *= -0.3;
        turd.vx *= 0.7;
        
        if (Math.abs(turd.vy) < 15 && Math.abs(turd.vx) < 15) {
          if (!turd.splatted) {
            turd.splatted = true;
            playSplat();
            emitParticles(turd.x, turd.y + turd.radius, 8, {
              spread: 120, speed: 60, life: 0.4, lifeVar: 0.2,
              colors: ['#6B4226', '#5C3A1E', '#8B5E3C'],
              size: 3, sizeVar: 3
            });
          }
          turd.active = false;
        }
      }
      
      // Block collisions
      for (const block of state.blocks) {
        if (block.destroyed) continue;
        if (circleRectCollision(turd.x, turd.y, turd.radius, block.x, block.y, block.w, block.h)) {
          resolveCircleRect(turd, block);
        }
      }
      
      // Pig collisions
      for (const pig of state.pigs) {
        if (pig.destroyed) continue;
        const pdx = pig.x - turd.x;
        const pdy = pig.y - turd.y;
        if (Math.sqrt(pdx * pdx + pdy * pdy) < turd.radius + pig.size) {
          resolveCircleCircle(turd, pig);
        }
      }
    }
  }
  
  // Update blocks
  for (const block of state.blocks) {
    block.update(dt);
    blockGroundCollision(block);
  }
  
  // Block-block collisions
  for (let i = 0; i < state.blocks.length; i++) {
    for (let j = i + 1; j < state.blocks.length; j++) {
      if (state.blocks[i].destroyed || state.blocks[j].destroyed) continue;
      const a = state.blocks[i], b = state.blocks[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        blockBlockCollision(a, b);
      }
    }
  }
  
  // Block-pig collisions
  for (const block of state.blocks) {
    for (const pig of state.pigs) {
      blockPigCollision(block, pig);
    }
  }
  
  // Update pigs
  for (const pig of state.pigs) {
    pig.update(dt);
  }
  
  // Update particles
  for (const p of particles) {
    if (p.active) p.update(dt);
  }
  
  // Check for settling after flying
  if (state.phase === 'flying') {
    const turd = state.currentTurd;
    if (!turd || !turd.active) {
      state.phase = 'settling';
      state.settleTimer = 0;
    }
  }
  
  if (state.phase === 'settling') {
    state.settleTimer += dt;
    
    let allSettled = true;
    for (const block of state.blocks) {
      if (!block.destroyed && block.speed > MIN_VELOCITY) {
        allSettled = false;
        break;
      }
    }
    for (const pig of state.pigs) {
      if (!pig.destroyed && (Math.abs(pig.vx) > MIN_VELOCITY || Math.abs(pig.vy) > MIN_VELOCITY)) {
        allSettled = false;
        break;
      }
    }
    
    if (allSettled || state.settleTimer > SETTLE_TIME) {
      const pigsAlive = state.pigs.filter(p => !p.destroyed).length;
      
      if (pigsAlive === 0) {
        state.score += state.turdsRemaining * 2000;
        showLevelComplete();
        return;
      }
      
      if (state.turdsRemaining > 0) {
        spawnNextTurd();
      } else {
        showGameOver();
      }
    }
  }
}

// ---- RENDER ----
function render() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  
  // Clear the whole physical canvas
  const vv = window.visualViewport;
  const screenW = vv ? vv.width : window.innerWidth;
  const screenH = vv ? vv.height : window.innerHeight;
  ctx.clearRect(0, 0, screenW, screenH);
  
  // Fill letterbox areas with dark color
  ctx.fillStyle = '#1a0e05';
  ctx.fillRect(0, 0, screenW, screenH);
  
  // Apply virtual coordinate transform
  applyVirtualTransform();
  
  drawBackground(ctx);
  
  if (state.phase === 'menu') return;
  
  const slingY = getSlingY();
  
  // Draw back of slingshot
  drawSlingshotBack(ctx, SLING_X, slingY);
  
  // Draw slingshot band (back)
  if (state.isPulling && state.currentTurd) {
    ctx.strokeStyle = '#4A2E18';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(SLING_X - 14, slingY - 42);
    ctx.lineTo(state.currentTurd.x, state.currentTurd.y);
    ctx.stroke();
  }
  
  // Draw blocks
  for (const block of state.blocks) {
    drawBlock(ctx, block);
  }
  
  // Draw pigs
  for (const pig of state.pigs) {
    pig.draw(ctx);
  }
  
  // Draw turds
  for (const turd of state.turds) {
    turd.draw(ctx);
  }
  
  // Draw front of slingshot
  drawSlingshotFront(ctx, SLING_X, slingY);
  
  // Front band
  if (state.isPulling && state.currentTurd) {
    ctx.strokeStyle = '#6B4226';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(SLING_X + 14, slingY - 42);
    ctx.lineTo(state.currentTurd.x, state.currentTurd.y);
    ctx.stroke();
    
    // Trajectory
    const dx = SLING_X - state.currentTurd.x;
    const dy = (slingY - 48) - state.currentTurd.y;
    drawTrajectory(ctx, state.currentTurd.x, state.currentTurd.y, dx * SLING_POWER, dy * SLING_POWER);
  }
  
  // Draw particles on top
  for (const p of particles) {
    if (p.active) p.draw(ctx);
  }
  
  // Draw aiming hint
  if (state.phase === 'aiming' && state.currentTurd && !state.isPulling) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Drag the turd to aim', SLING_X, slingY + 50);
  }
}

// ---- UI FUNCTIONS ----
function showLevelComplete() {
  state.phase = 'levelComplete';
  playWin();
  
  const overlay = document.getElementById('level-complete');
  overlay.style.display = 'flex';
  
  document.getElementById('completionScore').textContent = `Score: ${state.score}`;
  
  const maxScore = state.pigs.length * 1000 + state.blocks.length * 300 + (state.levels[state.currentLevel].turds) * 2000;
  const pct = state.score / maxScore;
  const stars = pct > 0.7 ? 3 : pct > 0.4 ? 2 : 1;
  
  const starEls = document.querySelectorAll('.star');
  starEls.forEach((el, i) => {
    el.className = 'star' + (i < stars ? ' earned' : '');
  });
  
  document.getElementById('nextLevelBtn').style.display = 
    state.currentLevel < (state.levels.length - 1) ? 'inline-block' : 'none';
}

function showGameOver() {
  state.phase = 'gameOver';
  playLose();
  
  document.getElementById('game-over').style.display = 'flex';
  document.getElementById('gameOverScore').textContent = `Score: ${state.score}`;
}

// ---- BUTTON HANDLERS ----
document.getElementById('startBtn').addEventListener('click', () => {
  initAudio();
  loadLevel(0);
});

document.getElementById('nextLevelBtn').addEventListener('click', () => {
  state.totalScore += state.score;
  loadLevel(state.currentLevel + 1);
});

document.getElementById('replayBtn').addEventListener('click', () => {
  loadLevel(state.currentLevel);
});

document.getElementById('retryBtn').addEventListener('click', () => {
  loadLevel(state.currentLevel);
});

document.getElementById('menuBtn').addEventListener('click', () => {
  state.phase = 'menu';
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('menu-overlay').style.display = 'flex';
  document.getElementById('soundToggle').style.display = 'none';
});

// ---- DEBUG OVERLAY ----
let _frames = 0, _last = performance.now(), _fps = 0, _ft = 0, _prev = 0;
function updateDebug() {
  _frames++;
  const n = performance.now();
  _ft = n - (_prev || n);
  _prev = n;
  if (n - _last >= 1000) {
    _fps = (_frames * 1000) / (n - _last);
    _frames = 0;
    _last = n;
  }
}
let debugVisible = false;
function drawDebug(ctx) {
  if (!debugVisible) return;
  // Draw debug in virtual coords (already transformed)
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.fillRect(0, VIRTUAL_H - 22, 200, 22);
  ctx.font = '11px monospace';
  ctx.fillStyle = _fps < 30 ? '#f44' : '#0f0';
  ctx.fillText(`FPS:${_fps.toFixed(0)} ${_ft.toFixed(1)}ms  Scale:${scale.toFixed(2)}`, 6, VIRTUAL_H - 7);
  ctx.restore();
}
document.addEventListener('keydown', (e) => { if (e.key === 'd' || e.key === 'D') debugVisible = !debugVisible; });

// ---- GAME LOOP ----
const TICK_RATE = 1000 / 60;
let lastTime = 0;
let accumulator = 0;

function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);
  
  const deltaTime = timestamp - lastTime;
  lastTime = timestamp;
  accumulator += Math.min(deltaTime, 100);
  
  while (accumulator >= TICK_RATE) {
    update(TICK_RATE / 1000);
    accumulator -= TICK_RATE;
  }
  
  render();
  updateDebug();
  drawDebug(ctx);
}

requestAnimationFrame(gameLoop);

// ---- DETERMINISTIC HOOK ----
window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) update(1 / 60);
  render();
};

window.render_game_to_text = () => {
  return JSON.stringify({
    phase: state.phase,
    level: state.currentLevel,
    score: state.score,
    turdsRemaining: state.turdsRemaining,
    currentTurd: state.currentTurd ? {
      x: Math.round(state.currentTurd.x),
      y: Math.round(state.currentTurd.y),
      launched: state.currentTurd.launched,
      active: state.currentTurd.active,
      radius: state.currentTurd.radius,
    } : null,
    pigsAlive: state.pigs.filter(p => !p.destroyed).length,
    pigsTotal: state.pigs.length,
    blocksAlive: state.blocks.filter(b => !b.destroyed).length,
    blocksTotal: state.blocks.length,
    virtualSize: { w: VIRTUAL_W, h: VIRTUAL_H },
    scale: scale.toFixed(2),
  });
};
