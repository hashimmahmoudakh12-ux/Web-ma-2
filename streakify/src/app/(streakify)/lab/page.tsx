/**
 * /lab: preview of the stop-motion mascot and animations before they go
 * into the real screens. Safe to share: no customer data here.
 */
import type { Metadata } from "next";
import { demoCafe, sanaaCafe } from "@/lib/demo/cafes";
import { LabClient } from "./LabClient";

export const metadata: Metadata = { title: "Streakify motion lab", robots: { index: false } };

export default function LabPage() {
  return <LabClient themes={[{ name: sanaaCafe.name, brand: sanaaCafe.brand }, { name: demoCafe.name, brand: demoCafe.brand }]} />;
}
