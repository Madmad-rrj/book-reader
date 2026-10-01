/**
 * Một selection (đoạn text người dùng bôi) trong PDF.
 *
 * Đây là abstraction trung tâm của Phase 1: PdfViewer chỉ có nhiệm vụ render PDF
 * và tạo ra object này, các phase sau (translate/dictionary/vocabulary) chỉ cần
 * làm việc với PdfSelection, không cần biết gì về PDF.js.
 */
export interface PdfSelection {
    /** Text người dùng đã bôi, đã được normalize khoảng trắng. */
    text: string;

    /** Số trang (1-based) chứa selection, hoặc null nếu chưa xác định được. */
    pageNumber: number | null;
}

/** Trạng thái selection rỗng, dùng khi người dùng click ra vùng trống. */
export const EMPTY_SELECTION: PdfSelection = {
    text: "",
    pageNumber: null,
};
