(function_definition
  name: (identifier) @name) @definition.function

(struct_declaration
  name: (type_identifier) @name) @definition.struct

(const_declaration
  name: (identifier) @name) @definition.constant

(bss_declaration
  name: (identifier) @name) @definition.variable

(call_expression
  function: (identifier) @name) @reference.call