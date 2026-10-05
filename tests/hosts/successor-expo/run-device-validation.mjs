// SX wave #458 Windows host orchestrator: drives the real device validation
// against one installed release APK through adb. Executes the two-phase
// force-stop/relaunch protocol (#452 comment 5915129424 §5): pm clear once,
// launch, tail logcat for the machine-readable markers the Hermes process
// emits, force-stop at every armed crash barrier and between the phases,
// never clearing app data after phase 1.
//
// Usage: node run-device-validation.mjs --serial emulator-5554 --out evidence
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, exit } from 'node:process';

function arg(name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
}

const serial = arg('--serial', 'emulator-5554');
const outDir = resolve(arg('--out', 'evidence'));
const appPackage = 'com.kaicreator.domainharness.succexphost';
const activity = `${appPackage}/.MainActivity`;
const adb = 'C:/Android/Sdk/platform-tools/adb.exe';

mkdirSync(outDir, { recursive: true });
const logFile = join(outDir, 'device-validation-log.txt');

function log(line) {
  appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
  console.log(line);
}

function adbSync(args, timeoutMs = 30000) {
  const result = spawnSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  // Only a real spawn failure (timeout / binary missing) is fatal here. Remote
  // commands legitimately exit non-zero with empty output, e.g. `pidof` when
  // the app process is absent (before launch / after force-stop).
  if (result.error) {
    throw new Error(`adb ${args.join(' ')} failed: ${result.error.message}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

/**
 * Reassemble a chunked marker payload (`TAG <i>/<n> <chunk>` lines emitted by
 * the Hermes app because logcat truncates long single lines) and parse it as
 * JSON. Returns undefined until every chunk of the latest emission is present.
 */
function parseChunkedTag(text, tag) {
  const lines = [...text.matchAll(new RegExp(`${tag} (\\d+)/(\\d+) ([\\s\\S]*?)(?=\\n|$)`, 'g'))];
  if (lines.length === 0) return undefined;
  const last = lines[lines.length - 1];
  const total = Number(last[2]);
  const parts = new Map();
  // Walk backwards to collect the <total> chunks of the FINAL emission.
  for (let index = lines.length - 1; index >= 0 && parts.size < total; index -= 1) {
    const [, idx, n, chunk] = lines[index];
    if (Number(n) !== total) break;
    if (!parts.has(Number(idx))) parts.set(Number(idx), chunk);
  }
  if (parts.size !== total) return undefined;
  let payload = '';
  for (let index = 0; index < total; index += 1) {
    const part = parts.get(index);
    if (part === undefined) return undefined;
    // adb on Windows emits CRLF: a trailing CR would sit inside the
    // reassembled JSON string material and strict JSON.parse rejects raw
    // control characters. JSON.stringify output never contains raw CR, so
    // stripping is safe.
    payload += part.replace(/\r/g, '');
  }
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
}

async function waitForMarker(launch) {
  // Wait up to 30 minutes for exactly one terminal/armed marker on logcat.
  // The #458-era 10-minute window was calibrated on the warm v0.5-era
  // emulator (launch-to-marker ~3 min); the T010-R1 re-capture measured a
  // ~17.5-minute phase-1 launch on the cold shared AVD (v0.6 core on Hermes
  // plus host-side ANR noise), so the window is widened — the two-phase
  // protocol itself is unchanged.
  const deadline = Date.now() + 30 * 60 * 1000;
  let armed = null;
  while (Date.now() < deadline) {
    spawnSync('sleep', ['2']);
    // -t bounds the dump to the recent ring-buffer tail: -d output grows
    // every poll within one launch (logcat -c happens only between launches).
    const text = adbSync(['logcat', '-d', '-t', '2000', '-s', 'ReactNativeJS:V'], 60000);
    appendFileSync(join(outDir, `launch-${launch}-logcat.txt`), text);
    if (armed === null) {
      const match = text.match(/FAULT_BARRIER_ARMED:(\S+)/);
      if (match) armed = { kind: 'armed', barrier: match[1] };
    }
    const parsed = parseChunkedTag(text, 'SUCCESSOR_EXPO_VALIDATION');
    if (parsed !== undefined) {
      if (parsed.status === 'PASS') return { kind: 'pass', ...parsed };
      if (parsed.status === 'FAIL') return { kind: 'fail', ...parsed };
      if (parsed.status === 'RESTART_REQUIRED') return { kind: 'restart-required', ...parsed };
      if (parsed.status === 'ARMED') return { kind: 'armed', barrier: parsed.barrier ?? armed?.barrier };
    }
    // The FAULT_BARRIER_ARMED log line is emitted only AFTER the next
    // barrier's durable writes and the control-DB stage update are committed,
    // so it is itself a valid launch-terminal signal even if the ARMED result
    // payload is not (yet) parseable.
    if (armed !== null) return armed;
    const comparator = parseChunkedTag(text, 'SUCCESSOR_EXPO_COMPARATOR');
    if (comparator !== undefined) {
      writeFileSync(join(outDir, 'comparator.json'), JSON.stringify(comparator, null, 2));
    }
  }
  throw new Error(`launch ${launch}: no marker within 10 minutes (armed=${JSON.stringify(armed)})`);
}

async function main() {
  log(`SX458 host orchestrator start serial=${serial} package=${appPackage}`);
  log(`adb version: ${spawnSync(adb, ['--version'], { encoding: 'utf8' }).stdout.split('\n')[0]}`);

  const deviceId = {
    model: adbSync(['shell', 'getprop', 'ro.product.model']).trim(),
    fingerprint: adbSync(['shell', 'getprop', 'ro.build.fingerprint']).trim(),
    api: adbSync(['shell', 'getprop', 'ro.build.version.sdk']).trim(),
    abi: adbSync(['shell', 'getprop', 'ro.product.cpu.abi']).trim(),
  };
  log(`device identity: ${JSON.stringify(deviceId)}`);

  // Precondition: exactly one installed APK of the app.
  const dumpsys = adbSync(['shell', 'pm', 'path', appPackage]).trim();
  if (!dumpsys.startsWith('package:')) {
    throw new Error(`app ${appPackage} is not installed on ${serial}`);
  }
  log(`installed package path: ${dumpsys}`);

  const markers = [];

  // 1. one clean phase-1 start
  adbSync(['shell', 'am', 'force-stop', appPackage]);
  adbSync(['shell', 'pm', 'clear', appPackage]);
  adbSync(['logcat', '-c']);

  // Up to 8 launches accommodate the full barrier queue; the minimal
  // happy path settles in 6 (phase-1 journeys, barrier restarts, phase 2).
  for (let launch = 1; launch <= 8; launch += 1) {
    adbSync(['logcat', '-c']);
    const beforePid = adbSync(['shell', 'pidof', appPackage]).trim();
    adbSync(['shell', 'am', 'start', '-n', activity], 60000);
    // wait for the process to appear
    let pid = '';
    for (let attempt = 0; attempt < 30; attempt += 1) {
      spawnSync('sleep', ['1']);
      pid = adbSync(['shell', 'pidof', appPackage]).trim();
      if (pid && pid !== beforePid) break;
    }
    log(`launch ${launch}: pid=${pid} (before=${beforePid || 'none'})`);
    if (launch === 1) log(`phase1 pid=${pid}`);

    const marker = await waitForMarker(launch);
    markers.push(marker);
    log(`launch ${launch}: marker=${JSON.stringify(marker).slice(0, 400)}...`);
    writeFileSync(join(outDir, `launch-${launch}-marker.json`), JSON.stringify(marker, null, 2));

    if (marker.kind === 'armed') {
      // Crash-window stimulus: kill the process without allowing JS cleanup.
      const pidNow = adbSync(['shell', 'pidof', appPackage]).trim();
      adbSync(['shell', 'am', 'force-stop', appPackage]);
      const pidAfter = adbSync(['shell', 'pidof', appPackage]).trim();
      log(`force-stop after ARMED ${marker.barrier}: pid ${pidNow} -> '${pidAfter}'`);
      if (pidAfter) throw new Error(`process did not die after force-stop: ${pidAfter}`);
      continue;
    }
    if (marker.kind === 'restart-required') {
      const pidNow = adbSync(['shell', 'pidof', appPackage]).trim();
      adbSync(['shell', 'am', 'force-stop', appPackage]);
      const pidAfter = adbSync(['shell', 'pidof', appPackage]).trim();
      log(`force-stop after RESTART_REQUIRED (stage=${marker.stage}): pid ${pidNow} -> '${pidAfter}'`);
      if (pidAfter) throw new Error(`process did not die after force-stop: ${pidAfter}`);
      continue;
    }
    if (marker.kind === 'pass' || marker.kind === 'fail') {
      adbSync(['shell', 'am', 'force-stop', appPackage]);
      writeFileSync(join(outDir, 'final-result.json'), JSON.stringify(marker, null, 2));
      log(`terminal marker: ${marker.kind}`);
      return marker;
    }
    throw new Error(`unexpected marker kind ${marker.kind}`);
  }
  throw new Error('exhausted 8 launches without a terminal marker');
}

main()
  .then((final) => {
    log(`done: ${final.kind}`);
    exit(final.kind === 'pass' ? 0 : 1);
  })
  .catch((error) => {
    log(`FATAL: ${error?.message ?? String(error)}`);
    exit(2);
  });
