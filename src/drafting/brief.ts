import type { DraftStartRequest } from "./port.ts";
import type { SelectedCore } from "./selection.ts";

export function renderDraftBrief(input: {
  request: DraftStartRequest;
  profileText: string;
  profileStatus: "current" | "stale";
  selectedCore: SelectedCore[];
}): string {
  const examples = input.selectedCore.flatMap((message, index) => {
    const materialLines =
      message.materials.length === 0
        ? ["- Historical Material patterns: none."]
        : [
            "- Historical Material patterns:",
            ...message.materials.map(
              (material) =>
                `  - ${material.ordinal}. ${inline(material.kind)} / ${inline(material.role)}${
                  material.label ? ` / ${inline(material.label)}` : ""
                }`,
            ),
          ];
    return [
      `### Example ${index + 1}`,
      `- Tags: ${message.tags.length === 0 ? "none" : message.tags.map(inline).join(", ")}`,
      ...materialLines,
      "",
      quote(message.text),
      "",
    ];
  });

  return [
    renderDraftTask(input.request),
    "",
    "## Voice Evidence",
    "",
    "Use the evidence below to preserve the demonstrated voice.",
    "",
    "## Voice Profile",
    "",
    `- Profile status: ${capitalize(input.profileStatus)}`,
    "",
    input.profileText,
    "",
    "## Relevant Core Messages",
    "",
    "Only the examples below are voice evidence for this Draft Run.",
    "",
    ...examples,
  ].join("\n");
}

export function renderDraftTask(request: DraftStartRequest): string {
  const situation = [
    field("Audience", request.audience),
    field("Situation", request.situation),
    field("Destination", request.destination),
    field("Thread", request.thread),
  ].filter((value): value is string => value !== null);
  const constraints =
    request.constraints.length === 0
      ? ["- None supplied."]
      : request.constraints.map((constraint) => `- ${inline(constraint)}`);
  const currentMaterials =
    request.currentMaterials.length === 0
      ? ["- None supplied."]
      : request.currentMaterials.map((material, index) => {
          const details = [
            material.kind,
            material.role,
            material.description,
          ].filter(Boolean);
          return `- ${index + 1}. ${details.map((value) => inline(value!)).join(" — ")}`;
        });
  return [
    "# Draft Brief",
    "",
    "Write one proposed Slack message. Improve accidental ambiguity, grammar, and unintended harshness.",
    "",
    "## Objective",
    "",
    request.objective,
    "",
    "## Situation",
    "",
    ...(situation.length === 0 ? ["- None supplied."] : situation),
    "",
    "### Constraints",
    "",
    ...constraints,
    "",
    "### Current Materials",
    "",
    "These describe the current situation. They are not voice evidence.",
    "",
    ...currentMaterials,
  ].join("\n");
}

function field(label: string, value: string | undefined): string | null {
  return value === undefined ? null : `- ${label}: ${inline(value)}`;
}

function inline(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

function quote(value: string): string {
  return value.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
}

function capitalize(value: string): string {
  return `${value[0]!.toUpperCase()}${value.slice(1)}`;
}
