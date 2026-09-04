const PREC = {
  logicalOr: 1,
  logicalAnd: 2,
  comparison: 3,
  bitwiseOr: 4,
  bitwiseXor: 5,
  bitwiseAnd: 6,
  additive: 7,
  multiplicative: 8,
  unary: 9,
  postfix: 10,
};

module.exports = grammar({
  name: 'tetsuo',

  extras: $ => [
    /\s/,
    $.comment,
  ],

  word: $ => $.identifier,

  supertypes: $ => [
    $._declaration,
    $._statement,
    $._expression,
    $._type,
  ],

  rules: {
    source_file: $ => seq(
      repeat($.import_directive),
      repeat(';'),
      repeat(seq($._declaration, repeat(';'))),
    ),

    import_directive: $ => seq(
      'import',
      field('path', $.string_literal),
    ),

    _declaration: $ => choice(
      $.function_definition,
      $.const_declaration,
      $.bss_declaration,
      $.struct_declaration,
    ),

    function_definition: $ => seq(
      'fun',
      field('name', $.identifier),
      field('parameters', $.parameters),
      optional(seq('->', field('return_type', $._type))),
      field('body', $.block),
    ),

    parameters: $ => seq(
      '(',
      commaSep($.parameter),
      ')',
    ),

    parameter: $ => seq(
      field('name', $.identifier),
      ':',
      field('type', $._type),
    ),

    const_declaration: $ => seq(
      'const',
      field('name', $.identifier),
      ':',
      field('type', $._type),
      '=',
      field('value', $.integer_literal),
    ),

    bss_declaration: $ => seq(
      'bss',
      field('name', $.identifier),
      ':',
      field('size', $.integer_literal),
    ),

    struct_declaration: $ => seq(
      'struct',
      field('name', $._type_identifier),
      field('body', $.field_declaration_list),
    ),

    field_declaration_list: $ => seq(
      '{',
      repeat(seq($.field_declaration, optional(','))),
      '}',
    ),

    field_declaration: $ => seq(
      field('name', $.identifier),
      ':',
      field('type', $._type),
    ),

    block: $ => seq(
      '{',
      repeat(';'),
      repeat(seq($._statement, repeat(';'))),
      '}',
    ),

    _statement: $ => choice(
      $.let_declaration,
      $.assignment_statement,
      $.if_statement,
      $.while_statement,
      $.loop_statement,
      $.break_statement,
      $.continue_statement,
      $.return_statement,
      $.expression_statement,
    ),

    let_declaration: $ => seq(
      'let',
      field('name', $.identifier),
      optional(seq(':', field('type', $._type))),
      optional(seq('=', field('value', $._expression))),
    ),

    assignment_statement: $ => seq(
      field('left', $._expression),
      '=',
      field('right', $._expression),
    ),

    if_statement: $ => prec.right(seq(
      'if',
      field('condition', $._expression),
      field('consequence', $.block),
      optional(seq(
        'else',
        field('alternative', choice($.block, $.if_statement)),
      )),
    )),

    while_statement: $ => seq(
      'while',
      field('condition', $._expression),
      field('body', $.block),
    ),

    loop_statement: $ => seq(
      'loop',
      field('body', $.block),
    ),

    break_statement: _ => 'break',

    continue_statement: _ => 'continue',

    return_statement: $ => prec.right(seq(
      'return',
      optional(field('value', $._expression)),
    )),

    expression_statement: $ => $._expression,

    _expression: $ => choice(
      $.binary_expression,
      $.unary_expression,
      $.cast_expression,
      $.call_expression,
      $.field_expression,
      $.subscript_expression,
      $.parenthesized_expression,
      $.sizeof_expression,
      $.integer_literal,
      $.string_literal,
      $.nil_literal,
      $.identifier,
    ),

    binary_expression: $ => choice(
      ...[
        [PREC.logicalOr, '||'],
        [PREC.logicalAnd, '&&'],
        [PREC.comparison, choice('==', '!=', '<', '<=', '>', '>=')],
        [PREC.bitwiseOr, '|'],
        [PREC.bitwiseXor, '^'],
        [PREC.bitwiseAnd, '&'],
        [PREC.additive, choice('+', '-', '<<', '>>')],
        [PREC.multiplicative, choice('*', '/', '%')],
      ].map(([precedence, operator]) => prec.left(precedence, seq(
        field('left', $._expression),
        field('operator', operator),
        field('right', $._expression),
      ))),
    ),

    unary_expression: $ => prec(PREC.unary, seq(
      field('operator', choice('@', '&', '!', '-')),
      field('argument', $._expression),
    )),

    cast_expression: $ => prec.left(PREC.postfix, seq(
      field('value', $._expression),
      'as',
      field('type', $._type),
    )),

    call_expression: $ => prec(PREC.postfix, seq(
      field('function', $.identifier),
      field('arguments', $.arguments),
    )),

    arguments: $ => seq(
      '(',
      commaSep($._expression),
      ')',
    ),

    field_expression: $ => prec.left(PREC.postfix, seq(
      field('value', $._expression),
      '.',
      field('field', $.identifier),
    )),

    subscript_expression: $ => prec.left(PREC.postfix, seq(
      field('value', $._expression),
      '[',
      field('index', $._expression),
      ']',
    )),

    parenthesized_expression: $ => seq(
      '(',
      $._expression,
      ')',
    ),

    sizeof_expression: $ => seq(
      'sizeof',
      '(',
      field('type', $._type),
      ')',
    ),

    _type: $ => choice(
      $.pointer_type,
      $.array_type,
      $.primitive_type,
      $._type_identifier,
    ),

    pointer_type: $ => seq(
      '*',
      field('type', $._type),
    ),

    array_type: $ => seq(
      '[',
      field('length', $.integer_literal),
      ']',
      field('type', $._type),
    ),

    primitive_type: _ => choice(
      'u8',
      'u32',
      'u64',
      'i8',
      'i32',
      'i64',
      'bool',
      'str',
    ),

    nil_literal: _ => 'nil',

    integer_literal: _ => token(choice(
      /0x[0-9a-fA-F]+/,
      /[0-9]+/,
    )),

    string_literal: $ => seq(
      "'",
      repeat(choice($.escape_sequence, /[^'\\\n]/)),
      "'",
    ),

    escape_sequence: _ => token.immediate(seq(
      '\\',
      choice(/[nt0'\\]/, /x[0-9a-fA-F]{2}/),
    )),

    identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,

    _type_identifier: $ => alias($.identifier, $.type_identifier),

    comment: _ => token(seq('//', /.*/)),
  },
});

function commaSep(rule) {
  return optional(seq(rule, repeat(seq(',', rule)), optional(',')));
}