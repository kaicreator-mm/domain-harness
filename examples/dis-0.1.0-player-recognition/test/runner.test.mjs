import test from "node:test";
import assert from "node:assert/strict";
import { loadDemo, runPipeline, routeRecognition, resolvePlayer, validateUnit, DisExecutionError } from "../src/runner.mjs";

const loadedPromise = loadDemo();

test("known player follows deterministic recognizer -> decision -> private procedure -> validator", async () => {
  const loaded = await loadedPromise;
  const result = await runPipeline({ url: "https://example.test/watch", signals: ["jwplayer.setup({})"] }, loaded);
  assert.equal(result.outcome.status, "READY");
  assert.equal(result.outcome.playerId, "jwplayer");
  assert.equal(result.outcome.strategyId, "jwplayer.extract.v1");
  assert.equal(result.trace.map((item) => item.nodeId).join(","), "recognize,decide,resolve-known,validate");
});

test("ambiguous recognition asks for input instead of guessing", async () => {
  const loaded = await loadedPromise;
  const result = await runPipeline({ url: "https://example.test/watch", signals: ["jwplayer", "videojs"] }, loaded);
  assert.equal(result.outcome.status, "NEEDS_INPUT");
  assert.equal(result.outcome.reason, "multiple-player-candidates");
  assert.equal(result.outcome.playerId, undefined);
});

test("unknown recognition escalates instead of inventing a player", async () => {
  const loaded = await loadedPromise;
  const result = await runPipeline({ url: "https://example.test/watch", signals: ["custom-player"] }, loaded);
  assert.equal(result.outcome.status, "NEEDS_REVIEW");
  assert.equal(result.outcome.reason, "no-supported-player-candidate");
});

test("invalid input is rejected before recognition", async () => {
  const loaded = await loadedPromise;
  await assert.rejects(() => runPipeline({ url: "file:///etc/passwd", signals: [] }, loaded), (error) => error instanceof DisExecutionError && error.code === "INVALID_INPUT");
});

test("evidence survives the selected path to the terminal validator", async () => {
  const loaded = await loadedPromise;
  for (const signals of [["jwplayer"], ["unknown"]]) {
    const result = await runPipeline({ url: "https://example.test/watch", signals }, loaded);
    assert.ok(result.outcome.evidence.length > 0);
    assert.equal(result.outcome.evidenceCount, result.outcome.evidence.length);
  }
});

test("private procedure remains private and is not reclassified as a Tool", async () => {
  const loaded = await loadedPromise;
  const unit = loaded.unitsById.get("xdownload.player.resolve-procedure");
  assert.equal(unit.role, "procedure");
  assert.equal(unit.implementation.exposure, "private");
  assert.notEqual(unit.role, "tool");
});

test("initial draft exposes control/data coupling: downstream nodes must echo upstream evidence", async () => {
  const loaded = await loadedPromise;
  const decision = routeRecognition({ recognition: { status: "recognized", candidates: ["jwplayer"], evidence: [{ sourceId: "page-observation" }] } });
  const resolved = resolvePlayer({ recognition: decision.recognition });
  assert.deepEqual(resolved.evidence, decision.recognition.evidence);
  assert.ok(loaded.graph.edges.every((edge) => !("kind" in edge)));
  assert.ok(loaded.graph.edges.some((edge) => edge.from === "resolve-known" && edge.to === "validate"));
  assert.ok(!loaded.graph.edges.some((edge) => edge.from === "recognize" && edge.to === "validate"));
});

test("initial draft accepts an unresolved schemaRef because references are only checked as strings", async () => {
  const loaded = await loadedPromise;
  const unit = structuredClone(loaded.unitsById.get("xdownload.player.recognizer"));
  unit.input.schemaRef = "schemas/does-not-exist.schema.json";
  assert.equal(validateUnit(unit), true);
});