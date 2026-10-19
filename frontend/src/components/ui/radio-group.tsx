import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const radioGroupVariants = cva("", {
  variants: {
    variant: {
      default: "grid w-full gap-2",
      segmented: "flex w-fit flex-row flex-wrap items-center gap-1",
    },
  },
  defaultVariants: { variant: "default" },
});

const radioGroupItemVariants = cva("outline-none transition-colors", {
  variants: {
    variant: {
      default:
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-full border border-input focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
      // Segmented button look of a required single choice; the checked
      // option is filled, so no indicator dot is rendered.
      segmented:
        "inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md border border-border bg-background px-2.5 text-sm font-medium whitespace-nowrap transition-all select-none hover:bg-muted hover:text-foreground focus-visible:z-10 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:bg-primary data-checked:text-primary-foreground data-checked:hover:bg-primary/80 data-disabled:pointer-events-none data-disabled:opacity-50 dark:border-input dark:bg-input/30 dark:hover:bg-input/50 dark:data-checked:bg-primary dark:data-checked:hover:bg-primary/80 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-3.5",
    },
  },
  defaultVariants: { variant: "default" },
});

function RadioGroup({
  className,
  variant,
  ...props
}: RadioGroupPrimitive.Props & VariantProps<typeof radioGroupVariants>) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn(radioGroupVariants({ variant }), className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  variant,
  children,
  ...props
}: RadioPrimitive.Root.Props & VariantProps<typeof radioGroupItemVariants>) {
  if (variant === "segmented") {
    return (
      <RadioPrimitive.Root
        data-slot="radio-group-item"
        className={cn(radioGroupItemVariants({ variant }), className)}
        {...props}
      >
        {children}
      </RadioPrimitive.Root>
    );
  }
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(radioGroupItemVariants({ variant }), className)}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex items-center justify-center"
      >
        <span className="size-1.5 rounded-full bg-primary-foreground" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  );
}
export { RadioGroup, RadioGroupItem };
