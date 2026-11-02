// .revisao/review.json — o motor escreve, a tela só lê.
// É a única coisa que as duas metades compartilham: mudar aqui é mudar o contrato.
export type Papel = 'nasce' | 'processa' | 'termina'

export interface Revisao {
  versao: 1
  geradoEm: string                 // ISO
  base: string                     // "HEAD", "main"...
  arquivos: ArquivoAlterado[]
  fluxos: Fluxo[]
  orfaos: Orfao[]
  testes: Teste[]                  // fora dos fluxos: teste confere o produto, não é caminho do dado
  grafo?: Grafo                    // o que chama o que em volta do diff, para a tela Mapa
  manifesto?: ConferenciaDoManifesto  // só existe quando o executor gravou .revisao/manifesto.json
  metricas: Metricas
}

export interface ArquivoAlterado {
  caminho: string
  status: 'novo' | 'alterado' | 'removido'
  renomeadoDe?: string             // caminho antigo, quando o git viu um renome (-M); sem mudança de conteúdo, hunks vem vazio
  hunks: Hunk[]
}

export interface Hunk {
  id: string                       // hash do conteúdo: a decisão de revisão se prende a ele
  linhas: [inicio: number, fim: number]
  patch: string
}

export interface Fluxo {
  id: string
  titulo: string                   // "POST /api/transacoes"
  risco: 'alto' | 'medio' | 'baixo'
  passos: Passo[]
}

export interface Passo {
  id: string
  papel: Papel
  simbolo: string                  // "salvarTransacao"
  arquivo: string
  linhas: [number, number]
  tipoEntrada?: string
  tipoSaida?: string
  hunkIds: string[]                // vazio = passo de contexto, sem alteração
  fronteira?: 'cliente-servidor' | 'http'
  avisos?: string[]                // o que o compilador não prova: URL montada, chamada dinâmica
  chama?: string[]                 // ids dos passos do mesmo fluxo que este chama
  explicacao?: Explicacao
}

export interface Frase {
  texto: string
  linhas: [number, number] | null  // null = frase sem âncora válida
}

export interface Explicacao {
  frases: Frase[]
  modelo: string
}

export interface Orfao {
  arquivo: string
  simbolo?: string
  hunkIds: string[]
  motivo: 'sem-chamador' | 'sem-saida' | 'arquivo-sem-import'
}

export interface Teste {
  arquivo: string
  hunkIds: string[]
}

// O mapa precisa de vizinhos que o diff não tocou. O motor grava só uma vizinhança enxuta
// (alterados, passos dos fluxos e vizinhos até 2 saltos), então a página não precisa do compilador.
export interface Grafo {
  nos: NoDoGrafo[]
  arestas: ArestaDoGrafo[]
}

export interface NoDoGrafo {
  id: string                       // o mesmo id do passo que vem da mesma função: ver idDoNo
  simbolo: string
  arquivo: string
  linhas: [number, number]
  papel: Papel
  hunkIds: string[]                // vazio = vizinho sem alteração
  lado?: 'cliente' | 'servidor'    // só quando se sabe: diretiva, rota do App Router ou ponta de um fetch
  mais?: number                    // vizinhos que o corte deixou de fora
}

// de chama para. "http" é o fetch para uma rota do próprio projeto; "dinamico" é o que o compilador não prova.
export interface ArestaDoGrafo {
  de: string
  para: string
  tipo: 'chamada' | 'http' | 'dinamico'
}

// O motor dá a cada função o id "arquivo:linha#símbolo"; o passo de um fluxo tem os mesmos três dados.
export function idDoNo({ arquivo, linhas, simbolo }: Pick<Passo, 'arquivo' | 'linhas' | 'simbolo'>): string {
  return `${arquivo}:${linhas[0]}#${simbolo}`
}

// O que o executor declarou contra o que o código tem. As regras de casamento estão em manifesto.ts.
export interface ConferenciaDoManifesto {
  tarefa?: string
  erro?: string                    // manifesto ilegível: sem erro, a lista abaixo é a conferência inteira
  divergencias: Divergencia[]
}

export interface Divergencia {
  // declarado-inexistente: o agente descreveu algo que o código não tem.
  // calculado-nao-declarado: o código tem um fluxo que o agente não contou, a mais grave.
  tipo: 'declarado-inexistente' | 'calculado-nao-declarado'
  texto: string
  fluxoId?: string                 // id do fluxo calculado, quando a divergência é sobre um
}

export interface Metricas {
  arquivosNovos: number
  arquivosAlterados: number
  saltosMaximo: number
  fronteirasCruzadas: number
  divergenciasDoManifesto: number
}

// .revisao/estado.json — a tela escreve; a chave é o hash do hunk,
// então um trecho que o agente mudar depois volta sozinho para "não revisado".
export type Estado = Record<string, {
  decisao: 'revisado' | 'codigo-morto' | 'falso-positivo' | 'comentado'
  comentario?: string
  em: string
}>

// .revisao/nota.json — a sensação de controle de 1 a 5 ao fechar a revisão. Fica fora do estado.json,
// cujas chaves são todas hashes de trecho. A Fase 6 lê este arquivo para montar o historico.jsonl.
export interface Nota {
  nota: 1 | 2 | 3 | 4 | 5
  em: string                       // ISO
  base: string                     // a base da revisão que ela avalia
}

// O que a página sabe do narrador: GET /api/narrador. Sem narrador, o passo mostra a frase mecânica.
export interface EstadoDoNarrador {
  ativo: boolean                   // false: --sem-ia, sem login da assinatura ou login que cobraria API
  motivo?: string                  // por que não está ativo
  pausa?: string                   // resposta com is_error (limite de uso): só volta quando a pessoa pede
  narrando: string[]               // ids dos fluxos na fila ou em andamento
  falhas: Record<string, string>   // id do fluxo -> o que deu errado nele
  modelo: string
}

// .revisao/historico.jsonl — uma linha por revisão que chegou a 100%, com os números da tabela "Como medir" do Roteiro 1.
// iniciadoEm identifica a revisão: gravar de novo a mesma revisão (nota dada depois, um trecho refeito no --watch)
// substitui a linha, nunca acrescenta outra.
export interface LinhaDoHistorico {
  iniciadoEm: string               // ISO
  registradoEm: string             // ISO, da última gravação desta linha
  base: string
  tempoSegundos: number            // tempo ativo da página (aba visível), da abertura aos 100%
  achados: { comentarios: number; codigoMorto: number }
  passos: { total: number; falsosPositivos: number }  // total: passos alterados dos fluxos mais os órfãos
  divergenciasDoManifesto: number
  arquivosNovos: number
  arquivosAlterados: number
  trechos: number
  nota: number | null              // do Fechamento; null enquanto a pessoa não deu
  narrador: { chamadas: number; avisosDeLimite: number; login: string | null }  // login: authMethod do claude; null sem narrador
}
