import { useEffect, useState } from "react";
import { fetchAdminPeople, fetchAdminSettings, updateAdminPerson, updateAdminSettings, createAdminPerson, deleteAdminPerson, fetchGroupEmails, createGroupEmail, updateGroupEmail, deleteGroupEmail, type AdminPersonRow, type GroupEmailRow } from "../api";
import { Check, Loader2, Save, X, Trash2, CheckCircle2, XCircle, AlertTriangle, Mail, Palette, Type, Sliders, User, Database } from "lucide-react";
import { STATUS_COLOR_CONFIGS, applyCustomStatusColors } from "../utils/tagColors";
import { applyCustomFontSize, getActiveAppearanceKey } from "../utils/fontSize";

interface MasterDataWorkspaceProps {
  mode?: "master-data" | "settings";
  isAdmin?: boolean;
  username?: string;
}

export function MasterDataWorkspace({ mode = "master-data", isAdmin = true, username }: MasterDataWorkspaceProps) {
  const storageKey = getActiveAppearanceKey(username);

  const [activeTab, setActiveTab] = useState<"people" | "group_emails" | "general_settings" | "ai_instructions" | "appearance">("people");

  useEffect(() => {
    if (mode === "settings") {
      if (!isAdmin) {
        setActiveTab("appearance");
      } else if (activeTab === "people" || activeTab === "group_emails") {
        setActiveTab("general_settings");
      }
    } else if (mode === "master-data" && (activeTab === "general_settings" || activeTab === "ai_instructions" || activeTab === "appearance")) {
      setActiveTab("people");
    }
  }, [mode, isAdmin]);

  const [people, setPeople] = useState<AdminPersonRow[]>([]);
  const [groupEmails, setGroupEmails] = useState<GroupEmailRow[]>([]);
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
  });
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
      isAdmin ? fetchGroupEmails().catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] })
    ])
      .then(([peopleRes, settingsRes, groupEmailsRes]) => {
        setPeople(peopleRes.rows || []);
        setGroupEmails(groupEmailsRes.rows || []);
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
          ...settingsRes,
          ...localAppearance,
        };
        setSettings(merged);
        
        
      })
      .finally(() => setLoading(false));
  }, [isAdmin]);

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
    const appearanceKeys = ["app_font_size"];
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
    return (
      <div className="workspace-loading">
        <Loader2 className="spinner" size={24} />
      </div>
    );
  }

  return (
    <div className="master-data-workspace">
      <div className="workspace-tabs" style={{ display: "flex", gap: "1rem", marginBottom: "1rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>
        {mode === "master-data" ? (
          <>
            <button
              className={activeTab === "people" ? "active" : ""}
              style={{ fontWeight: activeTab === "people" ? "bold" : "normal", background: "none", border: "none", cursor: "pointer", color: "var(--text-color)" }}
              onClick={() => setActiveTab("people")}
            >
              People Roles
            </button>
            <button
              className={activeTab === "group_emails" ? "active" : ""}
              style={{ fontWeight: activeTab === "group_emails" ? "bold" : "normal", background: "none", border: "none", cursor: "pointer", color: "var(--text-color)" }}
              onClick={() => setActiveTab("group_emails")}
            >
              Group Emails
            </button>
          </>
        ) : (
          <>
            {isAdmin ? (
              <>
                <button
                  className={activeTab === "general_settings" ? "active" : ""}
                  style={{ fontWeight: activeTab === "general_settings" ? "bold" : "normal", background: "none", border: "none", cursor: "pointer", color: "var(--text-color)" }}
                  onClick={() => setActiveTab("general_settings")}
                >
                  General Settings
                </button>
                <button
                  className={activeTab === "ai_instructions" ? "active" : ""}
                  style={{ fontWeight: activeTab === "ai_instructions" ? "bold" : "normal", background: "none", border: "none", cursor: "pointer", color: "var(--text-color)" }}
                  onClick={() => setActiveTab("ai_instructions")}
                >
                  AI Instructions
                </button>
              </>
            ) : null}
            <button
              className={activeTab === "appearance" ? "active" : ""}
              style={{ fontWeight: activeTab === "appearance" ? "bold" : "normal", background: "none", border: "none", cursor: "pointer", color: "var(--text-color)" }}
              onClick={() => setActiveTab("appearance")}
            >
              Appearance Settings
            </button>
          </>
        )}
      </div>

      {activeTab === "people" && (
        <div className="people-tab" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ background: "var(--color-bg-elevated, #ffffff)", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--color-border, #e5e7eb)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "1.25rem", color: "var(--color-text-heading, #111827)" }}>People Roles</h3>
                <p style={{ color: "var(--color-text-muted, #6b7280)", margin: 0, fontSize: "0.875rem" }}>Manage the access control and specific roles for all team members.</p>
              </div>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: "0.625rem 1rem", width: "100%", minWidth: "250px", borderRadius: "6px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #111827)", fontSize: "0.875rem", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)" }}
                />
                <button
                  onClick={() => setShowAddModal(true)}
                  disabled={saving}
                  style={{ padding: "0.625rem 1.25rem", borderRadius: "6px", background: "var(--color-primary, #2563eb)", color: "white", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "0.875rem", whiteSpace: "nowrap", transition: "all 0.2s" }}
                >
                  + Add New Person
                </button>
              </div>
            </div>
            
            <div style={{ overflowX: "auto", border: "1px solid var(--color-border, #e5e7eb)", borderRadius: "6px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
                <thead style={{ background: "var(--color-bg-subtle, #f9fafb)" }}>
                  <tr>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", minWidth: "200px", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Full Name</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", minWidth: "100px", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Alias</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", minWidth: "200px", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</th>
                    <th style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", minWidth: "250px", color: "var(--color-text-muted, #6b7280)", fontWeight: "600", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tags</th>
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
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", verticalAlign: "middle" }}>
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
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", verticalAlign: "middle" }}>
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
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", verticalAlign: "middle" }}>
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
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", verticalAlign: "middle" }}>
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
                style={{ padding: "0.625rem 1.25rem", borderRadius: "6px", background: "var(--color-primary, #2563eb)", color: "white", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "0.875rem", whiteSpace: "nowrap" }}
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

      {activeTab === "general_settings" && (
        <div className="general-settings-tab" style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "800px" }}>
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
        <div className="settings-tab" style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "800px" }}>
          
          <div style={{ background: "var(--color-bg-elevated, #ffffff)", padding: "2rem", borderRadius: "8px", border: "1px solid var(--color-border, #e5e7eb)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "1.25rem", color: "var(--color-text-heading, #111827)" }}>System Prompts & AI Instructions</h3>
            <p style={{ color: "var(--color-text-muted, #6b7280)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
              Configure the underlying instructions used by the AI assistant when generating content for GLPI and Problem/Impact Analysis.
            </p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600", color: "var(--color-text, #374151)", fontSize: "0.875rem" }}>
                  GLPI Generation Guidelines
                </label>
                <textarea
                  value={settings.ai_instruction_glpi}
                  onChange={(e) => setSettings({ ...settings, ai_instruction_glpi: e.target.value })}
                  placeholder="e.g., Always use professional tone. Include standard disclaimer at the bottom..."
                  style={{ width: "100%", height: "120px", padding: "1rem", borderRadius: "6px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #1f2937)", resize: "vertical", fontFamily: "var(--font-mono, monospace)", fontSize: "0.875rem", lineHeight: "1.5", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)" }}
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
                  style={{ width: "100%", height: "100px", padding: "1rem", borderRadius: "6px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #1f2937)", resize: "vertical", fontFamily: "var(--font-mono, monospace)", fontSize: "0.875rem", lineHeight: "1.5", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)" }}
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
                  style={{ width: "100%", height: "120px", padding: "1rem", borderRadius: "6px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #1f2937)", resize: "vertical", fontFamily: "var(--font-mono, monospace)", fontSize: "0.875rem", lineHeight: "1.5", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)" }}
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
                  style={{ width: "100%", height: "120px", padding: "1rem", borderRadius: "6px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #1f2937)", resize: "vertical", fontFamily: "var(--font-mono, monospace)", fontSize: "0.875rem", lineHeight: "1.5", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600", color: "var(--color-text, #374151)", fontSize: "0.875rem" }}>
                  General Email Guidelines (Optional)
                </label>
                <textarea
                  value={settings.ai_instruction_email}
                  onChange={(e) => setSettings({ ...settings, ai_instruction_email: e.target.value })}
                  placeholder="e.g., Address the user by their first name. Keep paragraphs short..."
                  style={{ width: "100%", height: "100px", padding: "1rem", borderRadius: "6px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #1f2937)", resize: "vertical", fontFamily: "var(--font-mono, monospace)", fontSize: "0.875rem", lineHeight: "1.5", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)" }}
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
        <div className="settings-tab" style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "880px", paddingBottom: "5rem" }}>
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

            <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--color-border, #e5e7eb)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem(storageKey);
                  const resetSet: Record<string, string> = { ...settings, app_font_size: "14" };
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
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.625rem 1.25rem", borderRadius: "6px", background: "var(--color-primary, #059669)", color: "white", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "0.875rem", transition: "all 0.2s" }}
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
