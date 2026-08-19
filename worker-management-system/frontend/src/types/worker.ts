import type {
    UserRole
} from "./auth";


// =====================================================
// TRẠNG THÁI NHÂN VIÊN
// =====================================================

export type WorkerStatus =
    | "active"
    | "inactive";


// =====================================================
// HỒ SƠ NHÂN VIÊN
// =====================================================

export interface WorkerProfile {

    worker_id: number;

    user_id: number;

    worker_code: string;

    phone: string | null;

    department: string | null;

    position: string | null;

    training_percent: number;

    status: WorkerStatus;

    created_at: string;

    updated_at?: string | null;

    username: string;

    full_name: string;

    role: UserRole;

    process_ids?: string | null;

    process_codes?: string | null;

    process_names?: string | null;

    processes?: Array<{
        id: number;
        code: string;
        name: string;
    }>;

}


// =====================================================
// RESPONSE MỘT WORKER
// =====================================================

export interface WorkerProfileResponse {

    success: boolean;

    data: WorkerProfile;

    message?: string;

}


// =====================================================
// RESPONSE DANH SÁCH WORKER
// =====================================================

export interface WorkerListResponse {

    success: boolean;

    data: WorkerProfile[];

    message?: string;

}


// =====================================================
// PAYLOAD TẠO WORKER
// =====================================================

export interface CreateWorkerPayload {

    user_id: number;

    worker_code: string;

    phone?: string | null;

    department?: string | null;

    position?: string | null;

    training_percent?: number;

    status?: WorkerStatus;

}


// =====================================================
// PAYLOAD CẬP NHẬT % HỌC VIỆC
// =====================================================

export interface UpdateTrainingPercentPayload {

    training_percent: number;

}


// =====================================================
// RESPONSE CẬP NHẬT % HỌC VIỆC
// =====================================================

export interface UpdateTrainingPercentResponse {

    success: boolean;

    message: string;

    data?: {

        worker_id: number;

        training_percent: number;

    };

}