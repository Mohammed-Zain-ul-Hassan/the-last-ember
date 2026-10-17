// Deterministic review camera for Playwright: paste into browser_evaluate as `() => { ... }` body
// (or load via page.addInitScript). Requires ?autotest so window.__game exists.
//
//   window.__shot('01')  // overview of the west gallery from above
//   window.__shot('02')  // above the west deck
//   window.__shot('03')  // low angle from the court floor
//   window.__shot('04')  // player eye level on the west deck
//
// Wraps orbit.update so the rendered camera is placed explicitly (no collision pushes).
(() => {
  const g = window.__game;
  if (!g.orbit.__wrapped) {
    const orig = g.orbit.update.bind(g.orbit);
    g.orbit.update = (t, fp, dt) => {
      const c = orig(t, fp, dt);
      const f = window.__fc;
      if (f) {
        c.position.set(...f.pos);
        c.lookAt(...f.at);
        if (g.character.root) g.character.root.visible = false;
      }
      return c;
    };
    g.orbit.__wrapped = true;
  }
  const POSES = {
    '01': { pos: [1.0, 8.0, -19.0], at: [-7.5, 4.6, -26.5] }, // overview from above
    '02': { pos: [-3.2, 8.2, -21.5], at: [-7.5, 5.0, -26.0] }, // deck + nest
    '03': { pos: [-1.5, 1.7, -21.0], at: [-8.0, 3.8, -27.0] }, // from court floor, under gallery
    '04': { pos: [-6.0, 7.2, -23.6], at: [-8.6, 6.0, -27.6] }, // player eye on the deck
  };
  window.__shot = (id) => {
    g.setCameraMode('tp');
    g.teleport(0, 1.0, -22, 0);
    g.view(8, 180, 3);
    g.setKeys([]);
    window.__fc = POSES[id];
    return POSES[id];
  };
})();
