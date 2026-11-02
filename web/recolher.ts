// Se a lateral está aberta. Na tela larga a escolha fica só neste navegador (localStorage), no mesmo molde do tema.tsx e do modo.ts.
// Na estreita a lateral é uma gaveta sobre o conteúdo: nasce fechada e a escolha não é gravada, senão quem abriu a gaveta no
// celular encontraria o conteúdo coberto na visita seguinte.
import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { iniciarTransicao, podeAnimar } from './transicao'

const CHAVE = 'keg-lateral'
const ESTREITA = '(max-width: 860px)'

const observadores = new Set<() => void>()
const tela = matchMedia(ESTREITA)
let aberta = abertaAoNascer()
aplicar()

function abertaAoNascer(): boolean {
  if (tela.matches) return false
  try {
    return localStorage.getItem(CHAVE) !== 'recolhida'
  } catch {
    return true
  }
}

// O CSS lê o atributo no <html> (como o data-tema), então a página que recolhe a lateral não precisa saber dela.
function aplicar() {
  if (aberta) delete document.documentElement.dataset.lateral
  else document.documentElement.dataset.lateral = 'recolhida'
}

function avisar() {
  aplicar()
  for (const observador of observadores) observador()
}

// Cruzar os 860px (girar o aparelho, redimensionar) recomeça do que vale na nova largura.
tela.addEventListener('change', () => {
  aberta = abertaAoNascer()
  avisar()
})

// Quem estava com o foco dentro da lateral o perde ao fechá-la (ela vira inert): o foco vai para o botão que a reabre.
function devolverFoco() {
  if (document.querySelector('.lateral')?.contains(document.activeElement)) document.getElementById('botao-da-lateral')?.focus()
}

function trocar() {
  aberta = !aberta
  if (!tela.matches) {
    try {
      localStorage.setItem(CHAVE, aberta ? 'aberta' : 'recolhida')
    } catch {}
  }
  if (!aberta) devolverFoco()
  avisar()
}

// Na tela larga a coluna do conteúdo muda de largura (o conteúdo refaz o layout): numa View Transition isso acontece uma vez só,
// escondido atrás da foto, enquanto o painel desliza e o conteúdo se mistura (o CSS está em estilo/lateral.css). Animar a coluna
// quadro a quadro refazia o diff inteiro a cada passo. Na estreita a gaveta já anima sozinha por transform e não mexe no conteúdo.
// Como em modo.ts, o novo estado é calculado dentro da troca: duas teclas seguidas alternam duas vezes.
// O flushSync é barato: só o MoldeDaLateral assina o estado (useLateralAberta) e seus filhos chegam como props iguais, então o React
// não refaz o diff nem a árvore; a troca de verdade é o atributo no <html> e o reflow do conteúdo, que o CSS faz uma vez.
export function alternarLateral() {
  if (tela.matches || !podeAnimar()) return trocar()
  iniciarTransicao('lateral', () => flushSync(trocar))
}

// Escape e o toque na cortina: só a gaveta (tela estreita) fecha assim; na larga a lateral é parte da página.
export function fecharGaveta() {
  if (aberta && tela.matches) alternarLateral()
}

export function useLateralAberta(): boolean {
  return useSyncExternalStore(assinar, () => aberta)
}

function assinar(observador: () => void): () => void {
  observadores.add(observador)
  return () => void observadores.delete(observador)
}
