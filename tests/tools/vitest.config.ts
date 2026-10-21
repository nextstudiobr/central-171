import { defineConfig } from 'vite';

// Ferramentas de análise (relatório de balanceamento). Não fazem parte da suíte padrão.
export default defineConfig({ test: { include: ['tests/tools/**/*.test.ts'], root: '.' } } as never);
