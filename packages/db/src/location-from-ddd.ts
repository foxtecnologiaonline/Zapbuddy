const DEFAULT_LOCATION = { city: 'São Paulo', uf: 'SP', latitude: -23.5505, longitude: -46.6333 };

export interface DddLocation {
  city: string;
  uf: string;
  latitude: number;
  longitude: number;
}

/**
 * DDD → cidade/UF/coordenadas representativas — mesma mecânica e mesma
 * aproximação de `inferTimezoneFromWhatsappNumber` (que já cobre as 8
 * exceções de fuso), só que para TODOS os DDDs brasileiros, porque aqui o
 * uso é previsão do tempo e feriado regional, não só fuso: coordenada errada
 * dá temperatura errada, e UF errada dá feriado estadual errado. A cidade é
 * só um ponto representativo da área do DDD (quase sempre a capital
 * regional), não o endereço real da pessoa — não temos esse dado e não é
 * objetivo capturá-lo agora. DDD 97 (interior oeste do Amazonas) usa Tefé em
 * vez de Manaus (que já tem DDD próprio, o 92) pra ficar mais perto do
 * centro da área real coberta — mesmo espírito da nota em
 * timezone-from-ddd.ts sobre essa região não ser distinguível com precisão
 * maior só pelo DDD.
 */
const DDD_LOCATIONS: Record<string, DddLocation> = {
  '11': { city: 'São Paulo', uf: 'SP', latitude: -23.5505, longitude: -46.6333 },
  '12': { city: 'São José dos Campos', uf: 'SP', latitude: -23.1896, longitude: -45.8841 },
  '13': { city: 'Santos', uf: 'SP', latitude: -23.9608, longitude: -46.3339 },
  '14': { city: 'Bauru', uf: 'SP', latitude: -22.3246, longitude: -49.0871 },
  '15': { city: 'Sorocaba', uf: 'SP', latitude: -23.5015, longitude: -47.4526 },
  '16': { city: 'Ribeirão Preto', uf: 'SP', latitude: -21.1775, longitude: -47.8208 },
  '17': { city: 'São José do Rio Preto', uf: 'SP', latitude: -20.8113, longitude: -49.3758 },
  '18': { city: 'Presidente Prudente', uf: 'SP', latitude: -22.1256, longitude: -51.3889 },
  '19': { city: 'Campinas', uf: 'SP', latitude: -22.9099, longitude: -47.0626 },
  '21': { city: 'Rio de Janeiro', uf: 'RJ', latitude: -22.9068, longitude: -43.1729 },
  '22': { city: 'Campos dos Goytacazes', uf: 'RJ', latitude: -21.7622, longitude: -41.3181 },
  '24': { city: 'Volta Redonda', uf: 'RJ', latitude: -22.5231, longitude: -44.1042 },
  '27': { city: 'Vitória', uf: 'ES', latitude: -20.3155, longitude: -40.3128 },
  '28': { city: 'Cachoeiro de Itapemirim', uf: 'ES', latitude: -20.8486, longitude: -41.1121 },
  '31': { city: 'Belo Horizonte', uf: 'MG', latitude: -19.9167, longitude: -43.9345 },
  '32': { city: 'Juiz de Fora', uf: 'MG', latitude: -21.7642, longitude: -43.3503 },
  '33': { city: 'Governador Valadares', uf: 'MG', latitude: -18.8511, longitude: -41.9494 },
  '34': { city: 'Uberlândia', uf: 'MG', latitude: -18.9113, longitude: -48.2622 },
  '35': { city: 'Poços de Caldas', uf: 'MG', latitude: -21.7877, longitude: -46.5614 },
  '37': { city: 'Divinópolis', uf: 'MG', latitude: -20.1389, longitude: -44.8839 },
  '38': { city: 'Montes Claros', uf: 'MG', latitude: -16.735, longitude: -43.8617 },
  '41': { city: 'Curitiba', uf: 'PR', latitude: -25.4284, longitude: -49.2733 },
  '42': { city: 'Ponta Grossa', uf: 'PR', latitude: -25.095, longitude: -50.1619 },
  '43': { city: 'Londrina', uf: 'PR', latitude: -23.3045, longitude: -51.1696 },
  '44': { city: 'Maringá', uf: 'PR', latitude: -23.4205, longitude: -51.9333 },
  '45': { city: 'Cascavel', uf: 'PR', latitude: -24.9578, longitude: -53.455 },
  '46': { city: 'Francisco Beltrão', uf: 'PR', latitude: -26.0817, longitude: -53.0558 },
  '47': { city: 'Joinville', uf: 'SC', latitude: -26.3045, longitude: -48.8487 },
  '48': { city: 'Florianópolis', uf: 'SC', latitude: -27.5954, longitude: -48.548 },
  '49': { city: 'Chapecó', uf: 'SC', latitude: -27.1, longitude: -52.6153 },
  '51': { city: 'Porto Alegre', uf: 'RS', latitude: -30.0346, longitude: -51.2177 },
  '53': { city: 'Pelotas', uf: 'RS', latitude: -31.7654, longitude: -52.3376 },
  '54': { city: 'Caxias do Sul', uf: 'RS', latitude: -29.1634, longitude: -51.1797 },
  '55': { city: 'Santa Maria', uf: 'RS', latitude: -29.6842, longitude: -53.8069 },
  '61': { city: 'Brasília', uf: 'DF', latitude: -15.7939, longitude: -47.8828 },
  '62': { city: 'Goiânia', uf: 'GO', latitude: -16.6869, longitude: -49.2648 },
  '63': { city: 'Palmas', uf: 'TO', latitude: -10.1844, longitude: -48.3336 },
  '64': { city: 'Rio Verde', uf: 'GO', latitude: -17.7978, longitude: -50.9196 },
  '65': { city: 'Cuiabá', uf: 'MT', latitude: -15.601, longitude: -56.0974 },
  '66': { city: 'Rondonópolis', uf: 'MT', latitude: -16.4706, longitude: -54.6353 },
  '67': { city: 'Campo Grande', uf: 'MS', latitude: -20.4697, longitude: -54.6201 },
  '68': { city: 'Rio Branco', uf: 'AC', latitude: -9.9754, longitude: -67.8249 },
  '69': { city: 'Porto Velho', uf: 'RO', latitude: -8.7612, longitude: -63.9004 },
  '71': { city: 'Salvador', uf: 'BA', latitude: -12.9777, longitude: -38.5016 },
  '73': { city: 'Ilhéus', uf: 'BA', latitude: -14.7936, longitude: -39.0395 },
  '74': { city: 'Juazeiro', uf: 'BA', latitude: -9.4111, longitude: -40.4986 },
  '75': { city: 'Feira de Santana', uf: 'BA', latitude: -12.2667, longitude: -38.9667 },
  '77': { city: 'Barreiras', uf: 'BA', latitude: -12.1486, longitude: -44.9917 },
  '79': { city: 'Aracaju', uf: 'SE', latitude: -10.9472, longitude: -37.0731 },
  '81': { city: 'Recife', uf: 'PE', latitude: -8.0476, longitude: -34.877 },
  '82': { city: 'Maceió', uf: 'AL', latitude: -9.6498, longitude: -35.7089 },
  '83': { city: 'João Pessoa', uf: 'PB', latitude: -7.1195, longitude: -34.845 },
  '84': { city: 'Natal', uf: 'RN', latitude: -5.7945, longitude: -35.211 },
  '85': { city: 'Fortaleza', uf: 'CE', latitude: -3.7319, longitude: -38.5267 },
  '86': { city: 'Teresina', uf: 'PI', latitude: -5.0892, longitude: -42.8019 },
  '87': { city: 'Petrolina', uf: 'PE', latitude: -9.3891, longitude: -40.503 },
  '88': { city: 'Juazeiro do Norte', uf: 'CE', latitude: -7.2131, longitude: -39.3155 },
  '89': { city: 'Picos', uf: 'PI', latitude: -7.0769, longitude: -41.4669 },
  '91': { city: 'Belém', uf: 'PA', latitude: -1.4558, longitude: -48.4902 },
  '92': { city: 'Manaus', uf: 'AM', latitude: -3.119, longitude: -60.0217 },
  '93': { city: 'Santarém', uf: 'PA', latitude: -2.4431, longitude: -54.7083 },
  '94': { city: 'Marabá', uf: 'PA', latitude: -5.3686, longitude: -49.1178 },
  '95': { city: 'Boa Vista', uf: 'RR', latitude: 2.8235, longitude: -60.6758 },
  '96': { city: 'Macapá', uf: 'AP', latitude: 0.0389, longitude: -51.0664 },
  '97': { city: 'Tefé', uf: 'AM', latitude: -3.3546, longitude: -64.7093 },
  '98': { city: 'São Luís', uf: 'MA', latitude: -2.5307, longitude: -44.3068 },
  '99': { city: 'Imperatriz', uf: 'MA', latitude: -5.5264, longitude: -47.4917 },
};

/**
 * Infere cidade/UF/coordenadas a partir do DDD embutido no número de
 * WhatsApp — usado pra previsão do tempo e feriado regional do resumo
 * matinal. Mesma regra de reconhecimento de número brasileiro de
 * `inferTimezoneFromWhatsappNumber`: fora desse formato, cai no default
 * (São Paulo), já que não há tabela de DDI/área pra outros países (nicho
 * 100% Brasil).
 */
export function inferLocationFromWhatsappNumber(whatsappNumber: string): DddLocation {
  const isBrazilianNumber = whatsappNumber.startsWith('55') && (whatsappNumber.length === 12 || whatsappNumber.length === 13);
  if (!isBrazilianNumber) return DEFAULT_LOCATION;

  const ddd = whatsappNumber.slice(2, 4);
  return DDD_LOCATIONS[ddd] ?? DEFAULT_LOCATION;
}
