import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown beside a field the doctor has already edited, when a dictation also returned text for
 * that same field -- per the merge rule, the AI never overwrites what's already there. This is
 * the only way that text reaches the field: an explicit "Add" tap. */
export function DictationSuggestionChip({ text, onAdd, onDismiss }: { text: string; onAdd: () => void; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs">
      <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
      <span className="flex-1 text-foreground">{text}</span>
      <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px] shrink-0" onClick={onAdd}>
        Add
      </Button>
      <button type="button" onClick={onDismiss} className="shrink-0 text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
