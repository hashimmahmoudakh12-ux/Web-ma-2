import { z } from "zod";

/**
 * How a café's pages look. Stored in `cafes.brand` (JSON).
 * Every color becomes a CSS variable (see CafeTheme) so the whole UI re-skins
 * itself per café without any code changes.
 */
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color like #d4a24c");

export const brandSchema = z.object({
  logoUrl: z.string().nullable().default(null),
  colors: z.object({
    background: hex, // page background
    surface: hex, // cards
    primary: hex, // buttons, progress bar, highlights
    onPrimary: hex, // text on primary buttons
    text: hex,
    muted: hex, // secondary text
  }),
  /** Short line under the logo on the counter screen. */
  tagline: z.string().optional(),
});
export type Brand = z.infer<typeof brandSchema>;

export function parseBrand(json: unknown): Brand {
  return brandSchema.parse(json);
}
