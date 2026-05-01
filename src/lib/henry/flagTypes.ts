export const HENRY_FLAG_TYPES = [
  "harassment",
  "sexual_pressure",
  "boundary_violation",
  "manipulation",
  "coercion",
  "financial_scam_risk",
  "off_platform_push",
  "identity_inconsistency",
  "catfishing_risk",
  "grooming_pattern",
  "self_harm_concern",
  "threat_or_intimidation",
] as const;

export type HenryFlagType = typeof HENRY_FLAG_TYPES[number];