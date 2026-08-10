import { useEffect, useState, useRef } from "react";
import { fetchAdminPeople, fetchAdminSettings, updateAdminPerson, updateAdminSettings, createAdminPerson, deleteAdminPerson, fetchGroupEmails, createGroupEmail, updateGroupEmail, deleteGroupEmail, fetchSapSystems, createSapSystem, updateSapSystem, deleteSapSystem, testSapSystemConnection, type AdminPersonRow, type GroupEmailRow, type SapSystemRow } from "../api";
import { Check, Loader2, Save, X, Trash2, CheckCircle2, XCircle, AlertTriangle, Mail, Palette, Type, Sliders, User, Database, LayoutGrid, Server, Eye, EyeOff, Plus, Edit2, Activity, ShieldCheck, Radio, FileCode2, FileText } from "lucide-react";
import { STATUS_COLOR_CONFIGS, applyCustomStatusColors } from "../utils/tagColors";
import { applyCustomFontSize, getActiveAppearanceKey } from "../utils/fontSize";
import { TableDataLoader } from "../components/InteractiveLoaders";

interface MasterDataWorkspaceProps {
  mode?: "master-data" | "settings";
  isAdmin?: boolean;
  username?: string;
}

export function MasterDataWorkspace({ mode = "master-data", isAdmin = true, username }: MasterDataWorkspaceProps) {
  const storageKey = getActiveAppearanceKey(username);

  const [activeTab, setActiveTab] = useState<"people" | "group_emails" | "sap_systems" | "general_settings" | "ai_instructions" | "appearance">("people");

  useEffect(() => {
    if (mode === "settings") {
      if (!isAdmin) {
        setActiveTab("appearance");
      } else if (activeTab === "people" || activeTab === "group_emails") {
        setActiveTab("sap_systems");
      }
    } else if (mode === "master-data" && (activeTab === "sap_systems" || activeTab === "general_settings" || activeTab === "ai_instructions" || activeTab === "appearance")) {
      setActiveTab("people");
    }
  }, [mode, isAdmin]);

  const [people, setPeople] = useState<AdminPersonRow[]>([]);
  const [groupEmails, setGroupEmails] = useState<GroupEmailRow[]>([]);
  const [sapSystems, setSapSystems] = useState<SapSystemRow[]>([]);
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [editingServer, setEditingServer] = useState<SapSystemRow | null>(null);
  const [deleteConfirmServer, setDeleteConfirmServer] = useState<SapSystemRow | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [serverFormData, setServerFormData] = useState<Partial<SapSystemRow>>({
    code: "",
    description: "",
    environment: "Development",
    allow_multiple_logon: false,
    host: "",
    system_number: "00",
    client: "100",
    rfc_user: "",
    rfc_password: "",
    is_active: true
  });
  const DEFAULT_GLPI_TEMPLATE = `Dear All,

Issue and CR **CREATED**.

- Issue no: **{ISSUE_KEY}** ({ISSUE_NAME})
- CR no.: **{CR_SAP}**
- CR Description: **{CR_DESCRIPTION}**
- SAP Object List:
{OBJECT_LIST}

**Note:**
Mohon dibantu melengkapi kelengkapan dokumen sebagai berikut:
1. Dokumen CR User
2. No. CR User

Terima kasih.

Regards,
**{FULLNAME}**`;

  const DEFAULT_EMAIL_TEMPLATE = `Dear All,

Email permintaan sudah dilayani pada ticket **[GLPI #{GLPI_NO}]**.
Untuk selanjutnya silahkan berkomunikasi melalui ticket ini di aplikasi **ITSM GLPI** untuk update proses selanjutnya:

>> {GLPI_LINK}

- Issue no: **{ISSUE_KEY}** ({ISSUE_NAME})
- CR no.: **{CR_SAP}**
- CR Description: **{CR_DESCRIPTION}**
- SAP Object List:
{OBJECT_LIST}

Terima kasih.

Regards,

<u>{FULLNAME}</u>
({USER_DEPARTMENT})`;

  const [settings, setSettings] = useState<Record<string, string>>({
    ai_instruction_glpi: "",
    ai_instruction_email: "",
    ai_instruction_issue_name: "",
    ai_instruction_problem: "",
    ai_instruction_impact: "",
    openrouter_api_key: "",
    openrouter_model: "openrouter/auto",
    exchange_host: "",
    exchange_user: "",
    exchange_pass: "",
    app_font_size: "14",
    filename_pattern_cr_transport: "CR Transport {ISSUE_KEY}.docx",
    filename_pattern_project_cr_transport: "CR Transport Project {PROJECT_KEY}.docx",
    template_body_glpi: DEFAULT_GLPI_TEMPLATE,
    template_body_email: DEFAULT_EMAIL_TEMPLATE,
  });

  const glpiTextareaRef = useRef<HTMLTextAreaElement>(null);
  const emailTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeTemplateTab, setActiveTemplateTab] = useState<"glpi" | "email">("glpi");

  function applyToolbarFormatting(prefix: string, suffix = "") {
    const isGlpi = activeTemplateTab === "glpi";
    const key = isGlpi ? "template_body_glpi" : "template_body_email";
    const ref = isGlpi ? glpiTextareaRef : emailTextareaRef;
    const textarea = ref.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = settings[key] !== undefined ? settings[key] : (isGlpi ? DEFAULT_GLPI_TEMPLATE : DEFAULT_EMAIL_TEMPLATE);
    const selectedText = currentVal.substring(start, end) || "text";
    const newVal = currentVal.substring(0, start) + prefix + selectedText + suffix + currentVal.substring(end);

    setSettings((prev) => ({ ...prev, [key]: newVal }));
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 50);
  }

  function insertTemplateToken(token: string) {
    const isGlpi = activeTemplateTab === "glpi";
    const key = isGlpi ? "template_body_glpi" : "template_body_email";
    const ref = isGlpi ? glpiTextareaRef : emailTextareaRef;
    const textarea = ref.current;

    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentVal = settings[key] !== undefined ? settings[key] : (isGlpi ? DEFAULT_GLPI_TEMPLATE : DEFAULT_EMAIL_TEMPLATE);
      const newVal = currentVal.substring(0, start) + token + currentVal.substring(end);
      setSettings((prev) => ({ ...prev, [key]: newVal }));
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + token.length, start + token.length);
      }, 50);
    } else {
      setSettings((prev) => {
        const currentVal = prev[key] !== undefined ? prev[key] : (isGlpi ? DEFAULT_GLPI_TEMPLATE : DEFAULT_EMAIL_TEMPLATE);
        return { ...prev, [key]: `${currentVal} ${token}` };
      });
    }
  }

  function resetTemplateToDefault() {
    const isGlpi = activeTemplateTab === "glpi";
    const key = isGlpi ? "template_body_glpi" : "template_body_email";
    const defaultVal = isGlpi ? DEFAULT_GLPI_TEMPLATE : DEFAULT_EMAIL_TEMPLATE;
    setSettings((prev) => ({ ...prev, [key]: defaultVal }));
    showToast("success", `Reset ${isGlpi ? "GLPI Ticket" : "Email"} template to standard default format! Click Save Settings to store.`);
  }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [newPersonData, setNewPersonData] = useState({ full_name: "", nickname: "", email: "" });
  const [newGroupEmail, setNewGroupEmail] = useState({ email_address: "", name: "" });
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [deleteConfirmPerson, setDeleteConfirmPerson] = useState<AdminPersonRow | null>(null);
  const [deleteConfirmGroup, setDeleteConfirmGroup] = useState<GroupEmailRow | null>(null);

  const [activePatternField, setActivePatternField] = useState<"single" | "project">("single");

  function renderPatternPreview(pattern: string, isProject = false) {
    if (!pattern || !pattern.trim()) return "(empty pattern)";
    const sampleTokens: Record<string, string> = isProject
      ? {
          PROJECT_KEY: "PRJ-2026-001",
          PROJECT_NAME: "New Company Rollout",
          DATE: new Date().toISOString().split("T")[0]
        }
      : {
          ISSUE_KEY: "26039-01",
          CR_SAP: "TRDK921784",
          GLPI_NO: "INC-10042",
          PROJECT_NAME: "New Company Rollout",
          REQUESTER: "WILLFEBRIAN",
          ABAPER: "BUDI",
          DATE: new Date().toISOString().split("T")[0],
          ENV: "DEV"
        };

    let res = pattern;
    for (const [k, v] of Object.entries(sampleTokens)) {
      res = res.replace(new RegExp(`\\{${k}\\}`, "gi"), v);
    }
    res = res.replace(/\{[A-Z0-9_]+\}/gi, "");
    res = res
      .replace(/\(\s*\)/g, "")
      .replace(/\[\s*\]/g, "")
      .replace(/-\s*-+/g, "-")
      .replace(/_\s*_+/g, "_")
      .replace(/\s+/g, " ")
      .replace(/\s+-\s+/g, " - ")
      .replace(/\s+\./g, ".")
      .trim();
    res = res.replace(/[-_\s]+(\.[a-zA-Z0-9]+)$/, "$1");
    if (!res.toLowerCase().endsWith(".docx")) res += ".docx";
    return res;
  }

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    let localAppearance: Record<string, string> = {};
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) localAppearance = JSON.parse(saved);
    } catch {}

    Promise.all([
      isAdmin ? fetchAdminPeople().catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),
      fetchAdminSettings().catch(() => ({} as Record<string, string>)),
      isAdmin ? fetchGroupEmails().catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),
      isAdmin ? fetchSapSystems().catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] })
    ])
      .then(([peopleRes, settingsRes, groupEmailsRes, sapSystemsRes]) => {
        setPeople(peopleRes.rows || []);
        setGroupEmails(groupEmailsRes.rows || []);
        setSapSystems(sapSystemsRes.rows || []);
        let emailTemplateVal = settingsRes.template_body_email;
        if (!emailTemplateVal || emailTemplateVal.includes("Berikut update pengerjaan Issue & CR SAP")) {
          emailTemplateVal = DEFAULT_EMAIL_TEMPLATE;
        }

        let glpiTemplateVal = settingsRes.template_body_glpi;
        if (!glpiTemplateVal) {
          glpiTemplateVal = DEFAULT_GLPI_TEMPLATE;
        }

        const merged = {
          ai_instruction_glpi: settingsRes.ai_instruction_glpi || "",
          ai_instruction_email: settingsRes.ai_instruction_email || "",
          ai_instruction_issue_name: settingsRes.ai_instruction_issue_name || "",
          ai_instruction_problem: settingsRes.ai_instruction_problem || "",
          ai_instruction_impact: settingsRes.ai_instruction_impact || "",
          openrouter_api_key: settingsRes.openrouter_api_key || "",
          openrouter_model: settingsRes.openrouter_model || "openrouter/auto",
          exchange_host: settingsRes.exchange_host || "",
          exchange_user: settingsRes.exchange_user || "",
          exchange_pass: settingsRes.exchange_pass || "",
          app_font_size: settingsRes.app_font_size || "14",
          filename_pattern_cr_transport: settingsRes.filename_pattern_cr_transport || "CR Transport {ISSUE_KEY}.docx",
          filename_pattern_project_cr_transport: settingsRes.filename_pattern_project_cr_transport || "CR Transport Project {PROJECT_KEY}.docx",
          ...settingsRes,
          ...localAppearance,
          template_body_glpi: glpiTemplateVal,
          template_body_email: emailTemplateVal,
        };
        setSettings(merged);
      })
      .finally(() => setLoading(false));
  }, [isAdmin]);

  async function handleSaveServer(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!serverFormData.code?.trim()) {
      showToast("error", "Target System Code is required (e.g. DEV_NC)");
      return;
    }
    try {
      setSaving(true);
      if (editingServer) {
        const updated = await updateSapSystem(editingServer.id, serverFormData);
        setSapSystems((prev) => prev.map((s) => (s.id === editingServer.id ? { ...s, ...updated } : s)));
        showToast("success", `Target System "${serverFormData.code}" updated successfully!`);
      } else {
        const created = await createSapSystem(serverFormData);
        setSapSystems((prev) => [...prev, created]);
        showToast("success", `New Target System "${created.code}" created successfully!`);
      }
      setShowAddServerModal(false);
      setEditingServer(null);
      resetServerForm();
    } catch (err) {
      showToast("error", `Failed to save Target System: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteServer(id: number) {
    try {
      setSaving(true);
      await deleteSapSystem(id);
      setSapSystems((prev) => prev.filter((s) => s.id !== id));
      setDeleteConfirmServer(null);
      showToast("success", "Target system deleted successfully.");
    } catch (err) {
      showToast("error", `Failed to delete system: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleServerActive(id: number, active: boolean) {
    setSapSystems((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: active } : s)));
    try {
      await updateSapSystem(id, { is_active: active });
    } catch (err) {
      setSapSystems((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: !active } : s)));
      showToast("error", "Failed to update system status");
    }
  }

  async function handleTestConnection() {
    if (!serverFormData.host?.trim()) {
      showToast("error", "Please specify a Host IP or Hostname to test connection.");
      return;
    }
    setTestingConnection(true);
    try {
      const res = await testSapSystemConnection(serverFormData);
      showToast("success", res.message || "Connection test successful!");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setTestingConnection(false);
    }
  }

  function resetServerForm() {
    setServerFormData({
      code: "",
      description: "",
      environment: "Development",
      allow_multiple_logon: false,
      host: "192.168.2.8",
      system_number: "00",
      client: "100",
      rfc_user: "TRSTDEV",
      rfc_password: "",
      is_active: true
    });
  }

  function openEditServerModal(server: SapSystemRow) {
    setEditingServer(server);
    setServerFormData({
      ...server,
      host: server.host || "192.168.2.8",
      system_number: server.system_number || "00",
      client: server.client || "100",
      rfc_user: server.rfc_user || "TRSTDEV"
    });
    setShowAddServerModal(true);
  }

  useEffect(() => {
    const handleSetTab = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setActiveTab(customEvent.detail as any);
      }
    };
    window.addEventListener("set-master-data-tab", handleSetTab);
    window.addEventListener("set-settings-tab", handleSetTab);
    return () => {
      window.removeEventListener("set-master-data-tab", handleSetTab);
      window.removeEventListener("set-settings-tab", handleSetTab);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("master-data-tab-changed", { detail: { mode, activeTab } }));
  }, [mode, activeTab]);

  async function togglePersonFlag(id: number, field: keyof AdminPersonRow, value: boolean) {
    const person = people.find((p) => p.id === id);
    if (!person) return;
    
    // Optimistic update
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    
    try {
      await updateAdminPerson(id, {
        is_active: person.is_active,
        is_approver: person.is_approver,
        is_abaper: person.is_abaper,
        is_requester: person.is_requester,
        is_tester: person.is_tester,
        is_evaluator: person.is_evaluator,
        is_transporter: person.is_transporter,
        [field]: value,
      });
    } catch (err) {
      // Revert on error
      setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: !value } : p)));
      showToast("error", "Failed to update person role");
    }
  }

  async function handleAddPerson(e?: React.FormEvent) {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      const newPerson = await createAdminPerson(newPersonData);
      setPeople((prev) => [newPerson, ...prev]);
      setShowAddModal(false);
      setNewPersonData({ full_name: "", nickname: "", email: "" });
      showToast("success", "New person added successfully!");
    } catch (err) {
      showToast("error", `Failed to create new person: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function updatePersonText(id: number, field: "full_name" | "nickname" | "email", value: string) {
    const person = people.find((p) => p.id === id);
    if (!person || person[field] === value) return;
    
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    
    try {
      await updateAdminPerson(id, {
        is_active: person.is_active,
        is_approver: person.is_approver,
        is_abaper: person.is_abaper,
        is_requester: person.is_requester,
        is_tester: person.is_tester,
        is_evaluator: person.is_evaluator,
        is_transporter: person.is_transporter,
        full_name: field === "full_name" ? value : person.full_name,
        nickname: field === "nickname" ? value : person.nickname,
        email: field === "email" ? value : person.email,
      });
    } catch (err) {
      setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: person[field] } : p)));
      showToast("error", `Failed to update ${field}`);
    }
  }

  async function confirmDeletePerson() {
    if (!deleteConfirmPerson) return;
    try {
      setSaving(true);
      await deleteAdminPerson(deleteConfirmPerson.id);
      setPeople((prev) => prev.filter((p) => p.id !== deleteConfirmPerson.id));
      showToast("success", `Person "${deleteConfirmPerson.full_name || deleteConfirmPerson.nickname}" deleted successfully!`);
      setDeleteConfirmPerson(null);
    } catch (err) {
      showToast("error", `Failed to delete person: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await updateAdminSettings(settings);
      applyCustomStatusColors(settings);
      applyCustomFontSize(settings);
      showToast("success", "Settings saved successfully!");
    } catch (err) {
      showToast("error", "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  const [showAdminAppearanceModal, setShowAdminAppearanceModal] = useState(false);

  function handleSaveAppearanceClick() {
    if (isAdmin) {
      setShowAdminAppearanceModal(true);
    } else {
      saveAppearanceSettingsLocalOnly();
    }
  }

  function getAppearancePayload() {
    const appearanceKeys = ["app_font_size", "issue_form_layout", "create_issue_form_layout", "change_issue_form_layout"];
    for (const cfg of STATUS_COLOR_CONFIGS) {
      appearanceKeys.push(`status_color_${cfg.key}_bg`);
      appearanceKeys.push(`status_color_${cfg.key}_text`);
      appearanceKeys.push(`status_color_${cfg.key}_border`);
    }

    const appearanceSettings: Record<string, string> = {};
    for (const k of appearanceKeys) {
      if (settings[k] !== undefined) appearanceSettings[k] = settings[k];
    }
    return appearanceSettings;
  }

  function saveAppearanceSettingsLocalOnly() {
    const appearanceSettings = getAppearancePayload();
    localStorage.setItem(storageKey, JSON.stringify(appearanceSettings));
    applyCustomStatusColors(settings, );
    applyCustomFontSize(settings, );
    setShowAdminAppearanceModal(false);
    showToast("success", "Personal appearance preferences saved to your local storage!");
  }

  async function saveAppearanceSettingsGlobalAndLocal() {
    const appearanceSettings = getAppearancePayload();
    localStorage.setItem(storageKey, JSON.stringify(appearanceSettings));
    applyCustomStatusColors(settings, );
    applyCustomFontSize(settings, );

    setSaving(true);
    try {
      await updateAdminSettings(settings);
      setShowAdminAppearanceModal(false);
      showToast("success", "Appearance settings saved to Database (System Default) & Local Storage!");
    } catch (err) {
      showToast("error", "Saved to local storage, but failed to save to server database.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddGroupEmail(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!newGroupEmail.email_address.trim()) return;
    try {
      setSaving(true);
      const created = await createGroupEmail(newGroupEmail);
      setGroupEmails((prev) => [...prev, created]);
      setShowAddGroupModal(false);
      setNewGroupEmail({ email_address: "", name: "" });
      showToast("success", "Group email added successfully!");
    } catch (err) {
      showToast("error", `Failed to add group email: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleGroupEmailActive(id: number, active: boolean) {
    setGroupEmails((prev) => prev.map((g) => (g.id === id ? { ...g, is_active: active } : g)));
    try {
      await updateGroupEmail(id, { is_active: active });
    } catch (err) {
      setGroupEmails((prev) => prev.map((g) => (g.id === id ? { ...g, is_active: !active } : g)));
      showToast("error", "Failed to update group email status");
    }
  }

  async function confirmDeleteGroupEmail() {
    if (!deleteConfirmGroup) return;
    try {
      setSaving(true);
      await deleteGroupEmail(deleteConfirmGroup.id);
      setGroupEmails((prev) => prev.filter((g) => g.id !== deleteConfirmGroup.id));
      showToast("success", `Group email "${deleteConfirmGroup.email_address}" deleted!`);
      setDeleteConfirmGroup(null);
    } catch (err) {
      showToast("error", `Failed to delete group email: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  const filteredPeople = [...people]
    .filter(
      (p) =>
        p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.email?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      if (a.is_requester !== b.is_requester) return a.is_requester ? -1 : 1;
      if (a.is_abaper !== b.is_abaper) return a.is_abaper ? -1 : 1;
      if (a.is_tester !== b.is_tester) return a.is_tester ? -1 : 1;
      if (a.is_evaluator !== b.is_evaluator) return a.is_evaluator ? -1 : 1;
      if (a.is_approver !== b.is_approver) return a.is_approver ? -1 : 1;
      if (a.is_transporter !== b.is_transporter) return a.is_transporter ? -1 : 1;
      
      const nameA = a.full_name || a.nickname || "";
      const nameB = b.full_name || b.nickname || "";
      return nameA.localeCompare(nameB);
    });

  if (loading) {
    return <TableDataLoader text="Loading master data..." />;
  }

  return (
    <div className="master-data-workspace">

      {activeTab === "people" && (
        <div className="people-tab" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ background: "var(--color-bg-elevated, #ffffff)", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--color-border, #e5e7eb)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "1.25rem", color: "var(--color-text-heading, #111827)" }}>People Roles</h3>
                <p style={{ color: "var(--color-text-muted, #6b7280)", margin: 0, fontSize: "0.875rem" }}>Manage the access control and specific roles for all team members.</p>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  onClick={() => setShowAddModal(true)}
                  disabled={saving}
                  style={{ padding: "0.625rem 1.25rem", borderRadius: "6px", background: "var(--color-primary, #0f766e)", color: "white", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "0.875rem", whiteSpace: "nowrap", transition: "all 0.2s" }}
                >
                  + Add New Person
                </button>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: "0.625rem 1rem", minWidth: "250px", borderRadius: "6px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #111827)", fontSize: "0.875rem", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)" }}
                />
              </div>
            </div>
            
            <div style={{ overflowX: "auto", border: "1px solid var(--color-border, #e5e7eb)", borderRadius: "6px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
                <thead style={{ background: "var(--color-bg-subtle, #f9fafb)" }}>
                  <tr>
                    <th style={{ position: "sticky", left: 0, zIndex: 3, background: "var(--color-bg-subtle, #f9fafb)", padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", minWidth: "200px", width: "200px", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Full Name</th>
                    <th style={{ position: "sticky", left: "200px", zIndex: 3, background: "var(--color-bg-subtle, #f9fafb)", padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", minWidth: "100px", width: "100px", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Alias</th>
                    <th style={{ position: "sticky", left: "300px", zIndex: 3, background: "var(--color-bg-subtle, #f9fafb)", padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", minWidth: "200px", width: "200px", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</th>
                    <th style={{ position: "sticky", left: "500px", zIndex: 3, background: "var(--color-bg-subtle, #f9fafb)", padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", minWidth: "250px", width: "250px", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", boxShadow: "3px 0 5px -2px rgba(0, 0, 0, 0.12)" }}>Tags</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Active</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Requester</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>ABAPer</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tester</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Evaluator</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Approver</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Transporter</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}></th>
                  </tr>
                </thead>
              <tbody>
                {filteredPeople.map((p) => (
                  <tr key={p.id}>
                    <td style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--color-bg-elevated, #ffffff)", padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", verticalAlign: "middle", minWidth: "200px", width: "200px" }}>
                      <input
                        type="text"
                        defaultValue={p.full_name || ""}
                        onBlur={(e) => updatePersonText(p.id, "full_name", e.target.value)}
                        placeholder="e.g. John Doe"
                        style={{ padding: "0.5rem 0.625rem", borderRadius: "4px", border: "1px solid transparent", background: "transparent", color: "var(--color-text, #111827)", fontSize: "0.875rem", width: "100%", transition: "all 0.2s" }}
                        onFocus={(e) => { e.currentTarget.style.border = "1px solid var(--color-primary, #2563eb)"; e.currentTarget.style.background = "var(--color-bg, #ffffff)"; }}
                        onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) { e.currentTarget.style.border = "1px solid transparent"; e.currentTarget.style.background = "transparent"; } }}
                        onMouseEnter={(e) => { if (document.activeElement !== e.currentTarget) { e.currentTarget.style.border = "1px solid var(--color-border, #d1d5db)"; e.currentTarget.style.background = "var(--color-bg, #ffffff)"; } }}
                      />
                    </td>
                    <td style={{ position: "sticky", left: "200px", zIndex: 2, background: "var(--color-bg-elevated, #ffffff)", padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", verticalAlign: "middle", minWidth: "100px", width: "100px" }}>
                      <input
                        type="text"
                        defaultValue={p.nickname || ""}
                        onBlur={(e) => updatePersonText(p.id, "nickname", e.target.value)}
                        placeholder="e.g. johndoe"
                        style={{ padding: "0.5rem 0.625rem", borderRadius: "4px", border: "1px solid transparent", background: "transparent", color: "var(--color-text, #111827)", fontSize: "0.875rem", width: "100%", transition: "all 0.2s" }}
                        onFocus={(e) => { e.currentTarget.style.border = "1px solid var(--color-primary, #2563eb)"; e.currentTarget.style.background = "var(--color-bg, #ffffff)"; }}
                        onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) { e.currentTarget.style.border = "1px solid transparent"; e.currentTarget.style.background = "transparent"; } }}
                        onMouseEnter={(e) => { if (document.activeElement !== e.currentTarget) { e.currentTarget.style.border = "1px solid var(--color-border, #d1d5db)"; e.currentTarget.style.background = "var(--color-bg, #ffffff)"; } }}
                      />
                    </td>
                    <td style={{ position: "sticky", left: "300px", zIndex: 2, background: "var(--color-bg-elevated, #ffffff)", padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", verticalAlign: "middle", minWidth: "200px", width: "200px" }}>
                      <input
                        type="text"
                        defaultValue={p.email || ""}
                        onBlur={(e) => updatePersonText(p.id, "email", e.target.value)}
                        placeholder="e.g. name@company.com"
                        style={{ padding: "0.5rem 0.625rem", borderRadius: "4px", border: "1px solid transparent", background: "transparent", color: "var(--color-text, #111827)", width: "100%", fontSize: "0.875rem", transition: "all 0.2s" }}
                        onFocus={(e) => { e.currentTarget.style.border = "1px solid var(--color-primary, #2563eb)"; e.currentTarget.style.background = "var(--color-bg, #ffffff)"; }}
                        onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) { e.currentTarget.style.border = "1px solid transparent"; e.currentTarget.style.background = "transparent"; } }}
                        onMouseEnter={(e) => { if (document.activeElement !== e.currentTarget) { e.currentTarget.style.border = "1px solid var(--color-border, #d1d5db)"; e.currentTarget.style.background = "var(--color-bg, #ffffff)"; } }}
                      />
                    </td>
                    <td style={{ position: "sticky", left: "500px", zIndex: 2, background: "var(--color-bg-elevated, #ffffff)", padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", verticalAlign: "middle", minWidth: "250px", width: "250px", boxShadow: "3px 0 5px -2px rgba(0, 0, 0, 0.12)" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                        {p.is_abaper && <span style={{ padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.65rem", fontWeight: "600", backgroundColor: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd" }}>ABAPer</span>}
                        {p.is_tester && <span style={{ padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.65rem", fontWeight: "600", backgroundColor: "#f3e8ff", color: "#7e22ce", border: "1px solid #e9d5ff" }}>Functional</span>}
                        {p.is_evaluator && <span style={{ padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.65rem", fontWeight: "600", backgroundColor: "#ffedd5", color: "#c2410c", border: "1px solid #fed7aa" }}>Leader</span>}
                        {p.is_approver && <span style={{ padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.65rem", fontWeight: "600", backgroundColor: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" }}>Manager</span>}
                        {p.is_transporter && <span style={{ padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.65rem", fontWeight: "600", backgroundColor: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" }}>Basis</span>}
                        {(!p.is_abaper && !p.is_tester && !p.is_evaluator && !p.is_approver && !p.is_transporter) && <span style={{ color: "var(--color-text-muted, #9ca3af)", fontSize: "0.75rem", fontStyle: "italic" }}>-</span>}
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", textAlign: "center" }}>
                      <input type="checkbox" checked={p.is_active} onChange={(e) => togglePersonFlag(p.id, "is_active", e.target.checked)} style={{ cursor: "pointer", width: "1.1rem", height: "1.1rem", accentColor: "var(--color-primary, #2563eb)" }} />
                    </td>
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", textAlign: "center" }}>
                      <input type="checkbox" checked={p.is_requester} onChange={(e) => togglePersonFlag(p.id, "is_requester", e.target.checked)} style={{ cursor: "pointer", width: "1.1rem", height: "1.1rem", accentColor: "var(--color-primary, #2563eb)" }} />
                    </td>
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", textAlign: "center" }}>
                      <input type="checkbox" checked={p.is_abaper} onChange={(e) => togglePersonFlag(p.id, "is_abaper", e.target.checked)} style={{ cursor: "pointer", width: "1.1rem", height: "1.1rem", accentColor: "var(--color-primary, #2563eb)" }} />
                    </td>
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", textAlign: "center" }}>
                      <input type="checkbox" checked={p.is_tester} onChange={(e) => togglePersonFlag(p.id, "is_tester", e.target.checked)} style={{ cursor: "pointer", width: "1.1rem", height: "1.1rem", accentColor: "var(--color-primary, #2563eb)" }} />
                    </td>
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", textAlign: "center" }}>
                      <input type="checkbox" checked={p.is_evaluator} onChange={(e) => togglePersonFlag(p.id, "is_evaluator", e.target.checked)} style={{ cursor: "pointer", width: "1.1rem", height: "1.1rem", accentColor: "var(--color-primary, #2563eb)" }} />
                    </td>
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", textAlign: "center" }}>
                      <input type="checkbox" checked={p.is_approver} onChange={(e) => togglePersonFlag(p.id, "is_approver", e.target.checked)} style={{ cursor: "pointer", width: "1.1rem", height: "1.1rem", accentColor: "var(--color-primary, #2563eb)" }} />
                    </td>
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", textAlign: "center" }}>
                      <input type="checkbox" checked={p.is_transporter} onChange={(e) => togglePersonFlag(p.id, "is_transporter", e.target.checked)} style={{ cursor: "pointer", width: "1.1rem", height: "1.1rem", accentColor: "var(--color-primary, #2563eb)" }} />
                    </td>
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", textAlign: "center" }}>
                      <button onClick={() => setDeleteConfirmPerson(p)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted, #9ca3af)", padding: "0.25rem", transition: "color 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"} onMouseLeave={(e) => e.currentTarget.style.color = "var(--color-text-muted, #9ca3af)"} title="Delete Person">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {activeTab === "group_emails" && (
        <div className="group-emails-tab">
          <div style={{ background: "var(--color-bg-elevated, #ffffff)", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--color-border, #e5e7eb)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "1.25rem", color: "var(--color-text-heading, #111827)" }}>Monitored Group Emails</h3>
                <p style={{ color: "var(--color-text-muted, #6b7280)", margin: 0, fontSize: "0.875rem" }}>Maintain group mailboxes monitored by Outlook integration for AI context retrieval.</p>
              </div>
              <button
                onClick={() => setShowAddGroupModal(true)}
                disabled={saving}
                style={{ padding: "0.625rem 1.25rem", borderRadius: "6px", background: "var(--color-primary, #0f766e)", color: "white", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "0.875rem", whiteSpace: "nowrap" }}
              >
                + Add Group Email
              </button>
            </div>

            <div style={{ overflowX: "auto", border: "1px solid var(--color-border, #e5e7eb)", borderRadius: "6px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
                <thead style={{ background: "var(--color-bg-subtle, #f9fafb)" }}>
                  <tr>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase" }}>Group Email Address</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase" }}>Name / Description</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", textAlign: "center" }}>Active</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", textAlign: "center" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {groupEmails.map((g) => (
                    <tr key={g.id}>
                      <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", fontWeight: "500" }}>{g.email_address}</td>
                      <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)" }}>{g.name || "-"}</td>
                      <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", textAlign: "center" }}>
                        <input type="checkbox" checked={g.is_active} onChange={(e) => toggleGroupEmailActive(g.id, e.target.checked)} style={{ cursor: "pointer", width: "1.1rem", height: "1.1rem", accentColor: "var(--color-primary, #2563eb)" }} />
                      </td>
                      <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", textAlign: "center" }}>
                        <button onClick={() => setDeleteConfirmGroup(g)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted, #9ca3af)", padding: "0.25rem" }} title="Delete Group Email">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {groupEmails.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-muted, #6b7280)" }}>No group emails added yet. Click "+ Add Group Email" to add one.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "sap_systems" && (
        <div className="sap-systems-tab" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ background: "var(--color-bg-elevated, #ffffff)", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--color-border, #e5e7eb)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "1.25rem", color: "var(--color-text-heading, #111827)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Server size={20} style={{ color: "var(--color-primary, #0f766e)" }} /> Target Systems &amp; SAP Connections
                </h3>
                <p style={{ color: "var(--color-text-muted, #6b7280)", margin: 0, fontSize: "0.875rem" }}>
                  Maintain target system codes, server hosts, system numbers, clients, and RFC credentials for SAP transports.
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <button
                  onClick={() => {
                    resetServerForm();
                    setEditingServer(null);
                    setShowAddServerModal(true);
                  }}
                  disabled={saving}
                  style={{ padding: "0.625rem 1.25rem", borderRadius: "6px", background: "var(--color-primary, #0f766e)", color: "white", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "0.875rem", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <Plus size={16} /> Add Target System
                </button>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead style={{ background: "var(--color-bg-subtle, #f9fafb)" }}>
                  <tr>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase" }}>System Code</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase" }}>Server Name</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase" }}>Environment</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase" }}>Host &amp; Connection</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase" }}>RFC User</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", textAlign: "center" }}>Active</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", textAlign: "center" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sapSystems.map((sys) => {
                    const envColor = sys.environment === "Production" ? { bg: "#fee2e2", color: "#991b1b" } : sys.environment === "QA" ? { bg: "#fef3c7", color: "#92400e" } : sys.environment === "Sandbox" ? { bg: "#e0f2fe", color: "#075985" } : { bg: "#ccfbf1", color: "#0f766e" };
                    return (
                      <tr key={sys.id}>
                        <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)" }}>
                          <span style={{ fontWeight: "700", fontFamily: "monospace", fontSize: "0.85rem", background: "var(--color-bg-subtle, #f1f5f9)", padding: "3px 8px", borderRadius: "6px", border: "1px solid var(--color-border, #cbd5e1)" }}>
                            {sys.code}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", fontWeight: "600" }}>
                          {sys.description || sys.code}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)" }}>
                          <span style={{ background: envColor.bg, color: envColor.color, padding: "3px 10px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase" }}>
                            {sys.environment || "Development"}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", color: "var(--color-text-muted, #475569)", fontSize: "0.825rem" }}>
                          <div><strong>Host:</strong> {sys.host || "192.168.2.8"}</div>
                          <div style={{ color: "#64748b", fontSize: "0.775rem" }}>Sys #: {sys.system_number || "00"} · Client: {sys.client || "130"}</div>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", fontFamily: "monospace", fontSize: "0.85rem" }}>
                          {sys.rfc_user || "TRSTDEV"}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", textAlign: "center" }}>
                          <input type="checkbox" checked={sys.is_active} onChange={(e) => toggleServerActive(sys.id, e.target.checked)} style={{ cursor: "pointer", width: "1.1rem", height: "1.1rem", accentColor: "var(--color-primary, #0f766e)" }} />
                        </td>
                        <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", textAlign: "center" }}>
                          <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                            <button onClick={() => openEditServerModal(sys)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-primary, #0f766e)", padding: "0.25rem" }} title="Edit Server Configuration">
                              <Edit2 size={16} />
                            </button>
                            <button onClick={() => setDeleteConfirmServer(sys)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted, #9ca3af)", padding: "0.25rem" }} title="Delete Target System">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {sapSystems.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-muted, #6b7280)" }}>No Target Systems configured yet. Click "+ Add Target System" to create one.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Add Server Modal (adapted to project theme system) */}
      {showAddServerModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, padding: "16px" }}>
          <div style={{ background: "var(--color-bg-elevated, #ffffff)", color: "var(--color-text, #1f2937)", width: "min(100%, 520px)", borderRadius: "12px", border: "1px solid var(--color-border, #e2e8f0)", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--color-border, #e5e7eb)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--color-bg-subtle, #f9fafb)" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: "700", color: "var(--color-text-heading, #111827)", display: "flex", alignItems: "center", gap: "8px" }}>
                <Server size={18} style={{ color: "var(--color-primary, #0f766e)" }} />
                {editingServer ? "Edit Server" : "Add Target System"}
              </h3>
              <button onClick={() => { setShowAddServerModal(false); setEditingServer(null); resetServerForm(); }} style={{ background: "transparent", border: "none", color: "var(--color-text-muted, #9ca3af)", cursor: "pointer", padding: "4px", borderRadius: "6px" }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveServer} style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto", maxHeight: "calc(85vh - 120px)" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-muted, #64748b)", marginBottom: "6px" }}>
                  SERVER NAME
                </label>
                <input
                  type="text"
                  required
                  value={serverFormData.description || ""}
                  onChange={(e) => setServerFormData({ ...serverFormData, description: e.target.value })}
                  placeholder="e.g. Development AIX or Sandbox New Company"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "6px", background: "var(--color-bg, #ffffff)", border: "1px solid var(--color-border, #d1d5db)", color: "var(--color-text, #1f2937)", fontSize: "0.875rem" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-muted, #64748b)", marginBottom: "6px" }}>
                  TARGET SYSTEM CODE (SYSTEM ID)
                </label>
                <input
                  type="text"
                  required
                  value={serverFormData.code || ""}
                  onChange={(e) => setServerFormData({ ...serverFormData, code: e.target.value })}
                  placeholder="e.g. DEV_NC, DEV_AIX, TR2, QA, PRD"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "6px", background: "var(--color-bg, #ffffff)", border: "1px solid var(--color-border, #d1d5db)", color: "var(--color-text, #1f2937)", fontSize: "0.875rem" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-muted, #64748b)", marginBottom: "6px" }}>
                  ENVIRONMENT
                </label>
                <select
                  value={serverFormData.environment || "Development"}
                  onChange={(e) => setServerFormData({ ...serverFormData, environment: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "6px", background: "var(--color-bg, #ffffff)", border: "1px solid var(--color-border, #d1d5db)", color: "var(--color-text, #1f2937)", fontSize: "0.875rem" }}
                >
                  <option value="Sandbox">Sandbox</option>
                  <option value="Development">Development</option>
                  <option value="QA">QA</option>
                  <option value="Production">Production</option>
                </select>
                <small style={{ color: "var(--color-text-muted, #6b7280)", fontSize: "0.75rem", display: "block", marginTop: "4px" }}>
                  Sandbox servers are unlimited. Development, QA, and Production each allow custom CTS target routes.
                </small>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-muted, #64748b)", marginBottom: "8px" }}>
                  ALLOW MULTIPLE LOGON
                </label>
                <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.85rem", color: "var(--color-text, #374151)" }}>
                    <input
                      type="radio"
                      name="allow_multiple_logon"
                      checked={serverFormData.allow_multiple_logon === true}
                      onChange={() => setServerFormData({ ...serverFormData, allow_multiple_logon: true })}
                      style={{ accentColor: "var(--color-primary, #0f766e)" }}
                    />
                    YES
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.85rem", color: "var(--color-text, #374151)" }}>
                    <input
                      type="radio"
                      name="allow_multiple_logon"
                      checked={serverFormData.allow_multiple_logon === false}
                      onChange={() => setServerFormData({ ...serverFormData, allow_multiple_logon: false })}
                      style={{ accentColor: "var(--color-primary, #0f766e)" }}
                    />
                    NO (ENFORCE AUDIT)
                  </label>
                </div>
                <small style={{ color: "var(--color-text-muted, #6b7280)", fontSize: "0.75rem", display: "block", marginTop: "4px" }}>
                  If enabled, bypasses SAP multiple logon checks during deployment or compare operations.
                </small>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-muted, #64748b)", marginBottom: "6px" }}>
                  HOST
                </label>
                <input
                  type="text"
                  value={serverFormData.host || ""}
                  onChange={(e) => setServerFormData({ ...serverFormData, host: e.target.value })}
                  placeholder="e.g. 192.168.2.8 or 192.168.6.243"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "6px", background: "var(--color-bg, #ffffff)", border: "1px solid var(--color-border, #d1d5db)", color: "var(--color-text, #1f2937)", fontSize: "0.875rem" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-muted, #64748b)", marginBottom: "6px" }}>
                    SYSTEM NUMBER
                  </label>
                  <input
                    type="text"
                    value={serverFormData.system_number || "00"}
                    onChange={(e) => setServerFormData({ ...serverFormData, system_number: e.target.value })}
                    placeholder="00"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "6px", background: "var(--color-bg, #ffffff)", border: "1px solid var(--color-border, #d1d5db)", color: "var(--color-text, #1f2937)", fontSize: "0.875rem" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-muted, #64748b)", marginBottom: "6px" }}>
                    CLIENT
                  </label>
                  <input
                    type="text"
                    value={serverFormData.client || "130"}
                    onChange={(e) => setServerFormData({ ...serverFormData, client: e.target.value })}
                    placeholder="130"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "6px", background: "var(--color-bg, #ffffff)", border: "1px solid var(--color-border, #d1d5db)", color: "var(--color-text, #1f2937)", fontSize: "0.875rem" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-muted, #64748b)", marginBottom: "6px" }}>
                  RFC USER
                </label>
                <input
                  type="text"
                  value={serverFormData.rfc_user || ""}
                  onChange={(e) => setServerFormData({ ...serverFormData, rfc_user: e.target.value })}
                  placeholder="e.g. TRSTDEV"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "6px", background: "var(--color-bg, #ffffff)", border: "1px solid var(--color-border, #d1d5db)", color: "var(--color-text, #1f2937)", fontSize: "0.875rem" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-muted, #64748b)", marginBottom: "6px" }}>
                  RFC PASSWORD {editingServer ? "(leave blank to keep)" : ""}
                </label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={serverFormData.rfc_password || ""}
                    onChange={(e) => setServerFormData({ ...serverFormData, rfc_password: e.target.value })}
                    placeholder={showPassword ? "Enter RFC Password" : "••••••••"}
                    style={{ width: "100%", padding: "9px 12px", paddingRight: "42px", borderRadius: "6px", background: "var(--color-bg, #ffffff)", border: "1px solid var(--color-border, #d1d5db)", color: "var(--color-text, #1f2937)", fontSize: "0.875rem" }}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowPassword((prev) => !prev);
                    }}
                    title={showPassword ? "Hide password" : "Show password"}
                    style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", outline: "none", color: showPassword ? "var(--color-primary, #0f766e)" : "var(--color-text-muted, #9ca3af)", cursor: "pointer", padding: "6px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px" }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <input
                  type="checkbox"
                  id="server_is_active"
                  checked={serverFormData.is_active !== false}
                  onChange={(e) => setServerFormData({ ...serverFormData, is_active: e.target.checked })}
                  style={{ accentColor: "var(--color-primary, #0f766e)", width: "16px", height: "16px", cursor: "pointer" }}
                />
                <label htmlFor="server_is_active" style={{ fontSize: "0.85rem", color: "var(--color-text, #374151)", cursor: "pointer", fontWeight: "600" }}>
                  Active (Available in Target System picker dropdown)
                </label>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "6px",
                      background: "var(--color-primary, #0f766e)",
                      color: "#ffffff",
                      border: "none",
                      fontWeight: "600",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px"
                    }}
                  >
                    {saving ? <Loader2 className="spinner" size={16} /> : <Save size={16} />}
                    {saving ? "Saving..." : "Save Changes"}
                  </button>

                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingConnection}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "6px",
                      background: "var(--color-bg-subtle, #f1f5f9)",
                      color: "var(--color-text, #374151)",
                      border: "1px solid var(--color-border, #cbd5e1)",
                      fontWeight: "600",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px"
                    }}
                  >
                    {testingConnection ? <Loader2 className="spinner" size={16} /> : <Activity size={16} />}
                    {testingConnection ? "Testing..." : "Test Connection"}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => { setShowAddServerModal(false); setEditingServer(null); resetServerForm(); }}
                  style={{
                    padding: "9px",
                    borderRadius: "6px",
                    background: "transparent",
                    color: "var(--color-text-muted, #6b7280)",
                    border: "1px solid var(--color-border, #d1d5db)",
                    fontWeight: "500",
                    fontSize: "0.85rem",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Target System Delete Confirmation Modal */}
      {deleteConfirmServer && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}>
          <div style={{ background: "var(--color-bg-elevated, #ffffff)", width: "min(100%, 420px)", borderRadius: "12px", border: "1px solid var(--color-border, #e5e7eb)", padding: "1.5rem", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem", color: "#dc2626", fontSize: "1.1rem" }}>Delete Target System?</h3>
            <p style={{ color: "var(--color-text-muted, #4b5563)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
              Are you sure you want to delete Target System <strong>{deleteConfirmServer.code}</strong> ({deleteConfirmServer.description})?
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteConfirmServer(null)} style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #374151)", cursor: "pointer", fontWeight: "500", fontSize: "0.875rem" }}>
                Cancel
              </button>
              <button onClick={() => handleDeleteServer(deleteConfirmServer.id)} disabled={saving} style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: "#dc2626", color: "white", cursor: "pointer", fontWeight: "600", fontSize: "0.875rem" }}>
                {saving ? "Deleting..." : "Delete System"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "general_settings" && (
        <div className="general-settings-tab" style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "100%" }}>
          <div style={{ background: "var(--color-bg-elevated, #ffffff)", padding: "2rem", borderRadius: "8px", border: "1px solid var(--color-border, #e5e7eb)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "1.25rem", color: "var(--color-text-heading, #111827)" }}>General Settings</h3>
            <p style={{ color: "var(--color-text-muted, #6b7280)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
              Configure API keys, model selections, and internal mail server connection endpoints.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div>
                <h4 style={{ margin: "0 0 1rem 0", fontSize: "1rem", color: "var(--color-text-heading, #111827)" }}>OpenRouter AI API Configuration</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600", color: "var(--color-text, #374151)", fontSize: "0.875rem" }}>
                      OpenRouter API Key
                    </label>
                    <input
                      type="password"
                      value={settings.openrouter_api_key}
                      onChange={(e) => setSettings({ ...settings, openrouter_api_key: e.target.value })}
                      placeholder="sk-or-v1-..."
                      style={{ width: "100%", padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #1f2937)", fontSize: "0.875rem" }}
                    />
                    <small style={{ color: "var(--color-text-muted, #6b7280)", display: "block", marginTop: "0.25rem" }}>API key from OpenRouter.ai for auto generating Problem & Impact Analysis.</small>
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600", color: "var(--color-text, #374151)", fontSize: "0.875rem" }}>
                      OpenRouter Model
                    </label>
                    <input
                      type="text"
                      value={settings.openrouter_model}
                      onChange={(e) => setSettings({ ...settings, openrouter_model: e.target.value })}
                      placeholder="openrouter/auto"
                      style={{ width: "100%", padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #1f2937)", fontSize: "0.875rem" }}
                    />
                    <small style={{ color: "var(--color-text-muted, #6b7280)", display: "block", marginTop: "0.25rem" }}>Default: <code>openrouter/auto</code> (or <code>anthropic/claude-3.5-sonnet</code>, <code>google/gemini-2.5-flash</code>, etc.)</small>
                  </div>
                </div>
              </div>

              {/* Document & File Naming Patterns */}
              <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--color-border, #e5e7eb)" }}>
                <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem", color: "var(--color-text-heading, #111827)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <FileCode2 size={18} style={{ color: "var(--color-primary, #0f766e)" }} /> Document &amp; File Naming Patterns
                </h4>
                <p style={{ color: "var(--color-text-muted, #6b7280)", margin: "0 0 1.25rem 0", fontSize: "0.85rem" }}>
                  Configure dynamic filename formats for CR Transport Word documents. Click any available token chip to insert it into the active pattern field.
                </p>

                {/* Token Chips */}
                <div style={{ background: "var(--color-bg-subtle, #f8fafc)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--color-border, #e2e8f0)", marginBottom: "1.25rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", color: "var(--color-text-muted, #64748b)", display: "block", marginBottom: "0.5rem" }}>
                    Available Dynamic Tokens (Click chip to insert into active field):
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {["{ISSUE_KEY}", "{CR_SAP}", "{GLPI_NO}", "{PROJECT_KEY}", "{PROJECT_NAME}", "{REQUESTER}", "{ABAPER}", "{DATE}", "{ENV}"].map((token) => (
                      <button
                        key={token}
                        type="button"
                        onClick={() => {
                          const key = activePatternField === "single" ? "filename_pattern_cr_transport" : "filename_pattern_project_cr_transport";
                          const currentVal = settings[key] || "";
                          setSettings({ ...settings, [key]: currentVal ? `${currentVal} ${token}` : token });
                        }}
                        style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid var(--color-border, #cbd5e1)", background: "var(--color-bg-elevated, #ffffff)", color: "var(--color-primary, #0f766e)", fontFamily: "monospace", fontSize: "0.8rem", fontWeight: "600", cursor: "pointer", transition: "all 0.15s" }}
                        title={`Insert ${token}`}
                      >
                        + {token}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  {/* Single Issue Pattern */}
                  <div
                    style={{ padding: "1rem", borderRadius: "8px", border: activePatternField === "single" ? "2px solid var(--color-primary, #0f766e)" : "1px solid var(--color-border, #e2e8f0)", background: "var(--color-bg-elevated, #ffffff)", transition: "all 0.2s" }}
                    onClick={() => setActivePatternField("single")}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <label style={{ fontWeight: "600", color: "var(--color-text-heading, #1e293b)", fontSize: "0.875rem" }}>
                        Single Issue CR Transport Filename
                      </label>
                      <span style={{ fontSize: "0.75rem", background: "var(--color-bg-subtle, #f1f5f9)", padding: "2px 8px", borderRadius: "4px", color: "var(--color-text-muted, #64748b)" }}>
                        {activePatternField === "single" ? "● Active Field" : "Click to select"}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={settings.filename_pattern_cr_transport || ""}
                      onChange={(e) => setSettings({ ...settings, filename_pattern_cr_transport: e.target.value })}
                      onFocus={() => setActivePatternField("single")}
                      placeholder="e.g. CR Transport {ISSUE_KEY}.docx"
                      style={{ width: "100%", padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #1f2937)", fontSize: "0.875rem", fontFamily: "monospace" }}
                    />
                    {/* Live Preview Box */}
                    <div style={{ marginTop: "0.75rem", padding: "8px 12px", background: "var(--color-bg-subtle, #f8fafc)", borderRadius: "6px", border: "1px border-dashed var(--color-border, #cbd5e1)", fontSize: "0.825rem", color: "var(--color-text, #334155)" }}>
                      <strong style={{ color: "var(--color-primary, #0f766e)" }}>👁️ Live Preview: </strong>
                      <span style={{ fontFamily: "monospace", fontWeight: "600" }}>{renderPatternPreview(settings.filename_pattern_cr_transport || "", false)}</span>
                    </div>
                  </div>

                  {/* Project Group Pattern */}
                  <div
                    style={{ padding: "1rem", borderRadius: "8px", border: activePatternField === "project" ? "2px solid var(--color-primary, #0f766e)" : "1px solid var(--color-border, #e2e8f0)", background: "var(--color-bg-elevated, #ffffff)", transition: "all 0.2s" }}
                    onClick={() => setActivePatternField("project")}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <label style={{ fontWeight: "600", color: "var(--color-text-heading, #1e293b)", fontSize: "0.875rem" }}>
                        Project Group CR Transport Filename
                      </label>
                      <span style={{ fontSize: "0.75rem", background: "var(--color-bg-subtle, #f1f5f9)", padding: "2px 8px", borderRadius: "4px", color: "var(--color-text-muted, #64748b)" }}>
                        {activePatternField === "project" ? "● Active Field" : "Click to select"}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={settings.filename_pattern_project_cr_transport || ""}
                      onChange={(e) => setSettings({ ...settings, filename_pattern_project_cr_transport: e.target.value })}
                      onFocus={() => setActivePatternField("project")}
                      placeholder="e.g. CR Transport Project {PROJECT_KEY}.docx"
                      style={{ width: "100%", padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #1f2937)", fontSize: "0.875rem", fontFamily: "monospace" }}
                    />
                    {/* Live Preview Box */}
                    <div style={{ marginTop: "0.75rem", padding: "8px 12px", background: "var(--color-bg-subtle, #f8fafc)", borderRadius: "6px", border: "1px border-dashed var(--color-border, #cbd5e1)", fontSize: "0.825rem", color: "var(--color-text, #334155)" }}>
                      <strong style={{ color: "var(--color-primary, #0f766e)" }}>👁️ Live Preview: </strong>
                      <span style={{ fontFamily: "monospace", fontWeight: "600" }}>{renderPatternPreview(settings.filename_pattern_project_cr_transport || "", true)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Custom GLPI & Email Template Editor Panel */}
              <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--color-border, #e5e7eb)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "1rem", color: "var(--color-text-heading, #111827)", display: "flex", alignItems: "center", gap: "8px" }}>
                      <FileText size={18} style={{ color: "var(--color-primary, #0f766e)" }} /> GLPI Ticket &amp; Email Template Editor
                    </h4>
                    <p style={{ color: "var(--color-text-muted, #6b7280)", margin: "4px 0 0 0", fontSize: "0.85rem" }}>
                      Customize the exact template body text and rich formatting used when generating GLPI tickets or email notifications.
                    </p>
                  </div>

                  {/* Tab Switcher: GLPI vs Email */}
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: "4px", background: "var(--color-bg-subtle, #f1f5f9)", padding: "4px", borderRadius: "8px", border: "1px solid var(--color-border, #cbd5e1)" }}>
                      <button
                        type="button"
                        onClick={() => setActiveTemplateTab("glpi")}
                        style={{ padding: "6px 14px", borderRadius: "6px", border: "none", background: activeTemplateTab === "glpi" ? "var(--color-primary, #0f766e)" : "transparent", color: activeTemplateTab === "glpi" ? "#ffffff" : "var(--color-text-muted)", fontWeight: activeTemplateTab === "glpi" ? "700" : "500", fontSize: "0.85rem", cursor: "pointer" }}
                      >
                        GLPI Ticket Template
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTemplateTab("email")}
                        style={{ padding: "6px 14px", borderRadius: "6px", border: "none", background: activeTemplateTab === "email" ? "var(--color-primary, #0f766e)" : "transparent", color: activeTemplateTab === "email" ? "#ffffff" : "var(--color-text-muted)", fontWeight: activeTemplateTab === "email" ? "700" : "500", fontSize: "0.85rem", cursor: "pointer" }}
                      >
                        Email Template
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={resetTemplateToDefault}
                      style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--color-border, #cbd5e1)", background: "var(--color-bg-elevated, #ffffff)", color: "var(--color-text, #475569)", fontSize: "0.8rem", fontWeight: "600", cursor: "pointer", transition: "all 0.15s" }}
                      title="Reset active template to standard default format"
                    >
                      ↺ Reset to Default
                    </button>
                  </div>
                </div>

                {/* User-Friendly Formatting Toolbar */}
                <div className="template-editor-toolbar">
                  <div className="toolbar-btn-group">
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => applyToolbarFormatting("**", "**")}
                      style={{ fontWeight: "800" }}
                      title="Bold (**text**)"
                    >
                      B
                    </button>
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => applyToolbarFormatting("*", "*")}
                      style={{ fontStyle: "italic" }}
                      title="Italic (*text*)"
                    >
                      I
                    </button>
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => applyToolbarFormatting("<u>", "</u>")}
                      style={{ textDecoration: "underline" }}
                      title="Underline (<u>text</u>)"
                    >
                      U
                    </button>
                  </div>

                  <div className="toolbar-btn-group">
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => applyToolbarFormatting("### ")}
                      style={{ fontWeight: "700" }}
                      title="Subheading 3 (### Heading)"
                    >
                      H3
                    </button>
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => applyToolbarFormatting("## ")}
                      style={{ fontWeight: "700" }}
                      title="Subheading 2 (## Heading)"
                    >
                      H2
                    </button>
                  </div>

                  <div className="toolbar-btn-group">
                    <button
                      type="button"
                      className="toolbar-btn toolbar-btn-code"
                      onClick={() => applyToolbarFormatting("`", "`")}
                      title="Inline Code (`code`)"
                    >
                      Code
                    </button>
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => applyToolbarFormatting("- ")}
                      title="List Item (- Item)"
                    >
                      • List
                    </button>
                  </div>

                  {/* Dynamic Tokens */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {["{ISSUE_KEY}", "{ISSUE_NAME}", "{CR_SAP}", "{CR_DESCRIPTION}", "{OBJECT_LIST}", "{GLPI_NO}", "{GLPI_LINK}", "{FULLNAME}", "{USER_NICKNAME}", "{USER_DEPARTMENT}", "{REQUESTER}", "{ABAPER}"].map((token) => (
                      <button
                        key={token}
                        type="button"
                        className="token-chip-btn"
                        onClick={() => insertTemplateToken(token)}
                        title={`Insert token ${token}`}
                      >
                        + {token}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selection-Aware Textarea Editor */}
                {activeTemplateTab === "glpi" ? (
                  <textarea
                    ref={glpiTextareaRef}
                    className="template-editor-textarea"
                    value={settings.template_body_glpi !== undefined ? settings.template_body_glpi : DEFAULT_GLPI_TEMPLATE}
                    onChange={(e) => setSettings({ ...settings, template_body_glpi: e.target.value })}
                    rows={12}
                    placeholder="Compose custom GLPI ticket template format..."
                  />
                ) : (
                  <textarea
                    ref={emailTextareaRef}
                    className="template-editor-textarea"
                    value={settings.template_body_email !== undefined ? settings.template_body_email : DEFAULT_EMAIL_TEMPLATE}
                    onChange={(e) => setSettings({ ...settings, template_body_email: e.target.value })}
                    rows={12}
                    placeholder="Compose custom Email template format..."
                  />
                )}
              </div>
            </div>

            <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--color-border, #e5e7eb)", display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={saveSettings}
                disabled={saving}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.625rem 1.25rem", borderRadius: "6px", background: "var(--color-primary, #2563eb)", color: "white", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "0.875rem", transition: "all 0.2s" }}
              >
                {saving ? <Loader2 className="spinner" size={16} /> : <Save size={16} />}
                {saving ? "Saving Changes..." : "Save Settings"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "ai_instructions" && (
        <div className="settings-tab" style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "100%" }}>
          <div style={{ background: "var(--color-bg-elevated, #ffffff)", padding: "2rem", borderRadius: "8px", border: "1px solid var(--color-border, #e5e7eb)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "1.25rem", color: "var(--color-text-heading, #111827)" }}>System Prompts &amp; AI Instructions</h3>
            <p style={{ color: "var(--color-text-muted, #6b7280)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
              Configure the underlying instructions used by the AI assistant when generating content for GLPI and Problem/Impact Analysis.
            </p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600", color: "var(--color-text, #374151)", fontSize: "0.875rem" }}>
                  CR dan GLPI Generation Guidelines
                </label>
                <textarea
                  value={settings.ai_instruction_glpi}
                  onChange={(e) => setSettings({ ...settings, ai_instruction_glpi: e.target.value })}
                  placeholder="e.g., Always use professional tone. Include standard disclaimer at the bottom..."
                  style={{ width: "100%", minHeight: "180px", padding: "0.875rem 1rem", borderRadius: "8px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #1f2937)", resize: "vertical", fontFamily: "inherit", fontSize: "0.875rem", lineHeight: "1.6", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)" }}
                />
              </div>
              
              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600", color: "var(--color-text, #374151)", fontSize: "0.875rem" }}>
                  Issue Name Instruction / Guidelines
                </label>
                <textarea
                  value={settings.ai_instruction_issue_name}
                  onChange={(e) => setSettings({ ...settings, ai_instruction_issue_name: e.target.value })}
                  placeholder="e.g., Keep issue name concise (max 60 chars). Include module prefix like [FI] or [COA] if applicable..."
                  style={{ width: "100%", minHeight: "120px", padding: "0.875rem 1rem", borderRadius: "8px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #1f2937)", resize: "vertical", fontFamily: "inherit", fontSize: "0.875rem", lineHeight: "1.6", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600", color: "var(--color-text, #374151)", fontSize: "0.875rem" }}>
                  Problem Analysis Instruction / Guidelines
                </label>
                <textarea
                  value={settings.ai_instruction_problem}
                  onChange={(e) => setSettings({ ...settings, ai_instruction_problem: e.target.value })}
                  placeholder="e.g., Focus on technical root cause, error codes, affected SAP T-code or program name, and steps to reproduce..."
                  style={{ width: "100%", minHeight: "150px", padding: "0.875rem 1rem", borderRadius: "8px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #1f2937)", resize: "vertical", fontFamily: "inherit", fontSize: "0.875rem", lineHeight: "1.6", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600", color: "var(--color-text, #374151)", fontSize: "0.875rem" }}>
                  Impact Analysis Instruction / Guidelines
                </label>
                <textarea
                  value={settings.ai_instruction_impact}
                  onChange={(e) => setSettings({ ...settings, ai_instruction_impact: e.target.value })}
                  placeholder="e.g., Describe operational impact on business operations, affected plant/department, urgency level, and financial or compliance risks..."
                  style={{ width: "100%", minHeight: "150px", padding: "0.875rem 1rem", borderRadius: "8px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #1f2937)", resize: "vertical", fontFamily: "inherit", fontSize: "0.875rem", lineHeight: "1.6", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)" }}
                />
              </div>
            </div>

            <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--color-border, #e5e7eb)", display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={saveSettings}
                disabled={saving}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.625rem 1.25rem", borderRadius: "6px", background: "var(--color-primary, #2563eb)", color: "white", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "0.875rem", transition: "all 0.2s" }}
              >
                {saving ? <Loader2 className="spinner" size={16} /> : <Save size={16} />}
                {saving ? "Saving Changes..." : "Save Settings"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "appearance" && (
        <div className="settings-tab" style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "100%", paddingBottom: "5rem" }}>
          {!isAdmin ? (
            <div style={{ padding: "0.875rem 1.25rem", borderRadius: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "8px" }}>
              <CheckCircle2 size={16} color="#16a34a" />
              <span><strong>Personal Preferences Mode:</strong> Changes made here are saved <strong>ONLY to your browser's Local Storage</strong> and will not alter database defaults or affect other users.</span>
            </div>
          ) : null}
          {/* Section 1: Font Size Settings */}
          <div className="settings-card">
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "1.25rem", display: "flex", alignItems: "center", gap: "8px" }}>
                <Type size={20} color="#059669" /> Dynamic Application Font Size
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem" }}>
                Adjust the base font size for the entire application. Drag the slider to scale text smoothly across all pages and save as default.
              </p>
            </div>

            <div className="settings-card-row" style={{ display: "flex", alignItems: "center", gap: "1.5rem", padding: "1.25rem", borderRadius: "10px", marginBottom: "1.5rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: "600" }}>Smaller (12px)</span>
              <input
                type="range"
                min="12"
                max="18"
                step="1"
                value={settings.app_font_size || "14"}
                onChange={(e) => {
                  const newSet = { ...settings, app_font_size: e.target.value };
                  setSettings(newSet);
                  applyCustomFontSize(newSet, username);
                }}
                style={{ flex: 1, accentColor: "#059669", cursor: "pointer", height: "6px" }}
              />
              <span style={{ fontSize: "0.85rem", fontWeight: "600" }}>Larger (18px)</span>
              <span
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  background: "#059669",
                  color: "#ffffff",
                  fontWeight: "700",
                  fontSize: "0.9rem",
                  minWidth: "60px",
                  textAlign: "center"
                }}
              >
                {settings.app_font_size || "14"}px
              </span>
            </div>

            {/* Live Font Size Preview Box */}
            <div className="settings-card-row" style={{ padding: "1.25rem", borderRadius: "10px" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", marginBottom: "8px" }}>Live Text Scaling Preview</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <h4 style={{ margin: 0, fontSize: "1.15em" }}>Sample Page Header Title</h4>
                <p style={{ margin: 0, fontSize: "0.95em" }}>
                  This preview text, table headers, and form inputs scale dynamically as you slide the font size setting above. Current base font: {settings.app_font_size || "14"}px.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Status Tag Colors */}
          <div className="settings-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "1.25rem", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Palette size={20} color="#059669" /> Status Tag Colors & Badges
                </h3>
                <p style={{ margin: 0, fontSize: "0.875rem" }}>
                  Customize background, text, and border colors for status badges displayed across Dashboard, CR Transport, Issue Reports, and Project Reports.
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gap: "1.25rem" }}>
              {STATUS_COLOR_CONFIGS.map((cfg) => {
                const bgKey = `status_color_${cfg.key}_bg`;
                const txtKey = `status_color_${cfg.key}_text`;
                const bdrKey = `status_color_${cfg.key}_border`;

                const currentBg = settings[bgKey] || cfg.defaultBg;
                const currentText = settings[txtKey] || cfg.defaultText;
                const currentBorder = settings[bdrKey] || cfg.defaultBorder;

                const TAG_PRESETS = [
                  { name: "Amber", bg: "#fef3c7", text: "#d97706", border: "#fde68a" },
                  { name: "Emerald", bg: "#d1fae5", text: "#059669", border: "#a7f3d0" },
                  { name: "Blue", bg: "#dbeafe", text: "#2563eb", border: "#bfdbfe" },
                  { name: "Purple", bg: "#f3e8ff", text: "#7c3aed", border: "#ddd6fe" },
                  { name: "Rose", bg: "#ffe4e6", text: "#e11d48", border: "#fecdd3" },
                  { name: "Cyan", bg: "#cffafe", text: "#0891b2", border: "#a5f3fc" },
                  { name: "Slate", bg: "#f1f5f9", text: "#475569", border: "#cbd5e1" },
                  { name: "Orange", bg: "#ffedd5", text: "#ea580c", border: "#fed7aa" }
                ];

                return (
                  <div
                    key={cfg.key}
                    className="settings-card-row"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.875rem",
                      padding: "1.15rem 1.25rem",
                      borderRadius: "10px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                      <div>
                        <strong style={{ display: "block", fontSize: "0.925rem" }}>{cfg.label}</strong>
                        <small style={{ fontSize: "0.75rem", opacity: 0.7 }}>Category: <code>{cfg.key}</code></small>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "#64748b" }}>Live Preview:</span>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 12px",
                            borderRadius: "9999px",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            backgroundColor: currentBg,
                            color: currentText,
                            border: `1px solid ${currentBorder}`,
                            textTransform: "capitalize",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
                          }}
                        >
                          {cfg.key.replace(/_/g, " ")}
                        </span>
                      </div>
                    </div>

                    {/* Quick Preset Color Swatches */}
                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "600", marginBottom: "6px", color: "var(--color-text-muted, #64748b)" }}>
                        Quick Presets (Click to apply):
                      </label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {TAG_PRESETS.map((p) => {
                          const isSelected = currentBg.toLowerCase() === p.bg.toLowerCase();
                          return (
                            <button
                              key={p.name}
                              type="button"
                              onClick={() => {
                                const newSet = {
                                  ...settings,
                                  [bgKey]: p.bg,
                                  [txtKey]: p.text,
                                  [bdrKey]: p.border
                                };
                                setSettings(newSet);
                                applyCustomStatusColors(newSet, username);
                              }}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "4px 10px",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                fontWeight: isSelected ? "700" : "500",
                                backgroundColor: p.bg,
                                color: p.text,
                                border: isSelected ? `2px solid ${p.text}` : `1px solid ${p.border}`,
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                                transform: isSelected ? "scale(1.04)" : "scale(1)"
                              }}
                            >
                              <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: p.text, display: "inline-block" }} />
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Fine-Tuning Inputs */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", paddingTop: "6px", borderTop: "1px dashed var(--color-border, #e2e8f0)" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "600", marginBottom: "4px" }}>Background Hex</label>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input
                            type="color"
                            value={currentBg}
                            onChange={(e) => {
                              const newSet = { ...settings, [bgKey]: e.target.value };
                              setSettings(newSet);
                              applyCustomStatusColors(newSet, username);
                            }}
                            style={{ width: "32px", height: "32px", border: "none", borderRadius: "6px", cursor: "pointer" }}
                          />
                          <input
                            type="text"
                            value={currentBg}
                            onChange={(e) => {
                              const newSet = { ...settings, [bgKey]: e.target.value };
                              setSettings(newSet);
                              applyCustomStatusColors(newSet, username);
                            }}
                            style={{ width: "85px", padding: "4px 8px", fontSize: "0.8rem", borderRadius: "6px", textTransform: "uppercase" }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "600", marginBottom: "4px" }}>Text Color Hex</label>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input
                            type="color"
                            value={currentText}
                            onChange={(e) => {
                              const newSet = { ...settings, [txtKey]: e.target.value };
                              setSettings(newSet);
                              applyCustomStatusColors(newSet, username);
                            }}
                            style={{ width: "32px", height: "32px", border: "none", borderRadius: "6px", cursor: "pointer" }}
                          />
                          <input
                            type="text"
                            value={currentText}
                            onChange={(e) => {
                              const newSet = { ...settings, [txtKey]: e.target.value };
                              setSettings(newSet);
                              applyCustomStatusColors(newSet, username);
                            }}
                            style={{ width: "85px", padding: "4px 8px", fontSize: "0.8rem", borderRadius: "6px", textTransform: "uppercase" }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "600", marginBottom: "4px" }}>Border Color Hex</label>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input
                            type="color"
                            value={currentBorder}
                            onChange={(e) => {
                              const newSet = { ...settings, [bdrKey]: e.target.value };
                              setSettings(newSet);
                              applyCustomStatusColors(newSet, username);
                            }}
                            style={{ width: "32px", height: "32px", border: "none", borderRadius: "6px", cursor: "pointer" }}
                          />
                          <input
                            type="text"
                            value={currentBorder}
                            onChange={(e) => {
                              const newSet = { ...settings, [bdrKey]: e.target.value };
                              setSettings(newSet);
                              applyCustomStatusColors(newSet, username);
                            }}
                            style={{ width: "85px", padding: "4px 8px", fontSize: "0.8rem", borderRadius: "6px", textTransform: "uppercase" }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Issue Form Layout Preferences (Create vs Edit) */}
          <div className="settings-card">
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "1.25rem", display: "flex", alignItems: "center", gap: "8px" }}>
                <LayoutGrid size={20} color="#0f766e" /> Default Issue Form Layout Preferences
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem" }}>
                Configure separate default UI layouts for <strong>Create Issue</strong> and <strong>Edit/Change Issue</strong>. Each mode maintains its own independent layout preference in local storage.
              </p>
            </div>

            {/* Create Issue Layout Preference */}
            <div style={{ marginBottom: "1.75rem" }}>
              <h4 style={{ margin: "0 0 0.75rem 0", fontSize: "1rem", color: "#0f766e", display: "flex", alignItems: "center", gap: "6px" }}>
                ➕ Create Issue Default Layout
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
                {[
                  {
                    id: "quick_toggle",
                    title: "Quick Draft Toggle",
                    badge: "Best for Create",
                    desc: "Starts with 4 essential fields for 10-second draft creation with quick toggle to full form.",
                    icon: "⚡"
                  },
                  {
                    id: "tabs",
                    title: "Tab Lifecycle Stepper",
                    badge: "Structured",
                    desc: "Organizes fields into 4 sequential tabs (Basic, Team, SAP Transport, Timeline).",
                    icon: "📑"
                  },
                  {
                    id: "classic",
                    title: "Classic Continuous Page",
                    badge: "Single Page",
                    desc: "Renders all form sections in a single long continuous scroll page.",
                    icon: "📄"
                  }
                ].map((layoutOpt) => {
                  const currentLayout = settings.create_issue_form_layout || settings.issue_form_layout || "quick_toggle";
                  const isSelected = currentLayout === layoutOpt.id;

                  return (
                    <button
                      key={layoutOpt.id}
                      type="button"
                      onClick={() => {
                        const newSet = { ...settings, create_issue_form_layout: layoutOpt.id };
                        setSettings(newSet);
                      }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        textAlign: "left",
                        padding: "1rem",
                        borderRadius: "10px",
                        border: isSelected ? "2px solid #0f766e" : "1px solid var(--color-border, #cbd5e1)",
                        background: isSelected ? "#f0fdf4" : "var(--color-bg, #ffffff)",
                        cursor: "pointer",
                        transition: "all 0.15s ease"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: "6px" }}>
                        <span style={{ fontSize: "1.25rem" }}>{layoutOpt.icon}</span>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: "700",
                            padding: "2px 7px",
                            borderRadius: "999px",
                            background: isSelected ? "#0f766e" : "#e2e8f0",
                            color: isSelected ? "#ffffff" : "#475569"
                          }}
                        >
                          {layoutOpt.badge}
                        </span>
                      </div>
                      <strong style={{ fontSize: "0.9rem", color: isSelected ? "#0f766e" : "var(--color-text, #1e293b)", marginBottom: "3px" }}>
                        {layoutOpt.title}
                      </strong>
                      <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted, #64748b)", lineHeight: 1.35 }}>
                        {layoutOpt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Change Issue Layout Preference */}
            <div>
              <h4 style={{ margin: "0 0 0.75rem 0", fontSize: "1rem", color: "#0f766e", display: "flex", alignItems: "center", gap: "6px" }}>
                ✏️ Edit / Change Issue Default Layout
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
                {[
                  {
                    id: "quick_toggle",
                    title: "Quick Draft Toggle",
                    badge: "Fast Draft",
                    desc: "Quick 4-field draft toggle for fast edits.",
                    icon: "⚡"
                  },
                  {
                    id: "tabs",
                    title: "Tab Lifecycle Stepper",
                    badge: "Best for Edit",
                    desc: "Keeps long issue details neat and clean across 4 focused phase tabs.",
                    icon: "📑"
                  },
                  {
                    id: "classic",
                    title: "Classic Continuous Page",
                    badge: "Single Page",
                    desc: "Renders all form sections in a single long continuous scroll page.",
                    icon: "📄"
                  }
                ].map((layoutOpt) => {
                  const currentLayout = settings.change_issue_form_layout || settings.issue_form_layout || "tabs";
                  const isSelected = currentLayout === layoutOpt.id;

                  return (
                    <button
                      key={layoutOpt.id}
                      type="button"
                      onClick={() => {
                        const newSet = { ...settings, change_issue_form_layout: layoutOpt.id };
                        setSettings(newSet);
                      }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        textAlign: "left",
                        padding: "1rem",
                        borderRadius: "10px",
                        border: isSelected ? "2px solid #0f766e" : "1px solid var(--color-border, #cbd5e1)",
                        background: isSelected ? "#f0fdf4" : "var(--color-bg, #ffffff)",
                        cursor: "pointer",
                        transition: "all 0.15s ease"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: "6px" }}>
                        <span style={{ fontSize: "1.25rem" }}>{layoutOpt.icon}</span>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: "700",
                            padding: "2px 7px",
                            borderRadius: "999px",
                            background: isSelected ? "#0f766e" : "#e2e8f0",
                            color: isSelected ? "#ffffff" : "#475569"
                          }}
                        >
                          {layoutOpt.badge}
                        </span>
                      </div>
                      <strong style={{ fontSize: "0.9rem", color: isSelected ? "#0f766e" : "var(--color-text, #1e293b)", marginBottom: "3px" }}>
                        {layoutOpt.title}
                      </strong>
                      <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted, #64748b)", lineHeight: 1.35 }}>
                        {layoutOpt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--color-border, #e5e7eb)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem(storageKey);
                  const resetSet: Record<string, string> = { ...settings, app_font_size: "14", issue_form_layout: "tabs" };
                  for (const cfg of STATUS_COLOR_CONFIGS) {
                    resetSet[`status_color_${cfg.key}_bg`] = cfg.defaultBg;
                    resetSet[`status_color_${cfg.key}_text`] = cfg.defaultText;
                    resetSet[`status_color_${cfg.key}_border`] = cfg.defaultBorder;
                  }
                  setSettings(resetSet);
                  applyCustomStatusColors(resetSet, username);
                  applyCustomFontSize(resetSet, username);
                  showToast("success", "Reset to default appearance settings!");
                }}
                style={{ padding: "0.5rem 1rem", borderRadius: "6px", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: "600", fontSize: "0.85rem" }}
              >
                Reset Default Appearance
              </button>

              <button
                onClick={handleSaveAppearanceClick}
                disabled={saving}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.625rem 1.25rem", borderRadius: "6px", background: "var(--color-primary, #0f766e)", color: "white", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "0.875rem", transition: "all 0.2s" }}
              >
                {saving ? <Loader2 className="spinner" size={16} /> : <Save size={16} />}
                {saving ? "Saving Changes..." : "Save Appearance Settings"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <form onSubmit={handleAddPerson} style={{ background: "var(--color-bg, #ffffff)", padding: "2rem", borderRadius: "8px", width: "100%", maxWidth: "400px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "1.5rem", fontSize: "1.25rem" }}>Add New Person</h3>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", fontWeight: "500" }}>Full Name</label>
              <input type="text" value={newPersonData.full_name} onChange={(e) => setNewPersonData({ ...newPersonData, full_name: e.target.value })} style={{ width: "100%", padding: "0.625rem", borderRadius: "4px", border: "1px solid var(--color-border, #d1d5db)" }} required autoFocus />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", fontWeight: "500" }}>Alias / Nickname</label>
              <input type="text" value={newPersonData.nickname} onChange={(e) => setNewPersonData({ ...newPersonData, nickname: e.target.value })} style={{ width: "100%", padding: "0.625rem", borderRadius: "4px", border: "1px solid var(--color-border, #d1d5db)" }} required />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", fontWeight: "500" }}>Email (Optional)</label>
              <input type="email" value={newPersonData.email} onChange={(e) => setNewPersonData({ ...newPersonData, email: e.target.value })} style={{ width: "100%", padding: "0.625rem", borderRadius: "4px", border: "1px solid var(--color-border, #d1d5db)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
              <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: "0.625rem 1rem", borderRadius: "4px", background: "transparent", border: "1px solid var(--color-border, #d1d5db)", cursor: "pointer" }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ padding: "0.625rem 1rem", borderRadius: "4px", background: "var(--color-primary, #2563eb)", color: "white", border: "none", cursor: "pointer" }}>{saving ? "Saving..." : "Save Person"}</button>
            </div>
          </form>
        </div>
      )}

      {showAddGroupModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <form onSubmit={handleAddGroupEmail} style={{ background: "var(--color-bg, #ffffff)", padding: "2rem", borderRadius: "8px", width: "100%", maxWidth: "400px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "1.5rem", fontSize: "1.25rem" }}>Add Group Email</h3>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", fontWeight: "500" }}>Group Email Address</label>
              <input type="email" value={newGroupEmail.email_address} onChange={(e) => setNewGroupEmail({ ...newGroupEmail, email_address: e.target.value })} placeholder="e.g. sap-abap@trst.co.id" style={{ width: "100%", padding: "0.625rem", borderRadius: "4px", border: "1px solid var(--color-border, #d1d5db)" }} required autoFocus />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", fontWeight: "500" }}>Name / Description (Optional)</label>
              <input type="text" value={newGroupEmail.name} onChange={(e) => setNewGroupEmail({ ...newGroupEmail, name: e.target.value })} placeholder="e.g. SAP ABAP Team" style={{ width: "100%", padding: "0.625rem", borderRadius: "4px", border: "1px solid var(--color-border, #d1d5db)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
              <button type="button" onClick={() => setShowAddGroupModal(false)} style={{ padding: "0.625rem 1rem", borderRadius: "4px", background: "transparent", border: "1px solid var(--color-border, #d1d5db)", cursor: "pointer" }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ padding: "0.625rem 1rem", borderRadius: "4px", background: "var(--color-primary, #2563eb)", color: "white", border: "none", cursor: "pointer" }}>{saving ? "Saving..." : "Save Group Email"}</button>
            </div>
          </form>
        </div>
      )}

      {deleteConfirmGroup && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--color-bg, #ffffff)", padding: "1.75rem", borderRadius: "12px", width: "100%", maxWidth: "420px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", color: "#dc2626" }}>
              <AlertTriangle size={24} />
              <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: "600" }}>Confirm Delete</h3>
            </div>
            <p style={{ color: "var(--color-text-muted, #4b5563)", fontSize: "0.875rem", lineHeight: "1.5", marginBottom: "1.5rem" }}>
              Are you sure you want to delete group email <strong>"{deleteConfirmGroup.email_address}"</strong>?
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button type="button" onClick={() => setDeleteConfirmGroup(null)} disabled={saving} style={{ padding: "0.5rem 1rem", borderRadius: "6px", background: "transparent", border: "1px solid var(--color-border, #d1d5db)", cursor: "pointer" }}>Cancel</button>
              <button type="button" onClick={confirmDeleteGroupEmail} disabled={saving} style={{ padding: "0.5rem 1rem", borderRadius: "6px", background: "#dc2626", color: "white", border: "none", cursor: "pointer" }}>{saving ? "Deleting..." : "Yes, Delete"}</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmPerson && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--color-bg, #ffffff)", padding: "1.75rem", borderRadius: "12px", width: "100%", maxWidth: "420px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", color: "#dc2626" }}>
              <AlertTriangle size={24} />
              <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: "600", color: "var(--color-text-heading, #111827)" }}>Confirm Delete</h3>
            </div>
            <p style={{ color: "var(--color-text-muted, #4b5563)", fontSize: "0.875rem", lineHeight: "1.5", marginBottom: "1.5rem" }}>
              Are you sure you want to delete <strong>"{deleteConfirmPerson.full_name || deleteConfirmPerson.nickname}"</strong>? This action cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button type="button" onClick={() => setDeleteConfirmPerson(null)} disabled={saving} style={{ padding: "0.5rem 1rem", borderRadius: "6px", background: "transparent", border: "1px solid var(--color-border, #d1d5db)", cursor: "pointer", fontSize: "0.875rem", fontWeight: "500" }}>Cancel</button>
              <button type="button" onClick={confirmDeletePerson} disabled={saving} style={{ padding: "0.5rem 1rem", borderRadius: "6px", background: "#dc2626", color: "white", border: "none", cursor: "pointer", fontSize: "0.875rem", fontWeight: "600" }}>{saving ? "Deleting..." : "Yes, Delete"}</button>
            </div>
          </div>
        </div>
      )}

      {showAdminAppearanceModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div className="settings-card" style={{ width: "100%", maxWidth: "500px", borderRadius: "16px", padding: "1.75rem", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "8px" }}>
                <Sliders size={20} color="#059669" /> Save Appearance Settings
              </h3>
              <button
                type="button"
                onClick={() => setShowAdminAppearanceModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px" }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ color: "var(--color-text-muted, #64748b)", fontSize: "0.875rem", marginBottom: "1.5rem", lineHeight: "1.5" }}>
              As an Administrator, choose where you would like to apply these appearance settings (Font Size & Status Tag Colors):
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <button
                type="button"
                onClick={saveAppearanceSettingsLocalOnly}
                disabled={saving}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "1rem",
                  padding: "1.15rem",
                  borderRadius: "10px",
                  border: "1px solid var(--color-border, #cbd5e1)",
                  background: "var(--surface-subtle, #f8fafc)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s"
                }}
              >
                <User size={22} color="#059669" style={{ marginTop: "2px", flexShrink: 0 }} />
                <div>
                  <strong style={{ display: "block", fontSize: "0.925rem", marginBottom: "4px" }}>
                    Save for Me Only (Local Storage)
                  </strong>
                  <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted, #64748b)", display: "block", lineHeight: "1.4" }}>
                    Saves settings only to your browser local storage ({storageKey}). Does not affect system defaults for other users.
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={saveAppearanceSettingsGlobalAndLocal}
                disabled={saving}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "1rem",
                  padding: "1.15rem",
                  borderRadius: "10px",
                  border: "1.5px solid #059669",
                  background: "var(--surface-selected, #ecfdf5)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s"
                }}
              >
                <Database size={22} color="#059669" style={{ marginTop: "2px", flexShrink: 0 }} />
                <div>
                  <strong style={{ display: "block", fontSize: "0.925rem", marginBottom: "4px", color: "#047857" }}>
                    Save as System Default (Database & Local Storage)
                  </strong>
                  <span style={{ fontSize: "0.8rem", color: "#065f46", display: "block", lineHeight: "1.4" }}>
                    Saves settings to the server database as system defaults for ALL users (and updates your local storage).
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.type === "success" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
