import api from "./api";
import { getSessionCached, clearSessionCache } from "./sessionCache";
import { getStoredUser } from "../utils/authStorage";
import { isOfflineLikeError, readOfflineSnapshot, writeOfflineSnapshot } from "./offlinePersistentCache";

import type {

    WorkerListResponse,

    WorkerProfile,

    WorkerProfileResponse,

    UpdateTrainingPercentResponse

} from "../types/worker";


// =====================================================
// LẤY DANH SÁCH NHÂN VIÊN
// ADMIN / MANAGER / LEAD
// =====================================================

export const getAllWorkers =
    async (): Promise<WorkerProfile[]> => {

        const response =
            await api.get<WorkerListResponse>(
                "/workers"
            );


        return response.data.data
        ??
        [];

    };


// =====================================================
// LẤY HỒ SƠ CÔNG NHÂN ĐANG ĐĂNG NHẬP
// =====================================================

export const getCurrentWorker =
    async (forceRefresh = false): Promise<WorkerProfile> => {

        const loader = async (): Promise<WorkerProfile> => {
            const response =
                await api.get<WorkerProfileResponse>(
                    "/workers/me"
                );

            const worker = response.data.data;
            const currentUser = getStoredUser();
            if (currentUser?.role === "worker") {
                const wrongUser = Number(worker?.user_id) !== Number(currentUser.id);
                const expectedCode = String(currentUser.worker_code || "").trim();
                const actualCode = String(worker?.worker_code || "").trim();
                const wrongCode = Boolean(expectedCode && actualCode && expectedCode !== actualCode);
                if (wrongUser || wrongCode) {
                    clearSessionCache("current-worker:");
                    throw new Error("WORKER_PROFILE_IDENTITY_MISMATCH");
                }
            }
            return worker;
        };

        const currentUser = getStoredUser();
        const currentIdentity = [
            currentUser?.id ?? "anonymous",
            currentUser?.worker_id ?? 0,
            currentUser?.worker_code ?? "-"
        ].join(":");
        const snapshotName = `current-worker:${currentIdentity}`;
        const loadWithOfflineFallback = async (): Promise<WorkerProfile> => {
            try {
                const worker = await loader();
                writeOfflineSnapshot(snapshotName, worker);
                return worker;
            } catch (error) {
                if (isOfflineLikeError(error)) {
                    const cached = readOfflineSnapshot<WorkerProfile>(snapshotName);
                    if (cached) return cached;
                }
                throw error;
            }
        };

        if (forceRefresh) return loadWithOfflineFallback();


        return getSessionCached(
            `current-worker:${currentIdentity}`,
            60 * 1000,
            loadWithOfflineFallback
        );

    };


// =====================================================
// LẤY THÔNG TIN WORKER THEO WORKER ID
// =====================================================

export const getWorkerById =
    async (
        workerId: number
    ): Promise<WorkerProfile> => {

        if (
            !Number.isInteger(
                workerId
            )
            ||
            workerId <= 0
        ) {

            throw new Error(
                "ID nhân viên không hợp lệ"
            );

        }


        const response =
            await api.get<WorkerProfileResponse>(
                `/workers/${workerId}`
            );


        return response.data.data;

    };


// =====================================================
// CẬP NHẬT % HỌC VIỆC
// ADMIN / MANAGER / LEAD
//
// workerId là workers.id,
// không phải users.id.
// =====================================================

export const updateWorkerTrainingPercent =
    async (
        workerId: number,
        trainingPercent: number
    ): Promise<UpdateTrainingPercentResponse> => {

        if (
            !Number.isInteger(
                workerId
            )
            ||
            workerId <= 0
        ) {

            throw new Error(
                "ID nhân viên không hợp lệ"
            );

        }


        if (
            !Number.isFinite(
                trainingPercent
            )
            ||
            trainingPercent < 0
            ||
            trainingPercent > 100
        ) {

            throw new Error(
                "% học việc phải từ 0 đến 100"
            );

        }


        const response =
            await api.patch<UpdateTrainingPercentResponse>(

                `/workers/${workerId}/training-percent`,

                {

                    training_percent:
                        trainingPercent

                }

            );

        const currentUser = getStoredUser();
        if (Number(currentUser?.worker_id) === workerId) {
            clearSessionCache("current-worker:");
        }

        return response.data;

    };