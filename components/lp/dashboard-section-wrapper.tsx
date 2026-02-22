"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

interface DashboardSectionWrapperProps {
  title: string;
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
  children: ReactNode;
  skeleton?: ReactNode;
}

function DefaultSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-3/4 bg-gray-700" />
      <Skeleton className="h-4 w-1/2 bg-gray-700" />
      <Skeleton className="h-4 w-2/3 bg-gray-700" />
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-48 bg-gray-700" />
      <Skeleton className="h-4 w-36 bg-gray-700/70" />
      <Skeleton className="h-4 w-28 bg-gray-700/50" />
    </div>
  );
}

export function FundStatusSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-40 bg-gray-700" />
        <Skeleton className="h-6 w-16 rounded-full bg-gray-700" />
      </div>
      <Skeleton className="h-2.5 w-full rounded-full bg-gray-700" />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Skeleton className="h-3 w-20 bg-gray-700/50 mb-2" />
          <Skeleton className="h-6 w-28 bg-gray-700" />
        </div>
        <div>
          <Skeleton className="h-3 w-20 bg-gray-700/50 mb-2" />
          <Skeleton className="h-6 w-28 bg-gray-700" />
        </div>
      </div>
    </div>
  );
}

export function TransactionsSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg bg-gray-600" />
            <div>
              <Skeleton className="h-4 w-32 bg-gray-600 mb-2" />
              <Skeleton className="h-3 w-24 bg-gray-600/50" />
            </div>
          </div>
          <div className="text-right">
            <Skeleton className="h-5 w-20 bg-gray-600 mb-1" />
            <Skeleton className="h-4 w-16 bg-gray-600/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DocumentsSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 bg-gray-700/50 rounded-lg">
          <Skeleton className="h-10 w-10 rounded-lg bg-gray-600" />
          <div className="flex-1">
            <Skeleton className="h-4 w-40 bg-gray-600 mb-2" />
            <Skeleton className="h-3 w-24 bg-gray-600/50" />
          </div>
          <Skeleton className="h-8 w-16 rounded bg-gray-600" />
        </div>
      ))}
    </div>
  );
}

export function SigningSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="flex items-center justify-between p-4 bg-gray-800/70 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg bg-gray-600" />
            <div>
              <Skeleton className="h-4 w-36 bg-gray-600 mb-2" />
              <Skeleton className="h-3 w-28 bg-gray-600/50" />
            </div>
          </div>
          <Skeleton className="h-10 w-24 rounded-lg bg-gray-600" />
        </div>
      ))}
    </div>
  );
}

export function CapitalCallsSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
          <div>
            <Skeleton className="h-4 w-32 bg-gray-600 mb-2" />
            <Skeleton className="h-3 w-24 bg-gray-600/50" />
          </div>
          <div className="text-right">
            <Skeleton className="h-5 w-20 bg-gray-600 mb-1" />
            <Skeleton className="h-4 w-14 bg-gray-600/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardSectionWrapper({
  title,
  isLoading,
  error,
  onRetry,
  children,
  skeleton,
}: DashboardSectionWrapperProps) {
  if (isLoading) {
    return skeleton || <DefaultSkeleton />;
  }

  if (error) {
    return (
      <Card className="bg-red-900/10 border-red-800/30">
        <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <span className="text-red-300 text-sm">{title} couldn&apos;t load. {error}</span>
          </div>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="border-red-800/50 text-red-300 hover:bg-red-900/20 flex-shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
