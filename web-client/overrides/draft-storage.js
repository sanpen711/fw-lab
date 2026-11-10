// The browser client retains its existing webDraft lifecycle. Durable native
// drafts are scoped to the Windows frontend and its local WebView storage.
export async function loadDraftSnapshot(){return{compose:null,comments:{},chats:{}};}
export function saveDraftSnapshot(){}
export async function flushDraftWrites(){}
