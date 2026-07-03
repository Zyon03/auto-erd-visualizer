import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { Toaster } from 'sonner'
import { SessionSidebar } from '../components/sidebar/SessionSidebar'
import { RouteLoadingScreen } from '../components/RouteLoadingScreen'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  // Falls through to any nested route (e.g. /sessions/$sessionId) that doesn't define its own
  // pendingComponent — right now that's all of them, so this is the one loading screen for every
  // route's loader.
  pendingComponent: RouteLoadingScreen,
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Auto ERD',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: 'dark' }}>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] bg-canvas text-ink">
        <div className="flex h-screen w-screen overflow-hidden">
          <SessionSidebar />
          <div className="flex-1 h-screen overflow-hidden">{children}</div>
        </div>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: '!bg-surface-raised !border !border-line !text-ink !font-sans',
              description: '!text-ink-muted',
            },
          }}
        />
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
