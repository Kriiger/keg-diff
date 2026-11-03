// A folha "ver arquivo completo": um painel que entra pela direita, por cima da página, com o arquivo inteiro como ele está na ponta de chegada
// do diff e as mudanças deste diff marcadas (acréscimo e remoção coloridos, todas as linhas à mostra), já rolado até o bloco que a abriu.
// Um arquivo que o diff não tocou (um vizinho no mapa) abre colorido e sem marcas, no bloco do símbolo. A folha só lê: comentar e decidir
// continuam na tela de baixo, que fica inerte enquanto ela está aberta (os atalhos de uma letra também não agem lá, ver useAtalhos).
// O corpo pesado (o realce do arquivo todo) só monta depois que o painel termina de entrar, para a animação não perder quadros.
import { File, PatchDiff, type FileDiffOptions, type FileOptions } from '@pierre/diffs/react'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { montarPatchComContexto, patchSemContexto } from '../src/contexto'
import type { Revisao } from '../src/contrato'
import { useConteudo } from './arquivos'
import { Caminho } from './caminho'
import { devolverFoco, fecharFolha, useFolha, type PedidoDaFolha } from './folha'
import { TEMAS } from './telas'
import { MODOS, useTema } from './tema'

// Mesmo se a animação de entrada não avisar que terminou (aba em segundo plano), o corpo monta.
const PRAZO_DA_ENTRADA_EM_MS = 450
const FOCAVEIS = 'button, [href], input, textarea, select, [tabindex="0"]'

export function FolhaDoArquivo({ revisao }: { revisao: Revisao }) {
  const pedido = useFolha()
  if (!pedido) return null
  // Fora da raiz da página: é a raiz que fica inerte, e a folha não.
  return createPortal(<Folha key={`${pedido.arquivo}:${pedido.linhas?.join('-') ?? ''}`} revisao={revisao} pedido={pedido} />, document.body)
}

function Folha({ revisao, pedido }: { revisao: Revisao; pedido: PedidoDaFolha }) {
  const painel = useRef<HTMLElement>(null)
  const cortina = useRef<HTMLDivElement>(null)
  const corpo = useRef<HTMLDivElement>(null)
  const fechar = useRef<HTMLButtonElement>(null)
  const [pronta, setPronta] = useState(false)

  useEffect(() => {
    const raiz = document.getElementById('raiz')
    if (raiz) raiz.inert = true
    fechar.current?.focus()
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.preventDefault()
        evento.stopPropagation()
        return fecharFolha()
      }
      if (evento.key === 'Tab') prenderOFoco(evento, painel.current)
    }
    // Na captura e antes de qualquer outro: o Esc é só da folha, e não fecha também o mapa ou a ajuda que estão por baixo.
    addEventListener('keydown', aoTeclar, true)
    // A rolagem sobre a cortina não passa para a página de baixo. Ouvinte nativo: o do React é passivo e não pode impedir.
    const parar = (evento: Event) => evento.preventDefault()
    cortina.current?.addEventListener('wheel', parar, { passive: false })
    const prazo = setTimeout(() => setPronta(true), PRAZO_DA_ENTRADA_EM_MS)
    return () => {
      removeEventListener('keydown', aoTeclar, true)
      cortina.current?.removeEventListener('wheel', parar)
      clearTimeout(prazo)
      if (raiz) raiz.inert = false
      devolverFoco()
    }
  }, [])

  return (
    <>
      <div ref={cortina} className="cortina-da-folha" onClick={fecharFolha} />
      <aside ref={painel} className="folha-do-arquivo" role="dialog" aria-modal="true" aria-labelledby="titulo-da-folha" onAnimationEnd={evento => evento.target === evento.currentTarget && setPronta(true)}>
        <header>
          <h2 id="titulo-da-folha">
            {pedido.titulo && <span className="simbolo">{pedido.titulo}</span>}
            <span className="local"><Caminho caminho={pedido.arquivo} />{pedido.linhas && `:${pedido.linhas[0]}–${pedido.linhas[1]}`}</span>
          </h2>
          <div className="botoes">
            {pedido.acao && <button type="button" onClick={() => { fecharFolha(); pedido.acao?.executar() }}>{pedido.acao.rotulo}</button>}
            <button ref={fechar} type="button" onClick={fecharFolha}>Fechar <kbd>esc</kbd></button>
          </div>
        </header>
        <div ref={corpo} className="corpo-da-folha" tabIndex={0} role="region" aria-label="Conteúdo do arquivo">
          {pronta ? <ArquivoNaFolha revisao={revisao} pedido={pedido} corpo={corpo} /> : <p className="detalhe">Abrindo o arquivo…</p>}
        </div>
      </aside>
    </>
  )
}

// O Tab dá a volta dentro da folha (a página de baixo é inerte, mas o foco ainda escaparia para a barra do navegador).
function prenderOFoco(evento: KeyboardEvent, painel: HTMLElement | null) {
  const alvos = painel ? [...painel.querySelectorAll<HTMLElement>(FOCAVEIS)] : []
  const primeiro = alvos[0]
  const ultimo = alvos.at(-1)
  if (!painel || !primeiro || !ultimo) return
  if (!painel.contains(document.activeElement)) {
    evento.preventDefault()
    primeiro.focus()
  } else if (evento.shiftKey && document.activeElement === primeiro) {
    evento.preventDefault()
    ultimo.focus()
  } else if (!evento.shiftKey && document.activeElement === ultimo) {
    evento.preventDefault()
    primeiro.focus()
  }
}

// O que a folha mostra, do mais completo ao menos:
// - arquivo alterado, com o arquivo de chegada: o arquivo inteiro como um diff de um bloco só (montarPatchComContexto com contexto infinito);
// - arquivo novo ou removido: o patch dele, que já tem todas as linhas;
// - arquivo sem mudança neste diff (vizinho do mapa, renomeado puro): o arquivo colorido, sem marcas;
// - arquivo alterado que não bate com os trechos (a revisão ficou velha) ou que o servidor não entregou: o que der, com o aviso.
function ArquivoNaFolha({ revisao, pedido, corpo }: { revisao: Revisao; pedido: PedidoDaFolha; corpo: RefObject<HTMLElement | null> }) {
  const tema = useTema()
  const alterado = revisao.arquivos.find(a => a.caminho === pedido.arquivo)
  const comMudancas = alterado !== undefined && alterado.hunks.length > 0
  const jaCompleto = comMudancas && alterado.status !== 'alterado'
  const conteudo = useConteudo(revisao, jaCompleto ? undefined : pedido.arquivo)
  const montado = useMemo(
    () => (comMudancas && conteudo ? montarPatchComContexto(alterado.caminho, alterado.hunks, alterado.hunks.map(h => h.id), conteudo.linhas, {}, Infinity) : undefined),
    [alterado, comMudancas, conteudo],
  )

  let patch: string | undefined
  let aviso: string | undefined
  if (jaCompleto) patch = patchSemContexto(alterado, alterado.hunks)
  else if (comMudancas && conteudo !== undefined) {
    patch = montado?.patch
    if (patch === undefined && conteudo === null) {
      aviso = 'Não consegui ler o arquivo inteiro: aqui estão só os trechos alterados.'
      patch = patchSemContexto(alterado, alterado.hunks)
    } else if (patch === undefined) {
      aviso = 'O arquivo não bate mais com os trechos da revisão (mudou depois do keg diff): aqui ele aparece sem as marcas. Rode o keg diff de novo.'
    }
  } else if (conteudo === null) aviso = 'Não consegui ler o arquivo.'

  const opcoes = useMemo<FileDiffOptions<undefined, undefined> & FileOptions<undefined, undefined>>(() => ({ theme: TEMAS, themeType: MODOS[tema], overflow: 'wrap', diffStyle: 'unified' }), [tema])
  const [de, ate] = pedido.linhas ?? []
  // O bloco que abriu a folha fica realçado (como as linhas da frase do narrador) e é para onde ela rola.
  const marca = de !== undefined && ate !== undefined ? { start: de, end: ate } : null
  useRolarAte(corpo, de, patch ?? conteudo)

  if (!jaCompleto && conteudo === undefined) return <p className="detalhe">Lendo o arquivo…</p>
  return (
    <>
      {aviso && <p className="alerta">{aviso}</p>}
      {patch !== undefined
        ? <PatchDiff patch={patch} selectedLines={marca && { ...marca, side: 'additions', endSide: 'additions' }} options={opcoes} />
        : conteudo && <File file={{ name: pedido.arquivo, contents: conteudo.texto }} selectedLines={marca} options={opcoes} />}
    </>
  )
}

// Rola o corpo até a linha, a um quarto da altura: o diff vive no shadow DOM do <diffs-container> e desenha um pouco depois do React,
// então procura a linha a cada quadro (por até 3 s) em vez de supor que ela já está lá. Não usa scrollIntoView: ele rolaria a página também.
function useRolarAte(corpo: RefObject<HTMLElement | null>, linha: number | undefined, conteudo: unknown) {
  useEffect(() => {
    if (linha === undefined || conteudo === undefined) return
    let quadro = 0
    const limite = performance.now() + 3000
    const procurar = () => {
      const area = corpo.current
      const alvo = area?.querySelector('diffs-container')?.shadowRoot?.querySelector<HTMLElement>(`[data-line="${linha}"]:not([data-line-type="change-deletion"])`)
      if (area && alvo) {
        area.scrollTop += alvo.getBoundingClientRect().top - area.getBoundingClientRect().top - area.clientHeight / 4
        return
      }
      if (performance.now() < limite) quadro = requestAnimationFrame(procurar)
    }
    quadro = requestAnimationFrame(procurar)
    return () => cancelAnimationFrame(quadro)
  }, [linha, conteudo])
}
