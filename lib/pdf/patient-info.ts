import "server-only";

/**
 * Shared patient-info formatting for print/export routes (prescription PDF,
 * ultrasound report PDF). Age is computed VN-local (Asia/Ho_Chi_Minh) so a
 * patient's birthday "ticks over" at the same moment the rest of the app
 * treats as "today".
 */

/** Computes whole years of age from an ISO `YYYY-MM-DD` dob. Null if dob is null/invalid. */
export function computeAge(dob: string | null): number | null {
  if (!dob) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!match) return null;
  const [, yStr, mStr, dStr] = match;
  const birthYear = Number(yStr);
  const birthMonth = Number(mStr);
  const birthDay = Number(dStr);
  if (!Number.isFinite(birthYear) || !Number.isFinite(birthMonth) || !Number.isFinite(birthDay))
    return null;

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );
  const [todayY, todayM, todayD] = todayStr.split("-").map(Number);
  if (todayY == null || todayM == null || todayD == null) return null;

  let age = todayY - birthYear;
  if (todayM < birthMonth || (todayM === birthMonth && todayD < birthDay)) age -= 1;
  return age >= 0 ? age : null;
}
