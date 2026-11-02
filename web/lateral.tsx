// A lateral da revisão, nos dois modos: um painel flutuante com a marca e o progresso no topo, as seções recolhíveis no meio
// e, se houver, um rodapé fixo. O modo fluxo monta as seções aqui; o modo árvore (arvore.tsx) usa o mesmo molde e as mesmas seções.
import { useId, useState, type MouseEvent, type ReactNode } from 'react'
import type { Estado, Revisao } from '../src/contrato'
import { Icone, type NomeDoIcone } from './icones'
import type { Checklist } from './main'
import { alternarLateral, fecharGaveta, useLateralAberta } from './recolher'
import { decididos, encurtarBase } from './telas'

type Grupo = 'orfaos' | 'testes' | 'outros'
const ICONE_DO_GRUPO: Record<Grupo, NomeDoIcone> = { orfaos: 'orfao', testes: 'teste', outros: 'outros' }

// O painel: "cabeca" é o topo (marca e progresso), "rodape" fica preso embaixo e os filhos rolam no meio.
// Recolhida, a lateral vira inert: sai do Tab e do leitor de tela junto com a animação.
// O botão de recolher é fixo no canto: dentro do painel quando aberto, solto sobre o conteúdo quando recolhido. É um botão só,
// então o foco não se perde na troca; vem antes do painel no HTML para o Tab chegar nele primeiro.
export function MoldeDaLateral({ cabeca, rodape, children }: { cabeca: ReactNode; rodape?: ReactNode; children: ReactNode }) {
  const aberta = useLateralAberta()
  const acao = aberta ? 'Recolher a lateral' : 'Mostrar a lateral'
  // No celular a lateral é uma gaveta: escolher um destino a fecha, para o conteúdo aparecer.
  const aoClicar = (evento: MouseEvent<HTMLElement>) => {
    if (evento.target instanceof Element && evento.target.closest('a, .arquivo')) fecharGaveta()
  }
  return (
    <>
      <button id="botao-da-lateral" type="button" className="botao-da-lateral" onClick={alternarLateral} aria-expanded={aberta} aria-controls="lateral" aria-label={acao} title={`${acao} (a tecla s alterna)`}>
        <Icone nome="lateral" />
      </button>
      <div className="cortina" onClick={fecharGaveta} aria-hidden="true" />
      <nav id="lateral" className="lateral" aria-label="Revisão" inert={!aberta} onClick={aoClicar}>
        <div className="lateral-topo">{cabeca}</div>
        <div className="lateral-rolagem">{children}</div>
        {rodape && <div className="lateral-rodape">{rodape}</div>}
      </nav>
    </>
  )
}

// A marca e o quanto da revisão já tem decisão, nos dois modos.
// A logo entra no lugar de .marca-nome (ou antes dele): o resto do topo já reserva a altura e a folga do botão de recolher.
export function CabecaDaLateral({ revisao, checklist, estado }: { revisao: Revisao; checklist: Checklist; estado: Estado }) {
  const feitos = decididos(checklist.todos, estado)
  const total = checklist.todos.length
  const completa = total > 0 && feitos === total
  const porcentagem = total === 0 ? 100 : (feitos / total) * 100
  return (
    <>
      <a href="#" className="marca">
        <span className="marca-nome">keg diff</span>
        <span className="marca-base">{encurtarBase(revisao.base)}</span>
      </a>
      <div className={completa ? 'progresso completa' : 'progresso'}>
        <span className="anel">
          <svg className="anel-svg" viewBox="0 0 36 36" aria-hidden="true">
            <circle className="anel-fundo" cx="18" cy="18" r="15" />
            <circle className={feitos > 0 ? 'anel-arco' : 'anel-arco vazio'} cx="18" cy="18" r="15" pathLength="100" style={{ strokeDasharray: `${porcentagem} 100` }} />
          </svg>
          {completa ? <Icone nome="check" /> : <span className="anel-numero">{Math.floor(porcentagem)}</span>}
        </span>
        <span className="progresso-texto"><strong>{feitos} de {total}</strong> trechos revisados</span>
      </div>
    </>
  )
}

// O cabeçalho da seção é um botão com chevron; o corpo recolhe animando a altura (CSS) e vira inert, para os itens
// escondidos saírem do Tab. Todas as seções nascem abertas.
export function SecaoRecolhivel({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [aberta, setAberta] = useState(true)
  const id = useId()
  return (
    <section className={aberta ? 'secao' : 'secao fechada'}>
      <h2>
        <button type="button" className="secao-titulo" aria-expanded={aberta} aria-controls={id} onClick={() => setAberta(atual => !atual)}>
          {titulo}
          <Icone nome="chevron" classe={aberta ? 'seta aberta' : 'seta'} />
        </button>
      </h2>
      <div id={id} className="secao-corpo" inert={!aberta}>
        <div className="secao-lista">{children}</div>
      </div>
    </section>
  )
}

interface PropsDoItem {
  destino: string
  rotulo: string
  icone: NomeDoIcone
  endereco: string
  progresso?: { feitos: number; total: number }
  risco?: string
  dica?: string
}

function ItemDaLateral({ destino, rotulo, icone, endereco, progresso, risco, dica }: PropsDoItem) {
  return (
    <a href={`#${destino}`} className={risco ? `item-da-lista risco-${risco}` : 'item-da-lista'} aria-current={endereco === destino ? 'page' : undefined} title={dica}>
      <Icone nome={icone} />
      <span className="rotulo">{rotulo}</span>
      {progresso && <Contagem {...progresso} />}
    </a>
  )
}

// Completo ganha o ✓ além do verde: a cor sozinha não diz que acabou.
function Contagem({ feitos, total }: { feitos: number; total: number }) {
  return (
    <span className={feitos === total ? 'contagem completa' : 'contagem'}>
      {feitos === total && total > 0 && <Icone nome="check" />}
      {feitos}/{total}
    </span>
  )
}

// A checklist do modo fluxo: o panorama, cada fluxo e cada grupo de trechos com o quanto falta; o fechamento fica no rodapé.
export function LateralDoFluxo({ revisao, checklist, estado, endereco, secoes }: { revisao: Revisao; checklist: Checklist; estado: Estado; endereco: string; secoes: Record<Grupo, { titulo: string }> }) {
  const progresso = (hunkIds: string[]) => ({ feitos: decididos(hunkIds, estado), total: hunkIds.length })
  const grupos = (Object.keys(secoes) as Grupo[]).filter(grupo => checklist[grupo].length > 0)
  const fechamento = <ItemDaLateral destino="fechamento" rotulo="Fechamento" icone="fechar" endereco={endereco} progresso={progresso(checklist.todos)} />
  return (
    <MoldeDaLateral cabeca={<CabecaDaLateral revisao={revisao} checklist={checklist} estado={estado} />} rodape={fechamento}>
      <ItemDaLateral destino="" rotulo="Panorama" icone="panorama" endereco={endereco} />
      {checklist.fluxos.length > 0 && (
        <SecaoRecolhivel titulo="Fluxos">
          {checklist.fluxos.map(({ fluxo, hunkIds }) => (
            <ItemDaLateral key={fluxo.id} destino={`fluxo/${fluxo.id}`} rotulo={fluxo.titulo} icone="fluxo" endereco={endereco} progresso={progresso(hunkIds)} risco={fluxo.risco} />
          ))}
        </SecaoRecolhivel>
      )}
      {grupos.length > 0 && (
        <SecaoRecolhivel titulo="Fora dos fluxos">
          {grupos.map(grupo => {
            const itens = checklist[grupo]
            return <ItemDaLateral key={grupo} destino={grupo} rotulo={secoes[grupo].titulo} icone={ICONE_DO_GRUPO[grupo]} endereco={endereco} progresso={progresso(itens.flatMap(i => i.hunkIds))} dica={`${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`} />
          })}
        </SecaoRecolhivel>
      )}
    </MoldeDaLateral>
  )
}
