type PortalButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
};

export default function PortalButton({
  children,
  onClick,
  active = false,
  disabled = false,
  className = "",
}: PortalButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full rounded-lg border px-3 py-2 text-left text-sm transition
        ${active ? "bg-blue-500/20 border-blue-400" : "hover:bg-white/5"}
        ${disabled ? "opacity-40 cursor-not-allowed" : ""}
        ${className}
      `}
    >
      {children}
    </button>
  );
}