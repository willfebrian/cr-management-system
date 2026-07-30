import type { IncompleteGroup, IncompleteItem } from "../issueIncomplete";

export function IncompleteGroupCards({
  groups,
  onItemClick
}: {
  groups: IncompleteGroup[];
  onItemClick?: (item: IncompleteItem) => void;
}) {
  return (
    <div className="incomplete-group-grid">
      {groups.map((group) => (
        <section className="incomplete-group-card" key={group.section}>
          <div className="incomplete-group-heading">
            <strong>{group.title}</strong>
            <span>{group.items.length}</span>
          </div>
          <div className={`incomplete-item-list ${onItemClick ? "clickable" : "static"}`}>
            {group.items.map((item) => onItemClick ? (
              <button type="button" key={item.id} onClick={() => onItemClick(item)}>
                {item.label}
              </button>
            ) : (
              <span className="incomplete-item-text" key={item.id}>{item.label}</span>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
