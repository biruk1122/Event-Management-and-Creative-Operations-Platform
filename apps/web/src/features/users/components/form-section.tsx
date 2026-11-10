import type { LucideIcon } from "lucide-react";

/**
 * A form section heading styled like the Register Employee form: an icon badge
 * and a label, used as the `<legend>` of a `<fieldset>`.
 */
export function FormSectionLegend({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <legend className="mb-1 flex items-center gap-2.5 px-1 text-base font-semibold">
      <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      {children}
    </legend>
  );
}
