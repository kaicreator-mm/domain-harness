from __future__ import annotations

import hashlib
import json
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


def condition_matches(output, condition):
    if condition is None:
        return True
    actual = pointer_get(output, condition["path"])
    operator = condition["operator"]
    if operator == "equals":
        return actual is not MISSING and actual == condition.get("value")
    if operator == "notEquals":
        return actual is MISSING or actual != condition.get("value")
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
                if property_name not in source_schema.get("required", []):
                    fail("control condition output property must be required")
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


def validate_trace_assembly(result: dict, graph: dict, units_by_id: dict, nodes_by_id: dict):
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
        if entry.get("input") != expected_input:
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
        if entry.get("evidence", {}) != expected_evidence:
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
    if result.get("outcome") != trace[-1].get("output"):
        fail(f"terminal outcome differs from final trace output: {result.get('label')}")


def main():
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
        validate_trace_assembly(result, graph, units_by_id, nodes_by_id)
        trace = result["trace"]
        if not trace or result["outcome"] != trace[-1]["output"]:
            fail(f"terminal outcome differs from last trace output: {result['label']}")
        if trace[-1]["nodeId"] not in graph["terminalNodes"]:
            fail(f"trace did not end at a declared terminal: {result['label']}")
        for entry in trace:
            node = nodes_by_id.get(entry["nodeId"])
            if not node or node["unitRef"]["id"] != entry["unitId"] or node["unitRef"]["revision"] != entry["unitRevision"]:
                fail(f"trace Unit identity mismatch: {entry['nodeId']}")
            unit = units_by_id[entry["unitId"]]
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
    }, indent=2))


if __name__ == "__main__":
    main()
