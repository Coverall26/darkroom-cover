import { Metadata } from "next";
import prisma from "@/lib/prisma";
import OfferingPageClient from "./page-client";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  const offering = await prisma.offeringPage.findUnique({
    where: { slug },
    select: {
      metaTitle: true,
      metaDescription: true,
      metaImageUrl: true,
      fund: { select: { name: true, description: true } },
      team: {
        select: {
          organization: { select: { name: true } },
        },
      },
    },
  });

  if (!offering) {
    return { title: "Offering Not Found" };
  }

  const title =
    offering.metaTitle ||
    `${offering.fund.name} | ${offering.team.organization?.name || "Investment Offering"}`;
  const description =
    offering.metaDescription ||
    offering.fund.description ||
    "View this investment offering on FundRoom.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: offering.metaImageUrl ? [{ url: offering.metaImageUrl }] : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function OfferingPage({ params }: Props) {
  const { slug } = await params;
  return <OfferingPageClient slug={slug} />;
}
