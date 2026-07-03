import { useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { Download, MoreHorizontal, Rows3, Scan, Trash2, Wand2, Waypoints } from 'lucide-react'
import { EditableText } from '../ui/editable-text'
import { Button } from '../ui/button'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '../ui/alert-dialog'
import { cn } from '../../lib/cn'
import type { ViewMode } from '../erd/ErdCanvas'

export interface SessionTopbarProps {
  name: string
  onRename: (name: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  hasTables: boolean
  canAutoOrganize: boolean
  onAutoOrganize: () => Promise<void>
  onExport: () => void
  onDeleteSession: () => Promise<void>
}

/** Rendered as a descendant of the <ReactFlowProvider> that wraps the whole session view (see
 *  routes/sessions.$sessionId.tsx) — useReactFlow only works below the provider it creates, and
 *  this component sits outside <ErdCanvas>'s own <ReactFlow>, as a sibling, so it needs that
 *  shared provider rather than ErdCanvas's implicit one. */
export function SessionTopbar({
  name,
  onRename,
  viewMode,
  onViewModeChange,
  hasTables,
  canAutoOrganize,
  onAutoOrganize,
  onExport,
  onDeleteSession,
}: SessionTopbarProps) {
  const { fitView } = useReactFlow()
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  async function handleAutoOrganizeClick() {
    await onAutoOrganize()
    fitView({ duration: 300 })
  }

  function handleFitViewClick() {
    fitView({ duration: 300 })
  }

  return (
    <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
      <EditableText
        value={name}
        onCommit={onRename}
        className="min-w-0 truncate font-display text-sm font-semibold text-ink"
        inputClassName="text-sm font-display max-w-xs"
      />
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-line bg-surface">
          <button
            onClick={() => onViewModeChange('fields')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 text-xs',
              viewMode === 'fields' ? 'bg-surface-raised text-ink' : 'text-ink-muted hover:text-ink',
            )}
            title="Field view — shows how individual fields connect"
          >
            <Rows3 size={13} />
            Fields
          </button>
          <button
            onClick={() => onViewModeChange('relations')}
            className={cn(
              'flex items-center gap-1.5 border-l border-line px-2.5 py-1.5 text-xs',
              viewMode === 'relations' ? 'bg-surface-raised text-ink' : 'text-ink-muted hover:text-ink',
            )}
            title="Relation view — one line per table pair, with cardinality"
          >
            <Waypoints size={13} />
            Relations
          </button>
        </div>
        <Button onClick={handleFitViewClick} variant="outline" size="sm" disabled={!hasTables} title="Fit all tables in view">
          <Scan size={13} />
          Fit view
        </Button>
        <Button
          onClick={handleAutoOrganizeClick}
          variant="outline"
          size="sm"
          disabled={!canAutoOrganize}
          title="Reflow tables by how they're connected via relationships"
        >
          <Wand2 size={13} />
          Auto organize
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded-md border border-line bg-surface p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink"
              title="More options"
            >
              <MoreHorizontal size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onExport}>
              <Download size={14} />
              Export SQL
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                setConfirmDeleteOpen(true)
              }}
              className="text-rose data-[highlighted]:text-rose data-[highlighted]:bg-rose/10"
            >
              <Trash2 size={14} />
              Delete session
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete "{name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes its tables, fields, relationships, and chat history. This can't be undone.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" size="sm" onClick={onDeleteSession}>
                Delete session
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
