// The picture in the README: `node ableton/window.js` redraws ableton/window.png.
// A D held for a second and a half: the curves swelling.
require('./kit/test/picture.js')(__dirname, { bundle: 'AutoCC.js', w: 820, h: 730,
  go(d) { [0x90, 62, 100].forEach((x) => d.send('msg_int', x)); d.run(1500); } });
