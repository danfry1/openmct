// Minimal jasmine-API compatibility for running karma-jasmine specs in Vitest.
import { expect, vi } from 'vitest';

function createSpy(name) {
  const spy = vi.fn();
  spy.and = {
    returnValue: (v) => (spy.mockReturnValue(v), spy),
    callFake: (fn) => (spy.mockImplementation(fn), spy),
    callThrough: () => spy,
    resolveTo: (v) => (spy.mockResolvedValue(v), spy),
    rejectWith: (v) => (spy.mockRejectedValue(v), spy),
    returnValues: (...values) => {
      for (const v of values) spy.mockReturnValueOnce(v);
      return spy;
    }
  };
  Object.defineProperty(spy, 'calls', {
    value: {
      count: () => spy.mock.calls.length,
      argsFor: (i) => spy.mock.calls[i],
      mostRecent: () => ({ args: spy.mock.calls.at(-1) }),
      all: () => spy.mock.calls.map((args) => ({ args })),
      reset: () => spy.mockReset()
    }
  });
  return spy;
}

globalThis.jasmine = {
  createSpy,
  createSpyObj: (name, methods) => {
    const obj = {};
    for (const m of Array.isArray(methods) ? methods : Object.keys(methods)) obj[m] = createSpy(m);
    return obj;
  },
  any: (c) => expect.any(c),
  anything: () => expect.anything(),
  objectContaining: (o) => expect.objectContaining(o),
  arrayContaining: (a) => expect.arrayContaining(a),
  stringMatching: (s) => expect.stringMatching(s),
  DEFAULT_TIMEOUT_INTERVAL: 5000
};

globalThis.xit = (name) => globalThis.it.skip(name, () => {});
globalThis.xdescribe = (name) => globalThis.describe.skip(name, () => {});

globalThis.spyOn = (obj, method) => {
  const spy = vi.spyOn(obj, method);
  spy.and = {
    returnValue: (v) => (spy.mockReturnValue(v), spy),
    callFake: (fn) => (spy.mockImplementation(fn), spy),
    callThrough: () => spy,
    resolveTo: (v) => (spy.mockResolvedValue(v), spy)
  };
  spy.calls = {
    count: () => spy.mock.calls.length,
    argsFor: (i) => spy.mock.calls[i],
    mostRecent: () => ({ args: spy.mock.calls.at(-1) }),
    all: () => spy.mock.calls.map((args) => ({ args })),
    reset: () => spy.mockReset()
  };
  return spy;
};

expect.extend({
  toBeTrue: (received) => ({
    pass: received === true,
    message: () => `expected ${received} to be true`
  }),
  toBeFalse: (received) => ({
    pass: received === false,
    message: () => `expected ${received} to be false`
  }),
  toHaveClass: (received, cls) => ({
    pass: Boolean(received?.classList?.contains(cls)),
    message: () => `expected element to have class ${cls}`
  })
});
