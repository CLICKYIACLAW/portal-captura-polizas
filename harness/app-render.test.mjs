/**
 * Mounts the real <App /> component.
 *
 * Every other test in this suite exercises exported functions in isolation, and
 * `vite build` only compiles without executing a component body. That leaves a
 * blind spot: a temporal-dead-zone reference, a bad hook order or a throwing
 * memo inside App() passes both gates and only fails in the browser, as a blank
 * page. This repo has already shipped exactly that bug once.
 *
 * Rendering the component here closes that gap. Both branches are worth running:
 * the signed-out branch already evaluates the ENTIRE App() body — every const,
 * hook and memo — and the signed-in branch additionally renders every tab.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { SIGNED_IN, clearPendingTimers, reactProps, setupFakeDom, walk } from './dom-harness.mjs';

/**
 * Renders the app and tears it down again. Unmounting matters: the signed-in
 * branch schedules catalog-loading effects, and leaving them running past the
 * end of the test surfaces as asynchronous activity after the test ended.
 */
async function renderApp(storedAuth) {
  const timers = setupFakeDom(storedAuth);
  const { default: App } = await import('../src/App.jsx');
  const container = global.document.createElement('div');
  const root = createRoot(container);
  await act(() => root.render(createElement(App)));
  const rendered = container.children.length > 0;
  await act(() => root.unmount());
  clearPendingTimers(timers);
  return rendered;
}

describe('App renders', () => {
  it('mounts without throwing when signed out', async () => {
    assert.equal(await renderApp(null), true, 'expected the signed-out render to produce DOM');
  });

  it('mounts without throwing when signed in', async () => {
    assert.equal(await renderApp(SIGNED_IN), true, 'expected the signed-in render to produce DOM');
  });

  /**
   * Only the active tab's JSX is evaluated, so mounting alone leaves every tab
   * but Captura unrendered — and an identifier that does not exist inside one of
   * them throws only when that tab is opened, invisibly to the build. Walking
   * through all four closes that gap.
   */
  it('renders every tab without throwing', async () => {
    const timers = setupFakeDom(SIGNED_IN);
    const { default: App } = await import('../src/App.jsx');
    const container = global.document.createElement('div');
    const root = createRoot(container);
    await act(() => root.render(createElement(App)));

    const tabs = [];
    walk(container, (node) => {
      const props = node.tagName === 'button' ? reactProps(node) : null;
      if (props && typeof props.className === 'string' && props.className.split(' ')[0] === 'tab') {
        tabs.push(props);
      }
    });
    assert.equal(tabs.length, 4, 'expected the four navigation tabs');

    for (const tab of tabs) {
      await act(() => tab.onClick());
      assert.ok(container.children.length > 0, 'expected the tab to render DOM');
    }

    await act(() => root.unmount());
    clearPendingTimers(timers);
  });
});
