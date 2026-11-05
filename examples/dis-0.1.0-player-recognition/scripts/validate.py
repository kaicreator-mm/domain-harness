from __future__ import annotations

import copy
import hashlib
import json
import math
import re
import subprocess
from pathlib import Path, PurePosixPath

from jsonschema import Draft202012Validator, FormatChecker
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


def validate_trace_assembly(result: dict, graph: dict, units_by_id: dict, nodes_by_id: dict, selected_providers: dict):
    trace = result.get("trace")
    if not isinstance(trace, list) or not trace:
        fail(f"missing execution trace: {result.get('label')}")
    node_ids = [entry.get("nodeId") for entry in trace]
    if node_ids[0] != graph["entryNode"] or len(set(node_ids)) != len(node_ids):
        fail(f"trace entry/cycle identity invalid: {result.get('label')}")
    if node_ids[-1] not in graph["terminalNodes"]:
        fail(f"trace does not end at a declared terminal: {result.get('label')}")
    outputs = {}
    for index, entry in enumerate(trace):
        node_id = entry.get("nodeId")
        node = nodes_by_id.get(node_id)
        unit = units_by_id.get(entry.get("unitId"))
        if not node or not unit or node["unitRef"]["id"] != unit["id"] or node["unitRef"]["revision"] != entry.get("unitRevision"):
            fail(f"trace Unit identity mismatch: {node_id}")
        if entry.get("implementationRef") != unit.get("implementation", {}).get("ref"):
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
        elif not is_terminal:
            fail(f"trace ended before a terminal Node: {node_id}")
    if not json_value_equal(result.get("outcome"), trace[-1].get("output")):
        fail(f"terminal outcome differs from final trace output: {result.get('label')}")




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
    if any(implementation.get(field) != candidate.get(field) for field in ("ref", "artifactRef", "strategy", "exposure")):
        fail(f"Unit provider binding mismatch: {provider.get('candidateId')}")
    if resources.get(candidate.get("artifactRef")) != candidate.get("artifactDigest"):
        fail(f"provider artifact digest mismatch: {candidate.get('artifactRef')}")
    return candidate


def validate_lifecycle_records(package_identity: dict, units_by_id: dict, unit_paths: dict, resources: dict, closure_digest: str):
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
    if len(selection["selectedCapabilities"]) != 1 or len(selection["selectedAssets"]) != 2:
        fail("Package selection cardinality is invalid")
    by_id = {}
    for record in records:
        record_id = record.get("recordId")
        transition = record.get("transition")
        if not record_id or record_id in by_id or transition not in {
            "CANDIDATE", "VALIDATED", "PROMOTED", "REJECTED", "WITHDRAWN", "EXPIRED", "SUPERSEDED"
        }:
            fail(f"invalid lifecycle record: {record_id}")
        subject = record.get("subject", {})
        if (
            record.get("dependencyClosureDigest") != closure_digest
            or subject.get("kind") != "unit"
            or not subject.get("id")
            or not subject.get("revision")
            or not re.fullmatch(r"[a-f0-9]{64}", subject.get("sha256", ""))
        ):
            fail(f"lifecycle subject/closure mismatch: {record_id}")
        by_id[record_id] = record

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
        or selection.get("target") != unit.get("implementation", {}).get("selectionPolicy", {}).get("target")
    ):
        fail("Package Consumer Profile/target mismatch")
    chain = [
        record for record in records
        if record.get("subject", {}).get("id") == unit["id"]
        and record.get("subject", {}).get("revision") == unit["revision"]
        and record.get("subject", {}).get("sha256") == unit_asset["sha256"]
    ]
    candidate = next((record for record in chain if record.get("transition") == "CANDIDATE"), None)
    validated = next((record for record in chain if record.get("transition") == "VALIDATED"), None)
    promoted = next((record for record in chain if record.get("transition") == "PROMOTED"), None)
    if (
        not candidate or not validated or not promoted or len(chain) != 3
        or candidate.get("previousRecordId") is not None
        or validated.get("previousRecordId") != candidate.get("recordId")
        or validated.get("previousRecordDigest") != candidate.get("recordDigest")
        or promoted.get("previousRecordId") != validated.get("recordId")
        or promoted.get("previousRecordDigest") != validated.get("recordDigest")
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
    for evidence in candidate.get("evidenceRefs", []):
        if resources.get(evidence.get("path")) != evidence.get("sha256"):
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
    if any(not isinstance(coverage.get(key), int) or coverage[key] < 0 for key in ("positive", "negative", "boundary", "heldOut")):
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
            if (
                asset.get("promotionRecordId") != promoted.get("recordId")
                or asset.get("promotionRecordDigest") != promoted.get("recordDigest")
                or asset.get("validationRecordId") != validated.get("recordId")
                or asset.get("validationRecordDigest") != validated.get("recordDigest")
                or resources.get(asset.get("path")) != asset.get("sha256")
            ):
                fail(f"selected Knowledge is not pinned to promoted subject: {asset.get('id')}")
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
    except SystemExit:
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
    expect_rejection(lambda: validate_lifecycle_records(missing, units_by_id, unit_paths, resources, closure_digest), "missing validation")

    unauthorized = copy.deepcopy(package_identity)
    next(item for item in unauthorized["lifecycleRecords"] if item.get("transition") == "PROMOTED")["actor"]["authorityRef"] = ""
    expect_rejection(lambda: validate_lifecycle_records(unauthorized, units_by_id, unit_paths, resources, closure_digest), "unauthorized promotion")

    stale = copy.deepcopy(package_identity)
    stale["lifecycleRecords"][0]["dependencyClosureDigest"] = "0" * 64
    expect_rejection(lambda: validate_lifecycle_records(stale, units_by_id, unit_paths, resources, closure_digest), "stale dependency closure")

    unpromoted = copy.deepcopy(package_identity)
    next(item for item in unpromoted["selectionLock"]["selectedAssets"] if item.get("kind") == "unit")["promotionRecordId"] = "missing-promotion"
    expect_rejection(lambda: validate_lifecycle_records(unpromoted, units_by_id, unit_paths, resources, closure_digest), "unpromoted selection")


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
    graph = read_json(resolve_inside(graph_path))
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
    unit_paths = {item["id"]: item["path"] for item in closure["units"]}
    validate_capability_contracts(units_by_id, resources)
    selected_providers = {}
    for unit in units:
        if unit.get("capabilities", {}).get("provides"):
            selected_providers[unit["id"]] = resolve_provider_selection(
                unit, package_identity["selectionLock"], package_identity["selectionLock"]["target"], resources
            )
    validate_lifecycle_records(package_identity, units_by_id, unit_paths, resources, manifest_digest)
    validate_lifecycle_negatives(package_identity, units_by_id, unit_paths, resources, manifest_digest)
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
    )
    results = json.loads(node_script.stdout)
    validated_inputs = validated_outputs = 0
    for result in results:
        validate_trace_assembly(result, graph, units_by_id, nodes_by_id, selected_providers)
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
        "lifecycleNegativeCases": 4,
    }, indent=2))


if __name__ == "__main__":
    main()
