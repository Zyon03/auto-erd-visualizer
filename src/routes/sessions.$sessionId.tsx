import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { getFullSchemaFn, addTableFn, addFieldFn, addRelationshipFn, renameTableFn, renameFieldFn, updateTablePositionFn } from '../server-fns/schema'
import { exportDdlFn } from '../server-fns/export'
import { listChatMessagesFn } from '../server-fns/chat'
import { ErdCanvas } from '../components/erd/ErdCanvas'
import { ChatPanel } from '../components/chat/ChatPanel'
import type { FullSchema } from '../mutations/getFullSchema'

export const Route = createFileRoute('/sessions/$sessionId')({
  loader: async ({ params }) => {
    const sessionId = Number(params.sessionId)
    const [schema, messages] = await Promise.all([
      getFullSchemaFn({ data: { sessionId } }),
      listChatMessagesFn({ data: { sessionId } }),
    ])
    return { schema, messages }
  },
  component: SessionView,
})

function SessionView() {
  const initialData = Route.useLoaderData()
  const { sessionId } = Route.useParams()
  const [schema, setSchema] = useState<FullSchema>(initialData.schema)

  const addTable = useServerFn(addTableFn)
  const addField = useServerFn(addFieldFn)
  const addRelationship = useServerFn(addRelationshipFn)
  const renameTable = useServerFn(renameTableFn)
  const renameField = useServerFn(renameFieldFn)
  const updateTablePosition = useServerFn(updateTablePositionFn)
  const refreshSchema = useServerFn(getFullSchemaFn)
  const exportDdl = useServerFn(exportDdlFn)

  async function refetch() {
    setSchema(await refreshSchema({ data: { sessionId: Number(sessionId) } }))
  }

  async function handleAddTable(name: string) {
    await addTable({ data: { sessionId: Number(sessionId), name } })
    await refetch()
  }

  async function handleAddField(tableId: number) {
    const name = window.prompt('Field name')
    if (!name) return
    const type = window.prompt('Field type (e.g. text, integer, uuid)') ?? 'text'
    await addField({ data: { tableId, name, type } })
    await refetch()
  }

  async function handleConnect(fromFieldId: number, toFieldId: number) {
    try {
      await addRelationship({
        data: { sessionId: Number(sessionId), fromFieldId, toFieldId, cardinality: 'one-to-many' },
      })
      await refetch()
    } catch {
      // Rejected by a guardrail (self-connection or duplicate pair, see Task 15).
      // ErdCanvas's isValidConnection already prevents this in the common case;
      // this catch only matters for a race with a concurrent AI-driven change.
    }
  }

  async function handleRenameTable(tableId: number, name: string) {
    await renameTable({ data: { tableId, name } })
    await refetch()
  }

  async function handleRenameField(fieldId: number, name: string) {
    await renameField({ data: { fieldId, name } })
    await refetch()
  }

  async function handleMoveTable(tableId: number, positionX: number, positionY: number) {
    await updateTablePosition({ data: { tableId, positionX, positionY } })
  }

  async function handleExport() {
    const ddl = await exportDdl({ data: { sessionId: Number(sessionId) } })
    const blob = new Blob([ddl], { type: 'text/sql' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `schema-${sessionId}.sql`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full w-full flex flex-col bg-slate-950">
      <div className="p-3 border-b border-slate-800">
        <button
          onClick={handleExport}
          className="bg-slate-800 text-slate-200 px-3 py-1.5 rounded text-sm font-medium hover:bg-slate-700"
        >
          Export SQL
        </button>
      </div>
      <div className="flex-1 relative">
        <ErdCanvas
          schema={schema}
          onAddTable={handleAddTable}
          onAddField={handleAddField}
          onConnect={handleConnect}
          onRenameTable={handleRenameTable}
          onRenameField={handleRenameField}
          onMoveTable={handleMoveTable}
        />
        <ChatPanel sessionId={Number(sessionId)} initialMessages={initialData.messages} onSchemaMayHaveChanged={refetch} />
      </div>
    </div>
  )
}
