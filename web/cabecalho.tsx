// O cabeçalho do mapa: título, o que cada marca quer dizer, a legenda das ligações e as ações.
import { Legenda, LegendaDosBlocos } from './legenda'

interface PropsDoCabecalho {
  // O fluxo a que o mapa está preso.
  titulo: string
  // O que está na tela agora, em palavras: passos, alterações de outros fluxos e código que já existia.
  resumo: string
  // Blocos fora da vista depois do enquadramento (0 não mostra o aviso) e a ação que mostra tudo.
  fora: number
  ajustar: () => void
  recolher: () => void
  fechar: () => void
  // Maximizar e abrir em outra janela só existem na gaveta (maximizada indefinido = sem o botão).
  maximizada?: boolean
  maximizar: () => void
  abrirFora?: () => void
}

export function CabecalhoDoMapa({ titulo, resumo, fora, ajustar, recolher, fechar, maximizada, maximizar, abrirFora }: PropsDoCabecalho) {
  return (
    <header>
      <h2>Mapa · <span className="nome-do-fluxo" title={titulo}>{titulo}</span></h2>
      <span className="detalhe">clique num bloco para abrir quem se liga a ele · aponte um bloco ou uma ligação para isolá-la</span>
      <Legenda />
      {fora > 0 && <button className="fora-da-vista" onClick={ajustar}>+{fora} fora da vista · ajustar <kbd>f</kbd></button>}
      <button onClick={recolher}>Recolher</button>
      {maximizada !== undefined && <button onClick={maximizar} aria-pressed={maximizada} title="Ocupa a área do conteúdo; de novo volta à altura anterior">{maximizada ? 'Restaurar' : 'Maximizar'} <kbd>z</kbd></button>}
      {abrirFora && <button onClick={abrirFora} title="Abre o mapa numa janela só dele, que acompanha o fluxo e o passo desta">Outra janela</button>}
      <button onClick={fechar}>Fechar <kbd>m</kbd></button>
      <div className="situacao-do-mapa"><span className="resumo-do-mapa">{resumo}</span><LegendaDosBlocos /></div>
    </header>
  )
}
