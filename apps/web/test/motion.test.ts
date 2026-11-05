import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { enterRegion, navigationMotionKey } from '../src/lib/motion';

function environment(t: TestContext, reduced = false) {
  const listeners = new Set<() => void>();
  const preference = { matches: reduced, addEventListener: (_event: string, listener: () => void) => listeners.add(listener), removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener) };
  const calls: { frames: unknown; options: { duration: number; easing: string } }[] = [];
  let cancelled = 0;
  const animation = { cancel: () => { cancelled++; }, onfinish: null as (() => void) | null, oncancel: null as (() => void) | null };
  const element = { animate: (frames: unknown, options: { duration: number; easing: string }) => { calls.push({ frames, options }); return animation; } } as unknown as HTMLElement;
  const globals = {
    document: { documentElement: {} },
    matchMedia: () => preference,
    getComputedStyle: () => ({ getPropertyValue: (token: string) => token === '--motion-page' ? '0.22s' : '180ms' }),
  };
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); });
  }
  return { element, calls, preference, listeners, animation, cancelled: () => cancelled };
}

test('navegação anima mudança de página e modo, preservando a estabilidade de busca e filtros', () => {
  assert.equal(navigationMotionKey('/help?q=tarefa'), navigationMotionKey('/help?q=ata&category=reunioes'));
  assert.equal(navigationMotionKey('/tasks?filter=open'), navigationMotionKey('/tasks?filter=done&owner=all'));
  assert.notEqual(navigationMotionKey('/plans'), navigationMotionKey('/plans/um-plano'));
  assert.notEqual(navigationMotionKey('/diagnoses/um?version=1'), navigationMotionKey('/diagnoses/um?version=2'));
  assert.notEqual(navigationMotionKey('/indicators/um'), navigationMotionKey('/indicators/um?edit=1'));
});

test('entrada usa os tempos compartilhados e cancela a animação anterior na limpeza', t => {
  const env = environment(t);
  const dispose = enterRegion(env.element, 'page');
  assert.equal(env.calls[0].options.duration, 220);
  assert.equal(env.listeners.size, 1);
  dispose();
  assert.equal(env.cancelled(), 1);
  assert.equal(env.listeners.size, 0);
});

test('preferência de movimento reduzido impede a animação desde o início', t => {
  const env = environment(t, true);
  enterRegion(env.element)();
  assert.equal(env.calls.length, 0);
  assert.equal(env.listeners.size, 0);
});

test('mudar para movimento reduzido interrompe um efeito em andamento e remove o observador', t => {
  const env = environment(t);
  enterRegion(env.element);
  env.preference.matches = true;
  for (const listener of env.listeners) listener();
  assert.equal(env.cancelled(), 1);
  assert.equal(env.listeners.size, 0);
});

test('concluir a animação libera seu observador e navegadores sem animate continuam utilizáveis', t => {
  const env = environment(t);
  enterRegion(env.element);
  env.animation.onfinish?.();
  assert.equal(env.listeners.size, 0);
  assert.doesNotThrow(() => enterRegion({} as HTMLElement)());
});
