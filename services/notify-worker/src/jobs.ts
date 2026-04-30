// Re-exports from @openmarket/contracts so the worker and the API agree on
// the shape of an email job. Single source of truth lives in contracts.
export {
  type EmailJob,
  type EmailTemplate,
  type EmailTemplateMap,
  NOTIFY_QUEUE_NAME,
} from "@openmarket/contracts";
