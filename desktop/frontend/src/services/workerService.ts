import api from "./api";
import { getSessionCached } from "./sessionCache";

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

            return response.data.data;
        };

        if (forceRefresh) return loader();

        return getSessionCached(
            "current-worker",
            5 * 60 * 1000,
            loader
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


        return response.data;

    };