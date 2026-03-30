/**
 * APL Pratt Parser for SimulationCraft (SimC) expressions.
 *
 * Consumes a token stream produced by the tokenizer and produces an AST.
 * This is the second stage of the APL parsing pipeline:
 *   tokenizer → parser (Pratt AST) → evaluator → action list runner
 *
 * Operator precedence (lower number = lower priority = binds loosest):
 *   Level 0 (lowest): |  (OR)
 *   Level 1:          ^  (XOR)
 *   Level 2:          &  (AND)
 *   Level 3:          >, >=, <, <=, =, !=  (comparisons)
 *   Level 4:          +, -  (additive)
 *   Level 5:          *, %, %%  (multiplicative)
 *   Level 6 (highest): unary !, -, @
 */

import { type Token, TokenType } from './tokenizer';

// ---------------------------------------------------------------------------
// AST node types
// ---------------------------------------------------------------------------

export interface NumberLiteralNode {
  kind: 'NumberLiteral';
  value: number;
}

export interface PropertyAccessNode {
  kind: 'PropertyAccess';
  path: string[];
}

export interface UnaryOpNode {
  kind: 'UnaryOp';
  op: '!' | '-' | '@';
  operand: AstNode;
}

export interface BinaryOpNode {
  kind: 'BinaryOp';
  op: '|' | '^' | '&' | '>' | '>=' | '<' | '<=' | '=' | '!=' | '+' | '-' | '*' | '%' | '%%';
  left: AstNode;
  right: AstNode;
}

export type AstNode = NumberLiteralNode | PropertyAccessNode | UnaryOpNode | BinaryOpNode;

// ---------------------------------------------------------------------------
// ParseError
// ---------------------------------------------------------------------------

/**
 * Thrown when the parser encounters a syntactically invalid token sequence.
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly position: number,
  ) {
    super(message);
    this.name = 'ParseError';
    // Restore prototype chain (needed when targeting ES5, harmless otherwise)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Precedence table
// ---------------------------------------------------------------------------

/**
 * Returns the infix (left-denotation) binding power for a binary operator.
 * Returns -1 if the token is not a binary operator.
 */
function infixPrecedence(op: string): number {
  switch (op) {
    case '|':
      return 0;
    case '^':
      return 1;
    case '&':
      return 2;
    case '>':
    case '>=':
    case '<':
    case '<=':
    case '=':
    case '!=':
      return 3;
    case '+':
    case '-':
      return 4;
    case '*':
    case '%':
    case '%%':
      return 5;
    default:
      return -1;
  }
}

/** Binding power used when parsing the operand of a unary operator. */
const UNARY_PRECEDENCE = 6;

/** Sentinel precedence used at the root call and inside parenthesised sub-expressions. */
const ROOT_PRECEDENCE = -1;

// ---------------------------------------------------------------------------
// Parser state
// ---------------------------------------------------------------------------

/**
 * Wraps a token array and provides cursor-based access.
 */
class TokenStream {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  /** Return the current token without consuming it. */
  peek(): Token {
    return this.tokens[this.pos];
  }

  /** Consume and return the current token. */
  consume(): Token {
    const tok = this.tokens[this.pos];
    if (tok.type !== TokenType.EOF) {
      this.pos++;
    }
    return tok;
  }

  /**
   * Consume the current token, throwing ParseError if it doesn't match
   * the expected type.
   */
  expect(type: TokenType): Token {
    const tok = this.consume();
    if (tok.type !== type) {
      throw new ParseError(
        `Expected token type ${TokenType[type]} but got ${TokenType[tok.type]} ("${tok.value}") at position ${tok.position}`,
        tok.position,
      );
    }
    return tok;
  }
}

// ---------------------------------------------------------------------------
// Pratt parsing functions
// ---------------------------------------------------------------------------

/**
 * Parse a prefix (null-denotation) expression — a literal, identifier,
 * grouped sub-expression, or unary operator application.
 */
function parsePrefix(stream: TokenStream): AstNode {
  const tok = stream.peek();

  // NUMBER literal
  if (tok.type === TokenType.NUMBER) {
    stream.consume();
    return { kind: 'NumberLiteral', value: parseFloat(tok.value) };
  }

  // IDENTIFIER — consume as many DOT IDENTIFIER sequences as follow to build
  // a dotted-path PropertyAccess node.
  if (tok.type === TokenType.IDENTIFIER) {
    stream.consume();
    const path: string[] = [tok.value];

    while (stream.peek().type === TokenType.DOT) {
      // consume the DOT
      stream.consume();
      const next = stream.peek();
      if (next.type !== TokenType.IDENTIFIER) {
        throw new ParseError(
          `Expected identifier after '.' at position ${next.position}`,
          next.position,
        );
      }
      stream.consume();
      path.push(next.value);
    }

    return { kind: 'PropertyAccess', path };
  }

  // LPAREN — grouped sub-expression
  if (tok.type === TokenType.LPAREN) {
    stream.consume(); // consume '('
    const expr = parseExpression(stream, ROOT_PRECEDENCE);
    stream.expect(TokenType.RPAREN);
    return expr;
  }

  // Unary operators: !, -, @
  if (tok.type === TokenType.OPERATOR && (tok.value === '!' || tok.value === '-' || tok.value === '@')) {
    const unaryOp = tok.value;
    stream.consume();
    const operand = parseExpression(stream, UNARY_PRECEDENCE - 1);
    return { kind: 'UnaryOp', op: unaryOp, operand };
  }

  // Anything else at prefix position is an error
  throw new ParseError(
    `Unexpected token "${tok.value}" (${TokenType[tok.type]}) at position ${tok.position}`,
    tok.position,
  );
}

/**
 * Core Pratt expression parser.
 *
 * Parses an expression where the current token has a left-binding power
 * strictly greater than `minPrecedence`.
 *
 * @param stream  - Token stream positioned at the start of the expression.
 * @param minPrecedence - Minimum precedence level to continue consuming infix operators.
 */
function parseExpression(stream: TokenStream, minPrecedence: number): AstNode {
  let left = parsePrefix(stream);

  for (;;) {
    const tok = stream.peek();

    // EOF or RPAREN — stop
    if (tok.type === TokenType.EOF || tok.type === TokenType.RPAREN) {
      break;
    }

    // Must be an operator token for infix handling
    if (tok.type !== TokenType.OPERATOR) {
      break;
    }

    const prec = infixPrecedence(tok.value);
    if (prec < 0 || prec <= minPrecedence) {
      break;
    }

    // Consume the operator
    stream.consume();

    // Parse right-hand side with left-associativity:
    // pass prec (not prec-1) so that same-precedence operators are NOT consumed
    // recursively — they will be picked up by the enclosing loop iteration instead.
    const right = parseExpression(stream, prec);
    left = { kind: 'BinaryOp', op: tok.value as BinaryOpNode['op'], left, right };
  }

  return left;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Parse a SimC APL expression token stream into an AST.
 *
 * @param tokens - Token array as produced by `tokenize()`, terminated by EOF.
 * @returns The root AstNode of the expression.
 * @throws {ParseError} If the token stream does not form a valid expression.
 */
export function parse(tokens: Token[]): AstNode {
  const stream = new TokenStream(tokens);
  const ast = parseExpression(stream, ROOT_PRECEDENCE);

  // After parsing a complete expression the next token must be EOF
  const remaining = stream.peek();
  if (remaining.type !== TokenType.EOF) {
    throw new ParseError(
      `Unexpected token "${remaining.value}" after expression at position ${remaining.position}`,
      remaining.position,
    );
  }

  return ast;
}
