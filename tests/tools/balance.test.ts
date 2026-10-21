import { it } from 'vitest';
import { DAYS } from '../../src/data/days';
import { Rng } from '../../src/core/rng';
import { makeCaller, makeConversation, playRandom, playSmart } from '../unit/helpers';

it('relatório de balanceamento', () => {
  for (const def of DAYS) {
    const day = def.day;
    const rng = new Rng(day);
    const schemes = ['netuno', 'gelomax', 'principe', 'abducao', 'capivara'].slice(0, day);
    let s = 0, r = 0, sOk = 0, rOk = 0, n = 300;
    const kinds: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const p = makeCaller(day, 5000 + i, schemes[i % schemes.length]);
      const a = playSmart(makeConversation(p, { seed: i, viewed: true, trace: day >= 3 }));
      const b = playRandom(makeConversation(p, { seed: i }), rng);
      s += a.amount; r += b.amount; if (a.amount > 0) sOk++; if (b.amount > 0) rOk++;
      kinds[b.kind] = (kinds[b.kind] ?? 0) + 1;
    }
    console.log(`dia ${day} meta ${def.quota} | atento média ${Math.round(s/n)} sucesso ${(sOk/n*100).toFixed(0)}% | acaso média ${Math.round(r/n)} sucesso ${(rOk/n*100).toFixed(0)}% | 6 lig: atento ${Math.round(6*s/n)} acaso ${Math.round(6*r/n)}`, JSON.stringify(kinds));
  }
});
