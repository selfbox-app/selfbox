import { registerHandler } from "../runtime";
import { qmdSearchHandler } from "./qmd-search";
import { ftsSearchHandler } from "./fts-search";
import { googleDriveHandler } from "./google-drive";
import { documentTranscriptionHandler } from "./document-transcription";
import { knowledgeBaseHandler } from "./knowledge-base";

export function registerBuiltinHandlers(): void {
  registerHandler(qmdSearchHandler);
  registerHandler(ftsSearchHandler);
  registerHandler(googleDriveHandler);
  registerHandler(documentTranscriptionHandler);
  registerHandler(knowledgeBaseHandler);
}

// Auto-register on import
registerBuiltinHandlers();
