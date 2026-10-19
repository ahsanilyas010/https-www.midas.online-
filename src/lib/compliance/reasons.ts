export const SUPPRESSION_REASONS = [
  { value: "internal_optout", label: "Internal opt-out" },
  { value: "verbal_dnc", label: "Verbal DNC on a call" },
  { value: "complaint", label: "Complaint" },
  { value: "tps", label: "TPS" },
  { value: "ctps", label: "CTPS" },
  { value: "us_national_dnc", label: "US National DNC" },
  { value: "state_dnc", label: "State DNC" },
  { value: "client_supplied_dnc", label: "Client-supplied DNC" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "deceased", label: "Deceased" },
  { value: "vulnerable_person", label: "Vulnerable person" },
] as const;
