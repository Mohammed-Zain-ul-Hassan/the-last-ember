// Builds public/models/character/shadow.glb from the Quaternius Universal Animation Library
// (CC0, "Standard" packs from quaternius.itch.io): the UAL1 mannequin + the clips the rig uses.
//
//   node scripts/build-character.mjs <UAL1_Standard.glb> <UAL2_Standard.glb>
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup } from '@gltf-transform/functions';

const [ual1Path, ual2Path] = process.argv.slice(2);
if (!ual1Path || !ual2Path) {
  console.error('usage: node scripts/build-character.mjs <UAL1_Standard.glb> <UAL2_Standard.glb>');
  process.exit(1);
}

const KEEP_UAL1 = [
  'Idle_Loop',
  'Walk_Loop',
  'Jog_Fwd_Loop',
  'Sprint_Loop',
  'Jump_Start',
  'Jump_Loop',
  'Jump_Land',
  'Crouch_Idle_Loop',
  'Crouch_Fwd_Loop',
];
const KEEP_UAL2 = ['Slide_Start', 'Slide_Loop', 'Slide_Exit'];

const io = new NodeIO();
const doc = await io.read(ual1Path);
const src = await io.read(ual2Path);
const root = doc.getRoot();

for (const anim of root.listAnimations()) {
  if (KEEP_UAL1.includes(anim.getName())) continue;
  // Samplers must go too, or prune() keeps their accessors (which clips may share).
  for (const s of anim.listSamplers()) s.dispose();
  anim.dispose();
}

// Both packs share one skeleton, so UAL2 clips are copied across by target node name.
const nodesByName = new Map(root.listNodes().map((n) => [n.getName(), n]));
const buffer = root.listBuffers()[0];
const copyAccessor = (a) =>
  doc
    .createAccessor(a.getName())
    .setType(a.getType())
    .setArray(a.getArray().slice())
    .setBuffer(buffer);

for (const anim of src.getRoot().listAnimations()) {
  if (!KEEP_UAL2.includes(anim.getName())) continue;
  const out = doc.createAnimation(anim.getName());
  for (const ch of anim.listChannels()) {
    const target = nodesByName.get(ch.getTargetNode()?.getName());
    if (!target) continue;
    const s = ch.getSampler();
    const sampler = doc
      .createAnimationSampler()
      .setInput(copyAccessor(s.getInput()))
      .setOutput(copyAccessor(s.getOutput()))
      .setInterpolation(s.getInterpolation());
    out.addSampler(sampler);
    out.addChannel(doc.createAnimationChannel().setSampler(sampler).setTargetNode(target).setTargetPath(ch.getTargetPath()));
  }
}

await doc.transform(dedup(), prune());
const names = root.listAnimations().map((a) => a.getName());
const missing = [...KEEP_UAL1, ...KEEP_UAL2].filter((n) => !names.includes(n));
if (missing.length) throw new Error(`Missing clips: ${missing.join(', ')}`);

const outPath = 'public/models/character/shadow.glb';
await io.write(outPath, doc);
console.log(`Wrote ${outPath} with ${names.length} clips: ${names.join(' ')}`);
