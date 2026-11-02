# keg diff

Revisor de código por fluxo: reorganiza o diff em onde o dado nasce, é processado e termina. Feito para revisar o que agentes de código escrevem em projetos JavaScript e TypeScript (Next.js, React com Vite, Node).

Roda na sua máquina, dentro do seu projeto. Não tem servidor para hospedar nem banco de dados: o resultado vai para arquivos em `.revisao/`.

## Instalar

Precisa de Node 22 ou mais novo.

```bash
npm install -g github:Kriiger/keg-diff
```

O npm baixa o repositório, compila e instala o comando `keg`.

## Usar

Dentro do projeto (ou do pacote que mudou, num monorepo):

```bash
keg diff                 # tudo o que mudou desde o último commit, arquivos novos inclusive
keg diff --staged        # só o que está no stage
keg diff HEAD~1 HEAD     # um commit
keg diff main...HEAD     # o branch inteiro
```

A saída mostra cada fluxo do nasce ao termina, com os passos alterados (●) e os de contexto (○), e os órfãos: trechos alterados que não estão em nenhum caminho entre uma fonte e uma saída. Arquivos de teste ficam numa lista à parte.

Num monorepo (pnpm, npm ou yarn workspaces), rode na raiz: o keg liga `@equipe/utils` ao fonte do pacote mesmo sem o `node_modules` instalado.

## O que fica no seu projeto

| Arquivo | Para quê |
| --- | --- |
| `.revisao/review.json` | Fluxos, órfãos e métricas do diff (o contrato está em `src/contrato.ts`) |
| `.revisao/keg.config.json` | Opcional: chamadas próprias da equipe, como `{ "nasce": ["api.get"], "termina": ["api.post", "api.*"] }` |

O keg acrescenta `.revisao/` ao `.git/info/exclude` do repositório, então a pasta não aparece no `git status` e o `.gitignore` do projeto não muda.

## Desenvolver

```bash
npm install
npm run build
node dist/cli.js diff
npm run calibrar         # roda o motor nos PRs reais de fixtures/ e compara com o gabarito
```

## Calibragem

Cada arquivo em `fixtures/` é um PR real feito por um agente de código, com o resultado esperado escrito à mão: quais fluxos existem, onde cada um nasce e termina, que passos cruzam cliente e servidor, quais trechos são órfãos e quais são testes. `npm run calibrar` clona os repositórios uma vez em `fixtures/.repos`, roda o keg em cada PR e lista onde o motor diverge do gabarito. Toda mudança no algoritmo passa por aqui.

| Gabarito | PR | O que testa |
| --- | --- | --- |
| `memoryai-rota.json` | [MoKarade/MemoryAI#400](https://github.com/MoKarade/MemoryAI/pull/400) | Rotas GET que leem o banco pelo Drizzle; testes fora dos fluxos |
| `anonyworks-cliente-servidor.json` | [codewithemmax/Anonyworks#2](https://github.com/codewithemmax/Anonyworks/pull/2) | Front Vite chamando a rota do Next por um wrapper, com URL montada e SQL cru |
| `tbe-componente.json` | [The-Boring-Education/TBE-Web#1302](https://github.com/The-Boring-Education/TBE-Web/pull/1302) | Página do Pages Router com `getServerSideProps` vindo de outro pacote do monorepo |
