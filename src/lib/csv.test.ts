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
})
