import { useEffect, useState } from "react";
import { fetchAdminPeople, fetchAdminSettings, updateAdminPerson, updateAdminSettings, createAdminPerson, deleteAdminPerson, type AdminPersonRow } from "../api";
import { Check, Loader2, Save, X, Trash2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

export function MasterDataWorkspace() {
  const [activeTab, setActiveTab] = useState<"people" | "settings">("people");
  const [people, setPeople] = useState<AdminPersonRow[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({
    ai_instruction_glpi: "",
    ai_instruction_email: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPersonData, setNewPersonData] = useState({ full_name: "", nickname: "", email: "" });
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [deleteConfirmPerson, setDeleteConfirmPerson] = useState<AdminPersonRow | null>(null);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    Promise.all([fetchAdminPeople(), fetchAdminSettings()])
      .then(([peopleRes, settingsRes]) => {
        setPeople(peopleRes.rows);
        setSettings({
          ai_instruction_glpi: settingsRes.ai_instruction_glpi || "",
          ai_instruction_email: settingsRes.ai_instruction_email || "",
        });
      })
      .finally(() => setLoading(false));
  }, []);

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
      showToast("success", "Settings saved successfully!");
    } catch (err) {
      showToast("error", "Failed to save settings");
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
        <button
          className={activeTab === "people" ? "active" : ""}
          style={{ fontWeight: activeTab === "people" ? "bold" : "normal", background: "none", border: "none", cursor: "pointer", color: "var(--text-color)" }}
          onClick={() => setActiveTab("people")}
        >
          People Roles
        </button>
        <button
          className={activeTab === "settings" ? "active" : ""}
          style={{ fontWeight: activeTab === "settings" ? "bold" : "normal", background: "none", border: "none", cursor: "pointer", color: "var(--text-color)" }}
          onClick={() => setActiveTab("settings")}
        >
          AI Instructions
        </button>
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
                        onFocus={(e) => { e.target.style.border = "1px solid var(--color-primary, #2563eb)"; e.target.style.background = "var(--color-bg, #ffffff)"; }}
                        onMouseLeave={(e) => { if (document.activeElement !== e.target) { e.target.style.border = "1px solid transparent"; e.target.style.background = "transparent"; } }}
                        onMouseEnter={(e) => { if (document.activeElement !== e.target) { e.target.style.border = "1px solid var(--color-border, #d1d5db)"; e.target.style.background = "var(--color-bg, #ffffff)"; } }}
                      />
                    </td>
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", verticalAlign: "middle" }}>
                      <input
                        type="text"
                        defaultValue={p.nickname || ""}
                        onBlur={(e) => updatePersonText(p.id, "nickname", e.target.value)}
                        placeholder="e.g. johndoe"
                        style={{ padding: "0.5rem 0.625rem", borderRadius: "4px", border: "1px solid transparent", background: "transparent", color: "var(--color-text, #111827)", fontSize: "0.875rem", width: "100%", transition: "all 0.2s" }}
                        onFocus={(e) => { e.target.style.border = "1px solid var(--color-primary, #2563eb)"; e.target.style.background = "var(--color-bg, #ffffff)"; }}
                        onMouseLeave={(e) => { if (document.activeElement !== e.target) { e.target.style.border = "1px solid transparent"; e.target.style.background = "transparent"; } }}
                        onMouseEnter={(e) => { if (document.activeElement !== e.target) { e.target.style.border = "1px solid var(--color-border, #d1d5db)"; e.target.style.background = "var(--color-bg, #ffffff)"; } }}
                      />
                    </td>
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e5e7eb)", verticalAlign: "middle" }}>
                      <input
                        type="text"
                        defaultValue={p.email || ""}
                        onBlur={(e) => updatePersonText(p.id, "email", e.target.value)}
                        placeholder="e.g. name@company.com"
                        style={{ padding: "0.5rem 0.625rem", borderRadius: "4px", border: "1px solid transparent", background: "transparent", color: "var(--color-text, #111827)", width: "100%", fontSize: "0.875rem", transition: "all 0.2s" }}
                        onFocus={(e) => { e.target.style.border = "1px solid var(--color-primary, #2563eb)"; e.target.style.background = "var(--color-bg, #ffffff)"; }}
                        onMouseLeave={(e) => { if (document.activeElement !== e.target) { e.target.style.border = "1px solid transparent"; e.target.style.background = "transparent"; } }}
                        onMouseEnter={(e) => { if (document.activeElement !== e.target) { e.target.style.border = "1px solid var(--color-border, #d1d5db)"; e.target.style.background = "var(--color-bg, #ffffff)"; } }}
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

      {activeTab === "settings" && (
        <div className="settings-tab" style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "800px" }}>
          
          <div style={{ background: "var(--color-bg-elevated, #ffffff)", padding: "2rem", borderRadius: "8px", border: "1px solid var(--color-border, #e5e7eb)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "1.25rem", color: "var(--color-text-heading, #111827)" }}>System Prompts</h3>
            <p style={{ color: "var(--color-text-muted, #6b7280)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
              Configure the underlying instructions used by the AI assistant when generating content for GLPI and Email communications.
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
                  style={{ width: "100%", height: "150px", padding: "1rem", borderRadius: "6px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #1f2937)", resize: "vertical", fontFamily: "var(--font-mono, monospace)", fontSize: "0.875rem", lineHeight: "1.5", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)" }}
                />
              </div>
              
              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600", color: "var(--color-text, #374151)", fontSize: "0.875rem" }}>
                  Email Generation Guidelines
                </label>
                <textarea
                  value={settings.ai_instruction_email}
                  onChange={(e) => setSettings({ ...settings, ai_instruction_email: e.target.value })}
                  placeholder="e.g., Address the user by their first name. Keep paragraphs short..."
                  style={{ width: "100%", height: "150px", padding: "1rem", borderRadius: "6px", border: "1px solid var(--color-border, #d1d5db)", background: "var(--color-bg, #ffffff)", color: "var(--color-text, #1f2937)", resize: "vertical", fontFamily: "var(--font-mono, monospace)", fontSize: "0.875rem", lineHeight: "1.5", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)" }}
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

      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.type === "success" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
