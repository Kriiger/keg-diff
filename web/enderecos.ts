// Para onde um link do panorama leva: o passo alterado que contém o símbolo, a linha ou o nó do mapa. Sem passo, quem chama
// abre o arquivo no modo árvore.
import { idDoNo, type Fluxo, type Passo, type Revisao } from '../src/contrato'

interface Achado { fluxo: Fluxo; passo: Passo }

export function enderecoDoPasso({ fluxo, passo }: Achado): string {
  return `#fluxo/${fluxo.id}/${passo.id}`
}

// Só passo alterado: o de contexto não tem o que decidir, e o link do panorama existe para levar à revisão.
function passosAlterados(revisao: Revisao): Achado[] {
  return revisao.fluxos.flatMap(fluxo => fluxo.passos.filter(passo => passo.hunkIds.length > 0).map(passo => ({ fluxo, passo })))
}

export function enderecoDoSimbolo(revisao: Revisao, arquivo: string, simbolo: string): string | undefined {
  const achado = passosAlterados(revisao).find(a => a.passo.arquivo === arquivo && a.passo.simbolo === simbolo)
  return achado && enderecoDoPasso(achado)
}

// Se a linha cai em mais de um passo (uma função dentro de outra), vale o menor.
export function enderecoDaLinha(revisao: Revisao, arquivo: string, linha: number): string | undefined {
  const tamanho = ({ passo }: Achado) => passo.linhas[1] - passo.linhas[0]
  const dentro = passosAlterados(revisao).filter(a => a.passo.arquivo === arquivo && a.passo.linhas[0] <= linha && linha <= a.passo.linhas[1])
  const menor = dentro.sort((a, b) => tamanho(a) - tamanho(b))[0]
  return menor && enderecoDoPasso(menor)
}

export function enderecoDoNo(revisao: Revisao, id: string): string | undefined {
  const achado = passosAlterados(revisao).find(a => idDoNo(a.passo) === id)
  return achado && enderecoDoPasso(achado)
}

// A tela dos órfãos abre no item de posição `indice` em revisao.orfaos (a lista da tela tem a mesma ordem).
export function enderecoDoOrfao(indice: number): string {
  return `#orfaos/${indice}`
}
