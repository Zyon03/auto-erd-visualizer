import type { HTMLAttributes } from 'react'
import * as RadixAlertDialog from '@radix-ui/react-alert-dialog'
import { cn } from '../../lib/cn'

export const AlertDialog = RadixAlertDialog.Root
export const AlertDialogTrigger = RadixAlertDialog.Trigger

export function AlertDialogContent({ className, ...props }: RadixAlertDialog.AlertDialogContentProps) {
  return (
    <RadixAlertDialog.Portal>
      <RadixAlertDialog.Overlay className="fixed inset-0 z-40 bg-canvas/70 backdrop-blur-[2px]" />
      <RadixAlertDialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface-raised p-5 shadow-2xl focus:outline-none',
          className,
        )}
        {...props}
      />
    </RadixAlertDialog.Portal>
  )
}

export function AlertDialogTitle({ className, ...props }: RadixAlertDialog.AlertDialogTitleProps) {
  return (
    <RadixAlertDialog.Title
      className={cn('font-display text-base font-semibold text-ink', className)}
      {...props}
    />
  )
}

export function AlertDialogDescription({ className, ...props }: RadixAlertDialog.AlertDialogDescriptionProps) {
  return (
    <RadixAlertDialog.Description className={cn('mt-2 text-sm text-ink-muted', className)} {...props} />
  )
}

export function AlertDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-5 flex justify-end gap-2', className)} {...props} />
}

export const AlertDialogCancel = RadixAlertDialog.Cancel
export const AlertDialogAction = RadixAlertDialog.Action
