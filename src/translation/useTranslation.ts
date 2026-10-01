import { useEffect, useRef, useState } from "react";
import {
    checkAvailability,
    describeTranslationError,
    isTranslatorSupported,
    translate,
    TranslationError,
} from "./translator";
import { IDLE_TRANSLATION, type TranslationErrorCode, type TranslationState } from "./types";
import { debugLog } from "../debug";

/**
 * Thoi gian cho selection on dinh truoc khi dich.
 *
 * Chon 2000ms theo yeu cau Phase 2. Trong luc nguoi dung dang keo chuot, selection
 * doi lien tuc (T -> Th -> The -> ...) va moi lan doi deu phat sinh selectionchange;
 * cho 2 giay on dinh nghia la chi dich MOT lan sau khi nguoi dung da thao tay.
 */
export const TRANSLATION_DEBOUNCE_MS = 2000;

/** Trang thai translation cho mot doan text da chon. */
export interface UseTranslationResult extends TranslationState {
    /** Cau loi da dich sang thong bao hien thi, hoac null. */
    errorMessage: string | null;
}

/**
 * Dich text en -> vi khi text on dinh.
 *
 * Hai co che quan trong:
 *
 * 1. DEBOUNCE: moi khi `text` doi, hen gio lai. Neu `text` doi tiep truoc khi het
 *    gio, huy hen cu. Nho vay keo chuot khong ban ra hang loat request.
 *
 * 2. RACE CONDITION: moi lan dich mang mot so thu tu (`requestIdRef`). Ket qua chi
 *    duoc chap nhan neu so thu tu cua no van la moi nhat. Neu nguoi dung doi
 *    selection trong luc dang dich, ket qua cu ve sau se bi bo qua — khong ghi de
 *    ket qua moi.
 */
export function useTranslation(text: string): UseTranslationResult {
    const [state, setState] = useState<TranslationState>(IDLE_TRANSLATION);

    /** So thu tu cua lan dich moi nhat — dung de loai ket qua cu. */
    const requestIdRef = useRef(0);

    /** Ket qua cua lan kiem tra availability, chi chay mot lan cho ca app. */
    const availabilityRef = useRef<"unknown" | "ok" | "unsupported">("unknown");

    const trimmedText = text.trim();

    useEffect(() => {
        // Selection rong: khong goi translator, tra ve trang thai nghi (Phase 2 §6).
        if (trimmedText.length === 0) {
            requestIdRef.current += 1;
            setState(IDLE_TRANSLATION);
            return;
        }

        // Browser khong co Translator API: bao ro rang, khong fallback sang API khac.
        if (!isTranslatorSupported()) {
            requestIdRef.current += 1;
            setState({
                status: "unsupported",
                translation: "",
                errorCode: null,
                downloadProgress: null,
            });
            return;
        }

        // Danh dau request moi nhat. Moi ket qua den sau thoi diem nay nhung mang
        // so thu tu khac se bi bo qua.
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;

        const isLatest = () => requestIdRef.current === requestId;

        // Trong thoi gian cho debounce, UI hien "Preparing translator..." de nguoi
        // dung biet app da nhan selection. Selected text van duoc hien o panel
        // rieng nen khong bi nhap nhay.
        setState({
            status: "initializing",
            translation: "",
            errorCode: null,
            downloadProgress: null,
        });

        const timer = setTimeout(() => {
            void runTranslation(trimmedText, isLatest, availabilityRef, setState);
        }, TRANSLATION_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [trimmedText]);

    return {
        ...state,
        errorMessage: state.errorCode ? describeTranslationError(state.errorCode) : null,
    };
}

/**
 * Chay translation cho mot doan text.
 *
 * Tach ra ngoai effect cho de doc. Nhan `isLatest` de tu kiem tra xem ket qua cua
 * minh con moi nhat hay khong truoc khi ghi vao state.
 */
async function runTranslation(
    text: string,
    isLatest: () => boolean,
    availabilityRef: { current: "unknown" | "ok" | "unsupported" },
    setState: (state: TranslationState) => void
): Promise<void> {
    try {
        // Kiem tra cap ngon ngu mot lan cho ca app (ket qua duoc cache).
        if (availabilityRef.current === "unknown") {
            const availability = await checkAvailability();

            if (!isLatest()) {
                return;
            }

            if (availability === "unavailable") {
                availabilityRef.current = "unsupported";
                setState(errorState("language-unavailable"));
                return;
            }

            availabilityRef.current = "ok";
        }

        if (!isLatest()) {
            return;
        }

        setState({
            status: "translating",
            translation: "",
            errorCode: null,
            downloadProgress: null,
        });

        debugLog("Translator", "translating");
        const result = await translate(text);

        // Day la chang chan race condition: ket qua cu KHONG duoc ghi de ket qua moi.
        if (!isLatest()) {
            debugLog("Translator", "ket qua cu bi bo qua");
            return;
        }

        debugLog("Translator", "completed");
        setState({
            status: "success",
            translation: result,
            errorCode: null,
            downloadProgress: null,
        });
    } catch (error) {
        if (!isLatest()) {
            return;
        }

        debugLog("Translator", "error", String(error));

        const code = error instanceof TranslationError ? error.code : "translation-failed";
        setState(errorState(code));
    }
}

function errorState(code: TranslationErrorCode): TranslationState {
    return {
        status: "error",
        translation: "",
        errorCode: code,
        downloadProgress: null,
    };
}
