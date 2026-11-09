import * as SwitchPrimitive from "@radix-ui/react-switch";
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
  forwardRef,
} from "react";

type SwitchProps = ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & {
  icon?: ReactNode;
  label: string;
};

export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, icon, label, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={["director__switch", className].filter(Boolean).join(" ")}
    aria-label={label}
    title={label}
    {...props}
  >
    <SwitchPrimitive.Thumb className="director__switch-thumb">
      {icon ?? null}
    </SwitchPrimitive.Thumb>
  </SwitchPrimitive.Root>
));

Switch.displayName = SwitchPrimitive.Root.displayName;
