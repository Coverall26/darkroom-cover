import dynamic from "next/dynamic";

import { ViewerChatPanel } from "@/ee/features/ai/components/viewer-chat-panel";
import {
  ViewerChatLayout,
  ViewerChatProvider,
} from "@/ee/features/ai/components/viewer-chat-provider";
import { ViewerChatToggle } from "@/ee/features/ai/components/viewer-chat-toggle";
import {
  Brand,
  DataroomBrand,
  Document,
  DocumentVersion,
} from "@prisma/client";
import { ExtendedRecordMap } from "notion-types";

import {
  LinkWithDataroomDocument,
  LinkWithDocument,
  NotionTheme,
  WatermarkConfig,
} from "@/lib/types";
import { useMediaQuery } from "@/lib/utils/use-media-query";

import { DEFAULT_DOCUMENT_VIEW_TYPE } from "@/components/view/document-view";
import { NotionPage } from "@/components/view/viewer/notion-page";
import PDFViewer from "@/components/view/viewer/pdf-default-viewer";

import { DEFAULT_DATAROOM_DOCUMENT_VIEW_TYPE } from "./dataroom/dataroom-document-view";
import { TNavData } from "./nav";
import AdvancedExcelViewer from "./viewer/advanced-excel-viewer";
import DownloadOnlyViewer from "./viewer/download-only-viewer";
import ImageViewer from "./viewer/image-viewer";
import PagesHorizontalViewer from "./viewer/pages-horizontal-viewer";
import PagesVerticalViewer from "./viewer/pages-vertical-viewer";
import VideoViewer from "./viewer/video-viewer";

const ExcelViewer = dynamic(
  () => import("@/components/view/viewer/excel-viewer"),
  { ssr: false },
);

export type TViewDocumentData = Document & {
  versions: DocumentVersion[];
};

const isDownloadAllowed = (
  canDownload: boolean | undefined,
  linkAllowDownload: boolean | undefined,
): boolean => {
  if (canDownload === false) return false;
  return !!linkAllowDownload;
};

export default function ViewData({
  viewData,
  link,
  document,
  notionData,
  brand,
  showPoweredByBanner,
  showAccountCreationSlide,
  useAdvancedExcelViewer,
  viewerEmail,
  dataroomId,
  canDownload,
  annotationsEnabled,
}: {
  viewData: DEFAULT_DOCUMENT_VIEW_TYPE | DEFAULT_DATAROOM_DOCUMENT_VIEW_TYPE;
  link: LinkWithDocument | LinkWithDataroomDocument;
  document: TViewDocumentData;
  notionData?: {
    rootNotionPageId: string | null;
    recordMap: ExtendedRecordMap | null;
    theme: NotionTheme | null;
  };
  brand?: Partial<Brand> | Partial<DataroomBrand> | null;
  showPoweredByBanner?: boolean;
  showAccountCreationSlide?: boolean;
  useAdvancedExcelViewer?: boolean;
  viewerEmail?: string;
  dataroomId?: string;
  canDownload?: boolean;
  annotationsEnabled?: boolean;
}) {
  const { isMobile } = useMediaQuery();

  // Safely get the primary version - handle case where versions array may be empty
  const primaryVersion = document.versions?.[0];

  // If no version exists, show error state
  if (!primaryVersion) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-lg font-medium text-red-500">Document not available</p>
        <p className="text-sm text-muted-foreground">This document has no viewable version.</p>
      </div>
    );
  }

  const navData: TNavData = {
    viewId: viewData.viewId,
    isPreview: viewData.isPreview,
    linkId: link.id,
    brand: brand,
    viewerId: "viewerId" in viewData ? viewData.viewerId : undefined,
    isMobile: isMobile,
    isDataroom: !!dataroomId,
    documentId: document.id,
    dataroomId: dataroomId,
    conversationsEnabled:
      !!dataroomId &&
      ("conversationsEnabled" in viewData
        ? viewData.conversationsEnabled
        : false),
    assistantEnabled: document.assistantEnabled,
    allowDownload:
      document.downloadOnly ||
      isDownloadAllowed(canDownload, link.allowDownload ?? false),
    isTeamMember: viewData.isTeamMember,
    annotationsFeatureEnabled: annotationsEnabled,
  };

  // Calculate allowDownload once for all components

  // Check if agents are enabled (returned from views API after access is granted)
  const agentsEnabled =
    "agentsEnabled" in viewData ? viewData.agentsEnabled : false;

  // Determine dataroom name if applicable
  const dataroomName =
    dataroomId && "dataroomName" in viewData
      ? viewData.dataroomName
      : undefined;

  return (
    <ViewerChatProvider
      enabled={agentsEnabled}
      documentId={document.id}
      documentName={document.name}
      dataroomId={dataroomId}
      dataroomName={dataroomName}
      linkId={link.id}
      viewId={viewData.viewId}
      viewerId={"viewerId" in viewData ? viewData.viewerId : undefined}
      // focusedDocumentId={dataroomId ? document.id : undefined}
      // focusedDocumentName={dataroomId ? document.name : undefined}
    >
      <ViewerChatLayout>
        {notionData?.recordMap ? (
          <NotionPage
            recordMap={notionData.recordMap}
            versionNumber={primaryVersion.versionNumber}
            theme={notionData.theme}
            screenshotProtectionEnabled={link.enableScreenshotProtection!}
            navData={navData}
          />
        ) : document.downloadOnly ? (
          <DownloadOnlyViewer
            versionNumber={primaryVersion.versionNumber}
            documentName={document.name}
            navData={navData}
          />
        ) : viewData.fileType === "sheet" && viewData.sheetData ? (
          <ExcelViewer
            versionNumber={primaryVersion.versionNumber}
            sheetData={viewData.sheetData}
            screenshotProtectionEnabled={link.enableScreenshotProtection!}
            navData={navData}
          />
        ) : viewData.fileType === "sheet" && useAdvancedExcelViewer ? (
          <AdvancedExcelViewer
            file={viewData.file!}
            versionNumber={primaryVersion.versionNumber}
            navData={navData}
          />
        ) : viewData.fileType === "image" ? (
          <ImageViewer
            file={viewData.file!}
            screenshotProtectionEnabled={link.enableScreenshotProtection!}
            versionNumber={primaryVersion.versionNumber}
            showPoweredByBanner={showPoweredByBanner}
            viewerEmail={viewerEmail}
            watermarkConfig={
              link.enableWatermark
                ? (link.watermarkConfig as WatermarkConfig)
                : null
            }
            ipAddress={viewData.ipAddress}
            linkName={link.name ?? `Link #${link.id.slice(-5)}`}
            navData={navData}
          />
        ) : viewData.pages && !primaryVersion.isVertical ? (
          <PagesHorizontalViewer
            pages={viewData.pages}
            feedbackEnabled={link.enableFeedback!}
            screenshotProtectionEnabled={link.enableScreenshotProtection!}
            versionNumber={primaryVersion.versionNumber}
            showPoweredByBanner={showPoweredByBanner}
            showAccountCreationSlide={showAccountCreationSlide}
            enableQuestion={link.enableQuestion}
            feedback={link.feedback}
            viewerEmail={viewerEmail}
            watermarkConfig={
              link.enableWatermark
                ? (link.watermarkConfig as WatermarkConfig)
                : null
            }
            ipAddress={viewData.ipAddress}
            linkName={link.name ?? `Link #${link.id.slice(-5)}`}
            navData={navData}
          />
        ) : viewData.pages && primaryVersion.isVertical ? (
          <PagesVerticalViewer
            pages={viewData.pages}
            feedbackEnabled={link.enableFeedback!}
            screenshotProtectionEnabled={link.enableScreenshotProtection!}
            versionNumber={primaryVersion.versionNumber}
            showPoweredByBanner={showPoweredByBanner}
            enableQuestion={link.enableQuestion}
            feedback={link.feedback}
            viewerEmail={viewerEmail}
            watermarkConfig={
              link.enableWatermark
                ? (link.watermarkConfig as WatermarkConfig)
                : null
            }
            ipAddress={viewData.ipAddress}
            linkName={link.name ?? `Link #${link.id.slice(-5)}`}
            navData={navData}
          />
        ) : viewData.fileType === "video" ? (
          <VideoViewer
            file={viewData.file!}
            screenshotProtectionEnabled={link.enableScreenshotProtection!}
            versionNumber={primaryVersion.versionNumber}
            navData={navData}
          />
        ) : (
          <PDFViewer
            file={viewData.file}
            name={document.name}
            versionNumber={primaryVersion.versionNumber}
            navData={navData}
          />
        )}
      </ViewerChatLayout>

      {/* AI Chat Components */}
      <ViewerChatPanel />
      <ViewerChatToggle />
    </ViewerChatProvider>
  );
}
