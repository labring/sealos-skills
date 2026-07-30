#!/usr/bin/env python3
"""Validate rendered Sealos Template resources against the target API server.

The delivery Template remains untouched. This helper renders validation-only
scenarios into a private temporary directory, skips the Sealos Template
metadata document, and sends each runtime document through server-side dry-run.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import itertools
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple

import yaml


EXPRESSION_RE = re.compile(r"\$\{\{\s*(.*?)\s*\}\}")
DOCUMENT_SEPARATOR_RE = re.compile(r"^---[ \t]*(?:#.*)?(?:\r?\n)?$")
DNS_LABEL_RE = re.compile(r"^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$")
DNS_SUBDOMAIN_RE = re.compile(
    r"^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?"
    r"(?:\.[a-z0-9](?:[-a-z0-9]*[a-z0-9])?)*$"
)
SENSITIVE_NAME_RE = re.compile(
    r"(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|credential|auth)",
    re.IGNORECASE,
)


class GateSetupError(Exception):
    """The validation gate cannot safely or completely run."""


class ExpressionError(GateSetupError):
    """A Template expression is outside the safe supported subset."""


@dataclass(frozen=True)
class Token:
    kind: str
    value: Any
    position: int


@dataclass
class ConditionalFrame:
    parent_active: bool
    active: bool
    matched: bool
    saw_else: bool = False


@dataclass(frozen=True)
class RuntimeDocument:
    scenario: int
    kind: str
    name: str
    content: str
    digest: str


def js_truthy(value: Any) -> bool:
    if value is None or value is False:
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value != 0
    if isinstance(value, str):
        return value != ""
    return True


def js_string(value: Any) -> str:
    if value is None:
        return ""
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def strict_equal(left: Any, right: Any) -> bool:
    if isinstance(left, bool) or isinstance(right, bool):
        return isinstance(left, bool) and isinstance(right, bool) and left == right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return float(left) == float(right)
    return type(left) is type(right) and left == right


def tokenize(expression: str) -> List[Token]:
    tokens: List[Token] = []
    index = 0
    operators = ("===", "!==", "==", "!=", "<=", ">=", "&&", "||")
    single_operators = set("().,?:!+-*/%<>")

    while index < len(expression):
        char = expression[index]
        if char.isspace():
            index += 1
            continue

        if char in {"'", '"'}:
            quote = char
            start = index
            index += 1
            value: List[str] = []
            while index < len(expression):
                char = expression[index]
                if char == quote:
                    index += 1
                    break
                if char != "\\":
                    value.append(char)
                    index += 1
                    continue
                index += 1
                if index >= len(expression):
                    raise ExpressionError(
                        "unterminated escape in Template expression"
                    )
                escaped = expression[index]
                escapes = {
                    "n": "\n",
                    "r": "\r",
                    "t": "\t",
                    "b": "\b",
                    "f": "\f",
                    "\\": "\\",
                    "'": "'",
                    '"': '"',
                    "/": "/",
                }
                if escaped == "u":
                    codepoint = expression[index + 1 : index + 5]
                    if len(codepoint) != 4 or not re.fullmatch(
                        r"[0-9A-Fa-f]{4}", codepoint
                    ):
                        raise ExpressionError(
                            "invalid unicode escape in Template expression"
                        )
                    value.append(chr(int(codepoint, 16)))
                    index += 5
                    continue
                value.append(escapes.get(escaped, escaped))
                index += 1
            else:
                raise ExpressionError("unterminated string in Template expression")
            tokens.append(Token("STRING", "".join(value), start))
            continue

        if char.isdigit():
            start = index
            index += 1
            while index < len(expression) and expression[index].isdigit():
                index += 1
            if index < len(expression) and expression[index] == ".":
                index += 1
                while index < len(expression) and expression[index].isdigit():
                    index += 1
            raw = expression[start:index]
            tokens.append(
                Token("NUMBER", float(raw) if "." in raw else int(raw), start)
            )
            continue

        if char.isalpha() or char in {"_", "$"}:
            start = index
            index += 1
            while index < len(expression):
                current = expression[index]
                if not (current.isalnum() or current in {"_", "$"}):
                    break
                index += 1
            tokens.append(Token("IDENT", expression[start:index], start))
            continue

        matched = next(
            (operator for operator in operators if expression.startswith(operator, index)),
            None,
        )
        if matched:
            tokens.append(Token("OP", matched, index))
            index += len(matched)
            continue
        if char in single_operators:
            tokens.append(Token("OP", char, index))
            index += 1
            continue
        raise ExpressionError(
            "unsupported token at position {} in Template expression".format(index)
        )

    tokens.append(Token("EOF", None, len(expression)))
    return tokens


class ExpressionParser:
    def __init__(self, expression: str):
        self.expression = expression
        self.tokens = tokenize(expression)
        self.index = 0

    def current(self) -> Token:
        return self.tokens[self.index]

    def accept(self, value: str) -> bool:
        if self.current().value != value:
            return False
        self.index += 1
        return True

    def expect(self, value: str) -> None:
        if not self.accept(value):
            raise ExpressionError(
                "expected {!r} at position {} in Template expression".format(
                    value, self.current().position
                )
            )

    def parse(self) -> Tuple[Any, ...]:
        node = self.parse_ternary()
        if self.current().kind != "EOF":
            raise ExpressionError(
                "unexpected token at position {} in Template expression".format(
                    self.current().position
                )
            )
        return node

    def parse_ternary(self) -> Tuple[Any, ...]:
        condition = self.parse_or()
        if not self.accept("?"):
            return condition
        when_true = self.parse_ternary()
        self.expect(":")
        when_false = self.parse_ternary()
        return ("ternary", condition, when_true, when_false)

    def parse_or(self) -> Tuple[Any, ...]:
        node = self.parse_and()
        while self.accept("||"):
            node = ("binary", "||", node, self.parse_and())
        return node

    def parse_and(self) -> Tuple[Any, ...]:
        node = self.parse_equality()
        while self.accept("&&"):
            node = ("binary", "&&", node, self.parse_equality())
        return node

    def parse_equality(self) -> Tuple[Any, ...]:
        node = self.parse_relational()
        while self.current().value in {"===", "!==", "==", "!="}:
            operator = self.current().value
            self.index += 1
            node = ("binary", operator, node, self.parse_relational())
        return node

    def parse_relational(self) -> Tuple[Any, ...]:
        node = self.parse_additive()
        while self.current().value in {"<", "<=", ">", ">="}:
            operator = self.current().value
            self.index += 1
            node = ("binary", operator, node, self.parse_additive())
        return node

    def parse_additive(self) -> Tuple[Any, ...]:
        node = self.parse_multiplicative()
        while self.current().value in {"+", "-"}:
            operator = self.current().value
            self.index += 1
            node = ("binary", operator, node, self.parse_multiplicative())
        return node

    def parse_multiplicative(self) -> Tuple[Any, ...]:
        node = self.parse_unary()
        while self.current().value in {"*", "/", "%"}:
            operator = self.current().value
            self.index += 1
            node = ("binary", operator, node, self.parse_unary())
        return node

    def parse_unary(self) -> Tuple[Any, ...]:
        if self.current().value in {"!", "+", "-"}:
            operator = self.current().value
            self.index += 1
            return ("unary", operator, self.parse_unary())
        return self.parse_primary()

    def parse_primary(self) -> Tuple[Any, ...]:
        token = self.current()
        if token.kind in {"STRING", "NUMBER"}:
            self.index += 1
            return ("literal", token.value)
        if token.kind == "IDENT":
            self.index += 1
            identifier = str(token.value)
            if identifier in {"true", "false", "null", "undefined"}:
                values = {
                    "true": True,
                    "false": False,
                    "null": None,
                    "undefined": None,
                }
                return ("literal", values[identifier])
            if self.accept("("):
                arguments: List[Tuple[Any, ...]] = []
                if not self.accept(")"):
                    while True:
                        arguments.append(self.parse_ternary())
                        if self.accept(")"):
                            break
                        self.expect(",")
                return ("call", identifier, tuple(arguments))
            path = [identifier]
            while self.accept("."):
                member = self.current()
                if member.kind != "IDENT":
                    raise ExpressionError(
                        "expected member name at position {}".format(member.position)
                    )
                path.append(str(member.value))
                self.index += 1
            return ("path", tuple(path))
        if self.accept("("):
            node = self.parse_ternary()
            self.expect(")")
            return node
        raise ExpressionError(
            "expected expression value at position {}".format(token.position)
        )


def evaluate_ast(node: Tuple[Any, ...], resolver: "ValueResolver") -> Any:
    kind = node[0]
    if kind == "literal":
        return node[1]
    if kind == "path":
        return resolver.lookup(node[1])
    if kind == "call":
        name = node[1]
        arguments = [evaluate_ast(argument, resolver) for argument in node[2]]
        if name == "random" and len(arguments) == 1:
            try:
                length = int(arguments[0])
            except (TypeError, ValueError):
                raise ExpressionError("random() length must be an integer")
            if length < 1 or length > 256:
                raise ExpressionError("random() length must be between 1 and 256")
            alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
            return "".join(secrets.choice(alphabet) for _ in range(length))
        if name == "base64" and len(arguments) == 1:
            return base64.b64encode(js_string(arguments[0]).encode("utf-8")).decode(
                "ascii"
            )
        raise ExpressionError(
            "unsupported Template function {!r}; only random() and base64() are allowed".format(
                name
            )
        )
    if kind == "unary":
        operator = node[1]
        value = evaluate_ast(node[2], resolver)
        if operator == "!":
            return not js_truthy(value)
        if operator == "+":
            return float(value)
        if operator == "-":
            return -float(value)
    if kind == "ternary":
        branch = node[2] if js_truthy(evaluate_ast(node[1], resolver)) else node[3]
        return evaluate_ast(branch, resolver)
    if kind == "binary":
        operator = node[1]
        left = evaluate_ast(node[2], resolver)
        if operator == "&&":
            return evaluate_ast(node[3], resolver) if js_truthy(left) else left
        if operator == "||":
            return left if js_truthy(left) else evaluate_ast(node[3], resolver)
        right = evaluate_ast(node[3], resolver)
        if operator in {"===", "=="}:
            return strict_equal(left, right)
        if operator in {"!==", "!="}:
            return not strict_equal(left, right)
        if operator == "+":
            if isinstance(left, str) or isinstance(right, str):
                return js_string(left) + js_string(right)
            return left + right
        if operator == "-":
            return left - right
        if operator == "*":
            return left * right
        if operator == "/":
            return left / right
        if operator == "%":
            return left % right
        if operator == "<":
            return left < right
        if operator == "<=":
            return left <= right
        if operator == ">":
            return left > right
        if operator == ">=":
            return left >= right
    raise ExpressionError("unsupported Template expression operation")


def parse_expression(expression: str) -> Tuple[Any, ...]:
    return ExpressionParser(expression).parse()


def evaluate_expression(expression: str, resolver: "ValueResolver") -> Any:
    try:
        return evaluate_ast(parse_expression(expression), resolver)
    except GateSetupError:
        raise
    except (ArithmeticError, TypeError, ValueError):
        raise ExpressionError("Template expression evaluation failed")


def scalar_text(value: Any) -> str:
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if value is True:
        return "true"
    if value is False:
        return "false"
    if value is None:
        return "null"
    if isinstance(value, (int, float)):
        return str(value)
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def quote_context(text: str, position: int) -> Optional[str]:
    quote: Optional[str] = None
    index = 0
    while index < position:
        char = text[index]
        if quote == '"':
            if char == "\\":
                index += 2
                continue
            if char == '"':
                quote = None
        elif quote == "'":
            if char == "'" and index + 1 < position and text[index + 1] == "'":
                index += 2
                continue
            if char == "'":
                quote = None
        elif char in {"'", '"'}:
            quote = char
        index += 1
    return quote


def expression_is_entire_scalar(line: str, start: int, end: int) -> bool:
    prefix = line[:start]
    suffix = line[end:]
    if suffix.strip():
        return False
    stripped_prefix = prefix.rstrip()
    if not stripped_prefix:
        return True
    if stripped_prefix.endswith(":"):
        return True
    return re.fullmatch(r"\s*-\s*", prefix) is not None


def render_inline(text: str, resolver: "ValueResolver") -> Any:
    matches = list(EXPRESSION_RE.finditer(text))
    if not matches:
        return text
    if len(matches) == 1 and matches[0].span() == (0, len(text)):
        return evaluate_expression(matches[0].group(1), resolver)

    pieces: List[str] = []
    cursor = 0
    for match in matches:
        pieces.append(text[cursor : match.start()])
        pieces.append(js_string(evaluate_expression(match.group(1), resolver)))
        cursor = match.end()
    pieces.append(text[cursor:])
    return "".join(pieces)


class ValueResolver:
    def __init__(
        self,
        raw_defaults: Mapping[str, Any],
        raw_inputs: Mapping[str, Any],
        systems: Mapping[str, str],
    ):
        self.raw = {
            "defaults": dict(raw_defaults),
            "inputs": dict(raw_inputs),
        }
        self.systems = dict(systems)
        self.cache: Dict[Tuple[str, str], Any] = {}
        self.resolving: Set[Tuple[str, str]] = set()

    def lookup(self, path: Sequence[str]) -> Any:
        if len(path) == 1 and path[0] in self.systems:
            return self.systems[path[0]]
        if len(path) < 2 or path[0] not in self.raw:
            raise ExpressionError(
                "unknown Template variable {}".format(".".join(path))
            )
        root = self.resolve_root(path[0], path[1])
        value = root
        for member in path[2:]:
            if not isinstance(value, Mapping) or member not in value:
                raise ExpressionError(
                    "unknown Template variable {}".format(".".join(path))
                )
            value = value[member]
        return value

    def resolve_root(self, namespace: str, key: str) -> Any:
        cache_key = (namespace, key)
        if cache_key in self.cache:
            return self.cache[cache_key]
        if key not in self.raw[namespace]:
            raise ExpressionError("unknown Template variable {}.{}".format(namespace, key))
        if cache_key in self.resolving:
            raise ExpressionError(
                "cyclic Template variable {}.{}".format(namespace, key)
            )
        self.resolving.add(cache_key)
        raw_value = self.raw[namespace][key]
        value = (
            render_inline(raw_value, self)
            if isinstance(raw_value, str)
            else raw_value
        )
        self.resolving.remove(cache_key)
        self.cache[cache_key] = value
        return value


def parse_control_line(line: str) -> Optional[Tuple[str, Optional[str]]]:
    stripped = line.strip()
    if not (stripped.startswith("${{") and stripped.endswith("}}")):
        return None
    inner = stripped[3:-2].strip()
    for name in ("if", "elif"):
        prefix = name + "("
        if inner.startswith(prefix) and inner.endswith(")"):
            return name, inner[len(prefix) : -1].strip()
    if inner == "else()":
        return "else", None
    if inner == "endif()":
        return "endif", None
    return None


def render_line(line: str, resolver: ValueResolver) -> str:
    matches = list(EXPRESSION_RE.finditer(line))
    if not matches:
        return line
    pieces: List[str] = []
    cursor = 0
    for match in matches:
        pieces.append(line[cursor : match.start()])
        value = evaluate_expression(match.group(1), resolver)
        context = quote_context(line, match.start())
        if (
            len(matches) == 1
            and context is None
            and expression_is_entire_scalar(line, match.start(), match.end())
        ):
            replacement = scalar_text(value)
        elif context == '"':
            replacement = json.dumps(js_string(value), ensure_ascii=False)[1:-1]
        elif context == "'":
            replacement = js_string(value).replace("'", "''")
        else:
            replacement = js_string(value)
        pieces.append(replacement)
        cursor = match.end()
    pieces.append(line[cursor:])
    return "".join(pieces)


def render_template(source: str, resolver: ValueResolver) -> str:
    output: List[str] = []
    stack: List[ConditionalFrame] = []

    for line_number, line in enumerate(source.splitlines(keepends=True), start=1):
        control = parse_control_line(line)
        if control:
            operation, expression = control
            if operation == "if":
                parent_active = all(frame.active for frame in stack)
                condition = js_truthy(evaluate_expression(expression or "", resolver))
                stack.append(
                    ConditionalFrame(
                        parent_active=parent_active,
                        active=parent_active and condition,
                        matched=condition,
                    )
                )
            elif operation == "elif":
                if not stack:
                    raise GateSetupError(
                        "elif() without if() on Template line {}".format(line_number)
                    )
                frame = stack[-1]
                if frame.saw_else:
                    raise GateSetupError(
                        "elif() after else() on Template line {}".format(line_number)
                    )
                condition = js_truthy(evaluate_expression(expression or "", resolver))
                frame.active = frame.parent_active and not frame.matched and condition
                frame.matched = frame.matched or condition
            elif operation == "else":
                if not stack:
                    raise GateSetupError(
                        "else() without if() on Template line {}".format(line_number)
                    )
                frame = stack[-1]
                if frame.saw_else:
                    raise GateSetupError(
                        "duplicate else() on Template line {}".format(line_number)
                    )
                frame.active = frame.parent_active and not frame.matched
                frame.matched = True
                frame.saw_else = True
            elif operation == "endif":
                if not stack:
                    raise GateSetupError(
                        "endif() without if() on Template line {}".format(line_number)
                    )
                stack.pop()
            continue

        if all(frame.active for frame in stack):
            output.append(
                line if line.lstrip().startswith("#") else render_line(line, resolver)
            )

    if stack:
        raise GateSetupError("unterminated if() block in Template")
    rendered = "".join(output)
    unresolved_lines = [
        line
        for line in rendered.splitlines()
        if not line.lstrip().startswith("#")
        and "${{" in line
    ]
    if unresolved_lines:
        raise GateSetupError("unresolved Template expression remains after rendering")
    return rendered


def first_yaml_document(source: str) -> str:
    parts: List[List[str]] = [[]]
    for line in source.splitlines(keepends=True):
        if DOCUMENT_SEPARATOR_RE.match(line):
            parts.append([])
        else:
            parts[-1].append(line)
    for lines in parts:
        meaningful = [
            line
            for line in lines
            if line.strip() and not line.lstrip().startswith("#")
        ]
        if meaningful:
            return "".join(lines)
    return ""


def extract_template_contract(source: str) -> Tuple[Mapping[str, Any], Mapping[str, Any], str]:
    try:
        document = yaml.safe_load(first_yaml_document(source))
    except yaml.YAMLError as error:
        raise GateSetupError(
            "cannot parse the Sealos Template metadata document: {}".format(
                error.__class__.__name__
            )
        )
    if not isinstance(document, Mapping) or document.get("kind") != "Template":
        raise GateSetupError("the first YAML document must be kind Template")
    spec = document.get("spec")
    if not isinstance(spec, Mapping):
        raise GateSetupError("Template spec must be an object")
    defaults = spec.get("defaults") or {}
    inputs = spec.get("inputs") or {}
    if not isinstance(defaults, Mapping) or not isinstance(inputs, Mapping):
        raise GateSetupError("Template spec.defaults and spec.inputs must be objects")
    metadata = document.get("metadata")
    name = metadata.get("name") if isinstance(metadata, Mapping) else None
    if not isinstance(name, str) or not name:
        raise GateSetupError("Template metadata.name is required")
    return defaults, inputs, name


def normalize_dns_label(value: str, fallback: str = "validation-app") -> str:
    normalized = re.sub(r"[^a-z0-9-]+", "-", value.lower()).strip("-")
    normalized = re.sub(r"-+", "-", normalized)
    return (normalized or fallback)[:54].rstrip("-") or fallback


def validate_target_value(label: str, value: str, subdomain: bool = False) -> None:
    if not value:
        raise GateSetupError("{} is required for target rendering".format(label))
    pattern = DNS_SUBDOMAIN_RE if subdomain else DNS_LABEL_RE
    limit = 253 if subdomain else 63
    if len(value) > limit or not pattern.fullmatch(value):
        raise GateSetupError("{} is not a valid DNS value".format(label))


def default_value(spec: Any) -> Any:
    if isinstance(spec, Mapping):
        return spec.get("value")
    return spec


def input_default(spec: Any) -> Any:
    if isinstance(spec, Mapping) and "default" in spec:
        return spec.get("default")
    return None


def input_type(spec: Any) -> str:
    if isinstance(spec, Mapping) and isinstance(spec.get("type"), str):
        return str(spec["type"]).lower()
    return "string"


def synthetic_input(name: str, spec: Any) -> str:
    lowered = name.lower()
    kind = input_type(spec)
    if kind == "boolean":
        return "false"
    if kind in {"number", "integer"}:
        return "1"
    if "email" in lowered:
        return "validation@example.invalid"
    if "url" in lowered or "uri" in lowered:
        return "https://validation.example.invalid"
    if "domain" in lowered or "host" in lowered:
        return "validation.example.invalid"
    if "uuid" in lowered:
        return "00000000-0000-4000-8000-000000000001"
    if "storage" in lowered or lowered.endswith("_size"):
        return "1Gi"
    if SENSITIVE_NAME_RE.search(name):
        return "Validation9@SafeToken"
    if isinstance(spec, Mapping):
        options = spec.get("options")
        if isinstance(options, Sequence) and not isinstance(options, (str, bytes)):
            for option in options:
                if isinstance(option, (str, int, float, bool)):
                    return js_string(option)
    return "validation"


def ast_input_paths(node: Tuple[Any, ...]) -> Iterable[str]:
    if node[0] == "path" and len(node[1]) >= 2 and node[1][0] == "inputs":
        yield node[1][1]
    for value in node[1:]:
        if isinstance(value, tuple) and value and isinstance(value[0], str):
            yield from ast_input_paths(value)
        elif isinstance(value, tuple):
            for child in value:
                if isinstance(child, tuple):
                    yield from ast_input_paths(child)


def ast_comparison_literals(node: Tuple[Any, ...]) -> Iterable[Tuple[str, Any]]:
    if node[0] == "binary" and node[1] in {"===", "!==", "==", "!="}:
        left, right = node[2], node[3]
        if (
            left[0] == "path"
            and len(left[1]) >= 2
            and left[1][0] == "inputs"
            and right[0] == "literal"
        ):
            yield left[1][1], right[1]
        if (
            right[0] == "path"
            and len(right[1]) >= 2
            and right[1][0] == "inputs"
            and left[0] == "literal"
        ):
            yield right[1][1], left[1]
    for value in node[1:]:
        if isinstance(value, tuple) and value and isinstance(value[0], str):
            yield from ast_comparison_literals(value)
        elif isinstance(value, tuple):
            for child in value:
                if isinstance(child, tuple):
                    yield from ast_comparison_literals(child)


def conditional_expressions(source: str) -> List[str]:
    expressions: List[str] = []
    for line in source.splitlines():
        control = parse_control_line(line)
        if control and control[0] in {"if", "elif"} and control[1] is not None:
            expressions.append(control[1])
    return expressions


def unique_values(values: Iterable[Any]) -> List[Any]:
    result: List[Any] = []
    seen: Set[str] = set()
    for value in values:
        marker = json.dumps(value, sort_keys=True, default=str)
        if marker not in seen:
            seen.add(marker)
            result.append(value)
    return result


def build_input_scenarios(
    source: str,
    inputs: Mapping[str, Any],
    max_scenarios: int,
) -> List[Dict[str, Any]]:
    baseline: Dict[str, Any] = {}
    for name, spec in inputs.items():
        key = str(name)
        declared = input_default(spec)
        if SENSITIVE_NAME_RE.search(key) or declared is None:
            baseline[key] = synthetic_input(key, spec)
        else:
            baseline[key] = declared

    candidates: Dict[str, List[Any]] = {}
    parsed_conditions = [parse_expression(item) for item in conditional_expressions(source)]
    referenced: Set[str] = set()
    compared: Dict[str, List[Any]] = {}
    for node in parsed_conditions:
        referenced.update(ast_input_paths(node))
        for key, value in ast_comparison_literals(node):
            compared.setdefault(key, []).append(value)

    for key in sorted(referenced):
        if key not in inputs:
            raise GateSetupError(
                "conditional expression references undeclared input {}".format(key)
            )
        values: List[Any] = [baseline[key]]
        values.extend(compared.get(key, []))
        if input_type(inputs[key]) == "boolean":
            values.extend(["false", "true"])
        else:
            values.extend(["", synthetic_input(key, inputs[key])])
        candidates[key] = unique_values(values)

    if not candidates:
        return [baseline]

    scenario_count = 1
    for values in candidates.values():
        scenario_count *= len(values)
    if scenario_count > max_scenarios:
        raise GateSetupError(
            "conditional input coverage requires {} scenarios, above the safe limit {}".format(
                scenario_count, max_scenarios
            )
        )

    keys = list(candidates)
    scenarios: List[Dict[str, Any]] = []
    for values in itertools.product(*(candidates[key] for key in keys)):
        scenario = dict(baseline)
        scenario.update(dict(zip(keys, values)))
        scenarios.append(scenario)
    return scenarios


def split_rendered_documents(source: str) -> List[str]:
    documents: List[str] = []
    current: List[str] = []
    for line in source.splitlines(keepends=True):
        if DOCUMENT_SEPARATOR_RE.match(line):
            if "".join(current).strip():
                documents.append("".join(current))
            current = []
        else:
            current.append(line)
    if "".join(current).strip():
        documents.append("".join(current))
    return documents


def collect_runtime_documents(
    source: str,
    defaults: Mapping[str, Any],
    scenarios: Sequence[Mapping[str, Any]],
    systems: Mapping[str, str],
    template_name: str,
) -> List[RuntimeDocument]:
    base = normalize_dns_label(template_name)[:40].rstrip("-")
    suffix = "".join(
        secrets.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(8)
    )
    raw_defaults = {
        str(key): default_value(value) for key, value in defaults.items()
    }
    raw_defaults["app_name"] = "{}-{}".format(base, suffix)
    raw_defaults["app_host"] = "{}-{}".format(base, suffix)

    documents: List[RuntimeDocument] = []
    seen: Set[str] = set()
    for scenario_index, scenario in enumerate(scenarios):
        resolver = ValueResolver(raw_defaults, scenario, systems)
        rendered = render_template(source, resolver)
        for content in split_rendered_documents(rendered):
            try:
                document = yaml.safe_load(content)
            except yaml.YAMLError as error:
                raise GateSetupError(
                    "validation-only render is invalid YAML in scenario {}: {}".format(
                        scenario_index + 1, error.__class__.__name__
                    )
                )
            if document is None:
                continue
            if not isinstance(document, Mapping):
                raise GateSetupError("each rendered YAML document must be an object")
            if document.get("kind") == "Template":
                continue
            api_version = document.get("apiVersion")
            kind = document.get("kind")
            metadata = document.get("metadata")
            name = metadata.get("name") if isinstance(metadata, Mapping) else None
            declared_namespace = (
                metadata.get("namespace") if isinstance(metadata, Mapping) else None
            )
            if not all(
                isinstance(value, str) and value for value in (api_version, kind)
            ):
                raise GateSetupError(
                    "rendered runtime documents require apiVersion and kind"
                )
            if not isinstance(name, str) or not name:
                if kind == "List":
                    name = "rendered-list"
                else:
                    raise GateSetupError(
                        "rendered runtime documents require metadata.name"
                    )
            if (
                declared_namespace is not None
                and declared_namespace != systems["SEALOS_NAMESPACE"]
            ):
                raise GateSetupError(
                    "rendered runtime document targets a namespace outside the current sandbox"
                )
            if not content.endswith("\n"):
                content += "\n"
            digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
            if digest in seen:
                continue
            seen.add(digest)
            documents.append(
                RuntimeDocument(
                    scenario=scenario_index + 1,
                    kind=str(kind),
                    name=str(name),
                    content=content,
                    digest=digest,
                )
            )
    if not documents:
        raise GateSetupError("Template produced no runtime documents")
    return documents


def private_write(path: Path, content: str) -> None:
    descriptor = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(content)
    finally:
        if os.path.exists(path):
            os.chmod(path, 0o600)


def append_private_log(path: Optional[Path], content: str) -> None:
    if path is None:
        return
    descriptor = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    try:
        with os.fdopen(descriptor, "a", encoding="utf-8") as handle:
            handle.write(content)
            if not content.endswith("\n"):
                handle.write("\n")
    finally:
        os.chmod(path, 0o600)


def warning_categories(stderr: str) -> List[str]:
    categories: Set[str] = set()
    for line in stderr.splitlines():
        if not line.lstrip().lower().startswith("warning"):
            continue
        lowered = line.lower()
        if "podsecurity" in lowered or "pod security" in lowered:
            categories.add("pod-security")
        elif "deprecated" in lowered:
            categories.add("deprecated-api")
        else:
            categories.add("server-warning")
    return sorted(categories)


def classify_failure(stderr: str) -> Tuple[str, List[str], str]:
    lowered = stderr.lower()
    field_paths = sorted(
        set(
            re.findall(
                r"unknown field [\"']([^\"']+)[\"']",
                stderr,
                flags=re.IGNORECASE,
            )
        )
    )
    if (
        field_paths
        or "strict decoding error" in lowered
        or "badrequest" in lowered
        or "validationerror" in lowered
    ):
        return "schema", field_paths, "target API schema rejected the document"
    if (
        "no matches for kind" in lowered
        or "the server could not find the requested resource" in lowered
    ):
        return "api-capability", [], "required API or CRD is unavailable"
    if "forbidden" in lowered or "unauthorized" in lowered:
        return "authorization", [], "target identity is not authorized for dry-run"
    if "admission webhook" in lowered or "denied the request" in lowered:
        return "admission", [], "target admission policy rejected the document"
    if (
        "unable to connect" in lowered
        or "connection refused" in lowered
        or "i/o timeout" in lowered
        or "context deadline exceeded" in lowered
    ):
        return "cluster", [], "target API server is unavailable"
    return "server", [], "target API server rejected the document"


def run_server_dry_run(
    documents: Sequence[RuntimeDocument],
    kubectl: str,
    context: str,
    namespace: str,
    private_log: Optional[Path],
    timeout: int,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    warnings: List[Dict[str, Any]] = []
    failures: List[Dict[str, Any]] = []
    temporary = Path(tempfile.mkdtemp(prefix="sealos-server-dry-run-"))
    os.chmod(temporary, 0o700)
    try:
        for index, document in enumerate(documents):
            safe_kind = normalize_dns_label(document.kind, fallback="resource")
            safe_name = normalize_dns_label(document.name, fallback="resource")
            path = temporary / "{:03d}-{}-{}.yaml".format(index, safe_kind, safe_name)
            private_write(path, document.content)
            command = [
                kubectl,
                "--context",
                context,
                "apply",
                "--dry-run=server",
                "--validate=strict",
                "-o",
                "name",
                "-n",
                namespace,
                "-f",
                str(path),
            ]
            try:
                result = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    check=False,
                )
                document_warnings = warning_categories(result.stderr)
                for category in document_warnings:
                    warnings.append(
                        {
                            "scenario": document.scenario,
                            "kind": document.kind,
                            "name": document.name,
                            "category": category,
                        }
                    )
                if result.returncode != 0:
                    category, paths, detail = classify_failure(result.stderr)
                    append_private_log(
                        private_log,
                        "[server-dry-run] scenario={} {}/{} status=failed "
                        "category={} field_paths={} warnings={}".format(
                            document.scenario,
                            document.kind,
                            document.name,
                            category,
                            ",".join(paths) or "none",
                            ",".join(document_warnings) or "none",
                        ),
                    )
                    failures.append(
                        {
                            "scenario": document.scenario,
                            "kind": document.kind,
                            "name": document.name,
                            "category": category,
                            "field_paths": paths,
                            "detail": detail,
                        }
                    )
                else:
                    append_private_log(
                        private_log,
                        "[server-dry-run] scenario={} {}/{} status=passed warnings={}".format(
                            document.scenario,
                            document.kind,
                            document.name,
                            ",".join(document_warnings) or "none",
                        ),
                    )
            except subprocess.TimeoutExpired:
                append_private_log(
                    private_log,
                    "[server-dry-run] scenario={} {}/{} timed out".format(
                        document.scenario, document.kind, document.name
                    ),
                )
                failures.append(
                    {
                        "scenario": document.scenario,
                        "kind": document.kind,
                        "name": document.name,
                        "category": "cluster",
                        "field_paths": [],
                        "detail": "target API server dry-run timed out",
                    }
                )
    finally:
        shutil.rmtree(temporary)
    return warnings, failures


def read_template(path: Path) -> Tuple[str, str]:
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as error:
        raise GateSetupError("cannot read Template: {}".format(error.strerror))
    return content, hashlib.sha256(content.encode("utf-8")).hexdigest()


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run per-document target-cluster server-side dry-run"
    )
    parser.add_argument("--template", required=True, type=Path)
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--context", required=True)
    parser.add_argument("--service-account", required=True)
    parser.add_argument("--cloud-domain", required=True)
    parser.add_argument("--cert-secret-name", required=True)
    parser.add_argument("--kubectl", default="kubectl")
    parser.add_argument("--private-log", type=Path)
    parser.add_argument("--max-scenarios", type=int, default=64)
    parser.add_argument("--timeout", type=int, default=60)
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    result: Dict[str, Any] = {
        "version": "1.0",
        "status": "setup-error",
        "template_sha256": None,
        "context": args.context,
        "namespace": args.namespace,
        "scenarios": 0,
        "documents_checked": 0,
        "warnings": [],
        "failures": [],
    }
    try:
        if args.max_scenarios < 1:
            raise GateSetupError("--max-scenarios must be positive")
        if args.timeout < 1:
            raise GateSetupError("--timeout must be positive")
        validate_target_value("namespace", args.namespace)
        validate_target_value("service account", args.service_account, subdomain=True)
        validate_target_value(
            "certificate Secret name", args.cert_secret_name, subdomain=True
        )
        validate_target_value("cloud domain", args.cloud_domain, subdomain=True)
        kubectl = shutil.which(args.kubectl)
        if kubectl is None:
            raise GateSetupError("kubectl is unavailable")

        source, template_digest = read_template(args.template)
        result["template_sha256"] = template_digest
        defaults, inputs, template_name = extract_template_contract(source)
        scenarios = build_input_scenarios(source, inputs, args.max_scenarios)
        systems = {
            "SEALOS_NAMESPACE": args.namespace,
            "SEALOS_CLOUD_DOMAIN": args.cloud_domain,
            "SEALOS_CERT_SECRET_NAME": args.cert_secret_name,
            "SEALOS_SERVICE_ACCOUNT": args.service_account,
        }
        documents = collect_runtime_documents(
            source,
            defaults,
            scenarios,
            systems,
            template_name,
        )
        result["scenarios"] = len(scenarios)
        result["documents_checked"] = len(documents)
        warnings, failures = run_server_dry_run(
            documents,
            kubectl,
            args.context,
            args.namespace,
            args.private_log,
            args.timeout,
        )
        result["warnings"] = warnings
        result["failures"] = failures
        _, final_digest = read_template(args.template)
        if final_digest != template_digest:
            raise GateSetupError(
                "delivery Template changed while server-side dry-run was running"
            )
        result["status"] = "failed" if failures else "passed"
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1 if failures else 0
    except (GateSetupError, OSError) as error:
        result["failures"] = [
            {
                "category": "setup",
                "detail": str(error),
                "field_paths": [],
            }
        ]
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2


if __name__ == "__main__":
    sys.exit(main())
