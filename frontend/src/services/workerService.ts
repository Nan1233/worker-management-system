import api from "../api/axios";

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
// LẤY THÔNG TIN WORKER THEO USER ID
// =====================================================

export const getWorkerByUserId =
    async (
        userId: number
    ): Promise<WorkerProfile> => {

        if (
            !Number.isInteger(
                userId
            )
            ||
            userId <= 0
        ) {

            throw new Error(
                "ID người dùng không hợp lệ"
            );

        }


        const response =
            await api.get<WorkerProfileResponse>(
                `/workers/${userId}`
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