; -------
; Comments
; -------
(comment) @comment

; -------
; Directives & At-rules
; -------
[
  "@media"
  "@charset"
  "@namespace"
  "@supports"
  "@keyframes"
  "@import"
  (at_keyword)
  (to)
  (from)
] @keyword

; -------
; Selectors
; -------
(tag_name) @tag
(class_name) @type
(id_name) @constant

; -------
; Properties & Features
; -------
[
  (property_name)
  (feature_name)
] @property

; Generic values first
(plain_value) @constant

; -------
; CSS Custom Properties (--variable) - Specific overrides generic
; -------
((property_name) @variable
  (#match? @variable "^--"))

((plain_value) @variable
  (#match? @variable "^--"))

; -------
; Functions
; -------
(function_name) @function

; -------
; Literals & Numbers
; -------
(string_value) @string
(color_value) @string

(integer_value) @constant.numeric.integer
(float_value) @constant.numeric.float
(unit) @keyword

(important) @keyword

; -------
; Pseudo selectors & attributes
; -------
(attribute_selector (plain_value) @string)
(attribute_name) @attribute
(pseudo_element_selector (tag_name) @attribute)
(pseudo_class_selector (class_name) @attribute)

; -------
; Operators
; -------
[
  "~"
  ">"
  "+"
  "-"
  "*"
  "/"
  "="
  "^="
  "|="
  "~="
  "$="
  "*="
] @operator

[
  "and"
  "or"
  "not"
  "only"
] @keyword.operator

; -------
; Punctuation
; -------
[
  "#"
  ","
  "."
  ":"
  "::"
  ";"
] @punctuation.delimiter

[
  "{"
  "}"
  "["
  "]"
  "("
  ")"
] @punctuation.bracket
