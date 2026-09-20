import { Sparkles, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown beside a field the doctor has already edited, when a dictation also returned text for
 * that same field -- per the merge rule, the AI never overwrites what's already there. This is
 * the only way that text reaches the field: an explicit "Add" tap. */
export function DictationSuggestionChip({
  text,
  onAdd,
  onDismiss,
}: {
  text: string;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-primary/25 bg-primary/5 dark:bg-primary/10 px-2.5 py-1.5 text-xs text-foreground shadow-xs transition-all duration-200 animate-in fade-in-50 slide-in-from-top-1 mt-1">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-[11px] font-medium text-muted-foreground shrink-0">Suggestion:</span>
        <span className="text-xs text-foreground truncate font-normal" title={text}>
          &ldquo;{text}&rdquo;
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-6 px-2 text-[11px] font-medium gap-1 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/20"
          onClick={onAdd}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          title="Dismiss suggestion"
          aria-label="Dismiss suggestion"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

