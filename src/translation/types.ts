/**
 * Kieu du lieu cho tang translation (Phase 2 — Edge Translator API).
 *
 * Tach khoi PDF: tang nay chi nhan text, khong biet gi ve DOM hay PDF.js.
 *
 * NGUON GOC CONTRACT: cac kieu duoi day duoc viet theo API THUC TE do duoc tu
 * browser (xem scripts/probe-translator-api.mjs), khong theo gia dinh:
 *
 *   - `window.Translator` la function, own props:
 *       ["length", "name", "prototype", "availability", "create"]
 *   - `Translator.availability({ sourceLanguage, targetLanguage })` -> Promise<string>
 *       Tra ve "downloadable" trong ~5ms khi model chua co tren may.
 *   - `Translator.create({ sourceLanguage, targetLanguage, monitor })` -> Promise<TranslatorInstance>
 *       Co the treo vo han khi model chua tai duoc (xem ghi chu o translator.ts).
 *   - instance co `translate(text)` va `destroy()`.
 *   - `monitor` nhan mot EventTarget co su kien `downloadprogress` voi
 *     `{ loaded, total }`.
 */

/** Chieu dich co dinh cua Phase 2. */
export const SOURCE_LANGUAGE = "en";
export const TARGET_LANGUAGE = "vi";

/**
 * Ket qua cua `Translator.availability()`.
 *
 * `downloadable` nghia la cap ngon ngu duoc ho tro nhung model CHUA co tren may
 * — `create()` se phai tai ve, co the rat lau.
 *
 * Khong loai tru cac gia tri khac: neu Edge bo sung trang thai moi, ta coi nhu
 * "khong ro" va van thu `create()` thay vi chan doan sai.
 */
export type TranslatorAvailability =
    | "available"
    | "downloadable"
    | "downloading"
    | "unavailable"
    | (string & {});

/** Trang thai cua mot lan dich, dung cho UI. */
export type TranslationStatus =
    | "idle"
    | "unsupported"
    | "initializing"
    | "translating"
    | "success"
    | "error";

/** Ma loi de UI hien thi cau tuong ung, thay vi hien message cua browser. */
export type TranslationErrorCode =
    /** Browser khong co window.Translator. */
    | "unsupported"
    /** Cap ngon ngu khong dung duoc (availability -> "unavailable"). */
    | "language-unavailable"
    /** create() loi hoac treo qua lau. */
    | "initialization-failed"
    /** translate() loi. */
    | "translation-failed";

/** Trang thai translation ma UI can de render. */
export interface TranslationState {
    status: TranslationStatus;
    /** Ban dich, chi co khi status === "success". */
    translation: string;
    /** Ma loi, chi co khi status === "error". */
    errorCode: TranslationErrorCode | null;
    /**
     * Tien do tai model (0..1), hoac null neu API khong bao.
     *
     * Phase 2 KHONG ve progress bar tu gia tri nay — chi hien thi trang thai
     * "Preparing translator...". Giu lai de phase sau dung khi can.
     */
    downloadProgress: number | null;
}

/** Trang thai ban dau: chua chon gi. */
export const IDLE_TRANSLATION: TranslationState = {
    status: "idle",
    translation: "",
    errorCode: null,
    downloadProgress: null,
};

/** Phan shape cua Edge Translator API ma app thuc su dung. */
export interface TranslatorSession {
    translate(text: string): Promise<string>;
    destroy?: () => void;
}

/** EventTarget ma `monitor` nhan duoc, co su kien `downloadprogress`. */
export interface TranslatorMonitor extends EventTarget {}

/** Tham so cho `Translator.create()`. */
export interface TranslatorCreateOptions {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: TranslatorMonitor) => void;
}

/** Phan static cua `Translator` ma app dung. */
export interface TranslatorApi {
    availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorAvailability>;
    create(options: TranslatorCreateOptions): Promise<TranslatorSession>;
}

/** Khai bao `window.Translator` — khong co trong lib.dom.d.ts. */
declare global {
    interface Window {
        Translator?: TranslatorApi;
        /** API dich cua Chrome (khac Edge). Phase 2 khong dung, chi kiem tra de bao cao. */
        ai?: unknown;
    }
}
