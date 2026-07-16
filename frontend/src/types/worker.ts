import type {
    UserRole
} from "./auth";


// =====================================================
// TRẠNG THÁI NHÂN VIÊN
//
// active   = đang làm việc
// inactive = đã nghỉ hoặc ngừng hoạt động
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

    /*
        % học việc hiện tại.

        Mặc định 100.
        Chỉ admin, manager, lead được chỉnh sửa.
    */

    training_percent: number;

    status: WorkerStatus;

    created_at: string;

    updated_at?: string;

    username: string;

    full_name: string;

    role: UserRole;

}


// =====================================================
// RESPONSE API LẤY HỒ SƠ NHÂN VIÊN
// =====================================================

export interface WorkerProfileResponse {

    success: boolean;

    data: WorkerProfile;

    message?: string;

}


// =====================================================
// DỮ LIỆU TẠO NHÂN VIÊN
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
// DỮ LIỆU CẬP NHẬT NHÂN VIÊN
// =====================================================

export interface UpdateWorkerPayload {

    phone?: string | null;

    department?: string | null;

    position?: string | null;

    training_percent?: number;

    status?: WorkerStatus;

}


// =====================================================
// RESPONSE DANH SÁCH NHÂN VIÊN
// =====================================================

export interface WorkerListResponse {

    success: boolean;

    data: WorkerProfile[];

    message?: string;

}