// Funding Marketplace Framework — Public API
// ============================================================================

// Types & Configuration
export {
  DEAL_STAGE_CONFIG,
  STAGE_TRANSITIONS,
  DEAL_TYPE_CONFIG,
  DEAL_VISIBILITY_CONFIG,
  INTEREST_STATUS_CONFIG,
} from "./types";

export type {
  CreateDealInput,
  UpdateDealInput,
  TransitionStageInput,
  ExpressInterestInput,
  AllocateInput,
  CreateListingInput,
  DealFilters,
  MarketplaceFilters,
  PipelineStats,
  DealKPIs,
} from "./types";

// Deal CRUD
export { createDeal, updateDeal, deleteDeal, getDeal, listDeals } from "./deals";

// Pipeline Engine
export {
  transitionDealStage,
  getPipelineStats,
  getDealKPIs,
} from "./pipeline";

// Interest & Allocations
export {
  expressInterest,
  updateInterestStatus,
  listDealInterests,
  allocateDeal,
  respondToAllocation,
  listDealAllocations,
} from "./interest";

// Marketplace Listings
export {
  upsertListing,
  publishListing,
  unpublishListing,
  recordListingView,
  recordListingSave,
  browseListings,
  getListingDetail,
  getMarketplaceCategories,
} from "./listings";

// Deal Documents
export {
  createDealDocument,
  listDealDocuments,
  getDealDocument,
  updateDealDocument,
  deleteDealDocument,
} from "./documents";
export type { CreateDocumentInput, UpdateDocumentInput } from "./documents";

// Deal Notes
export {
  createDealNote,
  listDealNotes,
  updateDealNote,
  deleteDealNote,
} from "./notes";
export type { CreateNoteInput, UpdateNoteInput } from "./notes";

// Activities
export { listDealActivities, createManualActivity } from "./activities";
export type { ActivityListOptions, CreateActivityInput } from "./activities";

// Analytics
export {
  trackMarketplaceEvent,
  computePipelineMetrics,
} from "./analytics";
export type { MarketplaceEvent, PipelineMetricsSnapshot } from "./analytics";
