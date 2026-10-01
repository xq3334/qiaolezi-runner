export const GAME_CONFIG = {
  laneWidth: 2.4,
  laneCount: 3,
  baseSpeed: 16,
  maxBaseSpeed: 34,
  speedGainPerSecond: 0.2,
  laneSwitchSharpness: 16,
  jumpVelocity: 11.5,
  gravity: 32,
  fastFallVelocity: 20,
  slideDuration: 0.75,
  dashDuration: 1.1,
  dashSpeedBonus: 14,
  superDashDuration: 5,
  superDashSpeedBonus: 22,
  energyPerIceCream: 12,
  magnetRange: 22,
  comboWindowSeconds: 2.2,
  maxComboMultiplier: 10,
  groundTileLength: 30,
  groundTileCount: 8,
  spawnAheadDistance: 160,
  despawnBehindDistance: 12,
  safeStartDistance: 55,
  difficultyRampSeconds: 120,
  pointsPerMeter: 1,
  pointsPerIceCream: 50,
  pointsPerSmash: 120,
};

export const LANE_INDICES = [-1, 0, 1];

// Each preset overrides the speed curve and how generously ice creams are spawned.
// Base speed is: startSpeed + speedGainPerSecond * t + 0.5 * speedAccelerationPerSecondSquared * t², capped at maxBaseSpeed.
export const DIFFICULTY_PRESETS = Object.freeze({
  easy: Object.freeze({
    id: 'easy',
    label: '简单',
    startSpeed: GAME_CONFIG.baseSpeed,
    maxBaseSpeed: GAME_CONFIG.maxBaseSpeed,
    speedGainPerSecond: GAME_CONFIG.speedGainPerSecond,
    speedAccelerationPerSecondSquared: 0,
    difficultyRampSeconds: GAME_CONFIG.difficultyRampSeconds,
    iceCreamLineChance: 1,
    iceCreamLineMinCount: 3,
    iceCreamLineExtraCount: 2,
    bonusIceCreamChanceScale: 1,
    bestScoreStorageKey: 'qiaolezi-runner-best-score',
  }),
  hard: Object.freeze({
    id: 'hard',
    label: '困难',
    startSpeed: 19,
    // Not a design cap: it only keeps physics and camera stable after very long runs.
    maxBaseSpeed: 80,
    speedGainPerSecond: 0.3,
    speedAccelerationPerSecondSquared: 0.004,
    difficultyRampSeconds: 70,
    iceCreamLineChance: 0.5,
    iceCreamLineMinCount: 2,
    iceCreamLineExtraCount: 1,
    bonusIceCreamChanceScale: 0.35,
    bestScoreStorageKey: 'qiaolezi-runner-best-score-hard',
  }),
});

export const DEFAULT_DIFFICULTY_ID = 'easy';

export const SPEECH_LINES = [
  '再来一根！',
  '这波冲了！',
  '甜到飞起！',
  '谁也拦不住我',
  '冲冲冲！',
  '吃完这根就收手',
  '这速度，稳了',
  '巧乐兹管够',
];
