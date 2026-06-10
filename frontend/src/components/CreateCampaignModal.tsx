"use client";
import { useState } from "react";
import { X, Loader2, PlusCircle } from "lucide-react";
import { injToWei } from "@/lib/injective";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    description: string;
    target_platform: string;
    duration_days: number;
    max_participants: number;
    reward_inj: number;
  }) => Promise<void>;
}

const PLATFORMS = ["Twitter/X", "Discord", "Telegram", "LinkedIn", "Farcaster"];

export default function CreateCampaignModal({ open, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState("Twitter/X");
  const [days, setDays] = useState(7);
  const [maxP, setMaxP] = useState(100);
  const [rewardInj, setRewardInj] = useState(10);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({
        title,
        description,
        target_platform: platform,
        duration_days: days,
        max_participants: maxP,
        reward_inj: rewardInj,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <PlusCircle size={20} className="text-indigo-400" />
            <h2 className="text-white font-semibold text-lg">Create Campaign</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Campaign Title">
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Injective Summer DeFi Campaign"
              className={inputClass}
            />
          </Field>

          <Field label="Description">
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Share what this campaign is about..."
              rows={2}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Platform">
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputClass}>
                {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Duration (days)">
              <input
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Max Participants">
              <input
                type="number"
                min={1}
                max={10000}
                value={maxP}
                onChange={(e) => setMaxP(Number(e.target.value))}
                className={inputClass}
              />
            </Field>
            <Field label="Reward Pool (INJ)">
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={rewardInj}
                onChange={(e) => setRewardInj(Number(e.target.value))}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="bg-slate-800/60 rounded-lg p-3 text-xs text-slate-400 space-y-1">
            <p>You will send <span className="text-indigo-400 font-medium">{rewardInj} INJ</span> as the reward pool.</p>
            <p>Each of up to <span className="text-white">{maxP}</span> participants receives ~<span className="text-green-400 font-medium">{(rewardInj / maxP).toFixed(4)} INJ</span>.</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
            {loading ? "Creating..." : `Create & Fund Campaign`}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder-slate-600";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
