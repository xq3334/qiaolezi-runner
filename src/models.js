import * as THREE from 'three';

function createStandardMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05, ...options });
}

const playerMaterials = {
  suit: createStandardMaterial(0x1f2a44),
  pants: createStandardMaterial(0x23262e),
  shirt: createStandardMaterial(0xffffff),
  tie: createStandardMaterial(0xc62828),
  skin: createStandardMaterial(0xf2c9a1, { roughness: 0.8 }),
  hair: createStandardMaterial(0x161616, { roughness: 0.9 }),
  glasses: createStandardMaterial(0x0d0d0d, { roughness: 0.3, metalness: 0.6 }),
  shoes: createStandardMaterial(0x3b2418),
  mouth: createStandardMaterial(0x8e2b2b),
};

const iceCreamMaterials = {
  wafer: createStandardMaterial(0xd89b4f, { roughness: 0.9 }),
  waferGrid: new THREE.MeshBasicMaterial({ color: 0x9c6326, wireframe: true }),
  chocolate: createStandardMaterial(0x4a2511, { roughness: 0.3 }),
  nut: createStandardMaterial(0xe8c07d, { roughness: 0.8 }),
  wrapper: createStandardMaterial(0xd32f2f, { side: THREE.DoubleSide }),
  halo: new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.75 }),
};

const iceCreamGeometries = {
  cone: new THREE.ConeGeometry(0.26, 0.78, 18),
  waferGrid: new THREE.ConeGeometry(0.265, 0.79, 10, 4, true),
  chocolateCap: new THREE.SphereGeometry(0.3, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
  chocolateRim: new THREE.CylinderGeometry(0.3, 0.28, 0.14, 18),
  nut: new THREE.DodecahedronGeometry(0.045),
  wrapperBand: new THREE.CylinderGeometry(0.27, 0.2, 0.26, 18, 1, true),
  halo: new THREE.TorusGeometry(0.55, 0.04, 8, 32),
};

const nutPlacements = Array.from({ length: 9 }, (unusedValue, nutIndex) => {
  const azimuth = nutIndex * 2.39;
  const elevation = 0.25 + (nutIndex % 3) * 0.35;
  return new THREE.Vector3(
    Math.cos(azimuth) * Math.cos(elevation) * 0.3,
    Math.sin(elevation) * 0.24,
    Math.sin(azimuth) * Math.cos(elevation) * 0.3,
  );
});

export function createIceCreamModel({ withHalo = true } = {}) {
  const iceCream = new THREE.Group();

  const cone = new THREE.Mesh(iceCreamGeometries.cone, iceCreamMaterials.wafer);
  cone.rotation.x = Math.PI;
  const waferGrid = new THREE.Mesh(iceCreamGeometries.waferGrid, iceCreamMaterials.waferGrid);
  waferGrid.rotation.x = Math.PI;
  const wrapperBand = new THREE.Mesh(iceCreamGeometries.wrapperBand, iceCreamMaterials.wrapper);
  wrapperBand.position.y = 0.23;
  const chocolateRim = new THREE.Mesh(iceCreamGeometries.chocolateRim, iceCreamMaterials.chocolate);
  chocolateRim.position.y = 0.42;
  const chocolateCap = new THREE.Mesh(iceCreamGeometries.chocolateCap, iceCreamMaterials.chocolate);
  chocolateCap.position.y = 0.47;
  chocolateCap.scale.y = 0.8;
  iceCream.add(cone, waferGrid, wrapperBand, chocolateRim, chocolateCap);

  for (const nutPlacement of nutPlacements) {
    const nut = new THREE.Mesh(iceCreamGeometries.nut, iceCreamMaterials.nut);
    nut.position.copy(nutPlacement).add(new THREE.Vector3(0, 0.47, 0));
    iceCream.add(nut);
  }

  if (withHalo) {
    const halo = new THREE.Mesh(iceCreamGeometries.halo, iceCreamMaterials.halo);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.1;
    iceCream.add(halo);
  }

  iceCream.traverse((child) => {
    if (child.isMesh && child.material !== iceCreamMaterials.halo) {
      child.castShadow = true;
    }
  });
  return iceCream;
}

function createLimb(width, length, depth, limbMaterial, endMaterial, isLeg) {
  const pivot = new THREE.Group();
  const limb = new THREE.Mesh(new THREE.BoxGeometry(width, length, depth), limbMaterial);
  limb.position.y = -length / 2;
  pivot.add(limb);
  if (isLeg) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(width * 1.1, 0.12, depth * 1.6), endMaterial);
    shoe.position.set(0, -length + 0.02, depth * 0.3);
    pivot.add(shoe);
  } else {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), endMaterial);
    hand.position.y = -length - 0.04;
    pivot.add(hand);
  }
  return pivot;
}

function createHead() {
  const head = new THREE.Group();
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), playerMaterials.skin);
  face.scale.set(1, 1.08, 0.95);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.315, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45),
    playerMaterials.hair,
  );
  hair.position.set(0, 0.05, -0.02);
  hair.rotation.x = -0.28;
  head.add(face, hair);

  for (const sideSign of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.018, 8, 20), playerMaterials.glasses);
    lens.position.set(sideSign * 0.11, 0.02, 0.29);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), playerMaterials.glasses);
    eye.position.set(sideSign * 0.11, 0.02, 0.265);
    const eyebrow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.028, 0.02), playerMaterials.hair);
    eyebrow.position.set(sideSign * 0.11, 0.14, 0.28);
    const templeArm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.26), playerMaterials.glasses);
    templeArm.position.set(sideSign * 0.2, 0.03, 0.17);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), playerMaterials.skin);
    ear.position.set(sideSign * 0.29, 0, 0);
    head.add(lens, eye, eyebrow, templeArm, ear);
  }
  const glassesBridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), playerMaterials.glasses);
  glassesBridge.position.set(0, 0.03, 0.29);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.02), playerMaterials.mouth);
  mouth.position.set(0, -0.14, 0.27);
  head.add(glassesBridge, mouth);
  return head;
}

/** Built facing +Z; the game rotates it by PI so it runs toward -Z. */
export function createPlayerModel() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const leftLeg = createLimb(0.24, 0.84, 0.26, playerMaterials.pants, playerMaterials.shoes, true);
  leftLeg.position.set(-0.17, 0.9, 0);
  const rightLeg = createLimb(0.24, 0.84, 0.26, playerMaterials.pants, playerMaterials.shoes, true);
  rightLeg.position.set(0.17, 0.9, 0);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.78, 0.42), playerMaterials.suit);
  torso.position.y = 1.28;
  const shirtFront = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.5, 0.02), playerMaterials.shirt);
  shirtFront.position.set(0, 1.42, 0.215);
  const tie = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 0.02), playerMaterials.tie);
  tie.position.set(0, 1.38, 0.228);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.18), playerMaterials.skin);
  neck.position.y = 1.72;

  const leftArm = createLimb(0.18, 0.66, 0.2, playerMaterials.suit, playerMaterials.skin, false);
  leftArm.position.set(-0.47, 1.62, 0);
  const rightArm = createLimb(0.18, 0.66, 0.2, playerMaterials.suit, playerMaterials.skin, false);
  rightArm.position.set(0.47, 1.62, 0);
  const heldIceCream = createIceCreamModel({ withHalo: false });
  heldIceCream.scale.setScalar(0.45);
  heldIceCream.position.set(0, -0.86, 0.1);
  rightArm.add(heldIceCream);

  const head = createHead();
  head.position.y = 2.02;

  body.add(leftLeg, rightLeg, torso, shirtFront, tie, neck, leftArm, rightArm, head);
  body.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
    }
  });

  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffc107,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  aura.scale.set(1, 1.35, 1);
  aura.position.y = 1.1;
  aura.visible = false;
  root.add(aura);

  return { root, body, head, leftLeg, rightLeg, leftArm, rightArm, aura };
}
