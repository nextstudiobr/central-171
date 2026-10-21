import './styles.css';
import { Game } from './game/Game';

/** Mensagem amigável quando algo essencial falha (ex.: WebGL indisponível). */
function fatal(title: string, detail: string): void {
  const el = document.createElement('div');
  el.className = 'fatal';
  el.innerHTML = `<div><h1 style="font-family:var(--display);letter-spacing:2px">${title}</h1><p>O jogo não conseguiu iniciar. Tente atualizar a página ou usar o Google Chrome atualizado com aceleração de hardware ativada.</p><pre></pre></div>`;
  el.querySelector('pre')!.textContent = detail;
  document.body.appendChild(el);
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app não encontrado');
  if (!webglAvailable()) {
    fatal('WebGL indisponível', 'Seu navegador não ofereceu um contexto WebGL 2.');
    return;
  }
  const game = new Game(app);
  (window as unknown as { __c171: unknown }).__c171 = game.debugApi();
  await game.boot();
}

window.addEventListener('error', (e) => console.error('[CENTRAL 171] erro não tratado', e.error ?? e.message));
main().catch((err: unknown) => {
  console.error(err);
  fatal('Falha ao iniciar', err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err));
});
