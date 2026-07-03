import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

export const Dialog = RadixDialog.Root
export const DialogTrigger = RadixDialog.Trigger

export function DialogContent({ className, children, ...props }: RadixDialog.DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-canvas/70 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
      <RadixDialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface-raised p-5 shadow-2xl focus:outline-none data-[state=open]:animate-[fade-in_150ms_ease-out]',
          className,
        )}
        {...props}
      >
        {children}
        <RadixDialog.Close className="absolute right-3 top-3 rounded p-1 text-ink-faint hover:bg-surface hover:text-ink">
          <X size={14} />
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}

export function DialogTitle({ className, ...props }: RadixDialog.DialogTitleProps) {
  return <RadixDialog.Title className={cn('font-display text-base font-semibold text-ink pr-6', className)} {...props} />
}

export function DialogDescription({ className, ...props }: RadixDialog.DialogDescriptionProps) {
  return <RadixDialog.Description className={cn('mt-2 text-sm text-ink-muted', className)} {...props} />
}
