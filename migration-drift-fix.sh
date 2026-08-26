#!/bin/bash
# SmartDentist - migration drift fix
# Git Bash me chalao, project folder ke andar se:
#   cd "/c/Users/HP/Desktop/Smart Dentist"
#   bash migration-drift-fix.sh
#
# Ye sirf 8 FILE KE NAAM badalta hai. File ke ANDAR ka SQL bilkul nahi chhuta.
# Database pe kuch nahi chalta. Poori tarah safe.

set -e
cd supabase/migrations

echo "Renaming 8 drifted migration files to match applied DB versions..."

git mv 20260827090000_patient_clinical_profile.sql                 20260824113926_patient_clinical_profile.sql
git mv 20260828060000_fix_branch_ownership_tautology.sql           20260824115751_fix_branch_ownership_tautology.sql
git mv 20260829060000_appointments_walkin_daysheet.sql             20260824165148_appointments_walkin_daysheet.sql
git mv 20260829060100_fix_log_activity_patients_regression.sql     20260824165413_fix_log_activity_patients_regression.sql
git mv 20260830060000_appointments_booking_phase1.sql              20260825030913_appointments_booking_phase1.sql
git mv 20260831060000_create_appointment_recall_link.sql           20260825045124_create_appointment_recall_link.sql
git mv 20260901060000_create_appointment_recall_never_blocks.sql   20260825051100_create_appointment_recall_never_blocks.sql
git mv 20260902060000_appointments_checkin_vitals.sql              20260825171830_appointments_checkin_vitals.sql

echo ""
echo "Done. File count check (should be 83 after you add the 2 new files):"
ls -1 | wc -l
