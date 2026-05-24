import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariantOption = {
  base: "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent text-sm whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-disabled:cursor-not-allowed",
  options: {
    variants: {
      variant: {
        outline:
          "relative isolate overflow-hidden border-border bg-background text-foreground before:absolute before:inset-0 before:-z-1 before:transition-all before:content-[''] not-data-disabled:hover:text-accent-foreground not-data-disabled:hover:before:bg-accent not-data-disabled:active:before:bg-accent-pressed data-disabled:text-muted-foreground data-[popup-open]:before:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground not-data-disabled:hover:bg-secondary-hovered not-data-disabled:active:bg-secondary-pressed data-[popup-open]:bg-secondary-hovered data-disabled:text-muted-foreground",
        ghost:
          "not-data-disabled:hover:text-accent-foreground text-foreground not-data-disabled:hover:bg-accent not-data-disabled:active:bg-accent-pressed data-[popup-open]:bg-accent-pressed data-disabled:text-muted-foreground",
        link: "text-primary-text underline-offset-4 not-data-disabled:hover:underline data-[popup-open]:underline",
        text: "text-muted-foreground not-data-disabled:hover:text-foreground data-[popup-open]:text-foreground",
        primary:
          "bg-primary text-primary-foreground not-data-disabled:hover:bg-primary-hovered not-data-disabled:active:bg-primary-pressed data-[popup-open]:bg-primary-hovered",
        "primary-outline":
          "border-primary-text text-primary-text not-data-disabled:hover:bg-primary-text/[.08] not-data-disabled:active:bg-primary-text/[.16] data-[popup-open]:bg-primary-text/[.08]",
        "primary-ghost":
          "text-primary-text not-data-disabled:hover:bg-primary-text/[.08] not-data-disabled:active:bg-primary-text/[.16] data-[popup-open]:bg-primary-text/[.08]",
        destructive:
          "bg-destructive text-destructive-foreground not-data-disabled:hover:bg-destructive-hovered not-data-disabled:active:bg-destructive-pressed data-[popup-open]:bg-destructive-hovered",
        "destructive-outline":
          "border-destructive-text text-destructive-text not-data-disabled:hover:bg-destructive-text/[.08] not-data-disabled:active:bg-destructive-text/[.16] data-[popup-open]:bg-destructive-text/[.08]",
        "destructive-ghost":
          "text-destructive-text not-data-disabled:hover:bg-destructive-text/[.08] not-data-disabled:active:bg-destructive-text/[.16] data-[popup-open]:bg-destructive-text/[.08]",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-0.5 rounded-[min(var(--radius-md),10px)] px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        lg: "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        icon: "size-8",
        "icon-xs": "size-6 rounded-[min(var(--radius-md),10px)]",
        "icon-sm": "size-7 rounded-[min(var(--radius-md),12px)]",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
} as const

const buttonVariants = cva(
  buttonVariantOption.base,
  buttonVariantOption.options
)

function Button({
  className,
  variant = "primary",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants, buttonVariantOption }
