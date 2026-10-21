import { LAST_DAY } from '../data/days';
import type { CampaignState } from './GameState';

const KEY = 'central171.save.v1';

/** Armazenamento mínimo para permitir testes fora do navegador. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Salva a campanha no início de cada expediente (checkpoint). */
export class SaveSystem {
  constructor(private readonly store: KeyValueStore | null) {}

  save(c: CampaignState): boolean {
    if (!this.store) return false;
    try {
      this.store.setItem(KEY, JSON.stringify({ savedAt: Date.now(), campaign: c }));
      return true;
    } catch (err) {
      console.warn('[Save] não foi possível salvar', err);
      return false;
    }
  }

  load(): CampaignState | null {
    if (!this.store) return null;
    try {
      const raw = this.store.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as { campaign?: unknown };
      return validateCampaign(data.campaign);
    } catch (err) {
      console.warn('[Save] arquivo de salvamento corrompido, ignorando', err);
      return null;
    }
  }

  hasSave(): boolean {
    return this.load() !== null;
  }

  clear(): void {
    try {
      this.store?.removeItem(KEY);
    } catch {
      /* armazenamento indisponível */
    }
  }
}

/** Valida o formato salvo; devolve null se algo essencial estiver errado. */
export function validateCampaign(v: unknown): CampaignState | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Partial<CampaignState>;
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  if (c.version !== 1) return null;
  if (!num(c.seed) || !num(c.day) || !num(c.strikes) || !num(c.raids)) return null;
  if (!num(c.operationBalance) || !num(c.wallet) || !num(c.totalCollected) || !num(c.heat) || !num(c.rankIndex)) return null;
  if (c.day! < 1 || c.day! > LAST_DAY) return null;
  if (!Array.isArray(c.upgrades) || !Array.isArray(c.history) || !Array.isArray(c.usedCallers) || !Array.isArray(c.hotList)) return null;
  if (!c.relationships || typeof c.relationships !== 'object') return null;
  if (!c.flags || typeof c.flags !== 'object') return null;
  if (c.ending) return null; // campanha encerrada não é retomável
  return c as CampaignState;
}

export function browserStore(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    const probe = '__c171_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
