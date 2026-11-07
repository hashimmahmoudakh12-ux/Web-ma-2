import type { Metadata } from "next";
import { MoodsStage } from "../Stage";

export const metadata: Metadata = { title: "Mascot moods", robots: { index: false } };

export default function Page() {
  return <MoodsStage />;
}
