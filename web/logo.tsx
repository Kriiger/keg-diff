// A marca: um barril com duas linhas de diff no lugar dos aros (verde o que nasce, laranja o que termina) e o nome em dois pesos.
// O desenho é o mesmo de web/public/favicon.svg e de assets/logo/; aqui só muda a cor: o barril herda a do texto (currentColor)
// e as linhas usam os tokens do tema, para valer no claro e no escuro. O nome é texto de verdade, então o leitor de tela lê "keg diff".
export function Logo() {
  return (
    <span className="logo">
      <svg className="logo-icone" viewBox="0 0 64 64" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path className="logo-barril" d="M22 10h20c7 5 10 12 10 22s-3 17-10 22H22c-7-5-10-12-10-22s3-17 10-22z" />
        <path className="logo-linha logo-nasce" d="M22 24h20" />
        <path className="logo-linha logo-termina" d="M22 40h20" />
      </svg>
      <span className="logo-nome">
        <span className="logo-keg">keg</span> <span className="logo-diff">diff</span>
      </span>
    </span>
  )
}
