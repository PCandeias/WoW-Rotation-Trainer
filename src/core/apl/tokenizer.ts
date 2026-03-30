/**
 * APL Tokenizer for SimulationCraft (SimC) expressions.
 *
 * Converts a SimC APL expression string into a flat token stream.
 * This is the first stage of the APL parsing pipeline:
 *   tokenizer → parser (Pratt AST) → evaluator → action list runner
 */

// ---------------------------------------------------------------------------
// Token type enum
// ---------------------------------------------------------------------------

export enum TokenType {
  NUMBER,
  IDENTIFIER,
  DOT,
  OPERATOR,
  LPAREN,
  RPAREN,
  EOF,
}

// ---------------------------------------------------------------------------
// Token interface
// ---------------------------------------------------------------------------

export interface Token {
  /** Discriminator for the kind of token. */
  type: TokenType;
  /** Raw source text for all token types; the string "EOF" for the EOF token. */
  value: string;
  /** Zero-based character offset in the source string. */
  position: number;
}

// ---------------------------------------------------------------------------
// TokenError
// ---------------------------------------------------------------------------

/**
 * Thrown when the tokenizer encounters a character it does not recognise.
 */
export class TokenError extends Error {
  constructor(
    message: string,
    public readonly position: number,
  ) {
    super(message);
    this.name = 'TokenError';
    // Restore prototype chain (needed when targeting ES5, harmless otherwise)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Two-character operators that must be tried before their single-char prefix
// ---------------------------------------------------------------------------

const TWO_CHAR_OPERATORS = new Set(['%%', '>=', '<=', '!=']);

// Single-character operators (checked after two-char ones fail)
const ONE_CHAR_OPERATORS = new Set(['+', '-', '*', '%', '>', '<', '=', '&', '^', '|', '!', '@']);

// ---------------------------------------------------------------------------
// Main tokenize function
// ---------------------------------------------------------------------------

/**
 * Tokenise a SimC APL expression into a token stream.
 *
 * Rules:
 * - Whitespace is silently skipped.
 * - Numbers: integers and decimals are read as a single NUMBER token.
 *   A dot is only consumed as part of a number when the character immediately
 *   before it was a digit and the character immediately after it is also a digit.
 * - Identifiers: `[a-z_][a-z0-9_]*` — lowercase letters, digits, underscores.
 *   SimC APL convention requires identifiers to be lowercase; uppercase letters
 *   are not valid and will trigger a TokenError.
 * - Two-character operators (`%%`, `>=`, `<=`, `!=`) are tried before their
 *   single-character prefixes.
 * - Unknown characters (including uppercase letters) throw a TokenError with the
 *   offending position.
 *
 * @param input - The raw SimC expression string.
 * @returns A Token array always terminated by a single EOF token.
 * @throws {TokenError} On encountering an unrecognised character (including uppercase
 *   letters, which violate SimC APL's lowercase identifier convention).
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < input.length) {
    // -----------------------------------------------------------------------
    // Skip whitespace
    // -----------------------------------------------------------------------
    if (/\s/.test(input[pos])) {
      pos++;
      continue;
    }

    const start = pos;
    const ch = input[pos];

    // -----------------------------------------------------------------------
    // NUMBER — starts with a digit
    // -----------------------------------------------------------------------
    if (ch >= '0' && ch <= '9') {
      while (pos < input.length && input[pos] >= '0' && input[pos] <= '9') {
        pos++;
      }
      // Consume a decimal point followed by at least one digit
      if (pos < input.length && input[pos] === '.' && pos + 1 < input.length && input[pos + 1] >= '0' && input[pos + 1] <= '9') {
        pos++; // consume '.'
        while (pos < input.length && input[pos] >= '0' && input[pos] <= '9') {
          pos++;
        }
      }
      tokens.push({ type: TokenType.NUMBER, value: input.slice(start, pos), position: start });
      continue;
    }

    // -----------------------------------------------------------------------
    // IDENTIFIER — starts with a lowercase letter or underscore
    // -----------------------------------------------------------------------
    if ((ch >= 'a' && ch <= 'z') || ch === '_') {
      while (
        pos < input.length &&
        ((input[pos] >= 'a' && input[pos] <= 'z') ||
          (input[pos] >= '0' && input[pos] <= '9') ||
          input[pos] === '_')
      ) {
        pos++;
      }
      tokens.push({ type: TokenType.IDENTIFIER, value: input.slice(start, pos), position: start });
      continue;
    }

    // -----------------------------------------------------------------------
    // DOT — standalone dot (not part of a number, handled above)
    // -----------------------------------------------------------------------
    if (ch === '.') {
      tokens.push({ type: TokenType.DOT, value: '.', position: start });
      pos++;
      continue;
    }

    // -----------------------------------------------------------------------
    // LPAREN / RPAREN
    // -----------------------------------------------------------------------
    if (ch === '(') {
      tokens.push({ type: TokenType.LPAREN, value: '(', position: start });
      pos++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: TokenType.RPAREN, value: ')', position: start });
      pos++;
      continue;
    }

    // -----------------------------------------------------------------------
    // OPERATOR — try two-character first, then single-character
    // -----------------------------------------------------------------------
    // slice() past end of string safely returns a shorter string, failing the Set lookup — no bounds check needed
    const twoChar = input.slice(pos, pos + 2);
    if (TWO_CHAR_OPERATORS.has(twoChar)) {
      tokens.push({ type: TokenType.OPERATOR, value: twoChar, position: start });
      pos += 2;
      continue;
    }

    if (ONE_CHAR_OPERATORS.has(ch)) {
      tokens.push({ type: TokenType.OPERATOR, value: ch, position: start });
      pos++;
      continue;
    }

    // -----------------------------------------------------------------------
    // Unknown character
    // -----------------------------------------------------------------------
    throw new TokenError(`Unexpected character '${ch}'${/[A-Z]/.test(ch) ? ' — SimC APL identifiers must be lowercase' : ''} at position ${pos}`, pos);
  }

  // Always terminate with a single EOF token
  tokens.push({ type: TokenType.EOF, value: 'EOF', position: pos });

  return tokens;
}
