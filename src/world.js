import * as THREE from 'three';
import { GAME_CONFIG } from './config.js';
import { createWindowTexture } from './textures.js';

const ROAD_TEXTURE_TILE_METERS = 8;
const ROAD_LENGTH = 260;
const SIDEWALK_WIDTH = 3.2;
const SCENERY_RECYCLE_Z = 25;
const BUILDING_SPACING = 13;
const BUILDINGS_PER_SIDE = 16;
const TREE_SPACING = 11;
const TREES_PER_SIDE = 18;
const BUILDING_COLORS = [0xf4d6b0, 0xd9e4f5, 0xf7c6c7, 0xcfe8d5, 0xfbe7a1, 0xe0d4f7, 0xffffff];

export const ROAD_WIDTH = GAME_CONFIG.laneWidth * GAME_CONFIG.laneCount + 1;

function createRoadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = '#5b606b';
  context.fillRect(0, 0, 512, 512);

  const metersToPixels = 512 / ROAD_WIDTH;
  const roadHalfWidth = ROAD_WIDTH / 2;
  const edgeOffset = (GAME_CONFIG.laneWidth * GAME_CONFIG.laneCount) / 2;
  context.fillStyle = '#ffd54f';
  for (const edgeX of [-edgeOffset, edgeOffset]) {
    context.fillRect((edgeX + roadHalfWidth) * metersToPixels - 5, 0, 10, 512);
  }
  context.fillStyle = '#ffffff';
  for (const dividerX of [-GAME_CONFIG.laneWidth / 2, GAME_CONFIG.laneWidth / 2]) {
    context.fillRect((dividerX + roadHalfWidth) * metersToPixels - 4, 0, 8, 256);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, ROAD_LENGTH / ROAD_TEXTURE_TILE_METERS);
  texture.anisotropy = 8;
  return texture;
}

function createBuilding(windowTexture) {
  const width = 5 + Math.random() * 5;
  const height = 8 + Math.random() * 24;
  const depth = 9 + Math.random() * 3;
  const faceTexture = windowTexture.clone();
  faceTexture.needsUpdate = true;
  faceTexture.repeat.set(Math.round(depth / 2.2), Math.round(height / 2.6));
  const color = BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)];
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, map: faceTexture, roughness: 0.85 }),
  );
  building.userData.width = width;
  building.position.y = height / 2;
  building.receiveShadow = true;
  return building;
}

const treeTrunkGeometry = new THREE.CylinderGeometry(0.12, 0.16, 1.4, 8);
const treeCrownGeometry = new THREE.IcosahedronGeometry(0.9, 0);
const treeTrunkMaterial = new THREE.MeshStandardMaterial({ color: 0x7b5232 });
const treeCrownMaterial = new THREE.MeshStandardMaterial({ color: 0x5fae4e, flatShading: true });

function createTree() {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(treeTrunkGeometry, treeTrunkMaterial);
  trunk.position.y = 0.7;
  const crown = new THREE.Mesh(treeCrownGeometry, treeCrownMaterial);
  crown.position.y = 1.9;
  crown.scale.setScalar(0.8 + Math.random() * 0.5);
  trunk.castShadow = true;
  crown.castShadow = true;
  tree.add(trunk, crown);
  return tree;
}

function createSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#5fb8ff');
  gradient.addColorStop(0.45, '#b8e2ff');
  gradient.addColorStop(0.6, '#f6e7d6');
  gradient.addColorStop(1, '#f6e7d6');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function placeSceneryRow(sceneryItems, createItem, itemCount, spacing, getSideOffset, scene) {
  for (const sideSign of [-1, 1]) {
    for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
      const item = createItem();
      item.position.x = sideSign * getSideOffset(item);
      item.position.z = SCENERY_RECYCLE_Z - itemIndex * spacing;
      item.userData.recycleLength = itemCount * spacing;
      scene.add(item);
      sceneryItems.push(item);
    }
  }
}

export function createWorld(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = createSkyTexture();
  scene.fog = new THREE.Fog(0xf6e7d6, 70, 180);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 320);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d7b6a, 1.3));
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
  sunLight.position.set(8, 18, 8);
  sunLight.target.position.set(0, 0, -8);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunLight.shadow.camera, { left: -14, right: 14, top: 26, bottom: -16, near: 1, far: 60 });
  scene.add(sunLight, sunLight.target);

  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 420),
    new THREE.MeshStandardMaterial({ color: 0xb9d98c, roughness: 1 }),
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.set(0, -0.02, -170);
  groundPlane.receiveShadow = true;
  scene.add(groundPlane);

  const roadTexture = createRoadTexture();
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH),
    new THREE.MeshStandardMaterial({ map: roadTexture, roughness: 0.9 }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.z = -ROAD_LENGTH / 2 + 20;
  road.receiveShadow = true;
  scene.add(road);

  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0xd8cbbb, roughness: 0.95 });
  for (const sideSign of [-1, 1]) {
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(SIDEWALK_WIDTH, 0.2, ROAD_LENGTH), sidewalkMaterial);
    sidewalk.position.set(sideSign * (ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2), 0.1, road.position.z);
    sidewalk.receiveShadow = true;
    scene.add(sidewalk);
  }

  const sceneryItems = [];
  const windowTexture = createWindowTexture();
  placeSceneryRow(
    sceneryItems,
    () => createBuilding(windowTexture),
    BUILDINGS_PER_SIDE,
    BUILDING_SPACING,
    (building) => ROAD_WIDTH / 2 + SIDEWALK_WIDTH + 1.5 + building.userData.width / 2,
    scene,
  );
  placeSceneryRow(
    sceneryItems,
    createTree,
    TREES_PER_SIDE,
    TREE_SPACING,
    () => ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2,
    scene,
  );

  function update(moveDistance) {
    roadTexture.offset.y = (roadTexture.offset.y + moveDistance / ROAD_TEXTURE_TILE_METERS) % 1;
    for (const sceneryItem of sceneryItems) {
      sceneryItem.position.z += moveDistance;
      if (sceneryItem.position.z > SCENERY_RECYCLE_Z) {
        sceneryItem.position.z -= sceneryItem.userData.recycleLength;
      }
    }
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  return { renderer, scene, camera, update, resize };
}
