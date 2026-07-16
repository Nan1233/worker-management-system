import api from "../api/axios";

import type {
    WorkerProfile,
    WorkerProfileResponse
} from "../types/worker";


// =====================================================
// LẤY THÔNG TIN WORKER THEO USER ID
// =====================================================

export const getWorkerByUserId = async (
    userId: number
): Promise<WorkerProfile> => {

    if (
        !Number.isInteger(userId) ||
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