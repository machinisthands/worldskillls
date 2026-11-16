/* Machinist Hands — finds the sharp edges of a 3D part (for the thin dark CAD-style lines).
 * Runs as a Web Worker so the page stays responsive; js/viewer.js can also load it as a normal
 * script if workers are not allowed, and then calls self.MH_sharpEdges directly.
 *
 * Like three.js EdgesGeometry, but ignores the speckles CAD exports produce: it keeps only edges
 * shared by exactly two proper triangles meeting at a sharp angle, and drops short isolated chains.
 */
self.MH_sharpEdges = function (pos, index, angle, minChainRatio) {
  'use strict';
  const triCount = (index ? index.length : pos.length / 3) / 3;
  const vi = index ? (n) => index[n] : (n) => n;
  const X = (i) => pos[i * 3], Y = (i) => pos[i * 3 + 1], Z = (i) => pos[i * 3 + 2];

  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
    minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]);
    minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2]);
  }
  const size = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
  const q = 1e5 / size; // weld vertices closer than ~size/100000
  const key = (i) => Math.round(X(i) * q) + ',' + Math.round(Y(i) * q) + ',' + Math.round(Z(i) * q);
  const minArea = (size * 1e-5) ** 2;
  const cosLimit = Math.cos(angle * Math.PI / 180);

  const normals = new Float32Array(triCount * 3);
  const edges = new Map(); // "keyA|keyB" -> [vertexA, vertexB, tri1, tri2, count]
  for (let t = 0; t < triCount; t++) {
    const i0 = vi(t * 3), i1 = vi(t * 3 + 1), i2 = vi(t * 3 + 2);
    // normal = (c - b) × (a - b)
    const ux = X(i2) - X(i1), uy = Y(i2) - Y(i1), uz = Z(i2) - Z(i1);
    const wx = X(i0) - X(i1), wy = Y(i0) - Y(i1), wz = Z(i0) - Z(i1);
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz);
    if (len / 2 < minArea) continue; // sliver triangle: its normal is unreliable
    normals[t * 3] = nx / len; normals[t * 3 + 1] = ny / len; normals[t * 3 + 2] = nz / len;
    const ks = [key(i0), key(i1), key(i2)], is = [i0, i1, i2];
    for (let e = 0; e < 3; e++) {
      const k1 = ks[e], k2 = ks[(e + 1) % 3];
      if (k1 === k2) continue;
      const id = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
      const rec = edges.get(id);
      if (rec) { rec[3] = t; rec[4]++; } else edges.set(id, [is[e], is[(e + 1) % 3], t, -1, 1]);
    }
  }

  // 1) keep sharp edges between two proper triangles (ignore flipped, back-to-back triangles)
  const segs = []; // [vertexA, vertexB, keyA, keyB]
  edges.forEach((rec, id) => {
    const [i, j, t1, t2, count] = rec;
    if (count !== 2) return; // open seams and T-junctions are not real edges
    const dot = normals[t1 * 3] * normals[t2 * 3] + normals[t1 * 3 + 1] * normals[t2 * 3 + 1] + normals[t1 * 3 + 2] * normals[t2 * 3 + 2];
    if (dot > cosLimit || dot < -0.95) return;
    const [ka, kb] = id.split('|');
    segs.push([i, j, ka, kb]);
  });

  // 2) join touching segments into chains; drop short isolated chains (mesh noise, not real edges)
  const parent = new Map();
  const find = (k) => { let r = k; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(k) !== r) { const nx = parent.get(k); parent.set(k, r); k = nx; } return r; };
  const join = (x, y) => { if (!parent.has(x)) parent.set(x, x); if (!parent.has(y)) parent.set(y, y); const a = find(x), b = find(y); if (a !== b) parent.set(a, b); };
  segs.forEach((s) => join(s[2], s[3]));
  const chainLen = new Map();
  segs.forEach((s) => {
    const r = find(s[2]);
    chainLen.set(r, (chainLen.get(r) || 0) + Math.hypot(X(s[0]) - X(s[1]), Y(s[0]) - Y(s[1]), Z(s[0]) - Z(s[1])));
  });
  const minChain = size * minChainRatio;
  const out = [];
  segs.forEach(([i, j, ka]) => {
    if (chainLen.get(find(ka)) < minChain) return;
    out.push(X(i), Y(i), Z(i), X(j), Y(j), Z(j));
  });
  return new Float32Array(out);
};

// As a worker: { id, pos, index, angle, minChain } in → { id, lines } out
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = (e) => {
    const { id, pos, index, angle, minChain } = e.data;
    const lines = self.MH_sharpEdges(pos, index, angle, minChain);
    self.postMessage({ id, lines }, [lines.buffer]);
  };
}
