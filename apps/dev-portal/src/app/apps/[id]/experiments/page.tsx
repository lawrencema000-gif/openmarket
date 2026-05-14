"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

interface Experiment {
  id: string;
  name: string;
  hypothesis: string | null;
  status: "draft" | "running" | "concluded";
  winnerVariantId: string | null;
  startedAt: string | null;
  concludedAt: string | null;
  createdAt: string;
}

interface ListResponse {
  appId: string;
  experiments: Experiment[];
}

interface VariantDraft {
  label: string;
  isControl: boolean;
  trafficWeight: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
}

const EMPTY_VARIANTS: VariantDraft[] = [
  {
    label: "control",
    isControl: true,
    trafficWeight: "50",
    title: "",
    shortDescription: "",
    fullDescription: "",
  },
  {
    label: "v1",
    isControl: false,
    trafficWeight: "50",
    title: "",
    shortDescription: "",
    fullDescription: "",
  },
];

export default function ExperimentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: appId } = use(params);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [variants, setVariants] = useState<VariantDraft[]>(EMPTY_VARIANTS);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<ListResponse>(`/api/apps/${appId}/experiments`);
      setExperiments(r.experiments);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  function updateVariant(i: number, patch: Partial<VariantDraft>) {
    setVariants((prev) =>
      prev.map((v, j) => (i === j ? { ...v, ...patch } : v)),
    );
  }

  function addVariant() {
    if (variants.length >= 6) return;
    setVariants((prev) => [
      ...prev,
      {
        label: `v${prev.length}`,
        isControl: false,
        trafficWeight: "0",
        title: "",
        shortDescription: "",
        fullDescription: "",
      },
    ]);
  }

  function removeVariant(i: number) {
    if (variants.length <= 2) return;
    setVariants((prev) => prev.filter((_, j) => j !== i));
  }

  async function create() {
    if (!name.trim()) {
      setError("Experiment name required");
      return;
    }
    const weightSum = variants.reduce(
      (acc, v) => acc + (Number(v.trafficWeight) || 0),
      0,
    );
    if (weightSum !== 100) {
      setError(`Variant trafficWeights must sum to 100 (got ${weightSum})`);
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await api.post(`/api/apps/${appId}/experiments`, {
        name: name.trim(),
        hypothesis: hypothesis.trim() || undefined,
        variants: variants.map((v) => ({
          label: v.label,
          isControl: v.isControl,
          trafficWeight: Number(v.trafficWeight),
          title: v.title || undefined,
          shortDescription: v.shortDescription || undefined,
          fullDescription: v.fullDescription || undefined,
        })),
      });
      setName("");
      setHypothesis("");
      setVariants(EMPTY_VARIANTS);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function start(expId: string) {
    setError(null);
    try {
      await api.post(`/api/apps/${appId}/experiments/${expId}/start`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Start failed");
    }
  }

  async function conclude(expId: string, winnerVariantId: string | null) {
    setError(null);
    try {
      await api.post(`/api/apps/${appId}/experiments/${expId}/conclude`, {
        winnerVariantId: winnerVariantId ?? undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Conclude failed");
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href={`/apps/${appId}`}
          className="text-xs text-blue-600 hover:underline"
        >
          ← Back to app
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">
          Listing experiments
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Test variations of your title, description, icon, or screenshots
          and measure install rate. One experiment can run at a time;
          conclude the current one before starting another.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          Create an experiment
        </h2>
        <input
          type="text"
          placeholder='Name — e.g. "Hero title test Q2"'
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="block w-full rounded-md border-gray-300 text-sm"
        />
        <textarea
          placeholder="Hypothesis (optional) — what are you testing?"
          value={hypothesis}
          onChange={(e) => setHypothesis(e.target.value)}
          rows={2}
          className="block w-full rounded-md border-gray-300 text-sm"
        />
        <div className="space-y-3">
          {variants.map((v, i) => (
            <div
              key={i}
              className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={v.label}
                  onChange={(e) =>
                    updateVariant(i, { label: e.target.value })
                  }
                  className="flex-1 rounded-md border-gray-300 text-sm"
                  placeholder="Label"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={v.trafficWeight}
                  onChange={(e) =>
                    updateVariant(i, { trafficWeight: e.target.value })
                  }
                  className="w-20 rounded-md border-gray-300 text-sm"
                />
                <span className="text-xs text-gray-500">%</span>
                <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={v.isControl}
                    onChange={(e) =>
                      updateVariant(i, { isControl: e.target.checked })
                    }
                  />
                  control
                </label>
                {variants.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeVariant(i)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="Title override (leave blank = baseline)"
                value={v.title}
                onChange={(e) => updateVariant(i, { title: e.target.value })}
                className="block w-full rounded-md border-gray-300 text-xs"
              />
              <input
                type="text"
                placeholder="Short description override"
                value={v.shortDescription}
                onChange={(e) =>
                  updateVariant(i, { shortDescription: e.target.value })
                }
                className="block w-full rounded-md border-gray-300 text-xs"
              />
              <textarea
                placeholder="Full description override"
                value={v.fullDescription}
                onChange={(e) =>
                  updateVariant(i, { fullDescription: e.target.value })
                }
                rows={2}
                className="block w-full rounded-md border-gray-300 text-xs font-mono"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addVariant}
            disabled={variants.length >= 6}
            className="text-xs text-blue-600 hover:underline disabled:opacity-50"
          >
            + Add variant
          </button>
          <span className="text-xs text-gray-500 ml-auto">
            Sum:{" "}
            <strong>
              {variants.reduce(
                (acc, v) => acc + (Number(v.trafficWeight) || 0),
                0,
              )}
            </strong>{" "}
            / 100
          </span>
        </div>
        <button
          type="button"
          onClick={() => void create()}
          disabled={creating}
          className="rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
        >
          {creating ? "Creating…" : "Create as draft"}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          {loading
            ? "Loading…"
            : experiments.length === 0
              ? "No experiments yet"
              : `Experiments (${experiments.length})`}
        </h2>
        {experiments.map((e) => (
          <ExperimentCard
            key={e.id}
            appId={appId}
            experiment={e}
            onStart={() => void start(e.id)}
            onConclude={(winnerVariantId) => void conclude(e.id, winnerVariantId)}
          />
        ))}
      </section>
    </div>
  );
}

interface VariantResult {
  id: string;
  label: string;
  isControl: boolean;
  trafficWeight: number;
  viewsCount: number;
  installsCount: number;
}

interface DetailResponse {
  experiment: Experiment;
  variants: VariantResult[];
}

function ExperimentCard({
  appId,
  experiment,
  onStart,
  onConclude,
}: {
  appId: string;
  experiment: Experiment;
  onStart: () => void;
  onConclude: (winnerVariantId: string | null) => void;
}) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<string>("");

  useEffect(() => {
    void api
      .get<DetailResponse>(`/api/apps/${appId}/experiments/${experiment.id}`)
      .then((d) => setDetail(d))
      .catch(() => {});
  }, [appId, experiment.id, experiment.status]);

  const variants = detail?.variants ?? [];
  const control = variants.find((v) => v.isControl);
  const controlRate =
    control && control.viewsCount > 0
      ? control.installsCount / control.viewsCount
      : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-gray-900">{experiment.name}</p>
          {experiment.hypothesis ? (
            <p className="text-xs text-gray-600 mt-0.5">
              {experiment.hypothesis}
            </p>
          ) : null}
        </div>
        <span
          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
            experiment.status === "running"
              ? "bg-emerald-100 text-emerald-700"
              : experiment.status === "concluded"
                ? "bg-gray-100 text-gray-600"
                : "bg-amber-100 text-amber-700"
          }`}
        >
          {experiment.status}
        </span>
      </div>

      {variants.length > 0 && (
        <table className="w-full text-xs">
          <thead className="text-gray-500 text-left">
            <tr>
              <th className="py-1 font-medium">Variant</th>
              <th className="py-1 font-medium">Weight</th>
              <th className="py-1 font-medium">Views</th>
              <th className="py-1 font-medium">Installs</th>
              <th className="py-1 font-medium">Rate</th>
              <th className="py-1 font-medium">vs Control</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {variants.map((v) => {
              const rate = v.viewsCount > 0 ? v.installsCount / v.viewsCount : 0;
              const lift =
                controlRate && controlRate > 0 && !v.isControl
                  ? (rate - controlRate) / controlRate
                  : null;
              const isWinner = experiment.winnerVariantId === v.id;
              return (
                <tr key={v.id}>
                  <td className="py-1.5">
                    {v.label}
                    {v.isControl && (
                      <span className="ml-1 text-[9px] uppercase font-semibold text-gray-500">
                        control
                      </span>
                    )}
                    {isWinner && (
                      <span className="ml-1 text-[9px] uppercase font-semibold text-emerald-700">
                        winner
                      </span>
                    )}
                  </td>
                  <td className="py-1.5">{v.trafficWeight}%</td>
                  <td className="py-1.5">{v.viewsCount.toLocaleString()}</td>
                  <td className="py-1.5">{v.installsCount.toLocaleString()}</td>
                  <td className="py-1.5">{(rate * 100).toFixed(2)}%</td>
                  <td className="py-1.5">
                    {lift == null ? (
                      "—"
                    ) : (
                      <span className={lift > 0 ? "text-emerald-700" : "text-red-700"}>
                        {(lift * 100).toFixed(1)}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {experiment.status === "draft" && (
          <button
            type="button"
            onClick={onStart}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Start
          </button>
        )}
        {experiment.status === "running" && (
          <>
            <select
              value={selectedWinner}
              onChange={(e) => setSelectedWinner(e.target.value)}
              className="text-xs rounded-md border border-gray-200 px-2 py-1.5"
            >
              <option value="">Conclude without winner</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  Winner: {v.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onConclude(selectedWinner || null)}
              className="text-xs font-medium px-3 py-1.5 rounded-md bg-gray-700 text-white hover:bg-gray-800"
            >
              Conclude
            </button>
          </>
        )}
      </div>
    </div>
  );
}
