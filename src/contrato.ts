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
  panorama?: Panorama              // o que o git e o código dizem além dos fluxos; review.json antigo não tem
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
  entrada?: string                 // de onde o dado nasce, no vocabulário do catálogo: "evento", "rota", "banco-leitura"
  saida?: string                   // a saída que decide o risco: "banco-escrita", "resposta-http", "tela"
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

// A explicação mais funda de um bloco (um passo do fluxo ou um trecho da árvore), pedida pelo botão "explicar mais".
// Fica em .revisao/aprofundamentos.json, fora do review.json: não é parte da análise e pode ser pedida de novo.
export interface Aprofundamento extends Explicacao {
  esforco: string
  em: string                       // ISO
}

export interface Orfao {
  arquivo: string
  simbolo?: string
  hunkIds: string[]
  motivo: 'sem-chamador' | 'sem-saida' | 'arquivo-sem-import'
  explicacao?: Explicacao          // o narrador dos órfãos: parece código morto? ninguém chama por quê? review.json antigo não tem
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

// de chama para. "http" é o fetch para uma rota do próprio projeto; "dinamico" é o que o compilador não prova;
// "tipo" é o uso de um tipo ou interface numa anotação: depende do formato, não executa nada.
export interface ArestaDoGrafo {
  de: string
  para: string
  tipo: 'chamada' | 'http' | 'dinamico' | 'tipo'
}

// O motor dá a cada função o id "arquivo:linha#símbolo"; o passo de um fluxo tem os mesmos três dados.
export function idDoNo({ arquivo, linhas, simbolo }: Pick<Passo, 'arquivo' | 'linhas' | 'simbolo'>): string {
  return `${arquivo}:${linhas[0]}#${simbolo}`
}

// O panorama junta o que só o git e a sintaxe sabem: os commits do intervalo, os símbolos que mudaram, as dependências
// e o tamanho dos arquivos. Cada lista vazia faz o cartão dela sumir da página.
export interface Panorama {
  intervalo?: Intervalo
  simbolos: SimboloAlterado[]      // funções, componentes, classes e tipos de arquivos de código (testes ficam de fora)
  endpoints: EndpointTocado[]
  dependencias: Dependencia[]
  arquivos: InfoDoArquivo[]        // só arquivos de código que não são teste
  ritmo?: { segundosPorTrecho: number; revisoes: number }  // a mediana do seu historico.jsonl; sem histórico, não existe
}

export interface Intervalo {
  antes: string                    // a ponta de onde o git compara (hash completo, ref ou HEAD)
  depois: string                   // o commit de chegada, "stage" ou "diretório de trabalho"
  branch?: string                  // só com o HEAD num branch (detached não tem)
  commits: Commit[]                // os mais novos primeiro, até 30
  totalDeCommits: number
}

export interface Commit {
  hash: string
  autor: string
  em: string                       // ISO
  assunto: string
}

export type TipoDeSimbolo = 'funcao' | 'componente' | 'classe' | 'tipo' | 'constante'

export interface SimboloAlterado {
  arquivo: string
  nome: string
  tipo: TipoDeSimbolo
  mudanca: 'novo' | 'alterado' | 'removido'
  exportado: boolean               // no código de agora (no removido, no de antes)
  exportadoAntes?: boolean         // só quando o alterado ganhou ou perdeu o export
  assinatura: string               // parâmetros e retorno (função), cabeçalho (classe) ou o texto todo (tipo); no removido, a antiga
  assinaturaAntes?: string         // só quando o alterado mudou de assinatura: aí é a API pública que muda
  linhas?: number                  // tamanho da função no código de agora
  complexidade?: number            // ramificações da função no código de agora, a contagem de McCabe
}

export interface EndpointTocado {
  metodo: string                   // GET, POST... ou ANY para o handler único do Pages Router
  rota: string                     // "/api/transacoes/[id]"
  arquivo: string
  mudanca: SimboloAlterado['mudanca']
}

export interface Dependencia {
  nome: string
  secao: 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'
  antes?: string                   // sem "antes", foi acrescentada; sem "depois", foi removida
  depois?: string
  arquivo: string                  // o package.json que mudou
}

export interface InfoDoArquivo {
  caminho: string
  linhas: number                   // linhas do arquivo de agora (sem o arquivo removido)
  teste: 'tocado' | 'existe' | 'nenhum'  // um teste de mesmo nome mudou, existe no repositório, ou não há
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
// "decisao" é a marca do trecho; "comentario" é um anexo independente dela: o trecho pode estar revisado e comentado.
// 'comentado' só aparece quando há comentário (o geral ou o de uma linha) e nenhuma outra marca.
// "tipoDoComentario" diz o que o comentário pede ao agente: 'corrija' é uma ordem (vira item do "Corrija cada item no código") e 'duvida'
// é uma pergunta (vira item de "Responda cada pergunta", sem mudar o código). Ausente = 'corrija': estado.json antigo continua valendo.
// O tipo é do comentário: sem comentário, não existe.
// "linhas" são os comentários de uma linha do trecho (o "+" ao lado do número, no diff). A chave é a posição da linha no corpo do
// trecho (0 = a primeira depois do "@@"), não o número dela no arquivo: o id do trecho é o hash do corpo e sobrevive a uma edição
// acima dele, que muda os números mas não as posições. O número de verdade sai do cabeçalho atual (ver linhas.ts).
// O comentário de linha também conta como comentário: uma entrada só com "linhas" (sem marca nem comentário geral) tem decisao 'comentado'.
export type TipoDoComentario = 'corrija' | 'duvida'

export interface ComentarioDeLinha {
  texto: string
  tipo?: TipoDoComentario          // ausente = 'corrija'
  em: string
}

export type Estado = Record<string, {
  decisao: 'revisado' | 'codigo-morto' | 'falso-positivo' | 'comentado'
  comentario?: string
  tipoDoComentario?: TipoDoComentario
  linhas?: Record<string, ComentarioDeLinha>
  em: string
}>

// .revisao/achados.json — as frases do narrador que a pessoa escolheu levar para a correção (feedback.md).
// A chave junta os hashes dos trechos do passo com o texto da frase: quando o agente corrige o trecho (hash novo)
// ou a narração muda, a chave deixa de casar e a frase sai do feedback sozinha, como o comentário de um trecho refeito.
export type AchadosEscolhidos = Record<string, { em: string }>

export function chaveDaFrase(hunkIds: string[], texto: string): string {
  return `${[...hunkIds].sort().join('+')}|${texto}`
}

// .revisao/aprofundamentos.json — chave do bloco -> a explicação funda dele. A chave junta os hashes dos trechos com o bloco, então
// quando o agente corrige o trecho a chave deixa de casar e a explicação some sozinha, como a frase do narrador em achados.json.
// O passo tem o símbolo na chave (o mesmo passo em dois fluxos é um bloco só); o trecho da árvore, o hash dele.
export type Aprofundamentos = Record<string, Aprofundamento>

export function chaveDoPasso({ hunkIds, simbolo }: Pick<Passo, 'hunkIds' | 'simbolo'>): string {
  return `passo|${[...hunkIds].sort().join('+')}|${simbolo}`
}

export function chaveDoTrecho(hunkId: string): string {
  return `trecho|${hunkId}`
}

// Na fila do narrador o pedido de aprofundamento é o id "aprofundar:<chave>", ao lado dos ids de fluxo e de grupo de órfãos.
export const PREFIXO_DO_APROFUNDAMENTO = 'aprofundar:'

export function ehAprofundamento(id: string): boolean {
  return id.startsWith(PREFIXO_DO_APROFUNDAMENTO)
}

// O que se escolhe do claude: o modelo vira argumento da linha de comando, então só entra nome que não pareça opção.
export const ESFORCOS = ['low', 'medium', 'high', 'xhigh', 'max']
export const MODELOS_CONHECIDOS = ['haiku', 'sonnet', 'opus', 'fable']

export function modeloValido(modelo: unknown): modelo is string {
  return typeof modelo === 'string' && /^[A-Za-z0-9][\w.[\]-]*$/.test(modelo)
}

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
  narrando: string[]               // ids dos fluxos, dos grupos de órfãos ("orfaos:<arquivo>", ver orfaos.ts) e dos aprofundamentos ("aprofundar:<chave>") na fila ou em andamento
  falhas: Record<string, string>   // id do fluxo, do grupo de órfãos ou do aprofundamento -> o que deu errado nele
  modelo: string
  esforco: string                  // --effort do claude: low, medium, high, xhigh ou max
}

// .revisao/historico.jsonl — uma linha por revisão que chegou a 100%, com os números da tabela "Como medir" do Roteiro 1.
// iniciadoEm identifica a revisão: gravar de novo a mesma revisão (nota dada depois, um trecho refeito no --watch)
// substitui a linha, nunca acrescenta outra.
export interface LinhaDoHistorico {
  iniciadoEm: string               // ISO
  registradoEm: string             // ISO, da última gravação desta linha
  base: string
  tempoSegundos: number            // tempo ativo da página (aba visível), da abertura aos 100%
  achados: { comentarios: number; codigoMorto: number; narrador?: number; duvidas?: number }  // comentarios: os de tipo corrija; narrador: frases do Claude levadas para a correção; duvidas: comentários de tipo dúvida (não contam como achado); linhas antigas não têm narrador nem duvidas
  passos: { total: number; falsosPositivos: number }  // total: passos alterados dos fluxos mais os órfãos
  divergenciasDoManifesto: number
  arquivosNovos: number
  arquivosAlterados: number
  trechos: number
  nota: number | null              // do Fechamento; null enquanto a pessoa não deu
  narrador: { chamadas: number; avisosDeLimite: number; login: string | null }  // login: authMethod do claude; null sem narrador
}
