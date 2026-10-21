import type { PortraitSpec } from '../data/types';

/** Retrato procedural de um interlocutor fictício, desenhado em canvas. */
export function drawPortrait(canvas: HTMLCanvasElement, p: PortraitSpec, seed = 0, mood: 'neutral' | 'happy' | 'angry' = 'neutral'): void {
  const W = 300;
  const H = 360;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, p.bg);
  g.addColorStop(1, '#0c0f12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Ombros e roupa.
  ctx.fillStyle = p.shirt;
  ctx.beginPath();
  ctx.ellipse(W / 2, H + 30, 140, 120, 0, Math.PI, 0);
  ctx.fill();
  // Pescoço.
  ctx.fillStyle = shade(p.skin, -0.12);
  ctx.fillRect(W / 2 - 28, 225, 56, 50);
  // Cabelo de trás.
  ctx.fillStyle = p.hair;
  if (p.hairStyle === 3 || p.hairStyle === 4) {
    ctx.beginPath();
    ctx.ellipse(W / 2, 175, 98, p.hairStyle === 4 ? 135 : 105, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Rosto.
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.ellipse(W / 2, 165, 78, 96, 0, 0, Math.PI * 2);
  ctx.fill();
  // Orelhas.
  ctx.beginPath();
  ctx.ellipse(W / 2 - 78, 170, 13, 22, 0, 0, Math.PI * 2);
  ctx.ellipse(W / 2 + 78, 170, 13, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  if (p.earrings) {
    ctx.fillStyle = '#ffd35a';
    ctx.beginPath();
    ctx.arc(W / 2 - 80, 196, 6, 0, Math.PI * 2);
    ctx.arc(W / 2 + 80, 196, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cabelo da frente (estilo 9 = careca).
  ctx.fillStyle = p.hair;
  if (p.hairStyle !== 9) switch (p.hairStyle % 5) {
    case 0:
      ctx.beginPath();
      ctx.ellipse(W / 2, 92, 80, 40, 0, Math.PI, 0);
      ctx.fill();
      break;
    case 1:
      ctx.beginPath();
      ctx.ellipse(W / 2, 100, 84, 52, 0, Math.PI * 1.02, Math.PI * 1.98);
      ctx.fill();
      ctx.fillRect(W / 2 - 84, 96, 20, 50);
      ctx.fillRect(W / 2 + 64, 96, 20, 50);
      break;
    case 2:
      ctx.beginPath();
      ctx.moveTo(W / 2 - 82, 140);
      ctx.quadraticCurveTo(W / 2 - 60, 50, W / 2 + 10, 62);
      ctx.quadraticCurveTo(W / 2 + 90, 70, W / 2 + 82, 140);
      ctx.quadraticCurveTo(W / 2 + 20, 95, W / 2 - 82, 140);
      ctx.fill();
      break;
    case 3:
      ctx.beginPath();
      ctx.ellipse(W / 2, 98, 86, 48, 0, Math.PI, 0);
      ctx.fill();
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.arc(W / 2 - 70 + i * 23, 88 + (i % 2) * 6, 20, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    default:
      ctx.beginPath();
      ctx.ellipse(W / 2, 96, 84, 46, 0, Math.PI, 0);
      ctx.fill();
  }
  // Olhos.
  const eyeY = 160;
  ctx.fillStyle = '#fff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(W / 2 + s * 30, eyeY, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2a1d16';
  const look = ((seed % 5) - 2) * 1.5;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(W / 2 + s * 30 + look, eyeY + 1, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sobrancelhas.
  ctx.strokeStyle = shade(p.hair, -0.1);
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  const browTilt = mood === 'angry' ? 8 : mood === 'happy' ? -3 : 0;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + s * 18, 138 + browTilt);
    ctx.lineTo(W / 2 + s * 46, 136 - browTilt * 0.5);
    ctx.stroke();
  }
  // Nariz.
  ctx.strokeStyle = shade(p.skin, -0.25);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(W / 2 + 2, 168);
  ctx.quadraticCurveTo(W / 2 + 12, 196, W / 2 - 4, 200);
  ctx.stroke();
  // Boca.
  ctx.strokeStyle = '#7a2e2e';
  ctx.lineWidth = 5;
  ctx.beginPath();
  if (mood === 'happy') ctx.arc(W / 2, 214, 22, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (mood === 'angry') ctx.arc(W / 2, 242, 22, 1.2 * Math.PI, 1.8 * Math.PI);
  else {
    ctx.moveTo(W / 2 - 18, 228);
    ctx.lineTo(W / 2 + 18, 228);
  }
  ctx.stroke();
  if (p.mustache) {
    ctx.fillStyle = p.hair === '#d9d4cc' ? '#bdb7ae' : shade(p.hair, -0.05);
    ctx.beginPath();
    ctx.ellipse(W / 2 - 16, 214, 20, 8, 0.2, 0, Math.PI * 2);
    ctx.ellipse(W / 2 + 16, 214, 20, 8, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (p.glasses) {
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(W / 2 + s * 30 - 22, eyeY - 16, 44, 32, 9);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(W / 2 - 8, eyeY);
    ctx.lineTo(W / 2 + 8, eyeY);
    ctx.stroke();
  }
}

/** Retrato dos personagens fixos (chefe, colegas, investigadora). */
export function drawNpcPortrait(canvas: HTMLCanvasElement, who: string): void {
  const specs: Record<string, PortraitSpec> = {
    boss: { skin: '#e3b28f', hair: '#3a2e28', hairStyle: 9, glasses: false, mustache: true, earrings: false, bg: '#5a2a1a', shirt: '#2d3a5c' },
    tonhao: { skin: '#8c5a3c', hair: '#1a1a1a', hairStyle: 0, glasses: false, mustache: false, earrings: false, bg: '#1f4a35', shirt: '#2f7d4f' },
    pri: { skin: '#f0c9a8', hair: '#5a2a1a', hairStyle: 4, glasses: true, mustache: false, earrings: true, bg: '#3e2350', shirt: '#7a3d8f' },
    juninho: { skin: '#d9a77f', hair: '#c0392b', hairStyle: 2, glasses: false, mustache: false, earrings: false, bg: '#4a3a12', shirt: '#d9a43a' },
    mystery: { skin: '#222428', hair: '#0d0e10', hairStyle: 4, glasses: false, mustache: false, earrings: false, bg: '#0b0f14', shirt: '#14181d' },
  };
  drawPortrait(canvas, specs[who] ?? specs.mystery, who.length, who === 'boss' ? 'angry' : 'neutral');
  if (who === 'mystery') {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#d0d6dc';
      ctx.font = 'bold 120px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', canvas.width / 2, 210);
    }
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * (1 + amt)));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * (1 + amt)));
  const b = Math.max(0, Math.min(255, (n & 255) * (1 + amt)));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
