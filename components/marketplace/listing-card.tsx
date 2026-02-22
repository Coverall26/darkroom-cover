"use client";

import type { DealType } from "@prisma/client";
import { DEAL_TYPE_CONFIG } from "@/lib/marketplace/types";

interface ListingCardProps {
  listing: {
    id: string;
    headline: string;
    summary: string;
    highlights: string[];
    category?: string | null;
    coverImageUrl?: string | null;
    viewCount: number;
    interestCount: number;
    deal: {
      id: string;
      title: string;
      dealType: DealType;
      targetSector?: string | null;
      targetGeography?: string | null;
      targetRaise?: string | null;
      minimumTicket?: string | null;
      expectedReturn?: string | null;
      holdPeriod?: string | null;
      investorCount: number;
      deadlineAt?: string | null;
      tags: string[];
    };
    team: {
      name: string;
      brand?: { logo?: string | null; brandColor?: string | null } | null;
    };
  };
  onClick?: () => void;
}

function formatCurrency(value: string | number | null | undefined): string {
  if (!value) return "--";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

export function ListingCard({ listing, onClick }: ListingCardProps) {
  const { deal, team } = listing;
  const deadline = deal.deadlineAt ? new Date(deal.deadlineAt) : null;
  const isExpiringSoon =
    deadline &&
    deadline.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000 &&
    deadline.getTime() > Date.now();

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-blue-300 hover:shadow-lg dark:border-gray-700 dark:bg-gray-900"
    >
      {/* Cover image or brand bar */}
      {listing.coverImageUrl ? (
        <div
          className="h-36 bg-cover bg-center"
          style={{ backgroundImage: `url(${listing.coverImageUrl})` }}
        />
      ) : (
        <div
          className="h-2"
          style={{
            backgroundColor: team.brand?.brandColor ?? "#3B82F6",
          }}
        />
      )}

      <div className="p-5">
        {/* Team name */}
        <div className="mb-2 flex items-center gap-2">
          {team.brand?.logo && (
            <img
              src={team.brand.logo}
              alt={team.name}
              className="h-5 w-5 rounded-full object-cover"
            />
          )}
          <span className="text-xs font-medium text-gray-500">
            {team.name}
          </span>
          {isExpiringSoon && (
            <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Closing Soon
            </span>
          )}
        </div>

        {/* Headline */}
        <h3 className="mb-1 text-lg font-semibold text-gray-900 group-hover:text-blue-600 dark:text-gray-100">
          {listing.headline}
        </h3>
        <p className="mb-3 line-clamp-2 text-sm text-gray-500">
          {listing.summary}
        </p>

        {/* Highlights */}
        {listing.highlights.length > 0 && (
          <ul className="mb-3 space-y-1">
            {listing.highlights.slice(0, 3).map((h, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                <span className="mt-1 text-green-500">&#10003;</span>
                {h}
              </li>
            ))}
          </ul>
        )}

        {/* Key metrics */}
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
          <div>
            <p className="text-xs text-gray-400">Target Raise</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {formatCurrency(deal.targetRaise)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Min Ticket</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {formatCurrency(deal.minimumTicket)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Expected Return</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {deal.expectedReturn ?? "--"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Hold Period</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {deal.holdPeriod ?? "--"}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex gap-3">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
              {DEAL_TYPE_CONFIG[deal.dealType].label}
            </span>
            {deal.targetSector && (
              <span>{deal.targetSector}</span>
            )}
          </div>
          <div className="flex gap-2">
            <span>{listing.viewCount} views</span>
            <span>{listing.interestCount} interested</span>
          </div>
        </div>
      </div>
    </div>
  );
}
