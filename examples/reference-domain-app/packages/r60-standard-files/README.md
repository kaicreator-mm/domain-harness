# v0.11.1 · Standard JSON/YAML File Elements (Node 22 ESM)

One directly-authored multi-file SDK Domain Package contains two independently selectable ordinary Elements: `dh.std.file.json` and `dh.std.file.yaml`. Each exposes both `readJson` / `writeJson` or `readYaml` / `writeYaml` through exact FunctionRefs. No Forge, new Kernel, runtime registry, or second BUILD.

**Library-backed formats:** Node's standardized `JSON.parse` / `JSON.stringify`, and the existing exact SRI-locked `yaml@2.9.1` library (`parseDocument` / `stringify`). No hand-written parsers or serializers. Pure read functions convert a selected, already verified UTF-8 `source` into a JsonValue. Pure write functions convert a JSON-compatible `value` into a UTF-8 `source` string; **write does not persist to a path**. Any persistent write requires a separately selected and authorized output resource/sink, which this package does not provide. Never open arbitrary filesystem/network access.

The KDP and Lock retain ResourceRef bytes, size, strict UTF-8, digest and permissions. Format Elements exclusively own JSON/YAML parsing and serialization. Both paths enforce 1 MiB encoded-byte limits, finite JsonValue, depth bound, prototype-key rejection, YAML 1.2 core, unique keys, strict diagnostics, and maxAliasCount=32. `SUCCEEDED` returns JsonValue for read and text for write; bad input uses `UNKNOWN`, invalid/unsafe data uses `FAILED`. No automatic rewrite of UNKNOWN/FAILED into success.

Importing another package's exported function requires direct package dependency and exact Element/FunctionRef. The package itself is only selected when needed; no second public SDK npm product is installed.
