import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, X, Phone, UserX } from "lucide-react";
import type { PatientRow } from "@/lib/clinic-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface PatientSearchSelectProps {
  patients: PatientRow[];
  value: string;
  onChange: (patientId: string, patient?: PatientRow | null) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  className?: string;
}

export function PatientSearchSelect({
  patients,
  value,
  onChange,
  placeholder = "Search patient by name or mobile...",
  required = false,
  disabled = false,
  autoFocus = false,
  id,
  className = "",
}: PatientSearchSelectProps) {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Identify currently selected patient
  const selectedPatient = useMemo(() => {
    if (!value) return null;
    return patients.find((p) => p.id === value) || null;
  }, [value, patients]);

  // Filtered patients based on typed query
  const filteredPatients = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return patients.slice(0, 30);
    return patients
      .filter((p) => p.name.toLowerCase().includes(q) || p.mobile.includes(q))
      .slice(0, 30);
  }, [patients, query]);

  // Reset highlight index when filtered list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredPatients.length, query]);

  const handleSelect = (patient: PatientRow) => {
    onChange(patient.id, patient);
    setQuery("");
  };

  const handleClearSelection = () => {
    onChange("", null);
    setQuery("");
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filteredPatients.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1 >= filteredPatients.length ? 0 : prev + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? filteredPatients.length - 1 : prev - 1));
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < filteredPatients.length) {
        e.preventDefault();
        handleSelect(filteredPatients[highlightedIndex]);
      }
    }
  };

  // State 1: A patient is selected -> Render prominent Selected Card
  if (selectedPatient) {
    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        <div className="flex items-center justify-between p-3 rounded-lg border border-primary/40 bg-primary/5 transition-all">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="h-9 w-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm shrink-0 uppercase">
              {selectedPatient.name.charAt(0) || "P"}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground truncate">
                  {selectedPatient.name}
                </span>
                <Badge variant="outline" className="text-[10px] border-emerald-200 text-emerald-800 bg-emerald-100 dark:border-emerald-500/30 dark:text-emerald-400 dark:bg-emerald-500/10 px-1.5 py-0 h-4 shrink-0 font-medium">
                  Selected
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="h-3 w-3 text-muted-foreground/70" />
                  {selectedPatient.mobile}
                </span>
                {(selectedPatient.age || selectedPatient.gender) && (
                  <span>
                    · {[
                      selectedPatient.age ? `${selectedPatient.age} Yrs` : null,
                      selectedPatient.gender ? selectedPatient.gender.charAt(0).toUpperCase() + selectedPatient.gender.slice(1) : null,
                    ]
                      .filter(Boolean)
                      .join(" / ")}
                  </span>
                )}
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearSelection}
            disabled={disabled}
            className="h-8 text-xs shrink-0 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
          >
            Change
          </Button>
        </div>

        {/* Hidden input for form validity */}
        {required && (
          <input
            type="text"
            tabIndex={-1}
            className="sr-only"
            value={value}
            onChange={() => {}}
            required={required}
            aria-hidden="true"
          />
        )}
      </div>
    );
  }

  // State 2: Searching & Selecting -> Render Search Input + Inline Results List
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Search Input Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoFocus={autoFocus}
          className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 py-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
        />

        {query && !disabled && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors"
            title="Clear search"
            tabIndex={-1}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Inline Results Box */}
      <div className="rounded-lg border border-border bg-card/60 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border/50 text-[11px] text-muted-foreground font-medium">
          <span>
            {query.trim()
              ? `Matches for "${query.trim()}" (${filteredPatients.length})`
              : `Patients (${filteredPatients.length}${patients.length > 30 ? " shown" : ""})`}
          </span>
          <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">Click row to select</span>
        </div>

        <div className="max-h-44 overflow-y-auto divide-y divide-border/40">
          {filteredPatients.length > 0 ? (
            filteredPatients.map((p, idx) => {
              const isHighlighted = idx === highlightedIndex;
              return (
                <div
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 text-xs sm:text-sm cursor-pointer transition-colors ${
                    isHighlighted
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50 text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 uppercase">
                      {p.name.charAt(0) || "P"}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <span className="font-mono">{p.mobile}</span>
                        {(p.age || p.gender) && (
                          <span>
                            · {[
                              p.age ? `${p.age}y` : null,
                              p.gender ? p.gender.charAt(0).toUpperCase() + p.gender.slice(1) : null,
                            ]
                              .filter(Boolean)
                              .join(" / ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span className="text-[11px] font-medium text-primary shrink-0 opacity-80 hover:opacity-100 flex items-center gap-1">
                    Select <span aria-hidden="true">&rarr;</span>
                  </span>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
              <UserX className="h-6 w-6 text-muted-foreground/50 mb-1.5" />
              <p className="text-xs font-medium text-foreground">No matching patients found</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Switch to &ldquo;+ New Patient Inline&rdquo; above to register them now.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Hidden input for form validity when required */}
      {required && (
        <input
          type="text"
          tabIndex={-1}
          className="sr-only"
          value={value}
          onChange={() => {}}
          required={required}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
