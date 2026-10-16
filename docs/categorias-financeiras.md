# Taxonomia de categorias financeiras (MVP)

Lista fechada de categorias usada pela classificação automática da IA e por toda agregação
(resumo diário/semanal, dashboard). Categoria é sempre um valor desta lista — nunca uma string
livre gerada pela IA. Toda categoria citada em `docs/conversas-tom.md` existe aqui.

Cada categoria tem: nome canônico (o que fica gravado no banco), aliases (variações de
linguagem natural que mapeiam para ela) e exemplos de gatilho (frases que a acionam com alta
confiança, sem precisar perguntar — ver regra de confiança em `docs/conversas-tom.md`).

## Despesas

| Categoria canônica | Aliases | Exemplos de gatilho (alta confiança) |
|---|---|---|
| `alimentacao` | comida, almoço, jantar, lanche, restaurante, ifood | "gastei 45 no almoço", "pedi um lanche" |
| `mercado` | supermercado, feira, compras de casa | "gastei no mercado", "fui no supermercado" |
| `transporte` | uber, 99, combustível, gasolina, ônibus, estacionamento | "gastei 30 de uber", "abasteci o carro" |
| `moradia` | aluguel, condomínio, IPTU | "paguei o aluguel", "condomínio desse mês" |
| `utilidades_telecom` | luz, água, internet, telefone, celular | "paguei a internet", "conta de luz" |
| `impostos` | DAS, INSS, imposto de renda, MEI | "paguei o DAS", "imposto de renda" |
| `servicos_terceiros` | pagamento a freelancer, consultoria paga, mão de obra contratada | "paguei um freelancer", "contratei alguém pra..." |
| `outros_despesa` | fallback — nunca atribuída automaticamente | usado só depois de Tom perguntar e não se encaixar em nenhuma acima |

## Receitas

| Categoria canônica | Aliases | Exemplos de gatilho (alta confiança) |
|---|---|---|
| `servicos_prestados` | projeto, freelance entregue, honorário, cliente pagou | "recebi 1200 de um projeto", "o cliente pagou" |
| `outras_receitas` | reembolso, venda de item usado, repasse | fallback — nunca atribuída automaticamente |

## Regra de uso

- `outros_despesa` e `outras_receitas` são categorias de **último recurso**: a IA nunca as
  atribui sozinha. Se a descrição não casar com nenhuma categoria específica, Tom pergunta
  (regra de confiança do roteiro) e só usa o fallback se o próprio usuário confirmar que não
  sabe classificar melhor.
- Toda tool que recebe `category` como parâmetro (`createTransaction`, `updateTransaction`)
  valida contra esta lista fechada — um valor fora dela é erro de validação, não é gravado
  (ver `docs/tools-contrato.md`).
