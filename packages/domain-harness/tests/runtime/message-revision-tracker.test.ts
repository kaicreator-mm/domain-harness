import assert from 'node:assert/strict';
import test from 'node:test';

import { MessageRevisionTracker } from '../../src/runtime/message-revision-tracker.js';

test('message revisions stay bounded by active target-wide subscriptions (#170)', () => {
  const tracker = new MessageRevisionTracker();

  // Address churn without subscribers must retain nothing: bump is a no-op
  // unless the address is retained by at least one target-wide subscription.
  for (let index = 0; index < 1000; index += 1) {
    tracker.bump(JSON.stringify(['wf', `inst-${index}`]));
  }
  assert.equal(tracker.size, 0);
  assert.equal(tracker.read(JSON.stringify(['wf', 'inst-999'])), '0');

  const key = JSON.stringify(['wf', 'a']);
  tracker.retain(key);
  tracker.bump(key);
  tracker.bump(key);
  assert.equal(tracker.read(key), '2');
  assert.equal(tracker.size, 1);

  // A second subscriber shares the counter; releasing one keeps the state for
  // the remaining subscriber (no revision reset mid-session).
  tracker.retain(key);
  tracker.release(key);
  assert.equal(tracker.read(key), '2');
  assert.equal(tracker.size, 1);

  // The final release drops all ephemeral state for the address.
  tracker.release(key);
  assert.equal(tracker.size, 0);
  assert.equal(tracker.read(key), '0');

  // Resubscribe is deterministic and independent of stale cache history.
  tracker.retain(key);
  assert.equal(tracker.read(key), '0');
  tracker.bump(key);
  assert.equal(tracker.read(key), '1');
  tracker.release(key);

  // Unbalanced release is a safe no-op.
  tracker.release(JSON.stringify(['wf', 'never-retained']));
  assert.equal(tracker.size, 0);
});
