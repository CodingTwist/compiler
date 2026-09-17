// Moves runs of lines that share leading `execute` clauses into one call.
import type { Datapack } from "../../ir/datapack";
import { privateChild } from "../../private-fn";
import { functionCall, underClauses, withoutClauses } from "../../ir/generate";
import { callLine, chainLine } from "../../ir/line-info";
import type { Line, Run } from "./types";
import { reaches } from "./reach";
import { findRuns, splitAtBlockers, worthGrouping } from "./runs";

/** Groups repeated `execute` prefixes in every function file of `dp`. */
export function groupExecutePrefixes(dp: Datapack): void {
  // Allowed functions are grouped too: an allow covers what its function calls.
  const reachOf = reaches(dp);

  const queue = [...dp.files.keys()];
  // Group files are queued too, so a group can hold a smaller group.
  for (const name of queue) {
    const infos = dp.lineInfo.get(name);
    if (!infos) continue;
    const text = dp.files.get(name)!;
    const texts = text ? text.split("\n") : [];
    if (texts.length !== infos.length) {
      throw new Error(
        `Line info for '${name}' has ${infos.length} lines, the file ${texts.length}`,
      );
    }
    const sources = dp.sourceMap.get(name);
    const lines = texts.map(
      (t, i): Line => ({ text: t, source: sources?.[i], info: infos[i] }),
    );

    let n = 0;
    const call = (part: Run): Line[] => {
      const lead = part.lines.findIndex((l) => !l.info.comment);
      const body = part.lines.slice(lead);
      const clauses = part.shared.map((c) => c.text);
      let child: string;
      do child = privateChild(name, `group_${n++}`, dp.layout);
      while (dp.files.has(child) || dp.inlined.has(child));

      dp.files.set(
        child,
        body
          .map((l) =>
            l.info.comment ? l.text : withoutClauses(l.text, clauses),
          )
          .join("\n"),
      );
      dp.lineInfo.set(
        child,
        body.map((l) =>
          l.info.comment
            ? l.info
            : { ...l.info, clauses: l.info.clauses.slice(clauses.length) },
        ),
      );
      if (sources)
        dp.sourceMap.set(
          child,
          body.map((l) => l.source),
        );
      queue.push(child);
      const callText = underClauses(clauses, functionCall(dp, child));
      const info = chainLine(part.shared, callLine(child));
      return [
        ...part.lines.slice(0, lead),
        { text: callText, source: body[0].source, info },
      ];
    };

    const out: Line[] = [];
    for (const run of findRuns(lines, reachOf)) {
      for (const part of splitAtBlockers(run, reachOf)) {
        out.push(...(worthGrouping(part) ? call(part) : part.lines));
      }
    }
    if (out.length === lines.length && out.every((l, i) => l === lines[i]))
      continue;
    dp.files.set(name, out.map((l) => l.text).join("\n"));
    dp.lineInfo.set(
      name,
      out.map((l) => l.info),
    );
    if (sources)
      dp.sourceMap.set(
        name,
        out.map((l) => l.source),
      );
  }
}
