import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import {
  getFullSchemaFn,
  addTableFn,
  addFieldFn,
  addRelationshipFn,
  renameTableFn,
  renameFieldFn,
  updateFieldFn,
  deleteTableFn,
  deleteFieldFn,
  updateTablePositionFn,
} from '../server-fns/schema'
import { exportDdlFn } from '../server-fns/export'
import { listChatMessagesFn } from '../server-fns/chat'
import { getSessionFn, setSessionModelFn } from '../server-fns/sessions'
import { notifySessionsChanged } from '../lib/sessionListBus'
import { getLastViewedThreshold, markSessionViewed } from '../lib/lastViewed'
import { MODEL_OPTIONS } from '../agent/models'
import { ErdCanvas } from '../components/erd/ErdCanvas'
import { ChatPanel } from '../components/chat/ChatPanel'
import { Button } from '../components/ui/button'
import type { FullSchema } from '../mutations/getFullSchema'
import type { ChatMessage } from '../mutations/chatMessages'

const DEFAULT_MODEL_VALUE = 'default'

export const Route = createFileRoute('/sessions/$sessionId')({
  loader: async ({ params }) => {
    const sessionId = Number(params.sessionId)
    const [schema, messages, session] = await Promise.all([
      getFullSchemaFn({ data: { sessionId } }),
      listChatMessagesFn({ data: { sessionId } }),
      getSessionFn({ data: { sessionId } }),
    ])
    return { schema, messages, model: session?.model ?? null }
  },
  component: SessionView,
})

function SessionView() {
  const initialData = Route.useLoaderData()
  const { sessionId } = Route.useParams()
  return (
    <SessionContent
      key={sessionId}
      sessionId={Number(sessionId)}
      initialSchema={initialData.schema}
      initialMessages={initialData.messages}
      initialModel={initialData.model}
    />
  )
}

function SessionContent({
  sessionId,
  initialSchema,
  initialMessages,
  initialModel,
}: {
  sessionId: number
  initialSchema: FullSchema
  initialMessages: ChatMessage[]
  initialModel: string | null
}) {
  const [schema, setSchema] = useState<FullSchema>(initialSchema)
  const [model, setModel] = useState<string | null>(initialModel)
  // Captured once, before markSessionViewed bumps it — tables created anytime during this
  // visit (including by the AI mid-conversation) stay flagged "new" until the next visit.
  const [newSinceThreshold] = useState(() => getLastViewedThreshold(sessionId))
  useEffect(() => {
    markSessionViewed(sessionId)
  }, [sessionId])

  const addTable = useServerFn(addTableFn)
  const addField = useServerFn(addFieldFn)
  const addRelationship = useServerFn(addRelationshipFn)
  const renameTable = useServerFn(renameTableFn)
  const renameField = useServerFn(renameFieldFn)
  const updateField = useServerFn(updateFieldFn)
  const deleteTable = useServerFn(deleteTableFn)
  const deleteField = useServerFn(deleteFieldFn)
  const updateTablePosition = useServerFn(updateTablePositionFn)
  const refreshSchema = useServerFn(getFullSchemaFn)
  const exportDdl = useServerFn(exportDdlFn)
  const setSessionModel = useServerFn(setSessionModelFn)

  async function refetch() {
    setSchema(await refreshSchema({ data: { sessionId } }))
    // The sidebar's table count/last-updated for this session only refreshes on its own
    // create/rename/delete actions otherwise — it has no way to know the canvas changed.
    notifySessionsChanged()
  }

  async function handleAddTable(name: string) {
    try {
      await addTable({ data: { sessionId, name } })
      await refetch()
    } catch {
      toast.error('Could not add table')
    }
  }

  async function handleAddField(tableId: number, name: string, type: string) {
    try {
      await addField({ data: { tableId, name, type } })
      await refetch()
    } catch {
      toast.error('Could not add field')
    }
  }

  async function handleConnect(fromFieldId: number, toFieldId: number) {
    try {
      await addRelationship({
        data: { sessionId, fromFieldId, toFieldId, cardinality: 'one-to-many' },
      })
      await refetch()
    } catch {
      // Rejected by a guardrail (self-connection or duplicate pair, see Task 15).
      // ErdCanvas's isValidConnection already prevents this in the common case;
      // this catch only matters for a race with a concurrent AI-driven change.
      toast.error('Could not connect those fields')
    }
  }

  async function handleRenameTable(tableId: number, name: string) {
    try {
      await renameTable({ data: { tableId, name } })
      await refetch()
    } catch {
      toast.error('Could not rename table')
    }
  }

  async function handleRenameField(fieldId: number, name: string) {
    try {
      await renameField({ data: { fieldId, name } })
      await refetch()
    } catch {
      toast.error('Could not rename field')
    }
  }

  async function handleUpdateFieldType(fieldId: number, type: string) {
    try {
      await updateField({ data: { fieldId, type } })
      await refetch()
    } catch {
      toast.error('Could not update field type')
    }
  }

  async function handleDeleteTable(tableId: number) {
    try {
      await deleteTable({ data: { tableId } })
      await refetch()
    } catch {
      toast.error('Could not delete table')
    }
  }

  async function handleDeleteField(fieldId: number) {
    try {
      await deleteField({ data: { fieldId } })
      await refetch()
    } catch {
      toast.error('Could not delete field')
    }
  }

  async function handleMoveTable(tableId: number, positionX: number, positionY: number) {
    try {
      await updateTablePosition({ data: { tableId, positionX, positionY } })
    } catch {
      toast.error('Could not save table position')
    }
  }

  async function handleModelChange(next: string) {
    const nextModel = next === DEFAULT_MODEL_VALUE ? null : next
    setModel(nextModel)
    try {
      await setSessionModel({ data: { sessionId, model: nextModel as (typeof MODEL_OPTIONS)[number] | null } })
    } catch {
      toast.error('Could not change model')
    }
  }

  async function handleExport() {
    const ddl = await exportDdl({ data: { sessionId } })
    const blob = new Blob([ddl], { type: 'text/sql' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `schema-${sessionId}.sql`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full w-full flex-col bg-canvas">
      <div className="flex items-center justify-end gap-2 border-b border-line px-3 py-2">
        <Button onClick={handleExport} variant="outline" size="sm">
          <Download size={13} />
          Export SQL
        </Button>
      </div>
      <div className="relative flex-1">
        <ErdCanvas
          schema={schema}
          newSinceThreshold={newSinceThreshold}
          onAddTable={handleAddTable}
          onAddField={handleAddField}
          onConnect={handleConnect}
          onRenameTable={handleRenameTable}
          onRenameField={handleRenameField}
          onUpdateFieldType={handleUpdateFieldType}
          onDeleteTable={handleDeleteTable}
          onDeleteField={handleDeleteField}
          onMoveTable={handleMoveTable}
        />
        <ChatPanel
          sessionId={sessionId}
          initialMessages={initialMessages}
          onSchemaMayHaveChanged={refetch}
          model={model}
          onModelChange={handleModelChange}
        />
      </div>
    </div>
  )
}
