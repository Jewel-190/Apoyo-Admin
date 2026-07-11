import { normalizeStatus } from "../../shared/domain/status";
import {
  buildAdminRequestStatusBadgeStylesMap,
  getAdminRequestStatusBadgeStyle,
} from "../../shared/lib/adminLineStatusStyles";

const DEFAULT_STYLES_MAP = buildAdminRequestStatusBadgeStylesMap();

/**
 * Request status pill for admin modules. Colors come from adminLineStatusStyles.js.
 */
export default function AdminStatusBadge({
  status,
  stylesByStatus = DEFAULT_STYLES_MAP,
  className = "",
}) {
  const label = normalizeStatus(status);
  const style =
    stylesByStatus[label] ?? getAdminRequestStatusBadgeStyle(label);

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${className}`}
      style={style}
    >
      {label}
    </span>
  );
}
