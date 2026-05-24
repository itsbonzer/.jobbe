import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"

import { cn } from "@/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full forced-colors:data-horizontal:border-t data-vertical:w-px data-vertical:self-stretch forced-colors:data-vertical:border-l",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
