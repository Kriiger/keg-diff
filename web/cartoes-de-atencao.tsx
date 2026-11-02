// Os sinais de atenção do diff, um por linha, cada um abrindo a lista de onde está.
import { useMemo } from 'react'
import type { Revisao } from '../src/contrato'
import { Cartao, LinkDoArquivo } from './cartao'
import { sinaisDeAtencao } from './sinais'

const OCORRENCIAS_MOSTRADAS = 8

export function CartaoDeAtencao({ revisao }: { revisao: Revisao }) {
  const sinais = useMemo(() => sinaisDeAtencao(revisao), [revisao])
  if (sinais.length === 0) return null
  return (
    <Cartao titulo="Sinais de atenção" dica="o que o diff pode ter deixado para trás">
      <ul className="sinais">
        {sinais.map((sinal, i) => (
          <li key={sinal.chave}>
            <details open={i === 0}>
              <summary><span className="rotulo">{sinal.rotulo}</span><span className="contagem atencao">{sinal.itens.length}</span></summary>
              <p className="detalhe">{sinal.dica}</p>
              <ul className="ocorrencias">
                {sinal.itens.slice(0, OCORRENCIAS_MOSTRADAS).map(item => (
                  <li key={`${item.arquivo}#${item.rotulo}#${item.texto}`}>
                    <LinkDoArquivo caminho={item.arquivo} href={item.href}>{item.rotulo}</LinkDoArquivo>
                    {item.texto && <code>{item.texto}</code>}
                  </li>
                ))}
              </ul>
              {sinal.itens.length > OCORRENCIAS_MOSTRADAS && <p className="detalhe">+{sinal.itens.length - OCORRENCIAS_MOSTRADAS} ocorrências</p>}
            </details>
          </li>
        ))}
      </ul>
    </Cartao>
  )
}
