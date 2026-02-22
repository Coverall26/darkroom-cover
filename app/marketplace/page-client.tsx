"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ListingCard } from "@/components/marketplace/listing-card";
import { DEAL_TYPE_CONFIG } from "@/lib/marketplace/types";
import type { DealType } from "@prisma/client";
import {
  Search,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Shield,
  Users,
} from "lucide-react";

type ListingData = {
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

export default function MarketplaceBrowseClient() {
  const router = useRouter();
  const [listings, setListings] = useState<ListingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedDealType, setSelectedDealType] = useState<string>("");
  const [categories, setCategories] = useState<
    { name: string | null; count: number }[]
  >([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Waitlist form
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistName, setWaitlistName] = useState("");
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/marketplace/public?categories=true");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    }
  }, []);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("pageSize", "12");
      if (searchQuery) params.set("search", searchQuery);
      if (selectedCategory) params.set("category", selectedCategory);
      if (selectedDealType) params.set("dealType", selectedDealType);

      const res = await fetch(`/api/marketplace/public?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings ?? []);
        setTotalPages(data.totalPages ?? 1);
      }
    } catch (err) {
      console.error("Failed to fetch listings:", err);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, selectedCategory, selectedDealType]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const handleListingClick = (listingId: string) => {
    router.push(`/marketplace/${listingId}`);
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail.trim()) return;

    setWaitlistSubmitting(true);
    setWaitlistError(null);
    try {
      const res = await fetch("/api/marketplace/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: waitlistEmail.trim(),
          name: waitlistName.trim() || undefined,
          source: "WEBSITE",
        }),
      });
      if (res.ok) {
        setWaitlistSuccess(true);
        setWaitlistEmail("");
        setWaitlistName("");
      } else {
        const data = await res.json();
        setWaitlistError(data.error || "Something went wrong");
      }
    } catch {
      setWaitlistError("Network error. Please try again.");
    } finally {
      setWaitlistSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Hero section */}
      <div className="bg-gradient-to-br from-[#0A1628] via-[#0A1628] to-[#0066FF]/20 px-4 pb-12 pt-16 text-center text-white sm:pb-16 sm:pt-20">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          Investment Marketplace
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-gray-300 sm:text-lg">
          Browse curated investment opportunities from vetted fund managers.
          Private equity, venture capital, real estate, and more.
        </p>

        {/* Value props */}
        <div className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-6 text-sm text-gray-400">
          <span className="flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-[#0066FF]" aria-hidden="true" />
            Vetted Managers
          </span>
          <span className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            Institutional Quality
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-amber-400" aria-hidden="true" />
            SEC Compliant
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Search & Filters */}
        <div className="mb-8 space-y-4">
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Search deals, sectors, or fund managers..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-5 text-gray-900 placeholder:text-gray-400 focus:border-[#0066FF] focus:outline-none focus:ring-1 focus:ring-[#0066FF] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              aria-label="Filter by category"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.name} value={cat.name ?? ""}>
                  {cat.name} ({cat.count})
                </option>
              ))}
            </select>

            <select
              value={selectedDealType}
              onChange={(e) => {
                setSelectedDealType(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              aria-label="Filter by deal type"
            >
              <option value="">All Types</option>
              {Object.entries(DEAL_TYPE_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Listings grid */}
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
              />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-lg font-medium text-gray-500">
              No listings available yet
            </p>
            <p className="mt-1 text-sm text-gray-400">
              Join the waitlist below to be notified when new opportunities are
              listed.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  onClick={() => handleListingClick(listing.id)}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700"
                >
                  Previous
                </button>
                <span className="px-3 text-sm text-gray-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Waitlist signup section */}
      <div className="border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Get Early Access to New Opportunities
          </h2>
          <p className="mt-2 text-gray-500">
            Join the waitlist to be notified when new investment opportunities
            are listed on the marketplace.
          </p>

          {waitlistSuccess ? (
            <div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              You&apos;re on the list! We&apos;ll notify you when new deals are available.
            </div>
          ) : (
            <form
              onSubmit={handleWaitlistSubmit}
              className="mt-6 space-y-3 sm:mx-auto sm:max-w-md"
            >
              <input
                type="text"
                placeholder="Your name (optional)"
                value={waitlistName}
                onChange={(e) => setWaitlistName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0066FF] focus:outline-none focus:ring-1 focus:ring-[#0066FF] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Your email address"
                  required
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0066FF] focus:outline-none focus:ring-1 focus:ring-[#0066FF] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
                <button
                  type="submit"
                  disabled={waitlistSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0066FF] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#0055DD] disabled:opacity-50"
                >
                  {waitlistSubmitting ? "Joining..." : "Join Waitlist"}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              {waitlistError && (
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                  {waitlistError}
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
