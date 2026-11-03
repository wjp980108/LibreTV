import { createRequire } from 'node:module';
import { createElement, createRef, type ReactElement, type Ref } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Resolve the exact utility instance Ant Design uses, including pnpm's patch.
const require = createRequire(import.meta.url);
const requireAntd = createRequire(require.resolve('antd'));
const { getNodeRef } = requireAntd('@rc-component/util/lib/ref') as {
  getNodeRef: (node: ReactElement) => Ref<unknown> | null | undefined;
};

afterEach(() => vi.restoreAllMocks());

describe('Ant Design with React 19 refs', () => {
  it('does not read the deprecated element.ref getter when no ref is supplied', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(getNodeRef(createElement('antd-ref-compat-test')) ?? null).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it('preserves object refs', () => {
    const ref = createRef<HTMLDivElement>();
    expect(getNodeRef(createElement('div', { ref }))).toBe(ref);
  });

  it('preserves callback refs', () => {
    const ref = vi.fn();
    expect(getNodeRef(createElement('div', { ref }))).toBe(ref);
  });
});
