import { gerarCsv } from './csv'

describe('gerarCsv', () => {
  it('usa ponto e vírgula, vírgula decimal e escapa aspas', () => {
    const csv = gerarCsv(
      [
        { nome: 'Porcelanato "Cinza"; 60x60', qtd: 14.4 },
        { nome: 'Rejunte', qtd: null },
      ],
      [
        { titulo: 'Produto', valor: (l) => l.nome },
        { titulo: 'Qtd', valor: (l) => l.qtd },
      ],
    )
    expect(csv).toBe('Produto;Qtd\r\n"Porcelanato ""Cinza""; 60x60";14,4\r\nRejunte;')
  })

  it('neutraliza fórmulas maliciosas (CSV injection) sem estragar números negativos', () => {
    const csv = gerarCsv(
      [
        { v: '=HYPERLINK("http://x","clique")' },
        { v: '+5+cmd' },
        { v: '@SUM(A1)' },
        { v: '-2+3' },
        { v: '-1.234,56' },
        { v: '-R$ 10,00' },
        { v: 'Normal' },
      ],
      [{ titulo: 'V', valor: (l) => l.v }],
    )
    expect(csv.split('\r\n')).toEqual([
      'V',
      `"'=HYPERLINK(""http://x"",""clique"")"`,
      "'+5+cmd",
      "'@SUM(A1)",
      "'-2+3",
      '-1.234,56',
      '-R$ 10,00',
      'Normal',
    ])
  })
})
