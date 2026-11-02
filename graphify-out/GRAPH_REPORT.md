# Graph Report - keg-diff  (2026-11-02)

## Corpus Check
- 79 files · ~63,209 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 515 nodes · 1074 edges · 15 communities detected
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 89 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]

## God Nodes (most connected - your core abstractions)
1. `Analisador` - 27 edges
2. `Sessao` - 15 edges
3. `rodar()` - 13 edges
4. `montarPanorama()` - 10 edges
5. `idDoNo()` - 10 edges
6. `FilaDoNarrador` - 9 edges
7. `useAtalhos()` - 8 edges
8. `plural()` - 8 edges
9. `declaracaoDe()` - 8 edges
10. `receberDecisao()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `mesmoPasso()` --calls--> `idDoNo()`  [INFERRED]
  web/hierarquia.ts → src/contrato.ts
- `Mapa()` --calls--> `idDoNo()`  [INFERRED]
  web/mapa.tsx → src/contrato.ts
- `montarHierarquia()` --calls--> `idDoNo()`  [INFERRED]
  web/hierarquia.ts → src/contrato.ts
- `abrirNaArvore()` --calls--> `alternarModo()`  [INFERRED]
  web/arvore.tsx → web/modo.ts
- `progresso()` --calls--> `decididos()`  [INFERRED]
  web/lateral.tsx → web/telas.tsx

## Communities (15 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (46): idDoNo(), abrirNaArvore(), Caminho(), Barra(), Cartao(), LinkDoArquivo(), Numero(), AlertasDoManifesto() (+38 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (37): recarregarSeChunkSumiu(), formatarTempo(), useCronometro(), Decisoes(), conectar(), escutar(), reconectar(), tolerarQueda() (+29 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (30): adicionar(), Analisador, marcar(), metodoDaChamada(), padraoDaRota(), pesoDaRota(), regraDaConfig(), tipoDoSql() (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (31): ancorar(), deslocar(), CabecalhoDoMapa(), useDesenho(), Enquadramento(), useAtalhoDeAjuste(), useInteracao(), useTamanhoVisivel() (+23 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (29): gravarNota(), lerEstado(), lerNota(), ajustesDaRevisao(), contarAchados(), gravarFeedback(), lugares(), montarFeedback() (+21 more)

### Community 5 - "Community 5"
Cohesion: 0.1
Nodes (23): AlternadorDeModo(), andar(), marcar(), selecionar(), alternarModo(), aplicarTroca(), avisar(), useModo() (+15 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (28): riscoDasSaidas(), saidaPrincipal(), abrirHunk(), arquivosNaoRastreados(), coletarDiff(), darIdsAosHunks(), git(), lerPatch() (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (23): compararDependencias(), lerSecoes(), endpointsTocados(), ancestralComum(), arquivosNaPonta(), daFaixa(), descreverIntervalo(), lerDoDisco() (+15 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (16): chamarClaude(), executar(), lerJson(), verificarLogin(), FilaDoNarrador, ancoraValida(), arquivoDoCache(), codigoNumerado() (+8 more)

### Community 9 - "Community 9"
Cohesion: 0.15
Nodes (20): descreverTempos(), duracao(), esconderDoGit(), exigirRepositorio(), gerarRevisao(), imprimir(), lerConfig(), reanalisar() (+12 more)

### Community 10 - "Community 10"
Cohesion: 0.19
Nodes (12): acharRaizDoMonorepo(), caminhosDosPacotes(), entradaDoFonte(), lerJson(), lerPacotesDoPnpm(), pastasDosWorkspaces(), abrirProjeto(), acharConfig() (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.29
Nodes (11): enderecoDaLinha(), enderecoDoNo(), enderecoDoPasso(), enderecoDoSimbolo(), passosAlterados(), acrescimosDoCodigo(), arquivosGrandes(), avisosDoMotor() (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.35
Nodes (13): alterado(), colapsar(), complexidadeDe(), daClasse(), daFuncao(), daVariavel(), declaracoesDe(), funcaoDe() (+5 more)

### Community 13 - "Community 13"
Cohesion: 0.43
Nodes (7): ColunasDeCartoes(), desnivel(), distribuir(), distribuirCartoes(), empilhar(), quantasColunas(), repartir()

## Knowledge Gaps
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `idDoNo()` connect `Community 0` to `Community 3`, `Community 8`, `Community 11`, `Community 6`?**
  _High betweenness centrality (0.467) - this node is a cross-community bridge._
- **Why does `useAtalhos()` connect `Community 1` to `Community 3`, `Community 5`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **Why does `Sessao` connect `Community 4` to `Community 8`, `Community 1`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `rodar()` (e.g. with `resumirHistorico()` and `lerHistorico()`) actually correct?**
  _`rodar()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `montarPanorama()` (e.g. with `pontasDoDiff()` and `lerNaPonta()`) actually correct?**
  _`montarPanorama()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `idDoNo()` (e.g. with `mesmoPasso()` and `montarHierarquia()`) actually correct?**
  _`idDoNo()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._