import * as THREE from 'three';
import { GAME_CONFIG, LANE_INDICES } from './config.js';
import { createLabelTexture, createStripeTexture } from './textures.js';
import { createIceCreamModel } from './models.js';

export const OBSTACLE_TYPES = {
  barrier: { width: 2.0, height: 1.0, depth: 0.5, bottom: 0, dashSmashable: true },
  banner: { width: 2.3, height: 1.0, depth: 0.3, bottom: 1.35, dashSmashable: true },
  bus: { width: 2.1, height: 2.9, depth: 8, bottom: 0, dashSmashable: false },
};

const sharedMaterials = {
  post: new THREE.MeshStandardMaterial({ color: 0x9e9e9e, metalness: 0.4, roughness: 0.5 }),
  busBody: new THREE.MeshStandardMaterial({ color: 0xffb300, roughness: 0.5 }),
  busWindow: new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.2, metalness: 0.3 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9 }),
};

function enableShadows(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function createBarrierModel() {
  const barrier = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.45, 0.14),
    new THREE.MeshStandardMaterial({ map: createStripeTexture() }),
  );
  board.position.y = 0.72;
  barrier.add(board);
  for (const sideSign of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.4), sharedMaterials.post);
    leg.position.set(sideSign * 0.85, 0.47, 0);
    barrier.add(leg);
  }
  return barrier;
}

function createBannerModel() {
  const banner = new THREE.Group();
  const cloth = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.95, 0.06),
    new THREE.MeshStandardMaterial({ map: createLabelTexture('志愿填报', '#c62828', '#ffeb3b') }),
  );
  cloth.position.y = 1.35 + 0.5;
  banner.add(cloth);
  for (const sideSign of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 8), sharedMaterials.post);
    pole.position.set(sideSign * 1.18, 1.25, 0);
    banner.add(pole);
  }
  return banner;
}

function createBusModel() {
  const bus = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.5, 8), sharedMaterials.busBody);
  body.position.y = 1.65;
  bus.add(body);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.0, 0.05), sharedMaterials.busWindow);
  windshield.position.set(0, 2.2, 4.01);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.45),
    new THREE.MeshBasicMaterial({ map: createLabelTexture('高考专线', '#1b5e20', '#ffffff') }),
  );
  sign.position.set(0, 1.35, 4.03);
  bus.add(windshield, sign);
  for (const sideSign of [-1, 1]) {
    const sideWindows = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 6.6), sharedMaterials.busWindow);
    sideWindows.position.set(sideSign * 1.06, 2.2, -0.2);
    bus.add(sideWindows);
    for (const axleZ of [-2.6, 2.6]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), sharedMaterials.tire);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(sideSign * 0.95, 0.42, axleZ);
      bus.add(tire);
    }
  }
  return bus;
}

const obstacleModelFactories = {
  barrier: createBarrierModel,
  banner: createBannerModel,
  bus: createBusModel,
};

const obstacleTemplates = {};
const SMASHED_GRAVITY = 30;
const ICE_CREAM_DEFAULT_HEIGHT = 1.0;
const ICE_CREAM_OVER_BARRIER_HEIGHT = 2.8;
const ICE_CREAM_UNDER_BANNER_HEIGHT = 0.5;
const ICE_CREAM_LINE_SPACING = 2.6;

function createObstacleModel(type) {
  if (!obstacleTemplates[type]) {
    const template = obstacleModelFactories[type]();
    enableShadows(template);
    obstacleTemplates[type] = template;
  }
  return obstacleTemplates[type].clone();
}

export function getLaneX(laneIndex) {
  return laneIndex * GAME_CONFIG.laneWidth;
}

function pickRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffleCopy(items) {
  const shuffledItems = [...items];
  for (let currentIndex = shuffledItems.length - 1; currentIndex > 0; currentIndex -= 1) {
    const swapIndex = Math.floor(Math.random() * (currentIndex + 1));
    [shuffledItems[currentIndex], shuffledItems[swapIndex]] = [shuffledItems[swapIndex], shuffledItems[currentIndex]];
  }
  return shuffledItems;
}

function pickObstacleType(difficulty) {
  const busWeight = 0.2 + 0.15 * difficulty;
  const roll = Math.random();
  if (roll < busWeight) {
    return 'bus';
  }
  return roll < busWeight + (1 - busWeight) * 0.55 ? 'barrier' : 'banner';
}

function computeRowGap(baseSpeed, difficulty) {
  const secondsBetweenRows = 1.35 - 0.55 * difficulty;
  return Math.max(16, baseSpeed * secondsBetweenRows);
}

export function createSpawner(scene, initialDifficultyPreset) {
  const obstacles = [];
  const iceCreams = [];
  let nextRowZ = -GAME_CONFIG.safeStartDistance;
  let difficultyPreset = initialDifficultyPreset;

  function addObstacle(type, laneIndex, rowZ) {
    const dimensions = OBSTACLE_TYPES[type];
    const model = createObstacleModel(type);
    // Rows are aligned by their front face so long buses extend away from the player.
    model.position.set(getLaneX(laneIndex), 0, rowZ - (dimensions.depth - OBSTACLE_TYPES.barrier.depth) / 2);
    scene.add(model);
    obstacles.push({
      type,
      laneIndex,
      model,
      ...dimensions,
      isSmashed: false,
      velocity: new THREE.Vector3(),
      spin: new THREE.Vector3(),
    });
  }

  function addIceCream(laneIndex, positionZ, heightAboveGround = ICE_CREAM_DEFAULT_HEIGHT) {
    const model = createIceCreamModel();
    model.position.set(getLaneX(laneIndex), heightAboveGround, positionZ);
    scene.add(model);
    iceCreams.push({ laneIndex, model, baseHeight: heightAboveGround, isMagnetized: false });
  }

  function spawnRow(rowZ, difficulty) {
    const twoObstacleChance = 0.2 + 0.45 * difficulty;
    const obstacleCount = Math.random() < twoObstacleChance ? 2 : 1;
    const shuffledLanes = shuffleCopy(LANE_INDICES);
    const blockedLanes = shuffledLanes.slice(0, obstacleCount);
    const freeLanes = shuffledLanes.slice(obstacleCount);

    const bonusChanceScale = difficultyPreset.bonusIceCreamChanceScale;
    const overOrUnderChance = 0.35 * bonusChanceScale;
    const beforeImpactChance = 0.6 * bonusChanceScale;

    for (const laneIndex of blockedLanes) {
      const obstacleType = pickObstacleType(difficulty);
      addObstacle(obstacleType, laneIndex, rowZ);
      const bonusRoll = Math.random();
      if (obstacleType === 'barrier' && bonusRoll < overOrUnderChance) {
        addIceCream(laneIndex, rowZ, ICE_CREAM_OVER_BARRIER_HEIGHT);
      } else if (obstacleType === 'banner' && bonusRoll < overOrUnderChance) {
        addIceCream(laneIndex, rowZ, ICE_CREAM_UNDER_BANNER_HEIGHT);
      } else if (obstacleType !== 'bus' && bonusRoll < beforeImpactChance) {
        // Eating this one right before impact grants a dash that smashes the obstacle.
        addIceCream(laneIndex, rowZ + 3);
      }
    }

    if (Math.random() >= difficultyPreset.iceCreamLineChance) {
      return;
    }
    const iceCreamLane = pickRandomItem(freeLanes);
    const iceCreamCount =
      difficultyPreset.iceCreamLineMinCount + Math.floor(Math.random() * (difficultyPreset.iceCreamLineExtraCount + 1));
    for (let iceCreamIndex = 0; iceCreamIndex < iceCreamCount; iceCreamIndex += 1) {
      addIceCream(iceCreamLane, rowZ + 6 - iceCreamIndex * ICE_CREAM_LINE_SPACING);
    }
  }

  function removeObstacleAt(obstacleIndex) {
    scene.remove(obstacles[obstacleIndex].model);
    obstacles.splice(obstacleIndex, 1);
  }

  function removeIceCream(iceCream) {
    const iceCreamIndex = iceCreams.indexOf(iceCream);
    if (iceCreamIndex !== -1) {
      scene.remove(iceCream.model);
      iceCreams.splice(iceCreamIndex, 1);
    }
  }

  function smashObstacle(obstacle, playerX) {
    obstacle.isSmashed = true;
    const sideDirection = Math.sign(obstacle.model.position.x - playerX) || (Math.random() < 0.5 ? -1 : 1);
    obstacle.velocity.set(sideDirection * (6 + Math.random() * 6), 9 + Math.random() * 6, -18 - Math.random() * 10);
    obstacle.spin.set(Math.random() * 8 - 4, Math.random() * 8 - 4, sideDirection * (4 + Math.random() * 4));
  }

  function update(deltaSeconds, moveDistance, baseSpeed, difficulty, elapsedSeconds) {
    nextRowZ += moveDistance;
    while (nextRowZ > -GAME_CONFIG.spawnAheadDistance) {
      spawnRow(nextRowZ, difficulty);
      nextRowZ -= computeRowGap(baseSpeed, difficulty);
    }

    for (let obstacleIndex = obstacles.length - 1; obstacleIndex >= 0; obstacleIndex -= 1) {
      const obstacle = obstacles[obstacleIndex];
      obstacle.model.position.z += moveDistance;
      if (obstacle.isSmashed) {
        obstacle.velocity.y -= SMASHED_GRAVITY * deltaSeconds;
        obstacle.model.position.addScaledVector(obstacle.velocity, deltaSeconds);
        obstacle.model.rotation.x += obstacle.spin.x * deltaSeconds;
        obstacle.model.rotation.y += obstacle.spin.y * deltaSeconds;
        obstacle.model.rotation.z += obstacle.spin.z * deltaSeconds;
      }
      const isBehindPlayer = obstacle.model.position.z - obstacle.depth / 2 > GAME_CONFIG.despawnBehindDistance;
      const hasFallenAway = obstacle.isSmashed && obstacle.model.position.y < -10;
      if (isBehindPlayer || hasFallenAway) {
        removeObstacleAt(obstacleIndex);
      }
    }

    for (let iceCreamIndex = iceCreams.length - 1; iceCreamIndex >= 0; iceCreamIndex -= 1) {
      const iceCream = iceCreams[iceCreamIndex];
      iceCream.model.position.z += moveDistance;
      iceCream.model.rotation.y = elapsedSeconds * 3 + iceCreamIndex;
      if (!iceCream.isMagnetized) {
        iceCream.model.position.y = iceCream.baseHeight + Math.sin(elapsedSeconds * 4 + iceCreamIndex) * 0.12;
      }
      if (iceCream.model.position.z > GAME_CONFIG.despawnBehindDistance) {
        scene.remove(iceCream.model);
        iceCreams.splice(iceCreamIndex, 1);
      }
    }
  }

  function reset(nextDifficultyPreset = difficultyPreset) {
    difficultyPreset = nextDifficultyPreset;
    for (const obstacle of obstacles) {
      scene.remove(obstacle.model);
    }
    for (const iceCream of iceCreams) {
      scene.remove(iceCream.model);
    }
    obstacles.length = 0;
    iceCreams.length = 0;
    nextRowZ = -GAME_CONFIG.safeStartDistance;
  }

  return { obstacles, iceCreams, update, reset, smashObstacle, removeIceCream };
}
