"use client";

interface Item {
  label: string;
  onClick: () => void;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: Item[];
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 min-w-40 rounded-xl border border-white/10 bg-black/95 shadow-xl shadow-black/50 py-1 text-sm"
        style={{ left: x, top: y }}
      >
        {items.map((it) => (
          <button
            key={it.label}
            onClick={() => {
              onClose();
              it.onClick();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-white/10 transition-colors text-white"
          >
            {it.label}
          </button>
        ))}
      </div>
    </>
  );
}
