// A tela do fluxo: os passos agrupados por arquivo à esquerda, o passo atual (frases, decisão e código) à direita e o mapa em gaveta.
import { PatchDiff, type FileDiffOptions } from '@pierre/diffs/react'
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { patchDeLeitura } from '../src/contexto'
import { chaveDoPasso, type Estado, type Fluxo, type Passo, type Revisao } from '../src/contrato'
import { precarregar, useConteudo } from './arquivos'
import { Caminho } from './caminho'
import { Decisoes } from './decisoes'
import { abrirFolha } from './folha'
import { useTrocando } from './modo'
import { Aprofundar, FrasesDoPasso, semNarracao } from './narracao'
import { jaVistosDoFluxo, vizinhoNaoVisto } from './ja-visto'
import { useJanelaExterna } from './janela-do-mapa'
import { PassosPorArquivo } from './passos-por-arquivo'
import { indiceInicial, useCursor, type Navegacao } from './proximo'
import { DiffDosTrechos, TEMAS, decididos, useAtalhos, type Contexto } from './telas'
import { MODOS, useTema } from './tema'

// O mapa leva o React Flow e o ELK (mais de 1 MB): só baixa quando alguém aperta m.
const carregarMapa = () => import('./mapa')
const Mapa = lazy(carregarMapa)

type PropsDaTela = Contexto & { fluxo: Fluxo; passoInicial?: string }

// Abre no passo que o n ou o mapa pediu ou, sem pedido, no primeiro passo alterado que ainda espera decisão.
// Sem pedido, o passo já visto em outro fluxo fica de fora: ele abre recolhido e a leitura começa no que é novo aqui.
function indiceDeAbertura(fluxo: Fluxo, passoInicial: string | undefined, navegacao: Navegacao, estado: Estado, revisao: Revisao): number {
  const pedido = fluxo.passos.findIndex(p => p.id === passoInicial)
  if (pedido >= 0) return pedido
  const vistos = jaVistosDoFluxo(revisao, fluxo.id)
  const novos = fluxo.passos.filter(p => !vistos.has(p.id))
  const primeiro = novos.find(p => decididos(p.hunkIds, estado) < p.hunkIds.length) ?? novos[0]
  return indiceInicial(navegacao, `fluxo/${fluxo.id}`) ?? Math.max(0, fluxo.passos.findIndex(p => p === primeiro))
}

// O passo escolhido e o mapa moram aqui, acima do conteúdo de cada fluxo: o mapa não é desmontado ao trocar de fluxo. Desmontado,
// ele nascia invisível (opacity 0 até a subida da gaveta, que espera dois quadros de animação) e, num navegador que não pinta
// (aba em segundo plano), ficava aberto no estado e fechado na tela: o botão e o m pareciam não responder.
export function TelaDoFluxo(props: PropsDaTela) {
  const { fluxo, revisao, estado, mapa, navegacao, passoInicial } = props
  const [indice, setIndice] = useState(() => indiceDeAbertura(fluxo, passoInicial, navegacao, estado, revisao))
  // Outro fluxo recomeça no passo de abertura dele (ajuste durante o render: sem um quadro com o passo do fluxo anterior).
  const [mostrado, setMostrado] = useState(fluxo.id)
  if (mostrado !== fluxo.id) {
    setMostrado(fluxo.id)
    setIndice(indiceDeAbertura(fluxo, passoInicial, navegacao, estado, revisao))
  }
  // Baixa e avalia o mapa (>1 MB) com a página ociosa: se o download caísse na primeira abertura, travaria a subida da gaveta.
  useEffect(() => {
    const espera = setTimeout(carregarMapa, 1500)
    return () => clearTimeout(espera)
  }, [])
  // O mapa em outra janela acompanha este fluxo e este passo. Enquanto ela existe, a gaveta fica fechada: dois mapas iguais gastariam o
  // ELK duas vezes e disputariam a atenção, e a tela volta toda para o diff, que é o motivo de tirar o mapa daqui.
  // O m (e o botão) então traz a janela externa à frente, em vez de abrir a gaveta por cima dela.
  const externa = useJanelaExterna(fluxo.id, indice, passo => setIndice(Math.min(Math.max(passo, 0), fluxo.passos.length - 1)))
  useEffect(() => {
    if (externa.aberta && mapa.aberto) mapa.alternar()
  }, [externa.aberta])
  // A janela externa pode ter sido fechada sem aviso: focar confirma que ela responde, e se não responde o m abre a gaveta como sempre.
  const alternarMapa = async () => {
    if (externa.aberta && !mapa.aberto && await externa.focar()) return
    mapa.alternar()
  }
  return (
    <>
      <PassoAPasso key={fluxo.id} {...props} mapa={{ ...mapa, alternar: alternarMapa }} indice={indice} setIndice={setIndice} />
      {mapa.aberto && !externa.aberta && (
        <Suspense fallback={null}>
          <Mapa revisao={revisao} fluxo={fluxo} indice={indice} irParaPasso={setIndice} fechar={mapa.alternar} abrirEmOutraJanela={() => externa.abrir()} />
        </Suspense>
      )}
    </>
  )
}

function PassoAPasso({ fluxo, revisao, estado, decidir, comentarLinha, achados, escolherAchados, ladoALado, narrador, mapa, navegacao, indice, setIndice }: PropsDaTela & { indice: number; setIndice: (indice: number | ((atual: number) => number)) => void }) {
  const [comentando, setComentando] = useState(false)
  const [destaque, setDestaque] = useState<[number, number] | null>(null)
  const passo = fluxo.passos[indice] ?? fluxo.passos[0]!
  // O mapa também troca o passo (pelo setIndice da tela): comentário e destaque do passo anterior não valem no novo.
  const [visto, setVisto] = useState(indice)
  if (visto !== indice) {
    setVisto(indice)
    setComentando(false)
    setDestaque(null)
  }
  // O fluxo é narrado quando você o abre. Com o narrador em pausa ou desligado, o pedido nem sai.
  const narradorPronto = narrador.estado?.ativo === true && !narrador.estado.pausa
  const faltaNarrar = semNarracao(fluxo)
  useEffect(() => {
    if (narradorPronto && faltaNarrar) narrador.pedir([fluxo.id], false)
  }, [fluxo.id, narradorPronto, faltaNarrar])
  // Os passos que outro fluxo, antes na ordem de leitura, já mostrou: recolhidos, e o j e o k passam direto por eles.
  // "abertos" são os que a pessoa expandiu aqui; o clique no passo (lateral, mapa, n) chega neles sem expandir.
  const vistos = jaVistosDoFluxo(revisao, fluxo.id)
  const [abertos, setAbertos] = useState(new Set<string>())
  const origem = vistos.get(passo.id)
  const recolhido = origem !== undefined && !abertos.has(passo.id)
  const alternarAberto = (id: string) => setAbertos(antes => {
    const depois = new Set(antes)
    if (!depois.delete(id)) depois.add(id)
    return depois
  })
  // Atualização pela função: j apertado rápido não perde passo entre um render e outro.
  const andar = (direcao: 1 | -1) => {
    setComentando(false)
    setDestaque(null)
    setIndice(atual => vizinhoNaoVisto(fluxo, vistos, atual, direcao))
  }
  // Ir direto a um passo (clique, n) não pula os já vistos.
  const irPara = (destino: number) => {
    setComentando(false)
    setDestaque(null)
    setIndice(Math.min(Math.max(destino, 0), fluxo.passos.length - 1))
  }
  useCursor(navegacao, `fluxo/${fluxo.id}`, indice, irPara)
  // Os arquivos do passo de agora e dos próximos chegam antes da hora: o diff com contexto e o código dos passos de contexto nascem sem espera.
  useEffect(() => {
    for (const vizinho of fluxo.passos.slice(Math.max(0, indice - 1), indice + 4)) {
      const status = revisao.arquivos.find(a => a.caminho === vizinho.arquivo)?.status
      if (status !== 'novo' && status !== 'removido') precarregar(revisao, vizinho.arquivo)
    }
  }, [fluxo.id, indice, revisao])
  const marcar = () => {
    if (passo.hunkIds.length === 0) return andar(1)
    const pronto = passo.hunkIds.every(id => estado[id]?.decisao === 'revisado')
    decidir(passo.hunkIds, pronto ? null : 'revisado')
    if (!pronto) andar(1)
  }
  // A caixa de comentário mora no passo; comentar num passo recolhido o expande.
  const comentar = () => {
    if (recolhido) alternarAberto(passo.id)
    setComentando(passo.hunkIds.length > 0)
  }
  useAtalhos({ j: () => andar(1), k: () => andar(-1), x: marcar, c: comentar, m: mapa.alternar, Escape: () => mapa.aberto && mapa.alternar() })

  return (
    <section className="tela-do-fluxo">
      <header>
        <h1>{fluxo.titulo}</h1>
        <span className={`selo risco-${fluxo.risco}`}>risco {fluxo.risco}</span>
        {/* O mapa (>1 MB) baixa e avalia ao apontar o botão: o primeiro clique, antes do prefetch ocioso, não deixa a tela vazia esperando o download. */}
        <button className="botao-do-mapa" onClick={mapa.alternar} onPointerEnter={carregarMapa} onFocus={carregarMapa}>Mapa <kbd>m</kbd></button>
      </header>
      <div className="fluxo">
        <div className="linha-do-tempo">
          <PassosPorArquivo fluxo={fluxo} revisao={revisao} estado={estado} indice={indice} vistos={vistos} escolher={irPara} />
        </div>
        <article className={recolhido ? 'passo recolhido' : 'passo'}>
          <h2><span className={`papel papel-${passo.papel}`}>{passo.papel}</span> {passo.simbolo} <span className="local"><Caminho caminho={passo.arquivo} />:{passo.linhas[0]}–{passo.linhas[1]}</span>{' '}
            <button type="button" className="ver-arquivo" onClick={() => abrirFolha({ arquivo: passo.arquivo, titulo: passo.simbolo, linhas: passo.linhas })}>ver arquivo completo</button>
          </h2>
          {origem && (
            <p className="ja-visto-aviso">
              <span>já visto em <a href={`#fluxo/${origem.fluxo.id}/${origem.passo.id}`}>{origem.fluxo.titulo}</a></span>
              <button type="button" aria-expanded={!recolhido} onClick={() => alternarAberto(passo.id)}>{recolhido ? 'abrir aqui' : 'recolher'}</button>
            </p>
          )}
          {!recolhido && <>
            <FrasesDoPasso passo={passo} fluxo={fluxo} narrador={narrador} destacar={setDestaque} achados={achados} escolher={escolherAchados} />
            {passo.hunkIds.length > 0 && <Aprofundar chave={chaveDoPasso(passo)} narrador={narrador} destacar={setDestaque} />}
            {(passo.avisos ?? []).map(aviso => <p key={aviso} className="alerta">{aviso}</p>)}
            <Decisoes hunkIds={passo.hunkIds} opcoes={['revisado']} estado={estado} decidir={decidir} comentando={comentando} setComentando={setComentando} />
            {passo.hunkIds.length > 0
              ? <DiffDosTrechos revisao={revisao} arquivo={passo.arquivo} hunkIds={passo.hunkIds} estado={estado} comentarLinha={comentarLinha} ladoALado={ladoALado} destaque={destaque} />
              : <CodigoDoPasso key={passo.id} revisao={revisao} passo={passo} />}
          </>}
        </article>
      </div>
    </section>
  )
}

// Passo de contexto: não mudou, mas o revisor precisa ver o que ele faz com o dado. É o código de agora (do arquivo de chegada do diff) pintado
// como o dos diffs: o mesmo realce e o mesmo tema, que acompanha o claro e o escuro. A biblioteca só numera a partir de 1 quando mostra um arquivo
// solto, então o trecho vai como um patch só de contexto, que ela numera a partir da linha de verdade.
const LINHAS_DO_CONTEXTO = 200
const OPCOES_DO_CODIGO = { diffStyle: 'unified', theme: TEMAS, overflow: 'wrap', disableFileHeader: true, hunkSeparators: 'simple' } as const

function CodigoDoPasso({ revisao, passo }: { revisao: Revisao; passo: Passo }) {
  const tema = useTema()
  const trocando = useTrocando()
  const conteudo = useConteudo(revisao, passo.arquivo)
  const patch = useMemo(() => {
    if (!conteudo) return undefined
    const de = Math.max(passo.linhas[0], 1)
    const ate = Math.min(passo.linhas[1], de + LINHAS_DO_CONTEXTO - 1, conteudo.linhas.length)
    return patchDeLeitura(passo.arquivo, de, conteudo.linhas.slice(de - 1, ate))
  }, [conteudo, passo])
  const opcoes = useMemo<FileDiffOptions<undefined, undefined>>(() => ({ ...OPCOES_DO_CODIGO, themeType: MODOS[tema] }), [tema])
  // Na troca de modo o realce espera a animação acabar, como o diff (ver DiffDosTrechos).
  if (!patch || trocando) return null
  return <PatchDiff patch={patch} options={opcoes} />
}
