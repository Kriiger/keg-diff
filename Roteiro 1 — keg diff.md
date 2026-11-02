# Roteiro 1 — keg diff: revisor de código por fluxo (web, front JS/TS)

Nov 1, 2026 · @Wélliton Kriiger

## Visão e princípios

O keg diff reorganiza o diff em fluxos — onde o dado nasce, onde é processado, onde termina — e só dá a revisão por encerrada quando cada trecho alterado passou por um fluxo ou recebeu uma decisão.

- **Revisar por fluxo, não por arquivo.** O diff vem em ordem alfabética; o código roda em ordem de execução. A ferramenta entrega a sequência pronta, e o cérebro fica livre para julgar.
- **A IA explica, o código prova.** O grafo vem do compilador do TypeScript (ts-morph), nunca do LLM. A IA só escreve explicações curtas, e cada frase aponta para linhas reais; frase sem âncora válida aparece marcada.
- **Controle é cobertura.** Todo hunk pertence a um fluxo ou vira órfão. A revisão termina em "N de N revisados", não em "acho que vi tudo".
- **Revisão vale para o código que você viu.** O estado de cada passo fica preso ao hash do trecho; se o agente mudar o trecho depois, o passo volta a "não revisado".
- **Motor separado da tela.** O motor gera um `review.json` e a tela só lê esse arquivo. A interface muda livre, sem mexer na análise.
- **Simples por dentro.** A própria ferramenta segue as regras do Roteiro 2: poucos arquivos, nada de abstração de uso único, nomes do domínio.

**Por que full web.** A tela de revisão é o produto, e no navegador você tem layout livre, grafo interativo, destaque de sintaxe e atalhos — terreno de quem trabalha com front. O custo é sair do terminal, e ele encolhe porque tudo abre com um comando (`keg diff`) e a página se atualiza sozinha no modo `--watch`.

## Escopo do MVP

O MVP revisa mudanças em todo o front em JavaScript e TypeScript — Next.js com App Router ou Pages Router, SPAs com Vite e módulos sem framework — e vai só até onde o compilador consegue provar.

**Entra**

- Código: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` e `.cjs`, com ou sem tipos. O JS entra pelo `allowJs` do ts-morph, e o motor lê os aliases do `tsconfig.json` ou do `jsconfig.json` do projeto.
- Next.js App Router: `page`, `layout`, `route.ts`, Server Actions (`'use server'`) e componentes de cliente (`'use client'`).
- Next.js Pages Router: páginas com `getServerSideProps` ou `getStaticProps` e as rotas de `pages/api`.
- Interceptação de requisição: `proxy.ts` no Next 16 e `middleware.ts` nas versões anteriores.
- React com Vite: componentes, hooks próprios e react-router.
- JS e TS sem framework: utilitários, serviços, pacotes e scripts Node. Num pacote, os exports públicos são as pontas do fluxo.
- Dados: Prisma como ponto de leitura e escrita; `fetch` e clientes HTTP comuns.
- O que revisar: `keg diff` sem argumento pega tudo o que mudou desde o último commit, arquivos novos inclusive. Com argumentos, vale a sintaxe do `git diff`: `keg diff --staged`, `keg diff HEAD~1 HEAD` para um commit, `keg diff main...HEAD` para o branch inteiro.
- Saídas: `review.json`, a página local e o feedback em forma de prompt para o agente.

**Fica para depois**

- PHP, Java e outras linguagens. O caminho é trocar o analisador pelo LSP da linguagem.
- Vue, Svelte e Astro: os arquivos `.vue`, `.svelte` e `.astro` pedem outro analisador.
- Monorepo com vários `tsconfig`. No MVP, rode o `keg diff` dentro do pacote que mudou.
- Pull request no GitHub, CI e revisão em equipe.
- CSS e arquivos de configuração: aparecem como arquivos alterados, sem fluxo.

## Arquitetura

O keg diff tem duas metades que só se falam por um arquivo: o motor, o comando `keg diff` em Node (pacote `keg-diff`, binário `keg`), analisa o diff e grava o `review.json`; um servidor local entrega esse arquivo a uma página web em Vite e React.

&#91;embedded content: arquitetura do revisor · motor, contrato e página local\]

O motor roda sem a tela, o que permite testá-lo com diffs reais desde o primeiro dia, e a tela pode ser refeita sem tocar no motor. A página grava as suas decisões no `estado.json` pelo servidor, pede a narração de um fluxo quando você o abre e devolve o feedback ao agente.

| Peça | Escolha | Por quê | Troque quando |
| --- | --- | --- | --- |
| CLI | Node com `parseArgs` de `node:util` | Zero dependência para meia dúzia de opções | Os comandos crescerem (commander) |
| Git | `git` via `child_process` | São os mesmos comandos que você roda no terminal | Dificilmente |
| Análise | ts-morph | API do compilador do TypeScript: referências e tipos reais | Quiser PHP ou Java (LSP) |
| Servidor | `node:http` com SSE | Uma rota de JSON, uma de estado e uma de eventos | Surgir uma API de verdade (Hono) |
| Web | Vite, React e TypeScript, como SPA | Ferramenta local não precisa de SSR; o build vira arquivos estáticos dentro do pacote | Dificilmente |
| Diff | `@pierre/diffs` | Diff para web com Shiki, lado a lado ou empilhado, anotações por linha | Precisar de algo menor (react-diff-view) |
| Grafo | React Flow (`@xyflow/react`) com `elkjs` | Nós são componentes React; o ELK desenha em camadas, da esquerda para a direita | Grafos com milhares de nós (Cytoscape) |
| IA | `claude -p` da sua assinatura, atrás de um adaptador | Sem chave nem custo de API; trocar de provedor não mexe no resto | A revisão de diff for para outra LLM (adaptador compatível com OpenAI) |

**Por que não Next na ferramenta.** Você domina Next, mas aqui ele só traria peso: são três endpoints locais, sem SEO e sem SSR. Uma SPA servida por `node:http` cabe num pacote npm e abre na hora.

## Onde o dado nasce, é processado e termina

O motor só monta um fluxo quando acha as duas pontas: uma fonte, onde o dado nasce, e uma saída, onde ele termina. O catálogo abaixo é o padrão para Next, React, Prisma e JS sem framework; cada projeto acrescenta o seu em `.revisao/keg.config.json`, como o cliente HTTP próprio da equipe.

| Papel | Exemplo em Next, React, Prisma ou JS sem framework | Como o motor reconhece |
| --- | --- | --- |
| Nasce | Corpo e parâmetros de rota: `request.json()`, `params`, `searchParams` | Handler exportado de `app/**/route.ts` |
| Nasce | Rotas e dados do Pages Router: `req.body`, `req.query` e o `context` de `getServerSideProps` ou `getStaticProps` | Handler default de `pages/api/**`; esses exports em `pages/**` |
| Nasce | Requisição interceptada: `request.cookies`, `request.headers`, `request.nextUrl` | Função exportada de `proxy.ts` ou `middleware.ts` |
| Nasce | Argumentos de uma Server Action | Função em arquivo ou trecho com `'use server'` |
| Nasce | Props de página do servidor: `params`, `searchParams` | Export default de `page` ou `layout` |
| Nasce | URL no cliente: `useParams`, `useSearchParams`, `useLocation`, `useRouter().query` | Chamada a esses hooks |
| Nasce | Formulário e evento: `onChange`, `onSubmit`, `FormData` | Atributo `on*` em JSX e o parâmetro do handler |
| Nasce | Resposta de rede: `fetch`, `useQuery`, `useSWR`, axios | Chamada a uma função da lista de rede |
| Nasce | Leitura do banco: `prisma.conta.findMany()` | Método de leitura de um modelo do PrismaClient |
| Nasce | Ambiente e armazenamento: `process.env`, `import.meta.env`, `localStorage.getItem`, `cookies()` | Acesso a esses objetos |
| Nasce | Contexto e estado global: `useContext`, store | Hooks da lista de estado |
| Nasce | Entrada de pacote ou script: parâmetros dos exports públicos, `process.argv`, `fs.readFile` | Arquivo que o `main`, o `exports` ou o `bin` do `package.json` aponta; chamada a `fs.read*` |
| Processa | Funções, hooks próprios, `useMemo`, `useReducer`, validação com zod, transformações | Tudo o que fica entre uma fonte e uma saída |
| Termina | Tela: o valor aparece em JSX | Expressão dentro de JSX |
| Termina | Estado local: `setSaldo(...)`, que volta como novo render | Setter de `useState` |
| Termina | Escrita no banco: `create`, `update`, `delete`, `upsert` | Método de escrita de um modelo do PrismaClient |
| Termina | Rede: `fetch` com POST, PUT ou DELETE, mutation | Chamada de rede com método de escrita |
| Termina | Resposta HTTP: `NextResponse.json`, `Response`, `res.json()` em `pages/api`, retorno de Server Action | Retorno do handler ou chamada a `res` |
| Termina | Navegação: `router.push`, `redirect`, `navigate` | Chamada a essas funções |
| Termina | Armazenamento e log: `localStorage.setItem`, `cookies().set`, `fs.writeFile`, `console.*` | Chamada a essas funções |
| Termina | Saída de pacote: o retorno dos exports públicos | Export de um arquivo que o `package.json` aponta |

**Sinais que só o front tem**, marcados no fluxo:

- **Fronteira cliente/servidor.** Dado que cruza `'use server'`, que sai do servidor como prop de um componente `'use client'` ou que volta de `getServerSideProps` e `getStaticProps` como `props` é serializado. Instância de classe, como o `Decimal` do Prisma, e função comum quebram a travessia; no Pages Router, até `Date` quebra, porque as `props` viram JSON. O passo da travessia ganha uma faixa própria.
- **Fetch para rota própria.** `fetch('/api/transacoes')` no cliente liga com `app/api/transacoes/route.ts` ou `pages/api/transacoes.ts` pelo texto da URL, e o fluxo atravessa a rede em vez de parar nela. Na volta, `Date` chega como texto mesmo com o tipo dizendo `Date`, e o passo avisa.
- **Prop que só passa adiante.** Valor que atravessa vários componentes sem ser usado vira a métrica "saltos de prop".
- **Efeito em cadeia.** `useEffect` que chama um setter cujo valor dispara outro `useEffect` é marcado: é a origem comum de render duplicado e de loop.

## Como o motor monta fluxos e órfãos

O motor faz oito passos com o compilador do TypeScript, via ts-morph; nenhum deles depende de IA.

1. **Diff em trechos.** `git diff --unified=0` dá as linhas exatas de cada trecho alterado; um segundo `git diff`, com contexto, alimenta a tela. Arquivo novo que ainda não está no git entra inteiro, como um trecho só (`git ls-files --others --exclude-standard`).
2. **Trecho em nó.** Cada trecho cai na menor declaração que o contém: função, arrow atribuída a `const`, método, componente, hook ou instrução de módulo. O nó se chama `arquivo#símbolo`.
3. **Vizinhos.** Para cada nó alterado, o motor pega quem o chama (`findReferences`) e quem ele chama (as chamadas dentro dele, resolvidas até a declaração). Em JSX, `<Extrato saldo={saldo} />` vira uma aresta "renderiza" que carrega a prop.
4. **Ligações que o compilador não vê.** Três ligadores extras: callback passado como prop (`onSalvar={salvar}` e a chamada `onSalvar()` no filho); `fetch` com URL literal para o `route.ts` ou o arquivo de `pages/api` correspondente; e o `props` de `getServerSideProps` ou `getStaticProps` para o componente da mesma página. URL montada com template string vira aviso, não aresta.
5. **Busca das pontas.** A partir de cada nó alterado, uma busca em largura anda para trás até uma fonte e para frente até uma saída, com limite de 6 saltos em cada direção. O caminho encontrado é um fluxo.
6. **Junção e ordem.** Fluxos que compartilham nós viram um só. A ordem na tela vai do maior risco ao menor: escrita no banco e resposta HTTP primeiro, tela por último.
7. **Tipos em cada salto.** Em cada aresta, o tipo que entra e o que sai (`getType().getText()`), com o nome do alias preservado e corte em 60 caracteres. Em JS, o tipo vem da inferência do compilador e do JSDoc; parâmetro sem anotação aparece como `any`.
8. **Órfãos e métricas.** Nó alterado que não cai em nenhum caminho vira órfão, assim como arquivo novo que ninguém importa — menos as entradas: arquivos de rota do Next, `proxy.ts` ou `middleware.ts` e o que o `package.json` aponta. As métricas saem de graça: arquivos novos, saltos por fluxo, fronteiras cruzadas.

**Trade-off de desempenho.** `findReferences` precisa do projeto inteiro carregado, então a primeira análise de um projeto Next médio pode levar alguns segundos. No `--watch`, o `Project` do ts-morph fica em memória e só os arquivos tocados são recarregados. Carregar só a vizinhança seria mais rápido, mas perde chamadores distantes; fica para quando o tempo incomodar.

## Contrato review.json

O `review.json` é a única coisa que a tela conhece: se ele estiver certo, a tela pode ser reescrita sem tocar no motor. Escreva estes tipos antes de qualquer outra linha.

```ts
// .revisao/review.json — o motor escreve, a tela só lê
type Papel = 'nasce' | 'processa' | 'termina'

interface Revisao {
  versao: 1
  geradoEm: string                 // ISO
  base: string                     // "HEAD", "main"...
  arquivos: ArquivoAlterado[]
  fluxos: Fluxo[]
  orfaos: Orfao[]
  metricas: Metricas
}

interface ArquivoAlterado {
  caminho: string
  status: 'novo' | 'alterado' | 'removido'
  hunks: Hunk[]
}

interface Hunk {
  id: string                       // hash do conteúdo: a decisão de revisão se prende a ele
  linhas: [inicio: number, fim: number]
  patch: string
}

interface Fluxo {
  id: string
  titulo: string                   // "POST /api/transacoes"
  risco: 'alto' | 'medio' | 'baixo'
  passos: Passo[]
}

interface Passo {
  id: string
  papel: Papel
  simbolo: string                  // "salvarTransacao"
  arquivo: string
  linhas: [number, number]
  tipoEntrada?: string
  tipoSaida?: string
  hunkIds: string[]                // vazio = passo de contexto, sem alteração
  fronteira?: 'cliente-servidor' | 'http'
  explicacao?: { frases: { texto: string; linhas: [number, number] | null }[]; modelo: string }
}

interface Orfao {
  arquivo: string
  simbolo?: string
  hunkIds: string[]
  motivo: 'sem-chamador' | 'sem-saida' | 'arquivo-sem-import'
}

interface Metricas {
  arquivosNovos: number
  arquivosAlterados: number
  saltosMaximo: number
  fronteirasCruzadas: number
  divergenciasDoManifesto: number
}

// .revisao/estado.json — a tela escreve; a chave é o hash do hunk
type Estado = Record<string, {
  decisao: 'revisado' | 'codigo-morto' | 'falso-positivo' | 'comentado'
  comentario?: string
  em: string
}>
```

A cobertura é a fração de hunks com decisão. Como a chave é o hash do conteúdo, um trecho que o agente mudar depois volta sozinho para "não revisado".

## Narrador: explicações com âncora, pela sua assinatura

A IA escreve no máximo três frases por passo, cada uma presa a linhas reais do passo, e passa pelo Claude Code da sua assinatura: o keg diff roda o `claude -p` instalado na máquina e nunca chama a API com chave. Sem o narrador, a ferramenta continua inteira; só faltam as frases.

- **Uma chamada por fluxo, sob demanda.** O fluxo só é narrado quando você o abre; o Panorama tem um botão "narrar todos". O prompt leva o fluxo inteiro — código de cada passo com números de linha, trechos alterados, tipos, papéis e vizinhos —, e só os passos alterados recebem frases.
- **Regras do prompt:** descrever o que o código faz, não o que deveria fazer; no máximo 25 palavras por frase; nada de elogio; suspeita começa com "atenção:".
- **Validação:** JSON fora do formato ganha uma nova tentativa; linhas fora do intervalo do passo marcam a frase.
- **Cache:** `.revisao/cache/<hash do prompt + código do fluxo>.json`. Fluxo sem trecho novo não é narrado de novo, e o motor já monta o `review.json` com o que está no cache.
- **Privacidade e termos:** o código vai para o mesmo serviço a que o Claude Code já manda o projeto. O keg diff chama o binário oficial com o seu login, nunca lê nem repassa o token e não usa o Agent SDK: para produtos feitos com ele, os [termos do Claude Code](https://code.claude.com/docs/en/legal-and-compliance) pedem chave de API.

**Como o keg diff fala com o Claude sem custo de API.** Ele não chama a API: roda o próprio Claude Code em modo não interativo, que usa o login da sua assinatura e gasta do mesmo limite de uso do Claude e do Claude Code. Cada fluxo vira uma chamada assim, numa pasta temporária vazia:

```bash
env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN \
    -u CLAUDE_CODE_USE_BEDROCK -u CLAUDE_CODE_USE_VERTEX -u CLAUDE_CODE_USE_FOUNDRY \
  claude -p --safe-mode --tools "" --model sonnet \
    --system-prompt-file narrador.md \
    --output-format json --no-session-persistence \
  < fluxo.txt
```

| Parte | Para quê |
| --- | --- |
| `env -u ANTHROPIC_API_KEY ...` | No `-p`, uma chave no ambiente vence a assinatura e vira cobrança de API; o processo do narrador nasce sem ela |
| `--safe-mode` | Desliga CLAUDE.md, skills, plugins, hooks e MCP, e o login continua valendo. Sem ele, os hooks do Roteiro 2 rodariam typecheck e knip a cada narração. O `--bare` também desliga tudo isso, mas não aceita o login da assinatura |
| `--tools ""` | Sem ferramentas: o narrador só lê o que recebe e só devolve texto |
| `--system-prompt-file` | Troca o prompt de sistema do Claude Code pelas regras do narrador: menos tokens por chamada e nenhuma instrução de agente de código |
| `--model sonnet` | Gasta menos do limite que o Opus; dá para trocar no `keg.config.json` |
| `--output-format json` | Devolve `result`, o texto da resposta, e `is_error`. O `total_cost_usd` que vem junto é estimativa do próprio Claude Code; na assinatura, o que a chamada gasta é o uso incluído no plano |
| `--no-session-persistence` | A chamada não fica salva entre as suas sessões |
| Pasta temporária vazia | Nenhum `.claude/settings.json` de projeto entra no caminho; um `env` ou `apiKeyHelper` ali trocaria o login |

**Três travas contra custo:**

1. Antes da primeira chamada, o keg diff roda `claude auth status` no mesmo ambiente e na mesma pasta. Só narra com `authMethod` igual a `claude.ai`, o login da assinatura, ou `oauth_token`, o token do `claude setup-token`, também da assinatura. Com `api_key`, `api_key_helper` ou `third_party`, não narra e mostra o motivo; com `none`, pede para você entrar com `claude`.
2. Resposta com `is_error`, como a de limite de uso atingido, pausa a narração até você pedir de novo. O cache continua valendo, e nada é repetido sozinho.
3. O "uso extra" do plano, quando ativado, continua depois do limite e é cobrado à parte. Com ele desligado, o pior caso é a pausa do item 2.

Saída exigida do modelo, um item por passo alterado:

```json
{ "passos": [
  { "id": "p2", "frases": [
    { "texto": "Valida o corpo com zod e converte reais em centavos.", "linhas": [5, 9] },
    { "texto": "atenção: valor negativo passa pela validação.", "linhas": [6, 6] }
  ] }
] }
```

Os provedores entram por um adaptador com a mesma função (`narrar(fluxo) → Explicacao[]`):

| Adaptador | Como funciona | Quando usar |
| --- | --- | --- |
| `claude-cli` | Roda o comando acima e lê o campo `result` | Padrão: usa sua assinatura, sem chave de API, e conta no seu limite de uso |
| `openai-compat` | `fetch` para uma URL compatível com OpenAI, com a chave da outra LLM numa variável de ambiente | Depois, se a revisão de diff for para outra LLM com chave só para isso |
| `nenhum` | Pula a narração; o passo mostra a frase mecânica | `keg diff --sem-ia`, diff sensível ou máquina sem login |

**Sem o narrador, o keg diff continua inteiro.** Fluxos, tipos, diff, mapa, órfãos, cobertura e feedback vêm do motor. No lugar das frases, cada passo mostra uma frase mecânica montada do grafo, como "recebe `TransacaoInput` de `POST`, chama `parseTransacao` e entrega `Transacao` a `salvarTransacao`".

| Situação | O que o passo mostra |
| --- | --- |
| Fluxo já narrado, sem trecho novo | As frases do cache, na hora e sem chamada |
| Login da assinatura em ordem | As frases, assim que a chamada volta |
| Limite de uso atingido | A frase mecânica nos fluxos ainda não narrados e um aviso no topo; o cache continua valendo |
| Sem login, chave de API no ambiente ou `keg diff --sem-ia` | A frase mecânica, com o motivo no topo da página |

## Telas web

A tela principal é a do fluxo: linha do tempo dos passos à esquerda e diff do passo à direita. O protótipo da conversa é o rascunho da coluna da esquerda.

| Tela | Pergunta que responde | O que tem |
| --- | --- | --- |
| Panorama | "Qual o tamanho disso?" | Cartões de arquivos novos e alterados, fluxos, órfãos, saltos máximos e cobertura; fluxos ordenados por risco; divergências com o manifesto do agente |
| Fluxo | "O que esse caminho faz?" | Linha do tempo nasce → processa → termina; diff do passo; frases da IA, ou a frase mecânica sem IA, acima do diff, e passar o mouse numa frase acende as linhas da âncora; botões revisado e comentar |
| Mapa | "Quem chama isso?" | React Flow com layout em camadas do ELK, da fonte à esquerda até a saída à direita; nós alterados cheios e vizinhos tracejados; clique expande os vizinhos, como no diagrama do PHPStorm; a fronteira cliente/servidor aparece como faixa |
| Órfãos | "O que ficou solto?" | Cada órfão com seu diff e três decisões: código morto, revisei, falso positivo |
| Fechamento | "Terminei?" | Cobertura em 100%, nota de 1 a 5 para a sensação de controle e o feedback pronto para colar no agente |

- **Atalhos:** `j` e `k` passam de passo · `x` marca revisado · `c` comenta · `m` abre o mapa · `?` mostra a ajuda.
- **Estado:** cada decisão vai por POST ao servidor local, que grava `.revisao/estado.json` com a chave no hash do hunk.
- **Diff:** o `@pierre/diffs` renderiza com Shiki, alterna entre lado a lado e empilhado e tem um sistema de anotações por linha — é nele que entram as frases da IA e os seus comentários ([diffs.com](https://diffs.com/)).

## Integração com os agentes

O executor declara o fluxo que acha que fez, o motor calcula o fluxo que o código realmente tem, e a ferramenta mostra onde os dois discordam — é conferir a mercadoria com a nota fiscal.

**Manifesto.** Ao terminar, o executor grava `.revisao/manifesto.json` (as instruções para ele estão no Roteiro 2):

```json
{
  "tarefa": "Cadastrar transação",
  "fluxos": [{
    "nome": "POST /api/transacoes",
    "nasce": "app/api/transacoes/route.ts:8",
    "passos": ["lib/transacao.ts:5 parseTransacao", "lib/transacao.ts:21 salvarTransacao"],
    "termina": "app/api/transacoes/route.ts:15"
  }]
}
```

**Divergência.** Duas situações viram alerta no Panorama: passo declarado que não existe no código (o agente descreveu algo que não fez) e fluxo calculado que não está no manifesto (o agente fez algo que não contou). A segunda é a mais grave.

**Feedback.** Comentários e órfãos marcados viram `.revisao/feedback.md`, com um botão "copiar como prompt":

```markdown
Revisão de feat/nova-transacao: 2 ajustes
1. lib/transacao.ts:21 (salvarTransacao): o saldo não é recalculado quando a transação é excluída.
2. lib/utils/formatarMoeda.ts: código morto, apague.
```

**Ciclo fechado.** Com `keg diff --watch`, o servidor observa os arquivos e avisa a página por SSE quando o agente corrige. Os trechos alterados voltam para "não revisado" e o resto mantém a decisão.

## Fases e critérios de pronto

As Fases 0 a 2 já entregam uma ferramenta de uso diário, sem IA; narrador e mapa entram depois, quando o motor estiver confiável.

&#91;embedded content: roteiro do revisor · 7 fases, cada uma com o seu portão\]

Pense em cada fase como um fim de semana de trabalho: se uma passar de dois, o escopo dela cresceu e vale cortar.

**A Fase 0 é a que mais rende.** Escolha três diffs reais gerados por agentes nos seus projetos — um de rota, um de componente e um que atravesse cliente e servidor. Salve cada um em `fixtures/` com o `review.json` que você espera, escrito à mão. Esses três viram os testes de snapshot do motor: toda mudança no algoritmo roda contra o seu gabarito.

## Riscos e decisões em aberto

O maior risco é a ferramenta desenhar um fluxo errado com cara de certo; por isso todo salto que o compilador não prova aparece tracejado e com aviso.

| Risco | Efeito | Mitigação |
| --- | --- | --- |
| Chamada dinâmica: callback em prop, contexto, evento | O fluxo quebra no meio | Ligador de props e callbacks; o que sobrar vira salto tracejado "dinâmico" |
| `fetch` com URL montada | Cliente e servidor não se ligam | Ligar só URL literal; template string vira aviso no passo |
| Barrel files (`index.ts`) e aliases (`@/`, `@pages`) | A referência aponta para o lugar errado | ts-morph com o `tsconfig` ou o `jsconfig` do projeto; em projeto Vite, ler também os aliases do `vite.config` |
| Projeto grande | A primeira análise demora | `Project` em memória no `--watch`; medir antes de otimizar |
| Tipo genérico enorme | Etiqueta ilegível | Corte em 60 caracteres, mantendo o nome do alias |
| JS sem tipos | Etiqueta pobre, com `any` nos parâmetros | Inferência do compilador e JSDoc; a etiqueta mostra o `any` em vez de esconder |
| IA inventando | Explicação errada com cara de certa | Âncora obrigatória e marcação; a ferramenta funciona sem IA |
| Narração gastando a assinatura | O limite de uso acaba e trava os seus agentes | Uma chamada por fluxo, só quando você abre; cache; Sonnet; pausa no primeiro aviso de limite |
| Chave de API no ambiente | A narração vira cobrança de API | `claude auth status` antes de narrar e as variáveis de chave fora do processo |
| Diff gigante, como uma refatoração geral | Revisão impossível de fechar | Aviso acima de um limite inicial de 40 hunks: peça ao agente para fatiar a tarefa |

Decisões que são suas:

- [x] Nome: keg diff. O nome `keg-diff` está livre no npm; o pacote instala o comando `keg`, e você digita `keg diff`.
- [x] Narrador no trabalho: a assinatura do Claude, pelo `claude -p`, sem chave de API.
- [x] Escopo: todo o front em JS e TS — Next com App Router ou Pages Router, Vite e módulos sem framework.
- [ ] Se o keg diff vira pacote npm para a equipe ou fica pessoal.
- [ ] Qual LLM e qual chave usar, se um dia a revisão sair da assinatura.

## Como medir se está funcionando

O keg diff funciona se você revisa mais rápido, acha mais problemas antes do commit e fecha cada revisão com nota alta de controle. Antes de começar a Fase 1, cronometre cinco revisões do jeito de hoje: é a linha de base. Depois, a própria página registra os números em `.revisao/historico.jsonl`, uma linha por revisão.

| Métrica | Como medir | Sinal de que funciona |
| --- | --- | --- |
| Tempo por revisão | Cronômetro da página, da abertura aos 100% | Cai em relação à linha de base |
| Achados antes do commit | Comentários exportados por revisão | Sobe no começo e depois estabiliza |
| Bugs que escaparam | Bugs achados depois em código já revisado | Cai |
| Sensação de controle | Nota de 1 a 5 no fechamento | Fica em 4 ou 5 |
| Precisão do motor | Passos marcados como falso positivo | Raro; passando de 1 em cada 10, o motor precisa de ajuste |
| Consumo do narrador | Chamadas e avisos de limite por revisão, no `historico.jsonl` | Nenhuma chamada com chave de API, e o limite não acaba por causa da revisão |
| Disciplina dos agentes | Divergências com o manifesto e arquivos novos por tarefa | Caem conforme o Roteiro 2 faz efeito |

## Fontes

Enquanto o keg diff não existe, o difit (diff local no estilo do GitHub) e o hunk (diff no terminal com anotações de agentes) cobrem a revisão arquivo a arquivo.

- [hunk — visualizador de diff para mudanças de agentes](https://github.com/modem-dev/hunk)
- [critique — diff no terminal com explicação por IA](https://github.com/remorses/critique)
- [difit — diff local no estilo do GitHub](https://github.com/yoshiko-pg/difit/wiki)
- [@pierre/diffs — renderização de diff para web](https://diffs.com/)
- [Claude Code: boas práticas, incluindo `claude -p` com saída JSON](https://code.claude.com/docs/en/best-practices.md)
- [Claude Code em modo não interativo: `claude -p`, saída JSON e `--bare`](https://code.claude.com/docs/en/headless)
- [Referência da CLI: `--safe-mode`, `--tools` e `claude auth status`](https://code.claude.com/docs/en/cli-reference)
- [Ordem de autenticação: no `-p`, a chave de API vence o login](https://code.claude.com/docs/en/authentication)
- [Claude Code com o plano Pro ou Max: chave no ambiente vira cobrança de API, e o limite é compartilhado](https://support.claude.com/en/articles/11145838)
- [Termos do Claude Code: login da assinatura e Agent SDK](https://code.claude.com/docs/en/legal-and-compliance)
- [Next.js 16: `proxy.ts` no lugar do `middleware.ts`](https://nextjs.org/blog/next-16)
- [O que atravessa a fronteira dos Server Components: `Date` passa, instância de classe não](https://dev.to/seydi_charyev_3772861015f/what-actually-crosses-the-react-server-component-boundary-4fjg)
