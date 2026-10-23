import "server-only";

// Bank-transfer details for customers who pay by transfer instead of card.
// Read from the environment so the account details never live in the repo;
// returns null (and the billing page hides the option) until they are set.

export interface BankTransferDetails {
  rows: { label: string; value: string }[];
  note: string | null;
}

export function bankTransferDetails(): BankTransferDetails | null {
  const e = process.env;
  const name = e.BANK_ACCOUNT_NAME?.trim();
  if (!name || !(e.BANK_IBAN?.trim() || e.BANK_ACCOUNT_NUMBER?.trim())) return null;
  const candidates: [string, string | undefined][] = [
    ["Account name", name],
    ["Bank", e.BANK_NAME],
    ["IBAN", e.BANK_IBAN],
    ["Account number", e.BANK_ACCOUNT_NUMBER],
    ["Sort code", e.BANK_SORT_CODE],
    ["Routing number", e.BANK_ROUTING_NUMBER],
    ["SWIFT / BIC", e.BANK_SWIFT_BIC],
  ];
  return {
    rows: candidates.filter(([, v]) => v?.trim()).map(([label, v]) => ({ label, value: v!.trim() })),
    note: e.BANK_TRANSFER_NOTE?.trim() || null,
  };
}
