/**
 * Applies derived system-theme CSS variables to a local scope.
 * :root is already hydrated by bootstrapSystemTheme / the index.html boot script;
 * local style keeps Login self-contained if root vars are cleared later.
 */
import { useSystemTheme } from "../hooks/useSystemTheme";

export function SystemThemeScope({ children, className = "" }) {
  const { cssVars, ready } = useSystemTheme();
  return (
    <div
      className={className}
      style={cssVars}
      data-theme-ready={ready ? "true" : "false"}
    >
      {children}
    </div>
  );
}
