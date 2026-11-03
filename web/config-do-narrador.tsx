// O modelo e o esforço do narrador, trocados na própria página: um botão na barra de atalhos e, aberto, um painel acima dela.
// O servidor grava no keg.config.json e usa a escolha na próxima chamada, sem reiniciar; a narração que já está na tela fica como está.
import { useEffect, useState } from 'react'
import { ESFORCOS, MODELOS_CONHECIDOS, modeloValido } from '../src/contrato'
import type { Narrador } from './narracao'

const OUTRO = 'outro'

export function BotaoDoNarrador({ narrador, aberto, alternar }: { narrador: Narrador; aberto: boolean; alternar: () => void }) {
  const { estado } = narrador
  if (!estado) return null
  return (
    <button onClick={alternar} aria-expanded={aberto} title="Modelo e esforço do narrador (e do botão explicar mais)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" />
      </svg>
      <span className="prefixo">Narrador: </span>{estado.modelo} · {estado.esforco}
    </button>
  )
}

export function PainelDoNarrador({ narrador, fechar }: { narrador: Narrador; fechar: () => void }) {
  const atual = narrador.estado
  const [escolha, setEscolha] = useState(() => (atual && MODELOS_CONHECIDOS.includes(atual.modelo) ? atual.modelo : OUTRO))
  const [outro, setOutro] = useState(() => (atual && !MODELOS_CONHECIDOS.includes(atual.modelo) ? atual.modelo : ''))
  const [esforco, setEsforco] = useState(atual?.esforco ?? '')
  const [erro, setErro] = useState<string>()
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => evento.key === 'Escape' && fechar()
    addEventListener('keydown', aoTeclar)
    return () => removeEventListener('keydown', aoTeclar)
  }, [])
  if (!atual) return null

  const modelo = escolha === OUTRO ? outro.trim() : escolha
  const valido = modeloValido(modelo) && ESFORCOS.includes(esforco)
  const mudou = modelo !== atual.modelo || esforco !== atual.esforco
  const salvar = async () => {
    setSalvando(true)
    const recusa = await narrador.configurar(modelo, esforco)
    setSalvando(false)
    if (recusa) setErro(recusa)
    else fechar()
  }
  return (
    <form className="painel-do-narrador" role="dialog" aria-label="Modelo e esforço do narrador" onSubmit={evento => { evento.preventDefault(); if (valido && mudou && !salvando) void salvar() }}>
      <h2>Narrador</h2>
      <fieldset>
        <legend>Modelo</legend>
        <div className="opcoes" role="radiogroup" aria-label="Modelo">
          {[...MODELOS_CONHECIDOS, OUTRO].map(nome => (
            <button key={nome} type="button" role="radio" aria-checked={escolha === nome} className={escolha === nome ? 'ativa' : ''} onClick={() => { setEscolha(nome); setErro(undefined) }}>{nome === OUTRO ? 'outro…' : nome}</button>
          ))}
        </div>
        {escolha === OUTRO && (
          <input value={outro} onChange={evento => { setOutro(evento.target.value); setErro(undefined) }} placeholder="nome do modelo, como claude-sonnet-4-5" aria-label="Nome do modelo" aria-invalid={!valido && outro !== ''} autoFocus spellCheck={false} />
        )}
      </fieldset>
      <fieldset>
        <legend>Esforço</legend>
        <div className="opcoes" role="radiogroup" aria-label="Esforço">
          {ESFORCOS.map(nome => (
            <button key={nome} type="button" role="radio" aria-checked={esforco === nome} className={esforco === nome ? 'ativa' : ''} onClick={() => { setEsforco(nome); setErro(undefined) }}>{nome}</button>
          ))}
        </div>
      </fieldset>
      <p className="detalhe">Vale a partir da próxima chamada e fica no keg.config.json. O que já foi narrado fica como está.</p>
      {erro && <p className="alerta grave">{erro}</p>}
      <div className="acoes">
        <button type="button" onClick={fechar}>Cancelar</button>
        <button type="submit" className="ativa" disabled={!valido || !mudou || salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  )
}
