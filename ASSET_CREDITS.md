# Créditos de assets — CENTRAL 171

Todos os assets externos abaixo foram baixados durante o desenvolvimento,
estão guardados localmente em `public/assets/` e são carregados sem nenhum
acesso à internet durante o jogo. Todos usam a licença **CC0 1.0 (domínio
público)**, que permite uso comercial e não exige atribuição. Os créditos
estão aqui por cortesia.

## Modelos 3D

| Asset | Autor / fonte | Licença | Arquivos usados |
|---|---|---|---|
| Furniture Kit 2.0 | Kenney — https://kenney.nl/assets/furniture-kit | CC0 1.0 (confirmada no `License.txt` do pacote, cópia em `public/assets/models/KENNEY_LICENSE.txt`) | 29 modelos `.glb` em `public/assets/models/` (mesas, cadeiras, teclado, mouse, cafeteira, geladeira, micro-ondas, plantas, caixas, estantes, sofá, luminária etc.) |

Os modelos são reescalados e às vezes tingidos no código (`src/world/Assets.ts`).
Se algum arquivo faltar, o jogo usa uma caixa procedural no lugar.

## Texturas e iluminação

| Asset | Autor | Fonte | Licença | Arquivos |
|---|---|---|---|---|
| Unfinished Office Night (HDRI 1k) | Sergej Majboroda | https://polyhaven.com/a/unfinished_office_night | CC0 1.0 | `public/assets/hdri/unfinished_office_night_1k.hdr` (reflexos do ambiente) |
| Dirty Carpet (1k) | Rohit Seervi | https://polyhaven.com/a/dirty_carpet | CC0 1.0 | `public/assets/textures/dirty_carpet_{diff,nor_gl,rough}_1k.jpg` (carpete) |
| Ceiling Interior (1k) | Dimitrios Savva | https://polyhaven.com/a/ceiling_interior | CC0 1.0 | `public/assets/textures/ceiling_interior_*_1k.jpg` (relevo do forro) |
| Painted Plaster Wall (1k) | Amal Kumar | https://polyhaven.com/a/painted_plaster_wall | CC0 1.0 | `public/assets/textures/painted_plaster_wall_*_1k.jpg` (paredes) |

Autores e licenças consultados na API oficial do Poly Haven
(`https://api.polyhaven.com/info/<id>`) no dia do download (21/10/2026).

## Conteúdo criado para o projeto (sem assets externos)

- **Personagens 3D** (chefe, colegas): geometria procedural em `src/world/Characters.ts`.
- **Retratos dos interlocutores**: desenhados em canvas em `src/ui/Portrait.ts`.
- **Cidade, céu, persianas, telefone, monitores, rack, triturador, relógio,
  pôsteres, placas do forro**: procedurais em `src/world/Office.ts` e `src/world/Screens.ts`.
- **Todos os sons, música de espera e vozes procedurais**: sintetizados em tempo
  real com Web Audio em `src/audio/AudioEngine.ts`. Nenhum arquivo de áudio externo.
- **Vozes sintetizadas (opcional)**: usam a síntese de voz já instalada no seu
  sistema operacional (Web Speech API), somente vozes locais. Nenhum serviço remoto.
- **Fontes**: fontes do sistema (Segoe UI, Bahnschrift, Cascadia Mono / Consolas).
  Nenhuma fonte baixada.
- **Textos, personagens, golpes fictícios e roteiros**: originais.

## Bibliotecas

| Biblioteca | Licença |
|---|---|
| three.js r186 (incluindo addons: GLTFLoader, HDRLoader, EffectComposer, UnrealBloomPass, OutputPass, RoundedBoxGeometry, BufferGeometryUtils) | MIT |
| Vite, TypeScript, Vitest, playwright-core (só desenvolvimento e testes) | MIT / Apache-2.0 |

## O que não foi usado

Nenhum arquivo, modelo, textura, som, texto ou elemento de identidade visual do
jogo *Scam With Your Friends* foi copiado. Ele serviu apenas como referência
para o tipo de experiência.
