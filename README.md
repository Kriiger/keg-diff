# keg diff

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo/logo-horizontal-escuro.svg">
    <img src="assets/logo/logo-horizontal.svg" alt="keg diff" height="64">
  </picture>
</p>

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
keg diff --watch         # fica observando os arquivos e analisa de novo quando o agente corrige
keg historico            # resumo das últimas revisões e as medianas (keg historico 20 mostra 20)
```

O terminal mostra o tempo de cada análise, dividido em abrir o projeto no ts-morph e montar os fluxos (por exemplo, `9.8s (projeto aberto 2.4s, fluxos 6.9s)`). Num projeto grande a primeira análise demora, e o `--watch` cuida do resto: o ts-morph e a thread de análise ficam vivos entre uma análise e outra, e só os arquivos que mudaram são lidos de novo (`projeto em memória`). Num monorepo de 1.700 arquivos, cada análise nova cai de uns 9,5 s para uns 3 s; mudar o `tsconfig`, o `package.json` ou o lockfile reabre o projeto inteiro.

A saída mostra cada fluxo do nasce ao termina, com os passos alterados (●) e os de contexto (○), e os órfãos: trechos alterados que não estão em nenhum caminho entre uma fonte e uma saída. Arquivos de teste ficam numa lista à parte.

Em seguida a página de revisão abre no navegador, servida em `http://127.0.0.1:4747` até você apertar Ctrl+C:

- **Lateral:** um painel de vidro à esquerda, igual nos dois modos: a marca e o progresso da revisão (um anel com o percentual e "N de M trechos revisados") no topo, as seções recolhíveis no meio (no modo fluxo, Fluxos com o ícone na cor do risco e Fora dos fluxos; no modo árvore, Arquivos) e, no modo fluxo, o Fechamento preso embaixo. O item atual é uma pílula preenchida e cada linha mostra à direita quantos trechos já têm decisão. O botão no canto do painel (ou a tecla `s`) recolhe a lateral inteira e o conteúdo ocupa a largura toda; em telas de até 860px ela vira uma gaveta sobre o conteúdo e fecha ao escolher um destino.
- **Panorama:** o resumo da mudança numa grade de cartões, todos calculados pelo motor sem IA. No topo, uma faixa com o progresso, os arquivos, as linhas `+`/`−`, os trechos e a estimativa de leitura (com o seu `historico.jsonl`, a mediana de segundos por trecho; sem histórico, um ritmo de referência de 300 linhas por hora, dito na própria faixa). Depois: o **mapa de risco** (fluxos e trechos por risco e os passos para ver primeiro, com o motivo), os **commits** do intervalo, os **fluxos** (entrada, saída, camadas e progresso), os **sinais de atenção** (TODO e FIXME, `console.log`, `debugger`, `@ts-ignore`, `any`, funções com mais de 80 linhas ou complexidade acima de 15, arquivos com mais de 300 linhas e o que o compilador não prova), os **arquivos** que mais mudaram, as **pastas** e os **tipos de arquivo**, os **testes** (código alterado com e sem teste de mesmo nome), os **símbolos** novos, alterados e removidos com a **API pública** que mudou (assinatura antes e depois), os **endpoints HTTP** tocados, as **dependências** do `package.json` e o **grafo** (concentradores de chamadas, ciclos e órfãos). Cartão sem dado não aparece. Os links levam ao passo do fluxo ou, para um arquivo, abrem o modo árvore nele. Os dados que só o git e a sintaxe sabem vão no campo `panorama` do `review.json`; um `review.json` antigo, sem ele, mostra só os cartões que o resto do arquivo permite.
- **Fluxo:** a linha do tempo nasce → processa → termina à esquerda e o diff do passo à direita. Passo de contexto mostra o código atual, colorido com o mesmo realce e o mesmo tema dos diffs e numerado a partir da linha de verdade.
- **Contexto e arquivo completo:** o `review.json` guarda cada trecho sem linhas em volta (`git diff --unified=0`), mas a tela mostra a mudança com 3 linhas de contexto de cada lado, lidas do arquivo na ponta de chegada do diff (o diretório de trabalho, o stage ou o commit que o `panorama.intervalo` registra; `GET /api/arquivo`, só para arquivo que o `review.json` cita). Embaixo de cada bloco do diff uma linha diz quantas linhas ficam escondidas e deixa pedir mais, 20 de cada vez ou todas até o trecho vizinho (o trecho vizinho que a tela não mostra, de outro passo, limita o contexto: as linhas dele não existem do mesmo jeito nos dois lados). O arquivo é buscado uma vez e dividido entre os passos e os trechos da árvore; se ele não bater com os trechos (mudou depois do `keg diff`), o diff volta a aparecer sem contexto. Comentário por linha, realce das frases do narrador e o lado a lado seguem iguais, porque os cabeçalhos do patch levam os números de linha de verdade.
- **Passo já visto em outro fluxo:** o mesmo trecho aparece em vários fluxos (o componente pai, por exemplo). Na ordem em que a lateral lista os fluxos, o primeiro que traz o passo é onde ele se lê; nos seguintes, o passo alterado cujos trechos todos já estão num passo de um fluxo anterior abre recolhido e esmaecido, com o rótulo "já visto em <fluxo>", um link para o passo lá, e o botão "abrir aqui" que o expande (ele segue decidível: a decisão é presa ao hash do trecho e vale nos dois fluxos). É derivado do `review.json`, não do que você clicou. `j` e `k` pulam esses passos, o `n` também não para neles (o trecho pendente é alcançado no fluxo de origem) e o clique na lateral, no mapa ou no link chega neles. Os contadores não mudam: cada fluxo conta os trechos dele e o total geral conta cada trecho uma vez.
- **Componente React é uma unidade:** em código React o fluxo seguia a árvore de componentes. Agora o componente (função de nome maiúsculo num `.tsx`/`.jsx`) e o hook (`use…`) são um passo só: os handlers, os callbacks de `useEffect`, os `useMemo`/`useCallback` e as funções locais de dentro deles não viram passos à parte, e as linhas e os trechos do passo do componente cobrem os deles (o `fetch` ou o `setState` dentro de um handler continua contando como a saída do componente). Renderizar um filho (`<Filho />`) também só encadeia o filho como próximo passo quando algo corre entre os dois: uma prop com expressão (o dado ou o callback), um spread ou um filho que seja expressão. Sem isso é composição de layout (`<Lateral><Conteudo /></Lateral>`, `<Icone nome="x" />`), que o mapa ainda desenha mas o fluxo não segue. O pai de composição só serve de origem quando o filho não tem outra. Um componente que chama vários endpoints do projeto fica num fluxo só, com uma saída por endpoint, em vez de um fluxo por endpoint repetindo o componente.
- **Fluxos parecidos viram um:** cada componente tem a própria saída, então o pai de vários filhos alterados aparecia como "nasce" em um fluxo por filho, todos com quase os mesmos trechos. Depois de montar os fluxos, o motor junta os que dividem os trechos alterados: quando o menor tem pelo menos 80% dos trechos dentro do outro, os dois são refeitos como um só (do par mais parecido para o menos). O fluxo juntado tem os passos sem repetição, o risco da saída mais arriscada, a entrada do fluxo mais arriscado e um título com o começo e as saídas depois da seta (`App → Mapa, Lateral`, e `, +N` quando passam de três). Junção que passaria de 32 passos não acontece. O id sai das unidades do fluxo, então continua estável, e só o fluxo juntado é narrado de novo.
- **Mapa:** responde "quem chama isso?" sem sair do fluxo. Abre num painel embaixo da tela (tecla `m` ou o botão Mapa), com o diff do passo ainda em cima. O React Flow desenha e o ELK organiza em camadas, da fonte à esquerda até a saída à direita. Nó alterado é cheio; vizinho sem alteração é tracejado; o passo atual mostra quem o chama, e clicar num nó mostra os vizinhos dele e, se ele é um passo ou um trecho alterado, leva até ele (também em outro fluxo). A fronteira cliente/servidor aparece como uma faixa. As ligações têm traço próprio, com legenda no cabeçalho: chamada (contínua), `http` (o `fetch` para uma rota do projeto, tracejada), `dinâmico` (o callback passado em prop, que o compilador não prova, traço e ponto), `usa tipo` (o tipo ou a interface numa anotação, pontilhada fina com ponta só de contorno) e `volta` (a ligação que anda para trás num ciclo, em roxo e com o rótulo). Apontar um bloco ou uma ligação (mouse ou Tab) isola o que importa e esmaece o resto: as ligações que saem do bloco ficam em azul e as que chegam, na cor do texto, e cada bloco ligado ganha uma etiqueta (`chama`, `chamado`, `ida e volta`), então o destaque não depende só da cor. Clicar num bloco ou numa ligação mantém o destaque (o bloco leva a etiqueta `fixado`), e clicar no fundo solta. O passo atual leva uma barra à esquerda. O mapa abre inteiro quando cabe num zoom legível; quando não cabe, abre no passo atual com quem se liga a ele e o cabeçalho avisa "+N fora da vista" (`f` ou o botão mostra tudo). O Tab percorre os blocos, o Enter age como o clique. O grafo vem do `review.json` (campo `grafo`): as funções alteradas, os passos dos fluxos e os vizinhos até 2 saltos, com no máximo 5 vizinhos por lado e o aviso "+N" do que ficou de fora.
- **Modo árvore:** o jeito tradicional de ler um diff, ao lado do modo fluxo. Um seletor em pílula (Fluxo | Árvore) fica no canto superior direito e a tecla `v` faz o mesmo; as setas movem entre as duas opções e a troca é uma transição suave (View Transitions, sem animação com movimento reduzido); a escolha fica neste navegador, em `keg-modo`. A lateral vira a árvore de pastas com os arquivos alterados: pastas recolhíveis, pasta com uma única subpasta compactada (`src/web/estilo`), pastas antes de arquivos em ordem alfabética, a letra do status (A adicionado, M modificado, D removido, R renomeado), `+N −M` por arquivo e o total em cada pasta. A área principal mostra o arquivo escolhido trecho a trecho, e cada trecho oferece o que um passo do fluxo oferece: as **frases do narrador** que caem nele (as dos passos de qualquer fluxo cujas linhas tocam o trecho e as dos órfãos do arquivo, sem repetir a mesma frase, com o "+ correção" e o realce das linhas no diff ao passar o mouse), os botões de decisão (revisado; nos órfãos, também código morto e falso positivo, e o selo "órfão" avisa) e o comentário geral e por linha. Trecho com passo ou órfão ainda sem narração mostra um link discreto "narrar", que pede a narração do fluxo ou do grupo de órfãos (a árvore não narra sozinha). No topo do arquivo, "Aparece nos fluxos" lista os passos dele em cada fluxo, e o clique leva ao passo no modo fluxo. O diff de cada trecho só é montado quando chega perto da tela. O cursor é um trecho dentro do arquivo: `j` `k` andam pelos trechos e, passando da ponta, entram no arquivo vizinho da lateral (no primeiro trecho indo para a frente, no último voltando); `x` marca o trecho atual e leva o cursor ao próximo trecho sem decisão (dando a volta, como o `n`); `X` (shift+x) marca o arquivo inteiro e passa ao seguinte; `d` e `f` valem no órfão; `c` comenta o trecho atual. `n`, `[`, `]`, `p` e `t` só valem no modo fluxo. O renome vem do git (`-M`) no campo `renomeadoDe` do `review.json`; um renome sem mudança de conteúdo aparece sem diff.
- **Fechamento:** responde "terminei?". Mostra a cobertura (com destaque em 100%), o que ainda falta, uma nota de 1 a 5 para a sensação de controle, os **achados do Claude** e o feedback pronto para o agente, com o botão "copiar como prompt". Em "Achados do Claude" ficam as frases com `atenção:` que o narrador escreveu em todos os passos alterados e nos órfãos, cada uma com uma caixa de seleção e o link para o passo (ou para o órfão): marcada, a frase entra no feedback ("incluir todos" e "tirar todos" mexem em todas de uma vez). As outras frases do narrador também podem ir, pelo botão "+ correção" no fim da linha delas, no próprio passo. Comentar e marcar como revisado convivem: o comentário é um anexo do trecho, e marcar, desmarcar ou trocar a marca não o apaga (o botão vira "Editar comentário"; salvar o texto vazio é o que o remove). Ao comentar, um seletor de dois estados escolhe o tipo: **corrija** (padrão, uma ordem para o agente) ou **dúvida** (uma pergunta que o agente responde sem mudar o código); `⌥D` alterna dentro da caixa. O comentário salvo mostra o tipo num rótulo pequeno, e o tipo é gravado e apagado junto com o comentário no `estado.json` (`tipoDoComentario`; ausente vale `corrija`).
- **Comentário por linha:** em qualquer diff (fluxo, grupos de trechos e árvore), passar o mouse numa linha mostra um `+` ao lado do número dela; clicar abre ali mesmo, embaixo da linha, a mesma caixa de comentário (seletor corrija/dúvida, `⌥D`, `⌘↵` salva, `esc` fecha). O salvo fica como anotação embaixo da linha, com Editar e Apagar (texto vazio também apaga), e a linha que recebe a caixa fica realçada. Vale a linha removida também. O comentário de linha convive com a marca e com o comentário geral do trecho e conta como comentário: o trecho só com comentário de linha já tem decisão (`✎`, cobertura e progresso). Ele pertence ao trecho, então some sozinho quando o agente refaz o trecho. No `estado.json` fica em `linhas`, na entrada do trecho, com a chave sendo a posição da linha no corpo do trecho (não o número no arquivo, que muda quando o agente edita acima).
- **Órfãos, testes e outros trechos:** o que não entrou em fluxo, cada um com o seu diff. Órfão recebe revisado, código morto ou falso positivo, e o narrador escreve até três frases sobre cada um (parece código morto? por que ninguém chama? deveria ser chamado de algum lugar ou pode ser apagado?), com o mesmo passar do mouse e o mesmo botão "+ correção" dos passos. O endereço `#orfaos/3` abre a tela já no quarto órfão.

Atalhos (a mesma lista aparece na ajuda, tecla `?`), todos fora das caixas de texto:

| Tecla | O que faz |
| --- | --- |
| `j` `k` | próximo e anterior: passo no fluxo (pulando os já vistos em outro fluxo), item nas listas, trecho na árvore (nas pontas, passa ao arquivo vizinho) |
| `n` | vai ao próximo trecho ainda não revisado, em qualquer tela, depois do ponto onde você está e dando a volta; sem nenhum, abre o fechamento |
| `[` `]` | fluxo anterior e próximo; depois do último fluxo vêm órfãos, testes e outros trechos |
| `x` | marca revisado (de novo desfaz); na árvore, o trecho atual, e o cursor vai ao próximo trecho sem decisão |
| `X` | na árvore, marca o arquivo inteiro como revisado (de novo desfaz) |
| `⌥D` | na caixa de comentário, alterna entre corrija e dúvida |
| `c` | comenta; `esc` cancela e `⌘↵` salva |
| `d` `f` | código morto e falso positivo, nos órfãos (também na árvore); com o mapa aberto, `f` ajusta a vista para ver tudo |
| `v` | modo fluxo ou modo árvore (o mesmo do seletor no canto superior direito) |
| `l` | diff lado a lado ou empilhado |
| `a` | aparência: alterna entre tema do sistema, claro e escuro (a escolha fica neste navegador) |
| `m` | abre e fecha o mapa do fluxo; com o mapa numa janela externa, traz essa janela à frente |
| `z` | com o mapa aberto, maximiza e restaura a altura dele (a alça no topo da gaveta ou as setas ↑ ↓ nela também mudam a altura) |
| `s` | recolhe e mostra a lateral (a escolha fica neste navegador; no celular a lateral é uma gaveta e `esc` a fecha) |
| `p` `t` | volta ao panorama; abre o fechamento |
| `1` a `5` `y` | no fechamento: dá a nota; copia o feedback como prompt |
| `esc` `?` | fecha a ajuda, o mapa ou o comentário; abre e fecha a ajuda |

Rodar o `keg diff` de novo em outro terminal atualiza a página aberta. Se o `keg diff` for interrompido (Ctrl+C), a página mostra "Servidor desligado" e tenta reconectar com esperas cada vez maiores (2 s até 30 s), sem tentar com a aba escondida; o botão "Tentar agora" força uma tentativa.

Cada decisão fica presa ao hash do trecho: se o agente mudar o trecho depois, ele volta para "não revisado". Sem terminal (num script ou num agente), o keg não abre a página.

## Histórico

Cada revisão que chega a 100% (todos os trechos com decisão) vira uma linha em `.revisao/historico.jsonl`, com os números da tabela "Como medir" do Roteiro 1. `keg historico` imprime as últimas e as medianas de tempo, achados, nota e taxa de falso positivo; se essa taxa passar de 1 em cada 10 passos, avisa que o motor precisa de ajuste.

```json
{"iniciadoEm":"2026-11-02T03:14:44.270Z","registradoEm":"2026-11-02T03:15:16.861Z","base":"HEAD","tempoSegundos":312,"achados":{"comentarios":2,"codigoMorto":1,"narrador":1},"passos":{"total":14,"falsosPositivos":1},"divergenciasDoManifesto":1,"arquivosNovos":2,"arquivosAlterados":3,"trechos":9,"nota":4,"narrador":{"chamadas":3,"avisosDeLimite":0,"login":"claude.ai"}}
```

- **Achados:** `achados` soma os comentários de tipo corrija, os órfãos de código morto e as frases do narrador levadas para a correção (`narrador`; linhas antigas não têm o campo). As dúvidas (comentários de tipo dúvida) não são defeito e ficam fora da soma, em `duvidas` (também ausente nas linhas antigas); `keg historico` mostra a coluna `dúvidas`.
- **Tempo:** segundos com a aba à vista, da abertura da página até os 100%. O servidor guarda o total em `.revisao/sessao.json`, então recarregar a página ou reiniciar o `keg diff` no meio (mesma base, menos de 12 horas) não zera o relógio. Parou nos 100% e voltou a cair (o agente corrigiu algo no `--watch`)? O relógio volta a correr até os 100% de novo.
- **Quando grava:** o servidor confere a cobertura a cada decisão e a cada nota, e grava quando chega a 100%. Revisão abandonada antes disso não deixa linha, para não enviesar as medianas. A nota dada depois dos 100% atualiza a mesma linha; uma nota de revisão anterior não vale. Cada revisão tem uma linha só (a chave é `iniciadoEm`): gravar de novo troca a linha em vez de acrescentar.
- **Passos:** `passos.total` soma os passos alterados dos fluxos e os órfãos; `falsosPositivos` conta os órfãos marcados assim.
- **Narrador:** `chamadas` conta cada execução do `claude -p` (a repetição por JSON inválido inclusive), `avisosDeLimite` as pausas por limite de uso e `login` o método que o `claude auth status` declarou.

## Agentes

**Manifesto.** Ao terminar, o agente executor grava `.revisao/manifesto.json` com o fluxo que acha que fez. O formato e as instruções para o executor estão no Roteiro 2 (seção do executor, "Ao terminar"):

```json
{ "tarefa": "Cadastrar transação", "fluxos": [{
  "nome": "POST /api/transacoes",
  "nasce": "app/api/transacoes/route.ts:8",
  "passos": ["lib/transacao.ts:5 parseTransacao", "lib/transacao.ts:21 salvarTransacao"],
  "termina": "app/api/transacoes/route.ts:15"
}] }
```

O keg compara o manifesto com os fluxos que calculou e mostra no Panorama duas divergências, também gravadas em `review.json` (`manifesto.divergencias` e `metricas.divergenciasDoManifesto`): **Não fez**, um passo ou fluxo declarado que não existe no código, e **Não contou**, um fluxo do código que o manifesto não declara (a mais grave, em vermelho). Sem manifesto, nada muda: a página só diz que não há o que conferir. Como o casamento funciona:

- O arquivo é o mesmo (`./` e prefixo de pasta de monorepo não contam).
- A linha declarada cai dentro do intervalo do passo, ou o símbolo declarado é o do passo: uma das duas basta, porque o agente erra a linha depois de editar.
- Um passo declarado existe se casa com um passo dos fluxos, com uma função alterada ou com um trecho alterado do arquivo.
- Um fluxo do código está declarado se alguma referência do manifesto (nasce, termina ou passo) casa com um passo dele que foi alterado ou que é ponta. Passo de contexto do meio não conta.

**Feedback.** Os seus comentários (do trecho ou de uma linha), as frases do narrador que você levou para a correção e os órfãos marcados como código morto viram `.revisao/feedback.md`, regerado a cada decisão, a cada frase escolhida e ao abrir o Fechamento. O comentário entra qualquer que seja a marca do trecho (revisado, por exemplo). Com ajustes, a segunda linha é a instrução para o agente (só cita o narrador quando há item dele). Comentários de tipo dúvida vão num bloco à parte, com numeração própria e a instrução de responder sem mudar o código, e o título conta os dois ("2 ajustes e 1 dúvida"; só dúvidas, "1 dúvida", sem a ordem de corrigir):

```markdown
Revisão de HEAD: 3 ajustes e 1 dúvida
Corrija cada item no código. Os itens "(apontado pelo narrador)" vieram da IA na revisão e eu confirmei.
1. lib/transacao.ts:21 (salvarTransacao): o saldo não é recalculado quando a transação é excluída.
2. lib/transacao.ts:24-26 (salvarTransacao): Valor negativo passa pela validação. (apontado pelo narrador)
3. lib/utils/formatarMoeda.ts: código morto, apague.

Responda cada pergunta sem mudar o código, a não ser que a resposta mostre um erro:
1. lib/transacao.ts:40 (excluirTransacao): por que não usa a mesma transação do banco?
```

O comentário de linha vira um item com a linha exata do código de agora: `lib/transacao.ts:23 (salvarTransacao): trate saldo negativo.` (o título conta cada um como ajuste ou dúvida, pelo tipo). Numa linha removida, que não existe mais no código, o item diz qual era: `lib/transacao.ts (salvarTransacao), linha removida 17 do código antigo (`validar(valor)`): por que isto saiu?`. O número vem do `review.json` de agora, então vale mesmo depois de o agente editar acima do trecho.


As frases escolhidas ficam em `.revisao/achados.json`, com a chave feita dos hashes dos trechos do passo e do texto da frase: se o agente corrigir o trecho, ou a narração mudar, a frase deixa de casar e sai do feedback sozinha, como o comentário.

O botão "copiar como prompt" do Fechamento copia esse texto para colar no agente. A nota do Fechamento fica em `.revisao/nota.json` (`{ "nota": 4, "em": "...", "base": "HEAD" }`).

**Ciclo fechado (`--watch`).** O servidor observa os arquivos do projeto (menos `.revisao`, `node_modules`, `.git`, `dist`, `.next`, `.turbo` e `coverage`). Quando algo muda, espera 400 ms de sossego, roda a análise de novo com os mesmos argumentos do git, regrava o `review.json` e a página atualiza sozinha. Como a decisão é presa ao hash do trecho, só o que o agente mudou volta para "não revisado"; o feedback perde os comentários dos trechos já corrigidos. Mudança no meio de uma análise vira uma análise só, depois dela. O `--watch` precisa da página: não funciona com `--sem-tela` nem sem terminal.

Num monorepo (pnpm, npm ou yarn workspaces), rode na raiz: o keg liga `@equipe/utils` ao fonte do pacote mesmo sem o `node_modules` instalado.

## Narrador

Cada passo alterado ganha até três frases curtas, cada uma presa a linhas do passo: passar o mouse numa frase acende essas linhas no diff, e frase sem âncora válida aparece marcada. Quem escreve é o `claude -p` do Claude Code instalado na sua máquina, com o login da assinatura. O keg nunca chama a API com chave, e o código do fluxo vai para o mesmo serviço a que o Claude Code já manda o projeto.

- **Sob demanda:** uma chamada por fluxo, quando você o abre; o Panorama tem o botão "Narrar todos". O resultado fica em `.revisao/cache/`, e fluxo sem trecho novo não é narrado de novo.
- **Órfãos:** são narrados quando você abre a tela Órfãos (e pelo "Narrar todos"), com um prompt próprio (`src/narrador-orfaos.md`) que pergunta se o trecho parece código morto, por que ninguém o chama e se deveria ser chamado (um esquecimento do agente) ou pode ser apagado. Para gastar poucas chamadas, os órfãos vão juntos: os do mesmo arquivo ficam na mesma chamada, e os arquivos vão enchendo o grupo até 8 órfãos ou uns 400 linhas de trecho, então poucos órfãos viram uma chamada só. Na fila, os órfãos entram depois dos fluxos. A frase `atenção:` de um órfão entra no Fechamento e no feedback como as dos passos; um `review.json` de antes dos órfãos narrados continua valendo.
- **Trava de login:** antes da primeira chamada, o keg roda `claude auth status`. Só narra com `claude.ai` ou `oauth_token`; com chave de API ou provedor de terceiros não narra e mostra o motivo no topo da página, e sem login pede para você entrar com `claude` (depois, rode o `keg diff` de novo). O processo do narrador nasce sem `ANTHROPIC_API_KEY` e as outras variáveis de chave, numa pasta temporária vazia.
- **Pausa:** uma resposta com erro, como o limite de uso, pausa a narração e mostra um aviso com o botão "Tentar de novo". Nada se repete sozinho.
- **Sem narrador:** com `--sem-ia`, sem login ou em pausa, o passo mostra uma frase mecânica montada do grafo ("recebe X de Y, chama Z e entrega W a Y"), e a página diz o motivo. Os tipos dessa frase e das etiquetas saem sem o `import("...")` do compilador e, acima de 60 caracteres, perdem primeiro o miolo dos objetos (`{ a: string; b: number }` vira `{…}`), para o nome do tipo e dos genéricos continuar legível.
- **Modelo e esforço:** `sonnet` com esforço `medium`, para gastar menos tokens. Para trocar, crie `keg.config.json` na raiz do projeto: `{ "narrador": { "modelo": "opus", "esforco": "high" } }`. O esforço aceita `low`, `medium`, `high`, `xhigh` e `max`; qualquer outro valor volta para `medium`. Mudar o esforço narra os fluxos de novo, porque o cache é por modelo e esforço. Também dá para trocar na página: o botão `Narrador: sonnet · medium` da barra de baixo abre um painel com o modelo (`haiku`, `sonnet`, `opus`, `fable` ou outro nome) e o esforço; a escolha vale na próxima chamada, sem reiniciar, e é gravada no `keg.config.json` sem apagar as outras chaves.
- **Explicar mais:** cada passo alterado do fluxo e cada trecho do modo árvore tem o botão `explicar mais`, que pede ao claude (com o modelo e o esforço acima e o prompt `src/aprofundar.md`) de 3 a 6 itens mais fundos só daquele bloco, sem repetir as frases do narrador. A resposta fica em `.revisao/aprofundamentos.json`, sobrevive ao recarregar, some sozinha quando o trecho muda e pode ser pedida de novo (`explicar de novo`). A chamada conta no consumo do narrador e respeita a pausa por limite de uso; com `--sem-ia` o botão não aparece.

## O que fica no seu projeto

| Arquivo | Para quê |
| --- | --- |
| `.revisao/review.json` | Fluxos, órfãos, métricas e o grafo de chamadas do mapa (o contrato está em `src/contrato.ts`) |
| `.revisao/estado.json` | As suas decisões na página, uma por trecho (a marca, o comentário e os comentários de linha) |
| `.revisao/manifesto.json` | Escrito pelo agente executor: o fluxo que ele diz ter feito |
| `.revisao/feedback.md` | Comentários, frases do narrador escolhidas e código morto, prontos para colar no agente |
| `.revisao/achados.json` | As frases do narrador que você levou para a correção (a chave prende a frase ao hash dos trechos do passo) |
| `.revisao/nota.json` | A nota de 1 a 5 do Fechamento |
| `.revisao/historico.jsonl` | Uma linha por revisão fechada em 100%: tempo, achados, falso positivo, nota e consumo do narrador |
| `.revisao/sessao.json` | A revisão em andamento: o tempo contado pela página e as chamadas do narrador |
| `.revisao/cache/` | As frases do narrador, uma por fluxo narrado e uma por grupo de órfãos |
| `.revisao/keg.config.json` | Opcional: chamadas próprias da equipe, como `{ "nasce": ["api.get"], "termina": ["api.post", "api.*"] }` |
| `keg.config.json` | Opcional, na raiz: o modelo e o esforço do narrador (ver Narrador). O painel do narrador na página grava aqui; é uma preferência sua, então vale pôr no `.gitignore` |

O keg acrescenta `.revisao/` ao `.git/info/exclude` do repositório, então a pasta não aparece no `git status` e o `.gitignore` do projeto não muda.

## Privacidade e segurança

O keg roda inteiro na sua máquina e não precisa de chave nem de variável de ambiente: não há `.env` para configurar.

- **Servidor local:** a página é servida só em `127.0.0.1`, e o servidor recusa pedido com outro cabeçalho `Host` (um site aberto no navegador não alcança a API). O código que a página pede sai só de arquivo que a revisão aberta cita, dentro do projeto e depois de seguir links simbólicos: `.env`, `.git/config` e o resto do disco nunca saem.
- **Credenciais:** o keg nunca lê nem guarda credencial do Claude. Ele chama o `claude` instalado, que usa o próprio login, numa pasta temporária vazia, com `--safe-mode`, sem nenhuma ferramenta e sem `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` e as variáveis de Bedrock, Vertex e Foundry no ambiente.
- **O que sai da máquina:** o diff e os trechos de código de cada pedido ao narrador (a narração e o `explicar mais`), mandados à Anthropic pela sua assinatura do Claude, o mesmo caminho do Claude Code. Com `--sem-ia` o narrador não roda e nada sai.
- **O que fica:** tudo o que o keg grava vai para `.revisao/`, que ele acrescenta ao `.git/info/exclude`. A única exceção é o `keg.config.json` da raiz, quando você troca o modelo pela página.

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

## Logo

Os arquivos da logo estão em `assets/logo/`: `icone.svg` e `icone-escuro.svg` (só o barril, para fundo claro e escuro), `icone-app.svg` (com fundo próprio, o mesmo do favicon) e `logo-horizontal.svg` e `logo-horizontal-escuro.svg` (ícone e nome; o nome é texto e usa a fonte do sistema).

## Licença

MIT. Veja o arquivo [LICENSE](LICENSE).
