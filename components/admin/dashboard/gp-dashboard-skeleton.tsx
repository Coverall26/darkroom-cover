import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function GPDashboardSkeleton() {
  return (
    <div className="space-y-5">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44 rounded-md" />
          <Skeleton className="h-4 w-56 rounded" />
        </div>
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>

      {/* Raise progress skeleton */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-7 rounded-lg" />
                <Skeleton className="h-5 w-32" />
              </div>
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-full rounded-full" />
          <div className="flex justify-between mt-3">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </CardContent>
      </Card>

      {/* Pending actions skeleton */}
      <Skeleton className="h-[80px] w-full rounded-xl" />

      {/* Stats + Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="shadow-sm">
              <CardContent className="pt-4 pb-3 px-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-7 w-7 rounded-lg" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="lg:col-span-3 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-5 w-36" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-9 w-full rounded-lg" />
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-5 w-8" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity + Nav */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-5 w-32" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-2.5 px-2 py-2">
                <Skeleton className="h-6 w-6 rounded-md flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-[80%]" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-28" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2.5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg border">
                  <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
