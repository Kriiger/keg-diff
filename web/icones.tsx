// Os ícones da lateral: traço de 1,5 numa grade de 24, uma cor só (a do texto ao redor), no molde dos símbolos do sistema.
// A cor e o tamanho vêm do CSS (currentColor, .icone); aqui só mora o desenho.
const FORMAS = {
  panorama: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" /></>,
  fluxo: <path d="M3 12h6l4-6h8M9 12l4 6h8" />,
  // Um nó solto, cercado de tracejado: o que não tem ligação com nada.
  orfao: <><circle cx="12" cy="12" r="8" strokeDasharray="3 3.4" /><circle cx="12" cy="12" r="2.4" /></>,
  teste: <path d="M9.5 3.5h5M10.5 3.5v5.3L5.3 17.4a2 2 0 0 0 1.7 3.1h10a2 2 0 0 0 1.7-3.1l-5.2-8.6V3.5M8 14.5h8" />,
  outros: <path d="M7 3.5h6.5l4.5 4.5v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM13.5 3.5V8H18M9 13h6M9 16.5h6" />,
  fechar: <path d="M6 21V4M6 4h11.5l-2.5 4 2.5 4H6" />,
  pasta: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  // A pasta aberta do modo árvore: o fundo da pasta e a frente inclinada, como no VS Code.
  pastaAberta: <><path d="M3.5 17.5v-11a2 2 0 0 1 2-2h3.8l2 2.5h6.2a2 2 0 0 1 2 2V10" /><path d="M3.8 18.5l2-6.6a1.8 1.8 0 0 1 1.7-1.3h13.1a1 1 0 0 1 1 1.3l-2 6a2 2 0 0 1-1.9 1.4H5.5a1.8 1.8 0 0 1-1.7-.8z" /></>,
  // O arquivo liso do modo árvore (o "outros" tem as linhas de texto).
  arquivo: <path d="M7 3.5h6.5l4.5 4.5v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM13.5 3.5V8H18" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  // O painel lateral com a coluna à esquerda.
  lateral: <><rect x="3" y="4.5" width="18" height="15" rx="3.5" /><path d="M9.5 4.5v15" /></>,
}

export type NomeDoIcone = keyof typeof FORMAS

export function Icone({ nome, classe = '' }: { nome: NomeDoIcone; classe?: string }) {
  return (
    <svg className={`icone ${classe}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {FORMAS[nome]}
    </svg>
  )
}
