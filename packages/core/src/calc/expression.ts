/**
 * Avaliador de expressão aritmética SEM eval: recursivo descendente sobre
 * + - * / ^ ( ) e % pós-fixo. O LLM erra conta (e com dinheiro isso não pode),
 * então toda aritmética que a pessoa pede passa por aqui. Aceita só ponto como
 * decimal (vírgula é ambígua com milhar — quem chama normaliza).
 *
 * Convenção humana de porcentagem: `100 + 10%` = 110 (10% DE 100), não 100,1;
 * `200 * 10%` = 20.
 */
export class CalcError extends Error {}

const MAX_LENGTH = 200;
const MAX_DEPTH = 40;

interface Parsed {
  value: number;
  /** true quando o termo é só um número seguido de % (ex.: o "10%" de "100 + 10%"). */
  percent: boolean;
}

export function evaluateExpression(input: string): number {
  const source = input.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  if (source.length === 0) throw new CalcError('Expressão vazia.');
  if (source.length > MAX_LENGTH) throw new CalcError('Expressão grande demais.');
  if (/,/.test(source)) throw new CalcError('Use ponto como separador decimal (ex.: 12.5), sem separador de milhar.');
  if (!/^[0-9.+\-*/^()%]+$/.test(source)) throw new CalcError('A expressão só pode ter números e + - * / ^ ( ) %.');

  let position = 0;
  let depth = 0;
  const peek = () => source[position];

  function parseNumber(): Parsed {
    const start = position;
    while (position < source.length && /[0-9.]/.test(source[position]!)) position += 1;
    const text = source.slice(start, position);
    if (text === '' || (text.match(/\./g)?.length ?? 0) > 1 || text === '.') throw new CalcError(`Número inválido perto da posição ${start + 1}.`);
    return { value: Number(text), percent: false };
  }

  function parsePrimary(): Parsed {
    if (peek() === '(') {
      position += 1;
      depth += 1;
      if (depth > MAX_DEPTH) throw new CalcError('Parênteses demais.');
      const inner = parseExpression();
      if (peek() !== ')') throw new CalcError('Faltou fechar um parêntese.');
      position += 1;
      depth -= 1;
      return { value: inner, percent: false };
    }
    return parseNumber();
  }

  function parsePostfix(): Parsed {
    let current = parsePrimary();
    while (peek() === '%') {
      position += 1;
      current = { value: current.value / 100, percent: true };
    }
    return current;
  }

  function parseUnary(): Parsed {
    if (peek() === '-') {
      position += 1;
      const operand = parseUnary();
      return { value: -operand.value, percent: operand.percent };
    }
    if (peek() === '+') {
      position += 1;
      return parseUnary();
    }
    return parsePostfix();
  }

  function parsePower(): Parsed {
    const base = parseUnary();
    if (peek() === '^') {
      position += 1;
      const exponent = parsePower();
      return { value: base.value ** exponent.value, percent: false };
    }
    return base;
  }

  function parseTerm(): Parsed {
    let left = parsePower();
    while (peek() === '*' || peek() === '/') {
      const operator = source[position]!;
      position += 1;
      const right = parsePower();
      if (operator === '/' && right.value === 0) throw new CalcError('Divisão por zero.');
      left = { value: operator === '*' ? left.value * right.value : left.value / right.value, percent: false };
    }
    return left;
  }

  function parseExpression(): number {
    let result = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const operator = source[position]!;
      position += 1;
      const right = parseTerm();
      // "base + 10%" = base + 10% DE base.
      const amount = right.percent ? result.value * right.value : right.value;
      result = { value: operator === '+' ? result.value + amount : result.value - amount, percent: false };
    }
    return result.value;
  }

  const value = parseExpression();
  if (position < source.length) throw new CalcError(`Não entendi o trecho "${source.slice(position, position + 8)}".`);
  if (!Number.isFinite(value)) throw new CalcError('Resultado fora do limite.');
  return Math.round(value * 1e8) / 1e8;
}
