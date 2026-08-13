import { useEffect, useState } from "react";
import { Filter } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDateIST } from "@/lib/dates";
import type { Database } from "@/types/database.types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

type MessageLogRow = Database["public"]["Tables"]["message_log"]["Row"];

interface JoinedMessageLog extends MessageLogRow {
  clinic?: { name: string } | null;
}

export function MessagesPage() {
  const [messages, setMessages] = useState<JoinedMessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("failed");

  useEffect(() => {
    async function loadMessages() {
      setLoading(true);
      setError(null);

      let query = supabase.from("message_log").select("*, clinic:clinics(name)").order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error: err } = await query;

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      setMessages((data as JoinedMessageLog[]) || []);
      setLoading(false);
    }

    loadMessages();
  }, [statusFilter]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-foreground">Global Message Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Audit log of WhatsApp recall messages across all clinics</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="text-xs font-medium text-muted-foreground mr-2 flex items-center gap-1">
          <Filter className="h-3.5 w-3.5" />
          Filter:
        </span>
        <Button
          variant={statusFilter === "failed" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setStatusFilter("failed")}
        >
          Failed Only
        </Button>
        <Button
          variant={statusFilter === "queued" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setStatusFilter("queued")}
        >
          Queued
        </Button>
        <Button
          variant={statusFilter === "sent" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setStatusFilter("sent")}
        >
          Sent
        </Button>
        <Button
          variant={statusFilter === "delivered" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setStatusFilter("delivered")}
        >
          Delivered
        </Button>
        <Button
          variant={statusFilter === "all" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setStatusFilter("all")}
        >
          All Statuses
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <p className="text-sm text-muted-foreground">No message log entries found.</p>
              {statusFilter !== "all" && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setStatusFilter("all")}>
                  Clear Status Filter
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                  <tr>
                    <th className="py-3 px-4">Clinic</th>
                    <th className="py-3 px-4">Mobile</th>
                    <th className="py-3 px-4">Template</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Sent At</th>
                    <th className="py-3 px-4">Error Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {messages.map((m) => (
                    <tr key={m.id}>
                      <td className="py-3.5 px-4 font-medium text-foreground">{m.clinic?.name || "—"}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">{m.mobile || "—"}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">{m.template_name || "—"}</td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant="outline"
                          className={
                            m.status === "failed"
                              ? "border-destructive/30 text-destructive bg-destructive/10"
                              : "border-primary/30 text-primary bg-primary/5"
                          }
                        >
                          {m.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground">
                        {m.sent_at ? formatDateIST(m.sent_at.split("T")[0]) : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-muted-foreground">
                        {m.error_message ? `${m.error_code || ""}: ${m.error_message}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
