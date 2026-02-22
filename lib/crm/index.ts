export {
  createContact,
  getContact,
  getContactByEmail,
  updateContact,
  deleteContact,
  searchContacts,
  upsertContact,
  incrementEngagementScore,
  logContactActivity,
  createContactNote,
  getContactNotes,
  updateContactNote,
  deleteContactNote,
} from "./contact-service";

export type {
  ContactCreateInput,
  ContactUpdateInput,
  ContactSearchParams,
  ContactSearchResult,
  ContactUpsertInput,
} from "./contact-service";
