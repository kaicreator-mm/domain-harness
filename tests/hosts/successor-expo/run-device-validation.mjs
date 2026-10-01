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
  const result = spawnSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: timeoutMs });
  // Only a real spawn failure (timeout / binary missing) is fatal here. Remote
  // commands legitimately exit non-zero with empty output, e.g. `pidof` when
  // the app process is absent (before launch / after force-stop).
  if (result.error) {
    throw new Error(`adb ${args.join(' ')} failed: ${result.error.message}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

async function waitForMarker(launch) {
  // Wait up to 10 minutes for exactly one terminal/armed marker on logcat.
  const deadline = Date.now() + 10 * 60 * 1000;
  let armed = null;
  while (Date.now() < deadline) {
    spawnSync('sleep', ['2']);
    const text = adbSync(['logcat', '-d', '-s', 'ReactNativeJS:V'], 60000);
    appendFileSync(join(outDir, `launch-${launch}-logcat.txt`), text);
    if (armed === null) {
      const match = text.match(/FAULT_BARRIER_ARMED:(\S+)/);
      if (match) armed = { kind: 'armed', barrier: match[1] };
    }
    const validationLines = [...text.matchAll(/SUCCESSOR_EXPO_VALIDATION\s+(\{.*)/g)];
    for (const lineMatch of validationLines) {
      let parsed;
      try {
        parsed = JSON.parse(lineMatch[1]);
      } catch {
        continue;
      }
      if (parsed.status === 'PASS') return { kind: 'pass', ...parsed };
      if (parsed.status === 'FAIL') return { kind: 'fail', ...parsed };
      if (parsed.status === 'RESTART_REQUIRED') return { kind: 'restart-required', ...parsed };
    }
    const comparatorLines = [...text.matchAll(/SUCCESSOR_EXPO_COMPARATOR\s+(\{.*)/g)];
    if (comparatorLines.length > 0) {
      try {
        writeFileSync(join(outDir, 'comparator.json'), JSON.stringify(JSON.parse(comparatorLines[comparatorLines.length - 1][1]), null, 2));
      } catch {
        // comparator line truncated in logcat; final-result.json still has the aggregate
      }
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
