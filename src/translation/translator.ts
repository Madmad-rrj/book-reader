import { debugLog } from "../debug";
import {
    SOURCE_LANGUAGE,
    TARGET_LANGUAGE,
    type TranslationErrorCode,
    type TranslationState,
    type TranslatorAvailability,
    type TranslatorSession,
} from "./types";

export { SOURCE_LANGUAGE, TARGET_LANGUAGE };

/**
 * Thoi gian toi da cho `Translator.create()`.
 *
 * VI SAO CAN: da do duoc rang `Translator.create()` co the KHONG BAO GIO resolve
 * — no khong reject, cung khong ban ra su kien `downloadprogress` nao. Ket qua do
 * duoc tren Chromium headless: create() treo qua 20 giay voi progressCount = 0,
 * trong khi cung trang do `availability()` van tra loi "downloadable" binh thuong.
 *
 * Neu khong co tran nay, UI se ket o "Preparing translator..." vinh vien va
 * nguoi dung khong biet chuyen gi dang xay ra.
 *
 * 60 giay la muc chiu duoc cho lan tai model dau tien: du rong rai cho mang cham,
 * nhung van bao duoc cho nguoi dung rang da that bai thay vi treo vo han.
 */
const CREATE_TIMEOUT_MS = 60_000;

/** Loi co ma, de UI hien thi cau tuong ung thay vi message tho cua browser. */
export class TranslationError extends Error {
    constructor(
        readonly code: TranslationErrorCode,
        message: string
    ) {
        super(message);
        this.name = "TranslationError";
    }
}

/**
 * Session duoc cache lai.
 *
 * `undefined` = chua thu tao bao gio.
 * `null`      = da thu va that bai; khong thu lai de tranh lap vo han khi
 *               selection thay doi lien tuc (yeu cau Phase 2 §14).
 */
let sessionCache: TranslatorSession | null | undefined;

/** Promise cua lan tao session dang chay, de nhieu caller dung chung mot lan tao. */
let pendingCreate: Promise<TranslatorSession> | null = null;

/** Lay `window.Translator` neu browser co ho tro. */
export function getTranslatorApi() {
    if (typeof window === "undefined") {
        return undefined;
    }

    return window.Translator;
}

/** Browser co ho tro Edge Translator API khong (khong goi mang). */
export function isTranslatorSupported(): boolean {
    return typeof getTranslatorApi()?.create === "function";
}

/**
 * Hoi Edge xem cap ngon ngu en->vi co dung duoc khong.
 *
 * LUU Y: ham nay KHONG bao gio nem loi. Moi truong hop bat thuong (khong ho tro,
 * goi loi, treo qua lau) deu duoc quy ve "unavailable" de UI khong bi crash.
 */
export async function checkAvailability(
    sourceLanguage: string = SOURCE_LANGUAGE,
    targetLanguage: string = TARGET_LANGUAGE
): Promise<TranslatorAvailability> {
    const api = getTranslatorApi();

    if (typeof api?.availability !== "function") {
        return "unavailable";
    }

    // Luu y: KHONG goi thang `api.availability(...)` lam doi so cho `withTimeout`.
    //
    // Neu `availability` nem loi dong bo (hoac cham hon han), cuoc goi ham se chay
    // TRUOC khi `withTimeout` kip duoc goi — loi thoat ra ngoai `try` cua no va bay
    // thang len tren. Da gap dung loi nay: `availability` nem loi dong bo khien
    // `runTranslation` nem ngay, UI ket vinh vien o "Translating..." ma khong bao
    // gio goi `create()`.
    //
    // Cach viet an toan: boc trong ham async, de moi loi — ke ca loi dong bo —
    // deu thanh rejection cua promise.
    const availabilityCall = async () => api.availability({ sourceLanguage, targetLanguage });

    try {
        return await withTimeout(availabilityCall(), CREATE_TIMEOUT_MS, "Kiểm tra ngôn ngữ");
    } catch (error) {
        debugLog("Translator", "availability failed", describeError(error));
        return "unavailable";
    }
}

/**
 * Lay Translator session, tao mot lan duy nhat roi dung lai mai.
 *
 * Day la diem quan trong cua Phase 2: KHONG tao session moi cho moi selection.
 * Model cua Edge chi duoc tai mot lan; sau do moi lan dich chi la goi `translate()`.
 */
export async function getTranslatorSession(): Promise<TranslatorSession> {
    // Da co session dung lai duoc.
    if (sessionCache) {
        return sessionCache;
    }

    // Da thu va that bai truoc do — khong thu lai (tranh lap vo han).
    if (sessionCache === null) {
        throw new TranslationError("initialization-failed", "Translator đã khởi tạo thất bại trước đó.");
    }

    // Dang tao — dung chung promise, khong tao them session thu hai.
    if (pendingCreate) {
        return pendingCreate;
    }

    const api = getTranslatorApi();

    if (typeof api?.create !== "function") {
        throw new TranslationError("unsupported", "Translator API không khả dụng.");
    }

    debugLog("Translator", "initializing");

    pendingCreate = createSession(api)
        .then((session) => {
            sessionCache = session;
            debugLog("Translator", "ready");
            return session;
        })
        .catch((error: unknown) => {
            // Danh dau that bai de khong thu lai moi lan selection doi.
            sessionCache = null;
            debugLog("Translator", "error", describeError(error));
            throw error;
        })
        .finally(() => {
            pendingCreate = null;
        });

    return pendingCreate;
}

/** Tao session that su, co tran thoi gian va bao progress qua callback. */
async function createSession(
    api: NonNullable<ReturnType<typeof getTranslatorApi>>
): Promise<TranslatorSession> {
    // Cung ly do nhu `checkAvailability`: boc trong ham async de loi dong bo cua
    // `create()` cung tro thanh rejection, khong thoat ra ngoai `withTimeout`.
    const createCall = async () =>
        api.create({
            sourceLanguage: SOURCE_LANGUAGE,
            targetLanguage: TARGET_LANGUAGE,
            monitor(monitor) {
                // Edge co the ban su kien tai model. Ta chi log lai de biet no co
                // hoat dong khong; UI khong ve progress bar tu day (Phase 2 §10).
                monitor?.addEventListener?.("downloadprogress", (event) => {
                    const detail = event as ProgressEvent;
                    debugLog("Translator", "downloadprogress", detail.loaded, "/", detail.total);
                });
            },
        });

    return withTimeout(createCall(), CREATE_TIMEOUT_MS, "Khởi tạo translator");
}

/**
 * Dich text en -> vi.
 *
 * Nem `TranslationError` voi ma loi ro rang de UI hien thi dung thong bao.
 */
export async function translate(text: string): Promise<string> {
    const trimmed = text.trim();

    // Khong bao gio goi translator voi chuoi rong (Phase 2 §6).
    if (trimmed.length === 0) {
        throw new TranslationError("translation-failed", "Không có text để dịch.");
    }

    let session: TranslatorSession;

    try {
        session = await getTranslatorSession();
    } catch (error) {
        if (error instanceof TranslationError) {
            throw error;
        }

        throw new TranslationError("initialization-failed", "Không khởi tạo được translator.");
    }

    try {
        return await session.translate(trimmed);
    } catch (error) {
        debugLog("Translator", "translate failed", describeError(error));
        throw new TranslationError("translation-failed", "Dịch thất bại.");
    }
}

/** Cau thong bao cho nguoi dung theo ma loi. */
export function describeTranslationError(code: TranslationErrorCode): string {
    switch (code) {
        case "unsupported":
            return "Translation is not supported in this browser.";
        case "language-unavailable":
            return "English → Vietnamese is not available in this browser.";
        case "initialization-failed":
            return "Unable to initialize translator.";
        case "translation-failed":
            return "Translation failed.";
    }
}

/**
 * Chuyen trang thai translation thanh state cua UI.
 *
 * Translation service khong tu quan ly state React — no chi tra ve du lieu.
 */
export function toErrorState(code: TranslationErrorCode): TranslationState {
    return {
        status: "error",
        translation: "",
        errorCode: code,
        downloadProgress: null,
    };
}

/**
 * Giai phong session (chi dung khi unmount toan bo app hoac doi ngon ngu).
 *
 * Luu y: KHONG goi ham nay khi selection thay doi hay khi component unmount —
 * session phai song doc lap voi vong doi cua PDF (Phase 2 §11).
 */
export function disposeTranslatorSession(): void {
    sessionCache?.destroy?.();
    sessionCache = undefined;
    pendingCreate = null;
}

/**
 * Mo ta mot gia tri bat ky da bi nem ra.
 *
 * `String(error)` tra ve "undefined" khi gia tri bi nem khong phai Error
 * (vi du `throw undefined`, hoac mot DOMException la la). Dung `JSON.stringify`
 * va doc `name`/`message` de khong bao gio mat thong tin chan doan.
 */
export function describeError(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }

    if (typeof error === "object" && error !== null) {
        const record = error as Record<string, unknown>;
        const name = typeof record.name === "string" ? record.name : "object";
        const message = typeof record.message === "string" ? record.message : JSON.stringify(record);
        return `${name}: ${message}`;
    }

    return `${typeof error}: ${String(error)}`;
}

/** Chan tren cho mot promise, nem loi co ma ro rang khi qua han. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;

    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new TranslationError("initialization-failed", `${label}: quá thời gian chờ (${ms}ms).`)),
            ms
        );
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
