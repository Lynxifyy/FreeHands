/**
 * FreeHands commits should be authored by the person using the app, not by a
 * generic "openhands" identity. These helpers resolve the identity to use:
 * an explicit git setting wins, otherwise fall back to the signed-in account's
 * email (and the local part of it as the name).
 */

export interface GitIdentityInput {
  /** Git name the user configured in Settings. */
  readonly configuredName?: string | null;
  /** Git email the user configured in Settings. */
  readonly configuredEmail?: string | null;
  /** Email of the signed-in user, used when no git email is configured. */
  readonly accountEmail?: string | null;
}

const clean = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** The local part of an email, used as a sensible default git name. */
export const gitNameFromEmail = (email?: string | null): string | null => {
  const address = clean(email);
  if (!address) return null;
  const [localPart] = address.split("@");
  return clean(localPart);
};

/** Configured git email, else the signed-in account email. */
export const resolveGitUserEmail = ({
  configuredEmail,
  accountEmail,
}: GitIdentityInput): string | null =>
  clean(configuredEmail) ?? clean(accountEmail);

/** Configured git name, else derived from whichever email applies. */
export const resolveGitUserName = ({
  configuredName,
  configuredEmail,
  accountEmail,
}: GitIdentityInput): string | null =>
  clean(configuredName) ??
  gitNameFromEmail(configuredEmail) ??
  gitNameFromEmail(accountEmail);
