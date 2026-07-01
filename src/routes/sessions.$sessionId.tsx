import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { getFullSchemaFn, addTableFn, addFieldFn, addRelationshipFn, renameTableFn, renameFieldFn, updateTablePositionFn } from '../server-fns/schema'
import { exportDdlFn } from '../server-fns/export'
import { ErdCanvas } from '../components/erd/ErdCanvas'
import type { FullSchema } from '../mutations/getFullSchema'

export const Route = createFileRoute('/sessions/$sessionId')({
  loader: ({ params }) => getFullSchemaFn({ data: { sessionId: Number(params.sessionId) } }),
  component: SessionView,
})

function SessionView() {
  const initialSchema = Route.useLoaderData()
  const { sessionId } = Route.useParams()
  const [schema, setSchema] = useState<FullSchema>(initialSchema)

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

  async function handleAddTable() {
    const name = window.prompt('Table name')
    if (!name) return
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
    await addRelationship({
      data: { sessionId: Number(sessionId), fromFieldId, toFieldId, cardinality: 'one-to-many' },
    })
    await refetch()
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
    <div className="h-screen w-screen flex flex-col bg-slate-950">
      <div className="p-3 border-b border-slate-800">
        <button
          onClick={handleAddTable}
          className="bg-teal-500 text-slate-950 px-3 py-1.5 rounded text-sm font-medium hover:bg-teal-400"
        >
          + Add table
        </button>
        <button
          onClick={handleExport}
          className="ml-2 bg-slate-800 text-slate-200 px-3 py-1.5 rounded text-sm font-medium hover:bg-slate-700"
        >
          Export SQL
        </button>
      </div>
      <div className="flex-1">
        <ErdCanvas
          schema={schema}
          onAddField={handleAddField}
          onConnect={handleConnect}
          onRenameTable={handleRenameTable}
          onRenameField={handleRenameField}
          onMoveTable={handleMoveTable}
        />
      </div>
    </div>
  )
}
