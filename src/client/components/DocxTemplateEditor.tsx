import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileText, Loader2, Save, Search, Tags, X } from "lucide-react";
import { DocxEditor, type DocxEditorRef } from "@docx-editor.dev/react";
import "@docx-editor.dev/react/styles.css";
import { downloadDocxTemplateUrl, uploadDocxTemplate } from "../api";

export type DocxTemplateType = "single" | "project" | "user";

type DocxTemplateEditorProps = {
  type: DocxTemplateType;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
};

const TEMPLATE_CONFIG: Record<DocxTemplateType, { title: string; filename: string; groups: Array<{ label: string; tags: string[] }> }> = {
  single: {
    title: "Single Issue CR Transport Form",
    filename: "cr_transport.docx",
    groups: [
      { label: "Request and CR", tags: ["[Fullname Requester]", "[CR Helpdesk]", "[Fullname ABAPer]", "[CR SAP]", "[CR SAP Description]", "[Problem]", "[Impact]"] },
      { label: "Object classifications", tags: ["[Classification 1]", "[Classification 2]", "[Classification n]"] },
      { label: "QA process", tags: ["[Nickname QA Transporter]", "[QA Transported Date (DD.MM.YYYY)]", "[Nickname QA Tester]", "[QA Tested Date (DD.MM.YYYY)]", "[Nickname QA Evaluator]", "[QA Evaluated Date (DD.MM.YYYY)]"] },
      { label: "Production process", tags: ["[Nickname PRD Requester]", "[PRD Requested Date (DD.MM.YYYY)]", "[Nickname PRD Evaluator]", "[PRD Evaluated Date (DD.MM.YYYY)]", "[Nickname Approval]", "[Approval Date (DD.MM.YYYY)]", "[Nickname PRD Transporter]", "[PRD Transported Date (DD.MM.YYYY)]", "[PRD Date]"] }
    ]
  },
  project: {
    title: "Project Group CR Transport Form",
    filename: "cr_transport_project.docx",
    groups: [{ label: "Project data", tags: ["{PROJECT_KEY}", "{PROJECT_NAME}", "{TARGET_SYSTEM}", "{TOTAL_ISSUES}", "{TOTAL_CRS}", "{DATE}", "{REQUESTER}", "{ABAPER}"] }]
  },
  user: {
    title: "CR User Form (Business Request)",
    filename: "cr_user.docx",
    groups: [
      { label: "Issue and request", tags: ["[ISSUE_NAME]", "[CR_SAP]", "[CR SAP Description]", "[MODULE]", "[Fullname Requester]", "[Department]", "[Problem]", "[Impact]", "[Explanation]"] },
      { label: "People", tags: ["[Fullname Examiner]", "[Fullname Evaluator]", "[Transporter]", "[Manager Requester]", "[IT Manager]"] },
      { label: "Estimate and effects", tags: ["[ESTIMATED_PERSONS]", "[ESTIMATED_DAYS]", "[Resource Estimate]", "[Effects]"] },
      { label: "Dates", tags: ["[DATE_DEV]", "[DATE_QA]", "[DATE_PRD]", "[Date]"] }
    ]
  }
};

export function DocxTemplateEditor({ type, onClose, onSaved, onError }: DocxTemplateEditorProps) {
  const editorRef = useRef<DocxEditorRef>(null);
  const [documentBytes, setDocumentBytes] = useState<Uint8Array | null>(null);
  const [loadingError, setLoadingError] = useState("");
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const config = TEMPLATE_CONFIG[type];

  useEffect(() => {
    let active = true;
    document.body.classList.add("docx-template-editor-open");
    fetch(downloadDocxTemplateUrl(type), { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load the active Word template.");
        return new Uint8Array(await response.arrayBuffer());
      })
      .then((bytes) => { if (active) setDocumentBytes(bytes); })
      .catch((error) => { if (active) setLoadingError(error instanceof Error ? error.message : String(error)); });
    return () => {
      active = false;
      document.body.classList.remove("docx-template-editor-open");
    };
  }, [type]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return config.groups;
    return config.groups
      .map((group) => ({ ...group, tags: group.tags.filter((tag) => tag.toLowerCase().includes(normalized)) }))
      .filter((group) => group.tags.length > 0);
  }, [config, query]);

  function requestClose() {
    if (dirty && !window.confirm("You have unsaved template changes. Close the editor and discard them?")) return;
    onClose();
  }

  function insertTag(tag: string) {
    const ref = editorRef.current;
    if (!ref) {
      onError("Place the cursor in an editable document position before inserting a tag.");
      return;
    }
    ref.exec({ type: "paste", text: tag } as any);
    ref.focus();
  }

  async function saveTemplate() {
    try {
      setSaving(true);
      const buffer = await editorRef.current?.save();
      if (!buffer) throw new Error("The edited document is not ready to save.");
      const file = new File([buffer], config.filename, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const response = await uploadDocxTemplate(type, file);
      setDirty(false);
      onSaved(response.message || "Word template saved successfully.");
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="docx-template-editor-overlay" role="dialog" aria-modal="true" aria-label={`Edit ${config.title}`}>
      <header className="docx-template-editor-header">
        <div className="docx-template-editor-heading">
          <button type="button" className="docx-editor-icon-button" onClick={requestClose} aria-label="Back to Settings"><ArrowLeft size={19} /></button>
          <span className="docx-template-editor-file-icon"><FileText size={20} /></span>
          <div><h2>{config.title}</h2><p>Edit the document and insert available tags at the cursor position.</p></div>
        </div>
        <div className="docx-template-editor-actions">
          <span className={`docx-template-save-status${dirty ? " is-dirty" : ""}`}>{dirty ? "Unsaved changes" : "All changes saved"}</span>
          <button type="button" className="docx-editor-secondary-button" onClick={requestClose} disabled={saving}><X size={16} /> Cancel</button>
          <button type="button" className="docx-editor-primary-button" onClick={saveTemplate} disabled={saving || !documentBytes || !!loadingError}>{saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />} {saving ? "Saving..." : "Save Template"}</button>
        </div>
      </header>
      <div className="docx-template-editor-layout">
        <aside className="docx-template-tag-panel">
          <div className="docx-template-tag-heading"><Tags size={18} /><div><strong>Available Tags</strong><span>Click a tag to insert it.</span></div></div>
          <label className="docx-template-tag-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tags..." /></label>
          <div className="docx-template-tag-groups">
            {filteredGroups.map((group) => <section key={group.label}><h3>{group.label}</h3>{group.tags.map((tag) => <button key={tag} type="button" className="docx-template-tag-button" title={`Insert ${tag}`} onMouseDown={(event) => event.preventDefault()} onClick={() => insertTag(tag)}>{tag}</button>)}</section>)}
            {filteredGroups.length === 0 ? <p className="docx-template-tag-empty">No tags match your search.</p> : null}
          </div>
        </aside>
        <main className="docx-template-document-panel">
          {!documentBytes && !loadingError ? <div className="docx-template-editor-state"><Loader2 className="spin" size={26} /><strong>Loading Word template...</strong></div> : null}
          {loadingError ? <div className="docx-template-editor-state is-error"><strong>Template could not be opened</strong><span>{loadingError}</span></div> : null}
          {documentBytes ? <DocxEditor ref={editorRef} document={documentBytes} mode="edit" title={config.filename} colorMode="light" navigation={false} onChange={() => setDirty(true)} onSave={() => void saveTemplate()} /> : null}
        </main>
      </div>
    </div>
  );
}
