import * as RadixSelect from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'

export const Select = RadixSelect.Root
export const SelectValue = RadixSelect.Value

export function SelectTrigger({ className, children, ...props }: RadixSelect.SelectTriggerProps) {
  return (
    <RadixSelect.Trigger
      className={cn(
        'inline-flex items-center justify-between gap-1 rounded border border-line bg-inset px-2 py-1 font-mono text-xs text-ink outline-none hover:border-line-strong focus-visible:border-accent disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      <RadixSelect.Icon>
        <ChevronDown size={12} className="text-ink-faint" />
      </RadixSelect.Icon>
    </RadixSelect.Trigger>
  )
}

export function SelectContent({ className, children, ...props }: RadixSelect.SelectContentProps) {
  return (
    <RadixSelect.Portal>
      <RadixSelect.Content
        className={cn(
          'z-50 max-h-64 overflow-hidden rounded-md border border-line bg-surface-raised text-ink shadow-2xl data-[state=open]:animate-[fade-in_120ms_ease-out]',
          className,
        )}
        position="popper"
        sideOffset={4}
        {...props}
      >
        <RadixSelect.Viewport className="p-1">{children}</RadixSelect.Viewport>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  )
}

export function SelectItem({ className, children, ...props }: RadixSelect.SelectItemProps) {
  return (
    <RadixSelect.Item
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded px-6 py-1.5 font-mono text-xs text-ink outline-none data-[highlighted]:bg-surface data-[highlighted]:text-accent',
        className,
      )}
      {...props}
    >
      <RadixSelect.ItemIndicator className="absolute left-1.5 inline-flex items-center">
        <Check size={12} />
      </RadixSelect.ItemIndicator>
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
    </RadixSelect.Item>
  )
}
