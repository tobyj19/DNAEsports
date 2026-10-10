import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCoreInfo } from "@/lib/coreInfo";
import { getBreederScores, getBreederGrades } from "@/lib/breederScore";
import { getBikeViews, getDistanceProfiles } from "@/lib/distanceProfile";
import CoreProfileClient from "./core-profile-client";

interface Props {
  params: { hid: string };
  searchParams: { mode?: string };
}

function parseHid(raw: string): number | null {
  const hid = Number(raw);
  return Number.isInteger(hid) && hid > 0 ? hid : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const hid = parseHid(params.hid);
  const info = hid ? await getCoreInfo(hid) : null;
  return { title: info ? `${info.name} #${info.hid} · DNA Analytics` : "Core not found" };
}

export default async function CorePage({ params, searchParams }: Props) {
  const hid = parseHid(params.hid);
  if (!hid) notFound();
  const info = await getCoreInfo(hid);
  if (!info) notFound();

  const mode = searchParams.mode === "bike" || searchParams.mode === "car" || searchParams.mode === "horse" ? searchParams.mode : null;
  const familyHids = [info.father?.hid, info.mother?.hid, ...info.offspring.map((c) => c.hid)].filter(
    (h): h is number => typeof h === "number"
  );
  return (
    <CoreProfileClient
      info={info}
      initialMode={mode}
      breeder={getBreederScores(hid)}
      familyGrades={getBreederGrades(familyHids)}
      distance={getDistanceProfiles(hid, [info.father?.hid, info.mother?.hid])}
      distanceViews={getBikeViews(hid)}
    />
  );
}
