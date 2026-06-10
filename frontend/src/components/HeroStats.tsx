"use client";
import { useState, useEffect } from "react";
import { CONTRACT_ADDRESS, queryContract } from "@/lib/injective";

type ContractStats = {
  total_campaigns: number;
  total_participants: number;
  total_rewards_distributed: string;
};

const LIGHT: { color: string; bg: string }[] = [
  { color: "#B9752B", bg: "#B9752B18" },
  { color: "#5A7A52", bg: "#ADC6A320" },
  { color: "#180E02", bg: "#DDD6C5"   },
  { color: "#B9752B", bg: "#ADC6A330" },
];

const DARK: { color: string; bg: string }[] = [
  { color: "#D4862F", bg: "#D4862F20" },
  { color: "#7DB573", bg: "#7DB57320" },
  { color: "#F0EAE0", bg: "#2A2018"   },
  { color: "#D4862F", bg: "#ADC6A322" },
];

export default function HeroStats({ dark = false }: { dark?: boolean }) {
  const [stats, setStats] = useState<ContractStats | null>(null);

  useEffect(() => {
    if (!CONTRACT_ADDRESS) return;
    queryContract<ContractStats>({ get_stats: {} })
      .then(setStats)
      .catch(() => {});
  }, []);

  const injDistributed = stats
    ? (Number(stats.total_rewards_distributed) / 1e18).toFixed(2)
    : "0";

  const rows = [
    { label: "Total Campaigns", value: stats ? String(stats.total_campaigns)   : "0" },
    { label: "Participants",     value: stats ? String(stats.total_participants) : "0" },
    { label: "INJ Distributed",  value: injDistributed                                },
    { label: "Posts Generated",  value: stats ? String(stats.total_participants) : "0" },
  ];

  const COLORS = dark ? DARK : LIGHT;

  return (
    <div className="grid grid-cols-2 gap-3 my-8">
      {rows.map((s, i) => (
        <div
          key={s.label}
          data-reveal
          data-delay={String(i + 1)}
          className="rounded-xl px-4 py-3"
          style={{ background: COLORS[i].bg, border: `1px solid ${COLORS[i].color}33` }}
        >
          <p className="text-2xl font-bold" style={{ color: COLORS[i].color }}>{s.value}</p>
          <p className="text-xs mt-0.5" style={{ color: COLORS[i].color, opacity: 0.75 }}>{s.label}</p>
        </div>
      ))}
    </div>
  );
}
