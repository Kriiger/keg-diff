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

A saída mostra cada fluxo do nasce ao termina, com os passos alterados (●) e os de contexto (○), e os órfãos: trechos alterados que não estão em nenhum caminho entre uma fonte e uma saída.

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
```
