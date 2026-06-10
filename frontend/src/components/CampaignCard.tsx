"use client";
import { weiToInj, truncateAddress } from "@/lib/injective";
import { Users, Clock, Coins, ArrowRight, CheckCircle2 } from "lucide-react";

interface Campaign {
  id: number;
  title: string;
  description: string;
  creator: string;
  target_platform: string;
  reward_pool: string;
  participant_count: number;
  max_participants: number;
  status: string;
  ends_at: number;
  distributed: boolean;
}

interface Props {
  campaign: Campaign;
  onJoin?: (id: number) => void;
  onClaim?: (id: number) => void;
  userAddress?: string | null;
}

const statusColor: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  distributed: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  ended: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export default function CampaignCard({ campaign, onJoin, onClaim, userAddress }: Props) {
  const endsAt = new Date(campaign.ends_at * 1000);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86400000));
  const poolInj = weiToInj(campaign.reward_pool);
  const fillPct = Math.round((campaign.participant_count / campaign.max_participants) * 100);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-white font-semibold text-base">{campaign.title}</h3>
          <p className="text-slate-400 text-xs mt-0.5">{campaign.description}</p>
        </div>
        <span
          className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${
            statusColor[campaign.status] ?? statusColor.ended
          }`}
        >
          {campaign.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={<Coins size={13} />} label="Pool" value={`${poolInj.toFixed(2)} INJ`} />
        <Stat icon={<Users size={13} />} label="Joined" value={`${campaign.participant_count}/${campaign.max_participants}`} />
        <Stat icon={<Clock size={13} />} label="Left" value={daysLeft === 0 ? "Ended" : `${daysLeft}d`} />
      </div>

      <div>
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>Participants</span>
          <span>{fillPct}%</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all"
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-slate-500">
          {campaign.target_platform} · by{" "}
          <span className="font-mono">{truncateAddress(campaign.creator)}</span>
        </span>
        {userAddress && campaign.status === "active" && onJoin && (
          <button
            onClick={() => onJoin(campaign.id)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            Join <ArrowRight size={12} />
          </button>
        )}
        {userAddress && campaign.distributed && onClaim && (
          <button
            onClick={() => onClaim(campaign.id)}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            <CheckCircle2 size={12} /> Claim
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-slate-800/60 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1 text-slate-400 text-xs mb-0.5">
        {icon}
        {label}
      </div>
      <p className="text-white text-sm font-semibold">{value}</p>
    </div>
  );
}
