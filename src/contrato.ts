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
  metricas: Metricas
}

export interface ArquivoAlterado {
  caminho: string
  status: 'novo' | 'alterado' | 'removido'
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
  explicacao?: Explicacao
}

export interface Explicacao {
  frases: { texto: string; linhas: [number, number] | null }[]  // null = frase sem âncora válida
  modelo: string
}

export interface Orfao {
  arquivo: string
  simbolo?: string
  hunkIds: string[]
  motivo: 'sem-chamador' | 'sem-saida' | 'arquivo-sem-import'
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
