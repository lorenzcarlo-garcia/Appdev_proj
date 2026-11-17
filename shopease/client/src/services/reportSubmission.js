import {createDraft,submitDraft} from './reports';
import {uploadAttachments} from './reportAttachments';
// Keep the report private until every selected photo has uploaded successfully.
export async function createReportWithPhotos(details,files,{submit=false}={}) {
  const draft=await createDraft(details);
  try {
    await uploadAttachments(draft.id,files);
    return submit ? await submitDraft(draft.id) : draft;
  } catch(error) {
    // The caller must direct retries to this saved report, never create another.
    error.savedReportId=draft.id;
    throw error;
  }
}
