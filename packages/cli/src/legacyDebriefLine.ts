import { isErr } from "@phyxiusjs/fp";
import { debriefFilePath, readDebriefFile } from "debrief";
import { describeDebriefRead } from "./debrief/validate.ts";

export async function legacyDebriefLine(
  repoRoot: string,
  graph: string,
  node: string,
  isLatestSession: boolean,
): Promise<string | undefined> {
  if (!isLatestSession) return undefined;
  const read = await readDebriefFile(debriefFilePath(repoRoot, graph, node));
  return isErr(read) ? undefined : describeDebriefRead(read.value);
}
