from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PACKAGE_ROOT.parents[1]
STANDARD_SCHEMA_DIR = REPO_ROOT / "docs" / "standards" / "domain-intelligence" / "DIS-0.1.0" / "schemas"
DOMAIN_DIR = PACKAGE_ROOT / "domain"
UNIT_DIR = DOMAIN_DIR / "units"
SCHEMA_DIR = DOMAIN_DIR / "schemas"

def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))

def fail(message: str):
    raise SystemExit("DIS validation failed: " + message)

def main():
    standard_schemas = {}
    for schema_path in sorted(STANDARD_SCHEMA_DIR.glob("*.schema.json")):
        schema = read_json(schema_path)
        Draft202012Validator.check_schema(schema)
        standard_schemas[schema_path.name] = schema

    required_standard_schemas = {
        "intelligence-unit.schema.json",
        "composition-graph.schema.json",
        "domain-definition.schema.json",
        "resource-closure.schema.json",
        "validation-report.schema.json",
    }
    if set(standard_schemas) != required_standard_schemas:
        fail("standard schema inventory is incomplete or contains unexpected files")

    unit_schema = standard_schemas["intelligence-unit.schema.json"]
    units = [read_json(path) for path in sorted(UNIT_DIR.glob("*.json"))]
    if len(units) != 6:
        fail(f"expected six demo Units, found {len(units)}")
    for unit in units:
        Draft202012Validator(unit_schema, format_checker=FormatChecker()).validate(unit)

    invalid_schema_refs = ["../escape.schema.json", "domain//empty.schema.json", "domain/./dot.schema.json", "https://example.invalid/remote.schema.json", "/absolute.schema.json", "domain\\backslash.schema.json"]
    for bad_ref in invalid_schema_refs:
        candidate = json.loads(json.dumps(units[0]))
        candidate["input"]["schemaRef"] = bad_ref
        if not list(Draft202012Validator(unit_schema).iter_errors(candidate)):
            fail(f"unsafe Unit schemaRef was accepted: {bad_ref}")

    graph = read_json(DOMAIN_DIR / "player-recognition.graph.json")
    definition = read_json(DOMAIN_DIR / "definition.json")
    closure = read_json(DOMAIN_DIR / "resource-closure.json")
    graph_validator = Draft202012Validator(standard_schemas["composition-graph.schema.json"])
    graph_validator.validate(graph)
    nested_pointer_graph = json.loads(json.dumps(graph))
    next(edge for edge in nested_pointer_graph["edges"] if edge.get("kind") == "data" and edge["to"]["node"] == "decide")["to"]["pointer"] = "/recognition/status"
    if not list(graph_validator.iter_errors(nested_pointer_graph)):
        fail("nested data pointer was accepted by the 0.1.0 top-level pointer profile")
    Draft202012Validator(standard_schemas["domain-definition.schema.json"]).validate(definition)
    Draft202012Validator(standard_schemas["resource-closure.schema.json"]).validate(closure)

    declared = {item["path"]: item["sha256"] for item in closure["resources"]}
    if len(declared) != len(closure["resources"]):
        fail("resource closure contains duplicate paths")
    actual_schema_paths = {
        str(path.relative_to(PACKAGE_ROOT)).replace("\\", "/")
        for path in SCHEMA_DIR.glob("*.schema.json")
    }
    if set(declared) != actual_schema_paths:
        fail("resource closure path set differs from the demo Schema inventory")
    for relative, expected_digest in declared.items():
        actual_digest = hashlib.sha256((PACKAGE_ROOT / relative).read_bytes()).hexdigest()
        if actual_digest != expected_digest:
            fail(f"resource digest mismatch: {relative}")

    registry = Registry()
    demo_schemas = {}
    for schema_path in sorted(SCHEMA_DIR.glob("*.schema.json")):
        relative = str(schema_path.relative_to(PACKAGE_ROOT)).replace("\\", "/")
        uri = "https://demo.invalid/" + relative
        schema = read_json(schema_path)
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
    units_by_id = {unit["id"]: unit for unit in units}

    for result in results:
        outputs = {entry["nodeId"]: entry["output"] for entry in result["trace"]}
        recognizer_output = outputs["recognize"]
        validator_resolution = outputs.get("resolve-known", outputs.get("bounded-fallback"))
        node_inputs = {
            "recognize": result["input"],
            "decide": {"recognition": recognizer_output},
            "resolve-known": {"recognition": recognizer_output},
            "bounded-fallback": {"recognition": recognizer_output},
            "validate": {"resolution": validator_resolution},
        }
        for entry in result["trace"]:
            unit = units_by_id[entry["unitId"]]
            output_schema = demo_schemas[unit["output"]["schemaRef"]]
            Draft202012Validator(output_schema, registry=registry, format_checker=FormatChecker()).validate(entry["output"])
            input_schema = demo_schemas[unit["input"]["schemaRef"]]
            Draft202012Validator(input_schema, registry=registry, format_checker=FormatChecker()).validate(node_inputs[entry["nodeId"]])

    print(json.dumps({
        "result": "PASS",
        "standardSchemas": len(standard_schemas),
        "units": len(units),
        "graphNodes": len(graph["nodes"]),
        "graphEdges": len(graph["edges"]),
        "closureResources": len(declared),
        "demoCases": len(results),
        "validatedNodeInputs": sum(len(item["trace"]) for item in results),
        "validatedNodeOutputs": sum(len(item["trace"]) for item in results),
        "cases": [{"label": item["label"], "outcome": item["outcome"]["status"]} for item in results],
    }, indent=2))

if __name__ == "__main__":
    main()
