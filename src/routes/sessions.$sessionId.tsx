import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ReactFlowProvider } from '@xyflow/react'
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
  autoLayoutFn,
  setTableRoleFn,
} from '../server-fns/schema'
import { exportDdlFn } from '../server-fns/export'
import { listChatMessagesFn } from '../server-fns/chat'
import { getSessionFn, setSessionModelFn, renameSessionFn, deleteSessionFn } from '../server-fns/sessions'
import { notifySessionsChanged } from '../lib/sessionListBus'
import { getLastViewedThreshold, markSessionViewed } from '../lib/lastViewed'
import { MODEL_OPTIONS } from '../agent/models'
import { ErdCanvas, type ViewMode } from '../components/erd/ErdCanvas'
import { ChatPanel } from '../components/chat/ChatPanel'
import { SessionTopbar } from '../components/topbar/SessionTopbar'
import type { FullSchema } from '../mutations/getFullSchema'
import type { ChatMessage } from '../mutations/chatMessages'
import type { TableRole } from '../mutations/tableRole'

const DEFAULT_MODEL_VALUE = 'default'

export const Route = createFileRoute('/sessions/$sessionId')({
  loader: async ({ params }) => {
    const sessionId = Number(params.sessionId)
    const [schema, messagePage, session] = await Promise.all([
      getFullSchemaFn({ data: { sessionId } }),
      listChatMessagesFn({ data: { sessionId } }),
      getSessionFn({ data: { sessionId } }),
    ])
    return {
      schema,
      messages: messagePage.messages,
      hasMoreOlderMessages: messagePage.hasMore,
      model: session?.model ?? null,
      name: session?.name ?? 'Untitled session',
    }
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
      initialHasMoreOlderMessages={initialData.hasMoreOlderMessages}
      initialModel={initialData.model}
      initialName={initialData.name}
    />
  )
}

function SessionContent({
  sessionId,
  initialSchema,
  initialMessages,
  initialHasMoreOlderMessages,
  initialModel,
  initialName,
}: {
  sessionId: number
  initialSchema: FullSchema
  initialMessages: ChatMessage[]
  initialHasMoreOlderMessages: boolean
  initialModel: string | null
  initialName: string
}) {
  const navigate = useNavigate()
  const [schema, setSchema] = useState<FullSchema>(initialSchema)
  const [model, setModel] = useState<string | null>(initialModel)
  const [name, setName] = useState(initialName)
  const [viewMode, setViewMode] = useState<ViewMode>('fields')
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
  const autoLayout = useServerFn(autoLayoutFn)
  const setTableRole = useServerFn(setTableRoleFn)
  const refreshSchema = useServerFn(getFullSchemaFn)
  const exportDdl = useServerFn(exportDdlFn)
  const setSessionModel = useServerFn(setSessionModelFn)
  const renameSession = useServerFn(renameSessionFn)
  const deleteSession = useServerFn(deleteSessionFn)

  // Wrapped in useCallback (not just for general hygiene) so their references stay stable across
  // re-renders that don't actually change what they close over — ErdCanvas's node-reuse logic
  // (schemaToNodesWithReuse) compares a table's previous handler references against its current
  // ones to decide whether that table needs a new data object at all; without this, ErdCanvas
  // would always see "new" handlers and rebuild every table's node on every render regardless of
  // whether the schema itself changed. useServerFn's return value is already reference-stable
  // (see its own internal useCallback), so these only need to depend on it plus sessionId/refetch.
  const refetch = useCallback(async () => {
    setSchema(await refreshSchema({ data: { sessionId } }))
    // The sidebar's table count/last-updated for this session only refreshes on its own
    // create/rename/delete actions otherwise — it has no way to know the canvas changed.
    notifySessionsChanged()
  }, [sessionId, refreshSchema])

  const handleAddTable = useCallback(
    async (name: string) => {
      try {
        await addTable({ data: { sessionId, name } })
        await refetch()
      } catch {
        toast.error('Could not add table')
      }
    },
    [sessionId, addTable, refetch],
  )

  const handleAddField = useCallback(
    async (tableId: number, name: string, type: string) => {
      try {
        await addField({ data: { tableId, name, type } })
        await refetch()
      } catch {
        toast.error('Could not add field')
      }
    },
    [addField, refetch],
  )

  const handleConnect = useCallback(
    async (fromFieldId: number, toFieldId: number) => {
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
    },
    [sessionId, addRelationship, refetch],
  )

  const handleRenameTable = useCallback(
    async (tableId: number, name: string) => {
      try {
        await renameTable({ data: { tableId, name } })
        await refetch()
      } catch {
        toast.error('Could not rename table')
      }
    },
    [renameTable, refetch],
  )

  const handleRenameField = useCallback(
    async (fieldId: number, name: string) => {
      try {
        await renameField({ data: { fieldId, name } })
        await refetch()
      } catch {
        toast.error('Could not rename field')
      }
    },
    [renameField, refetch],
  )

  const handleUpdateFieldType = useCallback(
    async (fieldId: number, type: string) => {
      try {
        await updateField({ data: { fieldId, type } })
        await refetch()
      } catch {
        toast.error('Could not update field type')
      }
    },
    [updateField, refetch],
  )

  const handleDeleteTable = useCallback(
    async (tableId: number) => {
      try {
        await deleteTable({ data: { tableId } })
        await refetch()
      } catch {
        toast.error('Could not delete table')
      }
    },
    [deleteTable, refetch],
  )

  const handleDeleteField = useCallback(
    async (fieldId: number) => {
      try {
        await deleteField({ data: { fieldId } })
        await refetch()
      } catch {
        toast.error('Could not delete field')
      }
    },
    [deleteField, refetch],
  )

  const handleMoveTable = useCallback(
    async (tableId: number, positionX: number, positionY: number) => {
      try {
        await updateTablePosition({ data: { tableId, positionX, positionY } })
      } catch {
        toast.error('Could not save table position')
      }
    },
    [updateTablePosition],
  )

  async function handleAutoLayout() {
    try {
      await autoLayout({ data: { sessionId } })
      await refetch()
    } catch {
      toast.error('Could not auto-organize tables')
    }
  }

  const handleSetTableRole = useCallback(
    async (tableId: number, role: TableRole | null) => {
      try {
        await setTableRole({ data: { tableId, role } })
        await refetch()
      } catch {
        toast.error('Could not update table type')
      }
    },
    [setTableRole, refetch],
  )

  async function handleModelChange(next: string) {
    const nextModel = next === DEFAULT_MODEL_VALUE ? null : next
    setModel(nextModel)
    try {
      await setSessionModel({ data: { sessionId, model: nextModel as (typeof MODEL_OPTIONS)[number] | null } })
    } catch {
      toast.error('Could not change model')
    }
  }

  async function handleRenameSession(nextName: string) {
    const previousName = name
    setName(nextName)
    try {
      await renameSession({ data: { sessionId, name: nextName } })
      notifySessionsChanged()
    } catch {
      setName(previousName)
      toast.error('Could not rename session')
    }
  }

  async function handleDeleteSession() {
    try {
      await deleteSession({ data: { sessionId } })
      notifySessionsChanged()
      navigate({ to: '/' })
    } catch {
      toast.error('Could not delete session')
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
      <ReactFlowProvider>
        <SessionTopbar
          name={name}
          onRename={handleRenameSession}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          hasTables={schema.tables.length > 0}
          canAutoOrganize={schema.tables.length >= 2}
          onAutoOrganize={handleAutoLayout}
          onExport={handleExport}
          onDeleteSession={handleDeleteSession}
        />
        <div className="relative flex-1">
          <ErdCanvas
            schema={schema}
            newSinceThreshold={newSinceThreshold}
            viewMode={viewMode}
            onAddTable={handleAddTable}
            onAddField={handleAddField}
            onConnect={handleConnect}
            onRenameTable={handleRenameTable}
            onRenameField={handleRenameField}
            onUpdateFieldType={handleUpdateFieldType}
            onDeleteTable={handleDeleteTable}
            onDeleteField={handleDeleteField}
            onMoveTable={handleMoveTable}
            onSetTableRole={handleSetTableRole}
          />
          <ChatPanel
            sessionId={sessionId}
            initialMessages={initialMessages}
            initialHasMoreOlderMessages={initialHasMoreOlderMessages}
            onSchemaMayHaveChanged={refetch}
            model={model}
            onModelChange={handleModelChange}
            hasTables={schema.tables.length > 0}
          />
        </div>
      </ReactFlowProvider>
    </div>
  )
}
