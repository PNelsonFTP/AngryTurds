// ============================================================
// ANGRY TURDS v3 — Professional Mobile-First Game
// ============================================================
// Virtual world: 960×540, scaled to fill screen edge-to-edge
// All game objects ~2x bigger than v1 for mobile visibility

// ---- VIRTUAL COORDINATE SYSTEM ----
const VW = 960;
const VH = 540;

// ---- GAME CONSTANTS ----
const GRAVITY = 500;
const GROUND_H = 55;             // ground strip height
const SLING_X = 155;             // slingshot X position
const SLING_POWER = 4.0;
const MAX_PULL = 120;
const MIN_VELOCITY = 8;
const DAMAGE_THRESHOLD = 12;
const SETTLE_TIME = 2.5;
const TURD_RADIUS = 28;          // big chunky turds
const PIG_SIZE_DEFAULT = 32;     // big visible pigs
const BLOCK_TYPES = { TP: 'tp', STONE: 'stone', GLASS: 'glass' };

// ---- ORIENTATION STATE ----
let portraitDismissed = false;

// ---- CANVAS & SCALING ----
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let scale = 1;
let offX = 0;
let offY = 0;
let canvasW = 0;
let canvasH = 0;

function resize() {
  // Use dvh-aware sizing
  const vv = window.visualViewport;
  const sw = vv ? vv.width : window.innerWidth;
  const sh = vv ? vv.height : window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  canvasW = sw;
  canvasH = sh;
  canvas.width = Math.round(sw * dpr);
  canvas.height = Math.round(sh * dpr);
  canvas.style.width = sw + 'px';
  canvas.style.height = sh + 'px';

  // FILL the screen — scale to cover, NOT contain (no letterboxing)
  const scaleX = sw / VW;
  const scaleY = sh / VH;
  scale = Math.max(scaleX, scaleY); // cover, not contain

  // Center the virtual area
  offX = (sw - VW * scale) / 2;
  offY = (sh - VH * scale) / 2;

  // Check orientation for hint
  checkOrientation(sw, sh);
}

resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}

// Scroll to hide address bar on mobile
setTimeout(() => window.scrollTo(0, 1), 100);
setTimeout(() => window.scrollTo(0, 0), 300);

function screenToVirtual(sx, sy) {
  return {
    x: (sx - offX) / scale,
    y: (sy - offY) / scale,
  };
}

function beginVirtualFrame() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvasW, canvasH);
  // Fill with bg color (covers any letterbox areas)
  ctx.fillStyle = '#1a0e05';
  ctx.fillRect(0, 0, canvasW, canvasH);
  // Apply virtual transform
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);
}

// ---- ORIENTATION HINT ----
function checkOrientation(sw, sh) {
  const isPortrait = sh > sw * 1.2;
  const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const hint = document.getElementById('rotate-hint');
  if (isPortrait && isMobile && !portraitDismissed) {
    hint.style.display = 'flex';
  } else {
    hint.style.display = 'none';
  }
}

document.getElementById('playAnywayBtn').addEventListener('click', () => {
  portraitDismissed = true;
  document.getElementById('rotate-hint').style.display = 'none';
});

// Show "add to home screen" hint on iOS Safari
if (window.navigator.standalone === false) {
  document.getElementById('fs-prompt').style.display = 'block';
}

// ---- AUDIO ----
let audioCtx = null;
let soundEnabled = true;

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function sfx(freq, dur = 0.12, type = 'square', vol = 0.15) {
  if (!audioCtx || !soundEnabled) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch(e) {}
}

const playLaunch = () => { sfx(180,0.2,'sawtooth',0.12); setTimeout(()=>sfx(120,0.15,'sawtooth',0.08),80); };
const playImpact = () => { sfx(80,0.15,'triangle',0.2); sfx(60,0.2,'sawtooth',0.1); };
const playBreak = () => { sfx(200,0.08,'square',0.15); setTimeout(()=>sfx(300,0.06,'square',0.1),50); };
const playPigSqueal = () => { sfx(600,0.15,'sine',0.12); setTimeout(()=>sfx(500,0.12,'sine',0.1),80); };
const playWin = () => { [400,500,600,800].forEach((f,i)=>setTimeout(()=>sfx(f,0.2,'sine',0.12),i*120)); };
const playLose = () => { [300,250,200,150].forEach((f,i)=>setTimeout(()=>sfx(f,0.25,'triangle',0.1),i*150)); };
const playSplat = () => { sfx(100,0.3,'sawtooth',0.15); sfx(150,0.2,'triangle',0.1); };

document.getElementById('soundToggle').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  document.getElementById('soundToggle').textContent = soundEnabled ? '🔊' : '🔇';
});

// ---- PARTICLE SYSTEM ----
class Particle {
  constructor() { this.active = false; }
  init(x,y,vx,vy,life,color,size) {
    Object.assign(this, {x,y,vx,vy,life,maxLife:life,color,size,active:true});
  }
  update(dt) {
    this.x += this.vx*dt; this.y += this.vy*dt;
    this.vy += 300*dt; this.life -= dt;
    if (this.life <= 0) this.active = false;
  }
  draw(c) {
    const a = Math.max(0, this.life/this.maxLife);
    c.globalAlpha = a;
    c.fillStyle = this.color;
    c.beginPath();
    c.arc(this.x, this.y, this.size*(0.5+0.5*a), 0, Math.PI*2);
    c.fill();
    c.globalAlpha = 1;
  }
}

const particles = Array.from({length:300}, ()=>new Particle());

function emitP(x,y,count,cfg) {
  let n = 0;
  for (const p of particles) {
    if (!p.active && n < count) {
      p.init(x,y,
        (Math.random()-0.5)*cfg.spread,
        -Math.random()*cfg.speed - cfg.speed*0.3,
        cfg.life + Math.random()*(cfg.lifeVar||0.3),
        cfg.colors ? cfg.colors[Math.floor(Math.random()*cfg.colors.length)] : cfg.color,
        cfg.size + Math.random()*(cfg.sizeVar||2)
      );
      n++;
    }
  }
}

// ---- PHYSICS BODY (blocks) ----
class Body {
  constructor(x,y,w,h,type='dynamic') {
    Object.assign(this, {x,y,w,h,vx:0,vy:0,angle:0,angularVel:0,type,
      mass: type==='static' ? Infinity : (w*h)/400,
      health:100, maxHealth:100, destroyed:false, material:'tp'});
  }
  get cx() { return this.x+this.w/2; }
  get cy() { return this.y+this.h/2; }
  get speed() { return Math.sqrt(this.vx*this.vx+this.vy*this.vy); }
  update(dt) {
    if (this.type==='static'||this.destroyed) return;
    this.vy += GRAVITY*dt;
    this.x += this.vx*dt; this.y += this.vy*dt;
    this.angle += this.angularVel*dt;
    this.vx *= 0.995; this.angularVel *= 0.98;
  }
  applyDamage(amt) {
    this.health -= amt;
    if (this.health<=0) { this.destroyed=true; return true; }
    return false;
  }
}

// ---- TURD (big chunky poop projectile) ----
class Turd {
  constructor(x,y) {
    Object.assign(this, {x,y,vx:0,vy:0,radius:TURD_RADIUS,mass:5,
      launched:false,active:true,trail:[],rotation:0,squish:1,splatted:false});
  }
  update(dt) {
    if (!this.launched||!this.active) return;
    this.vy += GRAVITY*dt;
    this.x += this.vx*dt; this.y += this.vy*dt;
    this.rotation += 3*dt;
    if (Math.random()<0.5) this.trail.push({x:this.x,y:this.y,life:0.5,max:0.5});
    this.trail = this.trail.filter(t => { t.life -= dt; return t.life > 0; });
    if (this.x>VW+100||this.y>VH+100||this.x<-200) this.active = false;
  }
  draw(c) {
    for (const t of this.trail) {
      const a = t.life/t.max;
      c.globalAlpha = a*0.35; c.fillStyle = '#5C3A1E';
      c.beginPath(); c.arc(t.x,t.y,this.radius*0.3*a,0,Math.PI*2); c.fill();
    }
    c.globalAlpha = 1;
    if (!this.active) return;
    c.save(); c.translate(this.x,this.y); c.rotate(this.rotation); c.scale(1,this.squish);
    drawPoop(c, 0, 0, this.radius);
    c.restore();
  }
  get speed() { return Math.sqrt(this.vx*this.vx+this.vy*this.vy); }
}

function drawPoop(c,x,y,s) {
  // Shadow
  c.fillStyle = 'rgba(0,0,0,0.12)';
  c.beginPath(); c.ellipse(x,y+s*0.85,s*0.85,s*0.25,0,0,Math.PI*2); c.fill();
  // Base
  c.fillStyle = '#6B4226';
  c.beginPath(); c.ellipse(x,y+s*0.25,s*0.8,s*0.5,0,0,Math.PI*2); c.fill();
  // Middle
  c.fillStyle = '#7B5230';
  c.beginPath(); c.ellipse(x,y-s*0.05,s*0.6,s*0.42,0,0,Math.PI*2); c.fill();
  // Top
  c.fillStyle = '#8B6240';
  c.beginPath(); c.ellipse(x+s*0.05,y-s*0.38,s*0.38,s*0.32,-0.2,0,Math.PI*2); c.fill();
  // Tip
  c.fillStyle = '#8B6240';
  c.beginPath(); c.ellipse(x+s*0.1,y-s*0.65,s*0.18,s*0.18,-0.3,0,Math.PI*2); c.fill();
  // Highlight
  c.fillStyle = 'rgba(255,255,255,0.15)';
  c.beginPath(); c.ellipse(x-s*0.12,y-s*0.22,s*0.12,s*0.16,-0.4,0,Math.PI*2); c.fill();
  // Eyes
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(x-s*0.18,y-s*0.12,s*0.15,0,Math.PI*2); c.arc(x+s*0.18,y-s*0.12,s*0.15,0,Math.PI*2); c.fill();
  c.fillStyle = '#1a0e05';
  c.beginPath(); c.arc(x-s*0.16,y-s*0.1,s*0.07,0,Math.PI*2); c.arc(x+s*0.2,y-s*0.1,s*0.07,0,Math.PI*2); c.fill();
  // Angry brows
  c.strokeStyle = '#3A2410'; c.lineWidth = Math.max(2, s*0.08);
  c.beginPath(); c.moveTo(x-s*0.32,y-s*0.3); c.lineTo(x-s*0.06,y-s*0.24); c.stroke();
  c.beginPath(); c.moveTo(x+s*0.32,y-s*0.3); c.lineTo(x+s*0.06,y-s*0.24); c.stroke();
}

// ---- PIG ----
class Pig {
  constructor(x,y,size=PIG_SIZE_DEFAULT) {
    Object.assign(this, {x,y,size,vx:0,vy:0,health:100,maxHealth:100,
      destroyed:false,mass:2.5,expression:'normal'});
  }
  update(dt) {
    if (this.destroyed) return;
    this.vy += GRAVITY*dt;
    this.x += this.vx*dt; this.y += this.vy*dt;
    this.vx *= 0.98;
    const gy = VH-GROUND_H;
    if (this.y+this.size>gy) {
      this.y = gy-this.size; this.vy *= -0.2; this.vx *= 0.8;
      if (Math.abs(this.vy)<5) this.vy = 0;
    }
    if (this.health<50) this.expression = 'worried';
    if (this.health<=0) { this.expression = 'dead'; this.destroyed = true; }
  }
  draw(c) {
    if (this.destroyed) return;
    const s = this.size;
    // Shadow
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.beginPath(); c.ellipse(this.x,this.y+s*1.05,s*0.75,s*0.18,0,0,Math.PI*2); c.fill();
    // Body
    const g = c.createRadialGradient(this.x-s*0.2,this.y-s*0.2,s*0.1,this.x,this.y,s);
    g.addColorStop(0,'#7BC67E'); g.addColorStop(1,'#4A8B4C');
    c.fillStyle = g; c.beginPath(); c.arc(this.x,this.y,s,0,Math.PI*2); c.fill();
    c.strokeStyle = '#3A6B3C'; c.lineWidth = 2; c.stroke();
    // Ears
    c.fillStyle = '#5A9B5C';
    c.beginPath(); c.ellipse(this.x-s*0.72,this.y-s*0.52,s*0.22,s*0.32,-0.3,0,Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(this.x+s*0.72,this.y-s*0.52,s*0.22,s*0.32,0.3,0,Math.PI*2); c.fill();
    // Snout
    c.fillStyle = '#5A9B5C';
    c.beginPath(); c.ellipse(this.x,this.y+s*0.15,s*0.36,s*0.28,0,0,Math.PI*2); c.fill();
    c.fillStyle = '#3A6B3C';
    c.beginPath(); c.arc(this.x-s*0.1,this.y+s*0.15,s*0.07,0,Math.PI*2); c.arc(this.x+s*0.1,this.y+s*0.15,s*0.07,0,Math.PI*2); c.fill();
    // Eyes
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(this.x-s*0.24,this.y-s*0.18,s*0.18,0,Math.PI*2); c.arc(this.x+s*0.24,this.y-s*0.18,s*0.18,0,Math.PI*2); c.fill();
    if (this.expression==='worried') {
      c.fillStyle = '#222';
      c.beginPath(); c.arc(this.x-s*0.24,this.y-s*0.13,s*0.09,0,Math.PI*2); c.arc(this.x+s*0.24,this.y-s*0.13,s*0.09,0,Math.PI*2); c.fill();
      c.strokeStyle='#333'; c.lineWidth=2;
      c.beginPath(); c.moveTo(this.x-s*0.38,this.y-s*0.38); c.lineTo(this.x-s*0.08,this.y-s*0.42); c.stroke();
      c.beginPath(); c.moveTo(this.x+s*0.38,this.y-s*0.38); c.lineTo(this.x+s*0.08,this.y-s*0.42); c.stroke();
    } else {
      c.fillStyle = '#222';
      c.beginPath(); c.arc(this.x-s*0.24,this.y-s*0.18,s*0.09,0,Math.PI*2); c.arc(this.x+s*0.24,this.y-s*0.18,s*0.09,0,Math.PI*2); c.fill();
    }
    // Health bar
    if (this.health<this.maxHealth && this.health>0) {
      const bw=s*1.6, bh=5, bx=this.x-bw/2, by=this.y-s-10;
      c.fillStyle='rgba(0,0,0,0.4)'; c.fillRect(bx,by,bw,bh);
      const pct=this.health/this.maxHealth;
      c.fillStyle = pct>0.5?'#4CAF50':pct>0.25?'#FF9800':'#E53935';
      c.fillRect(bx,by,bw*pct,bh);
    }
  }
  applyDamage(amt) {
    this.health -= amt;
    if (this.health<=0) { this.destroyed = true; return true; }
    return false;
  }
}

// ---- BLOCK DRAWING ----
function drawBlock(c, b) {
  if (b.destroyed) return;
  const {w,h} = b;
  const dmg = 1 - b.health/b.maxHealth;
  c.save(); c.translate(b.cx, b.cy); c.rotate(b.angle);

  if (b.material === BLOCK_TYPES.TP) {
    drawTPRoll(c,w,h,dmg);
  } else if (b.material === BLOCK_TYPES.STONE) {
    const v = Math.round(140-dmg*30);
    c.fillStyle = `rgb(${v},${v},${v+10})`;
    c.fillRect(-w/2,-h/2,w,h);
    c.strokeStyle='#666'; c.lineWidth=2; c.strokeRect(-w/2,-h/2,w,h);
    c.fillStyle='#aaa'; c.fillRect(-w/2+2,-h/2+2,w-4,3);
    if (dmg>0.3) { c.strokeStyle='rgba(0,0,0,0.3)'; c.lineWidth=1; c.beginPath(); c.moveTo(-w*0.3,-h*0.4); c.lineTo(w*0.1,h*0.1); c.lineTo(w*0.3,h*0.4); c.stroke(); }
    if (dmg>0.6) { c.beginPath(); c.moveTo(w*0.2,-h*0.3); c.lineTo(-w*0.1,h*0.2); c.stroke(); }
  } else { // glass
    c.fillStyle = `rgba(${160-dmg*40},${210-dmg*40},${240-dmg*40},0.8)`;
    c.fillRect(-w/2,-h/2,w,h);
    c.strokeStyle='rgba(80,150,200,0.6)'; c.lineWidth=1.5; c.strokeRect(-w/2,-h/2,w,h);
    c.fillStyle='rgba(200,235,255,0.9)'; c.fillRect(-w/2+2,-h/2+2,w-4,3);
    if (dmg>0.3) { c.strokeStyle='rgba(0,0,0,0.25)'; c.lineWidth=1; c.beginPath(); c.moveTo(-w*0.25,-h*0.35); c.lineTo(w*0.15,h*0.15); c.stroke(); }
  }
  c.restore();
}

function drawTPRoll(c,w,h,dmg) {
  const r = Math.round(255-dmg*50), g = Math.round(250-dmg*60), b = Math.round(245-dmg*50);
  c.fillStyle = `rgb(${r},${g},${b})`;
  c.fillRect(-w/2,-h/2,w,h);
  // Paper texture lines
  c.strokeStyle = `rgba(200,190,180,${0.3-dmg*0.1})`; c.lineWidth = 0.6;
  for (let ly=-h/2+5; ly<h/2; ly+=5) { c.beginPath(); c.moveTo(-w/2,ly); c.lineTo(w/2,ly); c.stroke(); }
  // Perforated line
  c.setLineDash([3,3]);
  c.strokeStyle = `rgba(180,170,160,${0.5-dmg*0.2})`; c.lineWidth = 0.8;
  if (w>h) { c.beginPath(); c.moveTo(0,-h/2); c.lineTo(0,h/2); c.stroke(); }
  else { c.beginPath(); c.moveTo(-w/2,0); c.lineTo(w/2,0); c.stroke(); }
  c.setLineDash([]);
  // Cardboard tube ends
  const tubeClr = `rgb(${180-dmg*30},${155-dmg*25},${120-dmg*20})`;
  if (w>h && h>8) {
    c.fillStyle=tubeClr;
    c.beginPath(); c.ellipse(-w/2,0,4,h/2-1,0,0,Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(w/2,0,4,h/2-1,0,0,Math.PI*2); c.fill();
  } else if (w>8) {
    c.fillStyle=tubeClr;
    c.beginPath(); c.ellipse(0,-h/2,w/2-1,4,0,0,Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(0,h/2,w/2-1,4,0,0,Math.PI*2); c.fill();
  }
  c.strokeStyle='rgba(180,170,160,0.5)'; c.lineWidth=1; c.strokeRect(-w/2,-h/2,w,h);
  c.fillStyle='rgba(255,255,255,0.18)'; c.fillRect(-w/2+1,-h/2+1,w-2,2.5);
  // Damage tears
  if (dmg>0.3) { c.strokeStyle='rgba(150,130,110,0.5)'; c.lineWidth=1; c.beginPath(); c.moveTo(-w*0.3,-h*0.4); c.lineTo(-w*0.1,0); c.lineTo(w*0.2,h*0.3); c.stroke(); }
  if (dmg>0.6) { c.strokeStyle='rgba(130,110,90,0.5)'; c.beginPath(); c.moveTo(w*0.2,-h*0.3); c.lineTo(-w*0.15,h*0.15); c.stroke(); c.fillStyle='rgba(0,0,0,0.06)'; c.fillRect(-w*0.2,-h*0.2,w*0.4,h*0.4); }
}

// ---- SLINGSHOT ----
function drawSlingshotBack(c,sx,sy) {
  // Back post
  c.fillStyle = '#4A2E18';
  c.fillRect(sx-22, sy-55, 10, 65);
}

function drawSlingshotFront(c,sx,sy) {
  // Front post
  c.fillStyle = '#6B4226';
  c.fillRect(sx+12, sy-55, 10, 65);
  // Base
  c.fillStyle = '#4A2E18';
  c.fillRect(sx-24, sy+7, 48, 11);
  c.fillRect(sx-18, sy+15, 36, 22);
  // Fork tops
  c.fillStyle = '#6B4226';
  c.beginPath(); c.arc(sx-17,sy-53,7,0,Math.PI*2); c.arc(sx+17,sy-53,7,0,Math.PI*2); c.fill();
}

// ---- BACKGROUND ----
function drawBG(c) {
  const gy = VH - GROUND_H;
  // Sky
  const sg = c.createLinearGradient(0,0,0,gy);
  sg.addColorStop(0,'#87CEEB'); sg.addColorStop(0.5,'#B0E0F0'); sg.addColorStop(1,'#E8F5E9');
  c.fillStyle = sg; c.fillRect(0,0,VW,gy);
  // Clouds
  drawCloud(c,VW*0.12,VH*0.1,55);
  drawCloud(c,VW*0.42,VH*0.06,70);
  drawCloud(c,VW*0.72,VH*0.16,45);
  drawCloud(c,VW*0.88,VH*0.05,60);
  // Hills
  c.fillStyle = '#6BAF6E'; c.beginPath(); c.moveTo(0,gy);
  for (let x=0;x<=VW;x+=25) c.lineTo(x, gy-22-Math.sin(x*0.007)*18-Math.sin(x*0.016)*10);
  c.lineTo(VW,gy); c.closePath(); c.fill();
  // Ground
  const gg = c.createLinearGradient(0,gy,0,VH);
  gg.addColorStop(0,'#5D8C3F'); gg.addColorStop(0.12,'#4A7A32'); gg.addColorStop(0.3,'#8B6B4A'); gg.addColorStop(1,'#6B4D33');
  c.fillStyle = gg; c.fillRect(0,gy,VW,GROUND_H);
  // Grass
  c.strokeStyle='#6BAF6E'; c.lineWidth=1.5;
  for (let x=0;x<VW;x+=16+Math.random()*10) {
    c.beginPath(); c.moveTo(x,gy); c.quadraticCurveTo(x-3,gy-6,x-1,gy-9); c.stroke();
    c.beginPath(); c.moveTo(x,gy); c.quadraticCurveTo(x+4,gy-7,x+2,gy-11); c.stroke();
  }
}

function drawCloud(c,x,y,s) {
  c.fillStyle='rgba(255,255,255,0.8)'; c.beginPath();
  c.arc(x,y,s*0.5,0,Math.PI*2); c.arc(x+s*0.4,y-s*0.15,s*0.4,0,Math.PI*2);
  c.arc(x+s*0.8,y,s*0.45,0,Math.PI*2); c.arc(x+s*0.35,y+s*0.15,s*0.35,0,Math.PI*2);
  c.fill();
}

function drawTrajectory(c,sx,sy,vx,vy) {
  c.fillStyle='rgba(255,255,255,0.4)';
  let tx=sx,ty=sy,tvx=vx,tvy=vy;
  const gy=VH-GROUND_H;
  for (let i=0;i<30;i++) {
    const dt=0.05; tvy+=GRAVITY*dt; tx+=tvx*dt; ty+=tvy*dt;
    if (ty>gy) break;
    if (i%2===0) { c.beginPath(); c.arc(tx,ty,2.5-i*0.06,0,Math.PI*2); c.fill(); }
  }
}

// ---- LEVELS (all in virtual coords, bigger blocks) ----
function createLevels() {
  const G = VH - GROUND_H;
  // Block sizes: pillars ~30w x 100+h, planks ~140w x 25h
  return [
    { // Level 1 — Simple intro: two big TP pillars + plank, 1 pig
      turds: 3,
      blocks: () => [
        makeBlock(520, G-110, 30, 110, 'tp'),
        makeBlock(650, G-110, 30, 110, 'tp'),
        makeBlock(510, G-135, 180, 25, 'tp'),
      ],
      pigs: () => [ new Pig(600, G-38, 34) ],
    },
    { // Level 2 — Two shelters, 2 pigs
      turds: 4,
      blocks: () => [
        makeBlock(480, G-90, 28, 90, 'tp'),
        makeBlock(590, G-90, 28, 90, 'tp'),
        makeBlock(472, G-115, 154, 25, 'tp'),
        makeBlock(700, G-100, 28, 100, 'stone'),
        makeBlock(810, G-100, 28, 100, 'stone'),
        makeBlock(692, G-125, 154, 25, 'stone'),
      ],
      pigs: () => [
        new Pig(538, G-34, 30),
        new Pig(758, G-34, 30),
      ],
    },
    { // Level 3 — Tower
      turds: 4,
      blocks: () => [
        makeBlock(570, G-90, 28, 90, 'stone'),
        makeBlock(690, G-90, 28, 90, 'stone'),
        makeBlock(562, G-115, 164, 25, 'tp'),
        makeBlock(595, G-185, 28, 70, 'tp'),
        makeBlock(665, G-185, 28, 70, 'tp'),
        makeBlock(587, G-210, 114, 25, 'tp'),
        makeBlock(630, G-255, 28, 45, 'glass'),
        makeBlock(622, G-275, 44, 20, 'glass'),
      ],
      pigs: () => [
        new Pig(632, G-34, 30),
        new Pig(632, G-140, 26),
      ],
    },
    { // Level 4 — Fortress
      turds: 5,
      blocks: () => [
        makeBlock(470, G-130, 28, 130, 'stone'),
        makeBlock(730, G-130, 28, 130, 'stone'),
        makeBlock(462, G-155, 304, 25, 'stone'),
        makeBlock(530, G-80, 22, 80, 'tp'),
        makeBlock(670, G-80, 22, 80, 'tp'),
        makeBlock(522, G-100, 178, 20, 'tp'),
        makeBlock(560, G-40, 100, 20, 'glass'),
        makeBlock(500, G-200, 22, 45, 'glass'),
        makeBlock(720, G-200, 22, 45, 'glass'),
        makeBlock(492, G-220, 258, 20, 'glass'),
      ],
      pigs: () => [
        new Pig(570, G-34, 28),
        new Pig(650, G-34, 28),
        new Pig(610, G-180, 24),
      ],
    },
    { // Level 5 — Twin towers + bridge
      turds: 5,
      blocks: () => [
        makeBlock(430, G-140, 28, 140, 'stone'),
        makeBlock(550, G-140, 28, 140, 'stone'),
        makeBlock(422, G-165, 164, 25, 'stone'),
        makeBlock(660, G-140, 28, 140, 'stone'),
        makeBlock(780, G-140, 28, 140, 'stone'),
        makeBlock(652, G-165, 164, 25, 'stone'),
        makeBlock(572, G-100, 96, 22, 'tp'),
        makeBlock(580, G-80, 22, 80, 'tp'),
        makeBlock(648, G-80, 22, 80, 'tp'),
        makeBlock(460, G-210, 22, 45, 'glass'),
        makeBlock(530, G-210, 22, 45, 'glass'),
        makeBlock(452, G-230, 108, 20, 'glass'),
        makeBlock(690, G-210, 22, 45, 'glass'),
        makeBlock(760, G-210, 22, 45, 'glass'),
        makeBlock(682, G-230, 108, 20, 'glass'),
      ],
      pigs: () => [
        new Pig(492, G-34, 30),
        new Pig(722, G-34, 30),
        new Pig(616, G-34, 26),
        new Pig(492, G-190, 22),
        new Pig(722, G-190, 22),
      ],
    },
  ];
}

function makeBlock(x,y,w,h,material) {
  const b = new Body(x,y,w,h,'dynamic');
  b.material = material;
  switch(material) {
    case 'tp': b.health=80; b.maxHealth=80; b.mass=(w*h)/350; break;
    case 'stone': b.health=200; b.maxHealth=200; b.mass=(w*h)/200; break;
    case 'glass': b.health=40; b.maxHealth=40; b.mass=(w*h)/500; break;
  }
  return b;
}

// ---- GAME STATE ----
const state = {
  phase:'menu', currentLevel:0, score:0, turdsRemaining:0,
  turds:[], currentTurd:null, blocks:[], pigs:[],
  isPulling:false, settleTimer:0, levels:null, totalScore:0,
};

function slingY() { return VH - GROUND_H - 110; }

function loadLevel(idx) {
  const levels = state.levels || createLevels();
  state.levels = levels;
  if (idx >= levels.length) { state.phase='menu'; return; }
  const lv = levels[idx];
  state.currentLevel = idx;
  state.turdsRemaining = lv.turds;
  state.blocks = lv.blocks();
  state.pigs = lv.pigs();
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
  const sy = slingY();
  const t = new Turd(SLING_X, sy - 55);
  state.currentTurd = t;
  state.turds.push(t);
  state.turdsRemaining--;
  state.phase = 'aiming';
  updateHUD();
}

function updateHUD() {
  document.getElementById('scoreDisplay').textContent = `Score: ${state.score}`;
  document.getElementById('levelDisplay').textContent = `Level ${state.currentLevel+1}`;
  const td = document.getElementById('turdsDisplay');
  td.innerHTML = '';
  const total = state.levels[state.currentLevel]?.turds || 0;
  const used = total - state.turdsRemaining - (state.currentTurd?1:0);
  for (let i=0;i<total;i++) {
    const ic = document.createElement('div');
    ic.className = 'turd-icon' + (i>=used?' active':'');
    td.appendChild(ic);
  }
}

// ---- INPUT (screen → virtual coords) ----
const mouse = {x:0,y:0,down:false};

function vpos(clientX,clientY) {
  const r = canvas.getBoundingClientRect();
  return screenToVirtual(clientX-r.left, clientY-r.top);
}

function tryGrab(mx,my) {
  if (state.phase==='aiming' && state.currentTurd) {
    const t = state.currentTurd;
    const dx=mx-t.x, dy=my-t.y;
    // Very generous grab radius for mobile (covers slingshot area)
    if (Math.sqrt(dx*dx+dy*dy) < 100) {
      state.isPulling = true;
      return true;
    }
  }
  return false;
}

function releaseSling() {
  if (!state.isPulling || !state.currentTurd) return;
  const t = state.currentTurd;
  const sy = slingY();
  const dx = SLING_X - t.x, dy = (sy-55) - t.y;
  const dist = Math.sqrt(dx*dx+dy*dy);
  if (dist > 10) {
    t.vx = dx*SLING_POWER; t.vy = dy*SLING_POWER;
    t.launched = true; state.phase = 'flying';
    playLaunch();
  } else {
    t.x = SLING_X; t.y = sy-55;
  }
  state.isPulling = false;
}

canvas.addEventListener('mousedown', e => {
  initAudio();
  const p = vpos(e.clientX,e.clientY);
  mouse.x=p.x; mouse.y=p.y; mouse.down=true;
  tryGrab(p.x,p.y);
});
canvas.addEventListener('mousemove', e => {
  const p=vpos(e.clientX,e.clientY); mouse.x=p.x; mouse.y=p.y;
});
canvas.addEventListener('mouseup', () => { mouse.down=false; releaseSling(); });

canvas.addEventListener('touchstart', e => {
  e.preventDefault(); initAudio();
  const t=e.touches[0], p=vpos(t.clientX,t.clientY);
  mouse.x=p.x; mouse.y=p.y; mouse.down=true;
  tryGrab(p.x,p.y);
}, {passive:false});
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const t=e.touches[0], p=vpos(t.clientX,t.clientY);
  mouse.x=p.x; mouse.y=p.y;
}, {passive:false});
canvas.addEventListener('touchend', e => {
  e.preventDefault(); mouse.down=false; releaseSling();
}, {passive:false});

// ---- COLLISION ----
function circRectHit(cx,cy,cr,rx,ry,rw,rh) {
  const nx=Math.max(rx,Math.min(cx,rx+rw)), ny=Math.max(ry,Math.min(cy,ry+rh));
  const dx=cx-nx, dy=cy-ny;
  return (dx*dx+dy*dy)<(cr*cr);
}

function resolveCircRect(turd,block) {
  const cx=turd.x,cy=turd.y,cr=turd.radius;
  const nx=Math.max(block.x,Math.min(cx,block.x+block.w));
  const ny=Math.max(block.y,Math.min(cy,block.y+block.h));
  const dx=cx-nx,dy=cy-ny;
  const dist=Math.sqrt(dx*dx+dy*dy);
  if (dist===0) return;
  const overlap=cr-dist, ux=dx/dist, uy=dy/dist;
  turd.x+=ux*overlap; turd.y+=uy*overlap;
  const rv=turd.vx*ux+turd.vy*uy;
  if (rv>0) return;
  const j=-(1+0.3)*rv;
  turd.vx+=j*ux*0.7; turd.vy+=j*uy*0.7;
  if (block.type!=='static') {
    block.vx-=j*ux*0.3*(turd.mass/block.mass);
    block.vy-=j*uy*0.3*(turd.mass/block.mass);
    block.angularVel+=(Math.random()-0.5)*0.5;
  }
  const imp=Math.abs(rv);
  if (imp>DAMAGE_THRESHOLD) {
    if (block.applyDamage(imp*1.2)) {
      state.score += block.material==='stone'?500:block.material==='tp'?300:200;
      emitP(block.cx,block.cy,15,{spread:250,speed:180,life:0.6,lifeVar:0.3,
        colors:block.material==='tp'?['#F5F0EB','#D4C5B2','#EDE4DA','#B5A48E']:
               block.material==='stone'?['#888','#666','#aaa']:['#A0D8EF','#80C0E0','#C0E8FF'],
        size:3,sizeVar:4});
      playBreak(); updateHUD();
    } else playImpact();
  }
}

function resolveCircCirc(turd,pig) {
  const dx=pig.x-turd.x,dy=pig.y-turd.y;
  const dist=Math.sqrt(dx*dx+dy*dy), minD=turd.radius+pig.size;
  if (dist>=minD||dist===0) return false;
  const ux=dx/dist,uy=dy/dist,overlap=minD-dist;
  turd.x-=ux*overlap*0.5; turd.y-=uy*overlap*0.5;
  pig.x+=ux*overlap*0.5; pig.y+=uy*overlap*0.5;
  const rv=(turd.vx-pig.vx)*ux+(turd.vy-pig.vy)*uy;
  if (rv<0) return false;
  const j=rv*1.5;
  turd.vx-=j*ux*0.5; turd.vy-=j*uy*0.5;
  pig.vx+=j*ux*1.0; pig.vy+=j*uy*1.0;
  const dmg=Math.abs(rv)*1.5;
  if (pig.applyDamage(dmg)) {
    state.score+=1000;
    emitP(pig.x,pig.y,15,{spread:250,speed:200,life:0.6,lifeVar:0.3,
      colors:['#4CAF50','#388E3C','#66BB6A','#fff'],size:3,sizeVar:4});
    playPigSqueal(); updateHUD(); return true;
  }
  playImpact(); return false;
}

function blockBlockCol(a,b) {
  if (a.destroyed||b.destroyed||a.type==='static'&&b.type==='static') return;
  const ox=Math.min(a.x+a.w-b.x,b.x+b.w-a.x), oy=Math.min(a.y+a.h-b.y,b.y+b.h-a.y);
  if (ox<=0||oy<=0) return;
  if (ox<oy) {
    const s=a.cx<b.cx?-1:1;
    if (a.type!=='static') a.x+=s*ox*0.5;
    if (b.type!=='static') b.x-=s*ox*0.5;
    if (a.type!=='static') a.vx=-a.vx*0.3;
    if (b.type!=='static') b.vx=-b.vx*0.3;
  } else {
    const s=a.cy<b.cy?-1:1;
    if (a.type!=='static') a.y+=s*oy*0.5;
    if (b.type!=='static') b.y-=s*oy*0.5;
    if (a.type!=='static') a.vy=-a.vy*0.3;
    if (b.type!=='static') b.vy=-b.vy*0.3;
  }
}

function blockGround(block) {
  if (block.destroyed||block.type==='static') return;
  const gy=VH-GROUND_H;
  if (block.y+block.h>gy) {
    const imp=Math.abs(block.vy);
    block.y=gy-block.h; block.vy*=-0.2; block.vx*=0.7; block.angularVel*=0.5;
    if (Math.abs(block.vy)<5) block.vy=0;
    if (Math.abs(block.vx)<2) block.vx=0;
    if (imp>80) {
      block.applyDamage(imp*0.3);
      if (block.destroyed) {
        state.score += block.material==='stone'?500:block.material==='tp'?300:200;
        emitP(block.cx,block.cy,8,{spread:150,speed:100,life:0.4,
          colors:block.material==='tp'?['#F5F0EB','#D4C5B2']:['#888','#666'],size:2,sizeVar:2});
        playBreak(); updateHUD();
      }
    }
  }
  if (block.x<0) { block.x=0; block.vx*=-0.3; }
  if (block.x+block.w>VW) { block.x=VW-block.w; block.vx*=-0.3; }
}

function blockPigCol(block,pig) {
  if (block.destroyed||pig.destroyed) return;
  const cx=pig.x,cy=pig.y,cr=pig.size;
  const nx=Math.max(block.x,Math.min(cx,block.x+block.w));
  const ny=Math.max(block.y,Math.min(cy,block.y+block.h));
  const dx=cx-nx,dy=cy-ny,d2=dx*dx+dy*dy;
  if (d2>=cr*cr) return;
  const dist=Math.sqrt(d2)||1, ux=dx/dist, uy=dy/dist;
  pig.x+=ux*(cr-dist); pig.y+=uy*(cr-dist);
  const rs=Math.abs(block.vx*ux+block.vy*uy)+Math.abs(block.vy)*0.3;
  if (rs>15) {
    if (pig.applyDamage(rs*1.0)) {
      state.score+=1000;
      emitP(pig.x,pig.y,12,{spread:200,speed:150,life:0.5,colors:['#4CAF50','#388E3C','#66BB6A'],size:3,sizeVar:3});
      playPigSqueal(); updateHUD();
    }
  }
}

// ---- UPDATE ----
function update(dt) {
  if (state.phase==='menu') return;
  // Pulling
  if (state.isPulling && state.currentTurd) {
    const sy=slingY();
    const dx=mouse.x-SLING_X, dy=mouse.y-(sy-55);
    const dist=Math.sqrt(dx*dx+dy*dy), clamped=Math.min(dist,MAX_PULL);
    const ang=Math.atan2(dy,dx);
    state.currentTurd.x = SLING_X+Math.cos(ang)*clamped;
    state.currentTurd.y = (sy-55)+Math.sin(ang)*clamped;
  }
  // Turds
  for (const t of state.turds) {
    t.update(dt);
    if (t.launched && t.active) {
      const gy=VH-GROUND_H;
      if (t.y+t.radius>gy) {
        t.y=gy-t.radius; t.vy*=-0.3; t.vx*=0.7;
        if (Math.abs(t.vy)<15&&Math.abs(t.vx)<15) {
          if (!t.splatted) { t.splatted=true; playSplat();
            emitP(t.x,t.y+t.radius,8,{spread:120,speed:60,life:0.4,lifeVar:0.2,colors:['#6B4226','#5C3A1E','#8B5E3C'],size:3,sizeVar:3});
          }
          t.active=false;
        }
      }
      for (const b of state.blocks) { if (!b.destroyed && circRectHit(t.x,t.y,t.radius,b.x,b.y,b.w,b.h)) resolveCircRect(t,b); }
      for (const p of state.pigs) { if (!p.destroyed) { const dx=p.x-t.x,dy=p.y-t.y; if (Math.sqrt(dx*dx+dy*dy)<t.radius+p.size) resolveCircCirc(t,p); } }
    }
  }
  // Blocks
  for (const b of state.blocks) { b.update(dt); blockGround(b); }
  for (let i=0;i<state.blocks.length;i++) for (let j=i+1;j<state.blocks.length;j++) {
    const a=state.blocks[i],b=state.blocks[j];
    if (!a.destroyed&&!b.destroyed&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y) blockBlockCol(a,b);
  }
  for (const b of state.blocks) for (const p of state.pigs) blockPigCol(b,p);
  for (const p of state.pigs) p.update(dt);
  for (const p of particles) if (p.active) p.update(dt);
  // Phase transitions
  if (state.phase==='flying') {
    const t=state.currentTurd;
    if (!t||!t.active) { state.phase='settling'; state.settleTimer=0; }
  }
  if (state.phase==='settling') {
    state.settleTimer+=dt;
    let settled=true;
    for (const b of state.blocks) if (!b.destroyed&&b.speed>MIN_VELOCITY) { settled=false; break; }
    if (settled) for (const p of state.pigs) if (!p.destroyed&&(Math.abs(p.vx)>MIN_VELOCITY||Math.abs(p.vy)>MIN_VELOCITY)) { settled=false; break; }
    if (settled||state.settleTimer>SETTLE_TIME) {
      const alive=state.pigs.filter(p=>!p.destroyed).length;
      if (alive===0) { state.score+=state.turdsRemaining*2000; showLevelComplete(); return; }
      if (state.turdsRemaining>0) spawnNextTurd(); else showGameOver();
    }
  }
}

// ---- RENDER ----
function render() {
  beginVirtualFrame();
  drawBG(ctx);
  if (state.phase==='menu') return;

  const sy = slingY();
  drawSlingshotBack(ctx, SLING_X, sy);
  // Back band
  if (state.isPulling && state.currentTurd) {
    ctx.strokeStyle='#4A2E18'; ctx.lineWidth=6;
    ctx.beginPath(); ctx.moveTo(SLING_X-17,sy-51); ctx.lineTo(state.currentTurd.x,state.currentTurd.y); ctx.stroke();
  }
  for (const b of state.blocks) drawBlock(ctx,b);
  for (const p of state.pigs) p.draw(ctx);
  for (const t of state.turds) t.draw(ctx);
  drawSlingshotFront(ctx, SLING_X, sy);
  // Front band
  if (state.isPulling && state.currentTurd) {
    ctx.strokeStyle='#6B4226'; ctx.lineWidth=5;
    ctx.beginPath(); ctx.moveTo(SLING_X+17,sy-51); ctx.lineTo(state.currentTurd.x,state.currentTurd.y); ctx.stroke();
    const dx=SLING_X-state.currentTurd.x, dy=(sy-55)-state.currentTurd.y;
    drawTrajectory(ctx,state.currentTurd.x,state.currentTurd.y,dx*SLING_POWER,dy*SLING_POWER);
  }
  for (const p of particles) if (p.active) p.draw(ctx);
  if (state.phase==='aiming' && state.currentTurd && !state.isPulling) {
    ctx.fillStyle='rgba(255,255,255,0.55)';
    ctx.font='600 15px "Plus Jakarta Sans",sans-serif'; ctx.textAlign='center';
    ctx.fillText('Drag to aim',SLING_X, sy+55);
  }
}

// ---- UI ----
function showLevelComplete() {
  state.phase='levelComplete'; playWin();
  document.getElementById('level-complete').style.display='flex';
  document.getElementById('completionScore').textContent=`Score: ${state.score}`;
  const max=state.pigs.length*1000+state.blocks.length*300+(state.levels[state.currentLevel].turds)*2000;
  const pct=state.score/max;
  const stars=pct>0.7?3:pct>0.4?2:1;
  document.querySelectorAll('.star').forEach((el,i)=>el.className='star'+(i<stars?' earned':''));
  document.getElementById('nextLevelBtn').style.display = state.currentLevel<state.levels.length-1?'inline-block':'none';
}
function showGameOver() {
  state.phase='gameOver'; playLose();
  document.getElementById('game-over').style.display='flex';
  document.getElementById('gameOverScore').textContent=`Score: ${state.score}`;
}

document.getElementById('startBtn').addEventListener('click',()=>{initAudio();loadLevel(0);});
document.getElementById('nextLevelBtn').addEventListener('click',()=>{state.totalScore+=state.score;loadLevel(state.currentLevel+1);});
document.getElementById('replayBtn').addEventListener('click',()=>loadLevel(state.currentLevel));
document.getElementById('retryBtn').addEventListener('click',()=>loadLevel(state.currentLevel));
document.getElementById('menuBtn').addEventListener('click',()=>{
  state.phase='menu';
  document.getElementById('game-over').style.display='none';
  document.getElementById('hud').style.display='none';
  document.getElementById('menu-overlay').style.display='flex';
  document.getElementById('soundToggle').style.display='none';
});

// ---- DEBUG ----
let _fr=0,_lt=performance.now(),_fps=0,_ft=0,_pv=0,debugOn=false;
function updDbg(){_fr++;const n=performance.now();_ft=n-(_pv||n);_pv=n;if(n-_lt>=1000){_fps=(_fr*1000)/(n-_lt);_fr=0;_lt=n;}}
function drwDbg(c){if(!debugOn)return;c.save();c.fillStyle='rgba(0,0,0,.6)';c.fillRect(0,VH-22,220,22);c.font='11px monospace';c.fillStyle=_fps<30?'#f44':'#0f0';c.fillText(`FPS:${_fps.toFixed(0)} ${_ft.toFixed(1)}ms S:${scale.toFixed(2)}`,6,VH-7);c.restore();}
document.addEventListener('keydown',e=>{if(e.key==='d'||e.key==='D')debugOn=!debugOn;});

// ---- GAME LOOP ----
const TICK=1000/60;
let lastT=0, accum=0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt=ts-lastT; lastT=ts; accum+=Math.min(dt,100);
  while(accum>=TICK){update(TICK/1000);accum-=TICK;}
  render(); updDbg(); drwDbg(ctx);
}
requestAnimationFrame(loop);

// ---- HOOKS ----
window.advanceTime = ms => { const n=Math.max(1,Math.round(ms/(1000/60))); for(let i=0;i<n;i++)update(1/60); render(); };
window.render_game_to_text = () => JSON.stringify({
  phase:state.phase, level:state.currentLevel, score:state.score,
  turdsRemaining:state.turdsRemaining,
  currentTurd:state.currentTurd?{x:Math.round(state.currentTurd.x),y:Math.round(state.currentTurd.y),launched:state.currentTurd.launched,active:state.currentTurd.active,radius:state.currentTurd.radius}:null,
  pigsAlive:state.pigs.filter(p=>!p.destroyed).length,pigsTotal:state.pigs.length,
  blocksAlive:state.blocks.filter(b=>!b.destroyed).length,blocksTotal:state.blocks.length,
  virtual:{w:VW,h:VH},scale:scale.toFixed(2),
});
