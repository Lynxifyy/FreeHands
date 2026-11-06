import { cn } from "#/utils/utils";
import { dropdownMenuRowIconWrapperClassName } from "#/utils/dropdown-classes";

interface KebabMenuItemContentProps {
  icon: React.ReactNode;
  label: string;
  /** Optional second line under the label. */
  description?: string;
}

export function KebabMenuItemContent({
  icon,
  label,
  description,
}: KebabMenuItemContentProps) {
  return (
    <span className="flex min-w-0 w-full items-center gap-2">
      <span
        className={cn("[&_svg]:size-4", dropdownMenuRowIconWrapperClassName)}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="min-w-0 truncate">{label}</span>
        {description ? (
          <span className="min-w-0 truncate text-xs text-muted">
            {description}
          </span>
        ) : null}
      </span>
    </span>
  );
}
