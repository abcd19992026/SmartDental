import { addDays, combineIstInstant } from "../_shared/ist-time.ts";

export type LadderStage = 1 | 2 | 3;

const STAGE2_FLOOR_TIME = "07:00:00";
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export interface DetermineStageParams {
  dueDate: string;
  dueTime: string | null;
  lastStageSent: number | null;
  /** IST calendar date (YYYY-MM-DD) of "now" -- from getIstNow(). */
  todayStr: string;
  /** IST wall-clock hour (0-23) of "now" -- from getIstNow(). */
  istHour: number;
  /** The real current instant. Only stage 2's due_time-based math needs sub-hour precision;
   * stages 1/3 compare against istHour alone. */
  nowInstant: Date;
  /** Hour component of the clinic's own send_time, e.g. clinic.send_time = "10:00:00" -> 10.
   * Governs stage 1 ("day_before") and stage 3 ("follow_up") only -- stage 2 is keyed to the
   * recall's own due_time, not the clinic's send_time. */
  clinicSendHour: number;
}

/** Decides which of the three fixed ladder stages (if any) is due for a recall RIGHT NOW, given
 * the catch-up boundary from 21A-2's spec:
 *   - a stage whose target IST calendar day is still today, and whose target moment has already
 *     passed, fires now (a late/catch-up send -- correct, not a bug)
 *   - a stage whose target IST calendar day is already over is dropped permanently, without
 *     blocking any later stage from still being considered
 *   - a stage whose target day hasn't arrived yet means nothing is due (later stages can't be
 *     due either, since the three stages are strictly ordered by calendar day)
 * Returns null when no stage is currently due (already fully progressed, not yet due today, or
 * every remaining stage's day has already passed). Purely a decision function -- it never reads
 * or writes the database; the caller is responsible for atomically re-checking/claiming the
 * chosen stage immediately before actually sending (see sendOneRecallMessage in send.ts). */
export function determineStageToSend(params: DetermineStageParams): LadderStage | null {
  const startStage = (params.lastStageSent ?? 0) + 1;

  for (let stage = startStage; stage <= 3; stage++) {
    if (stage === 2 && params.dueTime === null) {
      // Stage 2 doesn't exist for this recall at all -- move straight to stage 3's own check.
      continue;
    }

    const targetDay =
      stage === 1 ? addDays(params.dueDate, -1) : stage === 3 ? addDays(params.dueDate, 1) : params.dueDate;

    if (targetDay > params.todayStr) {
      // Not due yet -- and since stages are strictly chronological, no later stage can be due
      // either.
      return null;
    }
    if (targetDay < params.todayStr) {
      // This stage's own day is over. Drop it permanently (never sent), but keep checking later
      // stages -- a recall whose stage 1 day passed can still fire stage 2/3 normally.
      continue;
    }

    // targetDay === todayStr: the stage's day has arrived. Check its specific time-of-day gate.
    if (stage === 1 || stage === 3) {
      return params.istHour >= params.clinicSendHour ? (stage as LadderStage) : null;
    }

    // stage === 2, due_time is guaranteed non-null here (checked above).
    const appointmentInstant = combineIstInstant(params.dueDate, params.dueTime!);
    if (params.nowInstant.getTime() > appointmentInstant.getTime()) {
      // The appointment moment itself has already passed today -- a reminder for a time that's
      // gone is worse than none. Drop stage 2 (stricter than the generic same-day catch-up rule
      // above), but stage 3 remains a normal candidate tomorrow.
      continue;
    }

    const rawTarget = new Date(appointmentInstant.getTime() - TWO_HOURS_MS);
    const floorTarget = combineIstInstant(params.dueDate, STAGE2_FLOOR_TIME);
    const clampedTarget = rawTarget.getTime() < floorTarget.getTime() ? floorTarget : rawTarget;

    return params.nowInstant.getTime() >= clampedTarget.getTime() ? 2 : null;
  }

  return null;
}
