import test from 'node:test';
import assert from 'node:assert/strict';
import {centeredCrop, cropRectangle, moveCrop} from '../src/lib/photo-crop';

test('crop preserves square framing in landscape, portrait and zoomed images', () => {
  assert.deepEqual(cropRectangle(1200, 800, centeredCrop), {x: 200, y: 0, side: 800});
  assert.deepEqual(cropRectangle(800, 1200, centeredCrop), {x: 0, y: 200, side: 800});
  assert.deepEqual(cropRectangle(1200, 800, {zoom: 2, x: 100, y: 0}), {x: 800, y: 0, side: 400});
});

test('drag follows the image and never exposes empty pixels at any edge', () => {
  const moved = moveCrop(1200, 800, centeredCrop, 75, 75, 300);
  assert.deepEqual(cropRectangle(1200, 800, moved), {x: 0, y: 0, side: 800});
  for (const [width, height] of [[1200, 800], [800, 1200], [800, 800]]) {
    for (const zoom of [1, 1.5, 4]) for (const delta of [-10000, 10000]) {
      const position = moveCrop(width, height, {...centeredCrop, zoom}, delta, delta, 250);
      const rect = cropRectangle(width, height, position);
      assert.ok(Number.isFinite(rect.x) && Number.isFinite(rect.y));
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.side <= width && rect.y + rect.side <= height);
    }
  }
});

test('square images can be repositioned after zoom, and keyboard-sized moves remain precise', () => {
  const start = {...centeredCrop, zoom: 2};
  const moved = moveCrop(800, 800, start, -8, 8, 200);
  assert.deepEqual(cropRectangle(800, 800, moved), {x: 216, y: 184, side: 400});
  assert.deepEqual(moveCrop(800, 800, centeredCrop, 30, -30, 200), centeredCrop);
});
