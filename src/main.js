import * as THREE from 'three';
import './style.css';
import { GAME_CONFIG, SPEECH_LINES } from './config.js';
import { createWorld } from './world.js';
import { createSpawner, getLaneX } from './obstacles.js';
import { createPlayerModel } from './models.js';
import { createAudioEngine, RUN_AUDIO_MODE } from './audio.js';

const MIN_LANE_INDEX = -1;
const MAX_LANE_INDEX = 1;
const MAX_FRAME_SECONDS = 0.05;
// Short physics steps keep fast dashes from tunnelling through thin obstacles like barriers.
const MAX_STEP_DISTANCE = 0.35;

const PLAYER_HALF_WIDTH = 0.35;
const PLAYER_HALF_DEPTH = 0.3;
const PLAYER_STANDING_HEIGHT = 2.2;
const PLAYER_SLIDING_HEIGHT = 1.0;
const LANE_CHANGE_TOLERANCE = 0.1;
const HEAD_ON_PENETRATION_TOLERANCE = 0.05;

const ICE_CREAM_REACH_HALF_WIDTH = 0.95;
const ICE_CREAM_REACH_HALF_DEPTH = 0.9;
const ICE_CREAM_REACH_VERTICAL_MARGIN = 0.35;
const MAGNET_PULL_SHARPNESS = 10;
const MAGNET_TARGET_HEIGHT = 1.2;
const MAGNET_BEHIND_LIMIT = 2;

const MAX_ENERGY = 100;
const ICE_CREAMS_PER_MULTIPLIER_STEP = 3;
const SPEECH_EVERY_COMBO_COUNT = 5;

const MENU_RUN_SPEED = 8;
const MAX_CADENCE_SPEED = 30;
const STRIDE_RADIANS_PER_METER = 0.5;
const POSE_BLEND_SHARPNESS = 20;
const EAT_ANIMATION_SECONDS = 0.35;
const DEATH_SEQUENCE_SECONDS = 0.9;

const RESTART_INPUT_DELAY_MS = 450;
const SWIPE_THRESHOLD_PIXELS = 28;
const DOUBLE_TAP_WINDOW_MS = 320;
const SPEECH_VISIBLE_MS = 1400;
const POPUP_LIFETIME_MS = 900;
const POPUP_HORIZONTAL_SPREAD_PIXELS = 120;
const BEST_SCORE_STORAGE_KEY = 'qiaolezi-runner-best-score';

const CAMERA_FOLLOW_SHARPNESS = 5;
const CAMERA_SHAKE_DECAY = 6;
const CHASE_CAMERA_HEIGHT = 4.3;
const CHASE_CAMERA_DISTANCE = 7.8;
const CHASE_CAMERA_LANE_FOLLOW = 0.65;
const CHASE_CAMERA_JUMP_FOLLOW = 0.35;
const CHASE_LOOK_AHEAD_Z = -9;
const CHASE_LOOK_HEIGHT = 1.5;
const CHASE_LOOK_LANE_FOLLOW = 0.85;
const CHASE_LOOK_JUMP_FOLLOW = 0.3;
const MENU_CAMERA_POSITION = new THREE.Vector3(-2.4, 2.0, -4.8);
const MENU_CAMERA_LOOK_TARGET = new THREE.Vector3(1.2, 1.35, 0);
const FIELD_OF_VIEW_SHARPNESS = 6;
const DASH_FIELD_OF_VIEW_BONUS = 8;
const SUPER_DASH_FIELD_OF_VIEW_BONUS = 16;

const PHASE = Object.freeze({
  menu: 'menu',
  playing: 'playing',
  paused: 'paused',
  dying: 'dying',
  gameOver: 'gameover',
});

const GAME_OVER_TITLES = {
  barrier: '撞上路障了',
  banner: '被志愿填报横幅拦住了',
  bus: '高考专线大巴没让路',
};

const KEY_BINDINGS = {
  laneLeft: new Set(['KeyA', 'ArrowLeft']),
  laneRight: new Set(['KeyD', 'ArrowRight']),
  jump: new Set(['KeyW', 'ArrowUp', 'Space']),
  slide: new Set(['KeyS', 'ArrowDown']),
  superDash: new Set(['ShiftLeft', 'ShiftRight']),
  pause: new Set(['KeyP', 'Escape']),
  confirm: new Set(['Enter', 'Space']),
  mute: new Set(['KeyM']),
};
const KEYS_WITH_BROWSER_DEFAULTS = new Set(['Space', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

const elements = {
  canvasContainer: document.getElementById('game-canvas-container'),
  speedLines: document.getElementById('speed-lines'),
  hud: document.getElementById('hud'),
  hudScore: document.getElementById('hud-score'),
  hudDistance: document.getElementById('hud-distance'),
  hudIceCreams: document.getElementById('hud-ice-creams'),
  hudCombo: document.getElementById('hud-combo'),
  energyPanel: document.getElementById('energy-panel'),
  energyHint: document.getElementById('energy-hint'),
  energyTrack: document.getElementById('energy-track'),
  energyFill: document.getElementById('energy-fill'),
  superButton: document.getElementById('super-button'),
  speechBubble: document.getElementById('speech-bubble'),
  popupLayer: document.getElementById('popup-layer'),
  menuScreen: document.getElementById('menu-screen'),
  startButton: document.getElementById('start-button'),
  menuBest: document.getElementById('menu-best'),
  pauseScreen: document.getElementById('pause-screen'),
  resumeButton: document.getElementById('resume-button'),
  gameOverScreen: document.getElementById('gameover-screen'),
  gameOverTitle: document.getElementById('gameover-title'),
  resultScore: document.getElementById('result-score'),
  resultDistance: document.getElementById('result-distance'),
  resultIceCreams: document.getElementById('result-ice-creams'),
  resultCombo: document.getElementById('result-combo'),
  resultBest: document.getElementById('result-best'),
  restartButton: document.getElementById('restart-button'),
  muteButton: document.getElementById('mute-button'),
};
const overlayScreens = [elements.menuScreen, elements.pauseScreen, elements.gameOverScreen];

const world = createWorld(elements.canvasContainer);
const spawner = createSpawner(world.scene);
const player = createPlayerModel();
player.root.rotation.y = Math.PI;
world.scene.add(player.root);

const audio = createAudioEngine();

const baseFieldOfView = world.camera.fov;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function createInitialRunState() {
  return {
    elapsedSeconds: 0,
    distanceMeters: 0,
    bonusPoints: 0,
    iceCreamsEaten: 0,
    comboCount: 0,
    bestComboCount: 0,
    secondsSinceLastIceCream: Number.POSITIVE_INFINITY,
    energy: 0,
    dashSecondsLeft: 0,
    superDashSecondsLeft: 0,
    deathSecondsElapsed: 0,
    crashedObstacleType: null,
  };
}

function createInitialPlayerState() {
  return {
    targetLane: 0,
    laneBeforeSwitch: 0,
    positionX: 0,
    positionY: 0,
    verticalVelocity: 0,
    slideSecondsLeft: 0,
    isSlideQueuedForLanding: false,
    eatAnimationSecondsLeft: 0,
  };
}

let currentPhase = PHASE.menu;
const runState = createInitialRunState();
const playerState = createInitialPlayerState();
let runCyclePhase = 0;
let animationClockSeconds = 0;
let gameOverShownAtMs = 0;
let speechHideTimeoutId = 0;
let bestScore = loadBestScore();

const cameraRig = {
  basePosition: MENU_CAMERA_POSITION.clone(),
  lookTarget: MENU_CAMERA_LOOK_TARGET.clone(),
  shakeStrength: 0,
};
const desiredCameraPosition = new THREE.Vector3();
const desiredCameraLookTarget = new THREE.Vector3();
const magnetTargetPosition = new THREE.Vector3();

function loadBestScore() {
  try {
    return Number(window.localStorage.getItem(BEST_SCORE_STORAGE_KEY)) || 0;
  } catch {
    // Storage can be blocked (privacy mode, sandboxed frames); the best score then only lives in memory.
    return 0;
  }
}

function saveBestScore(score) {
  try {
    window.localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(score));
  } catch {
    // Losing persistence is acceptable when storage is unavailable.
  }
}

function computeScore() {
  return Math.floor(runState.distanceMeters * GAME_CONFIG.pointsPerMeter) + runState.bonusPoints;
}

function computeComboMultiplier() {
  const earnedSteps = Math.floor(runState.comboCount / ICE_CREAMS_PER_MULTIPLIER_STEP);
  return Math.min(GAME_CONFIG.maxComboMultiplier, 1 + earnedSteps);
}

function computeBaseSpeed() {
  const acceleratedSpeed = GAME_CONFIG.baseSpeed + GAME_CONFIG.speedGainPerSecond * runState.elapsedSeconds;
  return Math.min(GAME_CONFIG.maxBaseSpeed, acceleratedSpeed);
}

function computeRunSpeed() {
  if (isSuperDashActive()) {
    return computeBaseSpeed() + GAME_CONFIG.superDashSpeedBonus;
  }
  if (isDashActive()) {
    return computeBaseSpeed() + GAME_CONFIG.dashSpeedBonus;
  }
  return computeBaseSpeed();
}

function computeDifficulty() {
  return Math.min(1, runState.elapsedSeconds / GAME_CONFIG.difficultyRampSeconds);
}

function isDashActive() {
  return runState.dashSecondsLeft > 0;
}

function isSuperDashActive() {
  return runState.superDashSecondsLeft > 0;
}

function isSuperDashReady() {
  return runState.energy >= MAX_ENERGY && !isSuperDashActive();
}

function isPlayerGrounded() {
  return playerState.positionY <= 0 && playerState.verticalVelocity <= 0;
}

function isPlayerSliding() {
  return playerState.slideSecondsLeft > 0 && isPlayerGrounded();
}

function computePlayerHitboxHeight() {
  return isPlayerSliding() ? PLAYER_SLIDING_HEIGHT : PLAYER_STANDING_HEIGHT;
}

function pickRandomSpeechLine() {
  return SPEECH_LINES[Math.floor(Math.random() * SPEECH_LINES.length)];
}

function setTextIfChanged(element, text) {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

function showOnlyOverlay(activeOverlay) {
  for (const overlayScreen of overlayScreens) {
    overlayScreen.classList.toggle('hidden', overlayScreen !== activeOverlay);
  }
}

function showSpeech(text) {
  elements.speechBubble.textContent = text;
  elements.speechBubble.classList.add('visible');
  window.clearTimeout(speechHideTimeoutId);
  speechHideTimeoutId = window.setTimeout(() => {
    elements.speechBubble.classList.remove('visible');
  }, SPEECH_VISIBLE_MS);
}

function showPopup(text) {
  const popup = document.createElement('div');
  popup.className = 'popup';
  popup.textContent = text;
  const horizontalOffset = Math.round((Math.random() - 0.5) * POPUP_HORIZONTAL_SPREAD_PIXELS);
  popup.style.left = `calc(50% + ${horizontalOffset}px)`;
  elements.popupLayer.append(popup);
  // A timer instead of animationend, because reduced-motion users get no animation at all.
  window.setTimeout(() => popup.remove(), POPUP_LIFETIME_MS);
}

function bumpComboBadge() {
  elements.hudCombo.classList.remove('bump');
  // Reading layout forces a reflow so the bump animation restarts on every pickup.
  void elements.hudCombo.offsetWidth;
  elements.hudCombo.classList.add('bump');
}

function addCameraShake(strength) {
  cameraRig.shakeStrength = Math.max(cameraRig.shakeStrength, strength);
}

function changeLane(direction) {
  if (currentPhase !== PHASE.playing) {
    return;
  }
  const nextLane = THREE.MathUtils.clamp(playerState.targetLane + direction, MIN_LANE_INDEX, MAX_LANE_INDEX);
  if (nextLane === playerState.targetLane) {
    return;
  }
  playerState.laneBeforeSwitch = playerState.targetLane;
  playerState.targetLane = nextLane;
  audio.playLaneSwitch(direction);
}

function jump() {
  if (currentPhase !== PHASE.playing || !isPlayerGrounded()) {
    return;
  }
  playerState.verticalVelocity = GAME_CONFIG.jumpVelocity;
  playerState.slideSecondsLeft = 0;
  playerState.isSlideQueuedForLanding = false;
  audio.playJump();
}

function slide() {
  if (currentPhase !== PHASE.playing) {
    return;
  }
  audio.playSlide();
  if (isPlayerGrounded()) {
    playerState.slideSecondsLeft = GAME_CONFIG.slideDuration;
    return;
  }
  playerState.verticalVelocity = Math.min(playerState.verticalVelocity, -GAME_CONFIG.fastFallVelocity);
  playerState.isSlideQueuedForLanding = true;
}

function activateSuperDash() {
  if (currentPhase !== PHASE.playing || !isSuperDashReady()) {
    return;
  }
  runState.superDashSecondsLeft = GAME_CONFIG.superDashDuration;
  showSpeech('超级冲刺！谁也别拦我！');
  addCameraShake(0.25);
  audio.playSuperDash();
}

function eatIceCream(iceCream) {
  spawner.removeIceCream(iceCream);

  const wasSuperDashReady = isSuperDashReady();
  const multiplierBeforePickup = computeComboMultiplier();
  const isComboContinued = runState.secondsSinceLastIceCream <= GAME_CONFIG.comboWindowSeconds;
  runState.comboCount = isComboContinued ? runState.comboCount + 1 : 1;
  runState.bestComboCount = Math.max(runState.bestComboCount, runState.comboCount);
  runState.secondsSinceLastIceCream = 0;
  runState.iceCreamsEaten += 1;

  const earnedPoints = GAME_CONFIG.pointsPerIceCream * computeComboMultiplier();
  runState.bonusPoints += earnedPoints;
  runState.dashSecondsLeft = GAME_CONFIG.dashDuration;
  if (!isSuperDashActive()) {
    runState.energy = Math.min(MAX_ENERGY, runState.energy + GAME_CONFIG.energyPerIceCream);
  }

  playerState.eatAnimationSecondsLeft = EAT_ANIMATION_SECONDS;
  showPopup(`+${earnedPoints}`);
  bumpComboBadge();
  const isMultiplierUp = isComboContinued && computeComboMultiplier() > multiplierBeforePickup;
  audio.playEat(runState.comboCount, isMultiplierUp);

  if (!wasSuperDashReady && isSuperDashReady()) {
    audio.playEnergyFull();
    showSpeech('甜度满了，放大招！');
  } else if (runState.comboCount % SPEECH_EVERY_COMBO_COUNT === 0) {
    showSpeech(pickRandomSpeechLine());
  }
}

function smashObstacle(obstacle) {
  spawner.smashObstacle(obstacle, playerState.positionX);
  const earnedPoints = GAME_CONFIG.pointsPerSmash * computeComboMultiplier();
  runState.bonusPoints += earnedPoints;
  showPopup(`撞飞 +${earnedPoints}`);
  audio.playSmash(obstacle.type === 'bus');
  if (obstacle.type === 'bus') {
    showSpeech('大巴也拦不住我！');
    addCameraShake(0.5);
  } else {
    addCameraShake(0.25);
  }
}

function bounceBackFromSideHit(obstacle) {
  playerState.targetLane = playerState.laneBeforeSwitch;
  playerState.laneBeforeSwitch = obstacle.laneIndex;
  addCameraShake(0.2);
  audio.playSideBump();
}

function crashInto(obstacle) {
  currentPhase = PHASE.dying;
  runState.crashedObstacleType = obstacle.type;
  runState.deathSecondsElapsed = 0;
  runState.dashSecondsLeft = 0;
  addCameraShake(0.6);
  showSpeech('哎哟！');
  audio.playCrash();
}

function advanceTimers(stepSeconds) {
  runState.dashSecondsLeft = Math.max(0, runState.dashSecondsLeft - stepSeconds);
  if (isSuperDashActive()) {
    runState.superDashSecondsLeft = Math.max(0, runState.superDashSecondsLeft - stepSeconds);
    runState.energy = MAX_ENERGY * (runState.superDashSecondsLeft / GAME_CONFIG.superDashDuration);
  }
  runState.secondsSinceLastIceCream += stepSeconds;
  if (runState.comboCount > 0 && runState.secondsSinceLastIceCream > GAME_CONFIG.comboWindowSeconds) {
    runState.comboCount = 0;
  }
}

function updatePlayerPhysics(stepSeconds) {
  const targetX = getLaneX(playerState.targetLane);
  const laneBlend = 1 - Math.exp(-GAME_CONFIG.laneSwitchSharpness * stepSeconds);
  playerState.positionX += (targetX - playerState.positionX) * laneBlend;

  const isAirborne = playerState.positionY > 0 || playerState.verticalVelocity > 0;
  if (isAirborne) {
    playerState.verticalVelocity -= GAME_CONFIG.gravity * stepSeconds;
    playerState.positionY += playerState.verticalVelocity * stepSeconds;
    if (playerState.positionY <= 0) {
      playerState.positionY = 0;
      playerState.verticalVelocity = 0;
      if (currentPhase === PHASE.playing) {
        audio.playLand();
      }
      if (playerState.isSlideQueuedForLanding) {
        playerState.isSlideQueuedForLanding = false;
        playerState.slideSecondsLeft = GAME_CONFIG.slideDuration;
      }
    }
  }
  playerState.slideSecondsLeft = Math.max(0, playerState.slideSecondsLeft - stepSeconds);
}

function attractAndCollectIceCreams(stepSeconds) {
  const playerBottom = playerState.positionY;
  const playerTop = playerBottom + computePlayerHitboxHeight();
  const magnetBlend = 1 - Math.exp(-MAGNET_PULL_SHARPNESS * stepSeconds);
  magnetTargetPosition.set(playerState.positionX, playerState.positionY + MAGNET_TARGET_HEIGHT, 0);

  for (let iceCreamIndex = spawner.iceCreams.length - 1; iceCreamIndex >= 0; iceCreamIndex -= 1) {
    const iceCream = spawner.iceCreams[iceCreamIndex];
    const iceCreamPosition = iceCream.model.position;

    const isInsideMagnetRange = iceCreamPosition.z > -GAME_CONFIG.magnetRange && iceCreamPosition.z < MAGNET_BEHIND_LIMIT;
    if (isSuperDashActive() && isInsideMagnetRange) {
      iceCream.isMagnetized = true;
    }
    if (iceCream.isMagnetized) {
      iceCreamPosition.lerp(magnetTargetPosition, magnetBlend);
    }

    const isWithinReach =
      Math.abs(iceCreamPosition.x - playerState.positionX) < ICE_CREAM_REACH_HALF_WIDTH &&
      Math.abs(iceCreamPosition.z) < ICE_CREAM_REACH_HALF_DEPTH &&
      iceCreamPosition.y > playerBottom - ICE_CREAM_REACH_VERTICAL_MARGIN &&
      iceCreamPosition.y < playerTop + ICE_CREAM_REACH_VERTICAL_MARGIN;
    if (isWithinReach) {
      eatIceCream(iceCream);
    }
  }
}

function resolveObstacleCollisions(stepDistance) {
  const playerBottom = playerState.positionY;
  const playerTop = playerBottom + computePlayerHitboxHeight();
  const isChangingLane = Math.abs(playerState.positionX - getLaneX(playerState.targetLane)) > LANE_CHANGE_TOLERANCE;

  for (const obstacle of spawner.obstacles) {
    if (obstacle.isSmashed) {
      continue;
    }
    const obstaclePosition = obstacle.model.position;
    const obstacleNearFaceZ = obstaclePosition.z + obstacle.depth / 2;
    const obstacleFarFaceZ = obstaclePosition.z - obstacle.depth / 2;
    const overlapsHorizontally = Math.abs(obstaclePosition.x - playerState.positionX) < obstacle.width / 2 + PLAYER_HALF_WIDTH;
    const overlapsInDepth = obstacleNearFaceZ > -PLAYER_HALF_DEPTH && obstacleFarFaceZ < PLAYER_HALF_DEPTH;
    const overlapsVertically = playerTop > obstacle.bottom && playerBottom < obstacle.bottom + obstacle.height;
    if (!overlapsHorizontally || !overlapsInDepth || !overlapsVertically) {
      continue;
    }

    const canSmash = isSuperDashActive() || (isDashActive() && obstacle.dashSmashable);
    if (canSmash) {
      smashObstacle(obstacle);
      continue;
    }

    // A head-on hit is caught on the first overlapping step; a deeper overlap means the player steered into its side.
    const penetrationDepth = obstacleNearFaceZ + PLAYER_HALF_DEPTH;
    const isSideHit = isChangingLane && penetrationDepth > stepDistance + HEAD_ON_PENETRATION_TOLERANCE;
    if (isSideHit) {
      if (playerState.targetLane === obstacle.laneIndex) {
        bounceBackFromSideHit(obstacle);
      }
      continue;
    }

    crashInto(obstacle);
    return;
  }
}

function simulateStep(stepSeconds) {
  const stepDistance = computeRunSpeed() * stepSeconds;
  runState.elapsedSeconds += stepSeconds;
  runState.distanceMeters += stepDistance;

  advanceTimers(stepSeconds);
  updatePlayerPhysics(stepSeconds);
  spawner.update(stepSeconds, stepDistance, computeBaseSpeed(), computeDifficulty(), animationClockSeconds);
  world.update(stepDistance);
  attractAndCollectIceCreams(stepSeconds);
  resolveObstacleCollisions(stepDistance);
}

function updatePlaying(frameSeconds) {
  const frameDistance = computeRunSpeed() * frameSeconds;
  const stepCount = Math.max(1, Math.ceil(frameDistance / MAX_STEP_DISTANCE));
  const stepSeconds = frameSeconds / stepCount;
  for (let stepIndex = 0; stepIndex < stepCount && currentPhase === PHASE.playing; stepIndex += 1) {
    simulateStep(stepSeconds);
  }
}

function updateDebris(frameSeconds) {
  spawner.update(frameSeconds, 0, computeBaseSpeed(), computeDifficulty(), animationClockSeconds);
}

function updateDying(frameSeconds) {
  runState.deathSecondsElapsed += frameSeconds;
  updatePlayerPhysics(frameSeconds);
  updateDebris(frameSeconds);
  if (runState.deathSecondsElapsed >= DEATH_SEQUENCE_SECONDS) {
    showGameOver();
  }
}

function blendToward(currentValue, targetValue, blendFactor) {
  return currentValue + (targetValue - currentValue) * blendFactor;
}

function computeTargetPose() {
  const isKnockedOut = currentPhase === PHASE.dying || currentPhase === PHASE.gameOver;
  if (isKnockedOut) {
    return { bodyTilt: -1.45, bodyLift: 0, leftLeg: -0.3, rightLeg: 0.2, leftArm: -2.8, rightArm: -2.6 };
  }

  const isEating = playerState.eatAnimationSecondsLeft > 0;
  const eatingArmAngle = -2.3;
  if (isPlayerSliding()) {
    return {
      bodyTilt: -1.1,
      bodyLift: 0,
      leftLeg: -0.15,
      rightLeg: 0.1,
      leftArm: -0.5,
      rightArm: isEating ? eatingArmAngle : -0.4,
    };
  }
  if (!isPlayerGrounded()) {
    return {
      bodyTilt: 0.1,
      bodyLift: 0,
      leftLeg: -0.8,
      rightLeg: 0.4,
      leftArm: -2.5,
      rightArm: isEating ? eatingArmAngle : -1.2,
    };
  }

  const stride = Math.sin(runCyclePhase);
  return {
    bodyTilt: 0.12,
    bodyLift: Math.abs(Math.cos(runCyclePhase)) * 0.08,
    leftLeg: stride * 0.9,
    rightLeg: -stride * 0.9,
    leftArm: -stride * 0.7,
    rightArm: isEating ? eatingArmAngle : stride * 0.7,
  };
}

function animatePlayer(frameSeconds) {
  const isKnockedOut = currentPhase === PHASE.dying || currentPhase === PHASE.gameOver;
  if (!isKnockedOut) {
    const cadenceSpeed = currentPhase === PHASE.menu ? MENU_RUN_SPEED : Math.min(computeRunSpeed(), MAX_CADENCE_SPEED);
    runCyclePhase += frameSeconds * cadenceSpeed * STRIDE_RADIANS_PER_METER;
  }
  playerState.eatAnimationSecondsLeft = Math.max(0, playerState.eatAnimationSecondsLeft - frameSeconds);

  const targetPose = computeTargetPose();
  const poseBlend = 1 - Math.exp(-POSE_BLEND_SHARPNESS * frameSeconds);
  player.root.position.set(playerState.positionX, playerState.positionY, 0);
  player.body.rotation.x = blendToward(player.body.rotation.x, targetPose.bodyTilt, poseBlend);
  player.body.position.y = blendToward(player.body.position.y, targetPose.bodyLift, poseBlend);
  player.leftLeg.rotation.x = blendToward(player.leftLeg.rotation.x, targetPose.leftLeg, poseBlend);
  player.rightLeg.rotation.x = blendToward(player.rightLeg.rotation.x, targetPose.rightLeg, poseBlend);
  player.leftArm.rotation.x = blendToward(player.leftArm.rotation.x, targetPose.leftArm, poseBlend);
  player.rightArm.rotation.x = blendToward(player.rightArm.rotation.x, targetPose.rightArm, poseBlend);

  player.aura.visible = isSuperDashActive();
  if (player.aura.visible) {
    const pulseScale = 1 + Math.sin(animationClockSeconds * 18) * 0.06;
    player.aura.scale.set(pulseScale, 1.35 * pulseScale, pulseScale);
  }
}

function updateCamera(frameSeconds) {
  if (currentPhase === PHASE.menu) {
    desiredCameraPosition.copy(MENU_CAMERA_POSITION);
    desiredCameraLookTarget.copy(MENU_CAMERA_LOOK_TARGET);
  } else {
    desiredCameraPosition.set(
      playerState.positionX * CHASE_CAMERA_LANE_FOLLOW,
      CHASE_CAMERA_HEIGHT + playerState.positionY * CHASE_CAMERA_JUMP_FOLLOW,
      CHASE_CAMERA_DISTANCE,
    );
    desiredCameraLookTarget.set(
      playerState.positionX * CHASE_LOOK_LANE_FOLLOW,
      CHASE_LOOK_HEIGHT + playerState.positionY * CHASE_LOOK_JUMP_FOLLOW,
      CHASE_LOOK_AHEAD_Z,
    );
  }

  const followBlend = 1 - Math.exp(-CAMERA_FOLLOW_SHARPNESS * frameSeconds);
  cameraRig.basePosition.lerp(desiredCameraPosition, followBlend);
  cameraRig.lookTarget.lerp(desiredCameraLookTarget, followBlend);

  world.camera.position.copy(cameraRig.basePosition);
  if (!prefersReducedMotion && cameraRig.shakeStrength > 0.001) {
    world.camera.position.x += (Math.random() - 0.5) * cameraRig.shakeStrength;
    world.camera.position.y += (Math.random() - 0.5) * cameraRig.shakeStrength;
  }
  cameraRig.shakeStrength *= Math.exp(-CAMERA_SHAKE_DECAY * frameSeconds);
  world.camera.lookAt(cameraRig.lookTarget);

  let targetFieldOfView = baseFieldOfView;
  if (!prefersReducedMotion && currentPhase === PHASE.playing) {
    if (isSuperDashActive()) {
      targetFieldOfView += SUPER_DASH_FIELD_OF_VIEW_BONUS;
    } else if (isDashActive()) {
      targetFieldOfView += DASH_FIELD_OF_VIEW_BONUS;
    }
  }
  const fieldOfViewBlend = 1 - Math.exp(-FIELD_OF_VIEW_SHARPNESS * frameSeconds);
  const nextFieldOfView = blendToward(world.camera.fov, targetFieldOfView, fieldOfViewBlend);
  if (Math.abs(nextFieldOfView - world.camera.fov) > 0.01) {
    world.camera.fov = nextFieldOfView;
    world.camera.updateProjectionMatrix();
  }
}

function renderHud() {
  setTextIfChanged(elements.hudScore, String(computeScore()));
  setTextIfChanged(elements.hudDistance, `${Math.floor(runState.distanceMeters)}m`);
  setTextIfChanged(elements.hudIceCreams, String(runState.iceCreamsEaten));

  const hasCombo = runState.comboCount >= 2;
  elements.hudCombo.classList.toggle('active', hasCombo);
  if (hasCombo) {
    setTextIfChanged(elements.hudCombo, `连吃 ${runState.comboCount} · x${computeComboMultiplier()}`);
  }

  const energyPercent = Math.round((runState.energy / MAX_ENERGY) * 100);
  const energyWidth = `${energyPercent}%`;
  if (elements.energyFill.style.width !== energyWidth) {
    elements.energyFill.style.width = energyWidth;
    elements.energyTrack.setAttribute('aria-valuenow', String(energyPercent));
  }

  const superDashActive = isSuperDashActive();
  const superDashReady = isSuperDashReady();
  elements.energyPanel.classList.toggle('ready', superDashReady);
  elements.superButton.disabled = !superDashReady;
  let energyHintText = '吃巧乐兹攒甜度';
  if (superDashActive) {
    energyHintText = '超级冲刺中！';
  } else if (superDashReady) {
    energyHintText = '甜度满了！按 Shift 放大招';
  }
  setTextIfChanged(elements.energyHint, energyHintText);

  const isRunning = currentPhase === PHASE.playing;
  elements.speedLines.classList.toggle('super', isRunning && superDashActive);
  elements.speedLines.classList.toggle('dash', isRunning && !superDashActive && isDashActive());
}

function resetRun() {
  spawner.reset();
  Object.assign(runState, createInitialRunState());
  Object.assign(playerState, createInitialPlayerState());
  elements.popupLayer.replaceChildren();
}

function startGame() {
  const canStart = currentPhase === PHASE.menu || currentPhase === PHASE.gameOver;
  if (!canStart) {
    return;
  }
  resetRun();
  currentPhase = PHASE.playing;
  showOnlyOverlay(null);
  elements.hud.classList.remove('hidden');
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  showSpeech('冲冲冲！');
  audio.unlock();
  audio.playStart();
  audio.startMusic();
}

function pauseGame() {
  if (currentPhase !== PHASE.playing) {
    return;
  }
  currentPhase = PHASE.paused;
  audio.setPaused(true);
  showOnlyOverlay(elements.pauseScreen);
  elements.resumeButton.focus({ preventScroll: true });
}

function resumeGame() {
  if (currentPhase !== PHASE.paused) {
    return;
  }
  currentPhase = PHASE.playing;
  audio.setPaused(false);
  showOnlyOverlay(null);
  elements.resumeButton.blur();
}

function showGameOver() {
  currentPhase = PHASE.gameOver;
  const finalScore = computeScore();
  const isNewBestScore = finalScore > bestScore;
  if (isNewBestScore) {
    bestScore = finalScore;
    saveBestScore(bestScore);
  }

  elements.gameOverTitle.textContent = GAME_OVER_TITLES[runState.crashedObstacleType] ?? '再来一局';
  elements.resultScore.textContent = String(finalScore);
  elements.resultDistance.textContent = `${Math.floor(runState.distanceMeters)}m`;
  elements.resultIceCreams.textContent = String(runState.iceCreamsEaten);
  elements.resultCombo.textContent = String(runState.bestComboCount);
  elements.resultBest.textContent = isNewBestScore ? '新纪录！' : `最高分 ${bestScore}`;
  elements.menuBest.textContent = String(bestScore);

  audio.playGameOver(isNewBestScore);
  showOnlyOverlay(elements.gameOverScreen);
  gameOverShownAtMs = performance.now();
  elements.restartButton.focus({ preventScroll: true });
}

function handleKeyDown(event) {
  const keyCode = event.code;
  if (KEYS_WITH_BROWSER_DEFAULTS.has(keyCode)) {
    event.preventDefault();
  }
  audio.unlock();
  if (KEY_BINDINGS.mute.has(keyCode) && !event.repeat) {
    toggleMute();
    return;
  }

  if (currentPhase === PHASE.menu || currentPhase === PHASE.gameOver) {
    const hasRestartDelayPassed =
      currentPhase === PHASE.menu || performance.now() - gameOverShownAtMs > RESTART_INPUT_DELAY_MS;
    if (KEY_BINDINGS.confirm.has(keyCode) && !event.repeat && hasRestartDelayPassed) {
      startGame();
    }
    return;
  }

  if (currentPhase === PHASE.paused) {
    const isResumeKey = KEY_BINDINGS.pause.has(keyCode) || KEY_BINDINGS.confirm.has(keyCode);
    if (isResumeKey && !event.repeat) {
      resumeGame();
    }
    return;
  }

  if (currentPhase !== PHASE.playing || event.repeat) {
    return;
  }
  if (KEY_BINDINGS.pause.has(keyCode)) {
    pauseGame();
  } else if (KEY_BINDINGS.laneLeft.has(keyCode)) {
    changeLane(-1);
  } else if (KEY_BINDINGS.laneRight.has(keyCode)) {
    changeLane(1);
  } else if (KEY_BINDINGS.jump.has(keyCode)) {
    jump();
  } else if (KEY_BINDINGS.slide.has(keyCode)) {
    slide();
  } else if (KEY_BINDINGS.superDash.has(keyCode)) {
    activateSuperDash();
  }
}

const touchGesture = { startX: 0, startY: 0, isTracking: false, hasSwiped: false };
let lastTapTimestampMs = 0;

function isEventFromButton(event) {
  return event.target instanceof Element && event.target.closest('button') !== null;
}

function handleTouchStart(event) {
  audio.unlock();
  if (currentPhase !== PHASE.playing || isEventFromButton(event)) {
    return;
  }
  const touch = event.changedTouches[0];
  touchGesture.startX = touch.clientX;
  touchGesture.startY = touch.clientY;
  touchGesture.isTracking = true;
  touchGesture.hasSwiped = false;
}

function handleTouchMove(event) {
  if (!touchGesture.isTracking || touchGesture.hasSwiped) {
    return;
  }
  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - touchGesture.startX;
  const deltaY = touch.clientY - touchGesture.startY;
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < SWIPE_THRESHOLD_PIXELS) {
    return;
  }
  touchGesture.hasSwiped = true;
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    changeLane(Math.sign(deltaX));
  } else if (deltaY < 0) {
    jump();
  } else {
    slide();
  }
}

function handleTouchEnd() {
  if (!touchGesture.isTracking) {
    return;
  }
  touchGesture.isTracking = false;
  if (touchGesture.hasSwiped) {
    return;
  }
  const nowMs = performance.now();
  if (nowMs - lastTapTimestampMs < DOUBLE_TAP_WINDOW_MS) {
    lastTapTimestampMs = 0;
    activateSuperDash();
  } else {
    lastTapTimestampMs = nowMs;
  }
}

window.addEventListener('keydown', handleKeyDown);
window.addEventListener('touchstart', handleTouchStart, { passive: true });
window.addEventListener('touchmove', handleTouchMove, { passive: true });
window.addEventListener('touchend', handleTouchEnd, { passive: true });
window.addEventListener('touchcancel', handleTouchEnd, { passive: true });
window.addEventListener('resize', world.resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseGame();
  }
});

elements.startButton.addEventListener('click', startGame);
elements.restartButton.addEventListener('click', startGame);
elements.resumeButton.addEventListener('click', resumeGame);
elements.superButton.addEventListener('click', () => {
  activateSuperDash();
  elements.superButton.blur();
});
elements.muteButton.addEventListener('click', () => {
  audio.unlock();
  toggleMute();
  elements.muteButton.blur();
});

function renderMuteButton(isMuted) {
  elements.muteButton.textContent = isMuted ? '音效：关' : '音效：开';
  elements.muteButton.setAttribute('aria-pressed', String(isMuted));
}

function toggleMute() {
  const isMutedNow = audio.toggleMuted();
  renderMuteButton(isMutedNow);
  if (!isMutedNow) {
    audio.playButton();
  }
}

function computeRunAudioMode() {
  if (currentPhase !== PHASE.playing) {
    return RUN_AUDIO_MODE.idle;
  }
  if (isSuperDashActive()) {
    return RUN_AUDIO_MODE.superDash;
  }
  if (isDashActive()) {
    return RUN_AUDIO_MODE.dash;
  }
  return RUN_AUDIO_MODE.running;
}

function updateRunAudio() {
  const speedRange = GAME_CONFIG.maxBaseSpeed - GAME_CONFIG.baseSpeed;
  const speedRatio = speedRange > 0 ? (computeBaseSpeed() - GAME_CONFIG.baseSpeed) / speedRange : 0;
  audio.updateRunState(computeRunAudioMode(), speedRatio);
}

function advancePhase(frameSeconds) {
  switch (currentPhase) {
    case PHASE.menu:
      world.update(MENU_RUN_SPEED * frameSeconds);
      break;
    case PHASE.playing:
      updatePlaying(frameSeconds);
      break;
    case PHASE.dying:
      updateDying(frameSeconds);
      break;
    case PHASE.gameOver:
      updateDebris(frameSeconds);
      break;
    default:
      break;
  }
}

let previousFrameTimestampMs = performance.now();

function runFrame(frameTimestampMs) {
  const elapsedMs = Math.max(0, frameTimestampMs - previousFrameTimestampMs);
  previousFrameTimestampMs = frameTimestampMs;
  const frameSeconds = Math.min(MAX_FRAME_SECONDS, elapsedMs / 1000);

  if (currentPhase !== PHASE.paused) {
    animationClockSeconds += frameSeconds;
    advancePhase(frameSeconds);
    animatePlayer(frameSeconds);
    updateCamera(frameSeconds);
    updateRunAudio();
  }
  renderHud();
  world.renderer.render(world.scene, world.camera);
}

elements.menuBest.textContent = String(bestScore);
renderMuteButton(audio.isMuted());
world.renderer.setAnimationLoop(runFrame);
