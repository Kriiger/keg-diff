// O mapa em outra janela: duas abas da mesma página conversam por BroadcastChannel (mesma origem, sem servidor no meio).
// A principal manda o fluxo e o passo de agora; a externa só desenha o mapa e devolve o que a pessoa fez nele (escolher um passo,
// seguir um link para outro fluxo). Cada lado avisa que está vivo de tempos em tempos, porque fechar uma aba nem sempre dá aviso.
import { useEffect, useRef, useState } from 'react'

type Mensagem =
  | { tipo: 'estado'; fluxo: string | null; indice: number }
  | { tipo: 'vivo' } | { tipo: 'adeus' }
  | { tipo: 'ola' } | { tipo: 'ping' }
  | { tipo: 'passo'; fluxo: string; indice: number }
  | { tipo: 'ir'; endereco: string }
  | { tipo: 'externo-vivo' } | { tipo: 'externo-adeus' }

const ENDERECO_DA_EXTERNA = 'mapa-externo'
const NOME_DA_JANELA = 'keg-mapa-externo'
const BATIDA_EM_MS = 2000
// Três batidas perdidas: a outra aba fechou, travou ou recarregou.
const SILENCIO_EM_MS = 3 * BATIDA_EM_MS
// Quanto a principal espera a externa responder a um ping antes de dar a janela por fechada.
const PRAZO_DO_PING_EM_MS = 300

// Um canal por aba. Sem BroadcastChannel (navegador antigo) o mapa em outra janela simplesmente não sincroniza.
const canal = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('keg-mapa')
const enviar = (mensagem: Mensagem) => canal?.postMessage(mensagem)

function escutarCanal(tratar: (mensagem: Mensagem) => void): () => void {
  const aoReceber = (e: MessageEvent<Mensagem>) => tratar(e.data)
  canal?.addEventListener('message', aoReceber)
  return () => canal?.removeEventListener('message', aoReceber)
}

export const ehJanelaExterna = () => location.hash.slice(1) === ENDERECO_DA_EXTERNA

// ---- lado da janela principal ----

let estadoAtual: Mensagem = { tipo: 'estado', fluxo: null, indice: 0 }

// Na página principal, sempre: bate o coração, devolve o estado a quem acabou de abrir e leva os links da externa ao endereço.
export function atenderJanelaExterna(): () => void {
  const batida = setInterval(() => enviar({ tipo: 'vivo' }), BATIDA_EM_MS)
  const parar = escutarCanal(m => {
    if (m.tipo === 'ola') enviar(estadoAtual)
    if (m.tipo === 'ir') location.hash = m.endereco.replace(/^#/, '')
  })
  const sair = () => enviar({ tipo: 'adeus' })
  addEventListener('pagehide', sair)
  enviar({ tipo: 'vivo' })
  return () => { clearInterval(batida); parar(); removeEventListener('pagehide', sair) }
}

// Na tela do fluxo: publica o passo de agora, ouve a externa pedir outro passo e diz se ela está aberta.
export function useJanelaExterna(fluxo: string, indice: number, irParaPasso: (indice: number) => void) {
  const [aberta, setAberta] = useState(false)
  const atuais = useRef({ fluxo, irParaPasso })
  atuais.current = { fluxo, irParaPasso }
  const silencio = useRef<ReturnType<typeof setTimeout>>(undefined)
  const janela = useRef<Window | null>(null)
  // Quem espera a resposta de um ping; a próxima batida da externa o chama.
  const esperando = useRef<() => void>(undefined)

  useEffect(() => {
    estadoAtual = { tipo: 'estado', fluxo, indice }
    enviar(estadoAtual)
  }, [fluxo, indice])
  // Sair da tela do fluxo (panorama, fechamento) deixa a externa sem fluxo, em vez de parada num passo que já não vale.
  useEffect(() => () => {
    estadoAtual = { tipo: 'estado', fluxo: null, indice: 0 }
    enviar(estadoAtual)
  }, [])

  // A janela externa bate a cada 2s; três batidas perdidas e ela conta como fechada. O prazo mora num ref: trocar de fluxo não o perde.
  useEffect(() => {
    const parar = escutarCanal(m => {
      if (m.tipo === 'externo-vivo') {
        esperando.current?.()
        clearTimeout(silencio.current)
        setAberta(true)
        silencio.current = setTimeout(() => setAberta(false), SILENCIO_EM_MS)
      }
      if (m.tipo === 'externo-adeus') { clearTimeout(silencio.current); setAberta(false) }
      if (m.tipo === 'passo' && m.fluxo === atuais.current.fluxo) atuais.current.irParaPasso(m.indice)
    })
    return () => { clearTimeout(silencio.current); parar() }
  }, [])

  const marcarFechada = () => { clearTimeout(silencio.current); setAberta(false) }
  // Fechar a aba por fora (o navegador, um script) nem sempre avisa: antes de confiar que a externa existe, olha se a janela fechou e,
  // sem referência (a principal recarregou), pergunta e espera uma resposta curta. Devolve se ela está viva e foi trazida à frente.
  const focar = async (): Promise<boolean> => {
    if (janela.current?.closed) {
      marcarFechada()
      return false
    }
    const viva = await new Promise<boolean>(resolver => {
      const prazo = setTimeout(() => { esperando.current = undefined; resolver(false) }, PRAZO_DO_PING_EM_MS)
      esperando.current = () => { clearTimeout(prazo); esperando.current = undefined; resolver(true) }
      enviar({ tipo: 'ping' })
    })
    if (!viva) {
      marcarFechada()
      return false
    }
    window.open('', NOME_DA_JANELA)?.focus()
    return true
  }
  const abrir = () => {
    janela.current = abrirJanela()
    return janela.current !== null
  }
  return { aberta, abrir, focar }
}

// O nome fixo da janela evita duas externas: chamar window.open com o nome de uma janela que já existe a devolve sem recarregá-la.
// Uma janela nova nasce em branco, e só então vai para o endereço do mapa. Bloqueada por pop-up, devolve false.
function abrirJanela(): Window | null {
  const janela = window.open('', NOME_DA_JANELA, 'popup,width=1280,height=860')
  if (!janela) return null
  if (janela.location.href === 'about:blank') janela.location.href = `${location.pathname}#${ENDERECO_DA_EXTERNA}`
  else janela.focus()
  return janela
}

// ---- lado da janela externa ----

// O que a externa sabe da principal: o fluxo e o passo de agora, se ela saiu da tela do fluxo e se ainda responde.
export function useEstadoDaPrincipal() {
  const [estado, setEstado] = useState<{ fluxo: string | null; indice: number; semFluxo: boolean }>({ fluxo: null, indice: 0, semFluxo: true })
  const [ausente, setAusente] = useState(false)
  useEffect(() => {
    let silencio: ReturnType<typeof setTimeout>
    const vivaAgora = () => { clearTimeout(silencio); setAusente(false); silencio = setTimeout(() => setAusente(true), SILENCIO_EM_MS) }
    const parar = escutarCanal(m => {
      // Sair do fluxo na principal não esvazia o mapa: ele fica no último fluxo e passo, com um aviso.
      if (m.tipo === 'estado') setEstado(antes => ({ fluxo: m.fluxo ?? antes.fluxo, indice: m.fluxo ? m.indice : antes.indice, semFluxo: m.fluxo === null }))
      if (m.tipo === 'vivo') vivaAgora()
      if (m.tipo === 'ping') enviar({ tipo: 'externo-vivo' })
      if (m.tipo === 'adeus') { clearTimeout(silencio); setAusente(true) }
    })
    const batida = setInterval(() => enviar({ tipo: 'externo-vivo' }), BATIDA_EM_MS)
    const sair = () => enviar({ tipo: 'externo-adeus' })
    addEventListener('pagehide', sair)
    // Pede o estado já, e o silêncio começa a contar: uma principal que nunca responde também é "ausente".
    enviar({ tipo: 'ola' })
    enviar({ tipo: 'externo-vivo' })
    vivaAgora()
    return () => { clearTimeout(silencio); clearInterval(batida); parar(); removeEventListener('pagehide', sair) }
  }, [])
  return {
    ...estado, ausente, setIndice: (indice: number) => setEstado(antes => ({ ...antes, indice })),
    escolherPasso: (fluxo: string, indice: number) => enviar({ tipo: 'passo', fluxo, indice }),
    irPara: (endereco: string) => enviar({ tipo: 'ir', endereco }),
  }
}
