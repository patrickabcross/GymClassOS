Content feature (CV2). Tiptap (non-collab) rich-doc editor + agent tools.
Backed by content_documents (db.ts v20). Copy agent-native templates/content
here in CV2, strip all collaboration/Yjs extensions, then adapt.

Prior art: apps/hq/actions/content-{create,list,get,update}-document.ts (BD3-05
non-collab Content fork). Key changes from HQ version: (a) remove
ownableColumns/accessFilter (gym tables are single-tenant, use
guard:allow-unscoped); (b) add status field (draft/published); (c) rename
deepLink app to match staff-web navigation.

Note for CV2: Tiptap is already installed in apps/staff-web/package.json at
^3.22.2 (starter-kit, react, pm, image, link, placeholder, code-block-lowlight,
tiptap-markdown, lowlight). Do NOT add Tiptap again and do NOT add any
@tiptap/extension-collaboration*, y-prosemirror, yjs, or y-indexeddb.
GymosNavBridge (app/components/gymos/GymosNavBridge.tsx) is the gymos navigate
consumer to reuse/extend for content tab navigation.
