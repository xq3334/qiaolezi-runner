import * as THREE from 'three';

const textureCache = new Map();

function finalizeCanvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createLabelTexture(labelText, backgroundColor, textColor) {
  const cacheKey = `label|${labelText}|${backgroundColor}|${textColor}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = textColor;
  context.lineWidth = 14;
  context.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  context.fillStyle = textColor;
  context.font = 'bold 112px "Microsoft YaHei", "PingFang SC", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(labelText, canvas.width / 2, canvas.height / 2 + 6);
  const texture = finalizeCanvasTexture(canvas);
  textureCache.set(cacheKey, texture);
  return texture;
}

export function createStripeTexture() {
  const cacheKey = 'stripes';
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#e53935';
  for (let stripeStartX = -64; stripeStartX < canvas.width + 64; stripeStartX += 64) {
    context.beginPath();
    context.moveTo(stripeStartX, 0);
    context.lineTo(stripeStartX + 32, 0);
    context.lineTo(stripeStartX - 32, 64);
    context.lineTo(stripeStartX - 64, 64);
    context.closePath();
    context.fill();
  }
  const texture = finalizeCanvasTexture(canvas);
  textureCache.set(cacheKey, texture);
  return texture;
}

export function createWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = '#86a9cf';
  context.fillRect(14, 14, 36, 36);
  context.fillStyle = '#d6e6f5';
  context.fillRect(14, 14, 36, 8);
  const texture = finalizeCanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
