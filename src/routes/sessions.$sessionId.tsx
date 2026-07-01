import { createFileRoute } from '@tanstack/react-router'
import { getFullSchemaFn } from '../server-fns/schema'
import { ErdCanvas } from '../components/erd/ErdCanvas'

export const Route = createFileRoute('/sessions/$sessionId')({
  loader: ({ params }) => getFullSchemaFn({ data: { sessionId: Number(params.sessionId) } }),
  component: SessionView,
})

function SessionView() {
  const schema = Route.useLoaderData()
  return (
    <div className="h-screen w-screen">
      <ErdCanvas schema={schema} />
    </div>
  )
}
