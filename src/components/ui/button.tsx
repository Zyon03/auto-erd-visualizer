import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Prepends a spinner and disables the button — for an action with a real server round-trip
   *  (auto-organize, export, delete), not anything that resolves instantly. Doesn't touch
   *  `children`, so swap your own leading icon out at the call site if you have one, e.g.
   *  `{loading ? null : <Wand2 size={13} />}`. */
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-canvas hover:bg-accent-strong border border-transparent',
  outline: 'bg-transparent text-ink border border-line hover:border-line-strong hover:bg-surface-raised',
  ghost: 'bg-transparent text-ink-muted border border-transparent hover:bg-surface-raised hover:text-ink',
  destructive: 'bg-transparent text-rose border border-rose/30 hover:bg-rose/10 hover:border-rose/50',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs gap-1.5',
  md: 'px-3.5 py-2 text-sm gap-2',
}

const spinnerSize: Record<ButtonSize, number> = {
  sm: 12,
  md: 14,
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium leading-none transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 size={spinnerSize[size]} className="animate-spin" />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'
