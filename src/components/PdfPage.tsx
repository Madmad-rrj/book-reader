import { useEffect, useRef, useState } from "react";
import type { PDFPageProxy } from "pdfjs-dist";
import { renderPageToContainer } from "../pdf/pdfLoader";

interface PdfPageProps {
    /** PDFPageProxy da duoc lay san boi PdfViewer. */
    page: PDFPageProxy;
    scale: number;
    /** Bao cho PdfViewer biet trang nao dang chiem nhieu viewport nhat. */
    onVisiblePageChange: (pageNumber: number) => void;
}

/**
 * Render 1 trang PDF: canvas (hinh anh) + text layer (span trong suot cho selection).
 *
 * Viec render duoc tach ra khoi PdfViewer de PdfViewer chi lo:
 * load document + theo doi trang dang xem + bat su kien selection.
 */
export function PdfPage({ page, scale, onVisiblePageChange }: PdfPageProps) {
    const pageContainerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const textLayerRef = useRef<HTMLDivElement>(null);
    const [aspectRatio, setAspectRatio] = useState<number | null>(null);

    useEffect(() => {
        if (!canvasRef.current || !textLayerRef.current) {
            return;
        }

        let cancelled = false;
        // RenderTask hien tai; cancel khi unmount hoac khi scale thay doi.
        let activeRenderTask: { cancel: () => void } | null = null;

        // Do ngay o scroll o scale 1 de biet ti le trang => dat chieu cao placeholder
        // giup thanh scroll khong bi nhay khi zoom.
        const unitViewport = page.getViewport({ scale: 1 });
        setAspectRatio(unitViewport.height / unitViewport.width);

        renderPageToContainer(page, canvasRef.current, textLayerRef.current, scale)
            .then((task) => {
                if (cancelled) {
                    return;
                }

                activeRenderTask = task;
            })
            .catch((error: unknown) => {
                // RenderCancelException xay ra khi zoom nhanh -> bo qua.
                if (cancelled) {
                    return;
                }

                console.error("[pdf] render page failed", page.pageNumber, error);
            });

        return () => {
            cancelled = true;
            activeRenderTask?.cancel();
        };
    }, [page, scale]);

    // Theo doi trang nao dang hien thi nhieu nhat de cap nhat "current page" tren toolbar.
    useEffect(() => {
        const element = pageContainerRef.current;

        if (!element) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                        onVisiblePageChange(page.pageNumber);
                    }
                }
            },
            { threshold: [0.5] }
        );

        observer.observe(element);

        return () => observer.disconnect();
    }, [page.pageNumber, onVisiblePageChange]);

    return (
        <div
            ref={pageContainerRef}
            className="pdf-page"
            /**
             * PDF.js dua vao attribute nay de biet selection thuoc trang nao
             * (xem resolvePageNumberFromRange trong pdf/selection.ts).
             */
            data-page-number={page.pageNumber}
            style={aspectRatio === null ? undefined : { minHeight: `${aspectRatio * 100}%` }}
        >
            <canvas ref={canvasRef} className="pdf-page__canvas" />
            <div ref={textLayerRef} className="pdf-page__text-layer textLayer" />
            <span className="pdf-page__label">{page.pageNumber}</span>
        </div>
    );
}
