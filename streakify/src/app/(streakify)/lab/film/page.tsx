import type { Metadata } from "next";
import { FilmStage } from "../Stage";

export const metadata: Metadata = { title: "Check-in film", robots: { index: false } };

export default function Page() {
  return <FilmStage />;
}
