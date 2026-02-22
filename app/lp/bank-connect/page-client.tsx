"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, ArrowRight, Clock } from "lucide-react";

/**
 * Bank Linking — Coming Soon
 *
 * Plaid bank account linking is Phase 2. MVP uses manual wire transfer.
 * This page shows a "Coming Soon" card and directs LPs to wire instructions.
 *
 * To enable: Set PLAID_ENABLED=true, PLAID_CLIENT_ID, and PLAID_SECRET.
 */
export default function BankConnectClient() {
  const router = useRouter();

  return (
    <div className="max-w-[800px] mx-auto px-4 py-10">
      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <Clock className="h-8 w-8 text-amber-400" />
          </div>
          <CardTitle className="text-2xl text-white">
            Bank Linking — Coming Soon
          </CardTitle>
          <CardDescription className="text-gray-400 text-base mt-2">
            Bank account linking via Plaid will be available in a future update.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
            <div className="flex items-start gap-3">
              <Building2 className="h-5 w-5 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-gray-300">
                  For now, please use <span className="font-medium text-white">manual wire transfer</span> to fund your investment.
                  Wire instructions are available on your investment page.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white h-11"
              onClick={() => router.push("/lp/wire")}
            >
              View Wire Instructions
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button
              variant="outline"
              className="w-full border-gray-600 text-gray-300 hover:bg-gray-700/50 h-11"
              onClick={() => router.push("/lp/dashboard")}
            >
              Back to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
