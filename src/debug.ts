/**
 * Co bat/tat log cho development.
 *
 * Dat o mot cho duy nhat de khong phai sua nhieu file khi can debug.
 * Trong production (`import.meta.env.DEV === false`) luon tat, tranh log noi dung
 * PDF hoac text nguoi dung ra console.
 */
export const DEBUG_LOGS = import.meta.env.DEV;

/** Log co tien to, chi hien khi DEBUG_LOGS bat. */
export function debugLog(scope: string, message: string, ...rest: unknown[]): void {
    if (!DEBUG_LOGS) {
        return;
    }

    console.log(`[${scope}] ${message}`, ...rest);
}
