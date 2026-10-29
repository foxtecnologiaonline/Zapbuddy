/**
 * Cidade/país → fuso IANA, pra "que horas são em Lisboa?". Tabela fechada e
 * conferida de propósito: lugar fora dela devolve "não sei" em vez de chute
 * (mesmo princípio de nunca inventar dado). O horário em si vem do Intl com o
 * fuso IANA — considera horário de verão de cada lugar sem tabela manual.
 */

export interface Place {
  /** Nome pra exibir ("Lisboa"). */
  name: string;
  timeZone: string;
}

function normalizePlaceName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RAW_PLACES: Array<[names: string[], name: string, timeZone: string]> = [
  // Brasil (fuso de capitais que fogem de Brasília)
  [['brasilia', 'sao paulo', 'rio de janeiro', 'rio', 'belo horizonte', 'curitiba', 'porto alegre', 'florianopolis', 'salvador', 'recife', 'fortaleza', 'goiania', 'vitoria', 'natal', 'joao pessoa', 'maceio', 'aracaju', 'sao luis', 'teresina', 'belem', 'macapa', 'palmas'], 'Brasília', 'America/Sao_Paulo'],
  [['manaus'], 'Manaus', 'America/Manaus'],
  [['cuiaba'], 'Cuiabá', 'America/Cuiaba'],
  [['campo grande'], 'Campo Grande', 'America/Campo_Grande'],
  [['porto velho'], 'Porto Velho', 'America/Porto_Velho'],
  [['boa vista'], 'Boa Vista', 'America/Boa_Vista'],
  [['rio branco'], 'Rio Branco', 'America/Rio_Branco'],
  [['fernando de noronha', 'noronha'], 'Fernando de Noronha', 'America/Noronha'],
  // Europa
  [['lisboa', 'portugal', 'porto'], 'Lisboa', 'Europe/Lisbon'],
  [['londres', 'reino unido', 'inglaterra'], 'Londres', 'Europe/London'],
  [['dublin', 'irlanda'], 'Dublin', 'Europe/Dublin'],
  [['madri', 'madrid', 'espanha', 'barcelona'], 'Madri', 'Europe/Madrid'],
  [['paris', 'franca'], 'Paris', 'Europe/Paris'],
  [['berlim', 'alemanha'], 'Berlim', 'Europe/Berlin'],
  [['roma', 'italia', 'milao'], 'Roma', 'Europe/Rome'],
  [['amsterda', 'amsterdam', 'holanda'], 'Amsterdã', 'Europe/Amsterdam'],
  [['bruxelas', 'belgica'], 'Bruxelas', 'Europe/Brussels'],
  [['zurique', 'suica'], 'Zurique', 'Europe/Zurich'],
  [['viena', 'austria'], 'Viena', 'Europe/Vienna'],
  [['atenas', 'grecia'], 'Atenas', 'Europe/Athens'],
  [['istambul', 'turquia'], 'Istambul', 'Europe/Istanbul'],
  [['moscou', 'russia'], 'Moscou', 'Europe/Moscow'],
  // Américas
  [['nova york', 'new york', 'miami', 'orlando', 'washington', 'boston'], 'Nova York', 'America/New_York'],
  [['chicago'], 'Chicago', 'America/Chicago'],
  [['denver'], 'Denver', 'America/Denver'],
  [['los angeles', 'sao francisco', 'san francisco', 'san diego', 'las vegas'], 'Los Angeles', 'America/Los_Angeles'],
  [['toronto', 'canada'], 'Toronto', 'America/Toronto'],
  [['vancouver'], 'Vancouver', 'America/Vancouver'],
  [['cidade do mexico', 'mexico'], 'Cidade do México', 'America/Mexico_City'],
  [['buenos aires', 'argentina'], 'Buenos Aires', 'America/Argentina/Buenos_Aires'],
  [['santiago', 'chile'], 'Santiago', 'America/Santiago'],
  [['montevideu', 'uruguai'], 'Montevidéu', 'America/Montevideo'],
  [['assuncao', 'paraguai'], 'Assunção', 'America/Asuncion'],
  [['bogota', 'colombia'], 'Bogotá', 'America/Bogota'],
  [['lima', 'peru'], 'Lima', 'America/Lima'],
  // Ásia / Oceania / África
  [['toquio', 'tokyo', 'japao'], 'Tóquio', 'Asia/Tokyo'],
  [['seul', 'coreia do sul'], 'Seul', 'Asia/Seoul'],
  [['pequim', 'xangai', 'china'], 'Pequim', 'Asia/Shanghai'],
  [['hong kong'], 'Hong Kong', 'Asia/Hong_Kong'],
  [['cingapura', 'singapura'], 'Cingapura', 'Asia/Singapore'],
  [['bangkok', 'tailandia'], 'Bangkok', 'Asia/Bangkok'],
  [['dubai', 'emirados arabes'], 'Dubai', 'Asia/Dubai'],
  [['mumbai', 'nova delhi', 'india'], 'Nova Délhi', 'Asia/Kolkata'],
  [['tel aviv', 'israel'], 'Tel Aviv', 'Asia/Jerusalem'],
  [['sydney', 'sidney', 'melbourne', 'australia'], 'Sydney', 'Australia/Sydney'],
  [['auckland', 'nova zelandia'], 'Auckland', 'Pacific/Auckland'],
  [['cairo', 'egito'], 'Cairo', 'Africa/Cairo'],
  [['joanesburgo', 'africa do sul', 'cidade do cabo'], 'Joanesburgo', 'Africa/Johannesburg'],
  [['luanda', 'angola'], 'Luanda', 'Africa/Luanda'],
  [['maputo', 'mocambique'], 'Maputo', 'Africa/Maputo'],
];

const PLACE_INDEX = new Map<string, Place>();
for (const [names, name, timeZone] of RAW_PLACES) {
  for (const alias of names) {
    if (!PLACE_INDEX.has(alias)) PLACE_INDEX.set(alias, { name, timeZone });
  }
}

/** Fuso do lugar citado, ou null se não está na tabela. Aceita "em Lisboa", "Lisboa, Portugal" (usa o primeiro trecho conhecido). */
export function findPlace(raw: string): Place | null {
  const normalized = normalizePlaceName(raw).replace(/^(em |na |no |de |do |da )/, '');
  if (!normalized) return null;
  const exact = PLACE_INDEX.get(normalized);
  if (exact) return exact;
  for (const part of raw.split(/[,/-]/)) {
    const hit = PLACE_INDEX.get(normalizePlaceName(part).replace(/^(em |na |no |de |do |da )/, ''));
    if (hit) return hit;
  }
  return null;
}
