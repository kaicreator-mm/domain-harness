// T009 (#595) Windows host orchestrator: drives the REAL-device validation
// against one installed release APK through adb. Two-phase force-stop/relaunch
// protocol: pm clear + launch once (phase-1 journeys, arms the T009-RELAUNCH
// barrier), `am force-stop` the Hermes process (no JS cleanup), relaunch
// (phase-2 recovery oracles), tail logcat for the machine-readable markers the
// app emits. Never clears app data after phase 1 — the durable store files ARE
// the object under test.
//
// Usage: node run-t009-device-validation.mjs --serial emulator-5554 --out <evidence dir>
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
const appPackage = 'com.kaicreator.domainharness.t009host';
const activity = `${appPackage}/.MainActivity`;
const adb = process.env.T009_ADB ?? 'C:/Android/Sdk/platform-tools/adb.exe';

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
  // Wait up to 10 minutes for the terminal marker on logcat.
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    spawnSync('sleep', ['2']);
    // -t bounds the dump to the recent ring-buffer tail.
    const text = adbSync(['logcat', '-d', '-t', '4000', '-s', 'ReactNativeJS:V'], 60000);
    appendFileSync(join(outDir, `launch-${launch}-logcat.txt`), text);
    const failLine = text.match(/T009_DEVICE_VALIDATION_FAIL ([\s\S]*?)(?=\n|$)/);
    if (failLine !== null && failLine !== undefined) {
      return { kind: 'fail', error: failLine[1], raw: true };
    }
    const parsed = parseChunkedTag(text, 'T009_DEVICE_VALIDATION');
    if (parsed !== undefined) {
      if (parsed.status === 'PASS') return { kind: 'pass', ...parsed };
      if (parsed.status === 'FAIL') return { kind: 'fail', ...parsed };
      if (parsed.status === 'ARMED') return { kind: 'armed', barrier: parsed.barrier ?? 'unknown', ...parsed };
      if (parsed.status === 'RESTART_REQUIRED') return { kind: 'restart-required', ...parsed };
    }
  }
  throw new Error(`launch ${launch}: no marker within 10 minutes`);
}

async function main() {
  log(`T009 host orchestrator start serial=${serial} package=${appPackage}`);
  log(`adb version: ${spawnSync(adb, ['--version'], { encoding: 'utf8' }).stdout.split('\n')[0]}`);

  const deviceId = {
    model: adbSync(['shell', 'getprop', 'ro.product.model']).trim(),
    fingerprint: adbSync(['shell', 'getprop', 'ro.build.fingerprint']).trim(),
    api: adbSync(['shell', 'getprop', 'ro.build.version.sdk']).trim(),
    abi: adbSync(['shell', 'getprop', 'ro.product.cpu.abi']).trim(),
    avd: adbSync(['emu', 'avd', 'name']).split('\n')[0].trim(),
  };
  log(`device identity: ${JSON.stringify(deviceId)}`);
  writeFileSync(join(outDir, 'device-identity.json'), JSON.stringify(deviceId, null, 2));

  // Precondition: the APK is installed.
  const dumpsys = adbSync(['shell', 'pm', 'path', appPackage]).trim();
  if (!dumpsys.startsWith('package:')) {
    throw new Error(`app ${appPackage} is not installed on ${serial}`);
  }
  log(`installed package path: ${dumpsys}`);
  writeFileSync(join(outDir, 'installed-package-path.txt'), dumpsys);

  // One clean phase-1 start: force-stop + pm clear + logcat clear.
  adbSync(['shell', 'am', 'force-stop', appPackage]);
  adbSync(['shell', 'pm', 'clear', appPackage]);
  adbSync(['logcat', '-c']);

  // Up to 3 launches accommodate the two-phase protocol plus one recovery
  // retry; the protocol settles in 2 (phase-1 ARMED -> force-stop -> phase-2).
  for (let launch = 1; launch <= 3; launch += 1) {
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

    const marker = await waitForMarker(launch);
    log(`launch ${launch}: marker status=${marker.status ?? marker.kind} kind=${marker.kind}`);
    writeFileSync(join(outDir, `launch-${launch}-marker.json`), JSON.stringify(marker, null, 2));

    if (marker.kind === 'armed') {
      // The relaunch stimulus: kill the process WITHOUT allowing JS cleanup,
      // verify the pid is gone, then relaunch for phase 2.
      const pidNow = adbSync(['shell', 'pidof', appPackage]).trim();
      adbSync(['shell', 'am', 'force-stop', appPackage]);
      const pidAfter = adbSync(['shell', 'pidof', appPackage]).trim();
      log(`force-stop after ARMED ${marker.barrier}: pid ${pidNow} -> '${pidAfter}'`);
      writeFileSync(join(outDir, 'force-stop-armed.txt'), `barrier=${marker.barrier}\npidBefore=${pidNow}\npidAfterForceStop=${pidAfter}\n`);
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
  throw new Error('exhausted 3 launches without a terminal marker');
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
