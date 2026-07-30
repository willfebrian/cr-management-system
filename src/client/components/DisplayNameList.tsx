export function splitDisplayNames(value?: string | null) {
  return (value || "")
    .split(/[;,]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function DisplayNameList({ value }: { value?: string | null }) {
  const names = splitDisplayNames(value);
  if (!names.length) return <span>-</span>;

  return (
    <span className="display-name-list">
      {names.map((name) => <span key={name}>{name}</span>)}
    </span>
  );
}
