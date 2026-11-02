// Servidor local da tela: entrega a página, o review.json, o estado das decisões e o código dos passos de contexto.
// Só escuta em 127.0.0.1 e só fala com a própria página.
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import type { Revisao } from './contrato.js'
import { aplicarAchados, aplicarComentarioDeLinha, aplicarDecisao, chaveDeLinhaValida, gravarAchados, gravarNota, lerAchados, lerEstado, lerNota, TIPOS_DE_COMENTARIO, type PedidoDeComentarioDeLinha, type PedidoDeDecisao } from './estado.js'
import { gravarFeedback } from './feedback.js'
import { FilaDoNarrador } from './fila-do-narrador.js'
import { registrarRevisao } from './historico.js'
import type { OpcoesDoNarrador } from './narrador.js'
import { Sessao } from './sessao.js'

const PASTA_DA_PAGINA = path.join(import.meta.dirname, 'web')
const PORTA_PREFERIDA = 4747
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
}

export async function abrirTela(raiz: string, opcoesDoNarrador: OpcoesDoNarrador): Promise<string> {
  const pastaDaRevisao = path.join(raiz, '.revisao')
  const ouvintes = new Set<ServerResponse>()
  const avisar = (evento: string) => {
    for (const ouvinte of ouvintes) ouvinte.write(`event: ${evento}\ndata: {}\n\n`)
  }
  // Rodar o keg diff de novo em outro terminal regrava o review.json: a página recarrega sozinha.
  watch(pastaDaRevisao, (_, nome) => {
    if (nome === 'review.json') avisar('revisao')
  })
  // A revisão que está aberta: o tempo e o consumo do narrador são dela, e ela vira uma linha do historico.jsonl.
  const sessao = Sessao.abrir(pastaDaRevisao, (JSON.parse(readFileSync(path.join(pastaDaRevisao, 'review.json'), 'utf8')) as Revisao).base)
  const narrador = new FilaDoNarrador(raiz, opcoesDoNarrador, sessao, () => avisar('narrador'))

  type Rota = (pedido: IncomingMessage, resposta: ServerResponse, url: URL) => unknown
  const rotas: Record<string, Rota> = {
    'GET /api/revisao': (_, resposta) => enviarArquivo(resposta, path.join(pastaDaRevisao, 'review.json')),
    'POST /api/estado': (pedido, resposta) => receberDecisao(pedido, resposta, pastaDaRevisao, sessao),
    'GET /api/estado': (_, resposta) => responderJson(resposta, lerEstado(pastaDaRevisao)),
    'POST /api/comentario-de-linha': (pedido, resposta) => receberComentarioDeLinha(pedido, resposta, pastaDaRevisao, sessao),
    'POST /api/achados': (pedido, resposta) => receberAchados(pedido, resposta, pastaDaRevisao, sessao),
    'GET /api/achados': (_, resposta) => responderJson(resposta, lerAchados(pastaDaRevisao)),
    'GET /api/sessao': (pedido, resposta) => receberTempo(pedido, resposta, sessao),
    'POST /api/sessao': (pedido, resposta) => receberTempo(pedido, resposta, sessao),
    'GET /api/feedback': (_, resposta) => responder(resposta, 200, gravarFeedback(pastaDaRevisao)),
    'POST /api/nota': (pedido, resposta) => receberNota(pedido, resposta, pastaDaRevisao, sessao),
    'GET /api/nota': (_, resposta) => responderJson(resposta, lerNota(pastaDaRevisao)),
    'GET /api/narrador': (_, resposta) => responderJson(resposta, narrador.estado()),
    'POST /api/narrar': (pedido, resposta) => pedirNarracao(pedido, resposta, narrador),
    'GET /api/codigo': (_, resposta, url) => enviarCodigo(resposta, raiz, url.searchParams),
    'GET /api/eventos': (pedido, resposta) => {
      resposta.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      // O comentário manda os cabeçalhos já: é o que dispara o "open" na página.
      resposta.write(': conectado\n\n')
      ouvintes.add(resposta)
      pedido.on('close', () => ouvintes.delete(resposta))
    },
  }

  const servidor = createServer((pedido, resposta) => {
    const url = new URL(pedido.url ?? '/', 'http://127.0.0.1')
    // Outro site no navegador não lê o seu código: só atende quem chama pelo endereço local.
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(pedido.headers.host ?? '')) return responder(resposta, 403, 'endereço não permitido')
    const rota = rotas[`${pedido.method === 'POST' ? 'POST' : 'GET'} ${url.pathname}`]
    // Corpo que não é JSON ou arquivo ilegível vira resposta de erro: a rejeição solta derrubaria o servidor no meio da revisão.
    if (rota) return Promise.resolve().then(() => rota(pedido, resposta, url)).catch(() => responder(resposta, 400, 'pedido inválido'))
    enviarPagina(resposta, url.pathname)
  })

  const porta = await escutar(servidor, PORTA_PREFERIDA).catch(() => escutar(servidor, 0))
  const endereco = `http://127.0.0.1:${porta}`
  abrirNoNavegador(endereco)
  return endereco
}

function escutar(servidor: ReturnType<typeof createServer>, porta: number): Promise<number> {
  return new Promise((resolver, rejeitar) => {
    servidor.once('error', rejeitar)
    servidor.listen(porta, '127.0.0.1', () => {
      servidor.off('error', rejeitar)
      resolver((servidor.address() as AddressInfo).port)
    })
  })
}

// A página pede a narração dos fluxos que abre e dos grupos de órfãos ("fluxos" leva os dois tipos de id); "retomar" só vem de um clique da pessoa depois da pausa.
async function pedirNarracao(pedido: IncomingMessage, resposta: ServerResponse, narrador: FilaDoNarrador) {
  if (pedido.headers['content-type'] !== 'application/json') return responder(resposta, 415, 'envie JSON')
  try {
    const { fluxos, retomar } = JSON.parse(await lerCorpo(pedido))
    narrador.pedir(Array.isArray(fluxos) ? fluxos.filter(id => typeof id === 'string') : [], retomar === true)
  } catch {
    return responder(resposta, 400, 'JSON inválido')
  }
  responderJson(resposta, narrador.estado())
}

// JSON obrigatório: um formulário de outro site não consegue mandar esse tipo sem pedir licença ao navegador.
async function receberDecisao(pedido: IncomingMessage, resposta: ServerResponse, pastaDaRevisao: string, sessao: Sessao) {
  if (pedido.headers['content-type'] !== 'application/json') return responder(resposta, 415, 'envie JSON')
  const corpo: PedidoDeDecisao = JSON.parse(await lerCorpo(pedido))
  if (corpo.tipoDoComentario !== undefined && !TIPOS_DE_COMENTARIO.includes(corpo.tipoDoComentario)) return responder(resposta, 400, 'tipoDoComentario deve ser "corrija" ou "duvida"')
  const estado = aplicarDecisao(lerEstado(pastaDaRevisao), corpo)
  writeFileSync(path.join(pastaDaRevisao, 'estado.json'), JSON.stringify(estado, null, 2) + '\n')
  // O feedback.md acompanha cada decisão: quem lê o arquivo (o agente, por exemplo) nunca vê uma versão velha.
  gravarFeedback(pastaDaRevisao)
  sessao.somarTempo(corpo.segundos)
  registrar(pastaDaRevisao, sessao)
  responderJson(resposta, estado)
}

// O comentário de uma linha do trecho: o corpo diz o trecho, a posição da linha no corpo dele e o texto (vazio apaga).
async function receberComentarioDeLinha(pedido: IncomingMessage, resposta: ServerResponse, pastaDaRevisao: string, sessao: Sessao) {
  if (pedido.headers['content-type'] !== 'application/json') return responder(resposta, 415, 'envie JSON')
  const corpo: PedidoDeComentarioDeLinha = JSON.parse(await lerCorpo(pedido))
  if (typeof corpo.hunkId !== 'string' || corpo.hunkId === '' || !chaveDeLinhaValida(corpo.linha) || typeof corpo.comentario !== 'string') {
    return responder(resposta, 400, 'envie { hunkId: string, linha: "posição da linha no trecho", comentario: string }')
  }
  if (corpo.tipoDoComentario !== undefined && !TIPOS_DE_COMENTARIO.includes(corpo.tipoDoComentario)) return responder(resposta, 400, 'tipoDoComentario deve ser "corrija" ou "duvida"')
  const estado = aplicarComentarioDeLinha(lerEstado(pastaDaRevisao), corpo)
  writeFileSync(path.join(pastaDaRevisao, 'estado.json'), JSON.stringify(estado, null, 2) + '\n')
  gravarFeedback(pastaDaRevisao)
  sessao.somarTempo(corpo.segundos)
  registrar(pastaDaRevisao, sessao)
  responderJson(resposta, estado)
}

// As frases do narrador que a pessoa leva para a correção: o corpo diz quais chaves entram ou saem e o feedback.md acompanha.
async function receberAchados(pedido: IncomingMessage, resposta: ServerResponse, pastaDaRevisao: string, sessao: Sessao) {
  if (pedido.headers['content-type'] !== 'application/json') return responder(resposta, 415, 'envie JSON')
  try {
    const { chaves, incluir } = JSON.parse(await lerCorpo(pedido))
    if (!Array.isArray(chaves) || !chaves.every(chave => typeof chave === 'string') || typeof incluir !== 'boolean') throw new Error('corpo inválido')
    const achados = aplicarAchados(lerAchados(pastaDaRevisao), chaves, incluir)
    gravarAchados(pastaDaRevisao, achados)
    gravarFeedback(pastaDaRevisao)
    registrar(pastaDaRevisao, sessao)
    return responderJson(resposta, achados)
  } catch {
    responder(resposta, 400, 'envie { chaves: string[], incluir: boolean }')
  }
}

// O cronômetro da página: GET devolve o que o servidor guardou (a página recarregada continua dali),
// POST manda o que ela contou. O id muda quando uma sessão nova começa, e a página então recomeça do número do servidor.
async function receberTempo(pedido: IncomingMessage, resposta: ServerResponse, sessao: Sessao) {
  if (pedido.method === 'POST') {
    if (pedido.headers['content-type'] !== 'application/json') return responder(resposta, 415, 'envie JSON')
    try {
      sessao.somarTempo(JSON.parse(await lerCorpo(pedido)).segundos)
    } catch {
      return responder(resposta, 400, 'JSON inválido')
    }
  }
  responderJson(resposta, { id: sessao.iniciadoEm, segundos: sessao.segundos })
}

// A nota avalia a revisão que está aberta: a base vem do review.json, não da página.
async function receberNota(pedido: IncomingMessage, resposta: ServerResponse, pastaDaRevisao: string, sessao: Sessao) {
  if (pedido.headers['content-type'] !== 'application/json') return responder(resposta, 415, 'envie JSON')
  try {
    const revisao: Revisao = JSON.parse(readFileSync(path.join(pastaDaRevisao, 'review.json'), 'utf8'))
    const corpo = JSON.parse(await lerCorpo(pedido))
    const nota = gravarNota(pastaDaRevisao, corpo.nota, revisao.base)
    if (nota) {
      sessao.somarTempo(corpo.segundos)
      registrar(pastaDaRevisao, sessao)
      return responderJson(resposta, nota)
    }
  } catch {}
  responder(resposta, 400, 'a nota é um inteiro de 1 a 5')
}

// O histórico é um registro à parte: se a gravação falhar, a revisão segue e o terminal avisa.
function registrar(pastaDaRevisao: string, sessao: Sessao) {
  try {
    registrarRevisao(pastaDaRevisao, sessao)
  } catch (erro) {
    console.error(`não consegui gravar o historico.jsonl: ${erro instanceof Error ? erro.message : erro}`)
  }
}

// O passo de contexto não tem diff: a página mostra o código atual dele.
function enviarCodigo(resposta: ServerResponse, raiz: string, parametros: URLSearchParams) {
  const arquivo = path.resolve(raiz, parametros.get('arquivo') ?? '')
  if (!arquivo.startsWith(raiz + path.sep) || !existsSync(arquivo)) return responder(resposta, 404, 'arquivo fora do projeto')
  const de = Number(parametros.get('de') ?? 1)
  const ate = Number(parametros.get('ate') ?? de)
  const linhas = readFileSync(arquivo, 'utf8').split('\n').slice(de - 1, ate)
  responderJson(resposta, { de, linhas })
}

function enviarPagina(resposta: ServerResponse, caminho: string) {
  const arquivo = path.join(PASTA_DA_PAGINA, path.normalize(caminho))
  const existe = arquivo.startsWith(PASTA_DA_PAGINA) && existsSync(arquivo) && path.extname(arquivo) !== ''
  // Só rota de página cai no index.html. Um asset que sumiu (o pedaço de um build antigo) responde 404: com o html no lugar,
  // o import() da aba aberta recebia text/html, falhava sem um erro que a página entendesse e deixava a tela em branco.
  if (!existe && caminho.startsWith('/assets/')) return responder(resposta, 404, 'asset não encontrado')
  enviarArquivo(resposta, existe ? arquivo : path.join(PASTA_DA_PAGINA, 'index.html'))
}

function enviarArquivo(resposta: ServerResponse, arquivo: string) {
  if (!existsSync(arquivo)) return responder(resposta, 404, `não achei ${path.basename(arquivo)}`)
  // O html aponta para os arquivos de assets/ pelo hash: sem no-cache, o navegador segue com o html velho e o bundle velho
  // depois de uma versão nova. Os assets mudam de nome a cada build e podem ficar no cache.
  const semCache = path.extname(arquivo) === '.html' ? { 'cache-control': 'no-cache' } : {}
  resposta.writeHead(200, { 'content-type': TIPOS[path.extname(arquivo)] ?? 'application/json; charset=utf-8', ...semCache })
  resposta.end(readFileSync(arquivo))
}

function responderJson(resposta: ServerResponse, dado: unknown) {
  resposta.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  resposta.end(JSON.stringify(dado))
}

function responder(resposta: ServerResponse, status: number, mensagem: string) {
  resposta.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  resposta.end(mensagem)
}

function lerCorpo(pedido: IncomingMessage): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    let corpo = ''
    pedido.on('data', pedaco => (corpo += pedaco))
    pedido.on('end', () => resolver(corpo))
    pedido.on('error', rejeitar)
  })
}

function abrirNoNavegador(endereco: string) {
  const comandos: Record<string, string[]> = { darwin: ['open'], win32: ['cmd', '/c', 'start', '""'] }
  const [comando = 'xdg-open', ...args] = comandos[process.platform] ?? []
  execFile(comando, [...args, endereco], () => {})
}
