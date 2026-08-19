import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Filter, MessageSquare } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { formatDateIST } from "@/lib/dates";
import type { Database } from "@/types/database.types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

type MessageLogRow = Database["public"]["Tables"]["message_log"]["Row"];

export function ClinicMessagesPage() {
  const { profile } = useAuth();

  // Guardrail: Owner Only access (matching Settings tab)
  if (profile?.role !== "owner") {
    return <Navigate to="/app" replace />;
  }

  const [messages, setMessages] = useState<MessageLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    async function loadMessages() {
      setLoading(true);
      setError(null);

      // Scoped automatically to this clinic via Supabase RLS
      let query = supabase.from("message_log").select("*").order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error: err } = await query;

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      setMessages((data as MessageLogRow[]) || []);
      setLoading(false);
    }

    loadMessages();
  }, [statusFilter]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Message Log
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Audit log of WhatsApp recall messages sent to clinic patients
          </p>
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
          variant={statusFilter === "read" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setStatusFilter("read")}
        >
          Read
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
                    <th className="py-3 px-4">Mobile</th>
                    <th className="py-3 px-4">Template</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Sent At</th>
                    <th className="py-3 px-4">Error Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {messages.map((m) => {
                    let pillStyle = "border-muted text-muted-foreground bg-muted/20";
                    if (m.status === "failed") {
                      pillStyle = "border-destructive/30 text-destructive bg-destructive/10 dark:bg-destructive/20";
                    } else if (m.status === "queued") {
                      pillStyle = "border-amber-600/30 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40";
                    } else if (m.status === "sent") {
                      pillStyle = "border-blue-600/30 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40";
                    } else if (m.status === "delivered") {
                      pillStyle = "border-emerald-600/30 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40";
                    } else if (m.status === "read") {
                      pillStyle = "border-sky-600/30 text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40";
                    }

                    const dateStr = m.sent_at || m.created_at;

                    return (
                      <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-foreground">{m.mobile || "—"}</td>
                        <td className="py-3.5 px-4 text-muted-foreground">{m.template_name || "—"}</td>
                        <td className="py-3.5 px-4">
                          <Badge variant="outline" className={`capitalize font-normal text-xs ${pillStyle}`}>
                            {m.status}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-muted-foreground">
                          {dateStr ? formatDateIST(dateStr.split("T")[0]) : "—"}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-muted-foreground max-w-xs truncate">
                          {m.error_message ? `${m.error_code ? `[${m.error_code}] ` : ""}${m.error_message}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
