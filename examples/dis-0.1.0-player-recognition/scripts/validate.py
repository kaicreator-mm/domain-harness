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
    units = [read_json(path) for path in sorted(UNIT_DIR.glob("*.json"))]
    if len(units) != len(closure["units"]):
        fail("Unit inventory does not match Resource Closure")
    for unit in units:
        Draft202012Validator(unit_schema, format_checker=FormatChecker()).validate(unit)
        for source in unit.get("evidence", {}).get("sources", []):
            validate_provenance_ref(source.get("ref"))
    units_by_id = {unit["id"]: unit for unit in units}
    if len(units_by_id) != len(units):
        fail("duplicate Unit identity")

    graph = read_json(DOMAIN_DIR / "player-recognition.graph.json")
    definition = read_json(DOMAIN_DIR / "definition.json")
    Draft202012Validator(graph_schema).validate(graph)
    Draft202012Validator(definition_schema).validate(definition)
    Draft202012Validator(closure_schema).validate(closure)

    nodes_by_id = {node["nodeId"]: node for node in graph["nodes"]}
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
    }, indent=2))


if __name__ == "__main__":
    main()
