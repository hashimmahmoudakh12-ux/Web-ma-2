/**
 * The exact words customers agree to. If you change the wording, bump
 * PRIVACY_VERSION so the database records which version each person saw.
 */
export const PRIVACY_VERSION = "2026-11-v1";

export function privacyNotice(cafeName: string): string {
  return `${cafeName}'s rewards program (run by Streakify) stores your phone number, the name you give us, your optional birthday, and the dates of your visits. We use them only to track your streak and rewards. We never sell your data. Ask the staff anytime to delete your account.`;
}

export function smsConsentText(cafeName: string): string {
  return `Yes, text me streak reminders and reward alerts from ${cafeName}. Up to 4 messages/month. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not required to join.`;
}
