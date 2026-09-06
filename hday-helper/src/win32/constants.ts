/**
 * Win32 constants used by `tray.ts`. Values are taken from the Windows SDK
 * headers (winuser.h / shellapi.h) — see comments in `tray.ts` for how each
 * one is used.
 */

export const WM_NULL = 0x0000;
export const WM_DESTROY = 0x0002;
export const WM_LBUTTONUP = 0x0202;
export const WM_RBUTTONUP = 0x0205;

// Shell_NotifyIcon's callback message must be >= WM_APP (0x8000) to avoid
// colliding with any standard window message.
export const WM_TRAYICON = 0x8000 + 1;

export const NIM_ADD = 0x00000000;
export const NIM_MODIFY = 0x00000001;
export const NIM_DELETE = 0x00000002;

export const NIF_MESSAGE = 0x00000001;
export const NIF_ICON = 0x00000002;
export const NIF_TIP = 0x00000004;

export const LR_DEFAULTCOLOR = 0x0000;

// CreateIconFromResourceEx's dwVer: 0x00030000 opts into the Windows Vista+
// behavior that accepts a raw PNG image (not just a legacy DIB) as the
// resource bytes — see MSDN's "Remarks" for CreateIconFromResourceEx.
export const ICON_RESOURCE_VERSION_PNG = 0x00030000;

export const PM_REMOVE = 0x0001;

export const TPM_RIGHTBUTTON = 0x0002;
export const TPM_NONOTIFY = 0x0080;
export const TPM_RETURNCMD = 0x0100;

export const MF_STRING = 0x00000000;
export const MF_SEPARATOR = 0x00000800;

export const SW_HIDE = 0;

// sizeof(WNDCLASSEXW) on x64 — see `structs.ts`'s packWndClassExW for the
// field-by-field layout this corresponds to.
export const SIZEOF_WNDCLASSEXW = 80;
// sizeof(NOTIFYICONDATAW), "V1" layout (through szTip, no balloon/guid
// fields) — see `structs.ts`'s packNotifyIconData.
export const SIZEOF_NOTIFYICONDATAW = 168;
// sizeof(MSG) on x64.
export const SIZEOF_MSG = 48;
