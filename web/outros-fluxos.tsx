// O mapa fica preso ao fluxo aberto: clicar num bloco nunca troca de fluxo. Quando o bloco clicado é um trecho alterado que pertence a outro
// fluxo (ou aos órfãos), este aviso oferece o caminho, e só navega se a pessoa clicar nele.
import { Panel } from '@xyflow/react'
import { idDoNo, type Fluxo, type NoDoGrafo, type Revisao } from '../src/contrato'

interface Destino { endereco: string; nome: string }

// Só trecho alterado leva a algum lugar; o passo do fluxo aberto não precisa de aviso, porque o clique já o seleciona.
export function ondeMais(no: NoDoGrafo | undefined, revisao: Revisao, fluxo: Fluxo): Destino[] {
  if (!no || no.hunkIds.length === 0 || fluxo.passos.some(p => idDoNo(p) === no.id)) return []
  const fluxos = revisao.fluxos.flatMap(f => {
    const passo = f.passos.find(p => idDoNo(p) === no.id && p.hunkIds.length > 0)
    return passo && f.id !== fluxo.id ? [{ endereco: `#fluxo/${f.id}/${passo.id}`, nome: f.titulo }] : []
  })
  const orfao = revisao.orfaos.some(o => o.hunkIds.some(id => no.hunkIds.includes(id)))
  return orfao ? [...fluxos, { endereco: '#orfaos', nome: 'sem fluxo' }] : fluxos
}

// Na janela externa o link não pode trocar o endereço dela (quem mostra o fluxo é a principal): `navegar` pede à principal e cancela o link.
export function AvisoDeOutroFluxo({ no, destinos, navegar }: { no: NoDoGrafo; destinos: Destino[]; navegar?: (endereco: string) => void }) {
  if (destinos.length === 0) return null
  return (
    <Panel position="top-left" className="outro-fluxo">
      <span><strong>{no.simbolo}</strong> também é alterado em</span>
      {destinos.map(({ endereco, nome }) => (
        <a key={endereco} href={endereco} onClick={navegar && (e => { e.preventDefault(); navegar(endereco) })}>{nome} →</a>
      ))}
    </Panel>
  )
}
