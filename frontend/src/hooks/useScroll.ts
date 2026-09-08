import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Scroll behaviour when the view changes.
 *
 * A single-page application does not reload the document, so the browser keeps the scroll position
 * across a view change. Opening a product from halfway down the catalogue therefore showed the
 * detail page already scrolled down — reported from the deployed demo.
 *
 * Two hooks rather than one global handler, because the two views want opposite things: a detail
 * page always starts at the top, and the catalogue wants the position the user left it at.
 */

/** Scroll positions of the views that want them remembered, by key. Lives for the session. */
const remembered = new Map<string, number>();

/**
 * Takes the view to the top, and does it again whenever `key` changes.
 *
 * `useLayoutEffect` rather than `useEffect`: it runs before the browser paints, so the view never
 * flashes at the wrong position on the way to the top.
 *
 * The key is compared against the last one handled rather than merely triggering the effect. That
 * makes it a real dependency and not a tripwire, and it means a re-run for the same view — which
 * React's strict mode does deliberately — does not scroll again.
 */
export function useScrollToTop(key: string): void {
  const handled = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    if (handled.current === key) return;
    handled.current = key;
    globalThis.scrollTo(0, 0);
  }, [key]);
}

/**
 * Remembers the scroll position of this view and restores it when the view comes back.
 *
 * The listener is the only thing that writes the position, and that is deliberate. It used to be
 * written on cleanup as well, to catch the position at the moment of leaving — which was redundant,
 * since scrolling is what moves it and scrolling fires the event, and actively harmful: an effect
 * cleanup also runs when the effect re-runs, so **mounting** the view wrote the current position
 * over the remembered one. React's strict mode does exactly that on every mount, so in development
 * coming back to the catalogue overwrote the saved position with zero and no restore happened. The
 * tests did not see it because they left a scroll-position spy standing between tests, and the
 * value it left behind happened to be the one the next test expected.
 *
 * The restore waits for `isReady`, because the position cannot be applied while the content is
 * still a skeleton: the document is not tall enough yet and the browser would clamp the scroll.
 * And it happens once per visit, guarded by a ref, so that filtering the list — which rewrites the
 * URL on every keystroke — does not keep yanking the page back.
 */
export function useRememberedScroll(key: string, isReady: boolean): void {
  const restored = useRef(false);

  useEffect(() => {
    const remember = () => {
      remembered.set(key, globalThis.scrollY);
    };
    // Passive: this listener never calls `preventDefault`, and saying so lets the browser keep
    // scrolling smoothly instead of waiting to find out.
    globalThis.addEventListener('scroll', remember, { passive: true });
    return () => {
      globalThis.removeEventListener('scroll', remember);
    };
  }, [key]);

  useEffect(() => {
    if (!isReady || restored.current) return;
    restored.current = true;

    const position = remembered.get(key);
    if (position !== undefined && position > 0) {
      globalThis.scrollTo(0, position);
    }
  }, [key, isReady]);
}

/** Clears the remembered positions. Exposed for the tests. */
export function forgetScrollPositions(): void {
  remembered.clear();
}
