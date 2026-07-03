import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '../../lib/cn'

export const DropdownMenu = RadixDropdownMenu.Root
export const DropdownMenuTrigger = RadixDropdownMenu.Trigger

export function DropdownMenuContent({ className, children, ...props }: RadixDropdownMenu.DropdownMenuContentProps) {
  return (
    <RadixDropdownMenu.Portal>
      <RadixDropdownMenu.Content
        className={cn(
          'z-50 min-w-[10rem] overflow-hidden rounded-md border border-line bg-surface-raised p-1 text-ink shadow-2xl',
          className,
        )}
        sideOffset={4}
        align="end"
        {...props}
      >
        {children}
      </RadixDropdownMenu.Content>
    </RadixDropdownMenu.Portal>
  )
}

export function DropdownMenuItem({ className, ...props }: RadixDropdownMenu.DropdownMenuItemProps) {
  return (
    <RadixDropdownMenu.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded px-2.5 py-1.5 text-sm text-ink outline-none data-[highlighted]:bg-surface data-[highlighted]:text-accent',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({ className, ...props }: RadixDropdownMenu.DropdownMenuSeparatorProps) {
  return <RadixDropdownMenu.Separator className={cn('my-1 h-px bg-line', className)} {...props} />
}
