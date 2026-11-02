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
keg diff --sem-tela      # só grava o review.json, sem abrir a página
keg diff --sem-ia        # sem o narrador: cada passo mostra só a frase mecânica
```

A saída mostra cada fluxo do nasce ao termina, com os passos alterados (●) e os de contexto (○), e os órfãos: trechos alterados que não estão em nenhum caminho entre uma fonte e uma saída. Arquivos de teste ficam numa lista à parte.

Em seguida a página de revisão abre no navegador, servida em `http://127.0.0.1:4747` até você apertar Ctrl+C:

- **Panorama:** tamanho do diff, fluxos por risco e a cobertura, quantos trechos já têm decisão.
- **Fluxo:** a linha do tempo nasce → processa → termina à esquerda e o diff do passo à direita. Passo de contexto mostra o código atual.
- **Órfãos, testes e outros trechos:** o que não entrou em fluxo, cada um com o seu diff. Órfão recebe revisado, código morto ou falso positivo.

Atalhos: `j` e `k` passam de passo, `x` marca revisado, `c` comenta, `d` e `f` marcam código morto e falso positivo nos órfãos, `v` alterna o diff entre lado a lado e empilhado, `p` volta ao panorama, `?` mostra a ajuda. Rodar o `keg diff` de novo em outro terminal atualiza a página aberta.

Cada decisão fica presa ao hash do trecho: se o agente mudar o trecho depois, ele volta para "não revisado". Sem terminal (num script ou num agente), o keg não abre a página.

Num monorepo (pnpm, npm ou yarn workspaces), rode na raiz: o keg liga `@equipe/utils` ao fonte do pacote mesmo sem o `node_modules` instalado.

## Narrador

Cada passo alterado ganha até três frases curtas, cada uma presa a linhas do passo: passar o mouse numa frase acende essas linhas no diff, e frase sem âncora válida aparece marcada. Quem escreve é o `claude -p` do Claude Code instalado na sua máquina, com o login da assinatura. O keg nunca chama a API com chave, e o código do fluxo vai para o mesmo serviço a que o Claude Code já manda o projeto.

- **Sob demanda:** uma chamada por fluxo, quando você o abre; o Panorama tem o botão "Narrar todos". O resultado fica em `.revisao/cache/`, e fluxo sem trecho novo não é narrado de novo.
- **Trava de login:** antes da primeira chamada, o keg roda `claude auth status`. Só narra com `claude.ai` ou `oauth_token`; com chave de API ou provedor de terceiros não narra e mostra o motivo no topo da página, e sem login pede para você entrar com `claude` (depois, rode o `keg diff` de novo). O processo do narrador nasce sem `ANTHROPIC_API_KEY` e as outras variáveis de chave, numa pasta temporária vazia.
- **Pausa:** uma resposta com erro, como o limite de uso, pausa a narração e mostra um aviso com o botão "Tentar de novo". Nada se repete sozinho.
- **Sem narrador:** com `--sem-ia`, sem login ou em pausa, o passo mostra uma frase mecânica montada do grafo ("recebe X de Y, chama Z e entrega W a Y"), e a página diz o motivo.
- **Modelo:** `sonnet`. Para trocar, crie `keg.config.json` na raiz do projeto: `{ "narrador": { "modelo": "opus" } }`.

## O que fica no seu projeto

| Arquivo | Para quê |
| --- | --- |
| `.revisao/review.json` | Fluxos, órfãos e métricas do diff (o contrato está em `src/contrato.ts`) |
| `.revisao/estado.json` | As suas decisões na página, uma por trecho |
| `.revisao/cache/` | As frases do narrador, uma por fluxo narrado |
| `.revisao/keg.config.json` | Opcional: chamadas próprias da equipe, como `{ "nasce": ["api.get"], "termina": ["api.post", "api.*"] }` |

O keg acrescenta `.revisao/` ao `.git/info/exclude` do repositório, então a pasta não aparece no `git status` e o `.gitignore` do projeto não muda.

## Desenvolver

```bash
npm install
npm run build            # motor (tsc) e página (Vite, em dist/web)
npm run typecheck
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
