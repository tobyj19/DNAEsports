import type { Metadata } from "next";
import FinderClient from "./finder-client";

export const metadata: Metadata = { title: "Pair Finder · DNA Analytics" };

export default function FinderPage() {
  return <FinderClient />;
}
