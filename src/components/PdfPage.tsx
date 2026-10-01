import { useEffect, useRef } from "react";
import type { PDFPageProxy } from "pdfjs-dist";
import { renderPageToContainer, type RenderPageHandle } from "../pdf/pdfLoader";

interface PdfPageProps {
    /** PDFPageProxy da duoc lay san boi PdfViewer. */
    page: PDFPageProxy;
    scale: number;
    isActive: boolean;
    onElementChange: (pageNumber: number, element: HTMLDivElement | null) => void;
    /** Bao cho PdfViewer biet trang nao dang chiem nhieu viewport nhat. */
    onVisiblePageChange: (pageNumber: number) => void;
}

/**
 * Render 1 trang PDF: canvas (hinh anh) + text layer (span trong suot cho selection).
 *
 * Viec render duoc tach ra khoi PdfViewer de PdfViewer chi lo:
 * load document + theo doi trang dang xem + bat su kien selection.
 */
export function PdfPage({ page, scale, isActive, onElementChange, onVisiblePageChange }: PdfPageProps) {
    const pageContainerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const textLayerRef = useRef<HTMLDivElement>(null);

    // Kich thuoc trang duoc tinh toan dong bo theo ti le zoom (scale) hien tai,
    // giup layout va thanh cuon on dinh ngay ca truoc khi canvas ve xong.
    const viewport = page.getViewport({ scale });
    const pageWidth = Math.floor(viewport.width);
    const pageHeight = Math.floor(viewport.height);

    useEffect(() => {
        if (!isActive || !canvasRef.current || !textLayerRef.current) {
            return;
        }

        let cancelled = false;
        let activeRender: RenderPageHandle | null = null;
        const renderCanvas = document.createElement("canvas");
        const renderTextLayer = document.createElement("div");
        renderTextLayer.className = "pdf-page__text-layer textLayer";

        renderPageToContainer(page, renderCanvas, renderTextLayer, scale, (handle) => {
            activeRender = handle;
        })
            .then((renderedPage) => {
                const visibleCanvas = canvasRef.current;
                const visibleTextLayer = textLayerRef.current;
                if (cancelled || !visibleCanvas || !visibleTextLayer) {
                    return;
                }

                visibleCanvas.width = renderedPage.canvas.width;
                visibleCanvas.height = renderedPage.canvas.height;
                visibleCanvas.style.width = renderedPage.canvas.style.width;
                visibleCanvas.style.height = renderedPage.canvas.style.height;
                visibleCanvas.getContext("2d")?.drawImage(renderedPage.canvas, 0, 0);

                visibleTextLayer.style.setProperty("--scale-factor", `${scale}`);
                visibleTextLayer.style.setProperty("--user-unit", "1");
                visibleTextLayer.replaceChildren(...Array.from(renderedPage.textLayerHost.childNodes));
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
            activeRender?.cancel();
        };
    }, [page, scale, isActive]);

    useEffect(() => {
        const element = pageContainerRef.current;

        if (!element) {
            return;
        }

        onElementChange(page.pageNumber, element);
        return () => onElementChange(page.pageNumber, null);
    }, [page.pageNumber, onElementChange]);

    // Theo doi trang dang hien thi de cap nhat current page tren toolbar.
    useEffect(() => {
        if (!isActive) {
            return;
        }

        const element = pageContainerRef.current;
        if (!element) {
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                    onVisiblePageChange(page.pageNumber);
                }
            },
            { threshold: [0.5] }
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, [isActive, page.pageNumber, onVisiblePageChange]);

    return (
        <div
            ref={pageContainerRef}
            className="pdf-page"
            /**
             * PDF.js dua vao attribute nay de biet selection thuoc trang nao
             * (xem resolvePageNumberFromRange trong pdf/selection.ts).
             */
            data-page-number={page.pageNumber}
            style={{
                width: `${pageWidth}px`,
                height: `${pageHeight}px`,
            }}
        >
            {isActive ? <canvas ref={canvasRef} className="pdf-page__canvas" /> : null}
            {isActive ? <div ref={textLayerRef} className="pdf-page__text-layer textLayer" /> : null}
            <span className="pdf-page__label">{page.pageNumber}</span>
        </div>
    );
}
