// O caminho de um arquivo com a pasta apagada e o nome em destaque: o mesmo desenho no panorama, na linha do tempo e no mapa,
// para reconhecer o arquivo de relance mesmo quando ele aparece em vários passos e fluxos.
export function Caminho({ caminho }: { caminho: string }) {
  const barra = caminho.lastIndexOf('/') + 1
  // O <wbr> depois de cada barra: o caminho quebra entre as pastas, e só no meio de um nome se este sozinho não couber.
  const pastas = caminho.slice(0, barra).split('/').filter(Boolean)
  return <span className="caminho" title={caminho}><span className="pasta-do-caminho">{pastas.map(pasta => <span key={pasta}>{pasta}/<wbr /></span>)}</span>{caminho.slice(barra)}</span>
}
