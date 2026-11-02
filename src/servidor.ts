// Servidor local da tela: entrega a página, o review.json, o estado das decisões e o código dos passos de contexto.
// Só escuta em 127.0.0.1 e só fala com a própria página.
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import type { Estado, Revisao } from './contrato.js'
import { gravarNota, lerEstado, lerNota } from './estado.js'
import { gravarFeedback } from './feedback.js'
import { FilaDoNarrador } from './fila-do-narrador.js'
import type { OpcoesDoNarrador } from './narrador.js'

const PASTA_DA_PAGINA = path.join(import.meta.dirname, 'web')
const PORTA_PREFERIDA = 4747
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
}

interface Decisao {
  hunkIds: string[]
  decisao: Estado[string]['decisao'] | null    // null desfaz a decisão
  comentario?: string
}

export async function abrirTela(raiz: string, opcoesDoNarrador: OpcoesDoNarrador): Promise<string> {
  const pastaDaRevisao = path.join(raiz, '.revisao')
  const arquivoDeEstado = path.join(pastaDaRevisao, 'estado.json')
  const ouvintes = new Set<ServerResponse>()
  const avisar = (evento: string) => {
    for (const ouvinte of ouvintes) ouvinte.write(`event: ${evento}\ndata: {}\n\n`)
  }
  // Rodar o keg diff de novo em outro terminal regrava o review.json: a página recarrega sozinha.
  watch(pastaDaRevisao, (_, nome) => {
    if (nome === 'review.json') avisar('revisao')
  })
  const narrador = new FilaDoNarrador(raiz, opcoesDoNarrador, () => avisar('narrador'))

  const servidor = createServer(async (pedido, resposta) => {
    const url = new URL(pedido.url ?? '/', 'http://127.0.0.1')
    // Outro site no navegador não lê o seu código: só atende quem chama pelo endereço local.
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(pedido.headers.host ?? '')) return responder(resposta, 403, 'endereço não permitido')
    if (url.pathname === '/api/revisao') return enviarArquivo(resposta, path.join(pastaDaRevisao, 'review.json'))
    if (url.pathname === '/api/estado' && pedido.method === 'POST') {
      // JSON obrigatório: um formulário de outro site não consegue mandar esse tipo sem pedir licença ao navegador.
      if (pedido.headers['content-type'] !== 'application/json') return responder(resposta, 415, 'envie JSON')
      const estado = decidir(lerEstado(pastaDaRevisao), JSON.parse(await lerCorpo(pedido)))
      writeFileSync(arquivoDeEstado, JSON.stringify(estado, null, 2) + '\n')
      // O feedback.md acompanha cada decisão: quem lê o arquivo (o agente, por exemplo) nunca vê uma versão velha.
      gravarFeedback(pastaDaRevisao)
      return responderJson(resposta, estado)
    }
    if (url.pathname === '/api/estado') return responderJson(resposta, lerEstado(pastaDaRevisao))
    if (url.pathname === '/api/feedback') return responder(resposta, 200, gravarFeedback(pastaDaRevisao))
    if (url.pathname === '/api/nota' && pedido.method === 'POST') return receberNota(pedido, resposta, pastaDaRevisao)
    if (url.pathname === '/api/nota') return responderJson(resposta, lerNota(pastaDaRevisao))
    if (url.pathname === '/api/narrador') return responderJson(resposta, narrador.estado())
    if (url.pathname === '/api/narrar' && pedido.method === 'POST') return pedirNarracao(pedido, resposta, narrador)
    if (url.pathname === '/api/codigo') return enviarCodigo(resposta, raiz, url.searchParams)
    if (url.pathname === '/api/eventos') {
      resposta.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      // O comentário manda os cabeçalhos já: é o que dispara o "open" na página.
      resposta.write(': conectado\n\n')
      ouvintes.add(resposta)
      pedido.on('close', () => ouvintes.delete(resposta))
      return
    }
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

// A página pede a narração dos fluxos que abre; "retomar" só vem de um clique da pessoa depois da pausa.
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

// A nota avalia a revisão que está aberta: a base vem do review.json, não da página.
async function receberNota(pedido: IncomingMessage, resposta: ServerResponse, pastaDaRevisao: string) {
  if (pedido.headers['content-type'] !== 'application/json') return responder(resposta, 415, 'envie JSON')
  try {
    const revisao: Revisao = JSON.parse(readFileSync(path.join(pastaDaRevisao, 'review.json'), 'utf8'))
    const nota = gravarNota(pastaDaRevisao, JSON.parse(await lerCorpo(pedido)).nota, revisao.base)
    if (nota) return responderJson(resposta, nota)
  } catch {}
  responder(resposta, 400, 'a nota é um inteiro de 1 a 5')
}

function decidir(estado: Estado, { hunkIds, decisao, comentario }: Decisao): Estado {
  const em = new Date().toISOString()
  for (const id of hunkIds) {
    if (decisao === null) delete estado[id]
    else estado[id] = comentario ? { decisao, comentario, em } : { decisao, em }
  }
  return estado
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
  enviarArquivo(resposta, existe ? arquivo : path.join(PASTA_DA_PAGINA, 'index.html'))
}

function enviarArquivo(resposta: ServerResponse, arquivo: string) {
  if (!existsSync(arquivo)) return responder(resposta, 404, `não achei ${path.basename(arquivo)}`)
  resposta.writeHead(200, { 'content-type': TIPOS[path.extname(arquivo)] ?? 'application/json; charset=utf-8' })
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
