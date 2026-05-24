import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "w-full min-w-0 rounded-lg border border-input bg-background text-base text-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&:-webkit-autofill]:inset-ring-[9999px] [&:-webkit-autofill]:inset-ring-background",
  {
    variants: {
      size: {
        default: "h-8 px-2.5 py-1 md:text-sm",
        sm: "h-7 rounded-[min(var(--radius-md),12px)] px-2.5 py-0.75 pb-1 md:text-[0.8rem]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function Input({
  className,
  type,
  size = "default",
  ...props
}: Omit<InputPrimitive.Props, "size"> & {
  size?: "default" | "sm" | number
}) {
  return (
    <InputPrimitive
      type={type}
      size={typeof size === "number" ? size : undefined}
      data-slot="input"
      data-size={size}
      className={cn(
        inputVariants({
          size: typeof size === "number" ? undefined : size,
          className,
        })
      )}
      {...props}
    />
  )
}

export { Input }
