from __future__ import annotations

import copy
import base64
import binascii
import hashlib
import json
import math
import os
import re
import subprocess
from datetime import datetime
from pathlib import Path, PurePosixPath

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import ValidationError
from referencing import Registry, Resource

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PACKAGE_ROOT.parents[1]
STANDARD_SCHEMA_DIR = REPO_ROOT / "docs" / "standards" / "domain-intelligence" / "DIS-0.1.0" / "schemas"
DOMAIN_DIR = PACKAGE_ROOT / "domain"
UNIT_DIR = DOMAIN_DIR / "units"


def fail(message: str):
    raise SystemExit("DIS validation failed: " + message)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def safe_relative(value: str) -> str:
    if not isinstance(value, str) or not value or value.startswith("/") or "\\" in value:
        fail(f"unsafe package-relative path: {value!r}")
    if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", value):
        fail(f"URI is not a local package resource: {value}")
    if any(part in ("", ".", "..") for part in value.split("/")):
        fail(f"non-normalized package path: {value}")
    return value


def is_external_provenance_ref(value: str) -> bool:
    if not isinstance(value, str) or re.search(r"\s", value):
        return False
    return bool(
        re.fullmatch(r"https://\S+", value, re.IGNORECASE)
        or re.fullmatch(r"doi:10\.[0-9]{4,9}/\S+", value, re.IGNORECASE)
        or re.fullmatch(r"urn:[A-Za-z0-9][A-Za-z0-9-]{0,31}:\S+", value, re.IGNORECASE)
    )


def validate_provenance_ref(value: str):
    if not is_external_provenance_ref(value):
        safe_relative(value)


def resolve_inside(relative: str) -> Path:
    candidate = (PACKAGE_ROOT / PurePosixPath(safe_relative(relative))).resolve(strict=True)
    try:
        candidate.relative_to(PACKAGE_ROOT.resolve())
    except ValueError:
        fail(f"resource escapes Package root through symlink: {relative}")
    return candidate


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def add_expected(expected: dict, relative: str, kind: str, owner: str):
    relative = safe_relative(relative)
    previous = expected.get(relative)
    if previous and previous["kind"] != kind:
        fail(f"resource kind conflict for {relative}")
    owners = set(previous["owners"] if previous else [])
    owners.add(owner)
    expected[relative] = {"kind": kind, "owners": owners}


def collect_schema_refs(ref: str, expected: dict, active: set, base_dir: str | None = None):
    if ref.startswith("#"):
        return
    path_part, _, _fragment = ref.partition("#")
    safe_relative(path_part)
    relative = (PurePosixPath(base_dir) / path_part).as_posix() if base_dir else path_part
    relative = safe_relative(relative)
    if relative in active:
        fail(f"schema reference cycle: {relative}")
    add_expected(expected, relative, "schema", "xdownload.web-media")
    schema = read_json(resolve_inside(relative))
    active.add(relative)

    def scan(value):
        if isinstance(value, list):
            for item in value:
                scan(item)
        elif isinstance(value, dict):
            for key, child in value.items():
                if key == "$ref" and isinstance(child, str) and not child.startswith("#"):
                    collect_schema_refs(child, expected, active, str(PurePosixPath(relative).parent))
                else:
                    scan(child)

    scan(schema)
    active.remove(relative)



def validate_definition_binding(definition: dict, units_by_id: dict, graph: dict, graph_path: str):
    declared = {}
    component_ids = set()
    components = definition.get("components")
    private_units = definition.get("privateUnits")
    if not isinstance(components, list) or not isinstance(private_units, list):
        fail("Definition components/privateUnits must be arrays")
    for component in components:
        family = component.get("family")
        component_id = component.get("componentId")
        unit_ref = component.get("unitRef", {})
        unit = units_by_id.get(unit_ref.get("id"))
        if family not in ("semantic", "tool") or not component_id:
            fail("invalid Definition Component identity/family")
        if component_id in component_ids:
            fail(f"duplicate Definition Component ID: {component_id}")
        component_ids.add(component_id)
        if not unit or unit.get("revision") != unit_ref.get("revision"):
            fail(f"unresolved Definition Component Unit: {unit_ref.get('id')}")
        if unit["id"] in declared:
            fail(f"duplicate Definition Unit declaration: {unit['id']}")
        exposure = unit.get("implementation", {}).get("exposure")
        if family == "tool" and (unit.get("role") != "tool" or exposure != "tool"):
            fail(f"invalid Tool Component binding: {component_id}")
        if family == "semantic" and (unit.get("role") == "tool" or exposure != "semantic"):
            fail(f"invalid Semantic Component binding: {component_id}")
        declared[unit["id"]] = {"revision": unit["revision"], "family": family}
    for unit_ref in private_units:
        unit = units_by_id.get(unit_ref.get("id"))
        if not unit or unit.get("revision") != unit_ref.get("revision"):
            fail(f"unresolved Definition private Unit: {unit_ref.get('id')}")
        if unit["id"] in declared:
            fail(f"private Unit overlaps a Component: {unit['id']}")
        exposure = unit.get("implementation", {}).get("exposure")
        if exposure is not None and exposure != "private":
            fail(f"private Unit is exposed: {unit['id']}")
        declared[unit["id"]] = {"revision": unit["revision"], "family": "private"}
    for node in graph.get("nodes", []):
        unit_ref = node.get("unitRef", {})
        found = declared.get(unit_ref.get("id"))
        if not found or found["revision"] != unit_ref.get("revision"):
            fail(f"Graph Node Unit is not declared exactly in Definition: {unit_ref.get('id')}")
    workflow_ref = definition.get("workflowRef", {})
    workflow_unit_ref = workflow_ref.get("unitRef", {})
    graph_ref = workflow_ref.get("graphRef", {})
    workflow_unit = units_by_id.get(workflow_unit_ref.get("id"))
    if (
        not workflow_unit
        or workflow_unit.get("revision") != workflow_unit_ref.get("revision")
        or workflow_unit.get("role") != "workflow"
    ):
        fail("Definition Workflow Unit identity/role mismatch")
    if declared.get(workflow_unit["id"], {}).get("family") != "semantic":
        fail("Workflow Unit must be declared as a Semantic Component")
    if (
        graph_ref.get("id") != graph.get("id")
        or graph_ref.get("revision") != graph.get("revision")
        or graph_ref.get("path") != graph_path
    ):
        fail("Definition Workflow Graph identity/revision/path mismatch")
    implementation = workflow_unit.get("implementation", {})
    if (
        implementation.get("ref") != f"graph:{graph['id']}@{graph['revision']}"
        or implementation.get("artifactRef") != graph_path
    ):
        fail("Workflow Unit implementation binding does not match Graph")


MISSING = object()


def pointer_key(pointer: str) -> str:
    if pointer == "" or not isinstance(pointer, str) or not pointer.startswith("/") or pointer.count("/") != 1:
        fail(f"invalid DIS 0.1.0 top-level pointer: {pointer!r}")
    return pointer[1:].replace("~1", "/").replace("~0", "~")


def pointer_get(value, pointer: str):
    if pointer == "":
        return value
    key = pointer_key(pointer)
    if not isinstance(value, dict) or key not in value:
        return MISSING
    return value[key]


def pointer_set(target: dict, pointer: str, value):
    key = pointer_key(pointer)
    if key in target:
        fail(f"duplicate runtime binding in conformance trace: {pointer}")
    target[key] = value


def _ecmascript_number(value):
    try:
        return float(value)
    except OverflowError:
        return math.inf if value > 0 else -math.inf


def json_value_equal(left, right):
    """Compare JSON values using ECMAScript Number and structural JSON semantics."""
    if isinstance(left, bool) or isinstance(right, bool):
        return isinstance(left, bool) and isinstance(right, bool) and left is right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return _ecmascript_number(left) == _ecmascript_number(right)
    if left is None or right is None:
        return left is None and right is None
    if isinstance(left, str) or isinstance(right, str):
        return isinstance(left, str) and isinstance(right, str) and left == right
    if isinstance(left, list) or isinstance(right, list):
        return isinstance(left, list) and isinstance(right, list) and len(left) == len(right) and all(
            json_value_equal(a, b) for a, b in zip(left, right)
        )
    if isinstance(left, dict) or isinstance(right, dict):
        return isinstance(left, dict) and isinstance(right, dict) and left.keys() == right.keys() and all(
            json_value_equal(left[key], right[key]) for key in left
        )
    return False


def condition_matches(output, condition):
    if condition is None:
        return True
    actual = pointer_get(output, condition["path"])
    operator = condition["operator"]
    if operator == "equals":
        return actual is not MISSING and json_value_equal(actual, condition.get("value"))
    if operator == "notEquals":
        return actual is MISSING or not json_value_equal(actual, condition.get("value"))
    if operator == "exists":
        return actual is not MISSING
    fail(f"unsupported control condition operator: {operator}")



def can_reach(source: str, target: str, adjacency: dict) -> bool:
    if source == target:
        return False
    pending = [source]
    seen = set()
    while pending:
        current = pending.pop()
        if current in seen:
            continue
        seen.add(current)
        for child in adjacency.get(current, []):
            if child == target:
                return True
            pending.append(child)
    return False


def path_binding_range(entry_node: str, target_node: str, source_nodes: set, order: list, adjacency: dict):
    minimum = {node: float("inf") for node in order}
    maximum = {node: float("-inf") for node in order}
    initial = 1 if entry_node in source_nodes else 0
    minimum[entry_node] = initial
    maximum[entry_node] = initial
    for current in order:
        if minimum[current] == float("inf"):
            continue
        for child in adjacency.get(current, []):
            increment = 1 if child in source_nodes else 0
            minimum[child] = min(minimum[child], minimum[current] + increment)
            maximum[child] = max(maximum[child], maximum[current] + increment)
    return minimum[target_node], maximum[target_node]


def validate_graph_contract(graph: dict, units_by_id: dict, schemas: dict):
    node_ids = [node["nodeId"] for node in graph["nodes"]]
    nodes_by_id = {node["nodeId"]: node for node in graph["nodes"]}
    if len(nodes_by_id) != len(node_ids):
        fail("duplicate Graph Node ID")
    if graph["entryNode"] not in nodes_by_id:
        fail("Graph entry Node is missing")
    if any(node not in nodes_by_id for node in graph["terminalNodes"]):
        fail("Graph terminal Node is missing")

    for node in graph["nodes"]:
        unit_ref = node["unitRef"]
        unit = units_by_id.get(unit_ref["id"])
        if not unit or unit["revision"] != unit_ref["revision"]:
            fail(f"Graph Node exact Unit identity unresolved: {node['nodeId']}")
    entry_unit = units_by_id[nodes_by_id[graph["entryNode"]]["unitRef"]["id"]]
    if entry_unit["input"]["schemaRef"] != graph["inputSchemaRef"]:
        fail("Graph entry input Schema does not match entry Unit")
    for terminal_id in graph["terminalNodes"]:
        terminal_unit = units_by_id[nodes_by_id[terminal_id]["unitRef"]["id"]]
        if terminal_unit["output"]["schemaRef"] != graph["outputSchemaRef"]:
            fail(f"Graph terminal output Schema mismatch: {terminal_id}")

    controls = [edge for edge in graph["edges"] if edge["kind"] == "control"]
    data = [edge for edge in graph["edges"] if edge["kind"] == "data"]
    evidence = [edge for edge in graph["edges"] if edge["kind"] == "evidence"]
    if len(controls) + len(data) + len(evidence) != len(graph["edges"]):
        fail("unsupported Graph Edge kind")
    adjacency = {node_id: [] for node_id in node_ids}

    for edge in controls:
        if edge["from"] not in nodes_by_id or edge["to"] not in nodes_by_id:
            fail("control Edge references unknown Node")
        condition = edge.get("when")
        if condition is not None:
            operator = condition["operator"]
            if operator not in ("equals", "notEquals", "exists"):
                fail("unsupported control condition operator")
            if operator in ("equals", "notEquals") and "value" not in condition:
                fail("control condition value is required")
            if operator == "exists" and "value" in condition:
                fail("exists condition must not declare value")
            pointer = condition["path"]
            source_unit = units_by_id[nodes_by_id[edge["from"]]["unitRef"]["id"]]
            source_schema = schemas[source_unit["output"]["schemaRef"]]
            if pointer:
                property_name = pointer_key(pointer)
                if property_name not in source_schema.get("properties", {}):
                    fail("control condition references unknown output property")
        adjacency[edge["from"]].append(edge["to"])

    data_keys = set()
    for edge in data:
        source_node = edge["from"]["node"]
        target_node = edge["to"]["node"]
        if source_node not in nodes_by_id or target_node not in nodes_by_id:
            fail("data Edge references unknown Node")
        source_pointer = edge["from"]["pointer"]
        target_pointer = edge["to"]["pointer"]
        if source_pointer:
            source_property = pointer_key(source_pointer)
            source_unit = units_by_id[nodes_by_id[source_node]["unitRef"]["id"]]
            source_schema = schemas[source_unit["output"]["schemaRef"]]
            if source_property not in source_schema.get("properties", {}):
                fail("data Edge references unknown source output property")
            if source_property not in source_schema.get("required", []):
                fail("data Edge source output property must be required")
        target_property = pointer_key(target_pointer)
        target_unit = units_by_id[nodes_by_id[target_node]["unitRef"]["id"]]
        target_schema = schemas[target_unit["input"]["schemaRef"]]
        if target_property not in target_schema.get("properties", {}):
            fail("data Edge references unknown target input property")
        if target_node == graph["entryNode"]:
            fail("entry Node cannot receive a data Edge")
        duplicate_key = (target_node, target_pointer, source_node)
        if duplicate_key in data_keys:
            fail("duplicate data binding")
        data_keys.add(duplicate_key)

    for edge in evidence:
        source_node = edge["from"]["node"]
        target_node = edge["to"]["node"]
        if source_node not in nodes_by_id or target_node not in nodes_by_id:
            fail("evidence Edge references unknown Node")
        source_property = pointer_key(edge["from"]["pointer"])
        source_unit = units_by_id[nodes_by_id[source_node]["unitRef"]["id"]]
        source_schema = schemas[source_unit["output"]["schemaRef"]]
        if source_property not in source_schema.get("properties", {}):
            fail("evidence Edge references unknown source property")
        if source_property not in source_schema.get("required", []):
            fail("evidence Edge source property must be required")
        target_unit = units_by_id[nodes_by_id[target_node]["unitRef"]["id"]]
        if edge["to"]["slot"] not in target_unit.get("evidence", {}).get("consumes", []):
            fail("evidence Edge targets an undeclared slot")

    indegree = {node_id: 0 for node_id in node_ids}
    for source_node, children in adjacency.items():
        for child in children:
            indegree[child] += 1
    pending = [node_id for node_id in node_ids if indegree[node_id] == 0]
    order = []
    while pending:
        current = pending.pop(0)
        order.append(current)
        for child in adjacency[current]:
            indegree[child] -= 1
            if indegree[child] == 0:
                pending.append(child)
    if len(order) != len(node_ids):
        fail("DIS 0.1.0 Graph must be DAG-only")

    reachable = {graph["entryNode"]}
    queue = [graph["entryNode"]]
    while queue:
        current = queue.pop(0)
        for child in adjacency[current]:
            if child not in reachable:
                reachable.add(child)
                queue.append(child)
    if len(reachable) != len(node_ids):
        fail("Graph contains an unreachable control Node")

    for node_id in node_ids:
        unit = units_by_id[nodes_by_id[node_id]["unitRef"]["id"]]
        input_schema = schemas[unit["input"]["schemaRef"]]
        if node_id != graph["entryNode"]:
            for property_name in input_schema.get("required", []):
                target_pointer = "/" + property_name.replace("~", "~0").replace("/", "~1")
                bindings = [edge for edge in data if edge["to"]["node"] == node_id and edge["to"]["pointer"] == target_pointer]
                if not bindings:
                    fail(f"required Graph input has no data binding: {node_id}{target_pointer}")
                sources = {edge["from"]["node"] for edge in bindings}
                if any(not can_reach(source, node_id, adjacency) for source in sources):
                    fail(f"data source is not a control ancestor: {node_id}{target_pointer}")
                minimum, maximum = path_binding_range(graph["entryNode"], node_id, sources, order, adjacency)
                if minimum != 1 or maximum != 1:
                    fail(f"required Graph input is not bound exactly once on every path: {node_id}{target_pointer}")
            for edge in [item for item in data if item["to"]["node"] == node_id]:
                property_name = pointer_key(edge["to"]["pointer"])
                if property_name not in input_schema.get("required", []):
                    source = edge["from"]["node"]
                    if not can_reach(source, node_id, adjacency):
                        fail(f"optional data source is not a control ancestor: {source}->{node_id}")
                    sources = {item["from"]["node"] for item in data if item["to"]["node"] == node_id and item["to"]["pointer"] == edge["to"]["pointer"]}
                    _, maximum = path_binding_range(graph["entryNode"], node_id, sources, order, adjacency)
                    if maximum > 1:
                        fail(f"optional Graph input has multiple sources on one path: {node_id}{edge['to']['pointer']}")
        for slot in unit.get("evidence", {}).get("consumes", []):
            slot_edges = [edge for edge in evidence if edge["to"]["node"] == node_id and edge["to"]["slot"] == slot]
            if not slot_edges:
                fail(f"required evidence slot has no source: {node_id}:{slot}")
            sources = {edge["from"]["node"] for edge in slot_edges}
            if any(not can_reach(source, node_id, adjacency) for source in sources):
                fail(f"evidence source is not a control ancestor: {node_id}:{slot}")
            minimum, _ = path_binding_range(graph["entryNode"], node_id, sources, order, adjacency)
            if minimum < 1:
                fail(f"evidence slot is unavailable on a control path: {node_id}:{slot}")

    terminal_nodes = set(graph["terminalNodes"])
    for node_id in node_ids:
        if node_id not in terminal_nodes and not adjacency[node_id]:
            fail(f"non-terminal control path has no successor: {node_id}")
        if node_id in terminal_nodes and adjacency[node_id]:
            fail(f"terminal Node has a control successor: {node_id}")


def validate_optional_data_binding_semantics(graph: dict, units_by_id: dict, schemas: dict):
    candidate = json.loads(json.dumps(graph))
    target_unit = units_by_id["xdownload.player.outcome-validator"]
    target_schema_ref = target_unit["input"]["schemaRef"]
    target_schema = json.loads(json.dumps(schemas[target_schema_ref]))
    target_schema.setdefault("properties", {})["optionalStatus"] = {"type": "string"}
    local_schemas = dict(schemas)
    local_schemas[target_schema_ref] = target_schema
    candidate["edges"].append({
        "kind": "data",
        "from": {"node": "resolve-known", "pointer": "/status"},
        "to": {"node": "validate", "pointer": "/optionalStatus"},
    })
    # The source executes only on the known-player branch. The target Schema's
    # optional property makes this an explicit conditional binding.
    validate_graph_contract(candidate, units_by_id, local_schemas)

    duplicate = json.loads(json.dumps(candidate))
    duplicate["edges"].append({
        "kind": "data",
        "from": {"node": "decide", "pointer": "/route"},
        "to": {"node": "validate", "pointer": "/optionalStatus"},
    })
    try:
        validate_graph_contract(duplicate, units_by_id, local_schemas)
    except SystemExit as error:
        if "optional Graph input has multiple sources on one path" not in str(error):
            raise
    else:
        fail("optional data binding accepted two sources on one control path")


def reference_uri_protocol(value):
    if not isinstance(value, str) or not re.fullmatch(r'[\x21-\x7e]+', value) or re.search(r'%(?![0-9A-Fa-f]{2})', value):
        return None
    parsed = re.fullmatch(r'([A-Za-z][A-Za-z0-9+.-]*):([^\s]*)', value, flags=re.ASCII)
    if not parsed:
        return None
    if not re.fullmatch(r"[A-Za-z0-9._~!$&'()*+,;=:@%/\-]*(?:\?[A-Za-z0-9._~!$&'()*+,;=:@%/?\-]*)?(?:#[A-Za-z0-9._~!$&'()*+,;=:@%/?\-]*)?", parsed.group(2)):
        return None
    scheme = parsed.group(1).lower()
    if scheme in ('http', 'https', 'ftp'):
        authority = re.match(r'//([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?(?:[/?#]|$)', parsed.group(2), flags=re.ASCII)
        if not authority or (authority.group(2) is not None and int(authority.group(2)) > 65535):
            return None
    elif parsed.group(2).startswith('//') and not (scheme == 'file' and parsed.group(2).startswith('///')):
        return None
    return scheme + ':'


def validate_trace_assembly(result: dict, graph: dict, units_by_id: dict, nodes_by_id: dict, selected_providers: dict, schemas: dict, registry, rejection=False):
    trace = result.get("trace")
    if not isinstance(trace, list) or not trace:
        fail(f"missing execution trace: {result.get('label')}")
    node_ids = [entry.get("nodeId") for entry in trace]
    if node_ids[0] != graph["entryNode"] or len(set(node_ids)) != len(node_ids):
        fail(f"trace entry/cycle identity invalid: {result.get('label')}")
    if not rejection and node_ids[-1] not in graph["terminalNodes"]:
        fail(f"trace does not end at a declared terminal: {result.get('label')}")
    outputs = {}
    expected_outcome = None

    def check_action(unit, status, node_id, index):
        nonlocal expected_outcome
        action = unit.get('failure', {}).get('handling', {}).get(status, {}).get('action')
        supported = {'UNKNOWN': ('PRESERVE_UNKNOWN', 'BOUNDED_FALLBACK'), 'AMBIGUOUS': ('CLARIFY',), 'CONFLICT': ('CLARIFY',), 'NEEDS_INPUT': ('WAIT',), 'NEEDS_REVIEW': ('REVIEW',)}
        if action not in ('REJECT', 'FAIL') and action not in supported.get(status, ()):
            fail(f'undeclared or unsupported failure policy: {unit["id"]}:{status}')
        if action in ('REJECT', 'FAIL'):
            expected_policy = {'unitId': unit['id'], 'nodeId': node_id, 'status': status, 'action': action}
            if index != len(trace) - 1 or not rejection or result.get('failurePolicy') != expected_policy or result.get('errorCode') != 'FAILURE_POLICY_' + action:
                fail(f'trace continued past an earlier terminating Unit policy: {node_id}')
            return True
        terminal = 'NEEDS_INPUT' if action in ('CLARIFY', 'WAIT') else 'NEEDS_REVIEW'
        if expected_outcome and expected_outcome != terminal:
            fail(f'inconsistent failure policy outcome: {node_id}')
        expected_outcome = terminal
        return False

    for index, entry in enumerate(trace):
        node_id = entry.get("nodeId")
        node = nodes_by_id.get(node_id)
        unit = units_by_id.get(entry.get("unitId"))
        if not node or not unit or node["unitRef"]["id"] != unit["id"] or node["unitRef"]["revision"] != entry.get("unitRevision"):
            fail(f"trace Unit identity mismatch: {node_id}")
        selected_provider = selected_providers.get(unit['id'])
        expected_ref = selected_provider.get('ref') if selected_provider else unit.get('implementation', {}).get('ref')
        if entry.get("implementationRef") != expected_ref:
            fail(f"trace implementation binding mismatch: {node_id}")
        selected_candidate = entry.get("implementationCandidateId")
        expected_candidate = next(
            (item.get("candidateId") for item in unit.get("implementation", {}).get("candidates", [])
             if item.get("candidateId") == selected_candidate),
            None,
        )
        if unit.get("implementation", {}).get("candidates") and expected_candidate is None:
            fail(f"trace implementation candidate is not declared: {node_id}")
        if not unit.get("implementation", {}).get("candidates") and selected_candidate is not None:
            fail(f"trace carries an undeclared implementation candidate: {node_id}")
        expected_selected = selected_providers.get(unit["id"], {}).get("candidateId")
        if selected_candidate != expected_selected:
            fail(f"trace implementation candidate differs from Package selection lock: {node_id}")
        if index == 0:
            expected_input = result.get("input")
        else:
            expected_input = {}
            for edge in graph["edges"]:
                if edge["kind"] != "data" or edge["to"]["node"] != node_id:
                    continue
                source_node = edge["from"]["node"]
                if source_node not in outputs:
                    continue
                value = pointer_get(outputs[source_node], edge["from"]["pointer"])
                if value is MISSING:
                    fail(f"trace data source value missing: {source_node}->{node_id}")
                pointer_set(expected_input, edge["to"]["pointer"], value)
        if not json_value_equal(entry.get("input"), expected_input):
            fail(f"trace input is not the Graph-assembled payload: {node_id}")
        if 'failure' in entry and (index != len(trace) - 1 or not rejection or 'output' in entry):
            fail(f'failure entry must be the final entry without output: {node_id}')
        if 'failure' not in entry and 'output' not in entry:
            fail(f'trace entry has neither output nor failure: {node_id}')
        if entry.get('failure', {}).get('code') != 'PRECONDITION_FAILED':
            validate_preconditions(unit, entry['input'])
        if 'failure' not in entry:
            Draft202012Validator(schemas[unit['input']['schemaRef']], registry=registry, format_checker=FormatChecker()).validate(entry['input'])
            Draft202012Validator(schemas[unit['output']['schemaRef']], registry=registry, format_checker=FormatChecker()).validate(entry['output'])
        expected_evidence = {}
        for edge in graph["edges"]:
            if edge["kind"] != "evidence" or edge["to"]["node"] != node_id:
                continue
            source_node = edge["from"]["node"]
            if source_node not in outputs:
                continue
            value = pointer_get(outputs[source_node], edge["from"]["pointer"])
            if value is MISSING:
                fail(f"trace evidence source value missing: {source_node}->{node_id}")
            bucket = expected_evidence.setdefault(edge["to"]["slot"], [])
            bucket.extend(value if isinstance(value, list) else [value])
        if not json_value_equal(entry.get("evidence", {}), expected_evidence):
            fail(f"trace evidence is not the Graph-assembled payload: {node_id}")
        if 'output' in entry:
            status = None
            output_status = entry['output'].get('status') if isinstance(entry['output'], dict) else None
            if unit['role'] == 'recognizer' and output_status in ('unknown', 'ambiguous', 'conflict', 'out_of_scope'):
                status = output_status.upper()
            elif unit['role'] == 'decision' and entry['input'].get('recognition', {}).get('status') in ('unknown', 'ambiguous', 'conflict'):
                status = entry['input']['recognition']['status'].upper()
            elif unit['role'] in ('procedure', 'validator') and output_status in ('NEEDS_INPUT', 'NEEDS_REVIEW'):
                status = output_status
            terminated = check_action(unit, status, node_id, index) if status else False
            if not terminated and node_id in graph['terminalNodes'] and output_status in ('NEEDS_INPUT', 'NEEDS_REVIEW'):
                workflow = next((candidate for candidate in units_by_id.values() if candidate.get('role') == 'workflow' and candidate.get('implementation', {}).get('ref') == 'graph:' + graph['id'] + '@' + graph['revision']), None)
                if not workflow:
                    fail('missing Workflow policy for terminal status')
                check_action(workflow, output_status, node_id, index)
        outputs[node_id] = entry.get("output")
        is_terminal = node_id in graph["terminalNodes"]
        if index < len(trace) - 1:
            if is_terminal:
                fail(f"trace continued after terminal Node: {node_id}")
            matches = [
                edge for edge in graph["edges"]
                if edge["kind"] == "control"
                and edge["from"] == node_id
                and condition_matches(entry.get("output"), edge.get("when"))
            ]
            if len(matches) != 1 or matches[0]["to"] != trace[index + 1].get("nodeId"):
                fail(f"trace does not follow exactly one selected control Edge: {node_id}")
        elif not is_terminal and not rejection:
            fail(f"trace ended before a terminal Node: {node_id}")
    if not rejection and not json_value_equal(result.get("outcome"), trace[-1].get("output")):
        fail(f"terminal outcome differs from final trace output: {result.get('label')}")
    if not rejection and expected_outcome and trace[-1]['output'].get('status') != expected_outcome:
        fail('terminal output contradicts failure policies')
    if rejection:
        final = trace[-1]
        policy = result.get('failurePolicy')
        if not isinstance(policy, dict) or set(policy) != {'unitId', 'nodeId', 'status', 'action'} or policy['nodeId'] != final['nodeId']:
            fail('rejection policy attribution is missing or malformed')
        unit = units_by_id.get(policy['unitId'])
        if not unit or policy['action'] not in ('REJECT', 'FAIL') or unit.get('failure', {}).get('handling', {}).get(policy['status'], {}).get('action') != policy['action']:
            fail('rejected trace is not justified by the declared Unit policy')
        if unit['role'] == 'workflow':
            if final['nodeId'] not in graph['terminalNodes'] or unit.get('implementation', {}).get('ref') != 'graph:' + graph['id'] + '@' + graph['revision']:
                fail('workflow rejection not bound to terminal graph')
        elif unit['id'] != final['unitId']:
            fail('rejection policy Unit does not match the executing Node')
        code = result.get('errorCode')
        if code in ('FAILURE_POLICY_REJECT', 'FAILURE_POLICY_FAIL'):
            if code != 'FAILURE_POLICY_' + policy['action']:
                fail('failure policy action and rejection code disagree')
            if unit['role'] == 'decision':
                status = final.get('input', {}).get('recognition', {}).get('status', '').upper()
            else:
                status = final.get('output', {}).get('status', '').upper()
            if status != policy['status']:
                fail('failure policy status does not match actual trace')
        elif code == 'PRECONDITION_FAILED':
            if final.get('failure', {}).get('code') != code or policy['status'] != 'INVALID_INPUT' or unit['id'] != final['unitId']:
                fail('precondition rejection policy or trace mismatch')
            expect_rejection(lambda: validate_preconditions(unit, final['input']), 'precondition unexpectedly passes')
        elif code == 'INVALID_INPUT':
            if unit.get('role') != 'recognizer':
                fail('handler input rejection cannot be independently justified for this Unit role')
            url = final['input'].get('url', '')
            payload = final['input']
            valid_url = reference_uri_protocol(url) is not None
            valid_signals = isinstance(payload.get('signals'), list) and all(isinstance(item, str) for item in payload['signals'])
            valid_claims = 'claims' not in payload or (isinstance(payload['claims'], list) and all(isinstance(item, dict) and isinstance(item.get('sourceId'), str) and bool(item['sourceId']) and isinstance(item.get('playerId'), str) and bool(item['playerId']) for item in payload['claims']))
            valid_flags = all(name not in payload or type(payload[name]) is bool for name in ('encryptedPlayer', 'unsupportedPlayerFamily'))
            if final.get('failure', {}).get('code') != code or policy['status'] != 'INVALID_INPUT' or unit['id'] != final['unitId'] or (valid_url and valid_signals and valid_claims and valid_flags):
                fail('handler input rejection not independently justified')
        else:
            fail('unsupported rejection outcome')




FAILURE_STATUSES = {
    "UNKNOWN", "AMBIGUOUS", "CONFLICT", "OUT_OF_SCOPE", "INVALID_INPUT",
    "PARTIAL", "FAILED", "NEEDS_INPUT", "NEEDS_REVIEW",
}
HANDLING_ACTIONS = {
    "REJECT", "PRESERVE_UNKNOWN", "CLARIFY", "WAIT", "REVIEW",
    "BOUNDED_FALLBACK", "BOUNDED_RETRY", "ESCALATE", "RETURN_PARTIAL", "FAIL",
}


def validate_preconditions(unit: dict, payload):
    profile = unit.get("preconditions")
    if not profile:
        return
    if profile.get("inputSchemaRef") != unit.get("input", {}).get("schemaRef"):
        fail(f"precondition input Schema mismatch: {unit['id']}")
    for condition in profile.get("all", []):
        actual = pointer_get(payload, condition["path"])
        operator = condition["operator"]
        if operator == "exists":
            matched = actual is not MISSING
        elif operator == "equals":
            matched = actual is not MISSING and json_value_equal(actual, condition["value"])
        elif operator == "notEquals":
            matched = actual is MISSING or not json_value_equal(actual, condition["value"])
        else:
            fail(f"unsupported precondition operator: {operator}")
        if not matched:
            fail(f"precondition failed: {unit['id']}:{condition['path']}")


def validate_capability_contracts(units_by_id: dict, resources: dict | None = None):
    providers = []
    for unit in units_by_id.values():
        for contract in unit.get("capabilities", {}).get("provides", []):
            providers.append((unit, contract))
    for unit in units_by_id.values():
        for requirement in unit.get("capabilities", {}).get("requires", []):
            candidates = [contract for _provider, contract in providers
                          if contract.get("capabilityId") == requirement.get("capabilityId")]
            if not candidates:
                fail(f"missing Capability provider: {requirement['capabilityId']}")
            if len(candidates) != 1:
                fail(f"ambiguous Capability provider: {requirement['capabilityId']}")
            provider = candidates[0]
            contract_payload = {
                key: provider.get(key) for key in (
                    "capabilityId", "owner", "authorityRef", "version",
                    "inputSchemaRef", "inputSchemaDigest", "outputSchemaRef", "outputSchemaDigest",
                )
            }
            contract_digest = sha256(json.dumps(contract_payload, sort_keys=True, separators=(",", ":")).encode("utf-8"))
            if provider.get("contractDigest") != contract_digest:
                fail(f"Capability Contract digest is not canonical: {requirement['capabilityId']}")
            if resources is not None and (resources.get(provider.get("inputSchemaRef")) != provider.get("inputSchemaDigest") or resources.get(provider.get("outputSchemaRef")) != provider.get("outputSchemaDigest")):
                fail(f"Capability Schema digest mismatch: {requirement['capabilityId']}")
            same_identity = all(
                provider.get(key) == requirement.get(key)
                for key in ("owner", "authorityRef", "inputSchemaRef", "inputSchemaDigest",
                            "outputSchemaRef", "outputSchemaDigest")
            )
            compatibility = requirement.get("compatibility", {})
            accepted = compatibility.get("accepted", [])
            accepted_match = any(
                item.get("version") == provider.get("version")
                and item.get("contractDigest") == provider.get("contractDigest")
                for item in accepted
            )
            if compatibility.get("policy") == "EXACT":
                compatible = (
                    len(accepted) == 1
                    and accepted[0].get("version") == requirement.get("version")
                    and accepted[0].get("contractDigest") == requirement.get("contractDigest")
                    and provider.get("version") == requirement.get("version")
                    and provider.get("contractDigest") == requirement.get("contractDigest")
                    and accepted_match
                )
            elif compatibility.get("policy") == "EXPLICIT_ALLOWLIST":
                compatible = accepted_match
            else:
                compatible = False
            if not same_identity or not compatible:
                fail(f"incompatible Capability provider: {requirement['capabilityId']}")


def resolve_provider_selection(unit: dict, selection_lock: dict, target: str, resources: dict):
    capability = (unit.get("capabilities", {}).get("provides") or [{}])[0]
    matches = [
        item for item in selection_lock.get("selectedCapabilities", [])
        if item.get("capabilityId") == capability.get("capabilityId")
        and item.get("provider", {}).get("unitId") == unit.get("id")
    ]
    if not matches:
        fail(f"missing Package provider selection: {unit['id']}")
    if len(matches) != 1:
        fail(f"ambiguous Package provider selection: {unit['id']}")
    lock = matches[0]
    provider = lock.get("provider", {})
    candidates = unit.get("implementation", {}).get("candidates", [])
    found = [candidate for candidate in candidates if candidate.get("candidateId") == provider.get("candidateId")]
    if not found:
        fail(f"missing implementation provider: {provider.get('candidateId')}")
    if len(found) != 1:
        fail(f"ambiguous implementation provider: {provider.get('candidateId')}")
    candidate = found[0]
    if target != provider.get("target") or candidate.get("target") != target:
        fail(f"incompatible provider target: {provider.get('candidateId')}")
    if candidate.get("contractDigest") != lock.get("contractDigest") or provider.get("contractDigest") != candidate.get("contractDigest"):
        fail(f"incompatible provider contract: {provider.get('candidateId')}")
    if provider.get("unitRevision") != unit.get("revision"):
        fail(f"Package provider Unit revision mismatch: {provider.get('candidateId')}")
    for field in ("implementationRef", "artifactRef", "artifactDigest"):
        candidate_field = {"implementationRef": "ref", "artifactRef": "artifactRef", "artifactDigest": "artifactDigest"}[field]
        if provider.get(field) != candidate.get(candidate_field):
            fail(f"Package provider pin mismatch: {provider.get('candidateId')}:{field}")
    implementation = unit.get("implementation", {})
    if any(implementation.get(field) != candidate.get(field) for field in ("strategy", "exposure")):
        fail(f"Unit provider binding mismatch: {provider.get('candidateId')}")
    if resources.get(candidate.get("artifactRef")) != candidate.get("artifactDigest"):
        fail(f"provider artifact digest mismatch: {candidate.get('artifactRef')}")
    return candidate


def lifecycle_record_digest(record: dict) -> str:
    payload = {key: value for key, value in record.items() if key != "recordDigest"}
    return sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))


def validate_selected_graph(selection_lock: dict, graph_ref: dict, graph: dict, resources: dict, loaded_digest: str):
    selected = [asset for asset in selection_lock.get('selectedAssets', []) if asset.get('kind') == 'graph']
    if len(selected) != 1:
        fail('expected exactly one selected Graph')
    asset = selected[0]
    if (asset.get('id') != graph_ref.get('id') or asset.get('revision') != graph_ref.get('revision')
            or asset.get('path') != graph_ref.get('path') or asset.get('id') != graph.get('id')
            or asset.get('revision') != graph.get('revision') or graph_ref.get('path') not in resources
            or asset.get('sha256') != resources[graph_ref['path']] or asset.get('sha256') != loaded_digest):
        fail('selected Graph does not match loaded manifest Graph')


def validate_reference_feedback(feedback: dict, expected_lock_sha256: str):
    if (not isinstance(feedback, dict) or not feedback.get('traceId') or not re.fullmatch(r'[a-f0-9]{64}', expected_lock_sha256 or '') or feedback.get('packageLockSha256') != expected_lock_sha256 or
        feedback.get('provenance') not in ('SYSTEM_OBSERVED', 'USER_CONFIRMED', 'MODEL_INFERRED') or feedback.get('claimedProvenance') != feedback.get('provenance') or
        not feedback.get('finding') or feedback.get('disposition') != 'PROPOSAL_ONLY'):
        fail('invalid Runtime feedback envelope')
    return copy.deepcopy(feedback)


def replay_lifecycle(records: list, resources: dict, closure_digest: str, historical_closures=None, binary_bindings=None):
    histories, ids, revisions, latest_promoted = {}, set(), {}, {}
    historical_closures = historical_closures or {}
    binary_bindings = binary_bindings or set()
    transitions = {
        None: {'OBSERVED', 'CANDIDATE'},
        'OBSERVED': {'OBSERVED', 'CANDIDATE'},
        'CANDIDATE': {'VALIDATED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED'},
        'VALIDATED': {'VALIDATED', 'PROMOTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED'},
        'PROMOTED': {'VALIDATED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED'},
    }
    for record in records:
        subject = record.get('subject', {})
        key = tuple(subject.get(k) for k in ('kind', 'id', 'revision', 'sha256'))
        logical_key, revision_key = key[:2], key[:3]
        state = histories.setdefault(key, {'state': None, 'previous': None, 'candidate': None, 'validated': None, 'promoted': None, 'last_promoted': None})
        actor = record.get('actor', {})
        policy = record.get('policy') or record.get('promotion', {}).get('policy', {})
        record_id = record.get('recordId')
        record_closure = record.get('dependencyClosureDigest')
        evidence_resources = resources if record_closure == closure_digest else historical_closures.get(record_closure)
        def evidence_ok(refs):
            return isinstance(refs, list) and bool(refs) and all(isinstance(ref, dict) and ref.get('path') in evidence_resources and evidence_resources[ref['path']] == ref.get('sha256') for ref in refs)
        if not record_id or record_id in ids or key[0] not in ('unit', 'knowledge', 'rule', 'graph', 'package') or not key[1] or not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', key[2] or '') or not re.fullmatch(r'[a-f0-9]{64}', key[3] or '') or evidence_resources is None or evidence_resources.get(safe_relative(record.get('subjectPath', ''))) != key[3]:
            fail('invalid lifecycle exact subject or duplicate record')
        subject_json, subject_base64 = record.get('subjectJson'), record.get('subjectBase64')
        has_json, has_bytes = 'subjectJson' in record, 'subjectBase64' in record
        if has_json == has_bytes or (has_json and not isinstance(subject_json, str)) or (has_bytes and not isinstance(subject_base64, str)):
            fail('subject requires exactly one byte representation')
        subject_document = None
        if has_json:
            if sha256(subject_json.encode('utf-8')) != key[3]:
                fail('lifecycle subject bytes mismatch')
            try:
                subject_document = json.loads(subject_json)
            except (json.JSONDecodeError, TypeError):
                fail('invalid lifecycle subject JSON')
            if not isinstance(subject_document, dict):
                fail('invalid lifecycle subject document')
            content_id = subject_document.get('catalogId') if key[0] == 'rule' else subject_document.get('dis', {}).get('packageId') if key[0] == 'package' and isinstance(subject_document.get('dis'), dict) else subject_document.get('id')
            content_revision = subject_document.get('dis', {}).get('revision') if key[0] == 'package' and isinstance(subject_document.get('dis'), dict) else subject_document.get('revision')
            if content_id != key[1] or content_revision != key[2]:
                fail('lifecycle subject identity does not match bytes')
        else:
            try:
                subject_bytes = base64.b64decode(subject_base64, validate=True)
                binary_key = key + (record['subjectPath'], record_closure)
                if key[0] == 'unit' or binary_key not in binary_bindings or base64.b64encode(subject_bytes).decode('ascii') != subject_base64 or sha256(subject_bytes) != key[3]:
                    fail('invalid lifecycle subject bytes')
            except (ValueError, binascii.Error):
                fail('invalid lifecycle subject bytes')
        if revision_key in revisions and revisions[revision_key] != key[3]:
            fail('same lifecycle revision has conflicting subject digests')
        revisions[revision_key] = key[3]
        if lifecycle_record_digest(record) != record.get('recordDigest'):
            fail('lifecycle record digest mismatch')
        if not actor.get('id') or not actor.get('role') or not policy.get('id') or not policy.get('revision') or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ', record.get('recordedAt', '')):
            fail('lifecycle actor, policy or timestamp missing')
        try:
            stamp = datetime.fromisoformat(record['recordedAt'].replace('Z', '+00:00'))
            previous_stamp = datetime.fromisoformat(state['previous']['recordedAt'].replace('Z', '+00:00')) if state['previous'] else None
            if stamp.tzinfo is None or (previous_stamp and stamp < previous_stamp):
                fail('invalid lifecycle timestamp order')
        except (ValueError, TypeError):
            fail('invalid lifecycle timestamp')
        previous = state['previous'] or {}
        if record.get('previousRecordId') != previous.get('recordId') or record.get('previousRecordDigest') != previous.get('recordDigest'):
            fail('invalid lifecycle previous record')
        transition = record.get('transition')
        if transition not in transitions.get(state['state'], set()):
            fail('illegal lifecycle transition')
        if transition == 'OBSERVED':
            if actor.get('id') != 'xdownload-demo-observer' or actor.get('role') != 'observation-source' or actor.get('authorityRef') != 'xdownload-demo/domain-authority@1.0.0' or policy != {'id':'xdownload-demo/observation-policy', 'revision':'1.0.0'} or not evidence_ok(record.get('evidenceRefs')) or record.get('provenance') not in ('SYSTEM_OBSERVED', 'USER_CONFIRMED', 'MODEL_INFERRED'):
                fail('invalid observation provenance, authority or evidence')
        elif transition == 'CANDIDATE':
            if actor.get('id') != 'xdownload-domain-forge-reference' or actor.get('role') != 'candidate-producer' or actor.get('authorityRef') != 'xdownload-demo/domain-authority@1.0.0' or policy != {'id':'xdownload-demo/candidate-policy', 'revision':'1.0.0'} or not evidence_ok(record.get('evidenceRefs')):
                fail('invalid candidate authority or evidence')
            state['candidate'] = record
        elif transition == 'VALIDATED':
            val = record.get('validation', {})
            if actor.get('id') != 'xdownload-dis-independent-conformance' or actor.get('role') != 'validator' or actor.get('authorityRef') != 'xdownload-demo/domain-authority@1.0.0' or actor.get('id') != val.get('validator', {}).get('id') or policy != {'id':'xdownload-demo/validation-profile', 'revision':'0.1.0'} or val.get('result') != 'PASS' or val.get('subjectDigest') != key[3] or val.get('dependencyClosureDigest') != record_closure or not val.get('profile', {}).get('id') or not val['profile'].get('revision') or not val.get('validator', {}).get('version') or not evidence_ok(val.get('evidenceRefs')):
                fail('invalid lifecycle validation')
            if key[0] == 'unit' and (val['profile'] != {'id':subject_document.get('validation', {}).get('profile'), 'revision':subject_document.get('validation', {}).get('profileRevision')} or val['validator'] != subject_document.get('validation', {}).get('validator')):
                fail('validation profile does not match exact subject')
            report = val.get('report')
            if not isinstance(report, dict) or val.get('reportSchema') != 'https://kaicreator-mm.github.io/domain-harness/dis/0.1.0/validation-report.schema.json' or sha256(json.dumps(report, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')) != val.get('reportSha256'):
                fail('invalid validation report identity or digest')
            Draft202012Validator(read_json(STANDARD_SCHEMA_DIR / 'validation-report.schema.json'), format_checker=FormatChecker()).validate(report)
            scenario_ids = {item['id'] for item in report.get('scenarios', [])}
            tests_by_id = {item['id']: item['result'] for item in report.get('tests', [])}
            coverage = report.get('coverage', {})
            scenarios = report.get('scenarios', [])
            if (len(scenario_ids) != len(scenarios) or len(tests_by_id) != len(report.get('tests', [])) or set(tests_by_id) != scenario_ids or
                any(item['result'] != 'PASS' or tests_by_id[item['id']] != item['result'] for item in scenarios) or
                coverage.get('positive') != sum(item['category'] == 'positive' for item in scenarios) or
                coverage.get('negative') != sum(item['category'] in ('negative', 'ambiguous', 'out_of_scope') for item in scenarios) or
                coverage.get('boundary') != sum(item['category'] == 'boundary' for item in scenarios) or
                coverage.get('heldOut') != sum(item['dataset'] == 'HELD_OUT' for item in scenarios)):
                fail('validation report scenarios, tests and coverage disagree')
            if (not report.get('scenarios') or 'counterexamples' not in report or not report.get('limitations') or not report.get('tests') or report.get('result') != 'PASS' or
                not report.get('standard', {}).get('revision') or not report.get('demo', {}).get('id') or not report.get('demo', {}).get('revision') or not report.get('environment', {}).get('runtime') or not report.get('environment', {}).get('platform') or not report.get('command') or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ', report.get('validatedAt', '')) or any(not item.get('id') for item in report['tests']) or
                not json_value_equal(report.get('subject'), subject) or report.get('dependencyClosure', {}).get('sha256') != record_closure or not json_value_equal(report.get('dependencyClosure', {}).get('resources'), val['evidenceRefs']) or
                any(not json_value_equal(report.get(name), val.get(name)) for name in ('profile', 'validator', 'baseline', 'coverage'))):
                fail('validation report does not bind the exact subject, closure, evidence and profile')
            state['validated'], state['promoted'] = record, None
        elif transition == 'PROMOTED':
            promotion = record.get('promotion', {})
            if actor.get('id') != 'xdownload-demo-governance' or actor.get('role') != 'promotion-authority' or actor.get('authorityRef') != 'xdownload-demo/domain-authority@1.0.0' or policy != {'id':'xdownload-demo/promotion-policy', 'revision':'1.0.0'} or policy != promotion.get('policy') or actor['id'] in (state['candidate']['actor']['id'], state['validated']['actor']['id']) or promotion.get('decision') != 'PROMOTE' or promotion.get('validationRecordId') != state['validated']['recordId'] or promotion.get('validationRecordDigest') != state['validated']['recordDigest']:
                fail('unauthorized promotion')
            grant, baseline = promotion.get('authorizationEvidence', {}), promotion.get('priorPromotedBaseline', {})
            if (grant != {'id':'synthetic-reference-governance-grant', 'issuer':'xdownload-demo', 'subject':actor['id'], 'authorityRef':actor['authorityRef'], 'scope':'REFERENCE_DEMO_ONLY', 'outcome':'AUTHORIZED'} or
                sha256(json.dumps(grant, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')) != promotion.get('authorizationEvidenceSha256')):
                fail('missing or invalid synthetic reference authorization evidence')
            prior = latest_promoted.get(logical_key)
            if promotion.get('scope') != grant.get('scope') or not isinstance(promotion.get('rationale'), str) or not promotion['rationale'] or not isinstance(promotion.get('limitations'), list) or not promotion['limitations'] or any(not isinstance(item, str) or not item for item in promotion['limitations']) or record_closure != state['validated']['dependencyClosureDigest']:
                fail('promotion scope, rationale, limitations or closure mismatch')
            if (prior and (baseline.get('kind') != 'PROMOTED' or baseline.get('recordId') != prior['recordId'] or baseline.get('recordDigest') != prior['recordDigest'])) or (not prior and (baseline.get('kind') != 'GENESIS' or not baseline.get('reason'))):
                fail('promotion prior baseline mismatch')
            state['promoted'] = record
            state['last_promoted'] = record
            latest_promoted[logical_key] = record
        else:
            if actor.get('id') != 'xdownload-demo-governance' or actor.get('role') != 'promotion-authority' or actor.get('authorityRef') != 'xdownload-demo/domain-authority@1.0.0' or policy != {'id':'xdownload-demo/promotion-policy', 'revision':'1.0.0'} or record.get('decision') != transition or not evidence_ok(record.get('evidenceRefs')):
                fail('invalid lifecycle disposition')
            if transition == 'SUPERSEDED':
                successor = record.get('successor', {})
                next_subject = successor.get('subject', {})
                next_key = tuple(next_subject.get(k) for k in ('kind', 'id', 'revision', 'sha256'))
                next_history = histories.get(next_key, {})
                next_promotion = next_history.get('promoted') or {}
                if next_key[:2] != key[:2] or next_key[2] == key[2] or next_history.get('state') != 'PROMOTED' or successor.get('promotionRecordId') != next_promotion.get('recordId') or successor.get('promotionRecordDigest') != next_promotion.get('recordDigest'):
                    fail('supersession lacks a promoted exact successor')
            state['promoted'] = None
        state['state'], state['previous'] = transition, record
        ids.add(record_id)
    return histories


def validate_lifecycle_records(package_identity: dict, units_by_id: dict, unit_paths: dict, resources: dict, closure_digest: str, expected_selection_lock_sha256: str):
    records = package_identity.get("lifecycleRecords")
    selection = package_identity.get("selectionLock")
    if not isinstance(records, list) or len(records) < 3 or not isinstance(selection, dict):
        fail("missing lifecycle records or Package selection lock")
    if (
        selection.get("packageId") != package_identity.get("packageId")
        or selection.get("packageRevision") != package_identity.get("revision")
        or selection.get("standardVersion") != package_identity.get("standardVersion")
    ):
        fail("Package selection identity mismatch")
    if not selection.get("consumerProfile", {}).get("id") or not selection.get("consumerProfile", {}).get("revision"):
        fail("Package selection Consumer Profile missing")
    if not selection.get("target") or not isinstance(selection.get("selectedAssets"), list) or not isinstance(selection.get("selectedCapabilities"), list):
        fail("invalid Package selection lock")
    if len(selection["selectedCapabilities"]) != 1 or len(selection["selectedAssets"]) != len(units_by_id) + 2:
        fail("Package selection cardinality is invalid")
    selection_digest = sha256(json.dumps(selection, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode('utf-8'))
    if not re.fullmatch(r'[a-f0-9]{64}', expected_selection_lock_sha256 or '') or selection_digest != expected_selection_lock_sha256 or selection_digest != package_identity.get('selectionLockSha256'):
        fail('Package selection lock digest mismatch')
    historical_closures = {}
    if not isinstance(selection.get('historicalClosures', []), list):
        fail('invalid historical Resource Closure list')
    for history in selection.get('historicalClosures', []):
        raw, digest = history.get('manifestJson'), history.get('sha256')
        if not isinstance(raw, str) or not re.fullmatch(r'[a-f0-9]{64}', digest or '') or sha256(raw.encode('utf-8')) != digest or digest == closure_digest or digest in historical_closures:
            fail('invalid historical Resource Closure digest')
        try:
            manifest = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            fail('invalid historical Resource Closure JSON')
        if manifest.get('schemaVersion') != 'dis.resource-closure/0.1.0' or manifest.get('standardVersion') != '0.1.0' or not isinstance(manifest.get('resources'), list):
            fail('invalid historical Resource Closure metadata')
        entries, declared = {}, set()
        supplied = history.get('resourceBase64', {})
        if not isinstance(supplied, dict):
            fail('invalid historical resource content map')
        for item in manifest['resources']:
            relative = safe_relative(item.get('path', ''))
            if relative in declared or not re.fullmatch(r'[a-f0-9]{64}', item.get('sha256', '')):
                fail('invalid historical Resource Closure entry')
            declared.add(relative)
            if relative in supplied:
                try:
                    encoded = supplied[relative]
                    if not isinstance(encoded, str):
                        fail('invalid historical resource encoding')
                    content = base64.b64decode(encoded, validate=True)
                    if base64.b64encode(content).decode('ascii') != encoded or sha256(content) != item['sha256']:
                        fail('historical resource content digest mismatch')
                except (ValueError, binascii.Error):
                    fail('invalid historical resource encoding')
            if resources.get(relative) == item['sha256'] or relative in supplied:
                entries[relative] = item['sha256']
        if set(supplied) - declared or len(entries) != len(declared):
            fail('historical resource content is not in the manifest')
        historical_closures[digest] = entries
    binary_bindings = set()
    bindings = selection.get('subjectBindings', [])
    if not isinstance(bindings, list):
        fail('invalid subject binding list')
    for binding in bindings:
        if not isinstance(binding, dict) or set(binding) != {'kind', 'id', 'revision', 'sha256', 'path', 'closureDigest'}:
            fail('invalid subject binding shape')
        kind, subject_id, revision, digest, path, digest_of_closure = (binding[field] for field in ('kind', 'id', 'revision', 'sha256', 'path', 'closureDigest'))
        source = resources if digest_of_closure == closure_digest else historical_closures.get(digest_of_closure, {})
        key = (kind, subject_id, revision, digest, path, digest_of_closure)
        if kind not in ('knowledge', 'rule', 'graph', 'package') or not subject_id or not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', revision or '') or not re.fullmatch(r'[a-f0-9]{64}', digest or '') or source.get(safe_relative(path)) != digest or key in binary_bindings:
            fail('invalid subject binding')
        binary_bindings.add(key)
    by_id = {}
    for record in records:
        record_id = record.get("recordId")
        transition = record.get("transition")
        if not record_id or record_id in by_id or transition not in {
            "OBSERVED", "CANDIDATE", "VALIDATED", "PROMOTED", "REJECTED", "WITHDRAWN", "EXPIRED", "SUPERSEDED"
        }:
            fail(f"invalid lifecycle record: {record_id}")
        subject = record.get("subject", {})
        if (
            (record.get("dependencyClosureDigest") != closure_digest and record.get('dependencyClosureDigest') not in historical_closures)
            or subject.get("kind") not in ("unit", "knowledge", "rule", "graph", "package")
            or not subject.get("id")
            or not subject.get("revision")
            or not re.fullmatch(r"[a-f0-9]{64}", subject.get("sha256", ""))
        ):
            fail(f"lifecycle subject/closure mismatch: {record_id}")
        if not re.fullmatch(r"[a-f0-9]{64}", record.get("recordDigest", "")) or lifecycle_record_digest(record) != record.get("recordDigest"):
            fail(f"lifecycle record digest mismatch: {record_id}")
        by_id[record_id] = record

    histories = replay_lifecycle(records, resources, closure_digest, historical_closures, binary_bindings)

    unit_asset = next((asset for asset in selection["selectedAssets"]
                       if asset.get("kind") == "unit" and asset.get("id") == "xdownload.player.recognizer"), None)
    if not unit_asset:
        fail("selected Recognizer Unit missing from Package lock")
    unit = units_by_id.get(unit_asset["id"])
    unit_path = unit_paths.get(unit_asset["id"])
    if not unit or unit.get("revision") != unit_asset.get("revision") or resources.get(unit_path) != unit_asset.get("sha256"):
        fail("selected Unit digest/revision mismatch")
    if (
        selection["consumerProfile"].get("id") != unit.get("implementation", {}).get("selectionPolicy", {}).get("consumerProfileId")
        or selection["consumerProfile"].get("revision") != unit.get("implementation", {}).get("selectionPolicy", {}).get("consumerProfileRevision")
        or selection.get("target") != unit.get("implementation", {}).get("selectionPolicy", {}).get("target")
    ):
        fail("Package Consumer Profile/target mismatch")
    unit_history = histories.get(tuple(unit_asset.get(k) for k in ('kind', 'id', 'revision', 'sha256')), {})
    candidate = unit_history.get('candidate')
    validated = unit_history.get('validated')
    promoted = unit_history.get('promoted')
    if (
        not candidate or not validated or not promoted or unit_history.get('state') != 'PROMOTED'
    ):
        fail("incomplete Candidate → Validation → Promotion lifecycle chain")
    if (
        not candidate.get("actor", {}).get("id")
        or not candidate.get("actor", {}).get("role")
        or not candidate.get("policy", {}).get("id")
        or not candidate.get("policy", {}).get("revision")
        or not validated.get("actor", {}).get("id")
        or not validated.get("actor", {}).get("role")
    ):
        fail("Candidate/Validation actor or policy identity missing")
    if not candidate.get("evidenceRefs"):
        fail("Candidate evidence is missing")
    candidate_resources = resources if candidate['dependencyClosureDigest'] == closure_digest else historical_closures.get(candidate['dependencyClosureDigest'], {})
    for evidence in candidate.get("evidenceRefs", []):
        if candidate_resources.get(evidence.get("path")) != evidence.get("sha256"):
            fail(f"Candidate evidence digest mismatch: {evidence.get('path')}")
    validation = validated.get("validation", {})
    if (
        validation.get("result") != "PASS"
        or validation.get("subjectDigest") != unit_asset["sha256"]
        or validation.get("dependencyClosureDigest") != closure_digest
        or not validation.get("profile", {}).get("id")
        or not validation.get("profile", {}).get("revision")
        or not validation.get("validator", {}).get("id")
        or not validation.get("validator", {}).get("version")
        or not validation.get("baseline", {}).get("id")
        or not validation.get("baseline", {}).get("path")
        or not validation.get("baseline", {}).get("sha256")
        or not validation.get("evidenceRefs")
    ):
        fail("lifecycle Validation record is incomplete or stale")
    baseline = validation["baseline"]
    if resources.get(baseline["path"]) != baseline["sha256"] or not any(
        item.get("path") == baseline["path"] and item.get("sha256") == baseline["sha256"]
        for item in validation["evidenceRefs"]
    ):
        fail("Validation baseline pin mismatch")
    coverage = validation.get("coverage", {})
    if any(type(coverage.get(key)) is not int or coverage[key] < (0 if key == 'heldOut' else 1) for key in ("positive", "negative", "boundary", "heldOut")):
        fail("lifecycle Validation coverage is invalid")
    for evidence in validation["evidenceRefs"]:
        if resources.get(evidence.get("path")) != evidence.get("sha256"):
            fail(f"lifecycle evidence digest mismatch: {evidence.get('path')}")
    promotion = promoted.get("promotion", {})
    actor = promoted.get("actor", {})
    if (
        promotion.get("decision") != "PROMOTE"
        or promotion.get("validationRecordId") != validated.get("recordId")
        or promotion.get("validationRecordDigest") != validated.get("recordDigest")
        or not actor.get("id")
        or not actor.get("authorityRef")
        or not promotion.get("policy", {}).get("id")
        or not promotion.get("policy", {}).get("revision")
    ):
        fail("Promotion Decision is missing explicit authority/evidence")
    if actor.get('id') != 'xdownload-demo-governance' or actor.get('role') != 'promotion-authority' or actor.get('authorityRef') != 'xdownload-demo/domain-authority@1.0.0' or actor.get('id') in (candidate.get('actor', {}).get('id'), validated.get('actor', {}).get('id')):
        fail('unauthorized or self-issued Promotion Decision')
    for path in ('test/runner.test.mjs', 'scripts/validate.py', 'src/runner.mjs'):
        if not any(item.get('path') == path and item.get('sha256') == resources.get(path) for item in validation['evidenceRefs']):
            fail('Validation evidence is incomplete')
    if validation['profile'] != {'id': unit['validation']['profile'], 'revision': unit['validation']['profileRevision']} or validation['validator'] != unit['validation']['validator']:
        fail('Validation profile or validator mismatch')
    if (
        unit_asset.get("promotionRecordId") != promoted.get("recordId")
        or unit_asset.get("promotionRecordDigest") != promoted.get("recordDigest")
        or unit_asset.get("validationRecordId") != validated.get("recordId")
        or unit_asset.get("validationRecordDigest") != validated.get("recordDigest")
    ):
        fail("Package lock Promotion/Validation pin mismatch")
    selected_capabilities = [
        item for item in selection["selectedCapabilities"]
        if item.get("capabilityId") == unit.get("capabilities", {}).get("provides", [{}])[0].get("capabilityId")
        and item.get("provider", {}).get("unitId") == unit["id"]
    ]
    if len(selected_capabilities) != 1:
        fail("selected Capability provider is missing or ambiguous")
    capability_lock = selected_capabilities[0]
    if (
        capability_lock.get("promotionRecordId") != promoted.get("recordId")
        or capability_lock.get("promotionRecordDigest") != promoted.get("recordDigest")
        or capability_lock.get("validationRecordId") != validated.get("recordId")
        or capability_lock.get("validationRecordDigest") != validated.get("recordDigest")
    ):
        fail("selected Capability Promotion/Validation pin mismatch")
    provided_contract = (unit.get("capabilities", {}).get("provides") or [{}])[0]
    if any(capability_lock.get(key) != provided_contract.get(key) for key in ("owner", "authorityRef", "version", "contractDigest")):
        fail("selected Capability Contract pin mismatch")
    resolve_provider_selection(unit, selection, selection.get("target"), resources)

    selected_rule_assets = [asset for asset in selection["selectedAssets"] if asset.get("kind") == "rule"]
    if len(selected_rule_assets) != 1:
        fail("selected Knowledge asset is missing or ambiguous")
    for asset in selection["selectedAssets"]:
        if asset.get("kind") == "rule":
            if not any(
                ref.get("id") == asset.get("id") and ref.get("revision") == asset.get("revision")
                and ref.get("path") == asset.get("path") and ref.get("sha256") == asset.get("sha256")
                for ref in unit.get("knowledgeRefs", [])
            ):
                fail(f"selected Knowledge pin mismatch: {asset.get('id')}")
            if resources.get(asset.get("path")) != asset.get("sha256"):
                fail(f"selected Knowledge is not pinned to promoted subject: {asset.get('id')}")
    asset_keys = set()
    for asset in selection['selectedAssets']:
        key = (asset.get('kind'), asset.get('id'))
        if key in asset_keys:
            fail('duplicate selected asset')
        asset_keys.add(key)
        selected_unit = units_by_id.get(asset['id']) if asset['kind'] == 'unit' else None
        asset_path = unit_paths.get(asset['id']) if selected_unit else asset.get('path')
        if not asset_path or resources.get(asset_path) != asset.get('sha256') or (asset['kind'] == 'unit' and (not selected_unit or selected_unit['revision'] != asset.get('revision'))):
            fail('selected asset digest mismatch')
        history = histories.get(tuple(asset.get(k) for k in ('kind', 'id', 'revision', 'sha256')), {})
        c, v, p = history.get('candidate'), history.get('validated'), history.get('promoted')
        if history.get('state') != 'PROMOTED' or not c or not v or not p:
            fail('incomplete asset lifecycle chain')
        candidate_resources = resources if c['dependencyClosureDigest'] == closure_digest else historical_closures.get(c['dependencyClosureDigest'], {})
        if not c.get('actor', {}).get('id') or c['actor'].get('role') != 'candidate-producer' or not c['actor'].get('authorityRef') or not c.get('policy', {}).get('id') or not c['policy'].get('revision') or not isinstance(c.get('evidenceRefs'), list) or not c['evidenceRefs'] or any(candidate_resources.get(item.get('path')) != item.get('sha256') for item in c['evidenceRefs']) or not v.get('actor', {}).get('id') or v['actor'].get('role') != 'validator':
            fail('invalid Candidate or Validation actor/policy/evidence')
        pa = p.get('actor', {})
        if pa.get('id') != 'xdownload-demo-governance' or pa.get('role') != 'promotion-authority' or pa.get('authorityRef') != 'xdownload-demo/domain-authority@1.0.0' or pa.get('id') in (c.get('actor', {}).get('id'), v.get('actor', {}).get('id')) or p.get('promotion', {}).get('decision') != 'PROMOTE' or p['promotion'].get('validationRecordId') != v['recordId'] or p['promotion'].get('validationRecordDigest') != v['recordDigest']:
            fail('unauthorized asset promotion')
        val = v.get('validation', {})
        if val.get('result') != 'PASS' or val.get('subjectDigest') != asset['sha256'] or val.get('dependencyClosureDigest') != closure_digest or not val.get('profile', {}).get('id') or not val.get('profile', {}).get('revision') or not val.get('validator', {}).get('id') or not val.get('validator', {}).get('version'):
            fail('invalid asset validation')
        coverage = val.get('coverage', {})
        if any(type(coverage.get(name)) is not int or coverage[name] < (0 if name == 'heldOut' else 1) for name in ('positive', 'negative', 'boundary', 'heldOut')):
            fail('invalid asset Validation coverage')
        for path in ('test/runner.test.mjs', 'scripts/validate.py', 'src/runner.mjs'):
            if not any(item.get('path') == path and item.get('sha256') == resources.get(path) for item in val.get('evidenceRefs', [])):
                fail('asset Validation evidence incomplete')
        if selected_unit and (val['profile'] != {'id':selected_unit['validation']['profile'], 'revision':selected_unit['validation']['profileRevision']} or val['validator'] != selected_unit['validation']['validator']):
            fail('asset Validation profile mismatch')
        if asset.get('promotionRecordId') != p['recordId'] or asset.get('promotionRecordDigest') != p['recordDigest'] or asset.get('validationRecordId') != v['recordId'] or asset.get('validationRecordDigest') != v['recordDigest']:
            fail('asset lifecycle lock pin mismatch')
    if not all(('unit', unit_id) in asset_keys for unit_id in units_by_id) or ('rule', 'xdownload.player-signatures') not in asset_keys or ('graph', 'xdownload.player-recognition') not in asset_keys:
        fail('Package lock lacks required selected asset')
    selected_graph = next(item for item in selection['selectedAssets'] if item['kind'] == 'graph' and item['id'] == 'xdownload.player-recognition')
    if selected_graph.get('path') != 'domain/player-recognition.graph.json' or selected_graph.get('revision') != '1.0.0':
        fail('selected Graph identity mismatch')
    for capability in selection["selectedCapabilities"]:
        if (
            capability.get("promotionRecordId") != promoted.get("recordId")
            or capability.get("promotionRecordDigest") != promoted.get("recordDigest")
            or capability.get("validationRecordId") != validated.get("recordId")
            or capability.get("validationRecordDigest") != validated.get("recordDigest")
        ):
            fail(f"selected Capability lifecycle pin mismatch: {capability.get('capabilityId')}")
    return True


def expect_rejection(callback, label: str):
    try:
        callback()
    except (SystemExit, ValidationError):
        return
    fail(f"adversarial negative was accepted: {label}")



def validate_capability_negatives(units_by_id: dict, package_identity: dict, resources: dict):
    missing = copy.deepcopy(units_by_id)
    missing["xdownload.player.recognizer"]["capabilities"]["provides"] = []
    expect_rejection(lambda: validate_capability_contracts(missing, resources), "missing Capability provider")

    ambiguous = copy.deepcopy(units_by_id)
    duplicate = copy.deepcopy(ambiguous["xdownload.player.recognizer"])
    duplicate["id"] = "xdownload.player.recognizer.duplicate"
    ambiguous[duplicate["id"]] = duplicate
    expect_rejection(lambda: validate_capability_contracts(ambiguous, resources), "ambiguous Capability provider")

    incompatible = copy.deepcopy(units_by_id)
    incompatible["xdownload.player.route-decision"]["capabilities"]["requires"][0]["compatibility"]["accepted"][0]["contractDigest"] = "0" * 64
    expect_rejection(lambda: validate_capability_contracts(incompatible, resources), "incompatible Capability provider")

    unit = units_by_id["xdownload.player.recognizer"]
    alternate_lock = copy.deepcopy(package_identity['selectionLock'])
    alternate = next(item for item in unit['implementation']['candidates'] if item['candidateId'] == 'signature-normalized-v1')
    alternate_lock['selectedCapabilities'][0]['provider'].update({
        'candidateId': alternate['candidateId'], 'implementationRef': alternate['ref'],
        'artifactRef': alternate['artifactRef'], 'artifactDigest': alternate['artifactDigest'],
    })
    if resolve_provider_selection(unit, alternate_lock, 'node24', resources) != alternate:
        fail('alternate Package provider was not selected exactly')
    no_lock = copy.deepcopy(package_identity["selectionLock"])
    no_lock["selectedCapabilities"] = []
    expect_rejection(lambda: resolve_provider_selection(unit, no_lock, "node24", resources), "missing provider selection")

    duplicate_candidate = copy.deepcopy(unit)
    duplicate_candidate["implementation"]["candidates"][1]["candidateId"] = duplicate_candidate["implementation"]["candidates"][0]["candidateId"]
    expect_rejection(lambda: resolve_provider_selection(duplicate_candidate, package_identity["selectionLock"], "node24", resources), "ambiguous implementation candidate")

    expect_rejection(lambda: resolve_provider_selection(unit, package_identity["selectionLock"], "node22", resources), "incompatible provider target")


def validate_precondition_negatives(unit: dict):
    expect_rejection(lambda: validate_preconditions(unit, {"signals": []}), "missing URL precondition")
    expect_rejection(lambda: validate_preconditions(unit, {"url": "https://example.test"}), "missing signals precondition")


def validate_lifecycle_negatives(package_identity: dict, units_by_id: dict, unit_paths: dict, resources: dict, closure_digest: str):
    missing = copy.deepcopy(package_identity)
    missing["lifecycleRecords"] = [item for item in missing["lifecycleRecords"] if item.get("transition") != "VALIDATED"]
    expect_rejection(lambda: validate_lifecycle_records(missing, units_by_id, unit_paths, resources, closure_digest, package_identity['selectionLockSha256']), "missing validation")

    unauthorized = copy.deepcopy(package_identity)
    next(item for item in unauthorized["lifecycleRecords"] if item.get("transition") == "PROMOTED")["actor"]["authorityRef"] = ""
    expect_rejection(lambda: validate_lifecycle_records(unauthorized, units_by_id, unit_paths, resources, closure_digest, package_identity['selectionLockSha256']), "unauthorized promotion")

    stale = copy.deepcopy(package_identity)
    stale["lifecycleRecords"][0]["dependencyClosureDigest"] = "0" * 64
    expect_rejection(lambda: validate_lifecycle_records(stale, units_by_id, unit_paths, resources, closure_digest, package_identity['selectionLockSha256']), "stale dependency closure")

    unpromoted = copy.deepcopy(package_identity)
    next(item for item in unpromoted["selectionLock"]["selectedAssets"] if item.get("kind") == "unit")["promotionRecordId"] = "missing-promotion"
    expect_rejection(lambda: validate_lifecycle_records(unpromoted, units_by_id, unit_paths, resources, closure_digest, package_identity['selectionLockSha256']), "unpromoted selection")

    self_promote = copy.deepcopy(package_identity)
    promote = next(item for item in self_promote['lifecycleRecords'] if item['transition'] == 'PROMOTED')
    promote['actor']['id'] = next(item for item in self_promote['lifecycleRecords'] if item['transition'] == 'CANDIDATE')['actor']['id']
    promote['recordDigest'] = lifecycle_record_digest(promote)
    expect_rejection(lambda: validate_lifecycle_records(self_promote, units_by_id, unit_paths, resources, closure_digest, package_identity['selectionLockSha256']), 'self-promotion with valid record hash')

    incomplete = copy.deepcopy(package_identity)
    validated = next(item for item in incomplete['lifecycleRecords'] if item['transition'] == 'VALIDATED')
    promoted = next(item for item in incomplete['lifecycleRecords'] if item['transition'] == 'PROMOTED')
    validated['validation']['evidenceRefs'] = [item for item in validated['validation']['evidenceRefs'] if item['path'] == 'fixtures/player-signatures.json']
    validated['recordDigest'] = lifecycle_record_digest(validated)
    promoted['previousRecordDigest'] = validated['recordDigest']
    promoted['promotion']['validationRecordDigest'] = validated['recordDigest']
    promoted['recordDigest'] = lifecycle_record_digest(promoted)
    selected = next(item for item in incomplete['selectionLock']['selectedAssets'] if item['kind'] == 'unit' and item['id'] == validated['subject']['id'])
    for item in (selected, incomplete['selectionLock']['selectedCapabilities'][0]):
        item['validationRecordDigest'] = validated['recordDigest']
        item['promotionRecordDigest'] = promoted['recordDigest']
    incomplete['selectionLockSha256'] = sha256(json.dumps(incomplete['selectionLock'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    expect_rejection(lambda: validate_lifecycle_records(incomplete, units_by_id, unit_paths, resources, closure_digest, incomplete['selectionLockSha256']), 'fixture-only validation with recomputed pins')

    missing_unit = copy.deepcopy(package_identity)
    missing_unit['selectionLock']['selectedAssets'] = [item for item in missing_unit['selectionLock']['selectedAssets'] if item.get('id') != 'xdownload.player.route-decision']
    missing_unit['selectionLockSha256'] = sha256(json.dumps(missing_unit['selectionLock'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    expect_rejection(lambda: validate_lifecycle_records(missing_unit, units_by_id, unit_paths, resources, closure_digest, missing_unit['selectionLockSha256']), 'unselected executed Unit')

    def rechain(identity, subject_id):
        history = [item for item in identity['lifecycleRecords'] if item['subject']['id'] == subject_id]
        c = next(item for item in history if item['transition'] == 'CANDIDATE')
        v = next(item for item in history if item['transition'] == 'VALIDATED')
        p = next(item for item in history if item['transition'] == 'PROMOTED')
        c['recordDigest'] = lifecycle_record_digest(c)
        v['previousRecordDigest'] = c['recordDigest']
        v['recordDigest'] = lifecycle_record_digest(v)
        p['previousRecordDigest'] = v['recordDigest']
        p['promotion']['validationRecordDigest'] = v['recordDigest']
        p['recordDigest'] = lifecycle_record_digest(p)
        items = [item for item in identity['selectionLock']['selectedAssets'] if item['id'] == subject_id]
        items += [item for item in identity['selectionLock']['selectedCapabilities'] if item['provider']['unitId'] == subject_id]
        for item in items:
            item['validationRecordDigest'] = v['recordDigest']
            item['promotionRecordDigest'] = p['recordDigest']
        identity['selectionLockSha256'] = sha256(json.dumps(identity['selectionLock'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))

    no_coverage = copy.deepcopy(package_identity)
    validation = next(item for item in no_coverage['lifecycleRecords'] if item['subject']['id'] == 'xdownload.player.recognizer' and item['transition'] == 'VALIDATED')
    validation['validation']['coverage'].update({'positive':0, 'negative':0, 'boundary':0})
    rechain(no_coverage, 'xdownload.player.recognizer')
    expect_rejection(lambda: validate_lifecycle_records(no_coverage, units_by_id, unit_paths, resources, closure_digest, no_coverage['selectionLockSha256']), 'zero validation coverage')

    no_candidate = copy.deepcopy(package_identity)
    candidate = next(item for item in no_candidate['lifecycleRecords'] if item['subject']['id'] == 'xdownload.player.route-decision' and item['transition'] == 'CANDIDATE')
    candidate.update({'actor':{}, 'policy':{}, 'evidenceRefs':[]})
    rechain(no_candidate, 'xdownload.player.route-decision')
    expect_rejection(lambda: validate_lifecycle_records(no_candidate, units_by_id, unit_paths, resources, closure_digest, no_candidate['selectionLockSha256']), 'Candidate without authority or evidence')

    replaced_lock = copy.deepcopy(package_identity)
    replaced_lock['selectionLock']['lockId'] = 'untrusted-replacement'
    replaced_lock['selectionLockSha256'] = sha256(json.dumps(replaced_lock['selectionLock'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    expect_rejection(lambda: validate_lifecycle_records(replaced_lock, units_by_id, unit_paths, resources, closure_digest, package_identity['selectionLockSha256']), 'replacement conflicts with external trusted lock pin')


def validate_replay_adversarial_vectors(package_identity: dict, resources: dict, closure_digest: str, units_by_id: dict, unit_paths: dict):
    original = [copy.deepcopy(record) for record in package_identity['lifecycleRecords'] if record['subject']['id'] == 'xdownload.player.recognizer']
    def reseal(history):
        for index, record in enumerate(history):
            if index:
                record['previousRecordId'] = history[index - 1]['recordId']
                record['previousRecordDigest'] = history[index - 1]['recordDigest']
            if record['transition'] == 'PROMOTED' and index and history[index - 1]['transition'] == 'VALIDATED':
                record['promotion']['validationRecordId'] = history[index - 1]['recordId']
                record['promotion']['validationRecordDigest'] = history[index - 1]['recordDigest']
            record['recordDigest'] = lifecycle_record_digest(record)
    def reject(label, mutate):
        history = copy.deepcopy(original)
        mutate(history)
        reseal(history)
        expect_rejection(lambda: replay_lifecycle(history, resources, closure_digest), label)
    def reseal_report(history):
        report = history[1]['validation']['report']
        history[1]['validation']['reportSha256'] = sha256(json.dumps(report, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    def bad_coverage(history):
        history[1]['validation']['coverage']['positive'] += 1
        history[1]['validation']['report']['coverage']['positive'] += 1
        reseal_report(history)
    def missing_case(history):
        history[1]['validation']['report']['tests'].pop()
        reseal_report(history)
    def failed_case(history):
        history[1]['validation']['report']['tests'][0]['result'] = 'FAIL'
        history[1]['validation']['report']['scenarios'][0]['result'] = 'FAIL'
        reseal_report(history)
    def wrong_subject_profile(history):
        history[1]['validation']['profile']['id'] = 'unrelated-profile'
        history[1]['validation']['report']['profile']['id'] = 'unrelated-profile'
        reseal_report(history)
    vectors = [
        ('validation without candidate', lambda h: h.pop(0)),
        ('promotion without validation', lambda h: h.pop(1)),
        ('candidate wrong subject digest', lambda h: h[0]['subject'].__setitem__('sha256', '0' * 64)),
        ('stale dependency closure', lambda h: h[1].__setitem__('dependencyClosureDigest', '0' * 64)),
        ('self promotion', lambda h: h[2]['actor'].__setitem__('id', h[0]['actor']['id'])),
        ('candidate actor missing', lambda h: h[0].__setitem__('actor', {})),
        ('validation policy missing', lambda h: h[1].__setitem__('policy', {})),
        ('unknown transition', lambda h: h[1].__setitem__('transition', 'SELECTED')),
        ('duplicate record id', lambda h: h[1].__setitem__('recordId', h[0]['recordId'])),
        ('report digest stale', lambda h: h[1]['validation'].__setitem__('reportSha256', '0' * 64)),
        ('report schema not pinned', lambda h: h[1]['validation'].__setitem__('reportSchema', 'unknown')),
        ('missing authorization evidence', lambda h: h[2]['promotion'].pop('authorizationEvidence')),
        ('incorrect authorization digest', lambda h: h[2]['promotion'].__setitem__('authorizationEvidenceSha256', '0' * 64)),
        ('missing prior promoted baseline', lambda h: h[2]['promotion'].pop('priorPromotedBaseline')),
        ('missing candidate evidence', lambda h: h[0].__setitem__('evidenceRefs', [])),
        ('invalid validation evidence', lambda h: h[1]['validation']['evidenceRefs'][0].__setitem__('sha256', '0' * 64)),
        ('actor authority missing', lambda h: h[2]['actor'].__setitem__('authorityRef', '')),
        ('invalid timestamp', lambda h: h[1].__setitem__('recordedAt', 'not-a-timestamp')),
        ('invalid subject revision', lambda h: h[0]['subject'].__setitem__('revision', 'not-semver')),
        ('subject absent from closure', lambda h: h[0].__setitem__('subjectPath', 'synthetic/not-present.json')),
        ('subject identity does not match resource bytes', lambda h: h[0]['subject'].__setitem__('id', 'synthetic.impostor')),
        ('subject bytes do not match digest', lambda h: h[0].__setitem__('subjectJson', h[0]['subjectJson'] + ' ')),
        ('validator authority missing', lambda h: h[1]['actor'].pop('authorityRef')),
        ('subject validation profile mismatch', wrong_subject_profile),
        ('promotion exceeds grant scope', lambda h: h[2]['promotion'].__setitem__('scope', 'PRODUCTION_GLOBAL')),
        ('promotion rationale missing', lambda h: h[2]['promotion'].pop('rationale')),
        ('promotion limitations missing', lambda h: h[2]['promotion'].pop('limitations')),
        ('coverage disagrees with scenarios', bad_coverage),
        ('scenario case omitted', missing_case),
        ('failed scenario cannot be reported as PASS', failed_case),
    ]
    for label, mutation in vectors:
        reject(label, mutation)
    candidate, validation, promotion = original
    for kind in ('knowledge', 'package'):
        content = json.dumps({'id':'synthetic.' + kind, 'revision':'1.0.0'}, separators=(',', ':')).encode('utf-8')
        path, digest = 'synthetic/' + kind + '.json', sha256(content)
        kind_resources = dict(resources)
        kind_resources[path] = digest
        record = copy.deepcopy(candidate)
        record.update({'recordId':'synthetic.' + kind, 'subject':{'kind':kind, 'id':'synthetic.' + kind, 'revision':'1.0.0', 'sha256':digest}, 'subjectPath':path, 'subjectJson':content.decode('utf-8')})
        record['recordDigest'] = lifecycle_record_digest(record)
        if next(iter(replay_lifecycle([record], kind_resources, closure_digest).values()))['state'] != 'CANDIDATE':
            fail('knowledge or package candidate not replayed')
        del kind_resources[path]
        expect_rejection(lambda: replay_lifecycle([record], kind_resources, closure_digest), 'subject resource absent')
    for kind, content in (('knowledge', b'# Reference knowledge\nText remains files-first.\n'), ('package', bytes([0x50, 0x4b, 0x03, 0x04, 0xff]))):
        path, digest = 'synthetic/' + kind + '.asset', sha256(content)
        kind_resources = dict(resources)
        kind_resources[path] = digest
        binary_history = copy.deepcopy(original)
        bindings = {(kind, 'synthetic.' + kind, '1.0.0', digest, path, closure_digest)}
        for index, record in enumerate(binary_history):
            record.update({'recordId':'binary.' + kind + '.' + record['transition'], 'subject':{'kind':kind, 'id':'synthetic.' + kind, 'revision':'1.0.0', 'sha256':digest}, 'subjectPath':path, 'subjectBase64':base64.b64encode(content).decode('ascii')})
            del record['subjectJson']
            if index:
                record['previousRecordId'] = binary_history[index - 1]['recordId']
                record['previousRecordDigest'] = binary_history[index - 1]['recordDigest']
            if record['transition'] == 'VALIDATED':
                record['validation']['subjectDigest'] = digest
                record['validation']['report']['subject'] = copy.deepcopy(record['subject'])
                record['validation']['reportSha256'] = sha256(json.dumps(record['validation']['report'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
            if record['transition'] == 'PROMOTED':
                record['promotion']['validationRecordId'] = binary_history[index - 1]['recordId']
                record['promotion']['validationRecordDigest'] = binary_history[index - 1]['recordDigest']
            record['recordDigest'] = lifecycle_record_digest(record)
        if next(iter(replay_lifecycle(binary_history, kind_resources, closure_digest, binary_bindings=bindings).values()))['state'] != 'PROMOTED':
            fail('non-JSON subject lifecycle was not promoted')
        expect_rejection(lambda: replay_lifecycle(binary_history, kind_resources, closure_digest), 'binary subject without trusted identity binding')
        identity = copy.deepcopy(package_identity)
        identity['lifecycleRecords'].extend(binary_history)
        identity['selectionLock']['subjectBindings'] = [{'kind':kind, 'id':'synthetic.' + kind, 'revision':'1.0.0', 'sha256':digest, 'path':path, 'closureDigest':closure_digest}]
        identity['selectionLockSha256'] = sha256(json.dumps(identity['selectionLock'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
        validate_lifecycle_records(identity, units_by_id, unit_paths, kind_resources, closure_digest, identity['selectionLockSha256'])
        tampered = copy.deepcopy(binary_history[0])
        tampered['subjectBase64'] = base64.b64encode(b'wrong').decode('ascii')
        tampered['recordDigest'] = lifecycle_record_digest(tampered)
        expect_rejection(lambda: replay_lifecycle([tampered], kind_resources, closure_digest, binary_bindings=bindings), 'non-JSON subject bytes mismatch')
        forged = copy.deepcopy(binary_history[0])
        forged['subject']['id'] = 'forged.other.identity'
        forged['subject']['revision'] = '99.0.0'
        forged['recordDigest'] = lifecycle_record_digest(forged)
        expect_rejection(lambda: replay_lifecycle([forged], kind_resources, closure_digest, binary_bindings=bindings), 'binary subject identity forgery')
    observation = {'recordId':'synthetic.observation', 'transition':'OBSERVED', 'subject':candidate['subject'], 'subjectPath':candidate['subjectPath'], 'subjectJson':candidate['subjectJson'], 'dependencyClosureDigest':closure_digest, 'previousRecordId':None, 'previousRecordDigest':None, 'actor':{'id':'xdownload-demo-observer', 'role':'observation-source', 'authorityRef':candidate['actor']['authorityRef']}, 'policy':{'id':'xdownload-demo/observation-policy', 'revision':'1.0.0'}, 'evidenceRefs':candidate['evidenceRefs'], 'recordedAt':candidate['recordedAt'], 'provenance':'MODEL_INFERRED'}
    observation['recordDigest'] = lifecycle_record_digest(observation)
    if next(iter(replay_lifecycle([observation], resources, closure_digest).values()))['state'] != 'OBSERVED':
        fail('observation incorrectly became a candidate')
    candidate_after_observation = copy.deepcopy(candidate)
    candidate_after_observation.update({'previousRecordId':observation['recordId'], 'previousRecordDigest':observation['recordDigest']})
    candidate_after_observation['recordDigest'] = lifecycle_record_digest(candidate_after_observation)
    if next(iter(replay_lifecycle([observation, candidate_after_observation], resources, closure_digest).values()))['state'] != 'CANDIDATE':
        fail('authorized candidate did not follow observation')
    bad_observation = copy.deepcopy(observation)
    bad_observation['provenance'] = 'PROMOTED_FACT'
    bad_observation['recordDigest'] = lifecycle_record_digest(bad_observation)
    expect_rejection(lambda: replay_lifecycle([bad_observation], resources, closure_digest), 'model inference cannot be asserted as promoted fact')
    successor = copy.deepcopy(original)
    successor_document = json.loads(candidate['subjectJson'])
    successor_document['revision'] = '2.0.0'
    successor_bytes = json.dumps(successor_document, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    successor_digest = sha256(successor_bytes)
    successor_resources = dict(resources)
    successor_resources['synthetic/successor-unit.json'] = successor_digest
    for index, record in enumerate(successor):
        record['recordId'] += '.successor'
        record['subject'].update({'revision':'2.0.0', 'sha256':successor_digest})
        record['subjectPath'] = 'synthetic/successor-unit.json'
        record['subjectJson'] = successor_bytes.decode('utf-8')
        if index:
            record['previousRecordId'] = successor[index - 1]['recordId']
            record['previousRecordDigest'] = successor[index - 1]['recordDigest']
        if record['transition'] == 'VALIDATED':
            record['validation']['subjectDigest'] = record['subject']['sha256']
            record['validation']['report']['subject'] = copy.deepcopy(record['subject'])
            record['validation']['reportSha256'] = sha256(json.dumps(record['validation']['report'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
        if record['transition'] == 'PROMOTED':
            record['promotion'].update({'validationRecordId':successor[index - 1]['recordId'], 'validationRecordDigest':successor[index - 1]['recordDigest'], 'priorPromotedBaseline':{'kind':'PROMOTED', 'recordId':promotion['recordId'], 'recordDigest':promotion['recordDigest']}})
        record['recordDigest'] = lifecycle_record_digest(record)
    replay_lifecycle(original + successor, successor_resources, closure_digest)
    rollback_validation = copy.deepcopy(validation)
    rollback_validation.update({'recordId':'synthetic.rollback.validation', 'previousRecordId':promotion['recordId'], 'previousRecordDigest':promotion['recordDigest']})
    rollback_validation['recordDigest'] = lifecycle_record_digest(rollback_validation)
    rollback_promotion = copy.deepcopy(promotion)
    rollback_promotion.update({'recordId':'synthetic.rollback.promotion', 'previousRecordId':rollback_validation['recordId'], 'previousRecordDigest':rollback_validation['recordDigest']})
    rollback_promotion['promotion'].update({'validationRecordId':rollback_validation['recordId'], 'validationRecordDigest':rollback_validation['recordDigest'], 'priorPromotedBaseline':{'kind':'PROMOTED', 'recordId':successor[2]['recordId'], 'recordDigest':successor[2]['recordDigest']}})
    rollback_promotion['recordDigest'] = lifecycle_record_digest(rollback_promotion)
    replay_lifecycle(original + successor + [rollback_validation, rollback_promotion], successor_resources, closure_digest)
    wrong_rollback = copy.deepcopy(rollback_promotion)
    wrong_rollback['promotion']['priorPromotedBaseline'] = {'kind':'PROMOTED', 'recordId':promotion['recordId'], 'recordDigest':promotion['recordDigest']}
    wrong_rollback['recordDigest'] = lifecycle_record_digest(wrong_rollback)
    expect_rejection(lambda: replay_lifecycle(original + successor + [rollback_validation, wrong_rollback], successor_resources, closure_digest), 'rollback skips the latest promoted baseline')
    for disposition in ('REJECTED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED'):
        ending = {'recordId':'fixture.' + disposition, 'transition':disposition, 'subject':candidate['subject'], 'subjectPath':candidate['subjectPath'], 'subjectJson':candidate['subjectJson'], 'dependencyClosureDigest':closure_digest, 'previousRecordId':promotion['recordId'], 'previousRecordDigest':promotion['recordDigest'], 'actor':promotion['actor'], 'policy':promotion['promotion']['policy'], 'evidenceRefs':candidate['evidenceRefs'], 'recordedAt':promotion['recordedAt'], 'decision':disposition}
        prefix = original + successor if disposition == 'SUPERSEDED' else original
        if disposition == 'SUPERSEDED':
            ending['successor'] = {'subject':successor[2]['subject'], 'promotionRecordId':successor[2]['recordId'], 'promotionRecordDigest':successor[2]['recordDigest']}
        ending['recordDigest'] = lifecycle_record_digest(ending)
        replay_lifecycle(prefix + [ending], successor_resources, closure_digest)
        revival = copy.deepcopy(validation)
        revival.update({'recordId':'fixture.revival.' + disposition, 'previousRecordId':ending['recordId'], 'previousRecordDigest':ending['recordDigest']})
        revival['recordDigest'] = lifecycle_record_digest(revival)
        expect_rejection(lambda: replay_lifecycle(prefix + [ending, revival], successor_resources, closure_digest), disposition + ' cannot be revived')
    again = copy.deepcopy(validation)
    again.update({'recordId':'fixture.revalidation', 'previousRecordId':promotion['recordId'], 'previousRecordDigest':promotion['recordDigest']})
    again['recordDigest'] = lifecycle_record_digest(again)
    next_promotion = copy.deepcopy(promotion)
    next_promotion.update({'recordId':'fixture.repromotion', 'previousRecordId':again['recordId'], 'previousRecordDigest':again['recordDigest']})
    next_promotion['promotion'].update({'validationRecordId':again['recordId'], 'validationRecordDigest':again['recordDigest'], 'priorPromotedBaseline':{'kind':'PROMOTED', 'recordId':promotion['recordId'], 'recordDigest':promotion['recordDigest']}})
    next_promotion['recordDigest'] = lifecycle_record_digest(next_promotion)
    replay_lifecycle(original + [again, next_promotion], resources, closure_digest)
    proposal = copy.deepcopy(original[:2])
    report = proposal[1]['validation']['report']
    report['findings'] = [{'id':'synthetic-finding', 'severity':'P2', 'description':'simulator observation', 'resolution':'review before production'}]
    report['counterexamples'] = ['synthetic counterexample']
    proposal[1]['validation']['reportSha256'] = sha256(json.dumps(report, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    proposal[1]['recordDigest'] = lifecycle_record_digest(proposal[1])
    state = next(iter(replay_lifecycle(proposal, resources, closure_digest).values()))
    if state['state'] != 'VALIDATED' or state['promoted'] is not None or state['validated']['validation']['report']['counterexamples'] != ['synthetic counterexample']:
        fail('simulator findings were promoted or not preserved')
    return len(vectors) + 4


def validate_historical_closure(package_identity: dict, units_by_id: dict, unit_paths: dict, resources: dict, closure: dict, closure_digest: str):
    identity = copy.deepcopy(package_identity)
    historical_manifest = copy.deepcopy(closure)
    old_fixture_digest = sha256(b'historical-signature-fixture')
    next(item for item in historical_manifest['resources'] if item['path'] == 'fixtures/player-signatures.json')['sha256'] = old_fixture_digest
    raw = json.dumps(historical_manifest, separators=(',', ':'), ensure_ascii=False)
    old_digest = sha256(raw.encode('utf-8'))
    identity['selectionLock']['historicalClosures'] = [{'sha256':old_digest, 'manifestJson':raw, 'resourceBase64':{'fixtures/player-signatures.json':base64.b64encode(b'historical-signature-fixture').decode('ascii')}}]
    history = [item for item in identity['lifecycleRecords'] if item['subject']['id'] == 'xdownload.player.recognizer']
    for index, record in enumerate(history):
        record['dependencyClosureDigest'] = old_digest
        if record['transition'] == 'CANDIDATE':
            next(item for item in record['evidenceRefs'] if item['path'] == 'fixtures/player-signatures.json')['sha256'] = old_fixture_digest
        if index:
            record['previousRecordId'] = history[index - 1]['recordId']
            record['previousRecordDigest'] = history[index - 1]['recordDigest']
        if record['transition'] == 'VALIDATED':
            record['validation']['dependencyClosureDigest'] = old_digest
            record['validation']['baseline']['sha256'] = old_fixture_digest
            next(item for item in record['validation']['evidenceRefs'] if item['path'] == 'fixtures/player-signatures.json')['sha256'] = old_fixture_digest
            record['validation']['report']['dependencyClosure']['sha256'] = old_digest
            record['validation']['report']['dependencyClosure']['resources'] = copy.deepcopy(record['validation']['evidenceRefs'])
            record['validation']['report']['baseline'] = copy.deepcopy(record['validation']['baseline'])
            record['validation']['reportSha256'] = sha256(json.dumps(record['validation']['report'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
        if record['transition'] == 'PROMOTED':
            record['promotion']['validationRecordId'] = history[index - 1]['recordId']
            record['promotion']['validationRecordDigest'] = history[index - 1]['recordDigest']
        record['recordDigest'] = lifecycle_record_digest(record)
    old_validation, old_promotion = history[1], history[2]
    entries = [next(item for item in identity['selectionLock']['selectedAssets'] if item['id'] == history[0]['subject']['id']), identity['selectionLock']['selectedCapabilities'][0]]
    for item in entries:
        item.update({'validationRecordId':old_validation['recordId'], 'validationRecordDigest':old_validation['recordDigest'], 'promotionRecordId':old_promotion['recordId'], 'promotionRecordDigest':old_promotion['recordDigest']})
    identity['selectionLockSha256'] = sha256(json.dumps(identity['selectionLock'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    expect_rejection(lambda: validate_lifecycle_records(identity, units_by_id, unit_paths, resources, closure_digest, identity['selectionLockSha256']), 'stale validation from historical closure')
    current_validation = copy.deepcopy(old_validation)
    current_validation.update({'recordId':'synthetic.current.validation', 'previousRecordId':old_promotion['recordId'], 'previousRecordDigest':old_promotion['recordDigest'], 'dependencyClosureDigest':closure_digest})
    current_validation['validation']['dependencyClosureDigest'] = closure_digest
    current_validation['validation']['baseline']['sha256'] = resources['fixtures/player-signatures.json']
    next(item for item in current_validation['validation']['evidenceRefs'] if item['path'] == 'fixtures/player-signatures.json')['sha256'] = resources['fixtures/player-signatures.json']
    current_validation['validation']['report']['dependencyClosure']['sha256'] = closure_digest
    current_validation['validation']['report']['dependencyClosure']['resources'] = copy.deepcopy(current_validation['validation']['evidenceRefs'])
    current_validation['validation']['report']['baseline'] = copy.deepcopy(current_validation['validation']['baseline'])
    current_validation['validation']['reportSha256'] = sha256(json.dumps(current_validation['validation']['report'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    current_validation['recordDigest'] = lifecycle_record_digest(current_validation)
    current_promotion = copy.deepcopy(old_promotion)
    current_promotion.update({'recordId':'synthetic.current.promotion', 'previousRecordId':current_validation['recordId'], 'previousRecordDigest':current_validation['recordDigest'], 'dependencyClosureDigest':closure_digest})
    current_promotion['promotion'].update({'validationRecordId':current_validation['recordId'], 'validationRecordDigest':current_validation['recordDigest'], 'priorPromotedBaseline':{'kind':'PROMOTED', 'recordId':old_promotion['recordId'], 'recordDigest':old_promotion['recordDigest']}})
    current_promotion['recordDigest'] = lifecycle_record_digest(current_promotion)
    identity['lifecycleRecords'].extend([current_validation, current_promotion])
    for item in entries:
        item.update({'validationRecordId':current_validation['recordId'], 'validationRecordDigest':current_validation['recordDigest'], 'promotionRecordId':current_promotion['recordId'], 'promotionRecordDigest':current_promotion['recordDigest']})
    identity['selectionLockSha256'] = sha256(json.dumps(identity['selectionLock'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    validate_lifecycle_records(identity, units_by_id, unit_paths, resources, closure_digest, identity['selectionLockSha256'])
    missing_bytes = copy.deepcopy(identity)
    del missing_bytes['selectionLock']['historicalClosures'][0]['resourceBase64']['fixtures/player-signatures.json']
    missing_bytes['selectionLockSha256'] = sha256(json.dumps(missing_bytes['selectionLock'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    expect_rejection(lambda: validate_lifecycle_records(missing_bytes, units_by_id, unit_paths, resources, closure_digest, missing_bytes['selectionLockSha256']), 'historical evidence bytes unavailable')
    wrong_closure = copy.deepcopy(identity)
    wrong_promotion = next(item for item in wrong_closure['lifecycleRecords'] if item['recordId'] == current_promotion['recordId'])
    wrong_promotion['dependencyClosureDigest'] = old_digest
    wrong_promotion['recordDigest'] = lifecycle_record_digest(wrong_promotion)
    for item in [next(item for item in wrong_closure['selectionLock']['selectedAssets'] if item['id'] == history[0]['subject']['id']), wrong_closure['selectionLock']['selectedCapabilities'][0]]:
        item['promotionRecordDigest'] = wrong_promotion['recordDigest']
    wrong_closure['selectionLockSha256'] = sha256(json.dumps(wrong_closure['selectionLock'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    expect_rejection(lambda: validate_lifecycle_records(wrong_closure, units_by_id, unit_paths, resources, closure_digest, wrong_closure['selectionLockSha256']), 'promotion and validation closure mismatch')
    identity['selectionLock']['historicalClosures'][0]['manifestJson'] += ' '
    identity['selectionLockSha256'] = sha256(json.dumps(identity['selectionLock'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    expect_rejection(lambda: validate_lifecycle_records(identity, units_by_id, unit_paths, resources, closure_digest, identity['selectionLockSha256']), 'tampered historical manifest')


def validate_failure_profile_negatives(unit_schema: dict, unit: dict):
    invalid = copy.deepcopy(unit)
    invalid["qualification"]["stage"] = "PROMOTED"
    expect_rejection(lambda: Draft202012Validator(unit_schema).validate(invalid), "mutable qualification stage")
    invalid = copy.deepcopy(unit)
    invalid["failure"]["supported"] = ["UNKNOWN"]
    expect_rejection(lambda: Draft202012Validator(unit_schema).validate(invalid), "parallel failure.supported")
    invalid = copy.deepcopy(unit)
    invalid["failure"]["handling"]["UNKNOWN"] = {}
    expect_rejection(lambda: Draft202012Validator(unit_schema).validate(invalid), "missing failure handling action")


def validate_condition_semantics():
    cases = [
        ({"optionalFlag": True}, {"path": "/optionalFlag", "operator": "exists"}, True),
        ({}, {"path": "/optionalFlag", "operator": "exists"}, False),
        ({"optionalFlag": None}, {"path": "/optionalFlag", "operator": "exists"}, True),
        ({"optionalFlag": True}, {"path": "/optionalFlag", "operator": "equals", "value": True}, True),
        ({"optionalFlag": 1}, {"path": "/optionalFlag", "operator": "equals", "value": True}, False),
        ({"optionalFlag": 1}, {"path": "/optionalFlag", "operator": "notEquals", "value": True}, True),
        ({"optionalFlag": True}, {"path": "/optionalFlag", "operator": "notEquals", "value": 1}, True),
        ({"optionalFlag": True}, {"path": "/optionalFlag", "operator": "notEquals", "value": True}, False),
        ({"optionalFlag": 1}, {"path": "/optionalFlag", "operator": "equals", "value": 1.0}, True),
        ({"actual": {"value": 1}}, {"path": "", "operator": "equals", "value": {"actual": {"value": 1}}}, True),
        ({}, {"path": "/optionalFlag", "operator": "equals", "value": None}, False),
        ({}, {"path": "/optionalFlag", "operator": "notEquals", "value": None}, True),
        ({"optionalFlag": {"a": 1, "b": [True, None]}}, {"path": "/optionalFlag", "operator": "equals", "value": {"b": [True, None], "a": 1}}, True),
        ({"optionalFlag": [1, "x"]}, {"path": "/optionalFlag", "operator": "equals", "value": [1, "x"]}, True),
        ({"optionalFlag": [1, "x"]}, {"path": "/optionalFlag", "operator": "equals", "value": ["x", 1]}, False),
        ({"optionalFlag": 9007199254740993}, {"path": "/optionalFlag", "operator": "equals", "value": 9007199254740992}, True),
    ]
    for output, condition, expected in cases:
        if condition_matches(output, condition) is not expected:
            fail(f"control condition semantics mismatch: {condition}")


def main():
    validate_condition_semantics()
    standard_schemas = {}
    for schema_path in sorted(STANDARD_SCHEMA_DIR.glob("*.schema.json")):
        schema = read_json(schema_path)
        Draft202012Validator.check_schema(schema)
        standard_schemas[schema_path.name] = schema
    required_schemas = {
        "intelligence-unit.schema.json",
        "composition-graph.schema.json",
        "domain-definition.schema.json",
        "resource-closure.schema.json",
        "validation-report.schema.json",
    }
    if set(standard_schemas) != required_schemas:
        fail("DIS standard schema inventory mismatch")

    descriptor = read_json(PACKAGE_ROOT / "package.json")
    package_identity = descriptor.get("dis", {})
    manifest_path = safe_relative(package_identity.get("resourceClosurePath", ""))
    manifest_bytes = resolve_inside(manifest_path).read_bytes()
    manifest_digest = sha256(manifest_bytes)
    if manifest_digest != package_identity.get("resourceClosureSha256"):
        fail("Package descriptor does not pin exact Resource Closure Manifest SHA-256")
    closure = json.loads(manifest_bytes.decode("utf-8"))
    if (
        closure.get("schemaVersion") != "dis.resource-closure/0.1.0"
        or closure.get("standardVersion") != "0.1.0"
        or closure.get("packageId") != package_identity.get("packageId")
        or closure.get("packageRevision") != package_identity.get("revision")
    ):
        fail("Package descriptor and Resource Closure identity mismatch")

    unit_schema = standard_schemas["intelligence-unit.schema.json"]
    graph_schema = standard_schemas["composition-graph.schema.json"]
    definition_schema = standard_schemas["domain-definition.schema.json"]
    closure_schema = standard_schemas["resource-closure.schema.json"]
    declared_unit_paths = set()
    units = []
    for unit_ref in closure["units"]:
        relative = safe_relative(unit_ref["path"])
        if relative in declared_unit_paths:
            fail(f"duplicate Unit descriptor path: {relative}")
        declared_unit_paths.add(relative)
        unit = read_json(resolve_inside(relative))
        if unit.get("id") != unit_ref["id"] or unit.get("revision") != unit_ref["revision"]:
            fail(f"Resource Closure Unit path/identity mismatch: {relative}")
        units.append(unit)
    actual_unit_paths = {
        path.relative_to(PACKAGE_ROOT).as_posix()
        for path in UNIT_DIR.rglob("*.json")
    }
    if actual_unit_paths != declared_unit_paths:
        fail("Unit descriptor inventory differs from Resource Closure")
    for unit in units:
        Draft202012Validator(unit_schema, format_checker=FormatChecker()).validate(unit)
        for source in unit.get("evidence", {}).get("sources", []):
            validate_provenance_ref(source.get("ref"))
    units_by_id = {unit["id"]: unit for unit in units}
    if len(units_by_id) != len(units):
        fail("duplicate Unit identity")

    graph_path = safe_relative(closure["graphRef"]["path"])
    definition_path = safe_relative(closure["definitionRef"]["path"])
    graph_bytes = resolve_inside(graph_path).read_bytes()
    graph = json.loads(graph_bytes.decode('utf-8'))
    definition = read_json(resolve_inside(definition_path))
    if graph.get("id") != closure["graphRef"]["id"] or graph.get("revision") != closure["graphRef"]["revision"]:
        fail("Resource Closure Graph identity/path mismatch")
    if definition.get("domainId") != closure["definitionRef"]["id"] or definition.get("revision") != closure["definitionRef"]["revision"]:
        fail("Resource Closure Definition identity/path mismatch")
    Draft202012Validator(graph_schema).validate(graph)
    Draft202012Validator(definition_schema).validate(definition)
    Draft202012Validator(closure_schema).validate(closure)

    nodes_by_id = {node["nodeId"]: node for node in graph["nodes"]}
    if len(nodes_by_id) != len(graph["nodes"]):
        fail("duplicate Graph Node ID")
    for node in graph["nodes"]:
        unit = units_by_id.get(node["unitRef"]["id"])
        if not unit or unit["revision"] != node["unitRef"]["revision"]:
            fail(f"Graph Node exact Unit identity unresolved: {node['nodeId']}")

    validate_definition_binding(definition, units_by_id, graph, closure["graphRef"]["path"])

    expected = {}
    add_expected(expected, closure["definitionRef"]["path"], "definition", definition["domainId"])
    add_expected(expected, closure["graphRef"]["path"], "graph", graph["id"])
    for unit_ref in closure["units"]:
        unit = units_by_id.get(unit_ref["id"])
        if not unit or unit["revision"] != unit_ref["revision"]:
            fail(f"Resource Closure Unit identity mismatch: {unit_ref['id']}")
        add_expected(expected, unit_ref["path"], "unit", unit_ref["id"])
        implementation = unit.get("implementation", {})
        if implementation.get("artifactRef"):
            kind = "graph" if unit["role"] == "workflow" else "implementation"
            add_expected(expected, implementation["artifactRef"], kind, unit["id"])
        for candidate in implementation.get("candidates", []):
            add_expected(expected, candidate["artifactRef"], "implementation", unit["id"])
        for source in unit.get("evidence", {}).get("sources", []):
            source_ref = source["ref"]
            if is_external_provenance_ref(source_ref):
                continue
            source_ref = safe_relative(source_ref)
            if source_ref in expected:
                kind = expected[source_ref]["kind"]
            elif source_ref.startswith("fixtures/"):
                kind = "fixture"
            elif source_ref.startswith("domain/schemas/"):
                kind = "schema"
            elif source_ref.startswith("domain/units/"):
                kind = "unit"
            else:
                kind = "conformance"
            add_expected(expected, source_ref, kind, unit["id"])
        if unit.get("validation", {}).get("casesRef"):
            add_expected(expected, unit["validation"]["casesRef"], "conformance", unit["id"])
        for knowledge_ref in unit.get("knowledgeRefs", []):
            add_expected(expected, knowledge_ref["path"], "fixture", unit["id"])
        for key in ("input", "output"):
            schema_ref = unit.get(key, {}).get("schemaRef")
            if schema_ref:
                collect_schema_refs(schema_ref, expected, set())

    for schema_ref in (graph["inputSchemaRef"], graph["outputSchemaRef"]):
        collect_schema_refs(schema_ref, expected, set())
    for resource in package_identity.get("conformanceResources", []):
        add_expected(expected, resource, "conformance", package_identity["packageId"])
    add_expected(expected, "fixtures/player-signatures.json", "fixture", package_identity["packageId"])
    add_expected(expected, "fixtures/player-strategies.json", "fixture", package_identity["packageId"])

    declared = {}
    for item in closure["resources"]:
        relative = safe_relative(item["path"])
        if relative in declared:
            fail(f"duplicate Resource Closure path: {relative}")
        declared[relative] = item
        if sha256(resolve_inside(relative).read_bytes()) != item["sha256"]:
            fail(f"Resource Closure digest mismatch: {relative}")
        if not item.get("owners"):
            fail(f"Resource Closure owners missing: {relative}")
    for relative, expectation in expected.items():
        item = declared.get(relative)
        if not item:
            fail(f"required resource missing from closure: {relative}")
        if item["kind"] != expectation["kind"] or item["required"] is not True:
            fail(f"Resource Closure kind/required mismatch: {relative}")
        if not expectation["owners"].issubset(set(item["owners"])):
            fail(f"Resource Closure owner mismatch: {relative}")
    for relative, item in declared.items():
        if item["required"] and relative not in expected:
            fail(f"unreferenced required resource: {relative}")

    resources = {relative: item["sha256"] for relative, item in declared.items()}
    validate_selected_graph(package_identity['selectionLock'], closure['graphRef'], graph, resources, sha256(graph_bytes))
    mismatched_graph_lock = copy.deepcopy(package_identity['selectionLock'])
    next(item for item in mismatched_graph_lock['selectedAssets'] if item['kind'] == 'graph')['path'] = 'domain/wrong.graph.json'
    expect_rejection(lambda: validate_selected_graph(mismatched_graph_lock, closure['graphRef'], graph, resources, sha256(graph_bytes)), 'selected Graph versus manifest mismatch')
    expect_rejection(lambda: validate_selected_graph(package_identity['selectionLock'], closure['graphRef'], graph, resources, '0' * 64), 'selected Graph versus loaded bytes mismatch')
    for unit in units:
        for candidate in unit.get("implementation", {}).get("candidates", []):
            if resources.get(candidate["artifactRef"]) != candidate["artifactDigest"]:
                fail(f"implementation candidate artifact digest mismatch: {candidate['candidateId']}")
    unit_paths = {item["id"]: item["path"] for item in closure["units"]}
    record_schema = unit_schema['$defs']['lifecycleRecord']
    for record in package_identity.get('lifecycleRecords', []):
        Draft202012Validator(record_schema, format_checker=FormatChecker()).validate(record)
    validate_capability_contracts(units_by_id, resources)
    selected_providers = {}
    for unit in units:
        if unit.get("capabilities", {}).get("provides"):
            selected_providers[unit["id"]] = resolve_provider_selection(
                unit, package_identity["selectionLock"], package_identity["selectionLock"]["target"], resources
            )
    validate_lifecycle_records(package_identity, units_by_id, unit_paths, resources, manifest_digest, os.environ.get('DIS_EXPECTED_SELECTION_LOCK_SHA256', ''))
    validate_lifecycle_negatives(package_identity, units_by_id, unit_paths, resources, manifest_digest)
    replay_vectors = validate_replay_adversarial_vectors(package_identity, resources, manifest_digest, units_by_id, unit_paths)
    validate_historical_closure(package_identity, units_by_id, unit_paths, resources, closure, manifest_digest)
    validate_failure_profile_negatives(unit_schema, units[0])
    validate_capability_negatives(units_by_id, package_identity, resources)
    validate_precondition_negatives(units_by_id["xdownload.player.recognizer"])

    knowledge = {}
    for unit in units:
        for knowledge_ref in unit.get("knowledgeRefs", []):
            relative = safe_relative(knowledge_ref["path"])
            if resources.get(relative) != knowledge_ref["sha256"]:
                fail(f"Knowledge/Rule resource digest mismatch: {relative}")
            value = read_json(resolve_inside(relative))
            if value.get("catalogId") != knowledge_ref["id"] or value.get("revision") != knowledge_ref["revision"]:
                fail(f"Knowledge/Rule resource identity mismatch: {knowledge_ref['id']}")
            knowledge[knowledge_ref["id"]] = value
            if not isinstance(value.get("patterns"), list) or not value["patterns"]:
                fail(f"Knowledge/Rule content is not consumable: {knowledge_ref['id']}")
    if "xdownload.player-signatures" not in knowledge:
        fail("selected player signature Knowledge was not loaded by the Consumer")


    schema_paths = sorted(path for path, item in declared.items() if item["kind"] == "schema")
    registry = Registry()
    demo_schemas = {}
    for relative in schema_paths:
        schema = read_json(resolve_inside(relative))
        uri = "https://demo.invalid/" + relative
        schema["$id"] = uri
        demo_schemas[relative] = schema
        registry = registry.with_resource(uri, Resource.from_contents(schema))

    validate_graph_contract(graph, units_by_id, demo_schemas)
    validate_optional_data_binding_semantics(graph, units_by_id, demo_schemas)

    node_script = subprocess.run(
        ["node", "./src/emit-conformance-traces.mjs"],
        cwd=PACKAGE_ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding='utf-8',
    )
    results = json.loads(node_script.stdout)
    alternate_script = subprocess.run(['node', './src/emit-conformance-traces.mjs', '--provider-probe'], cwd=PACKAGE_ROOT, check=True, capture_output=True, text=True, encoding='utf-8')
    alternate_result = json.loads(alternate_script.stdout)
    alternate_identity = alternate_result['packageIdentity']
    alternate_lock = alternate_identity['selectionLock']
    if sha256(json.dumps(alternate_lock, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')) != alternate_identity.get('selectionLockSha256'):
        fail('alternate provider Package lock digest mismatch')
    alternate_providers = dict(selected_providers)
    recognizer = units_by_id['xdownload.player.recognizer']
    alternate_providers[recognizer['id']] = resolve_provider_selection(recognizer, alternate_lock, alternate_lock['target'], resources)
    validate_trace_assembly(alternate_result, graph, units_by_id, nodes_by_id, alternate_providers, demo_schemas, registry)
    if alternate_providers[recognizer['id']]['candidateId'] != 'signature-normalized-v1' or alternate_result['outcome']['status'] != 'READY':
        fail('alternate provider was not selected and executed')
    expected_cases = {'known': ('READY', 'recognized'), 'ambiguous': ('NEEDS_INPUT', 'ambiguous'), 'unknown': ('NEEDS_REVIEW', 'unknown'), 'fixture-hls': ('READY', 'recognized'), 'conflict': ('NEEDS_INPUT', 'conflict')}
    if len(results) != len(expected_cases) or {result['label'] for result in results} != set(expected_cases):
        fail('conformance scenario inventory mismatch')
    for result in results:
        outcome, status = expected_cases[result['label']]
        recognition = result['trace'][0]['output']
        if result['outcome']['status'] != outcome or recognition['status'] != status or not recognition['evidence']:
            fail('recognition status, evidence or terminal policy mismatch')
        if status == 'conflict' and (not recognition['conflicts'] or len(recognition['conflicts'][0]['claims']) < 2 or not any(item['sourceId'] == 'browser' for item in recognition['evidence'])):
            fail('conflicting observations lack structured provenance')
        if outcome in ('NEEDS_INPUT', 'NEEDS_REVIEW'):
            expected = 'NEEDS_INPUT' if outcome == 'NEEDS_INPUT' else 'NEEDS_REVIEW'
            actions = {'CLARIFY':'NEEDS_INPUT', 'WAIT':'NEEDS_INPUT', 'PRESERVE_UNKNOWN':'NEEDS_REVIEW', 'BOUNDED_FALLBACK':'NEEDS_REVIEW', 'REVIEW':'NEEDS_REVIEW'}
            for entry in result['trace']:
                unit = units_by_id[entry['unitId']]
                failure_status = None
                if unit['role'] == 'recognizer' and entry['output'].get('status') in ('unknown', 'ambiguous', 'conflict', 'out_of_scope'):
                    failure_status = entry['output']['status'].upper()
                elif unit['role'] == 'decision' and entry['input'].get('recognition', {}).get('status') in ('unknown', 'ambiguous', 'conflict'):
                    failure_status = entry['input']['recognition']['status'].upper()
                elif unit['role'] in ('procedure', 'validator') and entry['output'].get('status') in ('NEEDS_INPUT', 'NEEDS_REVIEW'):
                    failure_status = entry['output']['status']
                if failure_status and actions.get(unit['failure']['handling'].get(failure_status, {}).get('action')) != expected:
                    fail('Unit failure action contradicts observed terminal outcome')
            workflow = next(unit for unit in units if unit['role'] == 'workflow')
            if actions.get(workflow['failure']['handling'].get(expected, {}).get('action')) != expected:
                fail('Workflow failure action contradicts terminal outcome')
    later_probe = copy.deepcopy(next(result for result in results if result['label'] == 'known'))
    later_units = copy.deepcopy(units_by_id)
    later_unit = later_units[later_probe['trace'][-1]['unitId']]
    later_unit['preconditions'] = {'inputSchemaRef':later_unit['input']['schemaRef'], 'all':[{'path':'/resolution', 'operator':'equals', 'value':{'status':'IMPOSSIBLE'}}]}
    later_probe['errorCode'] = 'PRECONDITION_FAILED'
    later_probe['failurePolicy'] = {'unitId':later_unit['id'], 'nodeId':later_probe['trace'][-1]['nodeId'], 'status':'INVALID_INPUT', 'action':'REJECT'}
    del later_probe['trace'][-1]['output']
    later_probe['trace'][-1]['failure'] = {'code':'PRECONDITION_FAILED'}
    validate_trace_assembly(later_probe, graph, later_units, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True)
    without_evidence = copy.deepcopy(later_probe)
    without_evidence['trace'][-1]['evidence'] = {}
    expect_rejection(lambda: validate_trace_assembly(without_evidence, graph, later_units, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True), 'later precondition rejection without Graph evidence')
    later_env = dict(os.environ)
    later_env['DIS_EMIT_LATER_PROBE'] = '1'
    later_script = subprocess.run(['node', '--test', '--test-name-pattern=Package-pinned failure policy changes execution and precondition handling', 'test/runner.test.mjs'], cwd=PACKAGE_ROOT, env=later_env, check=True, capture_output=True, text=True, encoding='utf-8')
    later_lines = [line.split('DIS_LATER_PROBE=', 1)[1] for line in later_script.stdout.splitlines() if 'DIS_LATER_PROBE=' in line]
    if len(later_lines) != 1:
        fail('missing actual later-node precondition trace')
    actual_later = json.loads(later_lines[0])
    validate_trace_assembly(actual_later, graph, later_units, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True)
    scope_script = subprocess.run(['node', './src/emit-conformance-traces.mjs', '--scope-probes'], cwd=PACKAGE_ROOT, check=True, capture_output=True, text=True, encoding='utf-8')
    scope_results = json.loads(scope_script.stdout)
    if len(scope_results) != 17:
        fail('scope probe inventory mismatch')
    for probe in scope_results:
        validate_trace_assembly(probe, graph, units_by_id, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True)
        if probe['errorCode'] == 'FAILURE_POLICY_REJECT':
            Draft202012Validator(demo_schemas['domain/schemas/page-observation.schema.json'], registry=registry, format_checker=FormatChecker()).validate(probe['input'])
            Draft202012Validator(demo_schemas['domain/schemas/recognition-result.schema.json'], registry=registry, format_checker=FormatChecker()).validate(probe['output'])
            if not json_value_equal(probe['trace'][-1].get('output'), probe['output']) or probe['output']['status'] != 'out_of_scope' or not probe['output']['evidence']:
                fail('scope exclusion must preserve evidence and return out_of_scope')
        for field, value in [('unitId', 'invalid.unit'), ('implementationRef', 'registry:fake'), ('evidence', {'forged': []})]:
            forged = copy.deepcopy(probe)
            forged['trace'][0][field] = value
            expect_rejection(lambda: validate_trace_assembly(forged, graph, units_by_id, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True), 'tampered rejection trace ' + field)
    for probe in [item for item in scope_results if item['errorCode'] in ('PRECONDITION_FAILED', 'INVALID_INPUT')]:
        fail_probe = copy.deepcopy(probe)
        fail_units = copy.deepcopy(units_by_id)
        fail_units[fail_probe['trace'][-1]['unitId']]['failure']['handling']['INVALID_INPUT']['action'] = 'FAIL'
        fail_probe['failurePolicy']['action'] = 'FAIL'
        validate_trace_assembly(fail_probe, graph, fail_units, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True)
    unknown_trace = next(result for result in results if result['label'] == 'unknown')
    decision_probe = copy.deepcopy(unknown_trace)
    decision_probe['trace'] = decision_probe['trace'][:2]
    decision_probe['errorCode'] = 'FAILURE_POLICY_REJECT'
    decision_probe['failurePolicy'] = {'unitId':decision_probe['trace'][-1]['unitId'], 'nodeId':decision_probe['trace'][-1]['nodeId'], 'status':'UNKNOWN', 'action':'REJECT'}
    decision_units = copy.deepcopy(units_by_id)
    decision_units[decision_probe['failurePolicy']['unitId']]['failure']['handling']['UNKNOWN']['action'] = 'REJECT'
    validate_trace_assembly(decision_probe, graph, decision_units, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True)
    workflow_probe = copy.deepcopy(unknown_trace)
    workflow_unit = next(unit for unit in units if unit['role'] == 'workflow')
    workflow_probe['errorCode'] = 'FAILURE_POLICY_FAIL'
    workflow_probe['failurePolicy'] = {'unitId':workflow_unit['id'], 'nodeId':workflow_probe['trace'][-1]['nodeId'], 'status':'NEEDS_REVIEW', 'action':'FAIL'}
    workflow_units = copy.deepcopy(units_by_id)
    workflow_units[workflow_unit['id']]['failure']['handling']['NEEDS_REVIEW']['action'] = 'FAIL'
    validate_trace_assembly(workflow_probe, graph, workflow_units, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True)
    earlier_units = copy.deepcopy(workflow_units)
    earlier_units[workflow_probe['trace'][-1]['unitId']]['failure']['handling']['NEEDS_REVIEW']['action'] = 'FAIL'
    expect_rejection(lambda: validate_trace_assembly(workflow_probe, graph, earlier_units, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True), 'workflow policy bypassed earlier terminal Unit failure')
    earlier_units = copy.deepcopy(decision_units)
    earlier_units[decision_probe['trace'][0]['unitId']]['failure']['handling']['UNKNOWN']['action'] = 'REJECT'
    expect_rejection(lambda: validate_trace_assembly(decision_probe, graph, earlier_units, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True), 'decision policy bypassed earlier recognizer failure')
    earlier_units[decision_probe['trace'][0]['unitId']]['failure']['handling']['UNKNOWN']['action'] = 'WAIT'
    expect_rejection(lambda: validate_trace_assembly(decision_probe, graph, earlier_units, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True), 'decision policy bypassed unsupported earlier action')
    earlier_units = copy.deepcopy(decision_units)
    earlier_unit = earlier_units[decision_probe['trace'][0]['unitId']]
    earlier_unit['preconditions'] = {'inputSchemaRef': earlier_unit['input']['schemaRef'], 'all': [{'path': '/url', 'operator': 'equals', 'value': 'https://other.test'}]}
    expect_rejection(lambda: validate_trace_assembly(decision_probe, graph, earlier_units, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True), 'decision policy bypassed earlier failed precondition')
    forged_precondition = copy.deepcopy(decision_probe)
    forged_precondition['trace'][0]['failure'] = {'code': 'PRECONDITION_FAILED'}
    expect_rejection(lambda: validate_trace_assembly(forged_precondition, graph, earlier_units, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True), 'failure entry also has output and later nodes')
    forged_schema = copy.deepcopy(decision_probe)
    forged_schema['trace'][0]['output']['forgedExtra'] = 42
    forged_schema['trace'][1]['input']['recognition']['forgedExtra'] = 42
    expect_rejection(lambda: validate_trace_assembly(forged_schema, graph, decision_units, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True), 'schema-invalid successful output in rejection trace')
    forged_input = copy.deepcopy(decision_probe)
    forged_input['errorCode'] = 'INVALID_INPUT'
    forged_input['failurePolicy']['status'] = 'INVALID_INPUT'
    forged_input['trace'][-1].pop('output')
    forged_input['trace'][-1]['failure'] = {'code': 'INVALID_INPUT'}
    expect_rejection(lambda: validate_trace_assembly(forged_input, graph, decision_units, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True), 'non-recognizer forged handler input failure')
    forged_policy = copy.deepcopy(workflow_probe)
    forged_policy['failurePolicy']['unitId'] = forged_policy['trace'][-1]['unitId']
    expect_rejection(lambda: validate_trace_assembly(forged_policy, graph, workflow_units, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True), 'misattributed Workflow policy')
    probe_env = dict(os.environ)
    probe_env['DIS_EMIT_POLICY_PROBES'] = '1'
    policy_script = subprocess.run(['node', '--test', '--test-name-pattern=decision and workflow rejection and FAIL carry exact policy attribution', 'test/runner.test.mjs'], cwd=PACKAGE_ROOT, env=probe_env, check=True, capture_output=True, text=True, encoding='utf-8')
    lines = [line.split('DIS_POLICY_PROBES=', 1)[1] for line in policy_script.stdout.splitlines() if 'DIS_POLICY_PROBES=' in line]
    if len(lines) != 1:
        fail('missing actual policy rejection probes')
    actual_policy_probes = json.loads(lines[0])
    if len(actual_policy_probes) != 4:
        fail('policy rejection probe inventory mismatch')
    for probe in actual_policy_probes:
        probe_units = copy.deepcopy(units_by_id)
        policy = probe['failurePolicy']
        probe_units[policy['unitId']]['failure']['handling'][policy['status']]['action'] = policy['action']
        validate_trace_assembly(probe, graph, probe_units, nodes_by_id, selected_providers, demo_schemas, registry, rejection=True)
    old_lock = copy.deepcopy(package_identity['selectionLock'])
    feedback = {'traceId':'synthetic-trace-1', 'packageLockSha256':package_identity['selectionLockSha256'], 'provenance':'MODEL_INFERRED', 'claimedProvenance':'MODEL_INFERRED', 'finding':'possible alternative marker', 'disposition':'PROPOSAL_ONLY'}
    if validate_reference_feedback(feedback, package_identity['selectionLockSha256']) != feedback:
        fail('feedback provenance was rewritten')
    spoofed = copy.deepcopy(feedback)
    spoofed['claimedProvenance'] = 'SYSTEM_OBSERVED'
    expect_rejection(lambda: validate_reference_feedback(spoofed, package_identity['selectionLockSha256']), 'model inference spoofed as observation')
    new_lock = copy.deepcopy(old_lock)
    new_lock['packageRevision'] = '2.0.0'
    if package_identity['selectionLock'] != old_lock or json_value_equal(new_lock, old_lock):
        fail('future selection mutated the pinned Package')
    validated_inputs = validated_outputs = 0
    for result in results:
        validate_trace_assembly(result, graph, units_by_id, nodes_by_id, selected_providers, demo_schemas, registry)
        trace = result["trace"]
        if not trace or not json_value_equal(result["outcome"], trace[-1]["output"]):
            fail(f"terminal outcome differs from last trace output: {result['label']}")
        if trace[-1]["nodeId"] not in graph["terminalNodes"]:
            fail(f"trace did not end at a declared terminal: {result['label']}")
        for entry in trace:
            node = nodes_by_id.get(entry["nodeId"])
            if not node or node["unitRef"]["id"] != entry["unitId"] or node["unitRef"]["revision"] != entry["unitRevision"]:
                fail(f"trace Unit identity mismatch: {entry['nodeId']}")
            unit = units_by_id[entry["unitId"]]
            validate_preconditions(unit, entry["input"])
            input_schema = demo_schemas[unit["input"]["schemaRef"]]
            output_schema = demo_schemas[unit["output"]["schemaRef"]]
            Draft202012Validator(input_schema, registry=registry, format_checker=FormatChecker()).validate(entry["input"])
            Draft202012Validator(output_schema, registry=registry, format_checker=FormatChecker()).validate(entry["output"])
            declared_slots = set(unit.get("evidence", {}).get("consumes", []))
            trace_evidence = entry.get("evidence", {})
            if set(trace_evidence) - declared_slots:
                fail(f"undeclared evidence slot in trace: {entry['nodeId']}")
            for slot in declared_slots:
                if not isinstance(trace_evidence.get(slot), list) or not trace_evidence[slot]:
                    fail(f"required evidence slot absent: {entry['nodeId']}:{slot}")
            validated_inputs += 1
            validated_outputs += 1

    print(json.dumps({
        "result": "PASS",
        "standardSchemas": len(standard_schemas),
        "units": len(units),
        "graphNodes": len(graph["nodes"]),
        "graphEdges": len(graph["edges"]),
        "closureResources": len(declared),
        "demoCases": len(results),
        "validatedNodeInputs": validated_inputs,
        "validatedNodeOutputs": validated_outputs,
        "cases": [{"label": item["label"], "outcome": item["outcome"]["status"]} for item in results],
        "resourceClosureDigest": manifest_digest,
        "independentGraphValidation": "PASS",
        "definitionBindingValidation": "PASS",
        "capabilityContractValidation": "PASS",
        "providerSelectionValidation": "PASS",
        "preconditionValidation": "PASS",
        "knowledgeReferenceValidation": "PASS",
        "lifecycleValidation": "PASS",
        "lifecycleNegativeCases": 10,
        "lifecycleReplayAdversarialVectors": replay_vectors,
    }, indent=2))


if __name__ == "__main__":
    main()
