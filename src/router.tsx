import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // Loads under this are common (preloaded via defaultPreload='intent', or a warm session cache)
    // and shouldn't flash a loading screen; anything slower shows one quickly rather than leaving
    // the screen looking stuck. Once shown, it stays for defaultPendingMinMs so it doesn't flicker
    // in and out on a load that finishes just after the threshold.
    defaultPendingMs: 200,
    defaultPendingMinMs: 300,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
