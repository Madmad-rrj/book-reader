import { useRef } from "react";

interface PdfToolbarProps {
    /** Ten file dang mo, null khi chua mo file nao. */
    fileName: string | null;
    /** Trang hien tai / tong so trang, null khi chua mo file. */
    currentPage: number | null;
    pageCount: number;
    scale: number;
    /** Nguoi dung chon file PDF tu may. */
    onOpenFile: (file: File) => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
}

/**
 * Toolbar: mo file, hien thi so trang, zoom in/out.
 * Khong chua logic PDF.js — chi goi callback tu App.
 */
export function PdfToolbar({
    fileName,
    currentPage,
    pageCount,
    scale,
    onOpenFile,
    onZoomIn,
    onZoomOut,
}: PdfToolbarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const hasDocument = pageCount > 0;

    return (
        <header className="toolbar">
            <button type="button" onClick={() => fileInputRef.current?.click()}>
                Open PDF
            </button>

            {/* input file bi an; nut "Open PDF" moi la UI that su */}
            <input
                ref={fileInputRef}
                className="toolbar__file-input"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                    const file = event.target.files?.[0];

                    if (file) {
                        onOpenFile(file);
                    }

                    // Reset de chon lai cung mot file van kich hoat onChange.
                    event.target.value = "";
                }}
            />

            <span className="toolbar__file-name">{fileName ?? "Chưa có file nào được mở"}</span>

            <div className="toolbar__spacer" />

            <button type="button" onClick={onZoomOut} disabled={!hasDocument}>
                −
            </button>
            <span className="toolbar__zoom">{Math.round(scale * 100)}%</span>
            <button type="button" onClick={onZoomIn} disabled={!hasDocument}>
                +
            </button>

            <span className="toolbar__page">
                {hasDocument ? `${currentPage ?? 1} / ${pageCount}` : "0 / 0"}
            </span>
        </header>
    );
}
