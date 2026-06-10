"use client";
import { Zap, Users, Trophy, Globe } from "lucide-react";

interface Stats {
  total_campaigns: number;
  total_participants: number;
  total_rewards_distributed: string;
}

export default function StatsBar({ stats }: { stats: Stats | null }) {
  const distributed = stats
    ? (Number(BigInt(stats.total_rewards_distributed)) / 1e18).toFixed(2)
    : "0.00";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        {
          icon: <Zap size={16} className="text-indigo-400" />,
          label: "Total Campaigns",
          value: stats?.total_campaigns ?? 0,
        },
        {
          icon: <Users size={16} className="text-blue-400" />,
          label: "Participants",
          value: stats?.total_participants ?? 0,
        },
        {
          icon: <Trophy size={16} className="text-yellow-400" />,
          label: "INJ Distributed",
          value: `${distributed} INJ`,
        },
        {
          icon: <Globe size={16} className="text-green-400" />,
          label: "Network",
          value: "Injective Testnet",
        },
      ].map((s) => (
        <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
            {s.icon}
            {s.label}
          </div>
          <p className="text-white font-bold text-xl">{s.value}</p>
        </div>
      ))}
    </div>
  );
}
