import React from "react";

export function Segmented({ options, value, onChange }) {
  return (
    <div className="flex rounded-lg p-1 bg-stone-100 border border-stone-200">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={
              "flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition " +
              (active
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Label({ children, value }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">
        {children}
      </span>
      {value != null && (
        <span className="text-xs text-stone-700 font-mono-ui">{value}</span>
      )}
    </div>
  );
}
