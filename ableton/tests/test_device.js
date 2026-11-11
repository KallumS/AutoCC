/* The Max for Live device, run in Node on a pretend Max and a pretend Live.
 *   python3 ableton/kit/build.py ableton/device.json && node --test ableton/tests/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const suite = require('../kit/test/jsfx_suite.js');
require('../kit/test/palette_suite.js')();

const { device } = suite({ bundle: path.join(__dirname, '..', 'AutoCC.js'), name: 'AutoCC', window: [820, 730] });

test('a held note draws a controller arc', () => {
  const d = device();
  d.run(50);
  d.note(true, 62, 100);
  d.run(3000);
  d.note(false, 62);
  d.run(3000);
  const b = d.midi(), cc = [];
  for (let i = 0; i + 2 < b.length; i += 3) if ((b[i] & 0xF0) === 0xB0) cc.push(b[i + 2]);
  assert.ok(cc.length > 20, 'curves were played: ' + cc.length);
  const peak = Math.max(...cc);
  assert.ok(peak > cc[0] && peak > cc[cc.length - 1], 'it rises and falls');
});

test('Tab moves the keyboard focus, as in REAPER', () => {
  const d = device();
  d.run(100);
  const before = d.texts().join('|');
  d.send('key', 9);
  d.paint(); d.paint();
  assert.notStrictEqual(d.texts().join('|'), before, 'the window changed after Tab');
});
