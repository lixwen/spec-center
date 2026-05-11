"use client";

import { useState } from "react";
import { SectionHeading } from "../../../components/ui";
import { AdminAiTracesDashboard } from "./dashboard";
import { EvalConfigTab } from "./eval-config-tab";
import { EvalDashboard } from "./eval-dashboard";
import { EvalDatasetsTab } from "./eval-datasets-tab";
import type { getMessages } from "../../../lib/i18n";

type TracesLabels = ReturnType<typeof getMessages>["aiTracesAdmin"];
type EvalLabels = ReturnType<typeof getMessages>["evalAdmin"];

type TabKey = "traces" | "eval" | "datasets" | "config";

export function TabbedDashboard({
  tracesLabels,
  evalLabels,
  totalSuffix,
  workingLabel
}: {
  tracesLabels: TracesLabels;
  evalLabels: EvalLabels;
  totalSuffix: string;
  workingLabel: string;
}) {
  const [tab, setTab] = useState<TabKey>("traces");

  const heading =
    tab === "traces"
      ? {
          eyebrow: tracesLabels.eyebrow,
          title: tracesLabels.title,
          description: tracesLabels.description
        }
      : {
          eyebrow: evalLabels.eyebrow,
          title: evalLabels.title,
          description: evalLabels.description
        };

  return (
    <div className="space-y-8">
      <SectionHeading eyebrow={heading.eyebrow} title={heading.title} description={heading.description} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {(
            [
              ["traces", evalLabels.tabTraces],
              ["eval", evalLabels.tabEval],
              ["datasets", evalLabels.tabDatasets],
              ["config", evalLabels.tabConfig]
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "traces" ? (
        <AdminAiTracesDashboard
          labels={tracesLabels}
          totalSuffix={totalSuffix}
          workingLabel={workingLabel}
        />
      ) : null}
      {tab === "eval" ? <EvalDashboard labels={evalLabels} /> : null}
      {tab === "datasets" ? <EvalDatasetsTab labels={evalLabels} /> : null}
      {tab === "config" ? <EvalConfigTab labels={evalLabels} workingLabel={workingLabel} /> : null}
    </div>
  );
}
